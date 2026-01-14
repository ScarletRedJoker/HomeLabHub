# Nebula Command - Unified AI Stack Startup
# This script validates dependencies, repairs issues, and starts all AI services
# Run as Administrator: .\Start-NebulaAiStack.ps1

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "status", "repair", "install", "validate")]
    [string]$Action = "start",
    
    [switch]$SkipValidation,
    [switch]$Force
)

$ErrorActionPreference = "Continue"

$Script:Config = @{
    LogDir = "C:\ProgramData\NebulaCommand\logs"
    StateFile = "C:\ProgramData\NebulaCommand\ai-state.json"
    RequiredPythonMajor = 3
    RequiredPythonMinor = 10
    MaxPythonMinor = 12
    Python310Path = "C:\Python310\python.exe"
    ComfyUIPath = "C:\AI\ComfyUI"
    StableDiffusionForgePath = "C:\AI\stable-diffusion-webui-forge"
    StableDiffusionPath = "C:\AI\stable-diffusion-webui"
    AgentPath = "C:\NebulaCommand\deploy\windows\agent"
    Services = @(
        @{ Name = "Ollama"; Key = "ollama"; Port = 11434 }
        @{ Name = "Stable Diffusion"; Key = "sd"; Port = 7860 }
        @{ Name = "ComfyUI"; Key = "comfy"; Port = 8188 }
        @{ Name = "Nebula Agent"; Key = "agent"; Port = 9765 }
    )
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "OK"    { "Green" }
        "STEP"  { "Cyan" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Initialize-Environment {
    @("C:\ProgramData\NebulaCommand", $Script:Config.LogDir, "C:\AI") | ForEach-Object {
        if (-not (Test-Path $_)) {
            New-Item -ItemType Directory -Path $_ -Force | Out-Null
        }
    }
}

function Get-PythonInfo {
    param([string]$PythonPath = "python")
    try {
        $ver = & $PythonPath --version 2>&1
        if ($ver -match "Python (\d+)\.(\d+)\.(\d+)") {
            return @{
                Path = $PythonPath
                Major = [int]$Matches[1]
                Minor = [int]$Matches[2]
                Version = "$($Matches[1]).$($Matches[2]).$($Matches[3])"
                IsValid = $true
            }
        }
    } catch {}
    return @{ IsValid = $false }
}

function Test-PythonVersion {
    Write-Log "Checking Python version..." "STEP"
    $paths = @(
        "python",
        "python3",
        "C:\Python310\python.exe",
        "C:\Python311\python.exe",
        "C:\Python312\python.exe",
        "C:\AI\stable-diffusion-webui-forge\venv\Scripts\python.exe",
        "C:\AI\stable-diffusion-webui\venv\Scripts\python.exe",
        "C:\AI\ComfyUI\venv\Scripts\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
    )
    foreach ($p in $paths) {
        if (-not (Test-Path $p -ErrorAction SilentlyContinue)) { continue }
        $info = Get-PythonInfo -PythonPath $p
        if ($info.IsValid -and $info.Minor -ge 10 -and $info.Minor -le 12) {
            Write-Log "Using Python $($info.Version) at $p" "OK"
            return $info
        }
    }
    Write-Log "No compatible Python 3.10-3.12 found" "ERROR"
    Write-Log "Install Python 3.10 from python.org" "WARN"
    return $null
}

function Test-ServiceRunning {
    param([int]$Port)
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:$Port" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Start-Ollama {
    Write-Log "Starting Ollama..." "INFO"
    if (Test-ServiceRunning -Port 11434) {
        Write-Log "Ollama already running" "OK"
        return
    }
    $env:OLLAMA_HOST = "0.0.0.0"
    $ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
    if (-not $ollama) { $ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" }
    if (Test-Path $ollama) {
        Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
        Write-Log "Ollama started" "OK"
    } else {
        Write-Log "Ollama not found" "WARN"
    }
}

function Start-StableDiffusion {
    Write-Log "Starting Stable Diffusion..." "INFO"
    if (Test-ServiceRunning -Port 7860) {
        Write-Log "Stable Diffusion already running" "OK"
        return
    }
    $sdPath = if (Test-Path $Script:Config.StableDiffusionForgePath) {
        $Script:Config.StableDiffusionForgePath
    } elseif (Test-Path $Script:Config.StableDiffusionPath) {
        $Script:Config.StableDiffusionPath
    } else { $null }
    
    if ($sdPath) {
        $webui = Join-Path $sdPath "webui-user.bat"
        if (-not (Test-Path $webui)) { $webui = Join-Path $sdPath "webui.bat" }
        Push-Location $sdPath
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $webui -WindowStyle Hidden
        Pop-Location
        Write-Log "Stable Diffusion starting..." "OK"
    } else {
        Write-Log "Stable Diffusion not found" "WARN"
    }
}

function Start-ComfyUI {
    param([string]$PythonPath)
    Write-Log "Starting ComfyUI..." "INFO"
    if (Test-ServiceRunning -Port 8188) {
        Write-Log "ComfyUI already running" "OK"
        return
    }
    $comfy = $Script:Config.ComfyUIPath
    if (-not (Test-Path $comfy)) {
        Write-Log "ComfyUI not found at $comfy" "WARN"
        return
    }
    
    # Check for ComfyUI's own venv first
    $comfyVenv = Join-Path $comfy "venv\Scripts\python.exe"
    $pyToUse = if (Test-Path $comfyVenv) { 
        Write-Log "Using ComfyUI venv" "INFO"
        $comfyVenv 
    } else { 
        Write-Log "ComfyUI has no venv - using provided Python" "WARN"
        Write-Log "Run: cd C:\AI\ComfyUI && python -m venv venv" "WARN"
        $PythonPath 
    }
    
    Push-Location $comfy
    Start-Process -FilePath $pyToUse -ArgumentList "main.py", "--listen", "0.0.0.0", "--port", "8188" -WindowStyle Hidden
    Pop-Location
    Write-Log "ComfyUI starting..." "OK"
}

function Start-NebulaAgent {
    Write-Log "Starting Nebula Agent..." "INFO"
    if (Test-ServiceRunning -Port 9765) {
        Write-Log "Agent already running" "OK"
        return
    }
    $agent = $Script:Config.AgentPath
    $server = Join-Path $agent "server.js"
    if (Test-Path $server) {
        $env:AGENT_PORT = "9765"
        Push-Location $agent
        Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden
        Pop-Location
        Write-Log "Agent started on port 9765" "OK"
    } else {
        Write-Log "Agent not found" "WARN"
    }
}

function Stop-AllServices {
    Write-Log "Stopping all AI services..." "STEP"
    
    # Kill Ollama
    Get-Process -Name "ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    
    # Kill Python processes related to AI
    Get-CimInstance Win32_Process | Where-Object { 
        $_.Name -eq "python.exe" -and (
            $_.CommandLine -like "*webui*" -or 
            $_.CommandLine -like "*ComfyUI*" -or 
            $_.CommandLine -like "*stable-diffusion*"
        )
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Log "Killed Python process $($_.ProcessId)" "INFO"
    }
    
    # Kill cmd.exe running webui
    Get-CimInstance Win32_Process | Where-Object { 
        $_.Name -eq "cmd.exe" -and $_.CommandLine -like "*webui*"
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    
    # Kill node agent
    Get-CimInstance Win32_Process | Where-Object { 
        $_.Name -eq "node.exe" -and $_.CommandLine -like "*server.js*"
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Log "Killed Node process $($_.ProcessId)" "INFO"
    }
    
    Start-Sleep -Seconds 2
    Write-Log "Services stopped" "OK"
}

function Get-StackStatus {
    Write-Host ""
    Write-Host "=== Nebula AI Stack Status ===" -ForegroundColor Cyan
    foreach ($svc in $Script:Config.Services) {
        $running = Test-ServiceRunning -Port $svc.Port
        $sym = if ($running) { "[OK]" } else { "[--]" }
        $col = if ($running) { "Green" } else { "Red" }
        Write-Host "  $sym $($svc.Name): http://localhost:$($svc.Port)" -ForegroundColor $col
    }
    Write-Host ""
}

function Main {
    Initialize-Environment
    Write-Host ""
    Write-Host "=== Nebula Command AI Stack ===" -ForegroundColor Cyan
    Write-Host ""
    
    switch ($Action) {
        "start" {
            # First clean up any zombie processes
            Write-Log "Cleaning up zombie processes..." "STEP"
            Stop-AllServices
            
            $py = Test-PythonVersion
            if (-not $py -and -not $SkipValidation) { exit 1 }
            $pyPath = if ($py) { $py.Path } else { "python" }
            
            Start-Ollama
            Start-Sleep -Seconds 3
            Start-StableDiffusion
            Start-Sleep -Seconds 3
            Start-ComfyUI -PythonPath $pyPath
            Start-Sleep -Seconds 3
            Start-NebulaAgent
            
            Write-Log "Startup complete!" "OK"
            Write-Log "Note: SD and ComfyUI take 2-3 min to fully load" "INFO"
            Start-Sleep -Seconds 5
            Get-StackStatus
        }
        "stop" { Stop-AllServices }
        "status" { Get-StackStatus }
        "repair" {
            $py = Test-PythonVersion
            if ($py) {
                Write-Log "Repairing dependencies..." "STEP"
                & $py.Path -m pip install numpy==1.26.4 protobuf==5.28.3 --quiet 2>&1 | Out-Null
                Write-Log "Repair complete" "OK"
            }
        }
        "validate" { Test-PythonVersion | Out-Null }
        "install" {
            Write-Log "Installing scheduled task..." "STEP"
            $sp = $PSCommandPath
            $act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File $sp start -SkipValidation"
            $trg = New-ScheduledTaskTrigger -AtStartup
            Register-ScheduledTask -TaskName "NebulaAI" -Action $act -Trigger $trg -RunLevel Highest -Force | Out-Null
            Write-Log "Task installed - AI stack will auto-start on boot" "OK"
        }
    }
}

Main
