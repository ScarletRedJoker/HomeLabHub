# Nebula Command - Windows AI Setup Script
# Run as Administrator

param(
    [switch]$SkipOllama,
    [switch]$SkipStableDiffusion,
    [switch]$SkipComfyUI,
    [switch]$SkipWhisper,
    [switch]$InstallTraining,
    [switch]$Unattended
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$ConfigDir = Join-Path $RootDir "configs"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " Nebula Command - Windows AI Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

# Load environment config if exists
$envConfig = Join-Path $ConfigDir "environment.ps1"
if (Test-Path $envConfig) {
    Write-Host "[Config] Loading environment configuration..." -ForegroundColor Green
    . $envConfig
} else {
    Write-Host "[Config] No environment.ps1 found. Using defaults." -ForegroundColor Yellow
    Write-Host "[Config] Copy configs\environment.ps1.example to configs\environment.ps1 and configure." -ForegroundColor Yellow
}

# Create directories
$dirs = @(
    "C:\AI",
    "C:\AI\models",
    "C:\AI\Training",
    "C:\ProgramData\NebulaCommand",
    "C:\ProgramData\NebulaCommand\logs"
)
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "[Setup] Created directory: $dir" -ForegroundColor Green
    }
}

# Check prerequisites
Write-Host ""
Write-Host "[Prerequisites] Checking system requirements..." -ForegroundColor Cyan

# Check NVIDIA GPU
$gpu = Get-CimInstance -ClassName Win32_VideoController | Where-Object { $_.Name -like "*NVIDIA*" }
if (-not $gpu) {
    Write-Host "[Prerequisites] WARNING: No NVIDIA GPU detected!" -ForegroundColor Yellow
} else {
    Write-Host "[Prerequisites] GPU: $($gpu.Name)" -ForegroundColor Green
}

# Check nvidia-smi
try {
    $nvidiaSmi = & nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>$null
    Write-Host "[Prerequisites] NVIDIA Driver: OK (VRAM: ${nvidiaSmi}MB)" -ForegroundColor Green
} catch {
    Write-Host "[Prerequisites] WARNING: nvidia-smi not found. Install NVIDIA drivers." -ForegroundColor Yellow
}

# Check Python
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    $pyVersion = & python --version 2>$null
    Write-Host "[Prerequisites] Python: $pyVersion" -ForegroundColor Green
} else {
    Write-Host "[Prerequisites] WARNING: Python not found. Required for Stable Diffusion." -ForegroundColor Yellow
}

# Check Git
$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) {
    Write-Host "[Prerequisites] Git: OK" -ForegroundColor Green
} else {
    Write-Host "[Prerequisites] WARNING: Git not found. Installing via winget..." -ForegroundColor Yellow
    if (-not $Unattended) {
        winget install Git.Git --accept-source-agreements --accept-package-agreements
    }
}

# Check Tailscale
$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
if ($tailscale) {
    $tsStatus = & tailscale status 2>$null
    Write-Host "[Prerequisites] Tailscale: OK" -ForegroundColor Green
} else {
    Write-Host "[Prerequisites] WARNING: Tailscale not installed. Required for dashboard integration." -ForegroundColor Yellow
}

Write-Host ""

# Install Ollama
if (-not $SkipOllama) {
    Write-Host "[Ollama] Installing Ollama..." -ForegroundColor Cyan
    
    $ollamaInstalled = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollamaInstalled) {
        Write-Host "[Ollama] Already installed" -ForegroundColor Green
    } else {
        Write-Host "[Ollama] Downloading installer..." -ForegroundColor Yellow
        $ollamaInstaller = "$env:TEMP\OllamaSetup.exe"
        Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $ollamaInstaller
        
        Write-Host "[Ollama] Running installer..." -ForegroundColor Yellow
        Start-Process -FilePath $ollamaInstaller -ArgumentList "/S" -Wait
        
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }
    
    # Ensure Ollama server is running before pulling models
    Write-Host "[Ollama] Starting Ollama server..." -ForegroundColor Yellow
    $ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
    if (-not $ollamaProcess) {
        # Start Ollama serve in background
        Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
        Write-Host "[Ollama] Waiting for server to start..." -ForegroundColor Yellow
        
        # Wait for Ollama API to respond (up to 30 seconds)
        $maxRetries = 30
        $retryCount = 0
        $serverReady = $false
        
        while (-not $serverReady -and $retryCount -lt $maxRetries) {
            Start-Sleep -Seconds 1
            $retryCount++
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($response.StatusCode -eq 200) {
                    $serverReady = $true
                    Write-Host "[Ollama] Server ready!" -ForegroundColor Green
                }
            } catch {
                Write-Host "[Ollama] Waiting... ($retryCount/$maxRetries)" -ForegroundColor Gray
            }
        }
        
        if (-not $serverReady) {
            Write-Host "[Ollama] WARNING: Server did not start in time. Skipping model pull." -ForegroundColor Yellow
            Write-Host "[Ollama] Run 'ollama serve' manually, then 'ollama pull qwen2.5-coder:7b'" -ForegroundColor Yellow
        }
    } else {
        $serverReady = $true
        Write-Host "[Ollama] Server already running" -ForegroundColor Green
    }
    
    # Pull recommended models only if server is ready
    if ($serverReady) {
        $defaultModel = if ($env:DEFAULT_LLM_MODEL) { $env:DEFAULT_LLM_MODEL } else { "qwen2.5-coder:7b" }
        Write-Host "[Ollama] Pulling default model: $defaultModel" -ForegroundColor Yellow
        & ollama pull $defaultModel
        
        Write-Host "[Ollama] Pulling embeddings model..." -ForegroundColor Yellow
        & ollama pull nomic-embed-text
    }
    
    Write-Host "[Ollama] Installation complete" -ForegroundColor Green
}

