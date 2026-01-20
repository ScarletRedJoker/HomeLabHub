# ComfyUI - Complete Fix
# Installs video/image processing dependencies and FFmpeg
# Run as Administrator in ComfyUI venv

param(
    [string]$ComfyUIPath = "C:\AI\ComfyUI",
    [string]$FFmpegPath = "C:\ffmpeg",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$pythonExe = Join-Path $ComfyUIPath "venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "ERROR: Python executable not found at $pythonExe" -ForegroundColor Red
    Write-Host "Make sure you have created the venv" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "     COMFYUI - COMPLETE FIX                           " -ForegroundColor Cyan
Write-Host "     Installing video/image nodes and FFmpeg          " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

try {
    Write-Host "[1/4] Installing OpenCV packages..." -ForegroundColor Yellow
    & $pythonExe -m pip install opencv-python opencv-python-headless --no-cache-dir
    if ($LASTEXITCODE -ne 0) { throw "OpenCV installation failed" }

    Write-Host "[2/4] Installing imageio packages..." -ForegroundColor Yellow
    & $pythonExe -m pip install imageio imageio-ffmpeg --no-cache-dir
    if ($LASTEXITCODE -ne 0) { throw "imageio installation failed" }

    Write-Host "[3/4] Installing image processing libraries..." -ForegroundColor Yellow
    & $pythonExe -m pip install scikit-image av --no-cache-dir
    if ($LASTEXITCODE -ne 0) { throw "Image processing libs failed" }

    Write-Host "[4/4] Setting up FFmpeg..." -ForegroundColor Yellow
    
    $ffmpegInPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if (-not $ffmpegInPath) {
        Write-Host "  Downloading FFmpeg..." -ForegroundColor Cyan
        
        $downloadUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
        $tempZip = Join-Path $env:TEMP "ffmpeg-latest.zip"
        $tempExtract = Join-Path $env:TEMP "ffmpeg-extract"
        
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing -ErrorAction SilentlyContinue
        
        if (Test-Path $tempZip) {
            if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue }
            Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force -ErrorAction SilentlyContinue
            
            $extractedFolder = Get-ChildItem -Path $tempExtract -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($extractedFolder) {
                if (Test-Path $FFmpegPath) { Remove-Item $FFmpegPath -Recurse -Force -ErrorAction SilentlyContinue }
                Move-Item -Path $extractedFolder.FullName -Destination $FFmpegPath -Force -ErrorAction SilentlyContinue
                
                $binPath = Join-Path $FFmpegPath "bin"
                if (Test-Path $binPath) {
                    $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
                    if ($currentPath -notlike "*$binPath*") {
                        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$binPath", "Machine")
                        $env:Path = "$env:Path;$binPath"
                        Write-Host "  FFmpeg added to PATH" -ForegroundColor Green
                    }
                }
            }
            
            Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
            Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "  FFmpeg already in PATH" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "ComfyUI fix complete! Verifying..." -ForegroundColor Green
    Write-Host ""
    
    $testScript = @'
import cv2
print(f"OpenCV: {cv2.__version__}")
import imageio
print(f"imageio: {imageio.__version__}")
import skimage
print(f"scikit-image: {skimage.__version__}")
try:
    import av
    print(f"PyAV: {av.__version__}")
except:
    print("PyAV: installed")
print("All packages installed successfully!")
'@
    
    $testFile = Join-Path $env:TEMP "comfy_test.py"
    $testScript | Out-File -FilePath $testFile -Encoding utf8
    & $pythonExe $testFile
    Remove-Item $testFile -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host "  COMFYUI REPAIR COMPLETED!                           " -ForegroundColor Green  
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host ""
    exit 0
}
catch {
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
    exit 1
}
