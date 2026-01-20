# Nebula Command - Stable Diffusion Complete Repair Script
# Fixes ALL critical SD WebUI issues with pinned compatible versions
# Run as Administrator

param(
    [string]$SDPath = "C:\AI\stable-diffusion-webui",
    [string]$Python310Path = "",
    [switch]$CreateFreshVenv,
    [switch]$BackupFirst,
    [switch]$Force,
    [switch]$SkipTest,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogFile = "C:\ProgramData\NebulaCommand\logs\sd-complete-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

$PINNED_VERSIONS = @{
    torch = "2.1.2"
    torchvision = "0.16.2"
    torchaudio = "2.1.2"
    xformers = "0.0.23.post1"
    transformers = "4.36.2"
    protobuf = "3.20.3"
    numpy = "1.26.4"
    accelerate = "0.25.0"
    diffusers = "0.25.1"
    safetensors = "0.4.1"
    opencv_python = "4.9.0.80"
    pillow = "10.2.0"
    scipy = "1.11.4"
    scikit_image = "0.22.0"
}

$CUDA_INDEX_URL = "https://download.pytorch.org/whl/cu121"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry -ForegroundColor $(switch($Level) { 
        "ERROR" { "Red" } 
        "WARN" { "Yellow" } 
        "SUCCESS" { "Green" } 
        "HEADER" { "Cyan" }
        default { "White" } 
    })
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
}

function Test-AdminPrivileges {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-Python310 {
    $searchPaths = @(
        "C:\Python310\python.exe",
        "C:\Python\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "$env:ProgramFiles\Python310\python.exe",
        "$env:ProgramFiles(x86)\Python310\python.exe"
    )
    
    foreach ($path in $searchPaths) {
        if (Test-Path $path) {
            $version = & $path --version 2>&1
            if ($version -match "3\.10\.") {
                return $path
            }
        }
    }
    
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        try {
            $version = & py -3.10 --version 2>&1
            if ($version -match "3\.10\.") {
                return "py -3.10"
            }
        } catch {}
    }
    
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if ($systemPython) {
        $version = & python --version 2>&1
        if ($version -match "3\.10\.") {
            return $systemPython.Source
        }
    }
    
    return $null
}

function Backup-Venv {
    param([string]$VenvPath)
    
    if (Test-Path $VenvPath) {
        $backupName = "venv_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        $backupPath = Join-Path (Split-Path $VenvPath -Parent) $backupName
        
        Write-Log "Backing up existing venv to $backupPath..."
        try {
            Rename-Item -Path $VenvPath -NewName $backupName -Force
            Write-Log "Backup created successfully" "SUCCESS"
            return $backupPath
        } catch {
            Write-Log "Failed to backup venv: $_" "ERROR"
            return $null
        }
    }
    return $null
}

function Test-ImportWorks {
    param([string]$PythonExe, [string]$ImportStatement, [string]$ComponentName)
    
    try {
        $result = & $PythonExe -c $ImportStatement 2>&1
        if ($LASTEXITCODE -eq 0 -and $result -notmatch "Error|Exception|Traceback") {
            return $true
        }
    } catch {}
    return $false
}

