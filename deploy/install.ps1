#Requires -Version 5.1
<#
.SYNOPSIS
    Nebula Command - Windows One-Liner Installer

.DESCRIPTION
    Usage: irm https://raw.githubusercontent.com/yourusername/nebula-command/main/deploy/install.ps1 | iex
    Or: .\install.ps1 [options]

    This script downloads and installs Nebula Command on Windows systems.

.PARAMETER NebulaHome
    Installation directory (default: C:\NebulaCommand)

.PARAMETER Version
    Git branch/tag to install (default: main)

.PARAMETER SkipBootstrap
    Skip running the bootstrap script after installation

.EXAMPLE
    .\install.ps1
    .\install.ps1 -NebulaHome "D:\NebulaCommand"
    .\install.ps1 -Version "v2.0.0"
#>

param(
    [string]$NebulaHome = "C:\NebulaCommand",
    [string]$Version = "main",
    [switch]$SkipBootstrap
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepoUrl = if ($env:NEBULA_REPO) { $env:NEBULA_REPO } else { "https://github.com/nebula-command/nebula-command.git" }

function Write-Banner {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║           Nebula Command - Windows Installer                  ║" -ForegroundColor Cyan
    Write-Host "║                                                               ║" -ForegroundColor Cyan
    Write-Host "║   Automated deployment for AI infrastructure management      ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Info { 
    param($Message)
    Write-Host "[INFO] " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Success { 
    param($Message)
    Write-Host "[OK] " -ForegroundColor Green -NoNewline
    Write-Host $Message -ForegroundColor Green
}

function Write-Warn { 
    param($Message)
    Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Err { 
    param($Message)
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $Message -ForegroundColor Red
}

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-Git {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $version = (git --version) -replace "git version ", ""
        Write-Success "Git is already installed (version $version)"
        return
    }

    Write-Info "Installing Git..."

    # Try winget first
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        try {
            winget install Git.Git --accept-source-agreements --accept-package-agreements --silent
            $env:PATH = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            $env:PATH += ";C:\Program Files\Git\cmd;C:\Program Files\Git\bin"
            Write-Success "Git installed via winget"
            return
        } catch {
            Write-Warn "winget installation failed, trying alternative..."
        }
    }

    # Try Chocolatey
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        choco install git -y --no-progress
        $env:PATH = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Success "Git installed via Chocolatey"
        return
    }

    # Direct download as last resort
    Write-Info "Downloading Git installer..."
    $gitInstaller = "$env:TEMP\git-installer.exe"
    $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe"
    
    Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller -UseBasicParsing
    
    Write-Info "Running Git installer..."
    Start-Process -FilePath $gitInstaller -ArgumentList "/VERYSILENT", "/NORESTART" -Wait
    
    $env:PATH += ";C:\Program Files\Git\cmd;C:\Program Files\Git\bin"
    Remove-Item $gitInstaller -Force -ErrorAction SilentlyContinue
    
    Write-Success "Git installed"
}

function Install-NebulaCommand {
    Write-Info "Setting up Nebula Command at $NebulaHome..."

    if (Test-Path "$NebulaHome\.git") {
        Write-Info "Existing installation found, updating..."
        Set-Location $NebulaHome
        git fetch origin
        git checkout $Version 2>$null
        git reset --hard "origin/$Version" 2>$null
        if ($LASTEXITCODE -ne 0) {
            git reset --hard $Version
        }
        Write-Success "Repository updated to $Version"
    } else {
        Write-Info "Cloning repository..."
        
        if (Test-Path $NebulaHome) {
            Write-Warn "Directory exists but is not a git repo. Backing up..."
            $backupPath = "${NebulaHome}_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
            Move-Item $NebulaHome $backupPath
        }

        $parentDir = Split-Path -Parent $NebulaHome
        if (-not (Test-Path $parentDir)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }

        try {
            git clone --branch $Version --depth 1 $RepoUrl $NebulaHome
        } catch {
            Write-Warn "Branch $Version not found, trying main..."
            git clone --depth 1 $RepoUrl $NebulaHome
        }

        Write-Success "Repository cloned successfully"
    }
}

function Invoke-Bootstrap {
    $bootstrapScript = Join-Path $NebulaHome "deploy\unified\bootstrap.ps1"

    if (-not (Test-Path $bootstrapScript)) {
        Write-Err "Bootstrap script not found at $bootstrapScript"
        exit 1
    }

    Write-Info "Running bootstrap script..."
    Write-Host ""
    
    & $bootstrapScript
}

function Show-NextSteps {
    Write-Host ""
    Write-Success "Nebula Command installation complete!"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Check the deployment status: $NebulaHome\deploy\unified\status.ps1"
    Write-Host "  2. View logs: Get-Content $env:ProgramData\NebulaCommand\logs\*.log -Tail 50"
    Write-Host "  3. Update anytime: $NebulaHome\deploy\update.ps1"
    Write-Host ""
}

# Main execution
Write-Banner

if (-not (Test-Administrator)) {
    Write-Warn "Running without administrator privileges. Some features may not work."
    Write-Info "For full functionality, run PowerShell as Administrator."
    Write-Host ""
}

Write-Info "Version: $Version"
Write-Info "Install path: $NebulaHome"
Write-Host ""

Install-Git
Install-NebulaCommand

if (-not $SkipBootstrap) {
    Invoke-Bootstrap
}

Show-NextSteps
