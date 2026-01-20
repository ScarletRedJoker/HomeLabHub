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
    # A1111 is primary (stable), Forge is secondary (has dependency issues)
    StableDiffusionPath = "C:\AI\stable-diffusion-webui"
    StableDiffusionForgePath = "C:\AI\stable-diffusion-webui-forge"
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
    $logLine = "[$timestamp] [$Level] $Message"
    Write-Host $logLine -ForegroundColor $color
    
    $logFile = Join-Path $Script:Config.LogDir "nebula-ai-stack.log"
    Add-Content -Path $logFile -Value $logLine -ErrorAction SilentlyContinue
}

function Initialize-Environment {
    @("C:\ProgramData\NebulaCommand", $Script:Config.LogDir, "C:\AI") | ForEach-Object {
        if (-not (Test-Path $_)) {
            New-Item -ItemType Directory -Path $_ -Force | Out-Null
        }
    }
    
    $logFile = Join-Path $Script:Config.LogDir "nebula-ai-stack.log"
    if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 5MB)) {
        $backup = Join-Path $Script:Config.LogDir "nebula-ai-stack.log.old"
        Move-Item $logFile $backup -Force -ErrorAction SilentlyContinue
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
        $tcp = New-Object System.Net.Sockets.TcpClient
        $async = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $async.AsyncWaitHandle.WaitOne(3000, $false)
        if ($wait) {
            try {
                $tcp.EndConnect($async)
                $connected = $tcp.Connected
                $tcp.Close()
                if ($connected) { return $true }
            } catch {
                $tcp.Close()
            }
        } else {
            $tcp.Close()
        }
    } catch { }
    
    try {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listener) { return $true }
    } catch { }
    
    return $false
}

function Start-Ollama {
    Write-Log "Starting Ollama..." "INFO"
    if (Test-ServiceRunning -Port 11434) {
        Write-Log "Ollama already running on port 11434" "OK"
        return $true
    }
    $env:OLLAMA_HOST = "0.0.0.0"
    $ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
    if (-not $ollama) { $ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" }
    if (Test-Path $ollama) {
        $logFile = Join-Path $Script:Config.LogDir "ollama.log"
        Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
        Start-Sleep -Seconds 3
        if (Test-ServiceRunning -Port 11434) {
            Write-Log "Ollama started successfully" "OK"
            return $true
        } else {
            Write-Log "Ollama failed to start - check $logFile" "ERROR"
            return $false
        }
    } else {
        Write-Log "Ollama not found at $ollama" "WARN"
        return $false
    }
}

function Test-SDVenvHealth {
    param([string]$SDPath)
    $venvPython = Join-Path $SDPath "venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        return $false
    }
    try {
        $result = & $venvPython -c "import torch; import numpy; print('ok')" 2>&1
        if ($result -match "ok") {
            return $true
        }
    } catch { }
    return $false
}

function Repair-SDDependencies {
    param([string]$SDPath)
    Write-Log "Repairing SD dependencies at $SDPath..." "INFO"
    $venvPip = Join-Path $SDPath "venv\Scripts\pip.exe"
    if (-not (Test-Path $venvPip)) {
        Write-Log "No venv found - will be created on first launch" "WARN"
        return $false
    }
    try {
        & $venvPip install "numpy<2" --quiet 2>&1 | Out-Null
        & $venvPip install "protobuf==4.25.3" --quiet 2>&1 | Out-Null
        & $venvPip install "opencv-python-headless<4.10" --quiet 2>&1 | Out-Null
        Write-Log "Dependencies repaired" "OK"
        return $true
    } catch {
        Write-Log "Failed to repair dependencies: $_" "ERROR"
        return $false
    }
}

