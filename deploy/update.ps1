#Requires -Version 5.1
<#
.SYNOPSIS
    Nebula Command - Windows Updater

.DESCRIPTION
    Updates Nebula Command to the latest version

.PARAMETER NebulaHome
    Installation directory (default: C:\NebulaCommand)

.PARAMETER Version
    Target version/branch/tag (default: main)

.PARAMETER SkipDeps
    Skip dependency updates during bootstrap

.PARAMETER Force
    Force update even if already up-to-date

.EXAMPLE
    .\update.ps1
    .\update.ps1 -Version "v2.0.0"
    .\update.ps1 -SkipDeps -Force
#>

param(
    [string]$NebulaHome = "C:\NebulaCommand",
    [string]$Version = "main",
    [switch]$SkipDeps,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

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

function Test-Installation {
    if (-not (Test-Path $NebulaHome)) {
        Write-Err "Nebula Command not found at $NebulaHome"
        Write-Info "Run the installer first: irm https://raw.githubusercontent.com/ScarletRedJoker/Nebula-Command/main/deploy/install.ps1 | iex"
        exit 1
    }

    if (-not (Test-Path "$NebulaHome\.git")) {
        Write-Err "$NebulaHome is not a git repository"
        Write-Info "Please reinstall Nebula Command"
        exit 1
    }
}

function Backup-Configuration {
    $backupDir = Join-Path $NebulaHome "backups\pre-update-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    
    Write-Info "Backing up configuration..."
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

    $configPath = Join-Path $NebulaHome "config"
    $statePath = Join-Path $NebulaHome "state"

    if (Test-Path $configPath) {
        Copy-Item -Path $configPath -Destination $backupDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $statePath) {
        Copy-Item -Path $statePath -Destination $backupDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Success "Backup created at $backupDir"
}

function Update-Repository {
    Write-Info "Updating repository..."
    Set-Location $NebulaHome

    $currentCommit = git rev-parse HEAD 2>$null
    if (-not $currentCommit) { $currentCommit = "unknown" }

    git fetch origin

    if (-not $Force) {
        $remoteCommit = git rev-parse "origin/$Version" 2>$null
        if (-not $remoteCommit) {
            $remoteCommit = git rev-parse $Version 2>$null
        }

        if ($currentCommit -eq $remoteCommit) {
            Write-Success "Already up-to-date (commit: $($currentCommit.Substring(0, 8)))"
            exit 0
        }
    }

    git checkout $Version 2>$null
    $resetResult = git reset --hard "origin/$Version" 2>$null
    if ($LASTEXITCODE -ne 0) {
        git reset --hard $Version
    }

    $newCommit = git rev-parse HEAD 2>$null
    if (-not $newCommit) { $newCommit = "unknown" }

    Write-Success "Updated from $($currentCommit.Substring(0, 8)) to $($newCommit.Substring(0, 8))"
}

function Invoke-Bootstrap {
    $bootstrapScript = Join-Path $NebulaHome "deploy\unified\bootstrap.ps1"

    if (-not (Test-Path $bootstrapScript)) {
        Write-Warn "Bootstrap script not found, skipping post-update setup"
        return
    }

    Write-Info "Running bootstrap script..."
    
    $bootstrapArgs = @{}
    if ($SkipDeps) {
        $bootstrapArgs["SkipDeps"] = $true
    }

    & $bootstrapScript @bootstrapArgs
}

# Main execution
Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "               Nebula Command - Updater                               " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Info "Target version: $Version"
Write-Info "Install path: $NebulaHome"
Write-Host ""

Test-Installation
Backup-Configuration
Update-Repository
Invoke-Bootstrap

Write-Host ""
Write-Success "Nebula Command update complete!"
Write-Host ""
