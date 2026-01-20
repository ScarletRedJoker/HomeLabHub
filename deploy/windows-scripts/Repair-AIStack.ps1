# Nebula Command - AI Stack Repair Master Script
# Runs all fix scripts to repair common Windows AI stack issues
# Run as Administrator

param(
    [string]$ComfyUIPath = "C:\AI\ComfyUI",
    [string]$SDPath = "C:\AI\stable-diffusion-webui",
    [string]$FFmpegPath = "C:\ffmpeg",
    [string]$CudaVersion = "12.1",
    [switch]$SkipComfyUI,
    [switch]$SkipStableDiffusion,
    [switch]$SkipFFmpeg,
    [switch]$Force,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogFile = "C:\ProgramData\NebulaCommand\logs\ai-stack-repair-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry -ForegroundColor $(switch($Level) { "ERROR" { "Red" } "WARN" { "Yellow" } "SUCCESS" { "Green" } "HEADER" { "Cyan" } default { "White" } })
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
}

function Test-AdminPrivileges {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    return $isAdmin
}

function Get-SystemInfo {
    $info = @{}
    
    try {
        $gpu = Get-CimInstance -ClassName Win32_VideoController | Where-Object { $_.Name -like "*NVIDIA*" }
        if ($gpu) {
            $info.GPU = $gpu.Name
            $nvidiaSmi = & nvidia-smi --query-gpu=driver_version,memory.total --format=csv,noheader,nounits 2>$null
            if ($nvidiaSmi) {
                $parts = $nvidiaSmi -split ","
                $info.DriverVersion = $parts[0].Trim()
                $info.VRAM = "$($parts[1].Trim()) MB"
            }
            $cudaVersion = & nvidia-smi 2>&1 | Select-String "CUDA Version:"
            if ($cudaVersion -match "CUDA Version:\s*(\d+\.\d+)") {
                $info.CudaVersion = $matches[1]
            }
        }
    } catch {}
    
    try {
        $python = Get-Command python -ErrorAction SilentlyContinue
        if ($python) {
            $info.Python = (& python --version 2>&1).ToString().Trim()
        }
    } catch {}
    
    try {
        $git = Get-Command git -ErrorAction SilentlyContinue
        if ($git) {
            $info.Git = (& git --version 2>&1).ToString().Trim()
        }
    } catch {}
    
    return $info
}

