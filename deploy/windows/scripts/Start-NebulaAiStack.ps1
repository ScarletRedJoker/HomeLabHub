# Nebula Command - Unified AI Stack Startup
# This script validates dependencies, repairs issues, and starts all AI services
# Run as Administrator: .\Start-NebulaAiStack.ps1

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "status", "repair", "install", "validate")]
    [string]$Action = "start",
    
    [switch]$SkipValidation,
    [switch]$Force
)

$ErrorActionPreference = "Continue"

# Configuration
$Script:Config = @{
    LogDir = "C:\ProgramData\NebulaCommand\logs"
    StateFile = "C:\ProgramData\NebulaCommand\ai-state.json"
    
    # Python requirements
    RequiredPythonMajor = 3
    RequiredPythonMinor = 10  # 3.10 is the LTS for AI
    MaxPythonMinor = 12       # 3.14 is too new - no CUDA wheels available
    
    # Paths
    Python310Path = "C:\Python310\python.exe"
    AiVenvPath = "C:\AI\.venv"
    ComfyUIPath = "C:\AI\ComfyUI"
    # Prefer Forge over original WebUI (better performance, fewer conflicts)
    StableDiffusionForgePath = "C:\AI\stable-diffusion-webui-forge"
    StableDiffusionPath = "C:\AI\stable-diffusion-webui"
    AgentPath = "C:\NebulaCommand\deploy\windows\agent"
    
    # Required PyTorch version with CUDA
    TorchVersion = "2.3.1"
    CudaVersion = "cu121"
    
    # Services (start order)
    Services = @(
        @{ Name = "Ollama"; Key = "ollama"; Port = 11434; Priority = 1 }
        @{ Name = "Stable Diffusion"; Key = "stable_diffusion"; Port = 7860; Priority = 2 }
        @{ Name = "ComfyUI"; Key = "comfyui"; Port = 8188; Priority = 3 }
        @{ Name = "Nebula Agent"; Key = "agent"; Port = 9765; Priority = 4 }
    )
}

# Logging
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "OK"    { "Green" }
        "STEP"  { "Cyan" }
        default { "White" }
    }
    
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
    
    $logFile = Join-Path $Script:Config.LogDir "ai-stack.log"
    if (Test-Path (Split-Path $logFile -Parent)) {
        Add-Content -Path $logFile -Value "[$timestamp] [$Level] $Message" -ErrorAction SilentlyContinue
    }
}

function Initialize-Environment {
    # Create directories
    @(
        "C:\ProgramData\NebulaCommand",
        $Script:Config.LogDir,
        "C:\AI"
    ) | ForEach-Object {
        if (-not (Test-Path $_)) {
            New-Item -ItemType Directory -Path $_ -Force | Out-Null
            Write-Log "Created directory: $_" "INFO"
        }
    }
}

# ============================================================================
# PYTHON VALIDATION
# ============================================================================

function Get-PythonInfo {
    param([string]$PythonPath = "python")
    
    try {
        $versionOutput = & $PythonPath --version 2>&1
        if ($versionOutput -match "Python (\d+)\.(\d+)\.(\d+)") {
            return @{
                Path = $PythonPath
                Major = [int]$Matches[1]
                Minor = [int]$Matches[2]
                Patch = [int]$Matches[3]
                Version = "$($Matches[1]).$($Matches[2]).$($Matches[3])"
                IsValid = $true
            }
        }
    } catch {}
    
    return @{ IsValid = $false; Path = $PythonPath }
}

function Test-PythonVersion {
    Write-Log "Checking Python version..." "STEP"
    
    # Try multiple Python paths
    $pythonPaths = @(
        "python",
        "python3",
        "C:\Python310\python.exe",
        "C:\Python311\python.exe",
        "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python310\python.exe",
        "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python311\python.exe"
    )
    
    $validPython = $null
    $allVersions = @()
    
    foreach ($path in $pythonPaths) {
        $info = Get-PythonInfo -PythonPath $path
        if ($info.IsValid) {
            $allVersions += $info
            Write-Log "Found Python $($info.Version) at $path" "INFO"
            
            # Check if version is compatible
            if ($info.Major -eq $Script:Config.RequiredPythonMajor -and 
                $info.Minor -ge $Script:Config.RequiredPythonMinor -and
                $info.Minor -le $Script:Config.MaxPythonMinor) {
                $validPython = $info
                break
            }
        }
    }
    
    if (-not $validPython) {
        # Check the issue
        $systemPython = Get-PythonInfo -PythonPath "python"
        if ($systemPython.IsValid -and $systemPython.Minor -gt $Script:Config.MaxPythonMinor) {
            Write-Log "PROBLEM: Python $($systemPython.Version) is TOO NEW!" "ERROR"
            Write-Log "PyTorch does not have CUDA wheels for Python 3.13+" "ERROR"
            Write-Log "" "INFO"
            Write-Log "SOLUTION: Install Python 3.10 (LTS version for AI):" "WARN"
            Write-Log "  1. Download from: https://www.python.org/downloads/release/python-31011/" "INFO"
            Write-Log "  2. Install to C:\Python310" "INFO"
            Write-Log "  3. Re-run this script" "INFO"
            return $null
        }
        
        Write-Log "No compatible Python found (need 3.10-3.12)" "ERROR"
        return $null
    }
    
    Write-Log "Using Python $($validPython.Version)" "OK"
    return $validPython
}

