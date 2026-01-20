# Nebula Command - ComfyUI Dependencies Fix Script
# Fixes: cv2/OpenCV, VideoHelperSuite imageio_ffmpeg, and other common issues
# Run as Administrator

param(
    [string]$ComfyUIPath = "C:\AI\ComfyUI",
    [switch]$Force,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogFile = "C:\ProgramData\NebulaCommand\logs\comfyui-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

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

function Test-OpenCVInstalled {
    param([string]$PythonExe)
    
    try {
        $result = & $PythonExe -c "import cv2; print(cv2.__version__)" 2>&1
        if ($LASTEXITCODE -eq 0 -and $result -notmatch "Error|ModuleNotFoundError") {
            return $true
        }
    } catch {}
    return $false
}

function Test-ImageIOFFmpegInstalled {
    param([string]$PythonExe)
    
    try {
        $result = & $PythonExe -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" 2>&1
        if ($LASTEXITCODE -eq 0 -and $result -notmatch "Error|ModuleNotFoundError") {
            return $true
        }
    } catch {}
    return $false
}

function Test-SkimageInstalled {
    param([string]$PythonExe)
    
    try {
        $result = & $PythonExe -c "from skimage import transform; print('OK')" 2>&1
        if ($LASTEXITCODE -eq 0 -and $result -match "OK") {
            return $true
        }
    } catch {}
    return $false
}

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " ComfyUI Dependencies Fix" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path (Split-Path $LogFile -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $LogFile -Parent) -Force | Out-Null
}

Write-Log "Starting ComfyUI dependency fix script"
Write-Log "ComfyUI Path: $ComfyUIPath"

if (-not (Test-AdminPrivileges)) {
    Write-Log "WARNING: Running without administrator privileges. Some fixes may fail." "WARN"
}

if (-not (Test-Path $ComfyUIPath)) {
    Write-Log "ComfyUI not found at $ComfyUIPath" "ERROR"
    Write-Log "Please specify correct path with -ComfyUIPath parameter"
    exit 1
}

$pythonExe = Get-PythonExecutable -BasePath $ComfyUIPath
if (-not $pythonExe) {
    Write-Log "Python executable not found" "ERROR"
    exit 1
}
Write-Log "Using Python: $pythonExe"

$fixes = @{
    OpenCV = @{ Applied = $false; Success = $false; Skipped = $false }
    ImageIOFFmpeg = @{ Applied = $false; Success = $false; Skipped = $false }
    Skimage = @{ Applied = $false; Success = $false; Skipped = $false }
    Pillow = @{ Applied = $false; Success = $false; Skipped = $false }
}

Write-Host ""
Write-Host "[1/4] OpenCV (cv2) Fix" -ForegroundColor Cyan
Write-Log "Checking OpenCV installation..."

if (-not $Force -and (Test-OpenCVInstalled -PythonExe $pythonExe)) {
    Write-Log "OpenCV already installed and working" "SUCCESS"
    $fixes.OpenCV.Skipped = $true
} else {
    Write-Log "Installing opencv-python and opencv-python-headless..."
    $fixes.OpenCV.Applied = $true
    
    try {
        & $pythonExe -m pip uninstall opencv-python opencv-python-headless opencv-contrib-python -y 2>&1 | Out-Null
        
        $output = & $pythonExe -m pip install opencv-python-headless --no-cache-dir 2>&1
        
        if (Test-OpenCVInstalled -PythonExe $pythonExe) {
            $version = & $pythonExe -c "import cv2; print(cv2.__version__)" 2>&1
            Write-Log "OpenCV installed successfully: v$version" "SUCCESS"
            $fixes.OpenCV.Success = $true
        } else {
            Write-Log "OpenCV installation verification failed" "ERROR"
            Write-Log "Trying alternative: opencv-python..."
            & $pythonExe -m pip install opencv-python --no-cache-dir 2>&1 | Out-Null
            if (Test-OpenCVInstalled -PythonExe $pythonExe) {
                Write-Log "OpenCV (alternative) installed successfully" "SUCCESS"
                $fixes.OpenCV.Success = $true
            }
        }
    } catch {
        Write-Log "OpenCV installation error: $_" "ERROR"
    }
}

Write-Host ""
Write-Host "[2/4] imageio_ffmpeg Fix (VideoHelperSuite)" -ForegroundColor Cyan
Write-Log "Checking imageio_ffmpeg installation..."

if (-not $Force -and (Test-ImageIOFFmpegInstalled -PythonExe $pythonExe)) {
    Write-Log "imageio_ffmpeg already installed and working" "SUCCESS"
    $fixes.ImageIOFFmpeg.Skipped = $true
} else {
    Write-Log "Installing imageio and imageio_ffmpeg..."
    $fixes.ImageIOFFmpeg.Applied = $true
    
    try {
        & $pythonExe -m pip install imageio imageio-ffmpeg --no-cache-dir 2>&1 | Out-Null
        
        if (Test-ImageIOFFmpegInstalled -PythonExe $pythonExe) {
            $ffmpegPath = & $pythonExe -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" 2>&1
            Write-Log "imageio_ffmpeg installed successfully" "SUCCESS"
            Write-Log "FFmpeg binary: $ffmpegPath"
            $fixes.ImageIOFFmpeg.Success = $true
        } else {
            Write-Log "imageio_ffmpeg installation failed - ffmpeg binary may be missing" "WARN"
            Write-Log "Run Install-FFmpeg.ps1 to install system ffmpeg" "WARN"
        }
    } catch {
        Write-Log "imageio_ffmpeg installation error: $_" "ERROR"
    }
}

Write-Host ""
Write-Host "[3/4] scikit-image (skimage) Fix" -ForegroundColor Cyan
Write-Log "Checking scikit-image installation..."

if (-not $Force -and (Test-SkimageInstalled -PythonExe $pythonExe)) {
    Write-Log "scikit-image already installed and working" "SUCCESS"
    $fixes.Skimage.Skipped = $true
} else {
    Write-Log "Reinstalling scikit-image with compatible version..."
    $fixes.Skimage.Applied = $true
    
    try {
        & $pythonExe -m pip uninstall scikit-image -y 2>&1 | Out-Null
        & $pythonExe -m pip install "scikit-image>=0.21.0,<0.23.0" --no-cache-dir 2>&1 | Out-Null
        
        if (Test-SkimageInstalled -PythonExe $pythonExe) {
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
Write-Host "[4/4] Pillow Compatibility Fix" -ForegroundColor Cyan
Write-Log "Ensuring Pillow compatibility..."

try {
    $fixes.Pillow.Applied = $true
    & $pythonExe -m pip install "Pillow>=9.5.0,<11.0.0" --upgrade --no-cache-dir 2>&1 | Out-Null
    $pillowVersion = & $pythonExe -c "import PIL; print(PIL.__version__)" 2>&1
    Write-Log "Pillow version: $pillowVersion" "SUCCESS"
    $fixes.Pillow.Success = $true
} catch {
    Write-Log "Pillow fix error: $_" "ERROR"
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
    Write-Host "All ComfyUI dependency fixes completed successfully!" -ForegroundColor Green
    Write-Log "All fixes completed successfully" "SUCCESS"
    exit 0
} else {
    Write-Host "Some fixes failed. Check log: $LogFile" -ForegroundColor Yellow
    Write-Log "Some fixes failed" "WARN"
    exit 1
}
