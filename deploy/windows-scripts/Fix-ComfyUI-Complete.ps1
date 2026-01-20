# Nebula Command - ComfyUI Complete Repair Script
# Fixes ALL critical ComfyUI issues including video nodes
# Run as Administrator

param(
    [string]$ComfyUIPath = "C:\AI\ComfyUI",
    [string]$FFmpegPath = "C:\ffmpeg",
    [switch]$InstallFFmpeg,
    [switch]$Force,
    [switch]$SkipVerification,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogFile = "C:\ProgramData\NebulaCommand\logs\comfyui-complete-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

$PINNED_VERSIONS = @{
    opencv_python = "4.9.0.80"
    opencv_python_headless = "4.9.0.80"
    imageio = "2.33.1"
    imageio_ffmpeg = "0.4.9"
    scikit_image = "0.22.0"
    pillow = "10.2.0"
    numpy = "1.26.4"
    scipy = "1.11.4"
    av = "11.0.0"
}

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

function Get-PythonExecutable {
    param([string]$BasePath)
    
    $venvPython = Join-Path $BasePath "venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }
    
    $pythonEmbedded = Join-Path $BasePath "python_embeded\python.exe"
    if (Test-Path $pythonEmbedded) {
        return $pythonEmbedded
    }
    
    return $null
}

function Test-FFmpegSystem {
    try {
        $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
        if ($ffmpeg) {
            return @{ Installed = $true; Path = $ffmpeg.Source }
        }
    } catch {}
    return @{ Installed = $false; Path = $null }
}

function Install-FFmpegToPATH {
    param([string]$InstallPath)
    
    Write-Log "Installing FFmpeg to $InstallPath..."
    
    $downloadUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    $tempZip = Join-Path $env:TEMP "ffmpeg-latest.zip"
    $tempExtract = Join-Path $env:TEMP "ffmpeg-extract-$(Get-Date -Format 'HHmmss')"
    
    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
        
        if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
        Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
        
        $extractedFolder = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
        
        if (Test-Path $InstallPath) { Remove-Item $InstallPath -Recurse -Force }
        Move-Item -Path $extractedFolder.FullName -Destination $InstallPath -Force
        
        $binPath = Join-Path $InstallPath "bin"
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        if ($currentPath -notlike "*$binPath*") {
            [Environment]::SetEnvironmentVariable("Path", "$currentPath;$binPath", "Machine")
            $env:Path = "$env:Path;$binPath"
        }
        
        Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
        Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
        
        return $true
    } catch {
        Write-Log "FFmpeg installation failed: $_" "ERROR"
        return $false
    }
}

