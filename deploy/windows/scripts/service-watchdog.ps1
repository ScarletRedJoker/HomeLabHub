# Windows AI Service Watchdog Daemon
# Monitors and auto-restarts Ollama, Stable Diffusion, and ComfyUI services
# Implements rate limiting, state persistence, and health reporting
# Run: .\service-watchdog.ps1 -Action start

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "status", "reset")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Continue"

# Configuration
$Script:Config = @{
    StateFile = "C:\ProgramData\NebulaCommand\watchdog-state.json"
    LogFile = "C:\ProgramData\NebulaCommand\logs\watchdog.log"
    LogDir = "C:\ProgramData\NebulaCommand\logs"
    PidFile = "C:\ProgramData\NebulaCommand\watchdog.pid"
    
    CheckInterval = 30          # seconds between health checks
    CooldownPeriod = 60         # seconds between restart attempts per service
    MaxRestartsPerHour = 5      # maximum restarts per hour per service
    RateLimitResetHours = 1     # hours to wait after hitting limit
    
    Services = @{
        ollama = @{
            Name = "Ollama"
            Port = 11434
            HealthEndpoint = "/api/version"
            StartCommand = "ollama"
            StartArgs = "serve"
            ProcessPattern = "ollama*"
            RequiresEnv = @{ OLLAMA_HOST = "0.0.0.0" }
            StartupTimeout = 30
        }
        stable_diffusion = @{
            Name = "Stable Diffusion"
            Port = 7860
            HealthEndpoint = "/sdapi/v1/sd-models"
            StartDir = "C:\AI\stable-diffusion-webui"
            StartCommand = ".\webui.bat"
            ProcessPattern = "*webui*"
            StartupTimeout = 300
        }
        comfyui = @{
            Name = "ComfyUI"
            Port = 8188
            HealthEndpoint = "/system_stats"
            StartDir = "C:\AI\ComfyUI"
            StartCommand = ".\venv\Scripts\python.exe"
            StartArgs = "main.py --listen 0.0.0.0 --port 8188"
            ProcessPattern = "*ComfyUI*main.py*"
            StartupTimeout = 120
        }
    }
}

# Initialize state structure
$Script:State = @{
    started_at = $null
    last_check = $null
    running = $false
    services = @{}
}

function Initialize-Directories {
    $dirs = @(
        "C:\ProgramData\NebulaCommand",
        $Script:Config.LogDir
    )
    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
}

function Write-WatchdogLog {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    
    $color = switch ($Level) {
        "ERROR"   { "Red" }
        "WARN"    { "Yellow" }
        "OK"      { "Green" }
        "RESTART" { "Cyan" }
        "LIMIT"   { "Magenta" }
        default   { "White" }
    }
    
    Write-Host $logLine -ForegroundColor $color
    
    try {
        Add-Content -Path $Script:Config.LogFile -Value $logLine -ErrorAction Stop
    }
    catch {
        Write-Host "Failed to write to log file: $_" -ForegroundColor Red
    }
}

function Load-State {
    if (Test-Path $Script:Config.StateFile) {
        try {
            $content = Get-Content -Path $Script:Config.StateFile -Raw -ErrorAction Stop
            $loaded = $content | ConvertFrom-Json
            
            $Script:State = @{
                started_at = $loaded.started_at
                last_check = $loaded.last_check
                running = $loaded.running
                services = @{}
            }
            
            foreach ($key in $Script:Config.Services.Keys) {
                if ($loaded.services.$key) {
                    $Script:State.services[$key] = @{
                        last_restart = $loaded.services.$key.last_restart
                        restart_count = $loaded.services.$key.restart_count
                        restart_history = @($loaded.services.$key.restart_history)
                        rate_limited_until = $loaded.services.$key.rate_limited_until
                        last_status = $loaded.services.$key.last_status
                    }
                }
                else {
                    $Script:State.services[$key] = Get-EmptyServiceState
                }
            }
            
            Write-WatchdogLog "Loaded state from $($Script:Config.StateFile)"
        }
        catch {
            Write-WatchdogLog "Failed to load state, initializing fresh: $_" "WARN"
            Initialize-State
        }
    }
    else {
        Initialize-State
    }
}

function Get-EmptyServiceState {
    return @{
        last_restart = $null
        restart_count = 0
        restart_history = @()
        rate_limited_until = $null
        last_status = "unknown"
    }
}