# ============================================================================
# PYTORCH/CUDA VALIDATION
# ============================================================================

function Test-TorchCuda {
    param([string]$PythonPath)
    
    Write-Log "Checking PyTorch CUDA support..." "STEP"
    
    $scriptLines = @(
        "import torch"
        "print('TORCH_VERSION=' + torch.__version__)"
        "print('CUDA_AVAILABLE=' + str(torch.cuda.is_available()))"
        "if torch.cuda.is_available(): print('CUDA_VERSION=' + str(torch.version.cuda)); print('GPU_NAME=' + torch.cuda.get_device_name(0))"
        "else: print('CUDA_BUILD=false')"
    )
    $script = $scriptLines -join "; "
    
    try {
        $output = & $PythonPath -c $script 2>&1
        $result = @{}
        
        foreach ($line in $output) {
            if ($line -match "^(\w+)=(.*)$") {
                $result[$Matches[1]] = $Matches[2]
            }
        }
        
        if ($result.TORCH_INSTALLED -eq "false") {
            Write-Log "PyTorch is not installed" "WARN"
            return @{ NeedsRepair = $true; Reason = "not_installed" }
        }
        
        if ($result.ERROR) {
            Write-Log "PyTorch error: $($result.ERROR)" "ERROR"
            return @{ NeedsRepair = $true; Reason = "error"; Error = $result.ERROR }
        }
        
        if ($result.CUDA_AVAILABLE -eq "True") {
            Write-Log "PyTorch $($result.TORCH_VERSION) with CUDA $($result.CUDA_VERSION)" "OK"
            Write-Log "GPU: $($result.GPU_NAME)" "OK"
            return @{ NeedsRepair = $false; Version = $result.TORCH_VERSION }
        }
        
        if ($result.CUDA_BUILD -eq "false") {
            Write-Log "PyTorch installed WITHOUT CUDA support (CPU-only build)" "ERROR"
            Write-Log "This is the root cause of the Torch CUDA error" "WARN"
            return @{ NeedsRepair = $true; Reason = "cpu_only" }
        }
        
        Write-Log "PyTorch has CUDA build but CUDA not available - driver issue?" "WARN"
        return @{ NeedsRepair = $false; Warning = "cuda_driver" }
        
    } catch {
        Write-Log "Failed to check PyTorch: $_" "ERROR"
        return @{ NeedsRepair = $true; Reason = "check_failed" }
    }
}

function Repair-TorchCuda {
    param([string]$PythonPath)
    
    Write-Log "Repairing PyTorch with CUDA support..." "STEP"
    Write-Log "This may take several minutes..." "INFO"
    
    # Step 1: Uninstall existing torch
    Write-Log "Removing existing PyTorch..." "INFO"
    & $PythonPath -m pip uninstall torch torchvision torchaudio -y 2>&1 | Out-Null
    
    # Step 2: Install correct numpy first
    Write-Log "Installing numpy 1.26.4 (required for torch compatibility)..." "INFO"
    & $PythonPath -m pip install numpy==1.26.4 --quiet 2>&1
    
    # Step 3: Install protobuf
    Write-Log "Installing protobuf 5.28.3..." "INFO"
    & $PythonPath -m pip install protobuf==5.28.3 --quiet 2>&1
    
    # Step 4: Install PyTorch with CUDA from official index
    Write-Log "Installing PyTorch 2.3.1 with CUDA 12.1..." "INFO"
    $torchCmd = "$PythonPath -m pip install torch==2.3.1+cu121 torchvision==0.18.1+cu121 torchaudio==2.3.1+cu121 --index-url https://download.pytorch.org/whl/cu121"
    
    Write-Host ""
    Write-Host "Running: pip install torch==2.3.1+cu121 ..." -ForegroundColor Cyan
    Write-Host ""
    
    $result = & $PythonPath -m pip install torch==2.3.1+cu121 torchvision==0.18.1+cu121 torchaudio==2.3.1+cu121 --index-url https://download.pytorch.org/whl/cu121 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Failed to install PyTorch with CUDA" "ERROR"
        Write-Log "Output: $result" "ERROR"
        return $false
    }
    
    # Step 5: Verify installation
    $check = Test-TorchCuda -PythonPath $PythonPath
    if ($check.NeedsRepair) {
        Write-Log "PyTorch repair failed - still not working" "ERROR"
        return $false
    }
    
    Write-Log "PyTorch with CUDA installed successfully!" "OK"
    
    # Step 6: Install xformers for memory efficiency
    Write-Log "Installing xformers..." "INFO"
    & $PythonPath -m pip install xformers --no-build-isolation --quiet 2>&1
    
    return $true
}