function Show-Banner {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "║     COMFYUI - COMPLETE REPAIR                              ║" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "║     Fixes:                                                 ║" -ForegroundColor Cyan
    Write-Host "║       • ModuleNotFoundError: No module named 'cv2'         ║" -ForegroundColor Cyan
    Write-Host "║       • Failed to import imageio_ffmpeg                    ║" -ForegroundColor Cyan
    Write-Host "║       • VideoHelper nodes not working                      ║" -ForegroundColor Cyan
    Write-Host "║       • scikit-image missing for image processing          ║" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

Show-Banner

if (-not (Test-Path (Split-Path $LogFile -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $LogFile -Parent) -Force | Out-Null
}

Write-Log "Starting ComfyUI Complete Repair" "HEADER"
Write-Log "ComfyUI Path: $ComfyUIPath"

if (-not (Test-AdminPrivileges)) {
    Write-Log "Running without admin privileges - PATH modifications may fail" "WARN"
}

if (-not (Test-Path $ComfyUIPath)) {
    Write-Log "ComfyUI not found at $ComfyUIPath" "ERROR"
    exit 1
}

$pythonExe = Get-PythonExecutable -BasePath $ComfyUIPath
if (-not $pythonExe) {
    Write-Log "Python not found in ComfyUI installation" "ERROR"
    Write-Log "Run ComfyUI's install script first to create the environment"
    exit 1
}

Write-Log "Using Python: $pythonExe"

$results = @{
    FFmpeg = @{ Status = "PENDING"; Message = "" }
    OpenCV = @{ Status = "PENDING"; Message = "" }
    ImageIO = @{ Status = "PENDING"; Message = "" }
    VideoLibs = @{ Status = "PENDING"; Message = "" }
    Skimage = @{ Status = "PENDING"; Message = "" }
    Verification = @{ Status = "PENDING"; Message = "" }
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 1: FFmpeg System Installation" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

$ffmpegStatus = Test-FFmpegSystem
if ($ffmpegStatus.Installed -and -not $Force) {
    Write-Log "FFmpeg already installed at: $($ffmpegStatus.Path)" "SUCCESS"
    $results.FFmpeg.Status = "SUCCESS"
    $results.FFmpeg.Message = "Already installed"
} elseif ($InstallFFmpeg -or $Force) {
    if (Install-FFmpegToPATH -InstallPath $FFmpegPath) {
        Write-Log "FFmpeg installed successfully" "SUCCESS"
        $results.FFmpeg.Status = "SUCCESS"
    } else {
        Write-Log "FFmpeg installation failed - video encoding may not work" "WARN"
        $results.FFmpeg.Status = "FAILED"
    }
} else {
    Write-Log "FFmpeg not installed. Use -InstallFFmpeg to install" "WARN"
    $results.FFmpeg.Status = "SKIPPED"
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 2: OpenCV (cv2)" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

try {
    Write-Log "Uninstalling conflicting OpenCV packages..."
    & $pythonExe -m pip uninstall opencv-python opencv-python-headless opencv-contrib-python -y 2>&1 | Out-Null
    
    Write-Log "Installing opencv-python-headless $($PINNED_VERSIONS.opencv_python_headless)..."
    & $pythonExe -m pip install "opencv-python-headless==$($PINNED_VERSIONS.opencv_python_headless)" --no-cache-dir 2>&1 | Out-Null
    
    $cv2Test = & $pythonExe -c "import cv2; print(f'OpenCV {cv2.__version__}')" 2>&1
    if ($LASTEXITCODE -eq 0 -and $cv2Test -match "OpenCV") {
        Write-Log "OpenCV installed: $cv2Test" "SUCCESS"
        $results.OpenCV.Status = "SUCCESS"
        $results.OpenCV.Message = $cv2Test
    } else {
        Write-Log "Trying opencv-python as fallback..."
        & $pythonExe -m pip install "opencv-python==$($PINNED_VERSIONS.opencv_python)" --no-cache-dir 2>&1 | Out-Null
        
        $cv2Test = & $pythonExe -c "import cv2; print(f'OpenCV {cv2.__version__}')" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "OpenCV (fallback) installed: $cv2Test" "SUCCESS"
            $results.OpenCV.Status = "SUCCESS"
        } else {
            Write-Log "OpenCV installation failed: $cv2Test" "ERROR"
            $results.OpenCV.Status = "FAILED"
        }
    }
} catch {
    Write-Log "OpenCV installation error: $_" "ERROR"
    $results.OpenCV.Status = "FAILED"
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 3: imageio + imageio-ffmpeg" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

try {
    Write-Log "Installing imageio $($PINNED_VERSIONS.imageio)..."
    & $pythonExe -m pip install "imageio==$($PINNED_VERSIONS.imageio)" --no-cache-dir 2>&1 | Out-Null
    
    Write-Log "Installing imageio-ffmpeg $($PINNED_VERSIONS.imageio_ffmpeg)..."
    & $pythonExe -m pip install "imageio-ffmpeg==$($PINNED_VERSIONS.imageio_ffmpeg)" --no-cache-dir 2>&1 | Out-Null
    
    $imageioTest = & $pythonExe -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" 2>&1
    if ($LASTEXITCODE -eq 0 -and $imageioTest -notmatch "Error") {
        Write-Log "imageio-ffmpeg working: $imageioTest" "SUCCESS"
        $results.ImageIO.Status = "SUCCESS"
    } else {
        Write-Log "imageio-ffmpeg test failed: $imageioTest" "WARN"
        $results.ImageIO.Status = "PARTIAL"
        $results.ImageIO.Message = "Installed but ffmpeg binary may be missing"
    }
} catch {
    Write-Log "imageio installation error: $_" "ERROR"
    $results.ImageIO.Status = "FAILED"
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 4: Video Processing Libraries" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

try {
    Write-Log "Installing av (PyAV) $($PINNED_VERSIONS.av) for video processing..."
    & $pythonExe -m pip install "av==$($PINNED_VERSIONS.av)" --no-cache-dir 2>&1 | Out-Null
    
    Write-Log "Installing additional video dependencies..."
    & $pythonExe -m pip install moviepy 2>&1 | Out-Null
    
    $avTest = & $pythonExe -c "import av; print(f'PyAV {av.__version__}')" 2>&1
    if ($LASTEXITCODE -eq 0 -and $avTest -match "PyAV") {
        Write-Log "Video libraries installed: $avTest" "SUCCESS"
        $results.VideoLibs.Status = "SUCCESS"
    } else {
        Write-Log "Video libraries installation partial: $avTest" "WARN"
        $results.VideoLibs.Status = "PARTIAL"
    }
} catch {
    Write-Log "Video libraries installation error: $_" "ERROR"
    $results.VideoLibs.Status = "FAILED"
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " PHASE 5: scikit-image + Image Processing" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

try {
    Write-Log "Installing numpy $($PINNED_VERSIONS.numpy)..."
    & $pythonExe -m pip install "numpy==$($PINNED_VERSIONS.numpy)" --no-cache-dir 2>&1 | Out-Null
    
    Write-Log "Installing scipy $($PINNED_VERSIONS.scipy)..."
    & $pythonExe -m pip install "scipy==$($PINNED_VERSIONS.scipy)" --no-cache-dir 2>&1 | Out-Null
    
    Write-Log "Installing Pillow $($PINNED_VERSIONS.pillow)..."
    & $pythonExe -m pip install "Pillow==$($PINNED_VERSIONS.pillow)" --no-cache-dir 2>&1 | Out-Null
    
    Write-Log "Installing scikit-image $($PINNED_VERSIONS.scikit_image)..."
    & $pythonExe -m pip install "scikit-image==$($PINNED_VERSIONS.scikit_image)" --no-cache-dir 2>&1 | Out-Null
    
    $skimageTest = & $pythonExe -c "from skimage import transform, io; print('scikit-image OK')" 2>&1
    if ($LASTEXITCODE -eq 0 -and $skimageTest -match "OK") {
        Write-Log "scikit-image installed and working" "SUCCESS"
        $results.Skimage.Status = "SUCCESS"
    } else {
        Write-Log "scikit-image test failed: $skimageTest" "WARN"
        $results.Skimage.Status = "PARTIAL"
    }
} catch {
    Write-Log "scikit-image installation error: $_" "ERROR"
    $results.Skimage.Status = "FAILED"
}

if (-not $SkipVerification) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
    Write-Host " PHASE 6: Full Verification" -ForegroundColor Magenta
    Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
    
    $verificationTests = @(
        @{ Name = "OpenCV"; Code = "import cv2; print('OK')" },
        @{ Name = "imageio"; Code = "import imageio; print('OK')" },
        @{ Name = "imageio_ffmpeg"; Code = "import imageio_ffmpeg; imageio_ffmpeg.get_ffmpeg_exe(); print('OK')" },
        @{ Name = "PyAV"; Code = "import av; print('OK')" },
        @{ Name = "scikit-image"; Code = "from skimage import transform; print('OK')" },
        @{ Name = "Pillow"; Code = "from PIL import Image; print('OK')" },
        @{ Name = "numpy"; Code = "import numpy; print('OK')" },
        @{ Name = "scipy"; Code = "import scipy; print('OK')" }
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
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                     REPAIR SUMMARY                         ║" -ForegroundColor Cyan
Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan

foreach ($phase in @("FFmpeg", "OpenCV", "ImageIO", "VideoLibs", "Skimage", "Verification")) {
    $status = $results[$phase].Status
    $color = switch ($status) {
        "SUCCESS" { "Green" }
        "PARTIAL" { "Yellow" }
        "SKIPPED" { "Gray" }
        default { "Red" }
    }
    $icon = switch ($status) {
        "SUCCESS" { "✓" }
        "PARTIAL" { "~" }
        "SKIPPED" { "-" }
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
    Write-Host "ComfyUI repair completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installed packages:" -ForegroundColor Cyan
    Write-Host "  OpenCV:         $($PINNED_VERSIONS.opencv_python_headless)" -ForegroundColor White
    Write-Host "  imageio:        $($PINNED_VERSIONS.imageio)" -ForegroundColor White
    Write-Host "  imageio-ffmpeg: $($PINNED_VERSIONS.imageio_ffmpeg)" -ForegroundColor White
    Write-Host "  PyAV:           $($PINNED_VERSIONS.av)" -ForegroundColor White
    Write-Host "  scikit-image:   $($PINNED_VERSIONS.scikit_image)" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Restart ComfyUI" -ForegroundColor White
    Write-Host "  2. VideoHelper nodes should now work" -ForegroundColor White
    Write-Host "  3. If issues persist, restart your terminal for PATH changes" -ForegroundColor White
    exit 0
} else {
    Write-Host ""
    Write-Host "Some repairs failed. Check log for details: $LogFile" -ForegroundColor Yellow
    exit 1
}
