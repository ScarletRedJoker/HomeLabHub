#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Nebula Command - Unified Windows AI Node Manager
    Handles installation, updates, repairs, and model management for all AI services

.DESCRIPTION
    A single entry point for managing the Nebula Command Windows AI node.
    Automatically handles dependency conflicts, version pinning, and service orchestration.

.PARAMETER Command
    The command to execute:
    - install  : Fresh installation of all AI services
    - update   : Update all services to latest compatible versions
    - repair   : Fix dependency issues and reinstall broken packages
    - status   : Check health of all services
    - models   : Download missing models (AnimateDiff, etc.)
    - start    : Start all AI services
    - stop     : Stop all AI services
    - restart  : Restart all AI services

.PARAMETER Service
    Target specific service(s): ollama, sd, comfyui, whisper, all (default: all)

.PARAMETER Force
    Skip confirmation prompts

.PARAMETER Verbose
    Show detailed output

.EXAMPLE
    .\nebula-ai.ps1 install
    
.EXAMPLE
    .\nebula-ai.ps1 repair -Force

.EXAMPLE
    .\nebula-ai.ps1 models -Service comfyui

.EXAMPLE
    .\nebula-ai.ps1 status
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("install", "update", "repair", "status", "models", "start", "stop", "restart", "help")]
    [string]$Command = "help",
    
    [Parameter(Position = 1)]
    [ValidateSet("ollama", "sd", "comfyui", "whisper", "all")]
    [string]$Service = "all",
    
    [switch]$Force,
    [switch]$SkipOllama,
    [switch]$SkipStableDiffusion,
    [switch]$SkipComfyUI,
    [switch]$SkipWhisper,
    [switch]$Unattended,
    [string]$DashboardWebhook
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Script:Version = "1.0.0"
$Script:RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script:ScriptsDir = Join-Path $Script:RootDir "scripts"
$Script:DepsFile = Join-Path $Script:RootDir "ai-dependencies.json"

$Script:Paths = @{
    RootDir = "C:\ProgramData\NebulaCommand"
    LogDir = "C:\ProgramData\NebulaCommand\logs"
    LogFile = "C:\ProgramData\NebulaCommand\logs\nebula-ai.log"
    StateFile = "C:\ProgramData\NebulaCommand\ai-state.json"
    AIRoot = "C:\AI"
    ComfyUI = "C:\AI\ComfyUI"
    StableDiffusion = "C:\AI\stable-diffusion-webui"
    ModelsDir = "C:\AI\models"
}

$Script:Services = @{
    ollama = @{
        Name = "Ollama"
        Port = 11434
        HealthEndpoint = "http://localhost:11434/api/version"
    }
    sd = @{
        Name = "Stable Diffusion WebUI"
        Port = 7860
        HealthEndpoint = "http://localhost:7860/sdapi/v1/sd-models"
        Path = "C:\AI\stable-diffusion-webui"
    }
    comfyui = @{
        Name = "ComfyUI"
        Port = 8188
        HealthEndpoint = "http://localhost:8188/system_stats"
        Path = "C:\AI\ComfyUI"
    }
    whisper = @{
        Name = "Whisper"
        Port = 8765
        HealthEndpoint = "http://localhost:8765/health"
    }
}

function Initialize-Environment {
    foreach ($path in @($Script:Paths.RootDir, $Script:Paths.LogDir, $Script:Paths.AIRoot, $Script:Paths.ModelsDir)) {
        if (-not (Test-Path $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }
    
    if (-not (Test-Path $Script:Paths.LogFile)) {
        "" | Set-Content -Path $Script:Paths.LogFile -Force
    }
}

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "OK", "WARN", "ERROR", "DEBUG", "PHASE")]
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "OK"    { "Green" }
        "PHASE" { "Cyan" }
        "DEBUG" { "DarkGray" }
        default { "White" }
    }
    
    if ($Level -eq "PHASE") {
        Write-Host ""
        Write-Host ("=" * 70) -ForegroundColor Cyan
        Write-Host " $Message" -ForegroundColor Cyan
        Write-Host ("=" * 70) -ForegroundColor Cyan
    } else {
        Write-Host $logLine -ForegroundColor $color
    }
    
    Add-Content -Path $Script:Paths.LogFile -Value $logLine -ErrorAction SilentlyContinue
}