function Initialize-State {
    $Script:State = @{
        started_at = (Get-Date -Format "o")
        last_check = $null
        running = $false
        services = @{}
    }
    
    foreach ($key in $Script:Config.Services.Keys) {
        $Script:State.services[$key] = Get-EmptyServiceState
    }
}

function Save-State {
    try {
        $Script:State.last_check = (Get-Date -Format "o")
        $Script:State | ConvertTo-Json -Depth 5 | Set-Content -Path $Script:Config.StateFile -Force
    }
    catch {
        Write-WatchdogLog "Failed to save state: $_" "ERROR"
    }
}

function Test-ServiceHealth {
    param([string]$ServiceKey)
    
    $svc = $Script:Config.Services[$ServiceKey]
    $url = "http://localhost:$($svc.Port)$($svc.HealthEndpoint)"
    
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest -Uri $url -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        $stopwatch.Stop()
        
        return @{
            Online = $true
            StatusCode = $response.StatusCode
            ResponseTime = $stopwatch.ElapsedMilliseconds
        }
    }
    catch {
        return @{
            Online = $false
            Error = $_.Exception.Message
        }
    }
}

function Get-ServiceProcess {
    param([string]$ServiceKey)
    
    switch ($ServiceKey) {
        "ollama" {
            return Get-Process -Name "ollama*" -ErrorAction SilentlyContinue
        }
        "stable_diffusion" {
            return Get-CimInstance Win32_Process | Where-Object { 
                $_.CommandLine -like "*webui*" -or $_.CommandLine -like "*stable-diffusion*" 
            }
        }
        "comfyui" {
            return Get-CimInstance Win32_Process | Where-Object { 
                $_.CommandLine -like "*ComfyUI*" -and $_.CommandLine -like "*main.py*"
            }
        }
    }
    return $null
}

function Test-RateLimited {
    param([string]$ServiceKey)
    
    $svcState = $Script:State.services[$ServiceKey]
    
    # Check if currently rate limited
    if ($svcState.rate_limited_until) {
        $limitTime = [DateTime]::Parse($svcState.rate_limited_until)
        if ((Get-Date) -lt $limitTime) {
            $remaining = ($limitTime - (Get-Date)).TotalMinutes
            return @{
                Limited = $true
                RemainingMinutes = [math]::Round($remaining, 1)
            }
        }
        else {
            # Rate limit expired, reset
            $svcState.rate_limited_until = $null
            $svcState.restart_history = @()
            $svcState.restart_count = 0
        }
    }
    
    # Clean old restart history (keep only last hour)
    $oneHourAgo = (Get-Date).AddHours(-1)
    $svcState.restart_history = @($svcState.restart_history | Where-Object {
        try {
            [DateTime]::Parse($_) -gt $oneHourAgo
        }
        catch { $false }
    })
    
    # Check if would exceed limit
    if ($svcState.restart_history.Count -ge $Script:Config.MaxRestartsPerHour) {
        $svcState.rate_limited_until = (Get-Date).AddHours($Script:Config.RateLimitResetHours).ToString("o")
        Save-State
        return @{
            Limited = $true
            RemainingMinutes = $Script:Config.RateLimitResetHours * 60
            JustLimited = $true
        }
    }
    
    return @{ Limited = $false }
}

function Test-CooldownActive {
    param([string]$ServiceKey)
    
    $svcState = $Script:State.services[$ServiceKey]
    
    if (-not $svcState.last_restart) {
        return $false
    }
    
    try {
        $lastRestart = [DateTime]::Parse($svcState.last_restart)
        $elapsed = ((Get-Date) - $lastRestart).TotalSeconds
        return $elapsed -lt $Script:Config.CooldownPeriod
    }
    catch {
        return $false
    }
}

