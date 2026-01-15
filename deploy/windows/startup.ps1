<#
.SYNOPSIS
    Nebula Command - Windows VM Startup Script
    Environment bootstrap for AI services

.DESCRIPTION
    This script is idempotent - safe to run multiple times.
    It configures the environment, loads secrets, and starts all AI services.

.PARAMETER SkipRegistration
    Skip registering with the service registry
#>

param(
    [switch]$SkipRegistration
)

$ErrorActionPreference = "Continue"

$env:NEBULA_ENV = "windows-vm"
$env:NEBULA_ROLE = "agent"

$NebulaDir = $env:NEBULA_DIR
if (-not $NebulaDir) { $NebulaDir = "C:\NebulaCommand" }
$SecretsDir = "$NebulaDir\secrets"
$LogDir = "C:\ProgramData\NebulaCommand\logs"
$EnvFile = "$NebulaDir\.env"
$TokenFile = "$SecretsDir\agent-token.json"

function Write-Log {
    param(
        [string]$Level,
        [string]$Message
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    $color = switch ($Level) {
        "INFO"  { "Green" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        default { "White" }
    }
    
    Write-Host $logEntry -ForegroundColor $color
    
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Add-Content -Path "$LogDir\startup.log" -Value $logEntry
}

function Detect-Environment {
    Write-Log "INFO" "Detecting environment..."
    
    $hostname = $env:COMPUTERNAME
    $platform = [System.Environment]::OSVersion.Platform
    
    if ($platform -eq "Win32NT") {
        Write-Log "INFO" "  Detected: Windows VM (AI workstation)"
        Write-Log "INFO" "  Hostname: $hostname"
    }
    
    if (Get-Command "nvidia-smi" -ErrorAction SilentlyContinue) {
        try {
            $gpuInfo = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null
            Write-Log "INFO" "  GPU: $gpuInfo"
        }
        catch {
            Write-Log "WARN" "  GPU detection failed"
        }
    }
    
    $env:NEBULA_ENV = "windows-vm"
}

function Load-Secrets {
    Write-Log "INFO" "Loading secrets..."
    
    if (Test-Path $EnvFile) {
        Write-Log "INFO" "  Loading from $EnvFile"
        
        Get-Content $EnvFile | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#")) {
                $parts = $line -split "=", 2
                if ($parts.Count -eq 2) {
                    $key = $parts[0].Trim()
                    $value = $parts[1].Trim().Trim('"').Trim("'")
                    [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
                }
            }
        }
    }
    
    if (Test-Path $SecretsDir) {
        Write-Log "INFO" "  Loading from secrets directory"
        
        Get-ChildItem -Path $SecretsDir -File | ForEach-Object {
            $key = $_.BaseName
            $value = (Get-Content $_.FullName -Raw).Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    
    if (-not $env:NEBULA_AGENT_TOKEN) {
        Write-Log "WARN" "  NEBULA_AGENT_TOKEN not found, generating..."
        $token = Generate-AgentToken
        $env:NEBULA_AGENT_TOKEN = $token
    }
    
    Write-Log "INFO" "  Secrets loaded"
}

function Generate-AgentToken {
    Write-Log "INFO" "Generating agent token..."
    
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $token = [Convert]::ToBase64String($bytes) -replace '\+', '-' -replace '/', '_' -replace '=', ''
    
    if (-not (Test-Path $SecretsDir)) {
        New-Item -ItemType Directory -Path $SecretsDir -Force | Out-Null
    }
    
    $tokenInfo = @{
        token = $token
        nodeId = $env:COMPUTERNAME
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
        expiresAt = (Get-Date).AddYears(1).ToUniversalTime().ToString("o")
    }
    
    $tokenInfo | ConvertTo-Json | Set-Content $TokenFile
    Write-Log "INFO" "  Token saved to $TokenFile"
    
    return $token
}

function Start-AIServices {
    Write-Log "INFO" "Starting AI services..."
    
    $nebulaAiScript = Join-Path $NebulaDir "deploy\windows\nebula-ai.ps1"
    
    if (Test-Path $nebulaAiScript) {
        Write-Log "INFO" "  Using nebula-ai.ps1 manager"
        & $nebulaAiScript start
    }
    else {
        Write-Log "INFO" "  Starting services individually..."
        
        if (Get-Command "ollama" -ErrorAction SilentlyContinue) {
            Write-Log "INFO" "    Starting Ollama..."
            Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
        }
        
        Start-NebulaAgent
    }
}

function Start-NebulaAgent {
    Write-Log "INFO" "Starting Nebula Agent..."
    
    $agentDir = Join-Path $NebulaDir "services\nebula-agent"
    
    if (-not (Test-Path $agentDir)) {
        Write-Log "WARN" "  Agent directory not found: $agentDir"
        return
    }
    
    Push-Location $agentDir
    
    if (Get-Command "pm2" -ErrorAction SilentlyContinue) {
        pm2 delete nebula-agent 2>$null
        pm2 start dist/index.js --name nebula-agent --update-env 2>$null
        pm2 save 2>$null
        Write-Log "INFO" "  Agent started via PM2"
    }
    else {
        Write-Log "INFO" "  Starting agent directly..."
        Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WindowStyle Hidden
    }
    
    Pop-Location
}

function Register-WithRegistry {
    if ($SkipRegistration) {
        Write-Log "INFO" "Skipping service registration (--SkipRegistration)"
        return
    }
    
    Write-Log "INFO" "Registering with service registry..."
    
    $dashboardUrl = $env:NEBULA_DASHBOARD_URL
    if (-not $dashboardUrl) {
        $dashboardUrl = "https://linode.evindrake.net"
    }
    
    $tailscaleIp = $null
    if (Get-Command "tailscale" -ErrorAction SilentlyContinue) {
        try {
            $tailscaleIp = & tailscale ip -4 2>$null
            Write-Log "INFO" "  Tailscale IP: $tailscaleIp"
        }
        catch {
            Write-Log "WARN" "  Tailscale not connected"
        }
    }
    
    $registration = @{
        name = "nebula-agent"
        environment = "windows-vm"
        endpoint = "http://$($tailscaleIp):9765"
        capabilities = @("ai", "gpu", "ollama", "comfyui", "stable-diffusion", "whisper")
        hostname = $env:COMPUTERNAME
        platform = "windows"
        startedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    
    try {
        $body = $registration | ConvertTo-Json
        Invoke-RestMethod -Uri "$dashboardUrl/api/server-registry" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10
        Write-Log "INFO" "  Registered with dashboard"
    }
    catch {
        Write-Log "WARN" "  Registration failed (dashboard may be unavailable)"
    }
}

function Verify-Services {
    Write-Log "INFO" "Verifying services..."
    
    Start-Sleep -Seconds 5
    
    $services = @(
        @{ name = "Agent"; url = "http://localhost:9765/api/health" },
        @{ name = "Ollama"; url = "http://localhost:11434/api/tags" },
        @{ name = "ComfyUI"; url = "http://localhost:8188/system_stats" },
        @{ name = "SD WebUI"; url = "http://localhost:7860/sdapi/v1/sd-models" }
    )
    
    foreach ($service in $services) {
        try {
            $response = Invoke-RestMethod -Uri $service.url -TimeoutSec 3 -ErrorAction SilentlyContinue
            Write-Log "INFO" "  $($service.name): healthy"
        }
        catch {
            Write-Log "WARN" "  $($service.name): not responding"
        }
    }
}

function Print-Summary {
    Write-Host ""
    Write-Log "INFO" "=========================================="
    Write-Log "INFO" "Windows VM Bootstrap Complete"
    Write-Log "INFO" "=========================================="
    Write-Host ""
    Write-Host "Environment: $env:NEBULA_ENV" -ForegroundColor Cyan
    Write-Host "Role: $env:NEBULA_ROLE" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Service URLs:" -ForegroundColor Yellow
    Write-Host "  Agent:              http://localhost:9765" -ForegroundColor White
    Write-Host "  Ollama:             http://localhost:11434" -ForegroundColor White
    Write-Host "  ComfyUI:            http://localhost:8188" -ForegroundColor White
    Write-Host "  Stable Diffusion:   http://localhost:7860" -ForegroundColor White
    Write-Host ""
    Write-Host "Capabilities:" -ForegroundColor Yellow
    Write-Host "  - Local LLM inference (Ollama)" -ForegroundColor White
    Write-Host "  - Image generation (ComfyUI, SD WebUI)" -ForegroundColor White
    Write-Host "  - Speech-to-text (Whisper)" -ForegroundColor White
    Write-Host "  - GPU-accelerated AI tasks" -ForegroundColor White
    Write-Host ""
}

function Main {
    Write-Host ""
    Write-Log "INFO" "=========================================="
    Write-Log "INFO" "Nebula Command - Windows VM Bootstrap"
    Write-Log "INFO" "Environment: $env:NEBULA_ENV | Role: $env:NEBULA_ROLE"
    Write-Log "INFO" "=========================================="
    Write-Host ""
    
    Detect-Environment
    Load-Secrets
    Start-AIServices
    Register-WithRegistry
    Verify-Services
    Print-Summary
}

Main
