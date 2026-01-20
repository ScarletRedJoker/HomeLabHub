# Nebula Command - Complete AI Stack Repair
# Runs all fix scripts in sequence
# Run as Administrator

param(
    [string]$SDPath = "C:\AI\stable-diffusion-webui-forge",
    [string]$ComfyUIPath = "C:\AI\ComfyUI",
    [string]$FFmpegPath = "C:\ffmpeg",
    [string]$PythonPath = "C:\Python310\python.exe",
    [switch]$SDOnly,
    [switch]$ComfyOnly,
    [switch]$FixVenv
)

$scriptDir = $PSScriptRoot

Write-Host ""
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host "     NEBULA COMMAND - AI STACK REPAIR                 " -ForegroundColor Magenta
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host ""

$results = @{
    SDVenv = "SKIPPED"
    StableDiffusion = "SKIPPED"
    ComfyUI = "SKIPPED"
}

if (-not $ComfyOnly) {
    $sdVenvPython = Join-Path $SDPath "venv\Scripts\python.exe"
    
    if ($FixVenv -or -not (Test-Path $sdVenvPython)) {
        Write-Host "--- SD Venv Fix ---" -ForegroundColor Cyan
        Write-Host ""
        
        $venvScript = Join-Path $scriptDir "Fix-SD-Venv.ps1"
        if (Test-Path $venvScript) {
            try {
                & $venvScript -SDPath $SDPath -PythonPath $PythonPath
                if ($LASTEXITCODE -eq 0) {
                    $results.SDVenv = "SUCCESS"
                } else {
                    $results.SDVenv = "FAILED"
                }
            }
            catch {
                Write-Host "Venv Fix Error: $_" -ForegroundColor Red
                $results.SDVenv = "FAILED"
            }
        } else {
            Write-Host "Fix-SD-Venv.ps1 not found" -ForegroundColor Red
            $results.SDVenv = "NOT_FOUND"
        }
        Write-Host ""
    }
    
    Write-Host "--- Stable Diffusion Repair ---" -ForegroundColor Cyan
    Write-Host ""
    
    $sdScript = Join-Path $scriptDir "Fix-SD-Complete.ps1"
    if (Test-Path $sdScript) {
        $sdVenvPython = Join-Path $SDPath "venv\Scripts\python.exe"
        if (Test-Path $sdVenvPython) {
            try {
                & $sdScript -SDPath $SDPath
                if ($LASTEXITCODE -eq 0) {
                    $results.StableDiffusion = "SUCCESS"
                } else {
                    $results.StableDiffusion = "FAILED"
                }
            }
            catch {
                Write-Host "SD Repair Error: $_" -ForegroundColor Red
                $results.StableDiffusion = "FAILED"
            }
        } else {
            Write-Host "SD venv not found. Run with -FixVenv to create it." -ForegroundColor Yellow
            $results.StableDiffusion = "NO_VENV"
        }
    } else {
        Write-Host "Fix-SD-Complete.ps1 not found" -ForegroundColor Red
        $results.StableDiffusion = "NOT_FOUND"
    }
    Write-Host ""
}

if (-not $SDOnly) {
    Write-Host "--- ComfyUI Repair ---" -ForegroundColor Cyan
    Write-Host ""
    
    $comfyScript = Join-Path $scriptDir "Fix-ComfyUI-Complete.ps1"
    if (Test-Path $comfyScript) {
        try {
            & $comfyScript -ComfyUIPath $ComfyUIPath -FFmpegPath $FFmpegPath
            if ($LASTEXITCODE -eq 0) {
                $results.ComfyUI = "SUCCESS"
            } else {
                $results.ComfyUI = "FAILED"
            }
        }
        catch {
            Write-Host "ComfyUI Repair Error: $_" -ForegroundColor Red
            $results.ComfyUI = "FAILED"
        }
    } else {
        Write-Host "Fix-ComfyUI-Complete.ps1 not found" -ForegroundColor Red
        $results.ComfyUI = "NOT_FOUND"
    }
    Write-Host ""
}

Write-Host "======================================================" -ForegroundColor Magenta
Write-Host "                    RESULTS                           " -ForegroundColor Magenta
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host ""

foreach ($key in $results.Keys) {
    $status = $results[$key]
    if ($status -eq "SKIPPED") { continue }
    $color = switch ($status) {
        "SUCCESS" { "Green" }
        "FAILED" { "Red" }
        "NO_VENV" { "Yellow" }
        default { "Gray" }
    }
    Write-Host "  $key : $status" -ForegroundColor $color
}

Write-Host ""

$failed = ($results.Values | Where-Object { $_ -eq "FAILED" }).Count
if ($failed -gt 0) {
    Write-Host "Some repairs failed. Check output above." -ForegroundColor Red
    exit 1
} else {
    Write-Host "All repairs completed!" -ForegroundColor Green
    exit 0
}
