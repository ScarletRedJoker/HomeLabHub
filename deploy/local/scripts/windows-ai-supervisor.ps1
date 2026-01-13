# Windows AI Service Supervisor
# Manages Ollama, Stable Diffusion WebUI, and ComfyUI as robust services
# Run as Administrator or via Task Scheduler at startup

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "install", "uninstall", "health")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Continue"

# Configuration
$Script:Config = @{
    StateFile = "C:\ProgramData\NebulaCommand\ai-state.json"
    LogDir = "C:\ProgramData\NebulaCommand\logs"
    HeartbeatInterval = 30  # seconds
    
    Services = @{
        ollama = @{
            Name = "Ollama"
            Port = 11434
            StartCommand = "ollama serve"
            HealthEndpoint = "/api/version"
            RequiresEnv = @{ OLLAMA_HOST = "0.0.0.0" }
            Priority = 1  # Start first
        }
        stable_diffusion = @{
            Name = "Stable Diffusion WebUI"
            Port = 7860
            StartDir = "C:\stable-diffusion-webui"
            StartCommand = ".\webui-user.bat"
            HealthEndpoint = "/sdapi/v1/sd-models"
            StartupTimeout = 300  # Takes time to load
            Priority = 2
        }
        comfyui = @{
            Name = "ComfyUI"
            Port = 8188
            StartDir = "C:\Users\Evin\Documents\ComfyUI_windows_portable"
            StartCommand = ".\python_embeded\python.exe -s ComfyUI\main.py --listen 0.0.0.0 --port 8188"
            HealthEndpoint = "/system_stats"
            Priority = 3
        }
    }
}

# Ensure directories exist
function Initialize-Directories {
    $dirs = @(
        "C:\ProgramData\NebulaCommand",
        $Script:Config.LogDir
    )
    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Host "[INIT] Created directory: $dir" -ForegroundColor Cyan
        }
    }
}

# Log message to file and console
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "OK"    { "Green" }
        default { "White" }
    }
    
    Write-Host $logLine -ForegroundColor $color
    
    $logFile = Join-Path $Script:Config.LogDir "ai-supervisor.log"
    Add-Content -Path $logFile -Value $logLine -ErrorAction SilentlyContinue
}

# Check if a service is responding
function Test-ServiceHealth {
    param(
        [string]$ServiceKey,
        [int]$Timeout = 5
    )
    
    $svc = $Script:Config.Services[$ServiceKey]
    $url = "http://localhost:$($svc.Port)$($svc.HealthEndpoint)"
    
    try {
        $response = Invoke-WebRequest -Uri $url -TimeoutSec $Timeout -UseBasicParsing -ErrorAction Stop
        return @{
            Online = $true
            StatusCode = $response.StatusCode
            ResponseTime = $null
        }
    }
    catch {
        return @{
            Online = $false
            Error = $_.Exception.Message
        }
    }
}

