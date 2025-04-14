import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

// Define types for our log data
interface RequestLog {
  timestamp: string;
  request: {
    method: string;
    path: string;
  };
  response: {
    statusCode: number;
  };
}

interface SummaryData {
  totalRequests: number;
  // Use more specific types for index signature to avoid 'any'
  [key: string]: number | string | boolean | object;
}

interface LogData {
  error?: string;
  summary?: SummaryData;
  requests?: RequestLog[];
  logs?: RequestLog[];
}

// Read data from the api-logs.json file created by the proxy server
const getLogsData = () => {
  try {
    // In the new directory structure, logs are stored in a common "logs" directory
    // Try different relative paths to handle both standalone and combined modes
    let filePath = path.join(process.cwd(), "..", "logs", "api-logs.json");
    
    // If file doesn't exist at the first path, try another path for dashboard standalone mode
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), "..", "..", "logs", "api-logs.json");
    }
    
    // Fallback to current directory in case running in a different setup
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), "logs", "api-logs.json");
    }
    
    if (!fs.existsSync(filePath)) {
      console.error("Log file not found at paths:", filePath);
      return { error: "Log file not found", logs: [], summary: { totalRequests: 0 } };
    }
    
    const fileContent = fs.readFileSync(filePath, "utf8");
    return JSON.parse(fileContent) as LogData;
  } catch (error) {
    console.error("Error reading logs:", error);
    return { error: "Failed to read logs", logs: [], summary: { totalRequests: 0 } } as LogData;
  }
};

// API endpoint to get statistics
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "summary";
  
  // In the combined server mode, we can directly proxy to the main API endpoints
  // instead of reading from file when available
  if (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.COMBINED_SERVER_MODE === "true") {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    
    try {
      let apiUrl = "";
      
      switch (type) {
        case "summary":
          apiUrl = `${baseUrl}/api/stats`;
          break;
        case "recent":
          const limit = searchParams.get("limit") || "10";
          apiUrl = `${baseUrl}/api/logs/recent?limit=${limit}`;
          break;
        case "search":
          const method = searchParams.get("method");
          const path = searchParams.get("path");
          const status = searchParams.get("status");
          const from = searchParams.get("from");
          const to = searchParams.get("to");
          
          apiUrl = `${baseUrl}/api/logs?`;
          if (method) apiUrl += `&method=${method}`;
          if (path) apiUrl += `&path=${path}`;
          if (status) apiUrl += `&status=${status}`;
          if (from) apiUrl += `&from=${from}`;
          if (to) apiUrl += `&to=${to}`;
          break;
      }
      
      // In combined server mode, we can just call the API directly without external fetch
      // If we're in the same process, just return the file data
      if (!apiUrl || process.env.COMBINED_SERVER_MODE === "true") {
        // Fall back to file-based data
        const data = getLogsData();
        return handleFileBasedData(type, searchParams, data);
      }
      
      // For standalone mode with an API base URL, make external requests
      const response = await fetch(apiUrl);
      const data = await response.json();
      return NextResponse.json(data);
    } catch (error) {
      console.error("Error fetching from API:", error);
      // Fall back to file-based approach on error
      const data = getLogsData();
      return handleFileBasedData(type, searchParams, data);
    }
  }
  
  // Default case: use file-based approach
  const data = getLogsData();
  return handleFileBasedData(type, searchParams, data);
}

// Helper function to handle file-based data
function handleFileBasedData(type: string, searchParams: URLSearchParams, data: LogData) {
  switch (type) {
    case "summary":
      return NextResponse.json(data.summary || {});
    
    case "recent":
      const limit = parseInt(searchParams.get("limit") || "10");
      const recentLogs = data.requests?.slice(-limit) || [];
      return NextResponse.json(recentLogs);
    
    case "search":
      const method = searchParams.get("method");
      const path = searchParams.get("path");
      const status = searchParams.get("status");
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      
      let filteredLogs = [...(data.requests || [])];
      
      // Apply filters
      if (method) {
        filteredLogs = filteredLogs.filter(log => log.request.method === method);
      }
      
      if (path) {
        filteredLogs = filteredLogs.filter(log => log.request.path.includes(path));
      }
      
      if (status) {
        filteredLogs = filteredLogs.filter(log => String(log.response.statusCode) === status);
      }
      
      if (from) {
        const fromDate = new Date(from);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= fromDate);
      }
      
      if (to) {
        const toDate = new Date(to);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= toDate);
      }
      
      return NextResponse.json(filteredLogs);
      
    default:
      return NextResponse.json({ error: "Invalid type parameter" });
  }
}