function Show-Banner {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "║     NEBULA COMMAND - AI STACK REPAIR UTILITY               ║" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "║     Fixes common issues with:                              ║" -ForegroundColor Cyan
    Write-Host "║       • ComfyUI (OpenCV, imageio_ffmpeg, skimage)          ║" -ForegroundColor Cyan
    Write-Host "║       • Stable Diffusion (NumPy 2.0, xformers, torch)      ║" -ForegroundColor Cyan
    Write-Host "║       • FFmpeg system installation                         ║" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Show-SystemInfo {
    param($Info)
    
    Write-Host "System Information:" -ForegroundColor Cyan
    Write-Host "  GPU:          $(if ($Info.GPU) { $Info.GPU } else { 'Not detected' })" -ForegroundColor White
    Write-Host "  Driver:       $(if ($Info.DriverVersion) { $Info.DriverVersion } else { 'N/A' })" -ForegroundColor White
    Write-Host "  VRAM:         $(if ($Info.VRAM) { $Info.VRAM } else { 'N/A' })" -ForegroundColor White
    Write-Host "  CUDA:         $(if ($Info.CudaVersion) { $Info.CudaVersion } else { 'N/A' })" -ForegroundColor White
    Write-Host "  Python:       $(if ($Info.Python) { $Info.Python } else { 'Not installed' })" -ForegroundColor White
    Write-Host "  Git:          $(if ($Info.Git) { $Info.Git } else { 'Not installed' })" -ForegroundColor White
    Write-Host ""
}

Show-Banner

if (-not (Test-Path (Split-Path $LogFile -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $LogFile -Parent) -Force | Out-Null
}

Write-Log "========================================" "HEADER"
Write-Log "AI Stack Repair Started" "HEADER"
Write-Log "========================================" "HEADER"

if (-not (Test-AdminPrivileges)) {
    Write-Log "This script should be run as Administrator for full functionality" "WARN"
    Write-Host "WARNING: Running without admin privileges. Some fixes may fail." -ForegroundColor Yellow
    Write-Host ""
}

$sysInfo = Get-SystemInfo
Show-SystemInfo -Info $sysInfo
Write-Log "System info collected"

if ($sysInfo.CudaVersion -and $CudaVersion -eq "12.1") {
    $CudaVersion = $sysInfo.CudaVersion
    Write-Log "Using detected CUDA version: $CudaVersion"
}

$results = @{
    ComfyUI = @{ Status = "SKIPPED"; ExitCode = 0 }
    StableDiffusion = @{ Status = "SKIPPED"; ExitCode = 0 }
    FFmpeg = @{ Status = "SKIPPED"; ExitCode = 0 }
}

if (-not $SkipFFmpeg) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
    Write-Host " PHASE 1: FFmpeg Installation" -ForegroundColor Magenta
    Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
    Write-Log "Starting FFmpeg installation phase"
    
    $ffmpegScript = Join-Path $ScriptDir "Install-FFmpeg.ps1"
    if (Test-Path $ffmpegScript) {
        $ffmpegArgs = @("-InstallPath", $FFmpegPath)
        if ($Force) { $ffmpegArgs += "-Force" }
        
        try {
            & $ffmpegScript @ffmpegArgs
            $results.FFmpeg.ExitCode = $LASTEXITCODE
            $results.FFmpeg.Status = if ($LASTEXITCODE -eq 0) { "SUCCESS" } else { "FAILED" }
        } catch {
            Write-Log "FFmpeg script error: $_" "ERROR"
            $results.FFmpeg.Status = "ERROR"
            $results.FFmpeg.ExitCode = 1
        }
    } else {
        Write-Log "FFmpeg script not found: $ffmpegScript" "ERROR"
        $results.FFmpeg.Status = "NOT_FOUND"
    }
} else {
    Write-Log "Skipping FFmpeg installation (--SkipFFmpeg)"
}

if (-not $SkipComfyUI) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
    Write-Host " PHASE 2: ComfyUI Dependencies" -ForegroundColor Magenta
    Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
    Write-Log "Starting ComfyUI fixes phase"
    
    if (-not (Test-Path $ComfyUIPath)) {
        Write-Log "ComfyUI not found at $ComfyUIPath - skipping" "WARN"
        $results.ComfyUI.Status = "NOT_FOUND"
    } else {
        $comfyScript = Join-Path $ScriptDir "Fix-ComfyUI-Dependencies.ps1"
        if (Test-Path $comfyScript) {
            $comfyArgs = @("-ComfyUIPath", $ComfyUIPath)
            if ($Force) { $comfyArgs += "-Force" }
            
            try {
                & $comfyScript @comfyArgs
                $results.ComfyUI.ExitCode = $LASTEXITCODE
                $results.ComfyUI.Status = if ($LASTEXITCODE -eq 0) { "SUCCESS" } else { "PARTIAL" }
            } catch {
                Write-Log "ComfyUI script error: $_" "ERROR"
                $results.ComfyUI.Status = "ERROR"
                $results.ComfyUI.ExitCode = 1
            }
        } else {
            Write-Log "ComfyUI script not found: $comfyScript" "ERROR"
            $results.ComfyUI.Status = "NOT_FOUND"
        }
    }
} else {
    Write-Log "Skipping ComfyUI fixes (--SkipComfyUI)"
}

