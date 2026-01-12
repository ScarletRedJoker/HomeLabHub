# Ollama Setup Script for Windows VM with GPU
# Run this in PowerShell as Administrator on your Windows VM (100.118.44.102)

Write-Host "=== Ollama GPU Setup for Nebula Command ===" -ForegroundColor Cyan

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Please run this script as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell -> Run as Administrator" -ForegroundColor Yellow
    exit 1
}

# Step 1: Install Ollama
Write-Host "`n[1/5] Installing Ollama..." -ForegroundColor Green
if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Write-Host "Ollama already installed!" -ForegroundColor Yellow
} else {
    Write-Host "Downloading Ollama installer..."
    $installerUrl = "https://ollama.com/download/OllamaSetup.exe"
    $installerPath = "$env:TEMP\OllamaSetup.exe"
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
    Write-Host "Running installer (follow the prompts)..."
    Start-Process -FilePath $installerPath -Wait
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Step 2: Configure firewall rule for Tailscale access
Write-Host "`n[2/5] Configuring firewall for Tailscale access..." -ForegroundColor Green
$ruleName = "Ollama API (Tailscale)"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
    Write-Host "Firewall rule already exists" -ForegroundColor Yellow
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 11434 -Action Allow -Profile Any
    Write-Host "Firewall rule created for port 11434" -ForegroundColor Green
}

# Step 3: Set Ollama to listen on all interfaces
Write-Host "`n[3/5] Configuring Ollama to listen on 0.0.0.0..." -ForegroundColor Green
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "Machine")
$env:OLLAMA_HOST = "0.0.0.0:11434"
Write-Host "Set OLLAMA_HOST=0.0.0.0:11434" -ForegroundColor Green

# Step 4: Create startup task
Write-Host "`n[4/5] Creating startup task..." -ForegroundColor Green
$taskName = "OllamaServe"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$ollamaPath = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (-not $ollamaPath) {
    $ollamaPath = "C:\Users\$env:USERNAME\AppData\Local\Programs\Ollama\ollama.exe"
}

$action = New-ScheduledTaskAction -Execute $ollamaPath -Argument "serve"
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
Write-Host "Startup task created" -ForegroundColor Green

# Step 5: Start Ollama and pull models
Write-Host "`n[5/5] Starting Ollama and pulling models..." -ForegroundColor Green

# Kill any existing Ollama process and restart
Stop-Process -Name "ollama" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start Ollama serve in background
Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden

Write-Host "Waiting for Ollama to start..."
Start-Sleep -Seconds 5

# Check if Ollama is running
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/version" -TimeoutSec 10
    Write-Host "Ollama is running! Version: $($response.version)" -ForegroundColor Green
} catch {
    Write-Host "Warning: Could not verify Ollama is running. You may need to restart." -ForegroundColor Yellow
}

# Pull recommended models
Write-Host "`nPulling AI models (this may take a while)..." -ForegroundColor Cyan

$models = @("llama3.1:8b", "mistral:7b")
foreach ($model in $models) {
    Write-Host "Pulling $model..." -ForegroundColor Yellow
    & ollama pull $model
}

# Final verification
Write-Host "`n=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "Ollama is configured to:" -ForegroundColor White
Write-Host "  - Listen on 0.0.0.0:11434 (accessible via Tailscale)" -ForegroundColor White
Write-Host "  - Start automatically on login" -ForegroundColor White
Write-Host "  - Use your RTX 3060 for GPU acceleration" -ForegroundColor White

Write-Host "`nTo verify from your Linode server, run:" -ForegroundColor Yellow
Write-Host "  curl http://100.118.44.102:11434/api/version" -ForegroundColor Gray

Write-Host "`nInstalled models:" -ForegroundColor Yellow
& ollama list

Write-Host "`nDone! Your Windows VM is ready for local AI." -ForegroundColor Green
