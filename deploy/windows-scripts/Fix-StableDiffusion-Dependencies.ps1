# Nebula Command - Stable Diffusion WebUI Dependencies Fix Script
# Fixes: NumPy 2.0 compatibility, xformers CUDA build, torch/torchvision versions
# Run as Administrator

param(
    [string]$SDPath = "C:\AI\stable-diffusion-webui",
    [string]$CudaVersion = "12.1",
    [switch]$Force,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogFile = "C:\ProgramData\NebulaCommand\logs\sd-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry -ForegroundColor $(switch($Level) { "ERROR" { "Red" } "WARN" { "Yellow" } "SUCCESS" { "Green" } default { "White" } })
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
}

function Test-AdminPrivileges {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    return $isAdmin
}

function Get-PythonExecutable {
    param([string]$BasePath)
    
    $venvPython = Join-Path $BasePath "venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }
    
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if ($systemPython) {
        return $systemPython.Source
    }
    
    return $null
}

function Get-NumpyVersion {
    param([string]$PythonExe)
    
    try {
        $result = & $PythonExe -c "import numpy; print(numpy.__version__)" 2>&1
        if ($LASTEXITCODE -eq 0) {
            return $result.Trim()
        }
    } catch {}
    return $null
}

function Test-NumpyCompatible {
    param([string]$PythonExe)
    
    $version = Get-NumpyVersion -PythonExe $PythonExe
    if ($version) {
        $major = [int]($version.Split('.')[0])
        return $major -lt 2
    }
    return $false
}

function Test-XformersInstalled {
    param([string]$PythonExe)
    
    try {
        $result = & $PythonExe -c "import xformers; print(xformers.__version__)" 2>&1
        if ($LASTEXITCODE -eq 0 -and $result -notmatch "Error") {
            return $true
        }
    } catch {}
    return $false
}

function Test-XformersWorking {
    param([string]$PythonExe)
    
    try {
        $testCode = @"
import torch
import xformers
import xformers.ops
print('xformers OK')
"@
        $result = & $PythonExe -c $testCode 2>&1
        if ($result -match "xformers OK") {
            return $true
        }
    } catch {}
    return $false
}

function Get-CudaVersionFromNvidiaSmi {
    try {
        $output = & nvidia-smi 2>&1
        if ($output -match "CUDA Version:\s*(\d+\.\d+)") {
            return $matches[1]
        }
    } catch {}
    return $null
}

function Get-TorchCudaVersion {
    param([string]$PythonExe)
    
    try {
        $result = & $PythonExe -c "import torch; print(torch.version.cuda if torch.cuda.is_available() else 'N/A')" 2>&1
        if ($LASTEXITCODE -eq 0) {
            return $result.Trim()
        }
    } catch {}
    return $null
}

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " Stable Diffusion Dependencies Fix" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path (Split-Path $LogFile -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $LogFile -Parent) -Force | Out-Null
}

Write-Log "Starting Stable Diffusion dependency fix script"
Write-Log "SD WebUI Path: $SDPath"

if (-not (Test-AdminPrivileges)) {
    Write-Log "WARNING: Running without administrator privileges. Some fixes may fail." "WARN"
}

if (-not (Test-Path $SDPath)) {
    Write-Log "Stable Diffusion WebUI not found at $SDPath" "ERROR"
    Write-Log "Please specify correct path with -SDPath parameter"
    exit 1
}

$pythonExe = Get-PythonExecutable -BasePath $SDPath
if (-not $pythonExe) {
    Write-Log "Python executable not found. Has SD WebUI been run at least once?" "ERROR"
    Write-Log "Run webui.bat first to create the virtual environment"
    exit 1
}
Write-Log "Using Python: $pythonExe"

$detectedCuda = Get-CudaVersionFromNvidiaSmi
if ($detectedCuda) {
    Write-Log "Detected CUDA version: $detectedCuda"
    if ($CudaVersion -eq "12.1" -and $detectedCuda -ne "12.1") {
        Write-Log "Auto-adjusting to detected CUDA version: $detectedCuda" "WARN"
    }
}