# Check if service process is running
function Get-ServiceProcess {
    param([string]$ServiceKey)
    
    switch ($ServiceKey) {
        "ollama" {
            return Get-Process -Name "ollama*" -ErrorAction SilentlyContinue
        }
        "stable_diffusion" {
            # Look for python process with webui in command line
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

# Start a service
function Start-AIService {
    param([string]$ServiceKey)
    
    $svc = $Script:Config.Services[$ServiceKey]
    Write-Log "Starting $($svc.Name)..." "INFO"
    
    # Check if already running
    $health = Test-ServiceHealth -ServiceKey $ServiceKey -Timeout 3
    if ($health.Online) {
        Write-Log "$($svc.Name) is already running" "OK"
        return $true
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
            # Ollama runs as Windows service or starts via 'ollama serve'
            $ollamaPath = (Get-Command ollama -ErrorAction SilentlyContinue).Source
            if ($ollamaPath) {
                Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
            } else {
                Start-Process -FilePath "C:\Users\Evin\AppData\Local\Programs\Ollama\ollama.exe" -ArgumentList "serve" -WindowStyle Hidden
            }
        }
        elseif ($svc.StartDir) {
            Push-Location $svc.StartDir
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $svc.StartCommand -WindowStyle Hidden
            Pop-Location
        }
        
        # Wait for service to become healthy
        $timeout = $svc.StartupTimeout ?? 60
        $waited = 0
        $checkInterval = 5
        
        Write-Log "Waiting for $($svc.Name) to become healthy (timeout: ${timeout}s)..."
        
        while ($waited -lt $timeout) {
            Start-Sleep -Seconds $checkInterval
            $waited += $checkInterval
            
            $health = Test-ServiceHealth -ServiceKey $ServiceKey -Timeout 5
            if ($health.Online) {
                Write-Log "$($svc.Name) started successfully after ${waited}s" "OK"
                return $true
            }
            Write-Host "." -NoNewline
        }
        
        Write-Log "$($svc.Name) failed to start within ${timeout}s" "ERROR"
        return $false
    }
    catch {
        Write-Log "Failed to start $($svc.Name): $_" "ERROR"
        return $false
    }
}

# Stop a service
function Stop-AIService {
    param([string]$ServiceKey)
    
    $svc = $Script:Config.Services[$ServiceKey]
    Write-Log "Stopping $($svc.Name)..." "INFO"
    
    $processes = Get-ServiceProcess -ServiceKey $ServiceKey
    
    if (-not $processes) {
        Write-Log "$($svc.Name) is not running" "OK"
        return $true
    }
    
    foreach ($proc in $processes) {
        try {
            if ($proc -is [System.Diagnostics.Process]) {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            } else {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
        catch {
            Write-Log "Failed to stop process: $_" "WARN"
        }
    }
    
    # Verify stopped
    Start-Sleep -Seconds 2
    $stillRunning = Get-ServiceProcess -ServiceKey $ServiceKey
    
    if ($stillRunning) {
        Write-Log "$($svc.Name) may still be running" "WARN"
        return $false
    }
    
    Write-Log "$($svc.Name) stopped" "OK"
    return $true
}

# Get status of all services
function Get-AIStatus {
    $status = @{
        timestamp = (Get-Date -Format "o")
        hostname = $env:COMPUTERNAME
        services = @{}
        gpu = $null
    }
    
    # Check each service
    foreach ($key in $Script:Config.Services.Keys) {
        $svc = $Script:Config.Services[$key]
        $health = Test-ServiceHealth -ServiceKey $key -Timeout 3
        $process = Get-ServiceProcess -ServiceKey $key
        
        $status.services[$key] = @{
            name = $svc.Name
            port = $svc.Port
            status = if ($health.Online) { "online" } else { "offline" }
            process_running = ($null -ne $process)
            url = "http://localhost:$($svc.Port)"
            error = $health.Error
        }
    }
    
    # Get GPU info
    try {
        $nvsmi = & nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits 2>$null
        if ($nvsmi) {
            $parts = $nvsmi -split ","
            $status.gpu = @{
                name = $parts[0].Trim()
                memory_used_mb = [int]$parts[1].Trim()
                memory_total_mb = [int]$parts[2].Trim()
                utilization_percent = [int]$parts[3].Trim()
            }
        }
    }
    catch {
        $status.gpu = @{ error = "nvidia-smi not available" }
    }
    
    return $status
}

# Save state to JSON file
function Save-StateFile {
    param([hashtable]$Status)
    
    try {
        $Status | ConvertTo-Json -Depth 5 | Set-Content -Path $Script:Config.StateFile -Force
        Write-Log "State saved to $($Script:Config.StateFile)" "INFO"
    }
    catch {
        Write-Log "Failed to save state: $_" "ERROR"
    }
}

# Report health to remote webhook (Linode dashboard)
function Send-HealthReport {
    param([hashtable]$Status)
    
    $webhookUrl = $env:NEBULA_HEALTH_WEBHOOK
    if (-not $webhookUrl) {
        return
    }
    
    try {
        $body = $Status | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 | Out-Null
        Write-Log "Health report sent to webhook" "INFO"
    }
    catch {
        Write-Log "Failed to send health report: $_" "WARN"
    }
}

# Install as Windows Task Scheduler task
function Install-Supervisor {
    Write-Log "Installing AI Supervisor as scheduled task..." "INFO"
    
    $scriptPath = $MyInvocation.ScriptName
    if (-not $scriptPath) {
        $scriptPath = $PSCommandPath
    }
    
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`" start"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    
    try {
        Register-ScheduledTask -TaskName "NebulaCommand-AI-Supervisor" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
        Write-Log "Scheduled task installed successfully" "OK"
        Write-Log "Services will start automatically on boot" "INFO"
    }
    catch {
        Write-Log "Failed to install scheduled task: $_" "ERROR"
        Write-Log "Run this script as Administrator" "WARN"
    }
}

# Uninstall scheduled task
function Uninstall-Supervisor {
    Write-Log "Uninstalling AI Supervisor scheduled task..." "INFO"
    
    try {
        Unregister-ScheduledTask -TaskName "NebulaCommand-AI-Supervisor" -Confirm:$false -ErrorAction Stop
        Write-Log "Scheduled task removed" "OK"
    }
    catch {
        Write-Log "Failed to remove scheduled task: $_" "WARN"
    }
}

# Main execution
function Main {
    Initialize-Directories
    
    switch ($Action) {
        "start" {
            Write-Log "===== Starting AI Services =====" "INFO"
            
            # Sort by priority
            $orderedServices = $Script:Config.Services.GetEnumerator() | 
                Sort-Object { $_.Value.Priority }
            
            foreach ($entry in $orderedServices) {
                Start-AIService -ServiceKey $entry.Key
                Start-Sleep -Seconds 2
            }
            
            # Save initial state
            $status = Get-AIStatus
            Save-StateFile -Status $status
            Send-HealthReport -Status $status
            
            Write-Log "===== Startup Complete =====" "OK"
        }
        
        "stop" {
            Write-Log "===== Stopping AI Services =====" "INFO"
            
            # Stop in reverse priority order
            $orderedServices = $Script:Config.Services.GetEnumerator() | 
                Sort-Object { $_.Value.Priority } -Descending
            
            foreach ($entry in $orderedServices) {
                Stop-AIService -ServiceKey $entry.Key
            }
            
            Write-Log "===== Shutdown Complete =====" "OK"
        }
        
        "restart" {
            & $MyInvocation.MyCommand.Path stop
            Start-Sleep -Seconds 5
            & $MyInvocation.MyCommand.Path start
        }
        
        "status" {
            $status = Get-AIStatus
            
            Write-Host "`n===== Nebula Command AI Status =====" -ForegroundColor Cyan
            Write-Host "Timestamp: $($status.timestamp)"
            Write-Host "Hostname:  $($status.hostname)"
            Write-Host ""
            
            Write-Host "Services:" -ForegroundColor Yellow
            foreach ($key in $status.services.Keys) {
                $svc = $status.services[$key]
                $statusColor = if ($svc.status -eq "online") { "Green" } else { "Red" }
                $statusSymbol = if ($svc.status -eq "online") { "[OK]" } else { "[--]" }
                Write-Host "  $statusSymbol $($svc.name.PadRight(25)) : $($svc.url)" -ForegroundColor $statusColor
            }
            
            if ($status.gpu) {
                Write-Host ""
                Write-Host "GPU:" -ForegroundColor Yellow
                if ($status.gpu.error) {
                    Write-Host "  $($status.gpu.error)" -ForegroundColor Red
                } else {
                    $memPercent = [math]::Round(($status.gpu.memory_used_mb / $status.gpu.memory_total_mb) * 100, 1)
                    Write-Host "  $($status.gpu.name)"
                    Write-Host "  Memory: $($status.gpu.memory_used_mb)MB / $($status.gpu.memory_total_mb)MB ($memPercent%)"
                    Write-Host "  Utilization: $($status.gpu.utilization_percent)%"
                }
            }
            
            Write-Host ""
        }
        
        "health" {
            $status = Get-AIStatus
            Save-StateFile -Status $status
            Send-HealthReport -Status $status
            
            # Output for monitoring
            $status | ConvertTo-Json -Depth 5
        }
        
        "install" {
            Install-Supervisor
        }
        
        "uninstall" {
            Uninstall-Supervisor
        }
    }
}

# Run
Main
