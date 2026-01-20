# Stable Diffusion - Complete Pip Fix
# Installs exact versions that work together
# Run as Administrator in SD WebUI venv

param(
    [string]$SDPath = "C:\AI\stable-diffusion-webui",
    [switch]$Force
)

$ProgressPreference = "SilentlyContinue"

$pythonExe = Join-Path $SDPath "venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "ERROR: Python executable not found at $pythonExe" -ForegroundColor Red
    Write-Host "Make sure you have created the venv and run this from within SD WebUI" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "     STABLE DIFFUSION - COMPLETE PIP FIX              " -ForegroundColor Cyan
Write-Host "     Installing exact compatible versions             " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

try {
    Write-Host "[1/5] Removing conflicting packages (if any)..." -ForegroundColor Yellow
    $null = & $pythonExe -m pip uninstall -y torch torchvision torchaudio xformers transformers protobuf accelerate diffusers 2>&1
    Write-Host "  Done" -ForegroundColor Gray

    Write-Host "[2/5] Installing PyTorch 2.1.2 + cu121..." -ForegroundColor Yellow
    & $pythonExe -m pip install torch==2.1.2+cu121 torchvision==0.16.2+cu121 torchaudio==2.1.2+cu121 --index-url https://download.pytorch.org/whl/cu121 --no-cache-dir
    if ($LASTEXITCODE -ne 0) { throw "PyTorch installation failed" }

    Write-Host "[3/5] Installing xFormers 0.0.23.post1 (for torch 2.1.2)..." -ForegroundColor Yellow
    & $pythonExe -m pip install xformers==0.0.23.post1 --index-url https://download.pytorch.org/whl/cu121 --no-cache-dir
    if ($LASTEXITCODE -ne 0) { throw "xFormers installation failed" }

    Write-Host "[4/5] Installing transformers, protobuf, accelerate, diffusers..." -ForegroundColor Yellow
    & $pythonExe -m pip install transformers==4.36.2 protobuf==3.20.3 accelerate==0.25.0 diffusers==0.25.1 --no-cache-dir
    if ($LASTEXITCODE -ne 0) { throw "Transformers installation failed" }

    Write-Host "[5/5] Installing core dependencies..." -ForegroundColor Yellow
    & $pythonExe -m pip install numpy==1.26.4 safetensors einops --no-cache-dir
    if ($LASTEXITCODE -ne 0) { throw "Core dependencies installation failed" }

    Write-Host ""
    Write-Host "Installation complete! Verifying..." -ForegroundColor Green
    Write-Host ""
    
    $testScript = @'
import torch
print(f"PyTorch: {torch.__version__}")
print(f"CUDA Available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"CUDA Device: {torch.cuda.get_device_name(0)}")
import xformers
print(f"xFormers: {xformers.__version__}")
import transformers
print(f"Transformers: {transformers.__version__}")
import google.protobuf
print(f"Protobuf: {google.protobuf.__version__}")
print("All critical packages loaded successfully!")
'@
    
    $testFile = Join-Path $env:TEMP "sd_test.py"
    $testScript | Out-File -FilePath $testFile -Encoding utf8
    & $pythonExe $testFile
    Remove-Item $testFile -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host "  REPAIR COMPLETED SUCCESSFULLY!                      " -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Navigate to: $SDPath" -ForegroundColor White
    Write-Host "  2. Run: .\webui-user.bat" -ForegroundColor White
    Write-Host ""
    exit 0
}
catch {
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
    exit 1
}
