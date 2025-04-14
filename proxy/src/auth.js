const { chromium } = require('playwright');
const dotenv = require('dotenv');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const https = require('https');

// Parse command-line arguments
const args = process.argv.slice(2);
const shouldOpenBrowser = args.includes('--open-browser');
const shouldNotPersist = args.includes('--no-persist');

// Store active browser session globally
let activeBrowser = null;
let activeContext = null;
let activePage = null;

// Store authentication data for session persistence
let persistentAuthData = {
    cookies: null,
    headers: null,
    userData: null,
    lastRefreshed: null
};

// Path for storing session data
const SESSION_FILE_PATH = path.join(process.cwd(), '.session-data.json');

// Load environment variables with more explicit path - pointing to root directory
const envPath = path.resolve(path.join(__dirname, '..', '..', '.env'));
console.log(chalk.yellow.bold(`📄 Loading .env file from: ${envPath}`));

// Check if .env file exists
if (fs.existsSync(envPath)) {
    console.log(chalk.green('✓ .env file found'));
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    console.log(chalk.blue('Environment variables loaded:'));
    Object.keys(envConfig).forEach(key => {
        if (!key.includes('PASSWORD')) {
            process.env[key] = process.env[key] || envConfig[key];
            console.log(chalk.blue(`  - ${key}: ${key.includes('SECRET') ? '******' : process.env[key]}`));
        }
    });
} else {
    console.log(chalk.red.bold('❌ .env file not found! Please create one.'));
}

// Custom logging with Chalk
const log = {
    info: (message) => console.log(chalk.blue.bold('ℹ INFO: ') + chalk.blue(message)),
    success: (message) => console.log(chalk.green.bold('✓ SUCCESS: ') + chalk.green(message)),
    warn: (message) => console.log(chalk.yellow.bold('⚠ WARNING: ') + chalk.yellow(message)),
    error: (message) => console.log(chalk.red.bold('✖ ERROR: ') + chalk.red(message)),
    browser: (message) => console.log(chalk.hex('#ff6600').bold('🌐 BROWSER: ') + chalk.hex('#ff6600')(message)),
    auth: (step, message) => console.log(chalk.hex('#9900cc').bold(`🔒 AUTH [${step}]: `) + chalk.hex('#9900cc')(message)),
    instruction: (message) => console.log(chalk.bgCyan.white.bold(' INSTRUCTION ') + ' ' + chalk.cyan.bold(message))
};

/**
 * Save the current session data to filesystem for persistence
 * @param {Object} data - Session data to persist
 */
function saveSessionData(data) {
    // Skip saving if persistence is disabled
    if (shouldNotPersist) {
        log.info('Session persistence is disabled - not saving session data');
        return;
    }
    
    try {
        // Only store what we need for session persistence
        const sessionData = {
            cookies: data.cookies,
            headers: data.headers,
            userData: data.userData,
            lastRefreshed: new Date().toISOString()
        };
        
        fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessionData, null, 2));
        log.success('Session data saved to disk for persistence');
    } catch (error) {
        log.error(`Failed to save session data: ${error.message}`);
    }
}

/**
 * Load saved session data if available
 * @returns {Object|null} - Loaded session data or null if not found or expired
 */
function loadSessionData() {
    // Skip loading if persistence is disabled
    if (shouldNotPersist) {
        log.info('Session persistence is disabled - not loading previous session data');
        return null;
    }
    
    try {
        if (fs.existsSync(SESSION_FILE_PATH)) {
            const data = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, 'utf8'));
            log.info('Found saved session data');
            
            // Check if session is recent enough (within last 12 hours)
            const lastRefreshed = new Date(data.lastRefreshed);
            const now = new Date();
            const hoursSinceRefresh = (now - lastRefreshed) / (1000 * 60 * 60);
            
            if (hoursSinceRefresh < 12) {
                log.success(`Using saved session data (${Math.round(hoursSinceRefresh * 10) / 10} hours old)`);
                return data;
            } else {
                log.warn(`Saved session expired (${Math.round(hoursSinceRefresh * 10) / 10} hours old)`);
                return null;
            }
        }
    } catch (error) {
        log.error(`Failed to load session data: ${error.message}`);
    }
    return null;
}

/**
 * Close the browser session if needed
 */
async function closeBrowserSession() {
    if (activeBrowser) {
        log.browser('Closing active browser session');
        try {
            await activeBrowser.close();
        } catch (error) {
            log.warn(`Error closing browser: ${error.message}`);
        }
        activeBrowser = null;
        activeContext = null;
        activePage = null;
        
        log.success('Browser closed, but session data is preserved');
    }
}

/**
 * Make a direct API call to whoami endpoint using axios with authentication cookies
 * @param {Array} cookies - The cookies from the authenticated session
 * @returns {Promise<Object>} - The user identity data
 */
