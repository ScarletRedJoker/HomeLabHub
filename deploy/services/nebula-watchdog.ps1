#Requires -Version 5.1
<#
.SYNOPSIS
    Nebula Command Watchdog Service - Monitors all Nebula services and restarts on failure
    Runs as a scheduled task

.PARAMETER ConfigPath
    Path to configuration directory

.PARAMETER CheckInterval
    Interval in seconds between health checks (default: 30)

.PARAMETER MaxRestarts
    Maximum restart attempts before alerting (default: 3)

.PARAMETER WebhookUrl
    Optional webhook URL for alerts

.PARAMETER LogPath
    Path to log directory
#>

param(
    [string]$ConfigPath = $(if ($env:NEBULA_CONFIG_PATH) { $env:NEBULA_CONFIG_PATH } else { "C:\NebulaCommand\config" }),
    [int]$CheckInterval = 30,
    [int]$MaxRestarts = 3,
    [string]$WebhookUrl = "",
    [string]$LogPath = $(if ($env:NEBULA_LOG_PATH) { $env:NEBULA_LOG_PATH } else { "C:\NebulaCommand\logs" })
)

$ErrorActionPreference = "Continue"
$Script:RestartCounts = @{}
$Script:LastRestartTime = @{}
$Script:CooldownMinutes = 5

$Services = @(
    @{ 
        Name = "Ollama"
        Process = "ollama"
        HealthUrl = "http://localhost:11434/api/version"
        StartCommand = "ollama serve"
        Timeout = 10
    },
    @{ 
        Name = "ComfyUI"
        Process = "python"
        ProcessArgs = "main.py"
        HealthUrl = "http://localhost:8188/system_stats"
        WorkingDir = "C:\ProgramData\NebulaCommand\ComfyUI"
        StartCommand = "python main.py --listen 0.0.0.0 --port 8188"
        Timeout = 15
    },
    @{ 
        Name = "StableDiffusion"
        Process = "python"
        ProcessArgs = "launch.py"
        HealthUrl = "http://localhost:7860/sdapi/v1/sd-models"
        WorkingDir = "C:\ProgramData\NebulaCommand\stable-diffusion-webui"
        StartCommand = "python launch.py --api --listen"
        Timeout = 30
    },
    @{
        Name = "NebulaAgent"
        Process = "node"
        ProcessArgs = "health-daemon.js"
        HealthUrl = "http://localhost:3500/health"
        WorkingDir = "C:\ProgramData\NebulaCommand\services"
        StartCommand = "node health-daemon.js"
        Timeout = 10
    }
)

