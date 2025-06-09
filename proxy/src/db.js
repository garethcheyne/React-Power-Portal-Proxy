const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

// Custom logging
const log = {
    info: (message) => console.log(`ℹ️  [DB] ${chalk.blue(message)}`),
    success: (message) => console.log(`✅ [DB] ${chalk.green(message)}`),
    error: (message) => console.log(`❌ [DB] ${chalk.red(message)}`),
    debug: (message) => process.env.DEBUG && console.log(`🔍 [DB] ${chalk.gray(message)}`),
    warn: (message) => console.log(`⚠️  [DB] ${chalk.yellow(message)}`)
};

/**
 * Sanitize headers to remove sensitive information
 * @param {Object} headers - Headers object
 * @returns {Object} Sanitized headers
 */
function sanitizeHeaders(headers = {}) {
    if (!headers || typeof headers !== 'object') {
        return {};
    }

    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-auth-token'];

    sensitiveHeaders.forEach(header => {
        if (sanitized[header]) {
            sanitized[header] = '[REDACTED]';
        }
    });

    return sanitized;
}

/**
 * Format an object for pretty-printing in logs
 * @param {Object|string} data - The data to format
 * @returns {string} Formatted string
 */
function formatForLogs(data) {
    if (data === null || data === undefined) return '';
    if (typeof data === 'string') return data.substring(0, 2000);

    try {
        return JSON.stringify(data, null, 2).substring(0, 2000);
    } catch (error) {
        return String(data).substring(0, 2000);
    }
}

/**
 * Truncate request/response bodies to avoid huge log entries
 * @param {*} body - Request or response body
 * @returns {*} Truncated body
 */
function truncateBody(body) {
    if (body === null || body === undefined) return null;

    try {
        if (typeof body === 'string') {
            return body.length > 2000 ? body.substring(0, 2000) + '...' : body;
        }

        const jsonStr = JSON.stringify(body);
        return jsonStr.length > 2000 ? jsonStr.substring(0, 2000) + '...' : jsonStr;
    } catch (error) {
        return '[Unserializable data]';
    }
}