function Start-StableDiffusion {
    Write-Log "Starting Stable Diffusion..." "INFO"
    if (Test-ServiceRunning -Port 7860) {
        Write-Log "Stable Diffusion already running on port 7860" "OK"
        return $true
    }
    
    $sdPath = $null
    $a1111Path = $Script:Config.StableDiffusionPath
    $forgePath = $Script:Config.StableDiffusionForgePath
    
    if (Test-Path $a1111Path) {
        if (Test-SDVenvHealth -SDPath $a1111Path) {
            Write-Log "Using A1111 WebUI (healthy venv)" "OK"
            $sdPath = $a1111Path
        } else {
            Write-Log "A1111 venv needs repair, attempting..." "WARN"
            Repair-SDDependencies -SDPath $a1111Path
            $sdPath = $a1111Path
        }
    }
    
    if (-not $sdPath -and (Test-Path $forgePath)) {
        if (Test-SDVenvHealth -SDPath $forgePath) {
            Write-Log "Using Forge WebUI (healthy venv)" "OK"
            $sdPath = $forgePath
        } else {
            Write-Log "Forge venv unhealthy, attempting repair..." "WARN"
            if (Repair-SDDependencies -SDPath $forgePath) {
                if (Test-SDVenvHealth -SDPath $forgePath) {
                    Write-Log "Forge repaired successfully" "OK"
                    $sdPath = $forgePath
                }
            }
            if (-not $sdPath -and (Test-Path $a1111Path)) {
                Write-Log "Forge repair failed, falling back to A1111" "WARN"
                $sdPath = $a1111Path
            } elseif (-not $sdPath) {
                Write-Log "Forge repair failed, no A1111 fallback available" "ERROR"
                $sdPath = $forgePath
            }
        }
    }
    
    if ($sdPath) {
        $webui = Join-Path $sdPath "webui-user.bat"
        if (-not (Test-Path $webui)) { $webui = Join-Path $sdPath "webui.bat" }
        Push-Location $sdPath
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $webui -WindowStyle Minimized
        Pop-Location
        Write-Log "Stable Diffusion launch initiated from $sdPath (takes 30-60s to load models)" "OK"
        return $true
    } else {
        Write-Log "Stable Diffusion not found at expected paths" "WARN"
        return $false
    }
}

function Start-ComfyUI {
    param([string]$PythonPath)
    Write-Log "Starting ComfyUI..." "INFO"
    if (Test-ServiceRunning -Port 8188) {
        Write-Log "ComfyUI already running on port 8188" "OK"
        return $true
    }
    
    $comfy = $Script:Config.ComfyUIPath
    if (-not (Test-Path $comfy)) {
        Write-Log "ComfyUI not found at $comfy" "ERROR"
        return $false
    }
    
    $comfyVenv = Join-Path $comfy "venv\Scripts\python.exe"
    $comfyActivate = Join-Path $comfy "venv\Scripts\activate.bat"
    
    if (-not (Test-Path $comfyVenv)) {
        Write-Log "ComfyUI venv not found - creating..." "WARN"
        Push-Location $comfy
        & python -m venv venv
        if (Test-Path $comfyVenv) {
            Write-Log "Created ComfyUI venv" "OK"
            & $comfyVenv -m pip install --upgrade pip 2>&1 | Out-Null
            & $comfyVenv -m pip install -r requirements.txt 2>&1 | Out-Null
            & $comfyVenv -m pip install torch==2.1.2+cu121 torchvision==0.16.2+cu121 --index-url https://download.pytorch.org/whl/cu121 2>&1 | Out-Null
        } else {
            Write-Log "Failed to create ComfyUI venv" "ERROR"
            Pop-Location
            return $false
        }
        Pop-Location
    }
    
    $logFile = Join-Path $Script:Config.LogDir "comfyui.log"
    $errFile = Join-Path $Script:Config.LogDir "comfyui-error.log"
    
    Write-Log "Launching ComfyUI with logging to $logFile" "INFO"
    
    Push-Location $comfy
    Start-Process -FilePath $comfyVenv -ArgumentList "main.py", "--listen", "0.0.0.0", "--port", "8188" -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $errFile
    Pop-Location
    
    Write-Log "ComfyUI launch initiated - waiting for port 8188..." "INFO"
    
    for ($i = 1; $i -le 12; $i++) {
        Start-Sleep -Seconds 5
        if (Test-ServiceRunning -Port 8188) {
            Write-Log "ComfyUI started successfully!" "OK"
            return $true
        }
        Write-Host "  Waiting for ComfyUI ($i/12)..." -ForegroundColor Gray
    }
    
    Write-Log "ComfyUI failed to start within 60 seconds" "ERROR"
    Write-Log "Check error log: $errFile" "ERROR"
    if (Test-Path $errFile) {
        $errors = Get-Content $errFile -Tail 20 -ErrorAction SilentlyContinue
        if ($errors) {
            Write-Log "Last errors:" "ERROR"
            $errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        }
    }
    return $false
}

function Start-NebulaAgent {
    Write-Log "Starting Nebula Agent..." "INFO"
    if (Test-ServiceRunning -Port 9765) {
        Write-Log "Agent already running on port 9765" "OK"
        return $true
    }
    $agent = $Script:Config.AgentPath
    $server = Join-Path $agent "server.js"
    if (Test-Path $server) {
        $env:AGENT_PORT = "9765"
        $logFile = Join-Path $Script:Config.LogDir "nebula-agent.log"
        Push-Location $agent
        Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
        Pop-Location
        Start-Sleep -Seconds 2
        if (Test-ServiceRunning -Port 9765) {
            Write-Log "Agent started on port 9765" "OK"
            return $true
        } else {
            Write-Log "Agent failed to start - check $logFile" "ERROR"
            return $false
        }
    } else {
        Write-Log "Agent not found at $server" "WARN"
        return $false
    }
}