# Install Stable Diffusion WebUI
if (-not $SkipStableDiffusion) {
    Write-Host ""
    Write-Host "[Stable Diffusion] Setting up AUTOMATIC1111 WebUI..." -ForegroundColor Cyan
    
    $sdPath = if ($env:SD_WEBUI_PATH) { $env:SD_WEBUI_PATH } else { "C:\AI\stable-diffusion-webui" }
    
    if (Test-Path $sdPath) {
        Write-Host "[Stable Diffusion] Already installed at $sdPath" -ForegroundColor Green
    } else {
        Write-Host "[Stable Diffusion] Cloning repository..." -ForegroundColor Yellow
        & git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git $sdPath
        
        # Create webui-user.bat with optimal settings (skip Stability-AI repo that requires auth)
        $webuiUser = @"
@echo off
set PYTHON=
set GIT=
set VENV_DIR=
set COMMANDLINE_ARGS=--xformers --api --listen --port 7860 --enable-insecure-extension-access --no-download-sd-model
"@
        $webuiUser | Set-Content -Path "$sdPath\webui-user.bat"
        
        # Note: First-time setup requires interaction for git auth
        # Skip auto-setup in unattended mode - user will run webui.bat manually
        if ($Unattended) {
            Write-Host "[Stable Diffusion] Skipping first-time setup (unattended mode)" -ForegroundColor Yellow
            Write-Host "[Stable Diffusion] To complete setup, run: cd $sdPath && .\webui.bat" -ForegroundColor Yellow
            Write-Host "[Stable Diffusion] Note: May require GitHub authentication for Stability-AI repo" -ForegroundColor Yellow
        } else {
            Write-Host "[Stable Diffusion] Running first-time setup (this may take a while)..." -ForegroundColor Yellow
            Write-Host "[Stable Diffusion] Note: If prompted for GitHub auth, you may need to create a Personal Access Token" -ForegroundColor Yellow
            Push-Location $sdPath
            try {
                & .\webui.bat --exit
            } catch {
                Write-Host "[Stable Diffusion] Setup encountered an error. Run webui.bat manually to complete." -ForegroundColor Yellow
            }
            Pop-Location
        }
    }
    
    Write-Host "[Stable Diffusion] Installation complete" -ForegroundColor Green
}

# Install ComfyUI
if (-not $SkipComfyUI) {
    Write-Host ""
    Write-Host "[ComfyUI] Setting up ComfyUI..." -ForegroundColor Cyan
    
    $comfyPath = if ($env:COMFYUI_PATH) { $env:COMFYUI_PATH } else { "C:\AI\ComfyUI" }
    
    if (Test-Path $comfyPath) {
        Write-Host "[ComfyUI] Already installed at $comfyPath" -ForegroundColor Green
    } else {
        Write-Host "[ComfyUI] Cloning repository..." -ForegroundColor Yellow
        & git clone https://github.com/comfyanonymous/ComfyUI.git $comfyPath
        
        Push-Location $comfyPath
        Write-Host "[ComfyUI] Installing dependencies..." -ForegroundColor Yellow
        & pip install -r requirements.txt
        & pip install xformers
        Pop-Location
        
        # Install ComfyUI Manager
        $customNodesPath = "$comfyPath\custom_nodes"
        if (-not (Test-Path $customNodesPath)) {
            New-Item -ItemType Directory -Path $customNodesPath -Force | Out-Null
        }
        
        Write-Host "[ComfyUI] Installing ComfyUI-Manager..." -ForegroundColor Yellow
        & git clone https://github.com/ltdrdata/ComfyUI-Manager.git "$customNodesPath\ComfyUI-Manager"
    }
    
    Write-Host "[ComfyUI] Installation complete" -ForegroundColor Green
}