async function callWhoamiAPI(cookies) {
    log.info(chalk.bold('Making direct API call to whoami endpoint...'));
    
    try {
        // Convert playwright cookies to axios cookie format
        const cookieString = cookies
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join('; ');
        
        // Create a custom https agent that ignores SSL certificate errors
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false // Ignore SSL certificate issues
        });
        
        log.warn('SSL certificate verification disabled for API calls');
        
        // Make API request with cookies
        const response = await axios({
            method: 'get',
            url: `${process.env.POWERPORTAL_BASEURL}/api/v1/auth/whoami`,
            headers: {
                Cookie: cookieString,
                'Accept': 'application/json'
            },
            httpsAgent: httpsAgent // Use the custom agent that ignores certificate issues
        });
        
        // Pretty print the response data
        log.success('API whoami call successful!');
        console.log('\n' + chalk.bgGreen.white.bold(' WHOAMI RESPONSE '));
        console.log(chalk.green('─'.repeat(50)));
        
        const data = response.data;
        console.log(chalk.white(JSON.stringify(data, null, 2)));
        console.log(chalk.green('─'.repeat(50)) + '\n');
        
        return data;
    } catch (error) {
        log.error(`API whoami call failed: ${error.message}`);
        if (error.response) {
            console.log(chalk.red('─'.repeat(50)));
            console.log(chalk.red(`Status: ${error.response.status}`));
            console.log(chalk.red(`Response: ${JSON.stringify(error.response.data, null, 2)}`));
            console.log(chalk.red('─'.repeat(50)));
        }
        return null;
    }
}

/**
 * Check if the current session is still valid
 * @param {Object} sessionData - The session data to verify
 * @returns {Promise<boolean>} - True if session is valid
 */
async function verifySession(sessionData) {
    log.info(chalk.bold('Verifying if existing session is still valid...'));
    
    if (!sessionData || !sessionData.cookies || sessionData.cookies.length === 0) {
        log.warn('No session data to verify');
        return false;
    }
    
    try {
        const userData = await callWhoamiAPI(sessionData.cookies);
        if (userData) {
            log.success('Session is still valid!');
            // Update the persistent data with fresh user data
            persistentAuthData = {
                ...sessionData,
                userData,
                lastRefreshed: new Date().toISOString()
            };
            saveSessionData(persistentAuthData);
            return true;
        }
    } catch (error) {
        log.error(`Session verification failed: ${error.message}`);
    }
    
    log.warn('Session appears to be expired or invalid');
    return false;
}

/**
 * Authenticate with Harvey Norman Commercial using Playwright with Edge browser
 * @param {boolean} forceBrowser - Whether to force browser authentication even if session exists
 * @returns {Promise<{cookies: Array, headers: Object, userData: Object}>} Authentication data
 */