function Stop-AllServices {
    Write-Log "Stopping all AI services..." "STEP"
    
    Get-Process -Name "ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    
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
    
    Get-CimInstance Win32_Process | Where-Object { 
        $_.Name -eq "cmd.exe" -and $_.CommandLine -like "*webui*"
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    
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
    $results = @{}
    foreach ($svc in $Script:Config.Services) {
        $running = Test-ServiceRunning -Port $svc.Port
        $sym = if ($running) { "[OK]" } else { "[--]" }
        $col = if ($running) { "Green" } else { "Red" }
        Write-Host "  $sym $($svc.Name): http://localhost:$($svc.Port)" -ForegroundColor $col
        $results[$svc.Key] = $running
    }
    Write-Host ""
    
    $state = @{
        timestamp = (Get-Date).ToString("o")
        services = $results
    }
    $state | ConvertTo-Json | Set-Content -Path $Script:Config.StateFile -Force -ErrorAction SilentlyContinue
    
    return $results
}

function Main {
    Initialize-Environment
    Write-Host ""
    Write-Host "=== Nebula Command AI Stack ===" -ForegroundColor Cyan
    Write-Log "Action: $Action" "INFO"
    Write-Host ""
    
    switch ($Action) {
        "start" {
            if ($Force) {
                Write-Log "Force flag set - stopping all services first..." "STEP"
                Stop-AllServices
            }
            
            $py = Test-PythonVersion
            if (-not $py -and -not $SkipValidation) { 
                Write-Log "No valid Python found. Exiting." "ERROR"
                exit 1 
            }
            $pyPath = if ($py) { $py.Path } else { "python" }
            
            $ollamaOk = Start-Ollama
            Start-Sleep -Seconds 2
            
            $sdOk = Start-StableDiffusion
            Start-Sleep -Seconds 3
            
            $comfyOk = Start-ComfyUI -PythonPath $pyPath
            Start-Sleep -Seconds 2
            
            $agentOk = Start-NebulaAgent
            
            Write-Host ""
            Write-Log "Startup complete!" "OK"
            
            $status = Get-StackStatus
            
            $upCount = ($status.Values | Where-Object { $_ -eq $true }).Count
            Write-Log "Services online: $upCount/4" "INFO"
            
            if ($upCount -lt 4) {
                Write-Log "Some services failed - check logs in $($Script:Config.LogDir)" "WARN"
            }
        }
        "stop" { 
            Stop-AllServices 
        }
        "status" { 
            Get-StackStatus | Out-Null
        }
        "repair" {
            Write-Log "Running repairs..." "STEP"
            
            $comfyVenv = "C:\AI\ComfyUI\venv\Scripts\python.exe"
            if (Test-Path $comfyVenv) {
                Write-Log "Repairing ComfyUI dependencies..." "INFO"
                & $comfyVenv -m pip install numpy==1.26.4 opencv-python==4.10.0.84 av ffmpeg-python --quiet 2>&1 | Out-Null
                Write-Log "ComfyUI repair complete" "OK"
            }
            
            $sdPaths = @(
                "C:\AI\stable-diffusion-webui-forge\venv\Scripts\python.exe",
                "C:\AI\stable-diffusion-webui\venv\Scripts\python.exe"
            )
            foreach ($sdVenv in $sdPaths) {
                if (Test-Path $sdVenv) {
                    Write-Log "Repairing SD at $sdVenv..." "INFO"
                    & $sdVenv -m pip install numpy==1.26.4 protobuf==3.20.3 --quiet 2>&1 | Out-Null
                    Write-Log "SD repair complete" "OK"
                    break
                }
            }
            
            Write-Log "All repairs complete" "OK"
        }
        "validate" { 
            Test-PythonVersion | Out-Null 
        }
        "install" {
            Write-Log "Installing scheduled task..." "STEP"
            $sp = $PSCommandPath
            $act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$sp`" start -SkipValidation"
            $trg = New-ScheduledTaskTrigger -AtStartup
            $stg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
            $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
            Register-ScheduledTask -TaskName "NebulaAI" -Action $act -Trigger $trg -Settings $stg -Principal $principal -Force | Out-Null
            Write-Log "Task installed - AI stack will auto-start on boot" "OK"
            Write-Log "Logs will be written to $($Script:Config.LogDir)" "INFO"
        }
    }
}

Main
