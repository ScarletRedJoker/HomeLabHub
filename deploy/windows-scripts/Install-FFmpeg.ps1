# Nebula Command - FFmpeg Installation Script
# Downloads and installs ffmpeg to Windows system PATH
# Run as Administrator

param(
    [string]$InstallPath = "C:\ffmpeg",
    [switch]$Force,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogFile = "C:\ProgramData\NebulaCommand\logs\ffmpeg-install-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

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

function Test-FFmpegInstalled {
    try {
        $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
        if ($ffmpeg) {
            $version = & ffmpeg -version 2>&1 | Select-Object -First 1
            return @{ Installed = $true; Path = $ffmpeg.Source; Version = $version }
        }
    } catch {}
    return @{ Installed = $false; Path = $null; Version = $null }
}

function Add-ToSystemPath {
    param([string]$PathToAdd)
    
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    if ($currentPath -notlike "*$PathToAdd*") {
        $newPath = "$currentPath;$PathToAdd"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
        $env:Path = $newPath
        return $true
    }
    return $false
}

function Get-FFmpegDownloadUrl {
    $apiUrl = "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest"
    
    try {
        $release = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing
        $asset = $release.assets | Where-Object { 
            $_.name -match "ffmpeg-master-latest-win64-gpl\.zip$" -or
            $_.name -match "ffmpeg-n.*-win64-gpl\.zip$"
        } | Select-Object -First 1
        
        if ($asset) {
            return $asset.browser_download_url
        }
    } catch {
        Write-Log "Failed to get latest release from GitHub API: $_" "WARN"
    }
    
    return "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
}

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " FFmpeg Installation" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path (Split-Path $LogFile -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $LogFile -Parent) -Force | Out-Null
}

Write-Log "Starting FFmpeg installation script"
Write-Log "Install path: $InstallPath"

if (-not (Test-AdminPrivileges)) {
    Write-Log "This script requires administrator privileges to modify system PATH" "ERROR"
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Red
    exit 1
}

$existingFFmpeg = Test-FFmpegInstalled
if (-not $Force -and $existingFFmpeg.Installed) {
    Write-Log "FFmpeg already installed at: $($existingFFmpeg.Path)" "SUCCESS"
    Write-Log "Version: $($existingFFmpeg.Version)"
    Write-Host ""
    Write-Host "FFmpeg is already installed. Use -Force to reinstall." -ForegroundColor Green
    exit 0
}

$binPath = Join-Path $InstallPath "bin"

Write-Host ""
Write-Host "[1/4] Downloading FFmpeg..." -ForegroundColor Cyan

$downloadUrl = Get-FFmpegDownloadUrl
Write-Log "Download URL: $downloadUrl"

$tempZip = Join-Path $env:TEMP "ffmpeg-latest.zip"
$tempExtract = Join-Path $env:TEMP "ffmpeg-extract"

try {
    Write-Log "Downloading FFmpeg..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
    Write-Log "Download complete" "SUCCESS"
} catch {
    Write-Log "Failed to download FFmpeg: $_" "ERROR"
    exit 1
}

Write-Host ""
Write-Host "[2/4] Extracting FFmpeg..." -ForegroundColor Cyan

try {
    if (Test-Path $tempExtract) {
        Remove-Item $tempExtract -Recurse -Force
    }
    
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    Write-Log "Extraction complete" "SUCCESS"
    
    $extractedFolder = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
    Write-Log "Extracted folder: $($extractedFolder.FullName)"
} catch {
    Write-Log "Failed to extract FFmpeg: $_" "ERROR"
    exit 1
}

Write-Host ""
Write-Host "[3/4] Installing FFmpeg to $InstallPath..." -ForegroundColor Cyan

try {
    if (Test-Path $InstallPath) {
        if ($Force) {
            Write-Log "Removing existing installation..."
            Remove-Item $InstallPath -Recurse -Force
        }
    }
    
    Move-Item -Path $extractedFolder.FullName -Destination $InstallPath -Force
    Write-Log "FFmpeg installed to $InstallPath" "SUCCESS"
    
    if (Test-Path "$InstallPath\bin\ffmpeg.exe") {
        Write-Log "ffmpeg.exe found in bin directory" "SUCCESS"
    } else {
        Write-Log "ffmpeg.exe not found in expected location" "WARN"
    }
} catch {
    Write-Log "Failed to install FFmpeg: $_" "ERROR"
    exit 1
}

Write-Host ""
Write-Host "[4/4] Adding FFmpeg to system PATH..." -ForegroundColor Cyan

try {
    if (Add-ToSystemPath -PathToAdd $binPath) {
        Write-Log "Added $binPath to system PATH" "SUCCESS"
    } else {
        Write-Log "FFmpeg bin directory already in PATH" "SUCCESS"
    }
    
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
} catch {
    Write-Log "Failed to update PATH: $_" "ERROR"
    Write-Log "Manually add $binPath to your system PATH" "WARN"
}

Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " Verification" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

$verifyFFmpeg = Test-FFmpegInstalled
if ($verifyFFmpeg.Installed) {
    Write-Log "FFmpeg installation verified" "SUCCESS"
    Write-Host ""
    Write-Host "FFmpeg installed successfully!" -ForegroundColor Green
    Write-Host "Path: $($verifyFFmpeg.Path)" -ForegroundColor White
    Write-Host "Version: $($verifyFFmpeg.Version)" -ForegroundColor White
    Write-Host ""
    Write-Host "Installed binaries:" -ForegroundColor Cyan
    Get-ChildItem "$binPath\*.exe" | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor White }
    
    Write-Host ""
    Write-Host "Note: You may need to restart your terminal or IDE for PATH changes to take effect." -ForegroundColor Yellow
    
    exit 0
} else {
    Write-Log "FFmpeg installation verification failed" "ERROR"
    Write-Host ""
    Write-Host "FFmpeg installation may have succeeded but verification failed." -ForegroundColor Yellow
    Write-Host "Try restarting your terminal and running 'ffmpeg -version'" -ForegroundColor Yellow
    Write-Host "FFmpeg should be at: $binPath\ffmpeg.exe" -ForegroundColor Yellow
    exit 1
}