function Start-ServiceRestart {
    param([string]$ServiceKey)
    
    $svc = $Script:Config.Services[$ServiceKey]
    $svcState = $Script:State.services[$ServiceKey]
    
    Write-WatchdogLog "Attempting to restart $($svc.Name)..." "RESTART"
    
    # Check cooldown
    if (Test-CooldownActive -ServiceKey $ServiceKey) {
        Write-WatchdogLog "$($svc.Name) is in cooldown period, skipping restart" "WARN"
        return $false
    }
    
    # Check rate limit
    $rateLimit = Test-RateLimited -ServiceKey $ServiceKey
    if ($rateLimit.Limited) {
        if ($rateLimit.JustLimited) {
            Write-WatchdogLog "$($svc.Name) hit restart limit ($($Script:Config.MaxRestartsPerHour) restarts/hour). Rate limited for $($rateLimit.RemainingMinutes) minutes" "LIMIT"
        }
        else {
            Write-WatchdogLog "$($svc.Name) is rate limited. $($rateLimit.RemainingMinutes) minutes remaining" "LIMIT"
        }
        return $false
    }
    
    # Stop existing process if any
    $existingProcess = Get-ServiceProcess -ServiceKey $ServiceKey
    if ($existingProcess) {
        Write-WatchdogLog "Stopping existing $($svc.Name) process..." "INFO"
        foreach ($proc in $existingProcess) {
            try {
                $procId = if ($proc -is [System.Diagnostics.Process]) { $proc.Id } else { $proc.ProcessId }
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
            catch { }
        }
        Start-Sleep -Seconds 3
    }
    
    # Set environment variables if needed
    if ($svc.RequiresEnv) {
        foreach ($key in $svc.RequiresEnv.Keys) {
            [Environment]::SetEnvironmentVariable($key, $svc.RequiresEnv[$key], "Process")
        }
    }
    
    # Start the service
    try {
        if ($ServiceKey -eq "ollama") {
            $ollamaPath = (Get-Command ollama -ErrorAction SilentlyContinue).Source
            if (-not $ollamaPath) { 
                $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" 
            }
            if (Test-Path $ollamaPath) {
                Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
            }
            else {
                Write-WatchdogLog "Ollama executable not found" "ERROR"
                return $false
            }
        }
        elseif ($ServiceKey -eq "stable_diffusion") {
            if (Test-Path $svc.StartDir) {
                Push-Location $svc.StartDir
                Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $svc.StartCommand -WindowStyle Hidden
                Pop-Location
            }
            else {
                Write-WatchdogLog "Stable Diffusion directory not found: $($svc.StartDir)" "ERROR"
                return $false
            }
        }
        elseif ($ServiceKey -eq "comfyui") {
            if (Test-Path $svc.StartDir) {
                Push-Location $svc.StartDir
                $pythonPath = Join-Path $svc.StartDir "venv\Scripts\python.exe"
                if (Test-Path $pythonPath) {
                    Start-Process -FilePath $pythonPath -ArgumentList "main.py", "--listen", "0.0.0.0", "--port", "8188" -WindowStyle Hidden
                }
                else {
                    Write-WatchdogLog "ComfyUI Python venv not found" "ERROR"
                    Pop-Location
                    return $false
                }
                Pop-Location
            }
            else {
                Write-WatchdogLog "ComfyUI directory not found: $($svc.StartDir)" "ERROR"
                return $false
            }
        }
        
        # Record restart
        $svcState.last_restart = (Get-Date -Format "o")
        $svcState.restart_count++
        $svcState.restart_history += (Get-Date -Format "o")
        Save-State
        
        # Wait for service to come online
        $timeout = $svc.StartupTimeout
        $waited = 0
        $checkInterval = 5
        
        Write-WatchdogLog "Waiting for $($svc.Name) to become healthy (timeout: ${timeout}s)..."
        
        while ($waited -lt $timeout) {
            Start-Sleep -Seconds $checkInterval
            $waited += $checkInterval
            
            $health = Test-ServiceHealth -ServiceKey $ServiceKey
            if ($health.Online) {
                Write-WatchdogLog "$($svc.Name) restarted successfully after ${waited}s (restart #$($svcState.restart_count) this hour)" "OK"
                $svcState.last_status = "online"
                Save-State
                return $true
            }
        }
        
        Write-WatchdogLog "$($svc.Name) failed to come online within ${timeout}s" "ERROR"
        $svcState.last_status = "failed"
        Save-State
        return $false
    }
    catch {
        Write-WatchdogLog "Error restarting $($svc.Name): $_" "ERROR"
        return $false
    }
}

function Send-HealthReport {
    param([hashtable]$Status)
    
    $webhookUrl = $env:NEBULA_HEALTH_WEBHOOK
    if (-not $webhookUrl) {
        return
    }
    
    try {
        $payload = @{
            timestamp = (Get-Date -Format "o")
            hostname = $env:COMPUTERNAME
            watchdog = @{
                started_at = $Script:State.started_at
                uptime_seconds = if ($Script:State.started_at) { 
                    ((Get-Date) - [DateTime]::Parse($Script:State.started_at)).TotalSeconds 
                } else { 0 }
            }
            services = $Status
        }
        
        $body = $payload | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 | Out-Null
        Write-WatchdogLog "Health report sent to webhook" "INFO"
    }
    catch {
        Write-WatchdogLog "Failed to send health report: $_" "WARN"
    }
}

function Get-WatchdogStatus {
    $status = @{}
    
    foreach ($key in $Script:Config.Services.Keys) {
        $svc = $Script:Config.Services[$key]
        $svcState = $Script:State.services[$key]
        $health = Test-ServiceHealth -ServiceKey $key
        $process = Get-ServiceProcess -ServiceKey $key
        $rateLimit = Test-RateLimited -ServiceKey $key
        
        $status[$key] = @{
            name = $svc.Name
            port = $svc.Port
            online = $health.Online
            process_running = ($null -ne $process)
            response_time_ms = $health.ResponseTime
            restart_count_hour = $svcState.restart_history.Count
            last_restart = $svcState.last_restart
            rate_limited = $rateLimit.Limited
            rate_limit_remaining_min = if ($rateLimit.Limited) { $rateLimit.RemainingMinutes } else { $null }
            cooldown_active = (Test-CooldownActive -ServiceKey $key)
        }
    }
    
    return $status
}

function Show-Status {
    Load-State
    
    Write-Host ""
    Write-Host "=== Nebula Watchdog Status ===" -ForegroundColor Cyan
    Write-Host ""
    
    if ($Script:State.started_at) {
        $uptime = ((Get-Date) - [DateTime]::Parse($Script:State.started_at)).ToString("d\.hh\:mm\:ss")
        Write-Host "  Daemon Uptime: $uptime" -ForegroundColor Gray
    }
    
    if (Test-Path $Script:Config.PidFile) {
        $pid = Get-Content $Script:Config.PidFile -ErrorAction SilentlyContinue
        $daemonProcess = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($daemonProcess) {
            Write-Host "  Daemon Status: " -NoNewline
            Write-Host "RUNNING" -ForegroundColor Green -NoNewline
            Write-Host " (PID: $pid)" -ForegroundColor Gray
        }
        else {
            Write-Host "  Daemon Status: " -NoNewline
            Write-Host "STOPPED" -ForegroundColor Red
        }
    }
    else {
        Write-Host "  Daemon Status: " -NoNewline
        Write-Host "NOT RUNNING" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "  Services:" -ForegroundColor White
    Write-Host ""
    
    $status = Get-WatchdogStatus
    
    foreach ($key in $Script:Config.Services.Keys) {
        $s = $status[$key]
        $statusIcon = if ($s.online) { "[OK]" } else { "[--]" }
        $statusColor = if ($s.online) { "Green" } else { "Red" }
        
        Write-Host "    " -NoNewline
        Write-Host $statusIcon -ForegroundColor $statusColor -NoNewline
        Write-Host " $($s.name)" -NoNewline
        Write-Host " (port $($s.port))" -ForegroundColor DarkGray
        
        Write-Host "        Restarts (1h): $($s.restart_count_hour)/$($Script:Config.MaxRestartsPerHour)" -ForegroundColor Gray
        
        if ($s.rate_limited) {
            Write-Host "        " -NoNewline
            Write-Host "RATE LIMITED" -ForegroundColor Magenta -NoNewline
            Write-Host " - $($s.rate_limit_remaining_min) min remaining" -ForegroundColor Gray
        }
        
        if ($s.cooldown_active) {
            Write-Host "        " -NoNewline
            Write-Host "COOLDOWN ACTIVE" -ForegroundColor Yellow
        }
        
        Write-Host ""
    }
    
    Write-Host "─────────────────────────────────" -ForegroundColor DarkGray
    Write-Host ""
    
    return $status
}

function Reset-ServiceLimits {
    param([string]$ServiceKey = $null)
    
    Load-State
    
    if ($ServiceKey) {
        if ($Script:State.services[$ServiceKey]) {
            $Script:State.services[$ServiceKey] = Get-EmptyServiceState
            Write-WatchdogLog "Reset rate limits for $ServiceKey" "OK"
        }
    }
    else {
        foreach ($key in $Script:Config.Services.Keys) {
            $Script:State.services[$key] = Get-EmptyServiceState
        }
        Write-WatchdogLog "Reset rate limits for all services" "OK"
    }
    
    Save-State
    Write-Host "Rate limits have been reset. Services can now be restarted." -ForegroundColor Green
}

function Start-WatchdogDaemon {
    Write-WatchdogLog "===== Starting Watchdog Daemon =====" "INFO"
    
    # Check if already running
    if (Test-Path $Script:Config.PidFile) {
        $existingPid = Get-Content $Script:Config.PidFile -ErrorAction SilentlyContinue
        $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
        if ($existingProcess) {
            Write-WatchdogLog "Watchdog daemon already running (PID: $existingPid)" "WARN"
            Write-Host "Use '-Action stop' to stop the existing daemon first." -ForegroundColor Yellow
            return
        }
    }
    
    # Save PID
    $currentPid = $PID
    $currentPid | Set-Content -Path $Script:Config.PidFile -Force
    
    Load-State
    $Script:State.started_at = (Get-Date -Format "o")
    $Script:State.running = $true
    Save-State
    
    Write-WatchdogLog "Watchdog daemon started (PID: $currentPid)" "OK"
    Write-WatchdogLog "Monitoring: Ollama (:11434), Stable Diffusion (:7860), ComfyUI (:8188)"
    Write-WatchdogLog "Check interval: $($Script:Config.CheckInterval)s | Cooldown: $($Script:Config.CooldownPeriod)s | Max restarts/hour: $($Script:Config.MaxRestartsPerHour)"
    
    $lastHealthReport = [DateTime]::MinValue
    $healthReportInterval = 300  # 5 minutes
    
    # Main daemon loop
    while ($true) {
        try {
            $status = @{}
            $anyRestarted = $false
            
            foreach ($key in $Script:Config.Services.Keys) {
                $svc = $Script:Config.Services[$key]
                $health = Test-ServiceHealth -ServiceKey $key
                
                $status[$key] = @{
                    name = $svc.Name
                    online = $health.Online
                    port = $svc.Port
                }
                
                if (-not $health.Online) {
                    $svcState = $Script:State.services[$key]
                    $previousStatus = $svcState.last_status
                    
                    if ($previousStatus -eq "online") {
                        Write-WatchdogLog "$($svc.Name) went OFFLINE" "WARN"
                    }
                    
                    $svcState.last_status = "offline"
                    
                    # Attempt restart
                    $restarted = Start-ServiceRestart -ServiceKey $key
                    if ($restarted) {
                        $anyRestarted = $true
                        $status[$key].online = $true
                    }
                }
                else {
                    $svcState = $Script:State.services[$key]
                    if ($svcState.last_status -ne "online") {
                        Write-WatchdogLog "$($svc.Name) is ONLINE" "OK"
                    }
                    $svcState.last_status = "online"
                }
            }
            
            Save-State
            
            # Send health report periodically
            if (((Get-Date) - $lastHealthReport).TotalSeconds -ge $healthReportInterval) {
                Send-HealthReport -Status $status
                $lastHealthReport = Get-Date
            }
        }
        catch {
            Write-WatchdogLog "Error in watchdog loop: $_" "ERROR"
        }
        
        Start-Sleep -Seconds $Script:Config.CheckInterval
    }
}

function Stop-WatchdogDaemon {
    Write-WatchdogLog "Stopping Watchdog Daemon..." "INFO"
    
    if (Test-Path $Script:Config.PidFile) {
        $pid = Get-Content $Script:Config.PidFile -ErrorAction SilentlyContinue
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        
        if ($process) {
            try {
                Stop-Process -Id $pid -Force
                Write-WatchdogLog "Watchdog daemon stopped (PID: $pid)" "OK"
            }
            catch {
                Write-WatchdogLog "Failed to stop daemon: $_" "ERROR"
            }
        }
        else {
            Write-WatchdogLog "Daemon process not found (stale PID file)" "WARN"
        }
        
        Remove-Item $Script:Config.PidFile -Force -ErrorAction SilentlyContinue
    }
    else {
        Write-WatchdogLog "Watchdog daemon is not running" "WARN"
    }
    
    Load-State
    $Script:State.running = $false
    Save-State
}

# Main entry point
function Main {
    Initialize-Directories
    
    switch ($Action) {
        "start" {
            Start-WatchdogDaemon
        }
        "stop" {
            Stop-WatchdogDaemon
        }
        "status" {
            Show-Status
        }
        "reset" {
            Reset-ServiceLimits
        }
    }
}

# Run
Main
