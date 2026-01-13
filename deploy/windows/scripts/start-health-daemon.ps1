# Windows AI Health Daemon - Continuous Health Reporting
# Sends health updates to Nebula Command dashboard every 30 seconds
# 
# Usage: .\start-health-daemon.ps1 -WebhookUrl "https://your-dashboard.com/api/ai/health-webhook"
# Or set environment variable: $env:NEBULA_HEALTH_WEBHOOK

param(
    [int]$IntervalSeconds = 30,
    [string]$WebhookUrl = $env:NEBULA_HEALTH_WEBHOOK
)

if (-not $WebhookUrl) {
    Write-Host "ERROR: No webhook URL specified!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Set the NEBULA_HEALTH_WEBHOOK environment variable:" -ForegroundColor Yellow
    Write-Host '  $env:NEBULA_HEALTH_WEBHOOK = "https://your-dashboard/api/ai/health-webhook"'
    Write-Host ""
    Write-Host "Or pass it as a parameter:" -ForegroundColor Yellow
    Write-Host '  .\start-health-daemon.ps1 -WebhookUrl "https://your-dashboard/api/ai/health-webhook"'
    exit 1
}

Write-Host "===== Nebula Command - Windows AI Health Daemon =====" -ForegroundColor Cyan
Write-Host "Webhook URL: $WebhookUrl" -ForegroundColor Yellow
Write-Host "Interval: ${IntervalSeconds}s" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop"
Write-Host ""

function Get-OllamaModels {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
        return ($response.models | ForEach-Object { $_.name }) -join ","
    } catch {
        return $null
    }
}

function Test-ServicePort {
    param([int]$Port, [string]$Path = "/")
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port$Path" -TimeoutSec 3 -UseBasicParsing
        return $true
    } catch {
        return $false
    }
}

function Get-GpuInfo {
    try {
        $nvsmi = & nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits 2>$null
        if ($nvsmi) {
            $parts = $nvsmi -split ","
            return @{
                name = $parts[0].Trim()
                memory_used_mb = [int]$parts[1].Trim()
                memory_total_mb = [int]$parts[2].Trim()
                utilization_percent = [int]$parts[3].Trim()
                temperature_c = [int]$parts[4].Trim()
                status = "online"
            }
        }
    } catch {}
    return @{ status = "unknown"; error = "nvidia-smi not available" }
}

function Send-HealthReport {
    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    
    # Check Ollama
    $ollamaOnline = Test-ServicePort -Port 11434 -Path "/api/version"
    $ollamaModels = if ($ollamaOnline) { Get-OllamaModels } else { $null }
    
    # Check Stable Diffusion
    $sdOnline = Test-ServicePort -Port 7860 -Path "/"
    
    # Check ComfyUI
    $comfyOnline = Test-ServicePort -Port 8188 -Path "/system_stats"
    
    # Get GPU info
    $gpu = Get-GpuInfo
    
    # Build report
    $report = @{
        timestamp = $timestamp
        hostname = $env:COMPUTERNAME
        node_type = "windows_gpu"
        tailscale_ip = "100.118.44.102"
        services = @{
            ollama = @{
                name = "Ollama"
                status = if ($ollamaOnline) { "online" } else { "offline" }
                port = 11434
                url = "http://100.118.44.102:11434"
                details = @{ models = $ollamaModels }
            }
            stable_diffusion = @{
                name = "Stable Diffusion WebUI"
                status = if ($sdOnline) { "online" } else { "offline" }
                port = 7860
                url = "http://100.118.44.102:7860"
            }
            comfyui = @{
                name = "ComfyUI"
                status = if ($comfyOnline) { "online" } else { "offline" }
                port = 8188
                url = "http://100.118.44.102:8188"
            }
        }
        gpu = $gpu
        health = @{
            status = if ($ollamaOnline) { "healthy" } else { "degraded" }
            services_online = @($ollamaOnline, $sdOnline, $comfyOnline).Where({$_}).Count
            services_total = 3
        }
    }
    
    # Send report
    try {
        $body = $report | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 | Out-Null
        
        $onlineCount = $report.health.services_online
        $statusColor = if ($onlineCount -eq 3) { "Green" } elseif ($onlineCount -gt 0) { "Yellow" } else { "Red" }
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Sent: $onlineCount/3 services online | GPU: $($gpu.memory_used_mb)MB / $($gpu.memory_total_mb)MB" -ForegroundColor $statusColor
        
        return $true
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Failed: $_" -ForegroundColor Red
        return $false
    }
}

# Send initial report
Write-Host "Sending initial health report..." -ForegroundColor Yellow
Send-HealthReport | Out-Null

# Continuous loop
while ($true) {
    Start-Sleep -Seconds $IntervalSeconds
    Send-HealthReport | Out-Null
}