if (-not $SkipStableDiffusion) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
    Write-Host " PHASE 3: Stable Diffusion Dependencies" -ForegroundColor Magenta
    Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
    Write-Log "Starting Stable Diffusion fixes phase"
    
    if (-not (Test-Path $SDPath)) {
        Write-Log "Stable Diffusion not found at $SDPath - skipping" "WARN"
        $results.StableDiffusion.Status = "NOT_FOUND"
    } else {
        $sdScript = Join-Path $ScriptDir "Fix-StableDiffusion-Dependencies.ps1"
        if (Test-Path $sdScript) {
            $sdArgs = @("-SDPath", $SDPath, "-CudaVersion", $CudaVersion)
            if ($Force) { $sdArgs += "-Force" }
            
            try {
                & $sdScript @sdArgs
                $results.StableDiffusion.ExitCode = $LASTEXITCODE
                $results.StableDiffusion.Status = if ($LASTEXITCODE -eq 0) { "SUCCESS" } else { "PARTIAL" }
            } catch {
                Write-Log "Stable Diffusion script error: $_" "ERROR"
                $results.StableDiffusion.Status = "ERROR"
                $results.StableDiffusion.ExitCode = 1
            }
        } else {
            Write-Log "Stable Diffusion script not found: $sdScript" "ERROR"
            $results.StableDiffusion.Status = "NOT_FOUND"
        }
    }
} else {
    Write-Log "Skipping Stable Diffusion fixes (--SkipStableDiffusion)"
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                     REPAIR SUMMARY                         ║" -ForegroundColor Cyan
Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan

foreach ($component in @("FFmpeg", "ComfyUI", "StableDiffusion")) {
    $status = $results[$component].Status
    $color = switch ($status) {
        "SUCCESS" { "Green" }
        "PARTIAL" { "Yellow" }
        "SKIPPED" { "Gray" }
        "NOT_FOUND" { "DarkYellow" }
        default { "Red" }
    }
    $icon = switch ($status) {
        "SUCCESS" { "✓" }
        "PARTIAL" { "~" }
        "SKIPPED" { "-" }
        "NOT_FOUND" { "?" }
        default { "✗" }
    }
    
    $paddedComponent = $component.PadRight(20)
    $paddedStatus = $status.PadRight(15)
    Write-Host "║  $icon $paddedComponent $paddedStatus                ║" -ForegroundColor $color
}

Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

$successCount = ($results.Values | Where-Object { $_.Status -eq "SUCCESS" }).Count
$failCount = ($results.Values | Where-Object { $_.Status -in @("FAILED", "ERROR") }).Count
$partialCount = ($results.Values | Where-Object { $_.Status -eq "PARTIAL" }).Count

Write-Host ""
Write-Log "Repair completed: $successCount success, $partialCount partial, $failCount failed"

if ($failCount -gt 0) {
    Write-Host "Some repairs failed. Check the log for details:" -ForegroundColor Yellow
    Write-Host "  $LogFile" -ForegroundColor White
    Write-Host ""
    Write-Host "Troubleshooting tips:" -ForegroundColor Cyan
    Write-Host "  1. Run as Administrator" -ForegroundColor White
    Write-Host "  2. Ensure NVIDIA drivers and CUDA are properly installed" -ForegroundColor White
    Write-Host "  3. Run with -Force to reinstall even if components exist" -ForegroundColor White
    Write-Host "  4. Check that ComfyUI/SD have been run at least once (venv created)" -ForegroundColor White
    exit 1
} elseif ($partialCount -gt 0) {
    Write-Host "Some repairs completed with warnings. Review the log:" -ForegroundColor Yellow
    Write-Host "  $LogFile" -ForegroundColor White
    exit 0
} else {
    Write-Host "All repairs completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Restart any running AI services (ComfyUI, SD WebUI)" -ForegroundColor White
    Write-Host "  2. Restart your terminal/IDE for PATH changes" -ForegroundColor White
    Write-Host "  3. Test each service to verify fixes" -ForegroundColor White
    exit 0
}