# Install Whisper (optional)
if (-not $SkipWhisper) {
    Write-Host ""
    Write-Host "[Whisper] Setting up Whisper.cpp..." -ForegroundColor Cyan
    
    $whisperPath = if ($env:WHISPER_PATH) { $env:WHISPER_PATH } else { "C:\AI\whisper.cpp" }
    
    if (Test-Path $whisperPath) {
        Write-Host "[Whisper] Already installed at $whisperPath" -ForegroundColor Green
    } else {
        Write-Host "[Whisper] Cloning repository..." -ForegroundColor Yellow
        & git clone https://github.com/ggerganov/whisper.cpp.git $whisperPath
        
        Write-Host "[Whisper] Building with CUDA support..." -ForegroundColor Yellow
        Write-Host "[Whisper] Note: Requires Visual Studio Build Tools and CUDA Toolkit" -ForegroundColor Yellow
    }
    
    Write-Host "[Whisper] Installation complete" -ForegroundColor Green
}

# Install Training Tools
if ($InstallTraining) {
    Write-Host ""
    Write-Host "[Training] Setting up training tools..." -ForegroundColor Cyan
    
    # kohya_ss for LoRA training
    $kohyaPath = if ($env:KOHYA_SS_PATH) { $env:KOHYA_SS_PATH } else { "C:\AI\kohya_ss" }
    if (-not (Test-Path $kohyaPath)) {
        Write-Host "[Training] Installing kohya_ss for LoRA training..." -ForegroundColor Yellow
        & git clone https://github.com/bmaltais/kohya_ss.git $kohyaPath
        Push-Location $kohyaPath
        & .\setup.bat
        Pop-Location
    }
    
    Write-Host "[Training] Training tools installation complete" -ForegroundColor Green
}

# Register scheduled tasks for auto-start
Write-Host ""
Write-Host "[Services] Configuring Windows services..." -ForegroundColor Cyan

# Create startup script
$startupScript = @"
# Nebula Command AI Services Startup
Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
Start-Sleep -Seconds 5
Start-Process "C:\AI\stable-diffusion-webui\webui.bat" -WindowStyle Minimized
Start-Process python -ArgumentList "C:\AI\ComfyUI\main.py --listen 0.0.0.0 --port 8188" -WindowStyle Hidden
"@
$startupScript | Set-Content -Path "C:\ProgramData\NebulaCommand\startup.ps1"

# Register with Task Scheduler
$taskName = "NebulaAI-Supervisor"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $existingTask) {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$ScriptDir\windows-ai-supervisor.ps1`" -Action start"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Nebula Command AI Service Supervisor"
    Write-Host "[Services] Registered startup task: $taskName" -ForegroundColor Green
} else {
    Write-Host "[Services] Startup task already exists: $taskName" -ForegroundColor Green
}

# Register health daemon
$healthTaskName = "NebulaAI-HealthDaemon"
$existingHealthTask = Get-ScheduledTask -TaskName $healthTaskName -ErrorAction SilentlyContinue
if (-not $existingHealthTask) {
    $healthAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$ScriptDir\vm-ai-health-daemon.ps1`""
    $healthTrigger = New-ScheduledTaskTrigger -AtStartup
    $healthPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $healthSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    
    Register-ScheduledTask -TaskName $healthTaskName -Action $healthAction -Trigger $healthTrigger -Principal $healthPrincipal -Settings $healthSettings -Description "Nebula Command AI Health Reporter"
    Write-Host "[Services] Registered health daemon task: $healthTaskName" -ForegroundColor Green
} else {
    Write-Host "[Services] Health daemon task already exists: $healthTaskName" -ForegroundColor Green
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host " Installation Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Configure configs\environment.ps1 with your dashboard webhook URL" -ForegroundColor White
Write-Host "2. Start services: .\scripts\windows-ai-supervisor.ps1 -Action start" -ForegroundColor White
Write-Host "3. Verify health reporting at your dashboard" -ForegroundColor White
Write-Host ""
Write-Host "Service URLs:" -ForegroundColor Cyan
Write-Host "  Ollama API:         http://localhost:11434" -ForegroundColor White
Write-Host "  Stable Diffusion:   http://localhost:7860" -ForegroundColor White
Write-Host "  ComfyUI:            http://localhost:8188" -ForegroundColor White
Write-Host ""