$fixes = @{
    NumPy = @{ Applied = $false; Success = $false; Skipped = $false }
    Torch = @{ Applied = $false; Success = $false; Skipped = $false }
    Xformers = @{ Applied = $false; Success = $false; Skipped = $false }
    Skimage = @{ Applied = $false; Success = $false; Skipped = $false }
}

Write-Host ""
Write-Host "[1/4] NumPy Version Fix (Pin <2.0)" -ForegroundColor Cyan
Write-Log "Checking NumPy version..."

$currentNumpy = Get-NumpyVersion -PythonExe $pythonExe
Write-Log "Current NumPy version: $currentNumpy"

if (-not $Force -and (Test-NumpyCompatible -PythonExe $pythonExe)) {
    Write-Log "NumPy version is compatible (<2.0)" "SUCCESS"
    $fixes.NumPy.Skipped = $true
} else {
    Write-Log "Pinning NumPy to <2.0 for compatibility..."
    $fixes.NumPy.Applied = $true
    
    try {
        & $pythonExe -m pip uninstall numpy -y 2>&1 | Out-Null
        & $pythonExe -m pip install "numpy>=1.23.0,<2.0.0" --no-cache-dir 2>&1 | Out-Null
        
        if (Test-NumpyCompatible -PythonExe $pythonExe) {
            $newVersion = Get-NumpyVersion -PythonExe $pythonExe
            Write-Log "NumPy pinned successfully: v$newVersion" "SUCCESS"
            $fixes.NumPy.Success = $true
        } else {
            Write-Log "NumPy version fix verification failed" "ERROR"
        }
    } catch {
        Write-Log "NumPy fix error: $_" "ERROR"
    }
}

Write-Host ""
Write-Host "[2/4] PyTorch CUDA Fix" -ForegroundColor Cyan
Write-Log "Checking PyTorch installation..."

$torchCuda = Get-TorchCudaVersion -PythonExe $pythonExe
Write-Log "Current Torch CUDA version: $torchCuda"

$cudaIndexUrl = switch -Regex ($CudaVersion) {
    "12\.[1-9]" { "https://download.pytorch.org/whl/cu121" }
    "11\.8"     { "https://download.pytorch.org/whl/cu118" }
    "11\.[6-7]" { "https://download.pytorch.org/whl/cu117" }
    default     { "https://download.pytorch.org/whl/cu121" }
}

if (-not $Force -and $torchCuda -and $torchCuda -ne "N/A") {
    Write-Log "PyTorch with CUDA support already installed" "SUCCESS"
    $fixes.Torch.Skipped = $true
} else {
    Write-Log "Installing PyTorch with CUDA $CudaVersion support..."
    $fixes.Torch.Applied = $true
    
    try {
        & $pythonExe -m pip install torch torchvision torchaudio --index-url $cudaIndexUrl --no-cache-dir 2>&1 | Out-Null
        
        $newTorchCuda = Get-TorchCudaVersion -PythonExe $pythonExe
        if ($newTorchCuda -and $newTorchCuda -ne "N/A") {
            Write-Log "PyTorch installed with CUDA $newTorchCuda support" "SUCCESS"
            $fixes.Torch.Success = $true
        } else {
            Write-Log "PyTorch CUDA support not detected after install" "ERROR"
        }
    } catch {
        Write-Log "PyTorch installation error: $_" "ERROR"
    }
}

Write-Host ""
Write-Host "[3/4] xformers Pre-built Wheel Fix" -ForegroundColor Cyan
Write-Log "Checking xformers installation..."