class Database {
    constructor() {
        // Color functions for logging
        this.colors = {
            status: (code) => {
                if (code < 300) return chalk.green;
                if (code < 400) return chalk.blue;
                if (code < 500) return chalk.yellow;
                return chalk.red;
            },
            duration: (ms) => {
                if (ms < 100) return chalk.green;
                if (ms < 500) return chalk.blue;
                if (ms < 1000) return chalk.yellow;
                return chalk.red;
            }
        };

        // Ensure logs directory exists
        const logsDir = path.join(process.cwd(), '..', 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
            log.info(`Created logs directory at ${logsDir}`);
        }

        const dbPath = path.join(logsDir, 'api-logs.db');
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                log.error(`Error opening database: ${err.message}`);
                return;
            }
            log.success(`Connected to database at ${dbPath}`);
        });

        // Initialize database schema
        this.initializeSchema();

        // Setup cleanup on exit
        process.on('exit', () => {
            if (this.autoPurgeInterval) {
                this.stopAutoPurge();
            }
            this.close().catch(err => log.error(`Error closing database: ${err.message}`));
        });
    }

    sanitizeHeaders(headers = {}) {
        if (!headers || typeof headers !== 'object') {
            return {};
        }

        const sanitized = { ...headers };
        const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-auth-token'];

        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    formatForLogs(data) {
        if (data === null || data === undefined) return '';
        if (typeof data === 'string') return data.substring(0, 2000);

        try {
            return JSON.stringify(data, null, 2).substring(0, 2000);
        } catch (error) {
            return String(data).substring(0, 2000);
        }
    } truncateBody(body) {
        if (body === null || body === undefined) return null;

        try {
            if (typeof body === 'string') {
                return body;
            }

            return JSON.stringify(body);
        } catch (error) {
            return '[Unserializable data]';
        }
    }

    initializeSchema() {
        this.db.serialize(() => {
            // Create api_logs table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS api_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    method TEXT,
                    url TEXT,
                    path TEXT,
                    request_headers TEXT,
                    request_body TEXT,
                    query_params TEXT,
                    status_code INTEGER,
                    status_message TEXT,
                    response_headers TEXT,
                    response_body TEXT,
                    content_type TEXT,
                    duration INTEGER
                )
            `, (err) => {
                if (err) {
                    log.error(`Error creating api_logs table: ${err.message}`);
                } else {
                    log.success('api_logs table initialized');
                }
            });

            // Create api_stats table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS api_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    total_requests INTEGER DEFAULT 0,
                    success_requests INTEGER DEFAULT 0,
                    error_requests INTEGER DEFAULT 0,
                    avg_response_time REAL DEFAULT 0
                )
            `, (err) => {
                if (err) {
                    log.error(`Error creating api_stats table: ${err.message}`);
                } else {
                    log.success('api_stats table initialized');
                }
            });

            // Create indices for better query performance
            this.db.run('CREATE INDEX IF NOT EXISTS idx_timestamp ON api_logs(timestamp)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_method ON api_logs(method)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_status_code ON api_logs(status_code)');
        });
    }

    logApiRequest(requestData, responseData) {
        if (!requestData || !responseData) {
            log.error('Invalid request or response data provided to logApiRequest');
            return;
        }

        // Skip logging for dashboard and internal API requests
        if (requestData.path?.startsWith('/dashboard') ||
            (requestData.path?.startsWith('/power-portal-proxy/') && !requestData.path?.startsWith('/api/v1/'))) {
            return;
        }

        try {
            const stmt = this.db.prepare(`
                INSERT INTO api_logs (
                    method, url, path, request_headers, request_body, query_params,
                    status_code, status_message, response_headers, response_body,
                    content_type, duration
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                requestData.method || 'UNKNOWN',
                requestData.url || '',
                requestData.path || '',
                JSON.stringify(this.sanitizeHeaders(requestData.headers)),
                typeof requestData.body === 'string' ?
                    this.truncateBody(requestData.body) :
                    JSON.stringify(this.truncateBody(requestData.body)),
                JSON.stringify(requestData.query || {}),
                responseData.statusCode || 500,
                responseData.statusMessage || 'Unknown Status',
                JSON.stringify(this.sanitizeHeaders(responseData.headers || {})),
                typeof responseData.body === 'string' ?
                    this.truncateBody(responseData.body) :
                    JSON.stringify(this.truncateBody(responseData.body)),
                responseData.contentType || 'unknown',
                responseData.duration || 0,
                (err) => {
                    if (err) {
                        log.error(`Error logging to database: ${err.message}`);
                    } else {
                        this.updateStats(responseData.statusCode || 500, responseData.duration || 0);
                    }
                }
            );

            stmt.finalize();

            // Enhanced logging with colors based on status and duration
            try {
                const pathParts = requestData.path?.split('?') || [''];
                const basePath = pathParts[0];
                const queryString = pathParts[1] ? chalk.gray(`?${pathParts[1]}`) : '';

                const statusColor = (this.colors?.status?.(responseData?.statusCode) || chalk.white);
                const durationColor = (this.colors?.duration?.(responseData?.duration) || chalk.white);

                log.debug(
                    `${chalk.bold(requestData?.method || 'UNKNOWN')} ${chalk.blue(basePath)}${queryString} ` +
                    `${statusColor(`[${responseData?.statusCode || '???'}]`)} ` +
                    `${durationColor(`${responseData?.duration || '?'}ms`)} ` +
                    `${chalk.gray(responseData?.contentType || 'no-content-type')}`
                );
            } catch (error) {
                log.error(`Error in colored logging: ${error.message}`);
            }
        } catch (error) {
            log.error(`Failed to log request: ${error.message}`);
            log.debug(`Request data: ${JSON.stringify(requestData)}`);
            log.debug(`Response data: ${JSON.stringify(responseData)}`);
        }
    }

    updateStats(statusCode, duration) {
        this.db.run(`
            INSERT INTO api_stats (
                total_requests,
                success_requests,
                error_requests,
                avg_response_time
            )
            SELECT 
                COALESCE((SELECT total_requests FROM api_stats ORDER BY id DESC LIMIT 1), 0) + 1,
                COALESCE((SELECT success_requests FROM api_stats ORDER BY id DESC LIMIT 1), 0) + CASE WHEN ? < 400 THEN 1 ELSE 0 END,
                COALESCE((SELECT error_requests FROM api_stats ORDER BY id DESC LIMIT 1), 0) + CASE WHEN ? >= 400 THEN 1 ELSE 0 END,
                (
                    COALESCE((SELECT avg_response_time FROM api_stats ORDER BY id DESC LIMIT 1), 0) * 
                    COALESCE((SELECT total_requests FROM api_stats ORDER BY id DESC LIMIT 1), 0) + ?
                ) / (COALESCE((SELECT total_requests FROM api_stats ORDER BY id DESC LIMIT 1), 0) + 1)
        `, [statusCode, statusCode, duration]);
    }

    getStats() {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT 
                    total_requests,
                    success_requests,
                    error_requests,
                    avg_response_time,
                    datetime(timestamp, 'localtime') as timestamp
                FROM api_stats 
                ORDER BY id DESC LIMIT 1
            `, (err, row) => {
                if (err) {
                    log.error(`Error getting stats: ${err.message}`);
                    reject(err);
                } else {
                    resolve(row || {
                        total_requests: 0,
                        success_requests: 0,
                        error_requests: 0,
                        avg_response_time: 0,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });
    }

    searchLogs(filters = {}, limit = 100) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT *, datetime(timestamp, \'localtime\') as formatted_timestamp FROM api_logs WHERE 1=1';
            const params = [];

            try {
                if (filters.method) {
                    query += ' AND method = ?';
                    params.push(filters.method);
                }
                if (filters.path) {
                    query += ' AND path LIKE ?';
                    params.push(`%${filters.path}%`);
                }
                if (filters.status) {
                    query += ' AND status_code = ?';
                    params.push(parseInt(filters.status));
                }
                if (filters.from) {
                    query += ' AND timestamp >= datetime(?)';
                    params.push(filters.from);
                }
                if (filters.to) {
                    query += ' AND timestamp <= datetime(?)';
                    params.push(filters.to);
                }

                query += ' ORDER BY timestamp DESC LIMIT ?';
                params.push(limit);

                this.db.all(query, params, (err, rows) => {
                    if (err) {
                        log.error(`Error searching logs: ${err.message}`);
                        reject(err);
                    } else {
                        log.debug(`Found ${rows?.length || 0} logs matching filters`);
                        resolve(rows || []);
                    }
                });
            } catch (error) {
                log.error(`Error in searchLogs: ${error.message}`);
                reject(error);
            }
        });
    }

    getRecentLogs(limit = 100) {
        return new Promise((resolve, reject) => {
            try {
                this.db.all(
                    'SELECT *, datetime(timestamp, \'localtime\') as formatted_timestamp FROM api_logs ORDER BY timestamp DESC LIMIT ?',
                    [limit],
                    (err, rows) => {
                        if (err) {
                            log.error(`Error getting recent logs: ${err.message}`);
                            reject(err);
                        } else {
                            resolve(rows || []);
                        }
                    }
                );
            } catch (error) {
                log.error(`Error in getRecentLogs: ${error.message}`);
                reject(error);
            }
        });
    }

    clearLogs() {
        return new Promise((resolve, reject) => {
            try {
                this.db.run('DELETE FROM api_logs', (err) => {
                    if (err) {
                        log.error(`Error clearing logs: ${err.message}`);
                        reject(err);
                    } else {
                        // Reset stats after clearing logs
                        this.db.run('DELETE FROM api_stats', (err) => {
                            if (err) {
                                log.error(`Error clearing stats: ${err.message}`);
                                reject(err);
                            } else {
                                log.success('All logs and stats cleared from database');
                                resolve();
                            }
                        });
                    }
                });
            } catch (error) {
                log.error(`Error in clearLogs: ${error.message}`);
                reject(error);
            }
        });
    }

    purgeOldLogs(daysToKeep = 30) {
        return new Promise((resolve, reject) => {
            try {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

                this.db.get('SELECT COUNT(*) as count FROM api_logs WHERE timestamp < datetime(?)',
                    [cutoffDate.toISOString()],
                    (err, row) => {
                        if (err) {
                            log.error(`Error counting old logs: ${err.message}`);
                            reject(err);
                            return;
                        }

                        const count = row.count;
                        if (count === 0) {
                            log.info('No old logs to purge');
                            resolve(0);
                            return;
                        }

                        this.db.run('DELETE FROM api_logs WHERE timestamp < datetime(?)',
                            [cutoffDate.toISOString()],
                            (err) => {
                                if (err) {
                                    log.error(`Error purging old logs: ${err.message}`);
                                    reject(err);
                                } else {
                                    log.success(`Purged ${count} logs older than ${daysToKeep} days`);
                                    resolve(count);
                                }
                            }
                        );
                    }
                );
            } catch (error) {
                log.error(`Error in purgeOldLogs: ${error.message}`);
                reject(error);
            }
        });
    }

    startAutoPurge(daysToKeep = 30, intervalHours = 24) {
        // Initial purge
        this.purgeOldLogs(daysToKeep).catch(err =>
            log.error(`Auto-purge failed: ${err.message}`));

        // Set up periodic purge
        const interval = intervalHours * 60 * 60 * 1000; // Convert hours to milliseconds
        this.autoPurgeInterval = setInterval(() => {
            this.purgeOldLogs(daysToKeep).catch(err =>
                log.error(`Auto-purge failed: ${err.message}`));
        }, interval);

        log.info(`Auto-purge enabled: Logs older than ${daysToKeep} days will be removed every ${intervalHours} hours`);
    }

    stopAutoPurge() {
        if (this.autoPurgeInterval) {
            clearInterval(this.autoPurgeInterval);
            this.autoPurgeInterval = null;
            log.info('Auto-purge disabled');
        }
    }

    close() {
        return new Promise((resolve, reject) => {
            if (this.autoPurgeInterval) {
                this.stopAutoPurge();
            }
            this.db.close((err) => {
                if (err) {
                    log.error(`Error closing database: ${err.message}`);
                    reject(err);
                } else {
                    log.info('Database connection closed');
                    resolve();
                }
            });
        });
    }
}

// Export a singleton instance
module.exports = new Database();