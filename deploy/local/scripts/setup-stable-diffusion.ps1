#!/usr/bin/env pwsh
# Stable Diffusion WebUI (AUTOMATIC1111) Setup Script for Windows VM
# Run as Administrator on Windows VM (100.118.44.102)
# GPU: RTX 3060 (12GB VRAM)

param(
    [switch]$Install,
    [switch]$Start,
    [switch]$Stop,
    [switch]$Status,
    [switch]$Update
)

$SD_DIR = "C:\StableDiffusion"
$WEBUI_DIR = "$SD_DIR\stable-diffusion-webui"
$PYTHON_VERSION = "3.10.11"
$PORT = 7860

function Write-Step {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Test-SDInstalled {
    return (Test-Path "$WEBUI_DIR\webui-user.bat")
}

function Test-SDRunning {
    $process = Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*launch.py*" -or $_.MainWindowTitle -like "*Stable Diffusion*"
    }
    return $null -ne $process
}

function Install-StableDiffusion {
    Write-Step "Installing Stable Diffusion WebUI (AUTOMATIC1111)"
    
    # Check for Python
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        Write-Host "Python not found. Installing Python $PYTHON_VERSION..." -ForegroundColor Yellow
        
        # Download Python installer
        $pythonUrl = "https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-amd64.exe"
        $pythonInstaller = "$env:TEMP\python-installer.exe"
        Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonInstaller
        
        # Install Python silently
        Start-Process -FilePath $pythonInstaller -ArgumentList "/quiet", "InstallAllUsers=1", "PrependPath=1", "Include_test=0" -Wait
        
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }
    
    # Check for Git
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        Write-Host "Git not found. Please install Git for Windows first:" -ForegroundColor Red
        Write-Host "  https://git-scm.com/download/win" -ForegroundColor Yellow
        exit 1
    }
    
    # Create directory
    if (-not (Test-Path $SD_DIR)) {
        New-Item -ItemType Directory -Path $SD_DIR -Force | Out-Null
    }
    
    # Clone AUTOMATIC1111 WebUI
    if (-not (Test-Path $WEBUI_DIR)) {
        Write-Step "Cloning Stable Diffusion WebUI repository"
        Set-Location $SD_DIR
        git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
    }
    
    # Configure webui-user.bat for API access and optimal settings
    Write-Step "Configuring WebUI for API access"
    $webuiConfig = @"
@echo off
set PYTHON=
set GIT=
set VENV_DIR=
set COMMANDLINE_ARGS=--api --listen --port $PORT --xformers --no-half-vae --enable-insecure-extension-access
"@
    Set-Content -Path "$WEBUI_DIR\webui-user.bat" -Value $webuiConfig
    
    # Create startup script
    $startupScript = @"
@echo off
cd /d "$WEBUI_DIR"
call webui-user.bat
call webui.bat
"@
    Set-Content -Path "$SD_DIR\start-sd.bat" -Value $startupScript
    
    # Create Windows service wrapper (optional - for auto-start)
    $serviceScript = @"
`$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$SD_DIR\start-sd.bat`""
`$trigger = New-ScheduledTaskTrigger -AtStartup
`$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
`$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "StableDiffusionWebUI" -Action `$action -Trigger `$trigger -Principal `$principal -Settings `$settings -Force
"@
    Set-Content -Path "$SD_DIR\install-service.ps1" -Value $serviceScript
    
    Write-Step "Installation complete!"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Green
    Write-Host "  1. Run: .\setup-stable-diffusion.ps1 -Start" -ForegroundColor Yellow
    Write-Host "     (First run will download models - takes 10-30 minutes)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  2. Access WebUI at: http://localhost:$PORT" -ForegroundColor Yellow
    Write-Host "  3. API endpoint: http://100.118.44.102:$PORT/sdapi/v1/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To auto-start on boot, run (as Admin):" -ForegroundColor Cyan
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$SD_DIR\install-service.ps1`"" -ForegroundColor Yellow
}