async function authenticate(forceBrowser = false) {
    log.info(chalk.bold('Starting authentication process...'));
    
    // Always force browser if the flag is set
    forceBrowser = forceBrowser || shouldOpenBrowser;
    
    // Try to use cached session if available (unless forced browser or persistence disabled)
    if (!forceBrowser && !shouldNotPersist) {
        // First check our in-memory cache
        if (persistentAuthData.cookies) {
            log.info('Using in-memory cached session');
            const isValid = await verifySession(persistentAuthData);
            if (isValid) {
                log.success('Cached session is valid, using it instead of browser auth');
                return persistentAuthData;
            }
        }
        
        // If no valid in-memory cache, try loading from disk
        const savedSession = loadSessionData();
        if (savedSession) {
            persistentAuthData = savedSession;
            const isValid = await verifySession(savedSession);
            if (isValid) {
                log.success('Saved session is valid, using it instead of browser auth');
                return persistentAuthData;
            }
        }
        
        log.info('No valid session found, proceeding with browser authentication');
    } else if (shouldNotPersist) {
        log.info('Session persistence is disabled - proceeding with browser authentication');
    } else {
        log.info('Forced browser authentication requested');
    }

    // No need to verify username - user will enter credentials in browser
    log.info('User will enter credentials directly in browser');
    
    // Launch Edge browser instead of default Chromium
    log.browser('Attempting to launch browser...');
    
    try {
        // Try Microsoft Edge first
        log.browser('Trying to launch Microsoft Edge');
        if (!activeBrowser) {
            try {
                activeBrowser = await chromium.launch({ 
                    headless: false, // Keep browser visible
                    channel: 'msedge', // Explicitly use Edge
                    args: ['--disable-extensions'] // Disable extensions which can cause issues
                });
                log.success('Successfully launched Microsoft Edge');
            } catch (edgeError) {
                log.warn(`Failed to launch Microsoft Edge: ${edgeError.message}`);
                log.browser('Falling back to default Chromium browser');
                
                // Fall back to default Chromium browser
                activeBrowser = await chromium.launch({
                    headless: false,
                    args: ['--disable-extensions']
                });
                log.success('Successfully launched Chromium browser');
            }
        } else {
            log.browser('Reusing existing browser session');
        }
    } catch (browserError) {
        log.error(`Failed to launch any browser: ${browserError.message}`);
        log.error('Please make sure you have either Microsoft Edge or Google Chrome installed');
        throw new Error(`Browser launch failed: ${browserError.message}`);
    }

    try {
        log.browser('Creating new browser context');
        if (!activeContext) {
            activeContext = await activeBrowser.newContext();
            activePage = await activeContext.newPage();
        }

        // Construct the login URL
        const loginUrl = `${process.env.POWERPORTAL_BASEURL}${process.env.LOGIN_URL}?returnUrl=${encodeURIComponent(process.env.RETURN_URL)}&provider=${encodeURIComponent(process.env.AUTH_PROVIDER)}`;
        log.browser(`Navigating to login URL: ${chalk.underline(loginUrl)}`);

        // Navigation events tracing
        activePage.on('load', () => log.browser(`Page loaded: ${activePage.url()}`));
        activePage.on('response', response => {
            if (['document', 'xhr', 'fetch'].includes(response.request().resourceType())) {
                const status = response.status();
                let statusColor = chalk.green;
                if (status >= 400) statusColor = chalk.red;
                else if (status >= 300) statusColor = chalk.yellow;

                log.browser(`${chalk.dim('Response:')} ${statusColor(status)} ${response.url().substring(0, 80)}${response.url().length > 80 ? '...' : ''}`);
            }
        });

        // Navigate to the login page
        await activePage.goto(loginUrl);

        // Wait for the login form to be visible
        log.auth('FORM', 'Looking for email input field');
        await activePage.waitForSelector('input[type="email"]');

        // No auto-filling - user will enter username in browser
        log.auth('FORM', 'Looking for password input field');
        await activePage.waitForSelector('input[type="password"]');

        // Clear instructions for the user
        log.instruction('Please enter your username and password in the browser window and click Sign In');
        log.instruction('The proxy server is waiting for you to complete authentication...');

        // Wait for redirect to the return URL - this happens after user manually logs in
        log.auth('REDIRECT', `Waiting for redirect to URL containing: ${process.env.RETURN_URL}`);
        await activePage.waitForURL(url => url.pathname.includes(process.env.RETURN_URL), {
            timeout: 120000  // Extended timeout (2 minutes) to give user time to enter credentials
        });

        // Check if authentication was successful
        const currentUrl = activePage.url();
        log.auth('REDIRECT', `Current URL after login: ${chalk.underline(currentUrl)}`);

        if (currentUrl.includes('error') || currentUrl.includes('login')) {
            // If login failed, try to get error message from page
            let errorMessage = 'Login failed.';

            try {
                errorMessage = await activePage.evaluate(() => {
                    const errorEl = document.querySelector('.error-message') ||
                        document.querySelector('.alert-danger') ||
                        document.querySelector('.validation-summary-errors');
                    return errorEl ? errorEl.textContent.trim() : 'No error message found on page';
                });
            } catch (e) {
                log.error('Could not extract error message from page');
            }

            log.error(chalk.bold(`Login failed. Error: ${errorMessage}`));
            throw new Error(`Login failed: ${errorMessage}`);
        }

        log.success(chalk.bold('Authentication successful!'));
        log.browser(`Final URL: ${chalk.underline(currentUrl)}`);

        // After successful verification at /api/v1/auth/verify, navigate to /api/v1/auth/whoami
        log.auth('WHOAMI', 'Navigating to whoami endpoint after successful verification');
        const whoamiUrl = `${process.env.POWERPORTAL_BASEURL}/api/v1/auth/whoami`;
        log.browser(`Navigating to: ${chalk.underline(whoamiUrl)}`);

        await activePage.goto(whoamiUrl);
        log.success(`Successfully navigated to whoami endpoint: ${activePage.url()}`);

        // Wait briefly to ensure page loads fully
        await activePage.waitForLoadState('networkidle');

        // Try to extract user information from the whoami response if visible in the browser
        try {
            const pageContent = await activePage.content();
            if (pageContent.includes('user') || pageContent.includes('email')) {
                log.auth('WHOAMI', 'User identity information retrieved');

                // Try to parse any JSON user data that might be on the page
                const userData = await activePage.evaluate(() => {
                    try {
                        // Look for JSON data that might be in pre tags or directly in body
                        const preContent = document.querySelector('pre')?.textContent;
                        if (preContent && preContent.includes('{')) {
                            return JSON.parse(preContent);
                        } else if (document.body.textContent.includes('{')) {
                            // Try to extract JSON from body text
                            const match = document.body.textContent.match(/\{[^]*\}/);
                            if (match) return JSON.parse(match[0]);
                        }
                        return null;
                    } catch (e) {
                        return null;
                    }
                });

                if (userData) {
                    log.auth('USER', `Authenticated as: ${JSON.stringify(userData)}`);
                }
            }
        } catch (error) {
            log.warn(`Could not extract user information: ${error.message}`);
        }

        log.browser(chalk.green.bold('✓ Browser session will remain active'));

        // Get cookies and headers for future requests
        const cookies = await activeContext.cookies();
        log.auth('COOKIES', `Captured ${cookies.length} cookies from browser session`);

        const headers = {
            'User-Agent': await activePage.evaluate(() => navigator.userAgent),
            'Referer': process.env.POWERPORTAL_BASEURL
        };
        log.auth('HEADERS', `Captured essential headers for proxy requests`);

        // Make a direct API call to whoami using the cookies to verify API access
        const whoamiData = await callWhoamiAPI(cookies);

        // Store the session data for persistence
        persistentAuthData = {
            cookies,
            headers,
            userData: whoamiData,
            lastRefreshed: new Date().toISOString()
        };
        
        // Save session to disk
        saveSessionData(persistentAuthData);

        // Inject success modal into the page
        await injectSuccessModal(activePage);

        // Let user know they can close the browser
        log.instruction('Authentication complete - you can close the browser if desired');
        log.instruction('The session will stay active even after the browser is closed');
        
        return {
            cookies,
            headers,
            browser: activeBrowser,
            context: activeContext,
            page: activePage,
            userData: whoamiData
        };
    } catch (error) {
        log.error(`Authentication error: ${chalk.bold(error.message)}`);
        // Even on error, don't close the browser automatically
        log.warn('Browser session remains open despite error');
        throw error;
    }
}

