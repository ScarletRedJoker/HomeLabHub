# Stable Diffusion - Fix Venv Python Path
# Recreates the venv with correct Python path
# Run as Administrator

param(
    [string]$SDPath = "C:\AI\stable-diffusion-webui-forge",
    [string]$PythonPath = "C:\Python310\python.exe"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "     STABLE DIFFUSION - FIX VENV                      " -ForegroundColor Cyan
Write-Host "     Recreating venv with correct Python path         " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $PythonPath)) {
    Write-Host "ERROR: Python not found at $PythonPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Looking for Python installations..." -ForegroundColor Yellow
    
    $pythonLocations = @(
        "C:\Python310\python.exe",
        "C:\Python311\python.exe",
        "C:\Python39\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
    )
    
    foreach ($loc in $pythonLocations) {
        if (Test-Path $loc) {
            Write-Host "  Found: $loc" -ForegroundColor Green
        }
    }
    
    $foundPython = Get-Command python -ErrorAction SilentlyContinue
    if ($foundPython) {
        Write-Host "  In PATH: $($foundPython.Source)" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "Run again with: -PythonPath 'C:\path\to\python.exe'" -ForegroundColor Yellow
    exit 1
}

$venvPath = Join-Path $SDPath "venv"

Write-Host "[1/3] Removing old venv..." -ForegroundColor Yellow
if (Test-Path $venvPath) {
    Remove-Item -Path $venvPath -Recurse -Force
    Write-Host "  Old venv removed" -ForegroundColor Gray
}

Write-Host "[2/3] Creating new venv with $PythonPath..." -ForegroundColor Yellow
& $PythonPath -m venv $venvPath
if ($LASTEXITCODE -ne 0) { 
    Write-Host "ERROR: Failed to create venv" -ForegroundColor Red
    exit 1 
}
Write-Host "  Venv created" -ForegroundColor Gray

Write-Host "[3/3] Upgrading pip..." -ForegroundColor Yellow
$newPython = Join-Path $venvPath "Scripts\python.exe"
& $newPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { 
    Write-Host "WARNING: pip upgrade failed, continuing..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  VENV FIXED!                                         " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run: .\Fix-SD-Complete.ps1 -SDPath '$SDPath'" -ForegroundColor White
Write-Host "  2. Or start SD WebUI: cd $SDPath && .\webui-user.bat" -ForegroundColor White
Write-Host ""
exit 0