# ============================================================================
# DEPENDENCY REPAIR
# ============================================================================

function Repair-AiDependencies {
    param([string]$PythonPath)
    
    Write-Log "Installing/repairing AI dependencies..." "STEP"
    
    $packages = @(
        "aiohttp",
        "alembic", 
        "pyyaml",
        "sqlalchemy",
        "einops",
        "safetensors",
        "transformers",
        "accelerate",
        "diffusers",
        "opencv-python",
        "Pillow",
        "scipy",
        "tqdm",
        "requests"
    )
    
    foreach ($pkg in $packages) {
        Write-Log "  Installing $pkg..." "INFO"
        & $PythonPath -m pip install $pkg --quiet 2>&1 | Out-Null
    }
    
    # Check for problematic packages
    Write-Log "Checking for problematic packages..." "INFO"
    
    # comfy_kitchen causes torch.library.custom_op errors
    $comfyKitchen = & $PythonPath -m pip show comfy_kitchen 2>&1
    if ($comfyKitchen -notmatch "not found") {
        Write-Log "Removing problematic comfy_kitchen package..." "WARN"
        & $PythonPath -m pip uninstall comfy_kitchen -y 2>&1 | Out-Null
    }
    
    Write-Log "Dependencies repaired" "OK"
}

# ============================================================================
# SERVICE MANAGEMENT
# ============================================================================

function Test-ServiceRunning {
    param([string]$Key, [int]$Port)
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        # Try connection test
        $conn = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue
        return $conn.TcpTestSucceeded
    }
}

function Start-Ollama {
    Write-Log "Starting Ollama..." "INFO"
    
    if (Test-ServiceRunning -Key "ollama" -Port 11434) {
        Write-Log "Ollama already running" "OK"
        return $true
    }
    
    # Set environment for listening on all interfaces
    $env:OLLAMA_HOST = "0.0.0.0"
    
    # Find ollama
    $ollamaPath = (Get-Command ollama -ErrorAction SilentlyContinue).Source
    if (-not $ollamaPath) {
        $ollamaPath = "C:\Users\$env:USERNAME\AppData\Local\Programs\Ollama\ollama.exe"
    }
    
    if (-not (Test-Path $ollamaPath)) {
        Write-Log "Ollama not found" "ERROR"
        return $false
    }
    
    Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 5
    
    if (Test-ServiceRunning -Key "ollama" -Port 11434) {
        Write-Log "Ollama started" "OK"
        return $true
    }
    
    Write-Log "Ollama failed to start" "ERROR"
    return $false
}