function Show-Banner {
    Write-Host @"

 _   _      _           _           _    ___ 
| \ | | ___| |__  _   _| | __ _    / \  |_ _|
|  \| |/ _ \ '_ \| | | | |/ _` |  / _ \  | | 
| |\  |  __/ |_) | |_| | | (_| | / ___ \ | | 
|_| \_|\___|_.__/ \__,_|_|\__,_|/_/   \_\___|
                                             
    Unified Windows AI Node Manager v$($Script:Version)

"@ -ForegroundColor Cyan
}

function Get-Dependencies {
    if (-not (Test-Path $Script:DepsFile)) {
        Write-Log "Dependencies manifest not found at: $($Script:DepsFile)" "ERROR"
        return $null
    }
    
    return Get-Content $Script:DepsFile -Raw | ConvertFrom-Json
}

function Test-PythonEnvironment {
    param([string]$PythonPath = "python")
    
    try {
        $version = & $PythonPath --version 2>&1
        if ($version -match "Python (\d+)\.(\d+)\.(\d+)") {
            return @{
                Available = $true
                Version = $version
                Major = [int]$Matches[1]
                Minor = [int]$Matches[2]
            }
        }
    } catch {
        return @{ Available = $false; Error = $_.Exception.Message }
    }
    
    return @{ Available = $false; Error = "Python not found" }
}

function Get-InstalledPackageVersion {
    param(
        [string]$PackageName,
        [string]$PythonPath = "python"
    )
    
    try {
        $result = & $PythonPath -c "import $($PackageName.Replace('-', '_')); print($($PackageName.Replace('-', '_')).__version__)" 2>&1
        if ($LASTEXITCODE -eq 0) {
            return $result.Trim()
        }
    } catch {}
    
    try {
        $pipOutput = & $PythonPath -m pip show $PackageName 2>&1
        if ($pipOutput -match "Version:\s*(.+)") {
            return $Matches[1].Trim()
        }
    } catch {}
    
    return $null
}

function Test-ServiceHealth {
    param([string]$ServiceKey)
    
    $svc = $Script:Services[$ServiceKey]
    if (-not $svc) { return @{ Online = $false; Error = "Unknown service" } }
    
    try {
        $response = Invoke-WebRequest -Uri $svc.HealthEndpoint -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return @{
            Online = $true
            StatusCode = $response.StatusCode
            Service = $svc.Name
        }
    } catch {
        return @{
            Online = $false
            Error = $_.Exception.Message
            Service = $svc.Name
        }
    }
}

