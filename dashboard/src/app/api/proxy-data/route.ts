import { NextResponse } from "next/server";

// Define types for our log data
interface LogEntry {
  id: string;
  timestamp: string;
  request: {
    method: string;
    path: string;
    url: string;
    headers: Record<string, string>;
    body: any;
    query: Record<string, string>;
  };
  response: {
    statusCode: number;
    statusMessage: string;
    contentType: string;
    headers: Record<string, string>;
    body: any;
    duration: number;
  };
  duration: number;
  success: boolean;
}

type RawLogData = {
  id?: number;
  timestamp?: string;
  formatted_timestamp?: string;
  method?: string;
  url?: string;
  path?: string;
  request_headers?: string;
  request_body?: string;
  query_params?: string;
  status_code?: number;
  status_message?: string;
  content_type?: string;
  response_headers?: string;
  response_body?: string;
  duration?: number;
};

// Safe JSON parsing functions
function safeParseJSON(str: string | null | undefined, defaultValue: any = null): any {
  if (!str) return defaultValue;
  try {
    return JSON.parse(str);
  } catch {
    console.warn('Failed to parse JSON:', str);
    return defaultValue;
  }
}

// Handle potential string that might be JSON or plain text
function parseBody(body: string | null | undefined): any {
  if (!body) return null;
  try {
    // First try to parse as JSON
    return JSON.parse(body);
  } catch {
    // If it's not JSON, return as plain text
    return body;
  }
}

// Get data from the proxy server
const getLogsData = async (): Promise<LogEntry[]> => {
  try {
    const proxyUrl = process.env.PROXY_URL || 'http://localhost:5000';
    console.log('Fetching logs from:', `${proxyUrl}/power-portal-proxy/logs/recent?limit=1000`);

    const response = await fetch(`${proxyUrl}/power-portal-proxy/logs/recent?limit=1000`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch logs: ${response.statusText}`);
    }

    const rawData = await response.json() as RawLogData[];

    // Transform the data to match the expected format
    const transformedData: LogEntry[] = rawData.map((log) => ({
      id: log.id?.toString() || Math.random().toString(36).substr(2, 9),
      timestamp: log.timestamp || log.formatted_timestamp || new Date().toISOString(),
      request: {
        method: log.method || 'UNKNOWN',
        url: log.url || '',
        path: log.path || '',
        headers: safeParseJSON(log.request_headers, {}),
        body: parseBody(log.request_body),
        query: safeParseJSON(log.query_params, {})
      },
      response: {
        statusCode: log.status_code || 500,
        statusMessage: log.status_message || 'Unknown',
        contentType: log.content_type || 'unknown',
        headers: safeParseJSON(log.response_headers, {}),
        body: parseBody(log.response_body),
        duration: log.duration || 0
      },
      duration: log.duration || 0,
      success: (log.status_code || 500) < 400
    }));

    return transformedData;
  } catch (error) {
    console.error("Error fetching logs from proxy:", error);
    return [];
  }
};

// API endpoint to get statistics
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "summary";

    // Get data from proxy
    const data = await getLogsData();
    console.log('Processing data for type:', type);

    switch (type) {
      case "summary": {
        const summary = {
          totalRequests: data.length,
          statusCodes: data.reduce((acc: Record<string, number>, log: LogEntry) => {
            const status = log.response.statusCode;
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {}),
          lastRequest: data.length > 0 ? data[0].timestamp : null
        };
        return NextResponse.json(summary);
      }

      case "recent": {
        const limit = parseInt(searchParams.get("limit") || "10");
        return NextResponse.json(data.slice(0, limit));
      }

      case "search": {
        const method = searchParams.get("method");
        const path = searchParams.get("path");
        const status = searchParams.get("status");
        const from = searchParams.get("from");
        const to = searchParams.get("to");

        let filteredLogs = [...data];

        if (method && method !== 'all') {
          filteredLogs = filteredLogs.filter(log => log.request.method === method);
        }

        if (path) {
          filteredLogs = filteredLogs.filter(log => log.request.path.includes(path));
        }

        if (status && status !== 'all') {
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
      }

      default:
        return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing proxy data request:', error);
    return NextResponse.json(
      { error: "Failed to process proxy data request" },
      { status: 500 }
    );
  }
}