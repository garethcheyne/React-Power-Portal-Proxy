#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const readline = require('readline');

// Initialize color logging
const log = {
    info: (msg) => console.log(chalk.blue('ℹ'), msg),
    success: (msg) => console.log(chalk.green('✓'), msg),
    error: (msg) => console.log(chalk.red('✖'), msg),
    warn: (msg) => console.log(chalk.yellow('⚠'), msg)
};

let proxyProcess = null;
let dashboardProcess = null;

// Helper function to run commands
function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            ...options
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with code ${code}`));
            }
        });

        proc.on('error', (err) => {
            reject(err);
        });

        return proc;
    });
}

// Install dependencies
async function installDeps() {
    log.info('Installing proxy dependencies...');
    await runCommand('npm', ['install'], { cwd: path.join(__dirname) });
    
    log.info('Installing dashboard dependencies...');
    await runCommand('npm', ['install'], { cwd: path.join(__dirname, 'dashboard') });
}

// Build the dashboard
async function buildDashboard() {
    log.info('Building dashboard...');
    await runCommand('npm', ['run', 'build'], { cwd: path.join(__dirname) });
}

// Start the proxy
function startProxy() {
    if (proxyProcess) {
        log.warn('Proxy is already running');
        return;
    }

    log.info('Starting proxy...');
    
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const options = {
        cwd: path.join(__dirname, 'proxy'),
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }
    };

    try {
        proxyProcess = spawn(npmCmd, ['start'], options);

        proxyProcess.on('error', (err) => {
            log.error(`Failed to start proxy: ${err.message}`);
            proxyProcess = null;
        });

        proxyProcess.on('exit', (code) => {
            if (code !== null) {
                log.info(`Proxy process exited with code ${code}`);
            }
            proxyProcess = null;
        });

        // Add specific error handling for common issues
        proxyProcess.on('spawn', () => {
            log.success('Proxy started successfully');
        });
    } catch (err) {
        log.error(`Failed to spawn proxy process: ${err.message}`);
        proxyProcess = null;
    }
}

// Start the dashboard in dev mode
function startDashboardDev() {
    if (dashboardProcess) {
        log.warn('Dashboard is already running');
        return;
    }

    log.info('Starting dashboard in dev mode...');
    
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const options = {
        cwd: path.join(__dirname, 'dashboard'),
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }
    };

    try {
        dashboardProcess = spawn(npmCmd, ['run', 'start'], options);

        dashboardProcess.on('error', (err) => {
            log.error(`Failed to start dashboard: ${err.message}`);
            dashboardProcess = null;
        });

        dashboardProcess.on('exit', (code) => {
            if (code !== null) {
                log.info(`Dashboard process exited with code ${code}`);
            }
            dashboardProcess = null;
        });

        // Add specific error handling for common issues
        dashboardProcess.on('spawn', () => {
            log.success('Dashboard started successfully');
        });
    } catch (err) {
        log.error(`Failed to spawn dashboard process: ${err.message}`);
        dashboardProcess = null;
    }
}

// Stop processes
function stopAll() {
    if (proxyProcess) {
        log.info('Stopping proxy...');
        // On Windows, we need to kill the entire process tree
        if (process.platform === 'win32') {
            spawn('taskkill', ['/F', '/T', '/PID', proxyProcess.pid.toString()], {
                stdio: 'ignore'
            });
        } else {
            proxyProcess.kill('SIGTERM');
        }
        proxyProcess = null;
    }

    if (dashboardProcess) {
        log.info('Stopping dashboard...');
        if (process.platform === 'win32') {
            spawn('taskkill', ['/F', '/T', '/PID', dashboardProcess.pid.toString()], {
                stdio: 'ignore'
            });
        } else {
            dashboardProcess.kill('SIGTERM');
        }
        dashboardProcess = null;
    }
}

// Handle process termination
process.on('SIGINT', () => {
    stopAll();
    process.exit();
});

process.on('SIGTERM', () => {
    stopAll();
    process.exit();
});

// Function to open URL in default browser
function openBrowser(url) {
    const command = process.platform === 'win32' ? 'start' : 
                   process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${command} ${url}`);
}

