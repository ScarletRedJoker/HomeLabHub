#Requires -Version 5.1
<#
.SYNOPSIS
    Nebula Command - Windows Uninstaller

.DESCRIPTION
    Removes Nebula Command and optionally all associated data

.PARAMETER NebulaHome
    Installation directory (default: C:\NebulaCommand)

.PARAMETER Yes
    Skip confirmation prompts

.PARAMETER KeepData
    Keep configuration and data files

.PARAMETER KeepServices
    Keep installed services (Ollama, etc.)

.EXAMPLE
    .\uninstall.ps1
    .\uninstall.ps1 -Yes
    .\uninstall.ps1 -KeepData -KeepServices
#>

param(
    [string]$NebulaHome = "C:\NebulaCommand",
    [switch]$Yes,
    [switch]$KeepData,
    [switch]$KeepServices
)

$ErrorActionPreference = "Stop"

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

function Confirm-Uninstall {
    if ($Yes) { return $true }

    Write-Host ""
    Write-Host "WARNING: This will uninstall Nebula Command" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The following will be removed:"
    Write-Host "  - Installation directory: $NebulaHome"
    Write-Host "  - Scheduled tasks: NebulaCommand*"
    Write-Host "  - Windows services: Nebula*"
    
    if (-not $KeepData) {
        Write-Host "  - Configuration and state data"
        Write-Host "  - Logs at $env:ProgramData\NebulaCommand"
    }
    
    if (-not $KeepServices) {
        Write-Host "  - Ollama (if installed by Nebula)"
        Write-Host "  - ComfyUI (if installed by Nebula)"
    }
    
    Write-Host ""
    $response = Read-Host "Are you sure you want to continue? [y/N]"
    
    return $response -match "^[Yy]"
}

function Stop-NebulaServices {
    Write-Info "Stopping Nebula Command services..."

    # Stop scheduled tasks
    $tasks = Get-ScheduledTask -TaskName "NebulaCommand*" -ErrorAction SilentlyContinue
    foreach ($task in $tasks) {
        Write-Info "Stopping task: $($task.TaskName)"
        Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }

    # Stop Windows services
    $services = Get-Service -Name "Nebula*" -ErrorAction SilentlyContinue
    foreach ($service in $services) {
        Write-Info "Stopping service: $($service.Name)"
        Stop-Service -Name $service.Name -Force -ErrorAction SilentlyContinue
        sc.exe delete $service.Name 2>$null
    }

    Write-Success "Services stopped"
}

function Remove-Installation {
    if (-not (Test-Path $NebulaHome)) {
        Write-Warn "Installation directory not found: $NebulaHome"
        return
    }

    if ($KeepData) {
        Write-Info "Backing up data before removal..."
        $backupDir = "$env:TEMP\nebula-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

        $configPath = Join-Path $NebulaHome "config"
        $statePath = Join-Path $NebulaHome "state"
        $backupsPath = Join-Path $NebulaHome "backups"

        if (Test-Path $configPath) { Copy-Item -Path $configPath -Destination $backupDir -Recurse -Force }
        if (Test-Path $statePath) { Copy-Item -Path $statePath -Destination $backupDir -Recurse -Force }
        if (Test-Path $backupsPath) { Copy-Item -Path $backupsPath -Destination $backupDir -Recurse -Force }

        Write-Success "Data backed up to $backupDir"
    }

    Write-Info "Removing installation directory..."
    Remove-Item -Path $NebulaHome -Recurse -Force -ErrorAction SilentlyContinue

    Write-Success "Installation directory removed"
}

function Remove-ProgramData {
    if ($KeepData) {
        Write-Info "Keeping program data as requested"
        return
    }

    $programDataPath = "$env:ProgramData\NebulaCommand"
    if (Test-Path $programDataPath) {
        Write-Info "Removing program data..."
        Remove-Item -Path $programDataPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "Program data removed"
    }
}

function Remove-OptionalServices {
    if ($KeepServices) {
        Write-Info "Keeping optional services as requested"
        return
    }

    # Ollama
    $ollamaPath = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollamaPath) {
        $response = Read-Host "Remove Ollama? [y/N]"
        if ($response -match "^[Yy]") {
            Write-Info "Removing Ollama..."
            
            # Stop Ollama service
            Stop-Process -Name "ollama*" -Force -ErrorAction SilentlyContinue
            
            # Try to uninstall via winget
            $winget = Get-Command winget -ErrorAction SilentlyContinue
            if ($winget) {
                winget uninstall Ollama.Ollama --silent 2>$null
            }
            
            # Remove Ollama data
            $ollamaHome = "$env:USERPROFILE\.ollama"
            if (Test-Path $ollamaHome) {
                Remove-Item -Path $ollamaHome -Recurse -Force -ErrorAction SilentlyContinue
            }
            
            Write-Success "Ollama removed"
        }
    }

    # ComfyUI
    $comfyPaths = @("C:\ComfyUI", "$env:USERPROFILE\ComfyUI", "C:\AI\ComfyUI")
    foreach ($path in $comfyPaths) {
        if (Test-Path $path) {
            $response = Read-Host "Remove ComfyUI at $path? [y/N]"
            if ($response -match "^[Yy]") {
                Write-Info "Removing ComfyUI..."
                Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
                Write-Success "ComfyUI removed"
            }
            break
        }
    }

    # Stable Diffusion
    $sdPaths = @("C:\stable-diffusion-webui", "$env:USERPROFILE\stable-diffusion-webui", "C:\AI\stable-diffusion-webui")
    foreach ($path in $sdPaths) {
        if (Test-Path $path) {
            $response = Read-Host "Remove Stable Diffusion WebUI at $path? [y/N]"
            if ($response -match "^[Yy]") {
                Write-Info "Removing Stable Diffusion WebUI..."
                Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
                Write-Success "Stable Diffusion WebUI removed"
            }
            break
        }
    }
}

function Remove-EnvironmentVariables {
    Write-Info "Cleaning up environment variables..."

    $envVars = @("NEBULA_HOME", "NEBULA_CONFIG", "NEBULA_NODE_ID")
    foreach ($var in $envVars) {
        [System.Environment]::SetEnvironmentVariable($var, $null, "User")
        [System.Environment]::SetEnvironmentVariable($var, $null, "Machine")
    }

    Write-Success "Environment variables cleaned up"
}

function Remove-StartMenuShortcuts {
    Write-Info "Removing Start Menu shortcuts..."

    $shortcutPaths = @(
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Nebula Command",
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Nebula Command"
    )

    foreach ($path in $shortcutPaths) {
        if (Test-Path $path) {
            Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Success "Start Menu shortcuts removed"
}

# Main execution
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "║               Nebula Command - Uninstaller                    ║" -ForegroundColor Red
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Red
Write-Host ""

if (-not (Confirm-Uninstall)) {
    Write-Info "Uninstallation cancelled"
    exit 0
}

Write-Host ""
Write-Info "Starting uninstallation..."
Write-Host ""

Stop-NebulaServices
Remove-Installation
Remove-ProgramData
Remove-OptionalServices
Remove-EnvironmentVariables
Remove-StartMenuShortcuts

Write-Host ""
Write-Success "Nebula Command has been uninstalled"
Write-Host ""
Write-Host "Thank you for using Nebula Command!" -ForegroundColor Cyan
Write-Host ""