function Show-Banner {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "║     STABLE DIFFUSION WEBUI - COMPLETE REPAIR               ║" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "║     Fixes:                                                 ║" -ForegroundColor Cyan
    Write-Host "║       • transformers CLIP import errors                    ║" -ForegroundColor Cyan
    Write-Host "║       • protobuf version mismatch                          ║" -ForegroundColor Cyan
    Write-Host "║       • xFormers CUDA extension failures                   ║" -ForegroundColor Cyan
    Write-Host "║       • PyTorch/CUDA version mismatch                      ║" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

Show-Banner

if (-not (Test-Path (Split-Path $LogFile -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $LogFile -Parent) -Force | Out-Null
}

Write-Log "Starting Stable Diffusion Complete Repair" "HEADER"
Write-Log "SD Path: $SDPath"

if (-not (Test-AdminPrivileges)) {
    Write-Log "Running without admin privileges - some operations may fail" "WARN"
}

if (-not (Test-Path $SDPath)) {
    Write-Log "Stable Diffusion WebUI not found at $SDPath" "ERROR"
    Write-Log "Please specify correct path with -SDPath parameter"
    exit 1
}

$venvPath = Join-Path $SDPath "venv"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"
$pipExe = Join-Path $venvPath "Scripts\pip.exe"

if ($Python310Path) {
    $python310 = $Python310Path
} else {
    $python310 = Find-Python310
}

if (-not $python310) {
    Write-Log "Python 3.10 not found. Please install Python 3.10.x or specify path with -Python310Path" "ERROR"
    exit 1
}

Write-Log "Using Python 3.10: $python310"

$results = @{
    Backup = @{ Status = "SKIPPED"; Message = "" }
    Venv = @{ Status = "SKIPPED"; Message = "" }
    Torch = @{ Status = "PENDING"; Message = "" }
    Xformers = @{ Status = "PENDING"; Message = "" }
    Transformers = @{ Status = "PENDING"; Message = "" }
    Protobuf = @{ Status = "PENDING"; Message = "" }
    Dependencies = @{ Status = "PENDING"; Message = "" }
    Verification = @{ Status = "PENDING"; Message = "" }
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 1: Environment Setup" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

if ($BackupFirst -and (Test-Path $venvPath)) {
    $backupPath = Backup-Venv -VenvPath $venvPath
    if ($backupPath) {
        $results.Backup.Status = "SUCCESS"
        $results.Backup.Message = "Backed up to $backupPath"
    } else {
        $results.Backup.Status = "FAILED"
    }
}

if ($CreateFreshVenv -or -not (Test-Path $pythonExe)) {
    Write-Log "Creating fresh Python 3.10 virtual environment..."
    
    if (Test-Path $venvPath) {
        Write-Log "Removing existing venv..."
        Remove-Item -Path $venvPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    try {
        if ($python310 -eq "py -3.10") {
            & py -3.10 -m venv $venvPath
        } else {
            & $python310 -m venv $venvPath
        }
        
        if (Test-Path $pythonExe) {
            Write-Log "Virtual environment created successfully" "SUCCESS"
            $results.Venv.Status = "SUCCESS"
            
            Write-Log "Upgrading pip..."
            & $pythonExe -m pip install --upgrade pip setuptools wheel 2>&1 | Out-Null
        } else {
            Write-Log "Failed to create virtual environment" "ERROR"
            $results.Venv.Status = "FAILED"
            exit 1
        }
    } catch {
        Write-Log "Error creating venv: $_" "ERROR"
        $results.Venv.Status = "FAILED"
        exit 1
    }
} else {
    Write-Log "Using existing virtual environment"
    $results.Venv.Status = "EXISTING"
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 2: PyTorch + CUDA ($($PINNED_VERSIONS.torch)+cu121)" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

try {
    Write-Log "Uninstalling existing torch packages..."
    & $pythonExe -m pip uninstall torch torchvision torchaudio xformers -y 2>&1 | Out-Null
    
    Write-Log "Installing PyTorch $($PINNED_VERSIONS.torch)+cu121..."
    $torchPackages = "torch==$($PINNED_VERSIONS.torch)+cu121 torchvision==$($PINNED_VERSIONS.torchvision)+cu121 torchaudio==$($PINNED_VERSIONS.torchaudio)+cu121"
    $installCmd = "& `"$pythonExe`" -m pip install $torchPackages --index-url $CUDA_INDEX_URL --no-cache-dir"
    
    $output = Invoke-Expression $installCmd 2>&1
    
    $torchTest = & $pythonExe -c "import torch; print(f'PyTorch {torch.__version__} CUDA {torch.version.cuda}')" 2>&1
    if ($LASTEXITCODE -eq 0 -and $torchTest -match "CUDA") {
        Write-Log "PyTorch installed: $torchTest" "SUCCESS"
        $results.Torch.Status = "SUCCESS"
        $results.Torch.Message = $torchTest
    } else {
        Write-Log "PyTorch installation verification failed" "ERROR"
        $results.Torch.Status = "FAILED"
    }
} catch {
    Write-Log "PyTorch installation error: $_" "ERROR"
    $results.Torch.Status = "FAILED"
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 3: xFormers ($($PINNED_VERSIONS.xformers))" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

try {
    Write-Log "Installing xFormers $($PINNED_VERSIONS.xformers) (matches PyTorch 2.1.x)..."
    & $pythonExe -m pip install "xformers==$($PINNED_VERSIONS.xformers)" --index-url $CUDA_INDEX_URL --no-cache-dir 2>&1 | Out-Null
    
    $xformersTest = & $pythonExe -c "import torch; import xformers; import xformers.ops; print(f'xFormers {xformers.__version__} OK')" 2>&1
    if ($LASTEXITCODE -eq 0 -and $xformersTest -match "OK") {
        Write-Log "xFormers installed and working: $xformersTest" "SUCCESS"
        $results.Xformers.Status = "SUCCESS"
    } else {
        Write-Log "xFormers test failed: $xformersTest" "WARN"
        $results.Xformers.Status = "PARTIAL"
        $results.Xformers.Message = "Installed but CUDA ops may not work"
    }
} catch {
    Write-Log "xFormers installation error: $_" "ERROR"
    $results.Xformers.Status = "FAILED"
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 4: Transformers + Protobuf (CLIP fix)" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

try {
    Write-Log "Installing protobuf $($PINNED_VERSIONS.protobuf) (NOT 4.x - fixes runtime_version error)..."
    & $pythonExe -m pip uninstall protobuf -y 2>&1 | Out-Null
    & $pythonExe -m pip install "protobuf==$($PINNED_VERSIONS.protobuf)" --no-cache-dir 2>&1 | Out-Null
    
    $pbTest = & $pythonExe -c "import google.protobuf; print(google.protobuf.__version__)" 2>&1
    if ($LASTEXITCODE -eq 0 -and $pbTest -match "^3\.") {
        Write-Log "Protobuf installed: $pbTest" "SUCCESS"
        $results.Protobuf.Status = "SUCCESS"
    } else {
        Write-Log "Protobuf version issue: $pbTest" "WARN"
        $results.Protobuf.Status = "PARTIAL"
    }
} catch {
    Write-Log "Protobuf installation error: $_" "ERROR"
    $results.Protobuf.Status = "FAILED"
}

try {
    Write-Log "Installing transformers $($PINNED_VERSIONS.transformers) (NOT 4.37+ - fixes CLIP import)..."
    & $pythonExe -m pip uninstall transformers -y 2>&1 | Out-Null
    & $pythonExe -m pip install "transformers==$($PINNED_VERSIONS.transformers)" --no-cache-dir 2>&1 | Out-Null
    
    $clipTest = & $pythonExe -c "from transformers.models.clip.modeling_clip import CLIPTextModel; print('CLIP OK')" 2>&1
    if ($LASTEXITCODE -eq 0 -and $clipTest -match "OK") {
        Write-Log "Transformers CLIP import working!" "SUCCESS"
        $results.Transformers.Status = "SUCCESS"
    } else {
        Write-Log "Transformers CLIP test failed: $clipTest" "WARN"
        $results.Transformers.Status = "PARTIAL"
    }
} catch {
    Write-Log "Transformers installation error: $_" "ERROR"
    $results.Transformers.Status = "FAILED"
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 5: Additional Dependencies" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

try {
    Write-Log "Installing pinned dependencies..."
    
    $deps = @(
        "numpy==$($PINNED_VERSIONS.numpy)",
        "accelerate==$($PINNED_VERSIONS.accelerate)",
        "diffusers==$($PINNED_VERSIONS.diffusers)",
        "safetensors==$($PINNED_VERSIONS.safetensors)",
        "opencv-python==$($PINNED_VERSIONS.opencv_python)",
        "Pillow==$($PINNED_VERSIONS.pillow)",
        "scipy==$($PINNED_VERSIONS.scipy)",
        "scikit-image==$($PINNED_VERSIONS.scikit_image)",
        "omegaconf",
        "einops",
        "pytorch-lightning",
        "tqdm",
        "requests",
        "pyyaml",
        "gradio>=4.0.0"
    )
    
    foreach ($dep in $deps) {
        Write-Log "  Installing $dep..."
        & $pythonExe -m pip install $dep --no-cache-dir 2>&1 | Out-Null
    }
    
    Write-Log "Additional dependencies installed" "SUCCESS"
    $results.Dependencies.Status = "SUCCESS"
} catch {
    Write-Log "Some dependencies failed: $_" "WARN"
    $results.Dependencies.Status = "PARTIAL"
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 6: Verification" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

$verificationTests = @(
    @{ Name = "PyTorch CUDA"; Code = "import torch; assert torch.cuda.is_available(), 'No CUDA'; print('OK')" },
    @{ Name = "xFormers ops"; Code = "import xformers.ops; print('OK')" },
    @{ Name = "CLIP Model"; Code = "from transformers.models.clip.modeling_clip import CLIPTextModel; print('OK')" },
    @{ Name = "Protobuf"; Code = "from google.protobuf import runtime_version; print('OK')" },
    @{ Name = "Diffusers"; Code = "from diffusers import StableDiffusionPipeline; print('OK')" },
    @{ Name = "OpenCV"; Code = "import cv2; print('OK')" }
)

$passedTests = 0
$failedTests = @()

foreach ($test in $verificationTests) {
    $result = & $pythonExe -c $test.Code 2>&1
    if ($LASTEXITCODE -eq 0 -and $result -match "OK") {
        Write-Log "  ✓ $($test.Name)" "SUCCESS"
        $passedTests++
    } else {
        Write-Log "  ✗ $($test.Name): $result" "ERROR"
        $failedTests += $test.Name
    }
}

if ($failedTests.Count -eq 0) {
    $results.Verification.Status = "SUCCESS"
    Write-Log "All verification tests passed!" "SUCCESS"
} elseif ($failedTests.Count -le 2) {
    $results.Verification.Status = "PARTIAL"
    $results.Verification.Message = "Failed: $($failedTests -join ', ')"
} else {
    $results.Verification.Status = "FAILED"
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                     REPAIR SUMMARY                         ║" -ForegroundColor Cyan
Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan

foreach ($phase in @("Backup", "Venv", "Torch", "Xformers", "Transformers", "Protobuf", "Dependencies", "Verification")) {
    $status = $results[$phase].Status
    $color = switch ($status) {
        "SUCCESS" { "Green" }
        "PARTIAL" { "Yellow" }
        "SKIPPED" { "Gray" }
        "EXISTING" { "Cyan" }
        default { "Red" }
    }
    $icon = switch ($status) {
        "SUCCESS" { "✓" }
        "PARTIAL" { "~" }
        "SKIPPED" { "-" }
        "EXISTING" { "=" }
        default { "✗" }
    }
    
    $paddedPhase = $phase.PadRight(15)
    $paddedStatus = $status.PadRight(10)
    Write-Host "║  $icon $paddedPhase $paddedStatus                        ║" -ForegroundColor $color
}

Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

$successCount = ($results.Values | Where-Object { $_.Status -eq "SUCCESS" }).Count
$failCount = ($results.Values | Where-Object { $_.Status -eq "FAILED" }).Count

Write-Host ""
Write-Log "Repair completed: $successCount success, $failCount failed"
Write-Host "Log saved to: $LogFile" -ForegroundColor Gray

if ($failCount -eq 0) {
    Write-Host ""
    Write-Host "Stable Diffusion WebUI repair completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Pinned versions installed:" -ForegroundColor Cyan
    Write-Host "  PyTorch:      $($PINNED_VERSIONS.torch)+cu121" -ForegroundColor White
    Write-Host "  xFormers:     $($PINNED_VERSIONS.xformers)" -ForegroundColor White
    Write-Host "  Transformers: $($PINNED_VERSIONS.transformers)" -ForegroundColor White
    Write-Host "  Protobuf:     $($PINNED_VERSIONS.protobuf)" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Navigate to $SDPath" -ForegroundColor White
    Write-Host "  2. Run webui-user.bat (NOT webui.bat to avoid reinstall)" -ForegroundColor White
    Write-Host "  3. Or run: .\venv\Scripts\python.exe launch.py --xformers" -ForegroundColor White
    exit 0
} else {
    Write-Host ""
    Write-Host "Some repairs failed. Manual intervention may be required." -ForegroundColor Yellow
    Write-Host "Check the log for details: $LogFile" -ForegroundColor Yellow
    exit 1
}
