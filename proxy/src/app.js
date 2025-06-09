const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const cors = require('cors');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
// Add rate limiter import (requires: npm install express-rate-limit)
const rateLimit = require('express-rate-limit');
const auth = require('./auth');
const { authenticate, callWhoamiAPI, closeBrowserSession, refreshSession } = auth;
const db = require('./db');

// Delete session data file at startup
const SESSION_FILE_PATH = path.join(process.cwd(), '.session-data.json');
if (fs.existsSync(SESSION_FILE_PATH)) {
    try {
        fs.unlinkSync(SESSION_FILE_PATH);
        console.log(`[INFO] ${new Date().toISOString()} - Removed existing session data file`);
    } catch (error) {
        console.error(`[ERROR] ${new Date().toISOString()} - Failed to remove session data file: ${error.message}`);
    }
}

// Load environment variables
dotenv.config();
dotenv.config({ path: path.resolve(path.join(__dirname, '..', '..', '.env')) });

// Validate required environment variables
function validateEnv() {
    const required = ['POWERPORTAL_BASEURL']; // Removed username requirement
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error(`Error: Missing required environment variables: ${missing.join(', ')}`);
        console.error('Please create a .env file with these variables or set them in your environment.');
        process.exit(1);
    }

    // Username and password are now optional - user will enter in browser
    console.log('User credentials will be entered directly in the browser.');

    // Validate base URL format
    try {
        new URL(process.env.POWERPORTAL_BASEURL);
    } catch (error) {
        console.error(`Error: POWERPORTAL_BASEURL "${process.env.POWERPORTAL_BASEURL}" is not a valid URL`);
        process.exit(1);
    }
}

validateEnv();

// Check for required dependencies
(async function checkDependencies() {
    try {
        const { chromium } = require('playwright');
        console.log('Playwright dependency found. Checking for browser...');

        try {
            // Just check if we can create a browser instance
            const browserInstance = await chromium.launch({
                headless: true,
                timeout: 30000
            });
            await browserInstance.close();
            console.log('Browser check successful! ✓');
        } catch (browserError) {
            console.error(`Error launching browser: ${browserError.message}`);
            console.log('');
            console.log('You may need to install browser dependencies. Try running:');
            console.log('npx playwright install chromium');
            console.log('');
        }
    } catch (error) {
        console.error(`Error checking dependencies: ${error.message}`);
    }
})();

// Global variable to store authentication data
let globalAuthData = null;

// Configure rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 600, // Limit each IP to 600 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: 'Too many requests from this IP, please try again later.',
    handler: (req, res, next, options) => {
        console.log(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(options.statusCode).json({
            status: 'error',
            message: options.message,
        });
    }
});

// Setup logging
const log = {
    info: (message) => {
        // Skip logging dashboard-related info messages
        if (!message.includes('Dashboard requested')) {
            console.log(`ℹ️  [INFO] ${new Date().toISOString()} - ${message}`);
        }
    },
    error: (message) => {
        console.error(`❌ [ERROR] ${new Date().toISOString()} - ${message}`);
    },
    warn: (message) => {
        console.warn(`⚠️  [WARN] ${new Date().toISOString()} - ${message}`);
    },
    debug: (message) => {
        if (process.env.DEBUG === 'true') {
            console.debug(`🔍 [DEBUG] ${new Date().toISOString()} - ${message}`);
        }
    },
    request: (req, message) => {
        // Skip logging dashboard and internal API requests
        if (!req.path.startsWith('/dashboard') &&
            !(req.path.startsWith('/power-portal-proxy/') && !req.path.startsWith('/api/v1/'))) {

            // Format query parameters if they exist
            const queryStr = Object.keys(req.query || {}).length > 0
                ? `\n  📝 Query: ${JSON.stringify(req.query, null, 2).replace(/\n/g, '\n    ')}`
                : '';

            // Format request body if it exists
            const bodyStr = req.body
                ? `\n  📦 Body: ${JSON.stringify(req.body, null, 2).replace(/\n/g, '\n    ')}`
                : '';

            console.log(
                `📨 [REQUEST] ${new Date().toISOString()}\n` +
                `  🌐 ${req.method} ${req.path}${queryStr}${bodyStr}\n` +
                `  📍 ${message}`
            );
        }
    },
    response: (req, res, message) => {
        // Skip logging dashboard and internal API responses
        if (!req.path.startsWith('/dashboard') &&
            !(req.path.startsWith('/power-portal-proxy/') && !req.path.startsWith('/api/v1/'))) {

            const statusIcon = res.statusCode < 400
                ? '✅' // Success
                : res.statusCode < 500
                    ? '⚠️' // Client error
                    : '❌'; // Server error

            const statusColor = res.statusCode < 400
                ? '\x1b[32m' // Green for success
                : res.statusCode < 500
                    ? '\x1b[33m' // Yellow for client error
                    : '\x1b[31m'; // Red for server error

            console.log(
                `📩 [RESPONSE] ${new Date().toISOString()}\n` +
                `  🌐 ${req.method} ${req.path}\n` +
                `  ${statusIcon} Status: ${statusColor}${res.statusCode}\x1b[0m\n` +
                `  ⏱️  ${message}`
            );
        }
    }
};

