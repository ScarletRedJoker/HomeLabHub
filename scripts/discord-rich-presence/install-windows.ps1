# Nebula Command - Discord Rich Presence Windows Installer
# Creates a startup task that runs the presence daemon automatically

param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$TaskName = "NebulaDiscordPresence"
$InstallPath = "$env:LOCALAPPDATA\NebulaCommand\DiscordPresence"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Nebula Command - Discord Rich Presence Installer    ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if ($Uninstall) {
    Write-Host "Uninstalling..." -ForegroundColor Yellow
    
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "✓ Removed scheduled task" -ForegroundColor Green
    }
    
    if (Test-Path $InstallPath) {
        Remove-Item -Path $InstallPath -Recurse -Force
        Write-Host "✓ Removed installation files" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "Uninstall complete!" -ForegroundColor Green
    exit 0
}

# Check for Node.js
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "ERROR: Node.js is not installed" -ForegroundColor Red
    Write-Host "Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green

# Create installation directory
if (-not (Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}
Write-Host "✓ Installation path: $InstallPath" -ForegroundColor Green

# Copy files
Copy-Item -Path ".\nebula-presence.js" -Destination $InstallPath -Force
Copy-Item -Path ".\package.json" -Destination $InstallPath -Force

# Create .env file if it doesn't exist
$envPath = "$InstallPath\.env"
if (-not (Test-Path $envPath)) {
    Write-Host ""
    Write-Host "Configuration required:" -ForegroundColor Yellow
    
    $dashboardUrl = Read-Host "Dashboard URL (default: https://dash.evindrake.net)"
    if (-not $dashboardUrl) { $dashboardUrl = "https://dash.evindrake.net" }
    
    $discordClientId = Read-Host "Discord Application ID (from discord.com/developers)"
    if (-not $discordClientId) {
        Write-Host "ERROR: Discord Application ID is required" -ForegroundColor Red
        exit 1
    }
    
    $apiKey = Read-Host "Presence API Key (optional, press Enter to skip)"
    
    $envContent = @"
DASHBOARD_URL=$dashboardUrl
DISCORD_CLIENT_ID=$discordClientId
PRESENCE_API_KEY=$apiKey
POLL_INTERVAL=15000
USE_CUSTOM_ASSETS=false
"@
    Set-Content -Path $envPath -Value $envContent
    Write-Host "✓ Created configuration file" -ForegroundColor Green
}

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan
Push-Location $InstallPath
npm install --production 2>&1 | Out-Null
Pop-Location
Write-Host "✓ Dependencies installed" -ForegroundColor Green

# Create startup batch file
$batchPath = "$InstallPath\start-presence.bat"
$batchContent = @"
@echo off
cd /d "$InstallPath"
node nebula-presence.js
pause
"@
Set-Content -Path $batchPath -Value $batchContent

# Create hidden VBS launcher
$vbsPath = "$InstallPath\start-presence-hidden.vbs"
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "$batchPath" & chr(34), 0
Set WshShell = Nothing
"@
Set-Content -Path $vbsPath -Value $vbsContent

# Create scheduled task for startup
Write-Host ""
Write-Host "Setting up auto-start..." -ForegroundColor Cyan

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Write-Host "✓ Auto-start enabled" -ForegroundColor Green

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "The presence daemon will start automatically when you log in."
Write-Host ""
Write-Host "To start now, run:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
Write-Host ""
Write-Host "Or double-click: $batchPath" -ForegroundColor White
Write-Host ""
Write-Host "To uninstall later:" -ForegroundColor Yellow
Write-Host "  .\install-windows.ps1 -Uninstall" -ForegroundColor White
Write-Host ""

# Offer to start now
$startNow = Read-Host "Start the presence daemon now? (Y/n)"
if ($startNow -ne 'n' -and $startNow -ne 'N') {
    Write-Host ""
    Write-Host "Starting presence daemon..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "✓ Started! Check your Discord profile." -ForegroundColor Green
}