function Start-StableDiffusion {
    param([string]$PythonPath)
    
    Write-Log "Starting Stable Diffusion..." "INFO"
    
    if (Test-ServiceRunning -Key "stable_diffusion" -Port 7860) {
        Write-Log "Stable Diffusion already running" "OK"
        return $true
    }
    
    # Prefer Forge over original WebUI
    $forgePath = $Script:Config.StableDiffusionForgePath
    $originalPath = $Script:Config.StableDiffusionPath
    
    $sdPath = $null
    $sdType = $null
    
    if (Test-Path $forgePath) {
        $sdPath = $forgePath
        $sdType = "Forge"
        Write-Log "Using Stable Diffusion Forge (recommended)" "OK"
    } elseif (Test-Path $originalPath) {
        $sdPath = $originalPath
        $sdType = "WebUI"
        Write-Log "Using original Stable Diffusion WebUI" "INFO"
    } else {
        Write-Log "Stable Diffusion not found at $forgePath or $originalPath" "WARN"
        return $false
    }
    
    # Fix protobuf in venv if needed
    $venvPython = Join-Path $sdPath "venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        Write-Log "Checking venv protobuf version..." "INFO"
        $protobufCheck = & $venvPython -c "import google.protobuf; print(google.protobuf.__version__)" 2>&1
        if ($protobufCheck -notmatch "^[45]\.") {
            Write-Log "Fixing protobuf in SD venv..." "WARN"
            & $venvPython -m pip install protobuf==5.28.3 --quiet 2>&1 | Out-Null
        }
    }
    
    Push-Location $sdPath
    
    # Use webui-user.bat for proper venv activation
    $webui = Join-Path $sdPath "webui-user.bat"
    if (-not (Test-Path $webui)) {
        $webui = Join-Path $sdPath "webui.bat"
    }
    
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $webui -WindowStyle Hidden
    
    Pop-Location
    
    Write-Log "Stable Diffusion $sdType starting (takes 2-3 minutes to load models)..." "INFO"
    return $true
}

function Start-ComfyUI {
    param([string]$PythonPath)
    
    Write-Log "Starting ComfyUI..." "INFO"
    
    if (Test-ServiceRunning -Key "comfyui" -Port 8188) {
        Write-Log "ComfyUI already running" "OK"
        return $true
    }
    
    $comfyPath = $Script:Config.ComfyUIPath
    if (-not (Test-Path $comfyPath)) {
        Write-Log "ComfyUI not found at $comfyPath" "WARN"
        return $false
    }
    
    Push-Location $comfyPath
    
    # Start ComfyUI with correct Python
    Start-Process -FilePath $PythonPath -ArgumentList "main.py", "--listen", "0.0.0.0", "--port", "8188" -WindowStyle Hidden
    
    Pop-Location
    
    Write-Log "ComfyUI starting..." "INFO"
    return $true
}

function Start-NebulaAgent {
    Write-Log "Starting Nebula Agent..." "INFO"
    
    if (Test-ServiceRunning -Key "agent" -Port 9765) {
        Write-Log "Nebula Agent already running" "OK"
        return $true
    }
    
    $agentPath = $Script:Config.AgentPath
    if (-not (Test-Path $agentPath)) {
        Write-Log "Agent not found at $agentPath" "WARN"
        return $false
    }
    
    $serverJs = Join-Path $agentPath "server.js"
    if (-not (Test-Path $serverJs)) {
        Write-Log "Agent server.js not found" "WARN"
        return $false
    }
    
    $env:AGENT_PORT = "9765"
    
    Push-Location $agentPath
    Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden
    Pop-Location
    
    Start-Sleep -Seconds 3
    
    if (Test-ServiceRunning -Key "agent" -Port 9765) {
        Write-Log "Nebula Agent started on port 9765" "OK"
        return $true
    }
    
    Write-Log "Nebula Agent may have failed to start" "WARN"
    return $false
}

function Stop-AllServices {
    Write-Log "Stopping all AI services..." "STEP"
    
    # Stop by process name/command line
    $processes = @(
        @{ Name = "Ollama"; Filter = { $_.Name -like "ollama*" } },
        @{ Name = "Stable Diffusion"; Filter = { $_.CommandLine -like "*webui*" -or $_.CommandLine -like "*stable-diffusion*" } },
        @{ Name = "ComfyUI"; Filter = { $_.CommandLine -like "*ComfyUI*main.py*" } },
        @{ Name = "Agent"; Filter = { $_.CommandLine -like "*nebula*server.js*" } }
    )
    
    foreach ($svc in $processes) {
        $procs = Get-CimInstance Win32_Process | Where-Object $svc.Filter
        foreach ($proc in $procs) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
                Write-Log "Stopped $($svc.Name) (PID: $($proc.ProcessId))" "OK"
            } catch {}
        }
    }
    
    Write-Log "All services stopped" "OK"
}