function Invoke-Repair {
    Write-Log "Starting dependency repair..." "PHASE"
    
    $deps = Get-Dependencies
    if (-not $deps) {
        Write-Log "Cannot proceed without dependencies manifest" "ERROR"
        return $false
    }
    
    $repairActions = @()
    
    Write-Log "Checking NumPy version..." "INFO"
    $numpyVersion = Get-InstalledPackageVersion -PackageName "numpy"
    if ($numpyVersion) {
        Write-Log "Installed NumPy: $numpyVersion" "INFO"
        if ($numpyVersion -match "^2\.") {
            Write-Log "NumPy 2.x detected - this breaks PyTorch compatibility!" "WARN"
            $repairActions += @{
                Package = "numpy"
                Action = "downgrade"
                CurrentVersion = $numpyVersion
                TargetVersion = $deps.core.packages.numpy.version
                Reason = $deps.core.packages.numpy.reason
            }
        }
    }
    
    Write-Log "Checking protobuf version..." "INFO"
    $protobufVersion = Get-InstalledPackageVersion -PackageName "protobuf"
    if ($protobufVersion) {
        Write-Log "Installed protobuf: $protobufVersion" "INFO"
        $needsRepair = $false
        
        if ($protobufVersion -match "^(\d+)\.") {
            $majorVersion = [int]$Matches[1]
            if ($majorVersion -lt 4 -or $majorVersion -ge 6) {
                $needsRepair = $true
            }
        }
        
        if ($needsRepair) {
            Write-Log "protobuf version incompatible - needs update to 5.x" "WARN"
            $repairActions += @{
                Package = "protobuf"
                Action = "install"
                CurrentVersion = $protobufVersion
                TargetVersion = $deps.core.packages.protobuf.version
                Reason = $deps.core.packages.protobuf.reason
            }
        }
    }
    
    Write-Log "Checking PyTorch installation..." "INFO"
    $torchVersion = Get-InstalledPackageVersion -PackageName "torch"
    if ($torchVersion) {
        Write-Log "Installed PyTorch: $torchVersion" "INFO"
        
        try {
            $cudaCheck = & python -c "import torch; print(torch.cuda.is_available())" 2>&1
            if ($cudaCheck -eq "True") {
                Write-Log "PyTorch CUDA: Available" "OK"
            } else {
                Write-Log "PyTorch CUDA: Not available - may need reinstall with CUDA" "WARN"
            }
        } catch {
            Write-Log "PyTorch import failed - may be broken" "ERROR"
            $repairActions += @{
                Package = "torch"
                Action = "reinstall"
                Reason = "PyTorch import failed"
            }
        }
    }
    
    if ($repairActions.Count -eq 0) {
        Write-Log "No dependency issues detected" "OK"
        return $true
    }
    
    Write-Log "Found $($repairActions.Count) issue(s) to repair" "WARN"
    
    foreach ($action in $repairActions) {
        Write-Log "Repairing $($action.Package)..." "INFO"
        Write-Log "  Current: $($action.CurrentVersion)" "INFO"
        Write-Log "  Target:  $($action.TargetVersion)" "INFO"
        Write-Log "  Reason:  $($action.Reason)" "INFO"
    }
    
    if (-not $Force -and -not $Unattended) {
        $confirm = Read-Host "Proceed with repairs? (Y/n)"
        if ($confirm -eq "n" -or $confirm -eq "N") {
            Write-Log "Repair cancelled by user" "WARN"
            return $false
        }
    }
    
    Write-Log "Clearing pip cache..." "INFO"
    & python -m pip cache purge 2>&1 | Out-Null
    
    foreach ($action in $repairActions) {
        Write-Log "Installing $($action.Package)==$($action.TargetVersion)..." "INFO"
        
        if ($action.Package -eq "torch") {
            $torchCmd = $deps.core.packages.torch.install_command
            Write-Log "Running: $torchCmd" "DEBUG"
            Invoke-Expression $torchCmd
        } else {
            & python -m pip install "$($action.Package)==$($action.TargetVersion)" --force-reinstall --no-deps
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Log "$($action.Package) repaired successfully" "OK"
        } else {
            Write-Log "Failed to repair $($action.Package)" "ERROR"
        }
    }
    
    Write-Log "Installing remaining dependencies in correct order..." "INFO"
    foreach ($phase in $deps.install_order.phases) {
        Write-Log "Phase: $($phase.name)" "INFO"
        
        if ($phase.command) {
            Write-Log "Running: $($phase.command)" "DEBUG"
            Invoke-Expression $phase.command
        } elseif ($phase.packages) {
            foreach ($pkg in $phase.packages) {
                & python -m pip install $pkg --upgrade 2>&1 | Out-Null
            }
        }
    }
    
    Write-Log "Dependency repair complete" "OK"
    return $true
}

