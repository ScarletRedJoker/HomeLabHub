# VM AI Health Daemon
# Runs continuously, reporting health status to local state file and remote webhook
# Install as Windows Service using NSSM or run via Task Scheduler

param(
    [int]$IntervalSeconds = 30,
    [string]$StateFile = "C:\ProgramData\NebulaCommand\ai-state.json",
    [string]$WebhookUrl = $env:NEBULA_HEALTH_WEBHOOK
)

$ErrorActionPreference = "Continue"

$Services = @{
    ollama = @{
        Port = 11434
        HealthEndpoint = "/api/version"
        ModelsEndpoint = "/api/tags"
    }
    stable_diffusion = @{
        Port = 7860
        HealthEndpoint = "/sdapi/v1/sd-models"
        MemoryEndpoint = "/sdapi/v1/memory"
    }
    comfyui = @{
        Port = 8188
        HealthEndpoint = "/system_stats"
    }
}

function Get-ServiceStatus {
    param([string]$Name, [hashtable]$Config)
    
    $result = @{
        name = $Name
        status = "offline"
        port = $Config.Port
        url = "http://localhost:$($Config.Port)"
        latency_ms = $null
        details = @{}
    }
    
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest -Uri "$($result.url)$($Config.HealthEndpoint)" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        $sw.Stop()
        
        $result.status = "online"
        $result.latency_ms = $sw.ElapsedMilliseconds
        
        # Get additional details
        if ($Name -eq "ollama" -and $Config.ModelsEndpoint) {
            try {
                $models = (Invoke-RestMethod -Uri "$($result.url)$($Config.ModelsEndpoint)" -TimeoutSec 5).models
                $result.details.models = @($models | ForEach-Object { $_.name })
                $result.details.model_count = $models.Count
            } catch {}
        }
        
        if ($Name -eq "stable_diffusion" -and $Config.MemoryEndpoint) {
            try {
                $mem = Invoke-RestMethod -Uri "$($result.url)$($Config.MemoryEndpoint)" -TimeoutSec 5
                if ($mem.cuda) {
                    $result.details.vram_used_gb = [math]::Round($mem.cuda.system.used / 1GB, 2)
                    $result.details.vram_total_gb = [math]::Round($mem.cuda.system.total / 1GB, 2)
                }
            } catch {}
        }
        
        if ($Name -eq "comfyui") {
            try {
                $stats = $response.Content | ConvertFrom-Json
                if ($stats.devices) {
                    $gpu = $stats.devices[0]
                    $result.details.vram_used_gb = [math]::Round($gpu.vram_used / 1GB, 2)
                    $result.details.vram_total_gb = [math]::Round($gpu.vram_total / 1GB, 2)
                }
            } catch {}
        }
    }
    catch {
        $result.error = $_.Exception.Message
    }
    
    return $result
}

function Get-GPUStatus {
    try {
        $output = & nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits 2>$null
        if ($output -and $output -is [string]) {
            $parts = $output -split ","
            if ($parts.Count -ge 5) {
                return @{
                    name = $parts[0].Trim()
                    memory_used_mb = [int]$parts[1].Trim()
                    memory_total_mb = [int]$parts[2].Trim()
                    utilization_percent = [int]$parts[3].Trim()
                    temperature_c = [int]$parts[4].Trim()
                    status = "available"
                }
            }
        }
    }
    catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] GPU status error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    return @{ status = "unavailable"; error = "nvidia-smi not available or failed" }
}