function Get-StackStatus {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "   Nebula Command AI Stack Status" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    foreach ($svc in $Script:Config.Services) {
        $running = Test-ServiceRunning -Key $svc.Key -Port $svc.Port
        $status = if ($running) { "[OK]" } else { "[--]" }
        $color = if ($running) { "Green" } else { "Red" }
        Write-Host "  $status $($svc.Name.PadRight(20)) : http://localhost:$($svc.Port)" -ForegroundColor $color
    }
    
    # GPU info
    Write-Host ""
    Write-Host "GPU Status:" -ForegroundColor Yellow
    try {
        $gpu = & nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits 2>$null
        if ($gpu) {
            $parts = $gpu -split ","
            $memPercent = [math]::Round(([int]$parts[1].Trim() / [int]$parts[2].Trim()) * 100, 1)
            Write-Host "  $($parts[0].Trim())" -ForegroundColor White
            Write-Host "  Memory: $($parts[1].Trim())MB / $($parts[2].Trim())MB ($memPercent%)" -ForegroundColor White
            Write-Host "  Utilization: $($parts[3].Trim())%" -ForegroundColor White
        }
    } catch {
        Write-Host "  nvidia-smi not available" -ForegroundColor Red
    }
    
    Write-Host ""
}

# ============================================================================
# MAIN
# ============================================================================

function Main {
    Initialize-Environment
    
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║         Nebula Command - AI Stack Manager                 ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    
    switch ($Action) {
        "start" {
            Write-Log "Starting Nebula AI Stack..." "STEP"
            
            # Step 1: Validate Python
            if (-not $SkipValidation) {
                $python = Test-PythonVersion
                if (-not $python) {
                    Write-Host ""
                    Write-Host "Cannot proceed without compatible Python (3.10-3.12)" -ForegroundColor Red
                    Write-Host ""
                    exit 1
                }
                
                # Step 2: Check PyTorch CUDA
                $torch = Test-TorchCuda -PythonPath $python.Path
                if ($torch.NeedsRepair) {
                    Write-Log "PyTorch needs repair" "WARN"
                    
                    if (-not $Force) {
                        $response = Read-Host "Repair PyTorch with CUDA? This will reinstall torch packages. (y/n)"
                        if ($response -ne "y") {
                            Write-Log "Skipping repair - services may fail" "WARN"
                        } else {
                            $repaired = Repair-TorchCuda -PythonPath $python.Path
                            if (-not $repaired) {
                                Write-Log "Failed to repair PyTorch" "ERROR"
                                exit 1
                            }
                        }
                    } else {
                        $repaired = Repair-TorchCuda -PythonPath $python.Path
                        if (-not $repaired) {
                            Write-Log "Failed to repair PyTorch" "ERROR"
                            exit 1
                        }
                    }
                }
                
                # Step 3: Ensure other dependencies
                Repair-AiDependencies -PythonPath $python.Path
            }
            
            Write-Host ""
            Write-Log "Starting services in order..." "STEP"
            
            # Start services
            $pythonPath = if ($python) { $python.Path } else { "python" }
            
            Start-Ollama
            Start-Sleep -Seconds 2
            
            Start-StableDiffusion -PythonPath $pythonPath
            Start-Sleep -Seconds 2
            
            Start-ComfyUI -PythonPath $pythonPath
            Start-Sleep -Seconds 2
            
            Start-NebulaAgent
            
            Write-Host ""
            Write-Log "Startup complete!" "OK"
            Write-Host ""
            
            Get-StackStatus
        }
        
        "stop" {
            Stop-AllServices
        }
        
        "status" {
            Get-StackStatus
        }
        
        "repair" {
            $python = Test-PythonVersion
            if (-not $python) {
                exit 1
            }
            
            $repaired = Repair-TorchCuda -PythonPath $python.Path
            if ($repaired) {
                Repair-AiDependencies -PythonPath $python.Path
                Write-Log "Repair complete!" "OK"
            }
        }
        
        "validate" {
            $python = Test-PythonVersion
            if (-not $python) {
                exit 1
            }
            
            Test-TorchCuda -PythonPath $python.Path
        }
        
        "install" {
            Write-Log "Installing as scheduled task for auto-start on boot..." "STEP"
            
            $scriptPath = $MyInvocation.MyCommand.Path
            if (-not $scriptPath) { $scriptPath = $PSCommandPath }
            
            $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`" start -Force"
            $trigger = New-ScheduledTaskTrigger -AtStartup -RandomDelay (New-TimeSpan -Seconds 30)
            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
            $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
            
            try {
                Register-ScheduledTask -TaskName "NebulaCommand-AI-Stack" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
                Write-Log "Scheduled task installed!" "OK"
                Write-Log "AI stack will start automatically on boot" "INFO"
            } catch {
                Write-Log "Failed: $_" "ERROR"
                Write-Log "Run as Administrator" "WARN"
            }
        }
    }
}

Main
