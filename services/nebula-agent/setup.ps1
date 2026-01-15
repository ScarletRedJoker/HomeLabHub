# Nebula Agent Setup Script for Windows
# Run this script in PowerShell as Administrator

param(
    [string]$AgentToken = "",
    [int]$AgentPort = 9765
)

Write-Host "╔════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Nebula Agent Setup Script               ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Please run this script as Administrator!" -ForegroundColor Red
    exit 1
}

# Check Node.js
Write-Host "`n[1/6] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  Node.js $nodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "  Node.js not found! Please install Node.js 18+ first." -ForegroundColor Red
    Write-Host "  Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check PM2
Write-Host "`n[2/6] Checking PM2..." -ForegroundColor Yellow
try {
    $pm2Version = pm2 --version
    Write-Host "  PM2 $pm2Version found" -ForegroundColor Green
} catch {
    Write-Host "  PM2 not found, installing globally..." -ForegroundColor Yellow
    npm install -g pm2
}

# Install dependencies
Write-Host "`n[3/6] Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Failed to install dependencies!" -ForegroundColor Red
    exit 1
}
Write-Host "  Dependencies installed" -ForegroundColor Green

# Build TypeScript
Write-Host "`n[4/6] Building TypeScript..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Failed to build!" -ForegroundColor Red
    exit 1
}
Write-Host "  Build complete" -ForegroundColor Green

# Set environment variables
Write-Host "`n[5/6] Configuring environment..." -ForegroundColor Yellow
if ($AgentToken -eq "") {
    $AgentToken = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    Write-Host "  Generated new agent token" -ForegroundColor Yellow
}

[System.Environment]::SetEnvironmentVariable("NEBULA_AGENT_TOKEN", $AgentToken, "Machine")
[System.Environment]::SetEnvironmentVariable("AGENT_PORT", $AgentPort.ToString(), "Machine")
Write-Host "  Environment variables set (system-wide)" -ForegroundColor Green

# Configure firewall
Write-Host "`n[6/6] Configuring firewall..." -ForegroundColor Yellow
$existingRule = Get-NetFirewallRule -DisplayName "Nebula Agent" -ErrorAction SilentlyContinue
if ($existingRule) {
    Remove-NetFirewallRule -DisplayName "Nebula Agent"
}
New-NetFirewallRule -DisplayName "Nebula Agent" -Direction Inbound -LocalPort $AgentPort -Protocol TCP -Action Allow | Out-Null
Write-Host "  Firewall rule created for port $AgentPort" -ForegroundColor Green

# Start with PM2
Write-Host "`n Starting Nebula Agent..." -ForegroundColor Cyan
$env:NEBULA_AGENT_TOKEN = $AgentToken
$env:AGENT_PORT = $AgentPort
pm2 delete nebula-agent 2>$null
pm2 start dist/index.js --name nebula-agent
pm2 save

Write-Host "`n╔════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║        Nebula Agent Setup Complete!            ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Agent is running on: http://0.0.0.0:$AgentPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: Save this token for your dashboard configuration:" -ForegroundColor Yellow
Write-Host "  NEBULA_AGENT_TOKEN = $AgentToken" -ForegroundColor White
Write-Host ""
Write-Host "To auto-start on boot, run: pm2 startup" -ForegroundColor Yellow