function Write-Log {
    param(
        [string]$Level,
        [string]$Message
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    if (-not (Test-Path $LogPath)) {
        New-Item -ItemType Directory -Path $LogPath -Force | Out-Null
    }
    
    $logFile = Join-Path $LogPath "watchdog-$(Get-Date -Format 'yyyyMMdd').log"
    $logEntry | Out-File -FilePath $logFile -Append -Encoding UTF8
    
    switch ($Level) {
        "INFO" { Write-Host $logEntry -ForegroundColor Cyan }
        "SUCCESS" { Write-Host $logEntry -ForegroundColor Green }
        "WARN" { Write-Host $logEntry -ForegroundColor Yellow }
        "ERROR" { Write-Host $logEntry -ForegroundColor Red }
        default { Write-Host $logEntry }
    }
}

function Test-ServiceHealth {
    param(
        [hashtable]$Service
    )
    
    try {
        $response = Invoke-WebRequest -Uri $Service.HealthUrl -TimeoutSec $Service.Timeout -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Test-ProcessRunning {
    param(
        [hashtable]$Service
    )
    
    $processes = Get-Process -Name $Service.Process -ErrorAction SilentlyContinue
    
    if (-not $processes) {
        return $false
    }
    
    if ($Service.ProcessArgs) {
        foreach ($proc in $processes) {
            try {
                $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
                if ($cmdLine -match [regex]::Escape($Service.ProcessArgs)) {
                    return $true
                }
            } catch {
                continue
            }
        }
        return $false
    }
    
    return $true
}

function Start-ServiceProcess {
    param(
        [hashtable]$Service
    )
    
    Write-Log "INFO" "Starting $($Service.Name)..."
    
    try {
        $startInfo = @{
            FilePath = "cmd.exe"
            ArgumentList = "/c $($Service.StartCommand)"
            WindowStyle = "Hidden"
        }
        
        if ($Service.WorkingDir -and (Test-Path $Service.WorkingDir)) {
            $startInfo.WorkingDirectory = $Service.WorkingDir
        }
        
        Start-Process @startInfo
        
        Start-Sleep -Seconds 5
        
        if (Test-ProcessRunning -Service $Service) {
            Write-Log "SUCCESS" "$($Service.Name) started successfully"
            return $true
        } else {
            Write-Log "ERROR" "$($Service.Name) failed to start"
            return $false
        }
    } catch {
        Write-Log "ERROR" "Failed to start $($Service.Name): $_"
        return $false
    }
}

function Restart-ServiceProcess {
    param(
        [hashtable]$Service
    )
    
    $serviceName = $Service.Name
    
    if (-not $Script:RestartCounts.ContainsKey($serviceName)) {
        $Script:RestartCounts[$serviceName] = 0
        $Script:LastRestartTime[$serviceName] = [datetime]::MinValue
    }
    
    $timeSinceLastRestart = (Get-Date) - $Script:LastRestartTime[$serviceName]
    if ($timeSinceLastRestart.TotalMinutes -gt $Script:CooldownMinutes) {
        $Script:RestartCounts[$serviceName] = 0
    }
    
    if ($Script:RestartCounts[$serviceName] -ge $MaxRestarts) {
        Write-Log "ERROR" "$serviceName has exceeded max restarts ($MaxRestarts). Sending alert..."
        Send-Alert -Service $Service -Message "Service has failed $MaxRestarts times and requires manual intervention"
        return $false
    }
    
    Write-Log "WARN" "Restarting $serviceName (attempt $($Script:RestartCounts[$serviceName] + 1)/$MaxRestarts)..."
    
    $processes = Get-Process -Name $Service.Process -ErrorAction SilentlyContinue
    if ($processes -and $Service.ProcessArgs) {
        foreach ($proc in $processes) {
            try {
                $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
                if ($cmdLine -match [regex]::Escape($Service.ProcessArgs)) {
                    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                }
            } catch {
                continue
            }
        }
    } elseif ($processes -and -not $Service.ProcessArgs) {
        $processes | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    
    Start-Sleep -Seconds 3
    
    $started = Start-ServiceProcess -Service $Service
    
    $Script:RestartCounts[$serviceName]++
    $Script:LastRestartTime[$serviceName] = Get-Date
    
    if ($started) {
        Write-Log "SUCCESS" "$serviceName restarted successfully"
    }
    
    return $started
}

function Send-Alert {
    param(
        [hashtable]$Service,
        [string]$Message
    )
    
    $alertData = @{
        service = $Service.Name
        message = $Message
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        hostname = $env:COMPUTERNAME
        severity = "critical"
    }
    
    if ($WebhookUrl) {
        try {
            $json = $alertData | ConvertTo-Json -Compress
            Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $json -ContentType "application/json" -TimeoutSec 10
            Write-Log "INFO" "Alert sent for $($Service.Name)"
        } catch {
            Write-Log "ERROR" "Failed to send webhook alert: $_"
        }
    }
    
    $alertFile = Join-Path $LogPath "alerts.json"
    $existingAlerts = @()
    if (Test-Path $alertFile) {
        try {
            $existingAlerts = Get-Content $alertFile -Raw | ConvertFrom-Json
            if ($existingAlerts -isnot [array]) {
                $existingAlerts = @($existingAlerts)
            }
        } catch {
            $existingAlerts = @()
        }
    }
    
    $existingAlerts += $alertData
    $existingAlerts | ConvertTo-Json -Depth 10 | Set-Content $alertFile -Encoding UTF8
}

function Get-ServiceStatus {
    $status = @{}
    
    foreach ($service in $Services) {
        $processRunning = Test-ProcessRunning -Service $service
        $healthOk = $false
        
        if ($processRunning) {
            $healthOk = Test-ServiceHealth -Service $service
        }
        
        $status[$service.Name] = @{
            running = $processRunning
            healthy = $healthOk
            restarts = if ($Script:RestartCounts.ContainsKey($service.Name)) { $Script:RestartCounts[$service.Name] } else { 0 }
        }
    }
    
    return $status
}

function Write-StatusReport {
    $status = Get-ServiceStatus
    
    Write-Log "INFO" "=== Service Status Report ==="
    foreach ($serviceName in $status.Keys) {
        $s = $status[$serviceName]
        $statusText = if ($s.healthy) { "HEALTHY" } elseif ($s.running) { "DEGRADED" } else { "DOWN" }
        Write-Log "INFO" "  $serviceName : $statusText (restarts: $($s.restarts))"
    }
    Write-Log "INFO" "=============================="
}

function Start-WatchdogLoop {
    Write-Log "INFO" "Nebula Watchdog starting..."
    Write-Log "INFO" "Config path: $ConfigPath"
    Write-Log "INFO" "Check interval: ${CheckInterval}s"
    Write-Log "INFO" "Max restarts: $MaxRestarts"
    Write-Log "INFO" "Monitoring $($Services.Count) services"
    
    while ($true) {
        foreach ($service in $Services) {
            $serviceName = $service.Name
            
            $processRunning = Test-ProcessRunning -Service $service
            
            if (-not $processRunning) {
                Write-Log "WARN" "$serviceName process not running"
                Restart-ServiceProcess -Service $service
                continue
            }
            
            $healthy = Test-ServiceHealth -Service $service
            
            if (-not $healthy) {
                Write-Log "WARN" "$serviceName health check failed"
                Restart-ServiceProcess -Service $service
            }
        }
        
        if ((Get-Date).Minute -eq 0 -and (Get-Date).Second -lt $CheckInterval) {
            Write-StatusReport
        }
        
        Start-Sleep -Seconds $CheckInterval
    }
}

if ($env:NEBULA_WATCHDOG_STATUS) {
    Get-ServiceStatus | ConvertTo-Json -Depth 5
} else {
    Start-WatchdogLoop
}
