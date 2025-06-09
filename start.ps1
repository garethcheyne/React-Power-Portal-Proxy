# Check if Node.js is installed
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed or not in PATH" -ForegroundColor Red
    Exit 1
}

# Check if npm is installed
if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm is not installed or not in PATH" -ForegroundColor Red
    Exit 1
}

Write-Host "Installing dependencies..." -ForegroundColor Blue
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    Pause
    Exit $LASTEXITCODE
}

Write-Host "Starting menu..." -ForegroundColor Green
node cli.js menu
    Exit $LASTEXITCODE
}

Write-Host "Starting menu..." -ForegroundColor Green
node cli.js menu
