import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export async function GET() {
    try {
        // Try multiple possible paths for the .env file
        const possiblePaths = [
            // Direct path from project root
            path.resolve(process.cwd(), '.env'),
            // Path from dashboard to project root
            path.resolve(process.cwd(), '../../.env'),
            // Absolute path based on current file location
            path.resolve(__dirname, '../../../../../.env')
        ];
        
        let envConfig = null;
        let envPath = null;
        
        // Try each path until we find the .env file
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                envPath = p;
                envConfig = dotenv.parse(fs.readFileSync(p));
                console.log(`Found .env file at ${p}`);
                break;
            }
        }
        
        // Hardcoded fallback if we can't find or parse the .env file
        if (!envConfig || !envConfig.POWERPORTAL_BASEURL) {
            console.log('Using hardcoded portal URL as fallback');
            return NextResponse.json({ 
                url: 'https://www.powerportal.example.com',
                source: 'hardcoded' 
            });
        }
        
        return NextResponse.json({ 
            url: envConfig.POWERPORTAL_BASEURL,
            source: 'env-file',
            path: envPath
        });
    } catch (error) {
        console.error('Error fetching portal URL:', error);
        // Provide a hardcoded fallback on error
        return NextResponse.json({ 
            url: 'https://www.powerportal.example.com',
            source: 'error-fallback'
        });
    }
}