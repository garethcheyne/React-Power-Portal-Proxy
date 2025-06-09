@echo off
echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install dependencies
    pause
    exit /b %ERRORLEVEL%
)

echo Starting menu...
node cli.js menu
