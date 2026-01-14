#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Nebula Command - Windows AI Node Bootstrap Script
    Downloads and runs the full installer from GitHub

.DESCRIPTION
    One-line installation for Windows AI nodes:
    irm https://raw.githubusercontent.com/YOUR_ORG/nebula-command/main/deploy/windows/bootstrap.ps1 | iex

.PARAMETER Branch
    Git branch to use (default: main)

.PARAMETER InstallPath
    Where to clone the repository (default: C:\NebulaCommand)

.PARAMETER Unattended
    Run without prompts

.PARAMETER DashboardWebhook
    URL for health webhook reporting
#>

param(
    [string]$Branch = "main",
    [string]$InstallPath = "C:\NebulaCommand",
    [string]$RepoUrl = "",
    [switch]$Unattended,
    [string]$DashboardWebhook,
    [switch]$SkipOllama,
    [switch]$SkipStableDiffusion,
    [switch]$SkipComfyUI,
    [switch]$InstallTraining
)

if (-not $RepoUrl) {
    if ($env:NEBULA_REPO_URL) {
        $RepoUrl = $env:NEBULA_REPO_URL
    } else {
        Write-Host ""
        Write-Host "[Bootstrap] ERROR: Repository URL not specified!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please provide the repository URL using one of these methods:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Option 1: Set environment variable before running:" -ForegroundColor Cyan
        Write-Host "    `$env:NEBULA_REPO_URL = 'https://github.com/your-org/nebula-command.git'" -ForegroundColor White
        Write-Host ""
        Write-Host "  Option 2: Use the -RepoUrl parameter:" -ForegroundColor Cyan
        Write-Host "    .\bootstrap.ps1 -RepoUrl 'https://github.com/your-org/nebula-command.git'" -ForegroundColor White
        Write-Host ""
        Write-Host "  Option 3: For local installations, clone manually and run:" -ForegroundColor Cyan
        Write-Host "    git clone https://github.com/your-org/nebula-command.git C:\NebulaCommand" -ForegroundColor White
        Write-Host "    cd C:\NebulaCommand\deploy\windows" -ForegroundColor White
        Write-Host "    .\scripts\install-ai-node.ps1" -ForegroundColor White
        Write-Host ""
        exit 1
    }
}

$ErrorActionPreference = "Stop"

Write-Host @"
===============================================================================
 _   _      _           _         ____                                      _ 
| \ | | ___| |__  _   _| | __ _  / ___|___  _ __ ___  _ __ ___   __ _ _ __ | |
|  \| |/ _ \ '_ \| | | | |/ _` | | |   / _ \| '_ ` _ \| '_ ` _ \ / _` | '_ \| |
| |\  |  __/ |_) | |_| | | (_| | | |__| (_) | | | | | | | | | | | (_| | | | |_|
|_| \_|\___|_.__/ \__,_|_|\__,_|  \____\___/|_| |_| |_|_| |_| |_|\__,_|_| |_(_)
                                                                              
                    Windows AI Node Bootstrap Installer
===============================================================================
"@ -ForegroundColor Cyan

Write-Host ""
Write-Host "[Bootstrap] Starting Nebula Command AI Node installation..." -ForegroundColor Green
Write-Host "[Bootstrap] Repository: $RepoUrl" -ForegroundColor Gray
Write-Host "[Bootstrap] Branch: $Branch" -ForegroundColor Gray
Write-Host "[Bootstrap] Install Path: $InstallPath" -ForegroundColor Gray
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[Bootstrap] ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "[Bootstrap] Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

Write-Host "[Bootstrap] Checking for Git..." -ForegroundColor Cyan
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Write-Host "[Bootstrap] Installing Git via winget..." -ForegroundColor Yellow
    try {
        winget install Git.Git --accept-source-agreements --accept-package-agreements --silent
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $git = Get-Command git -ErrorAction SilentlyContinue
        
        if (-not $git) {
            Write-Host "[Bootstrap] WARNING: Git installed but not in PATH. Please restart PowerShell after script completes." -ForegroundColor Yellow
            $gitPath = "C:\Program Files\Git\bin\git.exe"
            if (Test-Path $gitPath) {
                $git = Get-Item $gitPath
            }
        }
    }
    catch {
        Write-Host "[Bootstrap] ERROR: Failed to install Git. Please install manually from https://git-scm.com" -ForegroundColor Red
        exit 1
    }
}

if ($git) {
    $gitVersion = & git --version 2>$null
    Write-Host "[Bootstrap] Git: $gitVersion" -ForegroundColor Green
}

if (Test-Path $InstallPath) {
    Write-Host "[Bootstrap] Existing installation found at $InstallPath" -ForegroundColor Yellow
    
    if (-not $Unattended) {
        $response = Read-Host "[Bootstrap] Update existing installation? (Y/n)"
        if ($response -eq "n" -or $response -eq "N") {
            Write-Host "[Bootstrap] Installation cancelled." -ForegroundColor Yellow
            exit 0
        }
    }
    
    Write-Host "[Bootstrap] Updating repository..." -ForegroundColor Cyan
    Push-Location $InstallPath
    & git fetch origin
    & git checkout $Branch
    & git pull origin $Branch
    Pop-Location
}
else {
    Write-Host "[Bootstrap] Cloning Nebula Command repository..." -ForegroundColor Cyan
    Write-Host "[Bootstrap] URL: $RepoUrl" -ForegroundColor Gray
    
    & git clone --branch $Branch --single-branch $RepoUrl $InstallPath
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[Bootstrap] ERROR: Failed to clone repository" -ForegroundColor Red
        Write-Host "[Bootstrap] URL: $RepoUrl" -ForegroundColor Red
        Write-Host "[Bootstrap] Make sure you have network access and the repository exists" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "[Bootstrap] To fix, set the correct URL:" -ForegroundColor Cyan
        Write-Host "  `$env:NEBULA_REPO_URL = 'https://github.com/your-org/your-repo.git'" -ForegroundColor White
        Write-Host "  Or use: .\bootstrap.ps1 -RepoUrl 'https://github.com/your-org/your-repo.git'" -ForegroundColor White
        exit 1
    }
}

