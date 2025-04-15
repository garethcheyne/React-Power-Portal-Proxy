import { NextResponse } from "next/server";

export async function POST() {
  try {
    // Get the proxy server URL from environment or use default
    const proxyUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
    
    // Send shutdown request to proxy server
    const response = await fetch(`${proxyUrl}/api/shutdown`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });
    
    if (!response.ok) {
      throw new Error("Failed to shut down the application");
    }
    
    // Return success
    return NextResponse.json({ success: true, message: "Shutdown signal sent" });
  } catch (error) {
    console.error("Error shutting down application:", error);
    return NextResponse.json(
      { success: false, message: "Failed to shut down the application" },
      { status: 500 }
    );
  }
}