// Parse command-line arguments
const args = process.argv.slice(2);
const shouldOpenBrowser = args.includes('--open-browser');
const shouldNotPersist = args.includes('--no-persist');

if (shouldNotPersist) {
    log.info('Session persistence disabled - session data will not be saved');
}

if (shouldOpenBrowser) {
    log.info('Browser will open automatically during startup');
}

/**
 * Setup and configure the proxy application
 * @param {Express} app - Express app instance to configure
 */
function setupProxyApp(app) {
    app.use(cors());
    app.use(cookieParser());
    app.use(express.json());

    // Apply rate limiting to API routes
    app.use('/power-portal-proxy/', apiLimiter);

    // Enable CORS for dashboard requests
    app.use(cors({
        origin: ['http://localhost:5001', 'http://localhost:3000'],
        credentials: true,
    }));

    // Add token route
    const tokenRouter = require('./routes/token');
    app.use('/power-portal-proxy/auth-token', tokenRouter);
    app.set('persistentAuthData', globalAuthData);

    // Add an endpoint to manually close the browser while keeping the session
    app.get('/proxy/close-browser', async (req, res) => {
        try {
            await closeBrowserSession();
            res.json({ success: true, message: 'Browser closed, but session is preserved' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add an endpoint to refresh the session
    app.get('/proxy/refresh-session', async (req, res) => {
        try {
            globalAuthData = await refreshSession();
            res.json({ success: true, message: 'Session refreshed successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add an API endpoint to check who is logged in
    app.get('/proxy/whoami', async (req, res) => {
        if (!globalAuthData || !globalAuthData.cookies) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        try {
            const userData = await callWhoamiAPI(globalAuthData.cookies);
            res.json(userData);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Add a shutdown endpoint
    app.post('/power-portal-proxy/shutdown', (req, res) => {
        log.info('Received shutdown request from dashboard');
        res.json({ success: true, message: 'Shutdown initiated' });

        // Send response before shutting down
        res.on('finish', () => {
            log.info('Shutting down application...');

            // Close the browser session first
            closeBrowserSession().then(() => {
                log.success('Browser sessions closed, shutting down server');

                // Give a small delay to ensure response is sent
                setTimeout(() => {
                    process.exit(0); // Exit with success code
                }, 500);
            }).catch(error => {
                log.error(`Error during shutdown: ${error.message}`);
                // Exit anyway after error
                setTimeout(() => {
                    process.exit(1); // Exit with error code
                }, 500);
            });
        });
    });

    // Add API routes for accessing logs and stats
    app.get('/power-portal-proxy/stats', async (req, res) => {
        log.info(`Dashboard requested stats data`);
        try {
            const stats = db.getStats();
            res.json(stats);
        } catch (error) {
            log.error(`Error retrieving stats: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/power-portal-proxy/logs', async (req, res) => {
        const { method, path, status, from, to, limit } = req.query;
        log.info(`Dashboard requested logs with filters: ${JSON.stringify({ method, path, status, from, to, limit })}`); try {
            const filters = { method, path, status, from, to };
            const logs = await db.searchLogs(filters, parseInt(limit) || 100);
            res.json(logs);
        } catch (error) {
            log.error(`Error searching logs: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/power-portal-proxy/logs/recent', async (req, res) => {
        const limit = parseInt(req.query.limit) || 100;
        log.info(`Dashboard requested ${limit} recent logs`);
        try {
            const logs = await db.getRecentLogs(limit);
            res.json(logs);
        } catch (error) {
            log.error(`Error retrieving recent logs: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/power-portal-proxy/logs/clear', async (req, res) => {
        log.info(`Dashboard requested to clear all logs`);
        try {
            db.clearLogs();
            res.json({ success: true, message: 'All logs cleared' });
        } catch (error) {
            log.error(`Error clearing logs: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });    // Request logging middleware
    app.use((req, res, next) => {
        // Skip logging for dashboard and internal API routes
        if (req.path.startsWith('/dashboard') ||
            (req.path.startsWith('/power-portal-proxy/') && !req.path.startsWith('/api/v1/'))) {
            next();
            return;
        }

        const start = Date.now();
        log.request(req, 'Request received');
        res.on('finish', () => {
            const duration = Date.now() - start;
            log.response(req, res, `Duration: ${duration}ms`);
        });
        next();
    });

    // Authentication middleware
    app.use(async (req, res, next) => {
        // Skip authentication for dashboard routes
        if (req.path.startsWith('/dashboard')) {
            next();
            return;
        }

        // Use the pre-authenticated data if available
        if (globalAuthData) {
            log.debug('Using pre-authenticated session data');
            req.authData = globalAuthData;
            next();
            return;
        }

        // If not already authenticated, authenticate
        try {
            log.warn('No authentication data found. Authenticating...');
            const authData = await authenticate(); // This will use cached session if available

            if (authData && authData.cookies) {
                log.info('Authentication successful, setting cookies');
                // Set cookies from auth response
                authData.cookies.forEach(cookie => {
                    res.cookie(cookie.name, cookie.value, {
                        path: cookie.path || '/',
                        domain: cookie.domain,
                        secure: cookie.secure,
                        httpOnly: cookie.httpOnly,
                        sameSite: cookie.sameSite
                    });
                });

                // Store auth token in app memory for subsequent requests
                req.authData = authData;
                globalAuthData = authData;
            } else {
                log.error('Authentication failed - no auth data returned');
                return res.status(401).send('Authentication failed');
            }
        } catch (error) {
            log.error(`Authentication error: ${error.message}`);
            return res.status(500).send('Authentication process failed');
        }
        next();
    });

    // Proxy middleware - exclude dashboard routes from being proxied
    app.use(['/', '/*'], (req, res, next) => {
        // Skip proxying for dashboard and internal API routes
        // But do proxy external API endpoints
        if (req.path.startsWith('/dashboard') ||
            (req.path.startsWith('/power-portal-proxy/') && !req.path.startsWith('/api/v1/'))) {
            next();
            return;
        }

        log.info(`Proxying request to: ${process.env.POWERPORTAL_BASEURL}${req.path}`);

        return createProxyMiddleware({
            target: process.env.POWERPORTAL_BASEURL,
            changeOrigin: true,
            secure: false, // For handling https
            cookieDomainRewrite: {
                '*': 'localhost' // Rewrite all cookie domains to localhost
            },
            cookiePathRewrite: {
                '*': '/' // Simplify cookie paths for easier handling
            },
            // Properly handle paths
            pathRewrite: (path, req) => {
                // Keep the original path for API requests
                return path;
            },
            onProxyReq: (proxyReq, req, res) => {
                req.startTime = Date.now();

                if (req.body) {
                    req.requestBody = req.body;
                }

                const headersToRemove = ['authorization', 'cookie', 'auth-token', 'x-auth-token'];
                headersToRemove.forEach(header => {
                    if (proxyReq.getHeader(header)) {
                        proxyReq.removeHeader(header);
                    }
                });

                if (req.authData && req.authData.headers) {
                    Object.entries(req.authData.headers).forEach(([key, value]) => {
                        proxyReq.setHeader(key, value);
                    });
                }

                if (req.authData && req.authData.cookies) {
                    const cookieString = req.authData.cookies
                        .map(cookie => `${cookie.name}=${cookie.value}`)
                        .join('; ');

                    if (cookieString) {
                        proxyReq.setHeader('Cookie', cookieString);
                    }
                }
            },
            onProxyRes: (proxyRes, req, res) => {
                const contentEncoding = proxyRes.headers['content-encoding'];
                const contentType = proxyRes.headers['content-type'] || '';

                const processableContentTypes = ['application/json', 'text/', 'application/xml', 'application/javascript'];
                const shouldProcessContent = processableContentTypes.some(type => contentType.includes(type));

                if (shouldProcessContent) {
                    let responseBody = Buffer.from([]);
                    let originalWrite = res.write;
                    let originalEnd = res.end;

                    res.write = function (chunk) {
                        if (Buffer.isBuffer(chunk)) {
                            responseBody = Buffer.concat([responseBody, chunk]);
                        } else {
                            responseBody = Buffer.concat([responseBody, Buffer.from(chunk)]);
                        }
                        return originalWrite.apply(res, arguments);
                    };

                    res.end = function (chunk) {
                        if (chunk) {
                            if (Buffer.isBuffer(chunk)) {
                                responseBody = Buffer.concat([responseBody, chunk]);
                            } else {
                                responseBody = Buffer.concat([responseBody, Buffer.from(chunk)]);
                            }
                        }

                        try {
                            let decodedBody;
                            if (contentEncoding === 'gzip') {
                                decodedBody = zlib.gunzipSync(responseBody).toString('utf8');
                            } else if (contentEncoding === 'deflate') {
                                decodedBody = zlib.inflateSync(responseBody).toString('utf8');
                            } else if (contentEncoding === 'br') {
                                decodedBody = zlib.brotliDecompressSync(responseBody).toString('utf8');
                            } else {
                                decodedBody = responseBody.toString('utf8');
                            }

                            const duration = Date.now() - (req.startTime || Date.now());
                            const requestData = {
                                method: req.method,
                                url: req.url,
                                path: req.path || req.url.split('?')[0],
                                headers: req.headers,
                                body: req.requestBody || null,
                                query: req.query
                            };

                            const responseData = {
                                statusCode: proxyRes.statusCode,
                                statusMessage: proxyRes.statusMessage,
                                headers: proxyRes.headers,
                                body: decodedBody,
                                contentType,
                                duration
                            };

                            setTimeout(() => {
                                db.logApiRequest(requestData, responseData);
                            }, 0);
                        } catch (error) {
                            log.error(`Error processing response: ${error.message}`);
                        }

                        return originalEnd.apply(res, arguments);
                    };
                } else {
                    const duration = Date.now() - (req.startTime || Date.now());
                    const requestData = {
                        method: req.method,
                        url: req.url,
                        path: req.path || req.url.split('?')[0],
                        headers: req.headers,
                        body: null,
                        query: req.query
                    };

                    const responseData = {
                        statusCode: proxyRes.statusCode,
                        statusMessage: proxyRes.statusMessage,
                        headers: proxyRes.headers,
                        body: `[Binary content of type: ${contentType}]`,
                        contentType,
                        duration
                    };

                    setTimeout(() => {
                        db.logApiRequest(requestData, responseData);
                    }, 0);
                }

                const cookies = proxyRes.headers['set-cookie'];
                if (cookies && globalAuthData && globalAuthData.cookies) {
                    cookies.forEach(cookieStr => {
                        try {
                            const mainPart = cookieStr.split(';')[0];
                            const [name, value] = mainPart.split('=');

                            if (name && value) {
                                const existingIndex = globalAuthData.cookies.findIndex(c => c.name === name);

                                if (existingIndex >= 0) {
                                    globalAuthData.cookies[existingIndex].value = value;
                                } else {
                                    globalAuthData.cookies.push({
                                        name,
                                        value,
                                        domain: 'localhost',
                                        path: '/'
                                    });
                                }
                            }
                        } catch (error) {
                            log.error(`Error processing cookie: ${error.message}`);
                        }
                    });
                }

                const authHeaders = ['authorization', 'x-auth-token', 'x-csrf-token'];
                authHeaders.forEach(header => {
                    if (proxyRes.headers[header] && globalAuthData && globalAuthData.headers) {
                        globalAuthData.headers[header] = proxyRes.headers[header];
                    }
                });
            },
            onError: (err, req, res) => {
                const duration = Date.now() - (req.startTime || Date.now());

                const requestData = {
                    method: req.method,
                    url: req.url,
                    path: req.path || req.url.split('?')[0],
                    headers: req.headers,
                    body: req.requestBody || null,
                    query: req.query
                };

                const responseData = {
                    statusCode: 500,
                    statusMessage: 'Proxy Error',
                    headers: {},
                    body: err.message,
                    contentType: 'text/plain',
                    duration
                };

                setTimeout(() => {
                    db.logApiRequest(requestData, responseData);
                }, 0);

                log.error(`Proxy error: ${err.message}`);
                res.status(500).send('Proxy error occurred');
            }
        })(req, res, next);
    });

    // Initialize authentication on startup
    (async () => {
        log.info('Initiating authentication on server startup...');
        try {
            globalAuthData = await authenticate();
            log.info('Authentication successful!');

            if (globalAuthData.cookies) {
                log.info(`Using ${globalAuthData.cookies.length} cookies for authentication`);
            }
        } catch (error) {
            log.error(`Failed to authenticate on server startup: ${error.message}`);
        }
    })();
}

// Export the setupProxyApp function so it can be imported in server.js
module.exports = {
    setupProxyApp,
    log
};

// Start the server when this file is run directly (not imported)
if (require.main === module) {
    const express = require('express');
    const app = express();

    // Configure the proxy application
    setupProxyApp(app);

    // Start the server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        log.info(`Proxy server started on http://localhost:${PORT}`);
        log.info(`Dashboard can be run separately with 'cd dashboard && npm start'`);
    });
}