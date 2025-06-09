import { NextResponse } from "next/server";

export async function GET() {
    try {
        const proxyUrl = process.env.PROXY_URL || 'http://localhost:5000';
        const response = await fetch(`${proxyUrl}/power-portal-proxy/auth-token`);

        if (!response.ok) {
            throw new Error(`Failed to fetch auth token: ${response.statusText}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching auth token:', error);
        return NextResponse.json(
            { error: 'Failed to fetch auth token' },
            { status: 500 }
        );
    }
}