function Get-SystemMetrics {
    try {
        $cpu = (Get-CimInstance -ClassName Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        $mem = Get-CimInstance -ClassName Win32_OperatingSystem
        $memUsed = [math]::Round(($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / 1MB, 2)
        $memTotal = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 2)
        $uptime = ([DateTime]::UtcNow - $mem.LastBootUpTime).TotalHours
        
        return @{
            cpu_percent = [math]::Round($cpu, 1)
            memory_used_gb = $memUsed
            memory_total_gb = $memTotal
            uptime_hours = [math]::Round($uptime, 1)
        }
    }
    catch {
        return @{
            error = "Failed to get system metrics: $($_.Exception.Message)"
        }
    }
}

function Build-HealthReport {
    $report = @{
        timestamp = (Get-Date -Format "o")
        hostname = $env:COMPUTERNAME
        node_type = "windows_vm"
        tailscale_ip = $null
        services = @{}
        gpu = Get-GPUStatus
        system = Get-SystemMetrics
    }
    
    # Get Tailscale IP
    try {
        $tsStatus = & tailscale status --json 2>$null | ConvertFrom-Json
        if ($tsStatus.Self) {
            $report.tailscale_ip = $tsStatus.Self.TailscaleIPs[0]
        }
    } catch {}
    
    # Check each service
    foreach ($name in $Services.Keys) {
        $report.services[$name] = Get-ServiceStatus -Name $name -Config $Services[$name]
    }
    
    # Compute overall health
    $onlineCount = ($report.services.Values | Where-Object { $_.status -eq "online" }).Count
    $totalCount = $report.services.Count
    
    $report.health = @{
        status = if ($onlineCount -eq $totalCount) { "healthy" } 
                 elseif ($onlineCount -gt 0) { "degraded" } 
                 else { "unhealthy" }
        services_online = $onlineCount
        services_total = $totalCount
    }
    
    return $report
}

function Save-LocalState {
    param([hashtable]$Report)
    
    $dir = Split-Path $StateFile -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    
    $Report | ConvertTo-Json -Depth 10 | Set-Content -Path $StateFile -Force
}

function Send-WebhookReport {
    param([hashtable]$Report)
    
    if (-not $WebhookUrl) { return }
    
    try {
        $body = $Report | ConvertTo-Json -Depth 10
        Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 | Out-Null
    }
    catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Webhook failed: $_" -ForegroundColor Yellow
    }
}

# Main loop
Write-Host "===== Nebula Command AI Health Daemon =====" -ForegroundColor Cyan
Write-Host "Interval: ${IntervalSeconds}s"
Write-Host "State File: $StateFile"
Write-Host "Webhook: $(if ($WebhookUrl) { 'Configured' } else { 'Not configured' })"
Write-Host ""

$consecutiveErrors = 0
$maxConsecutiveErrors = 10

while ($true) {
    try {
        $report = Build-HealthReport
        
        # Status line
        $statusColor = switch ($report.health.status) {
            "healthy" { "Green" }
            "degraded" { "Yellow" }
            default { "Red" }
        }
        
        $serviceStatus = $report.services.Values | ForEach-Object { 
            "$($_.name):$(if ($_.status -eq 'online') { 'OK' } else { '--' })" 
        }
        
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] " -NoNewline
        Write-Host "$($report.health.status.ToUpper())" -ForegroundColor $statusColor -NoNewline
        Write-Host " | $($serviceStatus -join ' | ')" -NoNewline
        if ($report.gpu -and $report.gpu.status -eq "available") {
            Write-Host " | GPU: $($report.gpu.memory_used_mb)MB/$($report.gpu.memory_total_mb)MB" -NoNewline
        }
        Write-Host ""
        
        # Always try to save/send even if metrics collection had issues
        try { Save-LocalState -Report $report } catch { 
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] State save failed: $_" -ForegroundColor Yellow 
        }
        try { Send-WebhookReport -Report $report } catch { 
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Webhook send failed: $_" -ForegroundColor Yellow 
        }
        
        $consecutiveErrors = 0
    }
    catch {
        $consecutiveErrors++
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ERROR in health loop: $($_.Exception.Message)" -ForegroundColor Red
        
        if ($consecutiveErrors -ge $maxConsecutiveErrors) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Too many consecutive errors ($consecutiveErrors), sleeping 5 minutes..." -ForegroundColor Red
            Start-Sleep -Seconds 300
            $consecutiveErrors = 0
        }
    }
    
    Start-Sleep -Seconds $IntervalSeconds
}