// Interactive menu
function showMenu() {
    // ANSI escape codes for cursor control
    const CLEAR_SCREEN = '\x1B[2J\x1B[0f';
    const CLEAR_LINE = '\x1B[2K';
    const MOVE_UP = '\x1B[1A';
    const CURSOR_HOME = '\x1B[0;0H';

    let lastStatus = {
        proxy: false,
        dashboard: false
    };

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    function updateStatus() {
        const currentStatus = {
            proxy: proxyProcess !== null,
            dashboard: dashboardProcess !== null
        };

        // Only update if status has changed
        if (lastStatus.proxy !== currentStatus.proxy || lastStatus.dashboard !== currentStatus.dashboard) {
            // Move cursor to status line position
            process.stdout.write('\x1B[3;0H');  // Move to line 3
            process.stdout.write(CLEAR_LINE);
            console.log(`  Proxy    : ${currentStatus.proxy ? chalk.green('Running') : chalk.red('Stopped')}`);
            process.stdout.write(CLEAR_LINE);
            console.log(`  Dashboard: ${currentStatus.dashboard ? chalk.green('Running') : chalk.red('Stopped')}`);
            
            // Return cursor to input position
            process.stdout.write('\x1B[14;0H');  // Move to line 14 (after menu options)
            
            lastStatus = { ...currentStatus };
        }
    }

    function displayMenu() {
        process.stdout.write(CLEAR_SCREEN);
        console.log(chalk.cyan.bold('=== Power Portal Proxy Menu ==='));
        console.log('');
        console.log(chalk.yellow('Components:'));
        console.log(`  Proxy    : ${proxyProcess ? chalk.green('Running') : chalk.red('Stopped')}`);
        console.log(`  Dashboard: ${dashboardProcess ? chalk.green('Running') : chalk.red('Stopped')}`);
        console.log('');
        console.log(chalk.yellow('Commands:'));
        console.log('  1) Start Proxy');
        console.log('  2) Stop Proxy');
        console.log('  3) Start Dashboard (Dev Mode)');
        console.log('  4) Stop Dashboard');
        console.log('  5) Open Dashboard in Browser');
        console.log('  6) Start Both');
        console.log('  7) Stop Both');
        console.log('  8) Rebuild Dashboard');
        console.log('  q) Quit');
        console.log('');
    }

    async function handleCommand(command) {
        try {
            switch(command.toLowerCase()) {
                case '1':
                    startProxy();
                    break;
                case '2':
                    if (proxyProcess) {
                        stopProcess(proxyProcess);
                        proxyProcess = null;
                    }
                    break;
                case '3':
                    startDashboardDev();
                    break;
                case '4':
                    if (dashboardProcess) {
                        stopProcess(dashboardProcess);
                        dashboardProcess = null;
                    }
                    break;
                case '5':
                    openBrowser('http://localhost:3000');
                    break;
                case '6':
                    startProxy();
                    startDashboardDev();
                    break;
                case '7':
                    stopAll();
                    break;
                case '8':
                    await buildDashboard();
                    break;
                case 'q':
                    stopAll();
                    rl.close();
                    process.exit(0);
                    break;
                default:
                    process.stdout.write(CLEAR_LINE);
                    console.log(chalk.red('Invalid command'));
            }
        } catch (err) {
            process.stdout.write(CLEAR_LINE);
            console.log(chalk.red(`Error: ${err.message}`));
        }

        updateStatus();
    }

    // Set up periodic status updates
    const statusInterval = setInterval(updateStatus, 1000);

    // Clean up on exit
    rl.on('close', () => {
        clearInterval(statusInterval);
        stopAll();
        process.exit(0);
    });

    // Initial display
    displayMenu();

    // Start input loop
    rl.on('line', handleCommand);

    // Update process handlers to trigger status updates
    const originalProxyStart = startProxy;
    startProxy = function() {
        originalProxyStart();
        updateStatus();
    };

    const originalDashboardStart = startDashboardDev;
    startDashboardDev = function() {
        originalDashboardStart();
        updateStatus();
    };
}

// Set up CLI commands
program
    .name('start')
    .description('CLI to manage Power Portal Proxy and Dashboard')
    .version('1.0.0');

program
    .command('start')
    .description('Start both proxy and dashboard')
    .option('-d, --dev', 'Start dashboard in development mode')
    .option('-p, --proxy-only', 'Start proxy only')
    .option('-w, --dashboard-only', 'Start dashboard only')
    .action(async (options) => {
        try {
            // Install dependencies
            await installDeps();

            if (!options.dashboardOnly) {
                // Start proxy
                startProxy();
            }

            if (!options.proxyOnly) {
                if (options.dev) {
                    // Start dashboard in dev mode
                    startDashboardDev();
                } else {
                    // Build and start proxy (which includes production dashboard)
                    await buildDashboard();
                    if (options.dashboardOnly) {
                        // If dashboard only, start it separately
                        startDashboardDev();
                    }
                }
            }
        } catch (error) {
            log.error(`Failed to start: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('stop')
    .description('Stop all running processes')
    .action(() => {
        stopAll();
    });

program
    .command('build')
    .description('Build the dashboard')
    .action(async () => {
        try {
            await installDeps();
            await buildDashboard();
            log.success('Build completed successfully');
        } catch (error) {
            log.error(`Build failed: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('menu')
    .description('Start the interactive coordinator menu')
    .action(() => {
        showMenu();
    });

program.parse();