function Invoke-Install {
    Write-Log "Starting fresh AI services installation..." "PHASE"
    
    $installerPath = Join-Path $Script:ScriptsDir "install-ai-node.ps1"
    
    if (-not (Test-Path $installerPath)) {
        Write-Log "Installer script not found: $installerPath" "ERROR"
        return $false
    }
    
    $args = @()
    if ($SkipOllama) { $args += "-SkipOllama" }
    if ($SkipStableDiffusion) { $args += "-SkipStableDiffusion" }
    if ($SkipComfyUI) { $args += "-SkipComfyUI" }
    if ($SkipWhisper) { $args += "-SkipWhisper" }
    if ($Unattended -or $Force) { $args += "-Unattended" }
    if ($DashboardWebhook) { $args += "-DashboardWebhook"; $args += "`"$DashboardWebhook`"" }
    
    Write-Log "Running installer with args: $($args -join ' ')" "INFO"
    
    & $installerPath @args
    
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Installation complete" "OK"
        
        Write-Log "Running post-install dependency check..." "INFO"
        Invoke-Repair
        
        return $true
    } else {
        Write-Log "Installation failed with exit code: $LASTEXITCODE" "ERROR"
        return $false
    }
}

function Invoke-Update {
    Write-Log "Updating AI services to latest compatible versions..." "PHASE"
    
    $deps = Get-Dependencies
    if (-not $deps) {
        Write-Log "Cannot proceed without dependencies manifest" "ERROR"
        return $false
    }
    
    Invoke-Repair
    
    if ($Service -eq "all" -or $Service -eq "ollama") {
        if (-not $SkipOllama) {
            Write-Log "Updating Ollama..." "INFO"
            $ollamaPath = (Get-Command ollama -ErrorAction SilentlyContinue).Source
            if ($ollamaPath) {
                Write-Log "Downloading latest Ollama..." "INFO"
                $ollamaInstaller = "$env:TEMP\OllamaSetup.exe"
                Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $ollamaInstaller
                Start-Process -FilePath $ollamaInstaller -ArgumentList "/S" -Wait
                Write-Log "Ollama updated" "OK"
            } else {
                Write-Log "Ollama not installed, skipping update" "WARN"
            }
        }
    }
    
    if ($Service -eq "all" -or $Service -eq "sd") {
        if (-not $SkipStableDiffusion) {
            Write-Log "Updating Stable Diffusion WebUI..." "INFO"
            $sdPath = $Script:Paths.StableDiffusion
            if (Test-Path $sdPath) {
                Push-Location $sdPath
                & git pull origin master 2>&1 | Out-Null
                Pop-Location
                Write-Log "Stable Diffusion WebUI updated" "OK"
            } else {
                Write-Log "Stable Diffusion not installed, skipping update" "WARN"
            }
        }
    }
    
    if ($Service -eq "all" -or $Service -eq "comfyui") {
        if (-not $SkipComfyUI) {
            Write-Log "Updating ComfyUI..." "INFO"
            $comfyPath = $Script:Paths.ComfyUI
            if (Test-Path $comfyPath) {
                Push-Location $comfyPath
                & git pull origin master 2>&1 | Out-Null
                Pop-Location
                
                Write-Log "Updating ComfyUI custom nodes..." "INFO"
                $customNodesPath = Join-Path $comfyPath "custom_nodes"
                if (Test-Path $customNodesPath) {
                    Get-ChildItem -Path $customNodesPath -Directory | ForEach-Object {
                        if (Test-Path (Join-Path $_.FullName ".git")) {
                            Push-Location $_.FullName
                            & git pull 2>&1 | Out-Null
                            Pop-Location
                        }
                    }
                }
                
                Write-Log "ComfyUI updated" "OK"
            } else {
                Write-Log "ComfyUI not installed, skipping update" "WARN"
            }
        }
    }
    
    Write-Log "Update complete" "OK"
    return $true
}

function Invoke-Status {
    Write-Log "Checking AI services status..." "PHASE"
    
    $status = @{
        timestamp = (Get-Date -Format "o")
        hostname = $env:COMPUTERNAME
        services = @{}
        python = $null
        gpu = $null
    }
    
    $pyEnv = Test-PythonEnvironment
    $status.python = $pyEnv
    if ($pyEnv.Available) {
        Write-Log "Python: $($pyEnv.Version)" "OK"
    } else {
        Write-Log "Python: Not available" "ERROR"
    }
    
    try {
        $nvidiaSmi = & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>$null
        if ($nvidiaSmi) {
            $parts = $nvidiaSmi -split ","
            $status.gpu = @{
                Available = $true
                Name = $parts[0].Trim()
                VRAM_MB = [int]$parts[1].Trim()
                Driver = $parts[2].Trim()
            }
            Write-Log "GPU: $($status.gpu.Name) ($($status.gpu.VRAM_MB)MB VRAM)" "OK"
        }
    } catch {
        $status.gpu = @{ Available = $false }
        Write-Log "GPU: NVIDIA GPU not detected" "WARN"
    }
    
    Write-Host ""
    Write-Host "Service Status:" -ForegroundColor Cyan
    Write-Host ("-" * 50) -ForegroundColor Gray
    
    $services = if ($Service -eq "all") { $Script:Services.Keys } else { @($Service) }
    
    foreach ($svcKey in $services) {
        $health = Test-ServiceHealth -ServiceKey $svcKey
        $status.services[$svcKey] = $health
        
        $svc = $Script:Services[$svcKey]
        $statusIcon = if ($health.Online) { "[OK]" } else { "[--]" }
        $statusColor = if ($health.Online) { "Green" } else { "Red" }
        
        Write-Host ("{0,-8} {1,-25} Port: {2,-6} {3}" -f $statusIcon, $svc.Name, $svc.Port, $(if ($health.Online) { "Running" } else { "Stopped" })) -ForegroundColor $statusColor
    }
    
    Write-Host ""
    
    if ($pyEnv.Available) {
        Write-Host "Key Package Versions:" -ForegroundColor Cyan
        Write-Host ("-" * 50) -ForegroundColor Gray
        
        $packages = @("numpy", "torch", "protobuf", "transformers", "diffusers")
        foreach ($pkg in $packages) {
            $version = Get-InstalledPackageVersion -PackageName $pkg
            if ($version) {
                $deps = Get-Dependencies
                $expected = $null
                
                switch ($pkg) {
                    "numpy" { $expected = $deps.core.packages.numpy.version }
                    "torch" { $expected = $deps.core.packages.torch.version }
                    "protobuf" { $expected = $deps.core.packages.protobuf.version }
                    "transformers" { $expected = $deps.transformers_stack.packages.transformers.version }
                    "diffusers" { $expected = $deps.diffusion.packages.diffusers.version }
                }
                
                $match = if ($expected -and $version -eq $expected) { "OK" } else { "!!" }
                $color = if ($match -eq "OK") { "Green" } else { "Yellow" }
                
                Write-Host ("{0,-15} {1,-15} (expected: {2})" -f $pkg, $version, $(if ($expected) { $expected } else { "any" })) -ForegroundColor $color
            } else {
                Write-Host ("{0,-15} Not installed" -f $pkg) -ForegroundColor Red
            }
        }
    }
    
    $status | ConvertTo-Json -Depth 5 | Set-Content -Path $Script:Paths.StateFile
    Write-Log "Status saved to: $($Script:Paths.StateFile)" "DEBUG"
    
    return $status
}

function Invoke-Models {
    Write-Log "Managing AI models..." "PHASE"
    
    $deps = Get-Dependencies
    if (-not $deps) {
        Write-Log "Cannot proceed without dependencies manifest" "ERROR"
        return $false
    }
    
    if ($Service -eq "all" -or $Service -eq "comfyui") {
        Write-Log "Checking AnimateDiff motion models..." "INFO"
        
        $comfyPath = $Script:Paths.ComfyUI
        if (-not (Test-Path $comfyPath)) {
            Write-Log "ComfyUI not installed at: $comfyPath" "WARN"
        } else {
            $animateDiffPath = Join-Path $comfyPath "custom_nodes\ComfyUI-AnimateDiff-Evolved"
            
            if (-not (Test-Path $animateDiffPath)) {
                Write-Log "Installing ComfyUI-AnimateDiff-Evolved..." "INFO"
                $customNodesPath = Join-Path $comfyPath "custom_nodes"
                Push-Location $customNodesPath
                & git clone $deps.comfyui_nodes.nodes.'ComfyUI-AnimateDiff-Evolved'.repo
                Pop-Location
            }
            
            $modelsPath = Join-Path $animateDiffPath "models"
            if (-not (Test-Path $modelsPath)) {
                New-Item -ItemType Directory -Path $modelsPath -Force | Out-Null
            }
            
            foreach ($modelKey in $deps.animatediff_models.models.PSObject.Properties.Name) {
                $model = $deps.animatediff_models.models.$modelKey
                $modelFile = Join-Path $modelsPath "$modelKey.ckpt"
                
                if (Test-Path $modelFile) {
                    Write-Log "$($model.name): Already downloaded" "OK"
                } else {
                    if ($model.required -or $Force) {
                        Write-Log "Downloading $($model.name) (~$($model.size_mb)MB)..." "INFO"
                        
                        try {
                            $ProgressPreference = 'SilentlyContinue'
                            Invoke-WebRequest -Uri $model.url -OutFile $modelFile -UseBasicParsing
                            Write-Log "$($model.name): Downloaded successfully" "OK"
                        } catch {
                            Write-Log "Failed to download $($model.name): $_" "ERROR"
                        }
                    } else {
                        Write-Log "$($model.name): Not downloaded (optional, use -Force to download)" "INFO"
                    }
                }
            }
            
            $videoHelperPath = Join-Path $comfyPath "custom_nodes\ComfyUI-VideoHelperSuite"
            if (-not (Test-Path $videoHelperPath)) {
                Write-Log "Installing ComfyUI-VideoHelperSuite..." "INFO"
                $customNodesPath = Join-Path $comfyPath "custom_nodes"
                Push-Location $customNodesPath
                & git clone $deps.comfyui_nodes.nodes.'ComfyUI-VideoHelperSuite'.repo
                Pop-Location
            }
            
            $managerPath = Join-Path $comfyPath "custom_nodes\ComfyUI-Manager"
            if (-not (Test-Path $managerPath)) {
                Write-Log "Installing ComfyUI-Manager..." "INFO"
                $customNodesPath = Join-Path $comfyPath "custom_nodes"
                Push-Location $customNodesPath
                & git clone $deps.comfyui_nodes.nodes.'ComfyUI-Manager'.repo
                Pop-Location
            }
        }
    }
    
    if ($Service -eq "all" -or $Service -eq "ollama") {
        Write-Log "Checking Ollama models..." "INFO"
        
        $ollama = Get-Command ollama -ErrorAction SilentlyContinue
        if ($ollama) {
            $models = @("qwen2.5-coder:7b", "nomic-embed-text")
            foreach ($model in $models) {
                Write-Log "Ensuring model: $model" "INFO"
                & ollama pull $model 2>&1 | Out-Null
            }
            Write-Log "Ollama models verified" "OK"
        } else {
            Write-Log "Ollama not installed" "WARN"
        }
    }
    
    Write-Log "Model management complete" "OK"
    return $true
}

function Invoke-ServiceAction {
    param([ValidateSet("start", "stop", "restart")][string]$Action)
    
    $supervisorPath = Join-Path $Script:ScriptsDir "windows-ai-supervisor.ps1"
    
    if (-not (Test-Path $supervisorPath)) {
        Write-Log "Supervisor script not found: $supervisorPath" "ERROR"
        return $false
    }
    
    & $supervisorPath -Action $Action
    return ($LASTEXITCODE -eq 0)
}

function Show-Help {
    Show-Banner
    
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  .\nebula-ai.ps1 <command> [options]" -ForegroundColor White
    Write-Host ""
    Write-Host "COMMANDS:" -ForegroundColor Yellow
    Write-Host "  install   Fresh installation of all AI services" -ForegroundColor White
    Write-Host "  update    Update all services to latest compatible versions" -ForegroundColor White
    Write-Host "  repair    Fix dependency conflicts (NumPy, protobuf, etc.)" -ForegroundColor White
    Write-Host "  status    Check health of all services" -ForegroundColor White
    Write-Host "  models    Download missing models (AnimateDiff, etc.)" -ForegroundColor White
    Write-Host "  start     Start all AI services" -ForegroundColor White
    Write-Host "  stop      Stop all AI services" -ForegroundColor White
    Write-Host "  restart   Restart all AI services" -ForegroundColor White
    Write-Host "  help      Show this help message" -ForegroundColor White
    Write-Host ""
    Write-Host "OPTIONS:" -ForegroundColor Yellow
    Write-Host "  -Service <name>    Target specific service: ollama, sd, comfyui, whisper, all" -ForegroundColor White
    Write-Host "  -Force             Skip confirmation prompts" -ForegroundColor White
    Write-Host "  -SkipOllama        Skip Ollama during install/update" -ForegroundColor White
    Write-Host "  -SkipStableDiffusion  Skip Stable Diffusion during install/update" -ForegroundColor White
    Write-Host "  -SkipComfyUI       Skip ComfyUI during install/update" -ForegroundColor White
    Write-Host "  -Unattended        Run without any prompts" -ForegroundColor White
    Write-Host ""
    Write-Host "EXAMPLES:" -ForegroundColor Yellow
    Write-Host "  .\nebula-ai.ps1 install                    # Full installation" -ForegroundColor Gray
    Write-Host "  .\nebula-ai.ps1 repair -Force              # Auto-fix dependencies" -ForegroundColor Gray
    Write-Host "  .\nebula-ai.ps1 models -Service comfyui    # Download ComfyUI models" -ForegroundColor Gray
    Write-Host "  .\nebula-ai.ps1 status                     # Check all services" -ForegroundColor Gray
    Write-Host ""
    Write-Host "DEPENDENCY CONFLICTS HANDLED:" -ForegroundColor Yellow
    Write-Host "  - NumPy 2.x -> 1.26.4 (PyTorch ABI compatibility)" -ForegroundColor Gray
    Write-Host "  - protobuf <4 or >=6 -> 5.28.3 (TensorFlow/transformers)" -ForegroundColor Gray
    Write-Host "  - open-clip-torch protobuf constraint removal" -ForegroundColor Gray
    Write-Host ""
}

Initialize-Environment

switch ($Command) {
    "install" {
        Show-Banner
        Invoke-Install
    }
    "update" {
        Show-Banner
        Invoke-Update
    }
    "repair" {
        Show-Banner
        Invoke-Repair
    }
    "status" {
        Show-Banner
        Invoke-Status
    }
    "models" {
        Show-Banner
        Invoke-Models
    }
    "start" {
        Show-Banner
        Invoke-ServiceAction -Action "start"
    }
    "stop" {
        Show-Banner
        Invoke-ServiceAction -Action "stop"
    }
    "restart" {
        Show-Banner
        Invoke-ServiceAction -Action "restart"
    }
    "help" {
        Show-Help
    }
    default {
        Show-Help
    }
}