/**
 * Injects a success modal into the page that informs the user they can close the browser
 * @param {Page} page - The Playwright page object 
 */
async function injectSuccessModal(page) {
  try {
    await page.evaluate(() => {
      // Create modal elements
      const modalContainer = document.createElement('div');
      modalContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      `;
      
      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background-color: white;
        border-radius: 8px;
        padding: 24px;
        width: 400px;
        max-width: 90%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        text-align: center;
      `;

      const icon = document.createElement('div');
      icon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      `;
      
      const title = document.createElement('h2');
      title.textContent = 'Authentication Successful!';
      title.style.cssText = 'margin: 16px 0; color: #111827; font-size: 1.5rem;';
      
      const message = document.createElement('p');
      message.textContent = 'You have successfully authenticated. You can close this browser window if you want.';
      message.style.cssText = 'margin: 0 0 24px 0; color: #4B5563; font-size: 1rem; line-height: 1.5;';
      
      const closeButton = document.createElement('button');
      closeButton.textContent = 'Close';
      closeButton.style.cssText = `
        background-color: #10B981;
        color: white;
        border: none;
        padding: 8px 24px;
        border-radius: 6px;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      `;
      
      closeButton.addEventListener('mouseover', () => {
        closeButton.style.backgroundColor = '#059669';
      });
      
      closeButton.addEventListener('mouseout', () => {
        closeButton.style.backgroundColor = '#10B981';
      });
      
      closeButton.addEventListener('click', () => {
        modalContainer.style.opacity = '0';
        setTimeout(() => modalContainer.remove(), 300);
      });
      
      // Assemble modal
      modalContent.appendChild(icon);
      modalContent.appendChild(title);
      modalContent.appendChild(message);
      modalContent.appendChild(closeButton);
      modalContainer.appendChild(modalContent);
      
      // Add modal to page
      document.body.appendChild(modalContainer);
      
      // Add fade-in animation
      modalContainer.style.opacity = '0';
      setTimeout(() => { modalContainer.style.opacity = '1'; }, 10);
      modalContainer.style.transition = 'opacity 0.3s ease';
    });
    
    console.log('Success modal injected into page');
  } catch (error) {
    console.error('Failed to inject success modal:', error);
  }
}

// Add a function to refresh session if needed
async function refreshSession() {
    log.info('Refreshing authentication session...');
    if (persistentAuthData.cookies) {
        const isValid = await verifySession(persistentAuthData);
        if (!isValid) {
            log.warn('Session expired, need to re-authenticate');
            return await authenticate(true); // Force browser auth
        }
        return persistentAuthData;
    } else {
        log.warn('No session to refresh, need to authenticate');
        return await authenticate();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    log.info('Received SIGINT signal, cleaning up...');
    await closeBrowserSession();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log.info('Received SIGTERM signal, cleaning up...');
    await closeBrowserSession();
    process.exit(0);
});

module.exports = {
    authenticate,
    closeBrowserSession,
    callWhoamiAPI,
    refreshSession,
    verifySession
};