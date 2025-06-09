import { NextResponse } from 'next/server';
import path from 'path';
import sqlite3 from 'sqlite3';

export async function POST() {
    try {
        // Path to the logs directory
        const logsDir = path.join(process.cwd(), '..', 'logs');
        const dbPath = path.join(logsDir, 'api-logs.db');

        // Open the database
        const db = new sqlite3.Database(dbPath);        // Clear the logs table
        await new Promise<void>((resolve, reject) => {
            db.run('DELETE FROM api_logs', (err: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Close the database
        await new Promise<void>((resolve) => db.close(() => resolve()));

        return NextResponse.json({ success: true, message: 'Logs purged successfully' });
    } catch (error) {
        console.error('Error purging logs:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to purge logs' },
            { status: 500 }
        );
    }
}