function Start-StableDiffusion {
    if (Test-SDRunning) {
        Write-Host "Stable Diffusion is already running" -ForegroundColor Yellow
        return
    }
    
    if (-not (Test-SDInstalled)) {
        Write-Host "Stable Diffusion not installed. Run with -Install first." -ForegroundColor Red
        return
    }
    
    Write-Step "Starting Stable Diffusion WebUI"
    Write-Host "Starting on port $PORT..." -ForegroundColor Cyan
    Write-Host "First run will download models (~4GB) - please wait..." -ForegroundColor Yellow
    
    # Start in new window
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$SD_DIR\start-sd.bat`"" -WorkingDirectory $WEBUI_DIR
    
    Write-Host ""
    Write-Host "Stable Diffusion starting in background window." -ForegroundColor Green
    Write-Host "Check status with: .\setup-stable-diffusion.ps1 -Status" -ForegroundColor Yellow
    Write-Host "WebUI will be available at: http://localhost:$PORT" -ForegroundColor Cyan
}

function Stop-StableDiffusion {
    Write-Step "Stopping Stable Diffusion"
    
    $processes = Get-Process -Name "python" -ErrorAction SilentlyContinue
    foreach ($proc in $processes) {
        try {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
            if ($cmdLine -like "*launch.py*" -or $cmdLine -like "*stable-diffusion*") {
                Stop-Process -Id $proc.Id -Force
                Write-Host "Stopped process $($proc.Id)" -ForegroundColor Green
            }
        } catch {
            continue
        }
    }
    
    Write-Host "Stable Diffusion stopped." -ForegroundColor Green
}

function Get-SDStatus {
    Write-Step "Stable Diffusion Status"
    
    $installed = Test-SDInstalled
    $running = $false
    
    Write-Host "Installed: $(if ($installed) { 'Yes' } else { 'No' })" -ForegroundColor $(if ($installed) { 'Green' } else { 'Red' })
    
    if ($installed) {
        # Check if API is responding
        try {
            $response = Invoke-RestMethod -Uri "http://localhost:$PORT/sdapi/v1/sd-models" -TimeoutSec 5 -ErrorAction Stop
            $running = $true
            $modelCount = $response.Count
            Write-Host "Running: Yes (API responding)" -ForegroundColor Green
            Write-Host "Models loaded: $modelCount" -ForegroundColor Cyan
            
            # Get current model
            try {
                $options = Invoke-RestMethod -Uri "http://localhost:$PORT/sdapi/v1/options" -TimeoutSec 5
                Write-Host "Active model: $($options.sd_model_checkpoint)" -ForegroundColor Cyan
            } catch {}
            
        } catch {
            Write-Host "Running: No (API not responding)" -ForegroundColor Red
        }
        
        Write-Host ""
        Write-Host "Endpoints:" -ForegroundColor Yellow
        Write-Host "  Local WebUI:  http://localhost:$PORT" -ForegroundColor White
        Write-Host "  Remote API:   http://100.118.44.102:$PORT/sdapi/v1/" -ForegroundColor White
    }
}

function Update-StableDiffusion {
    if (-not (Test-SDInstalled)) {
        Write-Host "Stable Diffusion not installed." -ForegroundColor Red
        return
    }
    
    if (Test-SDRunning) {
        Write-Host "Please stop Stable Diffusion first: .\setup-stable-diffusion.ps1 -Stop" -ForegroundColor Yellow
        return
    }
    
    Write-Step "Updating Stable Diffusion WebUI"
    Set-Location $WEBUI_DIR
    git pull
    Write-Host "Update complete. Restart with -Start" -ForegroundColor Green
}

# Main
if ($Install) {
    Install-StableDiffusion
} elseif ($Start) {
    Start-StableDiffusion
} elseif ($Stop) {
    Stop-StableDiffusion
} elseif ($Status) {
    Get-SDStatus
} elseif ($Update) {
    Update-StableDiffusion
} else {
    Write-Host "Stable Diffusion WebUI Setup Script" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\setup-stable-diffusion.ps1 -Install   # Install SD WebUI"
    Write-Host "  .\setup-stable-diffusion.ps1 -Start     # Start SD WebUI"
    Write-Host "  .\setup-stable-diffusion.ps1 -Stop      # Stop SD WebUI"
    Write-Host "  .\setup-stable-diffusion.ps1 -Status    # Check status"
    Write-Host "  .\setup-stable-diffusion.ps1 -Update    # Update SD WebUI"
    Write-Host ""
    Get-SDStatus
}