Write-Host ""
Write-Host "[Bootstrap] Repository ready at $InstallPath" -ForegroundColor Green
Write-Host "[Bootstrap] Starting full AI node installation..." -ForegroundColor Cyan
Write-Host ""

# Use the new unified nebula-ai.ps1 manager
$unifiedManagerPath = Join-Path $InstallPath "deploy\windows\nebula-ai.ps1"
$legacyInstallerPath = Join-Path $InstallPath "deploy\windows\scripts\install-ai-node.ps1"

# Prefer the unified manager, fall back to legacy installer
if (Test-Path $unifiedManagerPath) {
    Write-Host "[Bootstrap] Using unified AI manager: nebula-ai.ps1" -ForegroundColor Cyan
    
    $installerArgs = @("install")
    
    if ($Unattended) { $installerArgs += "-Unattended" }
    if ($DashboardWebhook) { $installerArgs += "-DashboardWebhook"; $installerArgs += "`"$DashboardWebhook`"" }
    if ($SkipOllama) { $installerArgs += "-SkipOllama" }
    if ($SkipStableDiffusion) { $installerArgs += "-SkipStableDiffusion" }
    if ($SkipComfyUI) { $installerArgs += "-SkipComfyUI" }
    
    $argsString = $installerArgs -join " "
    Write-Host "[Bootstrap] Running: .\nebula-ai.ps1 $argsString" -ForegroundColor Gray
    Write-Host ""
    
    & $unifiedManagerPath @installerArgs
}
elseif (Test-Path $legacyInstallerPath) {
    Write-Host "[Bootstrap] Using legacy installer: install-ai-node.ps1" -ForegroundColor Yellow
    
    $installerArgs = @()
    
    if ($Unattended) { $installerArgs += "-Unattended" }
    if ($DashboardWebhook) { $installerArgs += "-DashboardWebhook"; $installerArgs += "`"$DashboardWebhook`"" }
    if ($SkipOllama) { $installerArgs += "-SkipOllama" }
    if ($SkipStableDiffusion) { $installerArgs += "-SkipStableDiffusion" }
    if ($SkipComfyUI) { $installerArgs += "-SkipComfyUI" }
    if ($InstallTraining) { $installerArgs += "-InstallTraining" }
    
    $argsString = $installerArgs -join " "
    Write-Host "[Bootstrap] Running: .\install-ai-node.ps1 $argsString" -ForegroundColor Gray
    Write-Host ""
    
    & $legacyInstallerPath @installerArgs
}
else {
    Write-Host "[Bootstrap] ERROR: No installer script found!" -ForegroundColor Red
    Write-Host "[Bootstrap] Expected: $unifiedManagerPath" -ForegroundColor Red
    Write-Host "[Bootstrap] Or: $legacyInstallerPath" -ForegroundColor Red
    exit 1
}

$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "===============================================================================" -ForegroundColor Green
    Write-Host " Installation Complete!" -ForegroundColor Green
    Write-Host "===============================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your Windows AI node is now ready. Quick commands:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  cd $InstallPath\deploy\windows" -ForegroundColor White
    Write-Host ""
    Write-Host "  .\nebula-ai.ps1 status       # Check all services" -ForegroundColor White
    Write-Host "  .\nebula-ai.ps1 start        # Start all services" -ForegroundColor White
    Write-Host "  .\nebula-ai.ps1 stop         # Stop all services" -ForegroundColor White
    Write-Host "  .\nebula-ai.ps1 repair       # Fix dependency issues" -ForegroundColor White
    Write-Host "  .\nebula-ai.ps1 models       # Download AI models" -ForegroundColor White
    Write-Host "  .\nebula-ai.ps1 update       # Update to latest versions" -ForegroundColor White
    Write-Host ""
    Write-Host "  View logs:  Get-Content C:\ProgramData\NebulaCommand\logs\nebula-ai.log" -ForegroundColor White
    Write-Host ""
    Write-Host "Service URLs:" -ForegroundColor Cyan
    Write-Host "  Ollama:             http://localhost:11434" -ForegroundColor White
    Write-Host "  Stable Diffusion:   http://localhost:7860" -ForegroundColor White
    Write-Host "  ComfyUI:            http://localhost:8188" -ForegroundColor White
    Write-Host ""
}
else {
    Write-Host ""
    Write-Host "===============================================================================" -ForegroundColor Red
    Write-Host " Installation Failed (Exit Code: $exitCode)" -ForegroundColor Red
    Write-Host "===============================================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check the installation log for details:" -ForegroundColor Yellow
    Write-Host "  Get-Content C:\ProgramData\NebulaCommand\logs\install.log -Tail 50" -ForegroundColor White
    Write-Host ""
}

exit $exitCode
