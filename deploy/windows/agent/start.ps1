# Nebula Model Agent - Windows Startup Script
# Run this script to start the model agent service on port 9765

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "install", "status")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$AgentDir = $PSScriptRoot
$NodePath = "node"
$Port = 9765
$ServiceName = "NebulaModelAgent"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "OK" { "Green" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Test-NodeInstalled {
    try {
        $version = & node --version 2>$null
        if ($version) {
            Write-Log "Node.js version: $version" "OK"
            return $true
        }
    } catch {}
    return $false
}

function Install-Dependencies {
    Write-Log "Installing dependencies..."
    Push-Location $AgentDir
    try {
        & npm install --production
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Dependencies installed successfully" "OK"
        } else {
            Write-Log "npm install failed" "ERROR"
            exit 1
        }
    } finally {
        Pop-Location
    }
}

function Get-AgentProcess {
    Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -like "*server.js*" -and $_.CommandLine -like "*nebula*"
    }
}

function Start-Agent {
    Write-Log "Starting Nebula Model Agent..."

    if (-not (Test-NodeInstalled)) {
        Write-Log "Node.js is not installed or not in PATH" "ERROR"
        exit 1
    }

    $existingProcess = Get-AgentProcess
    if ($existingProcess) {
        Write-Log "Agent already running (PID: $($existingProcess.ProcessId))" "WARN"
        return
    }

    $nodeModules = Join-Path $AgentDir "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Install-Dependencies
    }

    if (-not $env:NEBULA_AGENT_TOKEN) {
        Write-Log "NEBULA_AGENT_TOKEN not set - API will be open (NOT RECOMMENDED)" "WARN"
    }

    $serverScript = Join-Path $AgentDir "server.js"
    
    $env:AGENT_PORT = $Port

    $logDir = "C:\ProgramData\NebulaCommand\logs"
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    $logFile = Join-Path $logDir "model-agent.log"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "node"
    $psi.Arguments = "`"$serverScript`""
    $psi.WorkingDirectory = $AgentDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.EnvironmentVariables["AGENT_PORT"] = "$Port"
    if ($env:NEBULA_AGENT_TOKEN) {
        $psi.EnvironmentVariables["NEBULA_AGENT_TOKEN"] = $env:NEBULA_AGENT_TOKEN
    }

    try {
        $process = [System.Diagnostics.Process]::Start($psi)
        
        Start-Sleep -Seconds 2

        if (-not $process.HasExited) {
            Write-Log "Agent started successfully (PID: $($process.Id))" "OK"
            Write-Log "Listening on http://0.0.0.0:$Port" "OK"
            Write-Log "Log file: $logFile" "INFO"

            $job = Start-Job -ScriptBlock {
                param($proc, $logPath)
                while (-not $proc.HasExited) {
                    $output = $proc.StandardOutput.ReadLine()
                    if ($output) {
                        Add-Content -Path $logPath -Value $output
                    }
                }
            } -ArgumentList $process, $logFile
        } else {
            $stderr = $process.StandardError.ReadToEnd()
            Write-Log "Agent failed to start: $stderr" "ERROR"
            exit 1
        }
    } catch {
        Write-Log "Failed to start agent: $_" "ERROR"
        exit 1
    }
}

function Stop-Agent {
    Write-Log "Stopping Nebula Model Agent..."
    
    $processes = Get-AgentProcess
    if (-not $processes) {
        Write-Log "Agent is not running" "WARN"
        return
    }

    foreach ($proc in $processes) {
        try {
            Stop-Process -Id $proc.ProcessId -Force
            Write-Log "Stopped process $($proc.ProcessId)" "OK"
        } catch {
            Write-Log "Failed to stop process $($proc.ProcessId): $_" "ERROR"
        }
    }
}

function Get-AgentStatus {
    Write-Log "Checking Nebula Model Agent status..."

    $processes = Get-AgentProcess
    if ($processes) {
        foreach ($proc in $processes) {
            Write-Log "Agent running (PID: $($proc.ProcessId))" "OK"
        }

        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            $health = $response.Content | ConvertFrom-Json
            Write-Log "API Status: $($health.status)" "OK"
            Write-Log "Uptime: $($health.uptime_seconds) seconds" "INFO"
        } catch {
            Write-Log "API not responding: $_" "WARN"
        }
    } else {
        Write-Log "Agent is not running" "WARN"
    }
}

function Install-AsTask {
    Write-Log "Installing Nebula Model Agent as scheduled task..."

    $scriptPath = Join-Path $AgentDir "start.ps1"
    
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`" start"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    try {
        Register-ScheduledTask -TaskName $ServiceName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
        Write-Log "Scheduled task '$ServiceName' installed successfully" "OK"
        Write-Log "Agent will start automatically on boot" "INFO"
    } catch {
        Write-Log "Failed to install scheduled task: $_" "ERROR"
        Write-Log "Run this script as Administrator" "WARN"
    }
}

switch ($Action) {
    "start" { Start-Agent }
    "stop" { Stop-Agent }
    "install" { Install-AsTask }
    "status" { Get-AgentStatus }
}
