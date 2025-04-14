const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const chalk = require('chalk');

// Create a database file in the shared logs directory
const adapter = new FileSync(path.join(process.cwd(), '..', 'logs', 'api-logs.json'));
const db = low(adapter);

// Set default database structure
db.defaults({
    requests: [],
    summary: {
        totalRequests: 0,
        endpoints: {},
        responseTimeAvg: 0,
        statusCodes: {},
        errors: 0,
        lastRequest: null
    }
}).write();

// Custom logging
const log = {
    info: (message) => console.log(chalk.blue.bold('ℹ DB: ') + chalk.blue(message)),
    success: (message) => console.log(chalk.green.bold('✓ DB: ') + chalk.green(message)),
    error: (message) => console.log(chalk.red.bold('✖ DB: ') + chalk.red(message))
};

/**
 * Log an API request and its response
 * @param {Object} requestData - Data about the request
 * @param {Object} responseData - Data about the response
 * @returns {Object} The logged request/response entry
 */
function logApiRequest(requestData, responseData) {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = {
            id: `req_${Date.now()}`,
            timestamp,
            request: {
                method: requestData.method,
                url: requestData.url,
                path: requestData.path,
                headers: sanitizeHeaders(requestData.headers),
                body: truncateBody(requestData.body),
                query: requestData.query
            },
            response: {
                statusCode: responseData.statusCode,
                statusMessage: responseData.statusMessage,
                headers: sanitizeHeaders(responseData.headers),
                body: truncateBody(responseData.body),
                contentType: responseData.contentType
            },
            duration: responseData.duration,
            success: responseData.statusCode < 400
        };

        // Add to requests collection
        db.get('requests')
            .push(logEntry)
            .write();

        // Update summary stats
        const summary = db.get('summary').value();
        
        // Update total requests
        db.get('summary')
            .set('totalRequests', summary.totalRequests + 1)
            .set('lastRequest', timestamp)
            .write();

        // Update endpoint stats
        const endpoint = requestData.path.split('?')[0];
        const endpointKey = `${requestData.method}:${endpoint}`;
        const endpointStats = summary.endpoints[endpointKey] || {
            count: 0,
            avgResponseTime: 0,
            lastCall: null,
            errors: 0,
            statusCodes: {}
        };

        // Calculate new average response time
        const newAvgTime = (endpointStats.avgResponseTime * endpointStats.count + responseData.duration) / 
            (endpointStats.count + 1);

        // Update status code count
        const statusCode = responseData.statusCode.toString();
        const statusCodeCount = endpointStats.statusCodes[statusCode] || 0;
        endpointStats.statusCodes[statusCode] = statusCodeCount + 1;

        // Update error count if appropriate
        if (responseData.statusCode >= 400) {
            endpointStats.errors += 1;
            db.get('summary')
                .set('errors', summary.errors + 1)
                .write();
        }

        // Update endpoint stats
        endpointStats.count += 1;
        endpointStats.avgResponseTime = newAvgTime;
        endpointStats.lastCall = timestamp;

        db.get('summary')
            .get('endpoints')
            .set(endpointKey, endpointStats)
            .write();

        // Update overall average response time
        const newOverallAvg = (summary.responseTimeAvg * summary.totalRequests + responseData.duration) / 
            (summary.totalRequests + 1);
        
        db.get('summary')
            .set('responseTimeAvg', newOverallAvg)
            .write();

        // Update status code stats
        const overallStatusCount = summary.statusCodes[statusCode] || 0;
        db.get('summary')
            .get('statusCodes')
            .set(statusCode, overallStatusCount + 1)
            .write();

        log.success(`Logged ${requestData.method} ${endpoint} (${responseData.statusCode}) in ${responseData.duration}ms`);
        return logEntry;
    } catch (error) {
        log.error(`Failed to log request: ${error.message}`);
        return null;
    }
}

/**
 * Get summary statistics about API requests
 * @returns {Object} Summary statistics
 */
function getStats() {
    return db.get('summary').value();
}

/**
 * Get recent request logs
 * @param {Number} limit - Maximum number of logs to return
 * @returns {Array} Recent request logs
 */
function getRecentLogs(limit = 100) {
    return db.get('requests')
        .takeRight(limit)
        .value();
}

/**
 * Search for specific request logs
 * @param {Object} filters - Search filters
 * @returns {Array} Matched request logs
 */
function searchLogs(filters, limit = 100) {
    let query = db.get('requests');
    
    if (filters.method) {
        query = query.filter(log => log.request.method === filters.method);
    }
    
    if (filters.path) {
        query = query.filter(log => log.request.path.includes(filters.path));
    }
    
    if (filters.status) {
        query = query.filter(log => log.response.statusCode.toString() === filters.status.toString());
    }

    if (filters.from) {
        const fromDate = new Date(filters.from);
        query = query.filter(log => new Date(log.timestamp) >= fromDate);
    }

    if (filters.to) {
        const toDate = new Date(filters.to);
        query = query.filter(log => new Date(log.timestamp) <= toDate);
    }

    return query.takeRight(limit).value();
}

/**
 * Clear all logs from the database
 */
function clearLogs() {
    db.set('requests', []).write();
    db.set('summary', {
        totalRequests: 0,
        endpoints: {},
        responseTimeAvg: 0,
        statusCodes: {},
        errors: 0,
        lastRequest: null
    }).write();
    log.info('All logs cleared from database');
}

/**
 * Sanitize headers to remove sensitive information
 * @param {Object} headers - Headers object
 * @returns {Object} Sanitized headers
 */
function sanitizeHeaders(headers = {}) {
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
 * Truncate request/response bodies to avoid huge log entries
 * @param {*} body - Request or response body
 * @returns {*} Truncated body
 */
function truncateBody(body) {
    if (!body) return null;
    
    try {
        // If it's already a string
        if (typeof body === 'string') {
            return body.length > 2000 ? body.substring(0, 2000) + '...' : body;
        }
        
        // If it's JSON or an object
        const jsonStr = JSON.stringify(body);
        return jsonStr.length > 2000 ? jsonStr.substring(0, 2000) + '...' : jsonStr;
    } catch (e) {
        return '[Unserializable data]';
    }
}

module.exports = {
    logApiRequest,
    getStats,
    getRecentLogs,
    searchLogs,
    clearLogs
};