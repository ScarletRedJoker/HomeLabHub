# KVM Windows Agent Installer
# One-command installer for the KVM Windows Agent
#
# Usage (run as Administrator):
#   iwr https://your-server/install-windows-agent.ps1 | iex
#   # or
#   .\install-windows-agent.ps1
#
# This script will:
#   1. Create installation directory
#   2. Copy/download the agent script
#   3. Create Windows Service using NSSM or Task Scheduler
#   4. Configure firewall rules
#   5. Start the agent immediately

param(
    [string]$InstallPath = "$env:ProgramFiles\KVMAgent",
    [int]$Port = 8765,
    [switch]$Uninstall,
    [string]$AgentScriptUrl = ""
)

$ErrorActionPreference = "Stop"
$ServiceName = "KVMAgent"
$TaskName = "KVMWindowsAgent"

function Write-Status {
    param([string]$Message, [string]$Type = "INFO")
    $color = switch ($Type) {
        "SUCCESS" { "Green" }
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        default { "Cyan" }
    }
    Write-Host "[$Type] $Message" -ForegroundColor $color
}

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-Agent {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  KVM Windows Agent Installer" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    if (-not (Test-Administrator)) {
        Write-Status "This script requires Administrator privileges!" "ERROR"
        Write-Host "Please run PowerShell as Administrator and try again."
        exit 1
    }
    
    Write-Status "Creating installation directory: $InstallPath"
    if (-not (Test-Path $InstallPath)) {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    }
    
    $agentScript = Join-Path $InstallPath "windows-agent.ps1"
    
    # Use PSScriptRoot which is more reliable than MyInvocation.MyCommand.Path
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
    $localAgent = if ($scriptDir) { Join-Path $scriptDir "windows-agent.ps1" } else { $null }
    
    if ($localAgent -and (Test-Path $localAgent)) {
        Write-Status "Copying agent from local directory..."
        Copy-Item -Path $localAgent -Destination $agentScript -Force
    } elseif ($AgentScriptUrl) {
        Write-Status "Downloading agent from: $AgentScriptUrl"
        try {
            Invoke-WebRequest -Uri $AgentScriptUrl -OutFile $agentScript -UseBasicParsing
        } catch {
            Write-Status "Failed to download agent: $_" "ERROR"
            exit 1
        }
    } else {
        Write-Status "Creating embedded agent script..."
        $embeddedAgent = @'
# KVM Windows Agent - Embedded Version
# See full version at: https://github.com/your-repo/windows-agent.ps1

param([int]$Port = 8765)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")

try { $listener.Start() } catch {
    Write-Host "Failed to start on port $Port - try running as Admin"
    exit 1
}

Write-Host "KVM Agent running on port $Port"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $path = $context.Request.Url.LocalPath
    $method = $context.Request.HttpMethod
    
    $result = switch ($path) {
        "/health" {
            @{
                status = "healthy"
                hostname = $env:COMPUTERNAME
                timestamp = (Get-Date).ToString("o")
                sunshine = @{
                    running = $null -ne (Get-Process -Name "sunshine" -EA SilentlyContinue)
                }
            }
        }
        "/mode/gaming" {
            if ($method -eq "POST") {
                $svc = Get-Service -Name "Sunshine*" -EA SilentlyContinue | Select -First 1
                if ($svc) { Start-Service $svc.Name -EA SilentlyContinue }
                @{ success = $true; mode = "gaming" }
            } else { @{ error = "Use POST" } }
        }
        "/mode/desktop" {
            if ($method -eq "POST") {
                Stop-Process -Name "sunshine" -Force -EA SilentlyContinue
                @{ success = $true; mode = "desktop" }
            } else { @{ error = "Use POST" } }
        }
        default { @{ endpoints = @("/health", "/mode/gaming", "/mode/desktop") } }
    }
    
    $json = $result | ConvertTo-Json -Compress
    $buffer = [Text.Encoding]::UTF8.GetBytes($json)
    $context.Response.ContentType = "application/json"
    $context.Response.AddHeader("Access-Control-Allow-Origin", "*")
    $context.Response.OutputStream.Write($buffer, 0, $buffer.Length)
    $context.Response.Close()
}
'@
        Set-Content -Path $agentScript -Value $embeddedAgent
        Write-Status "Note: Using embedded minimal agent. For full features, copy windows-agent.ps1 to $InstallPath" "WARN"
    }
    
    if (-not (Test-Path $agentScript)) {
        Write-Status "Agent script not found at $agentScript" "ERROR"
        exit 1
    }
    
    Write-Status "Configuring firewall rules..."
    
    $existingRule = Get-NetFirewallRule -DisplayName "KVM Agent HTTP" -ErrorAction SilentlyContinue
    if ($existingRule) {
        Remove-NetFirewallRule -DisplayName "KVM Agent HTTP" -ErrorAction SilentlyContinue
    }
    
    New-NetFirewallRule -DisplayName "KVM Agent HTTP" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $Port `
        -Action Allow `
        -Profile Any `
        -Description "Allow KVM Agent HTTP API access" | Out-Null
    
    Write-Status "Firewall rule created for port $Port" "SUCCESS"
    
    Write-Status "Registering URL ACL..."
    netsh http delete urlacl url="http://+:$Port/" 2>$null | Out-Null
    netsh http add urlacl url="http://+:$Port/" user=Everyone | Out-Null
    
    Write-Status "Setting up scheduled task for auto-start..."
    
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    
    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agentScript`" -Port $Port"
    
    $trigger = New-ScheduledTaskTrigger -AtStartup
    
    $principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest
    
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Days 9999)
    
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description "KVM Windows Agent - HTTP API for remote control" | Out-Null
    
    Write-Status "Scheduled task registered: $TaskName" "SUCCESS"
    
    Write-Status "Starting agent..."
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 3
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 5
        Write-Status "Agent is running and responding!" "SUCCESS"
    } catch {
        Write-Status "Agent started but health check failed - it may still be initializing" "WARN"
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Installation Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Agent Details:" -ForegroundColor Yellow
    Write-Host "  Install Path: $InstallPath"
    Write-Host "  Port:         $Port"
    Write-Host "  Task Name:    $TaskName"
    Write-Host ""
    Write-Host "Endpoints:" -ForegroundColor Yellow
    Write-Host "  GET  http://localhost:$Port/health"
    Write-Host "  GET  http://localhost:$Port/diagnostics"
    Write-Host "  POST http://localhost:$Port/mode/gaming"
    Write-Host "  POST http://localhost:$Port/mode/desktop"
    Write-Host "  POST http://localhost:$Port/restart-sunshine"
    Write-Host ""
    Write-Host "Management Commands:" -ForegroundColor Cyan
    Write-Host "  View logs:    Get-Content `"$env:ProgramData\KVMAgent\agent.log`" -Tail 50"
    Write-Host "  Stop agent:   Stop-ScheduledTask -TaskName $TaskName"
    Write-Host "  Start agent:  Start-ScheduledTask -TaskName $TaskName"
    Write-Host "  Uninstall:    .\install-windows-agent.ps1 -Uninstall"
    Write-Host ""
}

function Uninstall-Agent {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "  KVM Windows Agent Uninstaller" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    
    if (-not (Test-Administrator)) {
        Write-Status "This script requires Administrator privileges!" "ERROR"
        exit 1
    }
    
    Write-Status "Stopping agent..."
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    
    Write-Status "Removing scheduled task..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    
    Write-Status "Removing firewall rule..."
    Remove-NetFirewallRule -DisplayName "KVM Agent HTTP" -ErrorAction SilentlyContinue
    
    Write-Status "Removing URL ACL..."
    netsh http delete urlacl url="http://+:$Port/" 2>$null | Out-Null
    
    Write-Status "Removing installation directory..."
    if (Test-Path $InstallPath) {
        Remove-Item -Path $InstallPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    Write-Host ""
    Write-Status "KVM Windows Agent has been uninstalled" "SUCCESS"
    Write-Host ""
}

if ($Uninstall) {
    Uninstall-Agent
} else {
    Install-Agent
}
