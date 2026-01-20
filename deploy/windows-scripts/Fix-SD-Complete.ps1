# Stable Diffusion - Complete Pip Fix
# Installs exact versions that work together
# Run as Administrator in SD WebUI venv

param(
    [string]$SDPath = "C:\AI\stable-diffusion-webui",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Find Python executable in venv
$pythonExe = Join-Path $SDPath "venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "ERROR: Python executable not found at $pythonExe" -ForegroundColor Red
    Write-Host "Make sure you have created the venv and run this from within SD WebUI" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     STABLE DIFFUSION - COMPLETE PIP FIX                    ║" -ForegroundColor Cyan
Write-Host "║     Installing exact compatible versions                   ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

try {
    Write-Host "[1/5] Removing conflicting packages..." -ForegroundColor Yellow
    & $pythonExe -m pip uninstall -y torch torchvision torchaudio xformers transformers protobuf accelerate diffusers 2>&1 | Out-Null

    Write-Host "[2/5] Installing PyTorch 2.1.2 + cu121..." -ForegroundColor Yellow
    & $pythonExe -m pip install `
        torch==2.1.2+cu121 `
        torchvision==0.16.2+cu121 `
        torchaudio==2.1.2+cu121 `
        --index-url https://download.pytorch.org/whl/cu121 --no-cache-dir

    Write-Host "[3/5] Installing xFormers 0.0.22.post7..." -ForegroundColor Yellow
    & $pythonExe -m pip install xformers==0.0.22.post7 --no-cache-dir

    Write-Host "[4/5] Installing transformers, protobuf, accelerate, diffusers..." -ForegroundColor Yellow
    & $pythonExe -m pip install `
        transformers==4.36.2 `
        protobuf==3.20.3 `
        accelerate==0.25.0 `
        diffusers==0.25.1 `
        --no-cache-dir

    Write-Host "[5/5] Installing core dependencies..." -ForegroundColor Yellow
    & $pythonExe -m pip install `
        numpy==1.26.4 `
        safetensors `
        einops `
        --no-cache-dir

    Write-Host "`n✓ Installation complete!" -ForegroundColor Green
    Write-Host "`nVerifying installation..." -ForegroundColor Cyan
    
    $testResult = & $pythonExe -c @"
import torch
print(f"PyTorch: {torch.__version__}")
print(f"CUDA Available: {torch.cuda.is_available()}")
import xformers
print(f"xFormers: {xformers.__version__}")
import transformers
print(f"Transformers: {transformers.__version__}")
print("✓ All critical packages loaded successfully!")
"@ 2>&1
    
    Write-Host $testResult -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "`n✗ Error during installation: $_" -ForegroundColor Red
    exit 1
}
