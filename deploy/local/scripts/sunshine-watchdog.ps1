# Sunshine Watchdog - Auto-Recovery Service
# Monitors Sunshine and automatically restarts it when it crashes
# Install as scheduled task or NSSM service

param(
    [int]$CheckIntervalSeconds = 30,
    [int]$MaxRestartAttempts = 5,
    [int]$RestartCooldownMinutes = 5,
    [string]$LogPath = "$env:ProgramData\Sunshine\watchdog.log"
)

$ErrorActionPreference = "Continue"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    Write-Host $logLine
    Add-Content -Path $LogPath -Value $logLine -ErrorAction SilentlyContinue
}

function Get-SunshineStatus {
    $process = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
    $service = Get-Service -Name "Sunshine*" -ErrorAction SilentlyContinue
    
    return @{
        ProcessRunning = $null -ne $process
        ProcessId = if ($process) { $process.Id } else { $null }
        ServiceName = if ($service) { $service.Name } else { $null }
        ServiceStatus = if ($service) { $service.Status } else { "NotInstalled" }
    }
}

function Start-Sunshine {
    $status = Get-SunshineStatus
    
    if ($status.ServiceName) {
        Write-Log "Restarting Sunshine via service: $($status.ServiceName)"
        try {
            Restart-Service -Name $status.ServiceName -Force
            Start-Sleep -Seconds 5
            
            $newStatus = Get-SunshineStatus
            if ($newStatus.ProcessRunning) {
                Write-Log "Sunshine restarted successfully via service" "SUCCESS"
                return $true
            }
        } catch {
            Write-Log "Service restart failed: $_" "ERROR"
        }
    }
    
    # Fallback: Start executable directly
    $sunshineExe = @(
        "C:\Program Files\Sunshine\sunshine.exe",
        "C:\Program Files (x86)\Sunshine\sunshine.exe",
        "$env:LOCALAPPDATA\Sunshine\sunshine.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    
    if ($sunshineExe) {
        Write-Log "Starting Sunshine directly: $sunshineExe"
        try {
            Start-Process -FilePath $sunshineExe -WindowStyle Hidden
            Start-Sleep -Seconds 5
            
            $newStatus = Get-SunshineStatus
            if ($newStatus.ProcessRunning) {
                Write-Log "Sunshine started successfully" "SUCCESS"
                return $true
            }
        } catch {
            Write-Log "Direct start failed: $_" "ERROR"
        }
    } else {
        Write-Log "Sunshine executable not found" "ERROR"
    }
    
    return $false
}

function Test-NvencHealth {
    try {
        $nvidiaSmi = & "nvidia-smi" --query-gpu=name,encoder.stats.sessionCount,utilization.encoder --format=csv,noheader 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "NVENC check: $nvidiaSmi"
            return $true
        }
    } catch {
        Write-Log "NVENC check failed: $_" "WARN"
    }
    return $false
}

function Send-HealthReport {
    param([hashtable]$Status)
    
    # Send to Dashboard API (if configured)
    $dashboardUrl = $env:DASHBOARD_URL
    if ($dashboardUrl) {
        try {
            $body = @{
                hostname = $env:COMPUTERNAME
                sunshine_status = $Status
                timestamp = (Get-Date).ToString("o")
                nvenc_healthy = (Test-NvencHealth)
            } | ConvertTo-Json
            
            Invoke-RestMethod -Uri "$dashboardUrl/api/gaming/watchdog-report" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5 | Out-Null
        } catch {
            # Silently fail - dashboard may not be reachable
        }
    }
}

# Main watchdog loop
Write-Log "========================================" "INFO"
Write-Log "Sunshine Watchdog Starting" "INFO"
Write-Log "Check interval: $CheckIntervalSeconds seconds" "INFO"
Write-Log "Max restart attempts: $MaxRestartAttempts" "INFO"
Write-Log "Restart cooldown: $RestartCooldownMinutes minutes" "INFO"
Write-Log "========================================" "INFO"

$restartAttempts = 0
$lastRestartTime = [DateTime]::MinValue

while ($true) {
    $status = Get-SunshineStatus
    
    if (-not $status.ProcessRunning) {
        Write-Log "Sunshine not running! Attempting recovery..." "WARN"
        
        $timeSinceLastRestart = (Get-Date) - $lastRestartTime
        
        if ($timeSinceLastRestart.TotalMinutes -ge $RestartCooldownMinutes) {
            $restartAttempts = 0
        }
        
        if ($restartAttempts -lt $MaxRestartAttempts) {
            $restartAttempts++
            Write-Log "Restart attempt $restartAttempts of $MaxRestartAttempts"
            
            $success = Start-Sunshine
            $lastRestartTime = Get-Date
            
            if ($success) {
                Write-Log "Recovery successful!" "SUCCESS"
                $restartAttempts = 0
            } else {
                Write-Log "Recovery failed" "ERROR"
                
                if ($restartAttempts -ge $MaxRestartAttempts) {
                    Write-Log "Max restart attempts reached. Waiting $RestartCooldownMinutes minutes before next attempt." "ERROR"
                }
            }
        }
    } else {
        if ($restartAttempts -gt 0) {
            $timeSinceLastRestart = (Get-Date) - $lastRestartTime
            if ($timeSinceLastRestart.TotalMinutes -ge $RestartCooldownMinutes) {
                $restartAttempts = 0
                Write-Log "Stability restored - resetting restart counter" "SUCCESS"
            }
        }
    }
    
    Send-HealthReport -Status $status
    Start-Sleep -Seconds $CheckIntervalSeconds
}