if (-not $Force -and (Test-XformersWorking -PythonExe $pythonExe)) {
    Write-Log "xformers already installed and working" "SUCCESS"
    $fixes.Xformers.Skipped = $true
} else {
    Write-Log "Installing pre-built xformers wheel..."
    $fixes.Xformers.Applied = $true
    
    try {
        & $pythonExe -m pip uninstall xformers -y 2>&1 | Out-Null
        
        $xformersInstalled = $false
        
        Write-Log "Trying xformers from PyPI with CUDA index..."
        & $pythonExe -m pip install xformers --index-url $cudaIndexUrl --no-cache-dir 2>&1 | Out-Null
        
        if (Test-XformersInstalled -PythonExe $pythonExe) {
            $xformersInstalled = $true
        }
        
        if (-not $xformersInstalled) {
            Write-Log "Trying xformers from PyPI (default)..."
            & $pythonExe -m pip install xformers --no-cache-dir 2>&1 | Out-Null
            if (Test-XformersInstalled -PythonExe $pythonExe) {
                $xformersInstalled = $true
            }
        }
        
        if ($xformersInstalled -and (Test-XformersWorking -PythonExe $pythonExe)) {
            $version = & $pythonExe -c "import xformers; print(xformers.__version__)" 2>&1
            Write-Log "xformers installed and working: v$version" "SUCCESS"
            $fixes.Xformers.Success = $true
        } else {
            Write-Log "xformers installation failed or not working" "ERROR"
            Write-Log "You may need to install Visual Studio Build Tools and reinstall" "WARN"
        }
    } catch {
        Write-Log "xformers installation error: $_" "ERROR"
    }
}

Write-Host ""
Write-Host "[4/4] scikit-image (skimage) Fix" -ForegroundColor Cyan
Write-Log "Checking scikit-image installation..."

try {
    $skimageTest = & $pythonExe -c "from skimage import transform; print('OK')" 2>&1
    $skimageOk = $skimageTest -match "OK"
} catch {
    $skimageOk = $false
}

if (-not $Force -and $skimageOk) {
    Write-Log "scikit-image already working" "SUCCESS"
    $fixes.Skimage.Skipped = $true
} else {
    Write-Log "Reinstalling scikit-image with compatible version..."
    $fixes.Skimage.Applied = $true
    
    try {
        & $pythonExe -m pip uninstall scikit-image -y 2>&1 | Out-Null
        & $pythonExe -m pip install "scikit-image>=0.21.0,<0.23.0" --no-cache-dir 2>&1 | Out-Null
        
        $skimageTest = & $pythonExe -c "from skimage import transform; print('OK')" 2>&1
        if ($skimageTest -match "OK") {
            $version = & $pythonExe -c "import skimage; print(skimage.__version__)" 2>&1
            Write-Log "scikit-image installed successfully: v$version" "SUCCESS"
            $fixes.Skimage.Success = $true
        } else {
            Write-Log "scikit-image verification failed" "ERROR"
        }
    } catch {
        Write-Log "scikit-image installation error: $_" "ERROR"
    }
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " Summary" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

$successCount = 0
$failCount = 0
$skipCount = 0

foreach ($fix in $fixes.GetEnumerator()) {
    $status = if ($fix.Value.Skipped) { "SKIPPED (already OK)"; $skipCount++ }
              elseif ($fix.Value.Success) { "FIXED"; $successCount++ }
              elseif ($fix.Value.Applied) { "FAILED"; $failCount++ }
              else { "NOT APPLIED" }
    
    $color = if ($fix.Value.Success -or $fix.Value.Skipped) { "Green" } elseif ($fix.Value.Applied) { "Red" } else { "Gray" }
    Write-Host "  $($fix.Key): $status" -ForegroundColor $color
}

Write-Host ""
Write-Log "Fixes applied: $successCount, Skipped: $skipCount, Failed: $failCount"

if ($failCount -eq 0) {
    Write-Host "All Stable Diffusion dependency fixes completed successfully!" -ForegroundColor Green
    Write-Log "All fixes completed successfully" "SUCCESS"
    exit 0
} else {
    Write-Host "Some fixes failed. Check log: $LogFile" -ForegroundColor Yellow
    Write-Log "Some fixes failed" "WARN"
    exit 1
}
