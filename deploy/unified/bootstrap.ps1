#Requires -Version 5.1
<#
.SYNOPSIS
    Nebula Command - Comprehensive Windows Deployment Bootstrap
    One-command deployment that auto-detects hardware and configures all AI services.

.DESCRIPTION
    This script performs complete setup of a Nebula Command AI node on Windows:
    - Hardware detection (GPU, VRAM, CUDA, CPU, RAM)
    - Dependency installation (Git, Python, Node.js, Ollama)
    - Service configuration and installation
    - Task Scheduler job creation for auto-start
    - Watchdog service for monitoring
    - Health checks and validation

.PARAMETER Force
    Force reinstallation of all components

.PARAMETER SkipServices
    Skip service installation and configuration

.PARAMETER NodeId
    Custom node identifier (auto-generated if not provided)

.PARAMETER ConfigPath
    Path to configuration directory (default: config)

.PARAMETER DashboardUrl
    Dashboard URL for node registration

.PARAMETER NoOllama
    Skip Ollama installation

.PARAMETER NoComfyUI
    Skip ComfyUI installation

.PARAMETER NoStableDiffusion
    Skip Stable Diffusion installation

.PARAMETER DryRun
    Show what would be done without making changes

.PARAMETER Help
    Show this help message

.EXAMPLE
    .\bootstrap.ps1
    .\bootstrap.ps1 -Force
    .\bootstrap.ps1 -DashboardUrl "http://192.168.1.100:5000"
    .\bootstrap.ps1 -SkipServices -DryRun
#>

param(
    [switch]$Force,
    [switch]$SkipServices,
    [string]$NodeId = "",
    [string]$ConfigPath = "config",
    [string]$DashboardUrl = "",
    [switch]$NoOllama,
    [switch]$NoComfyUI,
    [switch]$NoStableDiffusion,
    [switch]$DryRun,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Script:ScriptVersion = "2.0.0"
$Script:ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script:LibDir = Join-Path $ScriptDir "lib"
$Script:StateDir = Join-Path $ScriptDir "state"
$Script:LogDir = Join-Path $env:ProgramData "NebulaCommand\logs"
$Script:LogFile = Join-Path $LogDir "bootstrap-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

#region Colored Output Functions
function Write-Info { 
    param($Message) 
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] " -ForegroundColor DarkGray -NoNewline
    Write-Host "[INFO] " -ForegroundColor Blue -NoNewline
    Write-Host $Message
    Write-Log "INFO" $Message
}

function Write-Success { 
    param($Message) 
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] " -ForegroundColor DarkGray -NoNewline
    Write-Host "[OK] " -ForegroundColor Green -NoNewline
    Write-Host $Message -ForegroundColor Green
    Write-Log "SUCCESS" $Message
}

function Write-Warn { 
    param($Message) 
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] " -ForegroundColor DarkGray -NoNewline
    Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message -ForegroundColor Yellow
    Write-Log "WARN" $Message
}

function Write-Err { 
    param($Message) 
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] " -ForegroundColor DarkGray -NoNewline
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $Message -ForegroundColor Red
    Write-Log "ERROR" $Message
}

function Write-Step {
    param($Message)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Log "STEP" $Message
}

function Write-Log {
    param($Level, $Message)
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp [$Level] $Message" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}
#endregion

#region Help Display
if ($Help) {
    Write-Host @"

╔═══════════════════════════════════════════════════════════════════════════════╗
║                    Nebula Command - Windows Node Bootstrap                     ║
║                              Version $Script:ScriptVersion                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

USAGE:
    .\bootstrap.ps1 [options]

OPTIONS:
    -Force              Force reinstallation of all components
    -SkipServices       Skip service installation and configuration
    -NodeId <string>    Custom node identifier (auto-generated if not provided)
    -ConfigPath <path>  Path to configuration directory (default: config)
    -DashboardUrl <url> Dashboard URL for node registration
    -NoOllama           Skip Ollama installation
    -NoComfyUI          Skip ComfyUI installation
    -NoStableDiffusion  Skip Stable Diffusion installation
    -DryRun             Show what would be done without making changes
    -Help               Show this help message

EXAMPLES:
    .\bootstrap.ps1
    .\bootstrap.ps1 -Force
    .\bootstrap.ps1 -DashboardUrl "http://192.168.1.100:5000"
    .\bootstrap.ps1 -SkipServices -DryRun
    .\bootstrap.ps1 -NodeId "gaming-pc-01" -ConfigPath "C:\nebula\config"

"@ -ForegroundColor Cyan
    exit 0
}
#endregion

#region Hardware Detection Functions
function Get-HardwareProfile {
    <#
    .SYNOPSIS
        Comprehensive hardware detection for AI workloads
    .OUTPUTS
        PSCustomObject with detailed hardware profile
    #>
    
    $profile = @{
        node_id = ""
        detected_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        platform = "windows"
        os = @{}
        cpu = @{}
        ram = @{}
        disk = @{}
        gpu = @{}
        network = @{}
        capabilities = @{}
    }
    
    # OS Information
    $os = Get-CimInstance Win32_OperatingSystem
    $profile.os = @{
        name = $os.Caption
        version = $os.Version
        build = $os.BuildNumber
        arch = if ([Environment]::Is64BitOperatingSystem) { "x86_64" } else { "x86" }
    }
    
    # CPU Information
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $profile.cpu = @{
        name = $cpu.Name.Trim()
        cores = $cpu.NumberOfCores
        logical_processors = $cpu.NumberOfLogicalProcessors
        max_clock_mhz = $cpu.MaxClockSpeed
        architecture = $cpu.Architecture
    }
    
    # RAM Information
    $ram = Get-CimInstance Win32_ComputerSystem
    $ramMB = [math]::Round($ram.TotalPhysicalMemory / 1MB)
    $profile.ram = @{
        total_mb = $ramMB
        total_gb = [math]::Round($ramMB / 1024, 1)
    }
    
    # Disk Information
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $profile.disk = @{
        free_mb = [math]::Round($disk.FreeSpace / 1MB)
        free_gb = [math]::Round($disk.FreeSpace / 1GB, 1)
        total_gb = [math]::Round($disk.Size / 1GB, 1)
    }
    
    # GPU Detection
    $profile.gpu = Get-GPUProfile
    
    # Network Information
    $profile.network = Get-NetworkProfile
    
    # Generate Node ID
    if ($NodeId) {
        $profile.node_id = $NodeId
    } else {
        $hostname = $env:COMPUTERNAME
        $mac = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1).MacAddress
        $macSuffix = if ($mac) { ($mac -replace "-", "").Substring(6) } else { (Get-Date).Ticks.ToString().Substring(12) }
        $profile.node_id = "$hostname-$macSuffix".ToLower()
    }
    
    # Calculate Capabilities
    $hasGpu = $profile.gpu.vendor -ne "none" -and $profile.gpu.count -gt 0
    $vramMB = $profile.gpu.vram_mb
    $isGpuCapable = $hasGpu -and ($vramMB -ge 4000)
    
    $profile.capabilities = @{
        has_gpu = $hasGpu
        is_gpu_capable = $isGpuCapable
        vram_mb = $vramMB
        can_run_llm = $ramMB -ge 8000
        can_run_sd = $isGpuCapable -and ($vramMB -ge 4000)
        can_run_comfyui = $isGpuCapable -and ($vramMB -ge 4000)
        can_run_video = $isGpuCapable -and ($vramMB -ge 8000)
        recommended_batch_size = Get-RecommendedBatchSize -VramMB $vramMB
        recommended_models = Get-RecommendedModels -VramMB $vramMB -RamMB $ramMB
    }
    
    return $profile
}

function Get-GPUProfile {
    <#
    .SYNOPSIS
        Detect GPU (NVIDIA, AMD, Intel, or None) with CUDA/ROCm version
    #>
    
    # Try NVIDIA first
    $nvidia = Get-NvidiaGPUInfo
    if ($nvidia) { return $nvidia }
    
    # Try AMD
    $amd = Get-AMDGPUInfo
    if ($amd) { return $amd }
    
    # Try Intel
    $intel = Get-IntelGPUInfo
    if ($intel) { return $intel }
    
    # No GPU
    return @{
        vendor = "none"
        count = 0
        name = "None"
        names = @()
        vram_mb = 0
        driver_version = ""
        cuda_version = ""
        rocm_version = ""
    }
}

function Get-NvidiaGPUInfo {
    try {
        $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
        if (-not $nvidiaSmi) { return $null }
        
        $gpuData = & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>$null
        if (-not $gpuData) { return $null }
        
        $gpus = $gpuData -split "`n" | Where-Object { $_ -match '\S' }
        $totalVram = 0
        $gpuNames = @()
        $driverVersion = ""
        
        foreach ($gpu in $gpus) {
            $parts = $gpu -split ","
            if ($parts.Count -ge 3) {
                $gpuNames += $parts[0].Trim()
                $totalVram += [int]$parts[1].Trim()
                $driverVersion = $parts[2].Trim()
            }
        }
        
        # Get CUDA version
        $cudaVersion = ""
        $nvcc = Get-Command nvcc -ErrorAction SilentlyContinue
        if ($nvcc) {
            $nvccOutput = & nvcc --version 2>$null | Select-String "release"
            if ($nvccOutput -match "release (\d+\.\d+)") {
                $cudaVersion = $matches[1]
            }
        }
        
        # Fallback: parse from nvidia-smi
        if (-not $cudaVersion) {
            $smiOutput = & nvidia-smi 2>$null
            if ($smiOutput -match "CUDA Version:\s*(\d+\.\d+)") {
                $cudaVersion = $matches[1]
            }
        }
        
        return @{
            vendor = "nvidia"
            count = $gpus.Count
            name = $gpuNames[0]
            names = $gpuNames
            vram_mb = $totalVram
            driver_version = $driverVersion
            cuda_version = $cudaVersion
            rocm_version = ""
        }
    } catch {
        return $null
    }
}

function Get-AMDGPUInfo {
    try {
        $amdGpus = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match "AMD|Radeon" }
        if (-not $amdGpus) { return $null }
        
        $totalVram = 0
        $gpuNames = @()
        
        foreach ($gpu in $amdGpus) {
            $gpuNames += $gpu.Name
            if ($gpu.AdapterRAM -gt 0) {
                $totalVram += [math]::Round($gpu.AdapterRAM / 1MB)
            }
        }
        
        # Check for ROCm
        $rocmVersion = ""
        if (Test-Path "C:\Program Files\AMD\ROCm") {
            $rocmDirs = Get-ChildItem "C:\Program Files\AMD\ROCm" -Directory | Sort-Object Name -Descending | Select-Object -First 1
            if ($rocmDirs) {
                $rocmVersion = $rocmDirs.Name
            }
        }
        
        return @{
            vendor = "amd"
            count = @($amdGpus).Count
            name = $gpuNames[0]
            names = $gpuNames
            vram_mb = $totalVram
            driver_version = $amdGpus[0].DriverVersion
            cuda_version = ""
            rocm_version = $rocmVersion
        }
    } catch {
        return $null
    }
}

function Get-IntelGPUInfo {
    try {
        $intelGpus = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match "Intel" -and $_.Name -notmatch "Microsoft" }
        if (-not $intelGpus) { return $null }
        
        $gpuNames = @($intelGpus | ForEach-Object { $_.Name })
        $vram = 0
        if ($intelGpus[0].AdapterRAM -gt 0) {
            $vram = [math]::Round($intelGpus[0].AdapterRAM / 1MB)
        }
        
        return @{
            vendor = "intel"
            count = @($intelGpus).Count
            name = $gpuNames[0]
            names = $gpuNames
            vram_mb = $vram
            driver_version = $intelGpus[0].DriverVersion
            cuda_version = ""
            rocm_version = ""
        }
    } catch {
        return $null
    }
}

function Get-NetworkProfile {
    $primaryIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
        $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169\." -and $_.IPAddress -notmatch "^127\."
    } | Select-Object -First 1).IPAddress
    
    $tailscaleIP = ""
    try {
        $tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
        if ($tailscale) {
            $tailscaleIP = (& tailscale ip -4 2>$null).Trim()
        }
    } catch {}
    
    $interfaces = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -ExpandProperty Name) -join ", "
    $hostname = $env:COMPUTERNAME
    
    return @{
        hostname = $hostname
        primary_ip = if ($primaryIP) { $primaryIP } else { "127.0.0.1" }
        tailscale_ip = $tailscaleIP
        interfaces = $interfaces
        advertise_ip = if ($tailscaleIP) { $tailscaleIP } else { $primaryIP }
    }
}

function Get-RecommendedBatchSize {
    param([int]$VramMB)
    
    if ($VramMB -ge 24000) { return 8 }
    elseif ($VramMB -ge 16000) { return 4 }
    elseif ($VramMB -ge 12000) { return 2 }
    elseif ($VramMB -ge 8000) { return 1 }
    else { return 1 }
}

function Get-RecommendedModels {
    param([int]$VramMB, [int]$RamMB)
    
    $models = @{
        ollama = @()
        sd = @()
        comfyui = @()
    }
    
    # Ollama models based on RAM
    if ($RamMB -ge 32000) {
        $models.ollama = @("llama3.1:70b-instruct-q4_0", "codellama:34b", "mixtral:8x7b")
    } elseif ($RamMB -ge 16000) {
        $models.ollama = @("llama3.1:8b", "codellama:13b", "mistral:7b")
    } elseif ($RamMB -ge 8000) {
        $models.ollama = @("llama3.2:3b", "codellama:7b", "phi3:mini")
    }
    
    # SD models based on VRAM
    if ($VramMB -ge 12000) {
        $models.sd = @("sdxl_base", "sdxl_refiner", "flux_dev")
    } elseif ($VramMB -ge 8000) {
        $models.sd = @("sd_xl_base", "dreamshaper_xl")
    } elseif ($VramMB -ge 4000) {
        $models.sd = @("sd15", "dreamshaper_v8")
    }
    
    return $models
}
#endregion

#region Service Detection & Installation
function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-Chocolatey {
    if (Get-Command choco -ErrorAction SilentlyContinue) { return $true }
    
    Write-Info "Installing Chocolatey package manager..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install Chocolatey"
        return $true
    }
    
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        Write-Success "Chocolatey installed"
        return $true
    } catch {
        Write-Err "Failed to install Chocolatey: $_"
        return $false
    }
}

function Test-GitInstalled {
    return $null -ne (Get-Command git -ErrorAction SilentlyContinue)
}

function Install-Git {
    if (Test-GitInstalled) {
        $version = (git --version) -replace "git version ", ""
        Write-Info "Git already installed: $version"
        return $true
    }
    
    Write-Info "Installing Git..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install Git"
        return $true
    }
    
    try {
        # Try winget first
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            winget install Git.Git --accept-source-agreements --accept-package-agreements --silent
        } else {
            Install-Chocolatey
            choco install git -y --no-progress
        }
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Success "Git installed"
        return $true
    } catch {
        Write-Err "Failed to install Git: $_"
        return $false
    }
}

function Test-PythonInstalled {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { return $false }
    
    try {
        $version = & python --version 2>&1
        if ($version -match "Python 3\.(\d+)") {
            $minor = [int]$matches[1]
            return $minor -ge 10
        }
    } catch {}
    return $false
}

function Install-Python {
    if (Test-PythonInstalled) {
        $version = (python --version) -replace "Python ", ""
        Write-Info "Python already installed: $version"
        return $true
    }
    
    Write-Info "Installing Python 3.11..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install Python 3.11"
        return $true
    }
    
    try {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            winget install Python.Python.3.11 --accept-source-agreements --accept-package-agreements --silent
        } else {
            Install-Chocolatey
            choco install python311 -y --no-progress
        }
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Success "Python installed"
        return $true
    } catch {
        Write-Err "Failed to install Python: $_"
        return $false
    }
}

function Test-NodeJsInstalled {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $false }
    
    try {
        $version = (& node --version) -replace "v", ""
        $major = [int]($version -split '\.')[0]
        return $major -ge 18
    } catch {}
    return $false
}

function Install-NodeJs {
    if (Test-NodeJsInstalled) {
        $version = (node --version) -replace "v", ""
        Write-Info "Node.js already installed: $version"
        return $true
    }
    
    Write-Info "Installing Node.js 20 LTS..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install Node.js 20"
        return $true
    }
    
    try {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
        } else {
            Install-Chocolatey
            choco install nodejs-lts -y --no-progress
        }
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Success "Node.js installed"
        return $true
    } catch {
        Write-Err "Failed to install Node.js: $_"
        return $false
    }
}

function Test-OllamaInstalled {
    return $null -ne (Get-Command ollama -ErrorAction SilentlyContinue)
}

function Install-Ollama {
    param($HardwareProfile)
    
    if ($NoOllama) {
        Write-Info "Skipping Ollama installation (disabled by parameter)"
        return $true
    }
    
    if (-not $HardwareProfile.capabilities.can_run_llm) {
        Write-Warn "System does not meet minimum requirements for LLM (8GB RAM required)"
        return $false
    }
    
    if (Test-OllamaInstalled -and -not $Force) {
        Write-Info "Ollama already installed"
        return $true
    }
    
    Write-Info "Installing Ollama..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install Ollama"
        return $true
    }
    
    try {
        $ollamaInstaller = Join-Path $env:TEMP "OllamaSetup.exe"
        Invoke-WebRequest -Uri "https://ollama.ai/download/OllamaSetup.exe" -OutFile $ollamaInstaller
        
        Start-Process -FilePath $ollamaInstaller -ArgumentList "/SILENT" -Wait
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        # Set environment variables for network access
        [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "Machine")
        [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "Machine")
        
        Write-Success "Ollama installed"
        return $true
    } catch {
        Write-Err "Failed to install Ollama: $_"
        return $false
    }
}

function Install-AllDependencies {
    param($HardwareProfile)
    
    Write-Step "Installing Dependencies"
    
    $results = @{
        git = Install-Git
        python = Install-Python
        nodejs = Install-NodeJs
        ollama = Install-Ollama -HardwareProfile $HardwareProfile
    }
    
    $failed = $results.GetEnumerator() | Where-Object { -not $_.Value }
    if ($failed) {
        Write-Warn "Some dependencies failed to install: $($failed.Key -join ', ')"
    } else {
        Write-Success "All dependencies installed successfully"
    }
    
    return $results
}
#endregion

#region Configuration Generation
function New-ConfigDirectory {
    param($NodeDir)
    
    $dirs = @(
        $NodeDir,
        (Join-Path $NodeDir "services"),
        (Join-Path $NodeDir "logs"),
        (Join-Path $NodeDir "state")
    )
    
    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
}

function New-NodeProfileJson {
    param($HardwareProfile, $NodeDir)
    
    $profilePath = Join-Path $NodeDir "node-profile.json"
    
    $HardwareProfile | ConvertTo-Json -Depth 10 | Out-File -FilePath $profilePath -Encoding UTF8
    
    Write-Info "Node profile saved to: $profilePath"
    return $profilePath
}

function New-ServiceMapYaml {
    param($HardwareProfile, $NodeDir)
    
    $nodeId = $HardwareProfile.node_id
    $advertiseIP = $HardwareProfile.network.advertise_ip
    $capabilities = $HardwareProfile.capabilities
    
    $services = @()
    
    if ($capabilities.can_run_llm -and -not $NoOllama) {
        $services += @"
      ollama:
        description: "Local LLM inference"
        port: 11434
        enabled: true
        health_check: "http://${advertiseIP}:11434/api/version"
"@
    }
    
    if ($capabilities.can_run_sd -and -not $NoStableDiffusion) {
        $services += @"
      stable-diffusion:
        description: "Stable Diffusion WebUI"
        port: 7860
        enabled: true
        health_check: "http://${advertiseIP}:7860/sdapi/v1/options"
"@
    }
    
    if ($capabilities.can_run_comfyui -and -not $NoComfyUI) {
        $services += @"
      comfyui:
        description: "ComfyUI node-based interface"
        port: 8188
        enabled: true
        health_check: "http://${advertiseIP}:8188/system_stats"
"@
    }
    
    $servicesContent = $services -join "`n"
    
    $yaml = @"
# Nebula Command Service Map
# Generated: $(Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
# Node ID: $nodeId

nodes:
  ${nodeId}:
    description: "Windows AI Node - $($HardwareProfile.gpu.name)"
    tailscale_ip: "$($HardwareProfile.network.tailscale_ip)"
    local_ip: "$($HardwareProfile.network.primary_ip)"
    platform: windows
    gpu_vendor: "$($HardwareProfile.gpu.vendor)"
    vram_mb: $($HardwareProfile.gpu.vram_mb)
    services:
$servicesContent

service_defaults:
  restart_policy: always
  restart_delay_ms: 5000
  max_restarts: 10
  health_check_interval_ms: 30000
"@
    
    $mapPath = Join-Path $NodeDir "service-map.yml"
    $yaml | Out-File -FilePath $mapPath -Encoding UTF8
    
    Write-Info "Service map saved to: $mapPath"
    return $mapPath
}

function New-EnvFile {
    param($HardwareProfile, $NodeDir)
    
    $nodeId = $HardwareProfile.node_id
    $advertiseIP = $HardwareProfile.network.advertise_ip
    $primaryIP = $HardwareProfile.network.primary_ip
    $tailscaleIP = $HardwareProfile.network.tailscale_ip
    
    # Compute VRAM settings
    $vramArgs = "--normalvram"
    if (-not $HardwareProfile.capabilities.has_gpu) {
        $vramArgs = "--cpu"
    } elseif ($HardwareProfile.gpu.vram_mb -lt 6000) {
        $vramArgs = "--lowvram"
    } elseif ($HardwareProfile.gpu.vram_mb -ge 12000) {
        $vramArgs = "--highvram"
    }
    
    $envContent = @"
# Nebula Command Node Configuration
# Generated: $(Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
# Node ID: $nodeId

# ═══════════════════════════════════════════════════════════════
# Node Identity
# ═══════════════════════════════════════════════════════════════
NODE_ID=$nodeId
NODE_PLATFORM=windows
NODE_IP=$advertiseIP
WINDOWS_VM_TAILSCALE_IP=$tailscaleIP
PRIMARY_IP=$primaryIP

# ═══════════════════════════════════════════════════════════════
# Dashboard Connection
# ═══════════════════════════════════════════════════════════════
DASHBOARD_URL=$DashboardUrl

# ═══════════════════════════════════════════════════════════════
# AI Service URLs
# ═══════════════════════════════════════════════════════════════
OLLAMA_URL=http://${advertiseIP}:11434
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_ORIGINS=*

STABLE_DIFFUSION_URL=http://${advertiseIP}:7860
SD_WEBUI_EXTRA_ARGS=--api --listen --xformers $vramArgs

COMFYUI_URL=http://${advertiseIP}:8188
COMFYUI_EXTRA_ARGS=--listen 0.0.0.0 --port 8188 $vramArgs

# ═══════════════════════════════════════════════════════════════
# Hardware Capabilities
# ═══════════════════════════════════════════════════════════════
HAS_GPU=$($HardwareProfile.capabilities.has_gpu.ToString().ToLower())
GPU_VENDOR=$($HardwareProfile.gpu.vendor)
GPU_NAME=$($HardwareProfile.gpu.name)
VRAM_MB=$($HardwareProfile.gpu.vram_mb)
CUDA_VERSION=$($HardwareProfile.gpu.cuda_version)
RAM_MB=$($HardwareProfile.ram.total_mb)
CPU_CORES=$($HardwareProfile.cpu.cores)

# ═══════════════════════════════════════════════════════════════
# Service Ports
# ═══════════════════════════════════════════════════════════════
OLLAMA_PORT=11434
COMFYUI_PORT=8188
SD_PORT=7860
AGENT_PORT=9765

# ═══════════════════════════════════════════════════════════════
# Paths
# ═══════════════════════════════════════════════════════════════
NEBULA_HOME=C:\NebulaCommand
COMFYUI_PATH=C:\AI\ComfyUI
SD_PATH=C:\AI\stable-diffusion-webui
MODELS_PATH=C:\AI\models
"@
    
    $envPath = Join-Path $NodeDir ".env"
    $envContent | Out-File -FilePath $envPath -Encoding UTF8
    
    Write-Info "Environment file saved to: $envPath"
    return $envPath
}

function New-AllConfigurations {
    param($HardwareProfile)
    
    Write-Step "Generating Configuration Files"
    
    $nodeId = $HardwareProfile.node_id
    $nodeDir = Join-Path $StateDir $nodeId
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would create configuration in: $nodeDir"
        return $nodeDir
    }
    
    New-ConfigDirectory -NodeDir $nodeDir
    
    $profilePath = New-NodeProfileJson -HardwareProfile $HardwareProfile -NodeDir $nodeDir
    $mapPath = New-ServiceMapYaml -HardwareProfile $HardwareProfile -NodeDir $nodeDir
    $envPath = New-EnvFile -HardwareProfile $HardwareProfile -NodeDir $nodeDir
    
    Write-Success "All configurations generated in: $nodeDir"
    
    return $nodeDir
}
#endregion

#region Service Setup
function Install-ComfyUI {
    param($HardwareProfile, $NodeDir)
    
    if ($NoComfyUI) {
        Write-Info "Skipping ComfyUI installation (disabled by parameter)"
        return $true
    }
    
    if (-not $HardwareProfile.capabilities.can_run_comfyui) {
        Write-Warn "System does not meet requirements for ComfyUI (GPU with 4GB+ VRAM required)"
        return $false
    }
    
    $comfyuiPath = "C:\AI\ComfyUI"
    
    if ((Test-Path $comfyuiPath) -and -not $Force) {
        Write-Info "ComfyUI already installed at: $comfyuiPath"
        return $true
    }
    
    Write-Info "Installing ComfyUI..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install ComfyUI to: $comfyuiPath"
        return $true
    }
    
    try {
        $aiDir = "C:\AI"
        if (-not (Test-Path $aiDir)) {
            New-Item -ItemType Directory -Path $aiDir -Force | Out-Null
        }
        
        git clone https://github.com/comfyanonymous/ComfyUI.git $comfyuiPath
        
        Set-Location $comfyuiPath
        python -m venv venv
        & "$comfyuiPath\venv\Scripts\pip.exe" install --upgrade pip
        & "$comfyuiPath\venv\Scripts\pip.exe" install -r requirements.txt
        
        # Install CUDA-specific PyTorch if NVIDIA
        if ($HardwareProfile.gpu.vendor -eq "nvidia") {
            & "$comfyuiPath\venv\Scripts\pip.exe" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
        }
        
        Write-Success "ComfyUI installed at: $comfyuiPath"
        return $true
    } catch {
        Write-Err "Failed to install ComfyUI: $_"
        return $false
    }
}

function Install-StableDiffusion {
    param($HardwareProfile, $NodeDir)
    
    if ($NoStableDiffusion) {
        Write-Info "Skipping Stable Diffusion installation (disabled by parameter)"
        return $true
    }
    
    if (-not $HardwareProfile.capabilities.can_run_sd) {
        Write-Warn "System does not meet requirements for Stable Diffusion (GPU with 4GB+ VRAM required)"
        return $false
    }
    
    $sdPath = "C:\AI\stable-diffusion-webui"
    
    if ((Test-Path $sdPath) -and -not $Force) {
        Write-Info "Stable Diffusion already installed at: $sdPath"
        return $true
    }
    
    Write-Info "Installing Stable Diffusion WebUI..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install Stable Diffusion to: $sdPath"
        return $true
    }
    
    try {
        $aiDir = "C:\AI"
        if (-not (Test-Path $aiDir)) {
            New-Item -ItemType Directory -Path $aiDir -Force | Out-Null
        }
        
        git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git $sdPath
        
        Write-Success "Stable Diffusion installed at: $sdPath"
        Write-Info "First run will complete installation and download models"
        return $true
    } catch {
        Write-Err "Failed to install Stable Diffusion: $_"
        return $false
    }
}

function Set-OllamaModels {
    param($HardwareProfile)
    
    if ($NoOllama -or -not (Test-OllamaInstalled)) {
        return
    }
    
    Write-Info "Configuring Ollama models based on hardware..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would configure Ollama models"
        return
    }
    
    $recommendedModels = $HardwareProfile.capabilities.recommended_models.ollama
    
    if ($recommendedModels.Count -eq 0) {
        Write-Warn "No recommended models for this hardware configuration"
        return
    }
    
    # Start Ollama service if not running
    $ollamaProcess = Get-Process -Name ollama -ErrorAction SilentlyContinue
    if (-not $ollamaProcess) {
        Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3
    }
    
    # Pull the first recommended model
    $primaryModel = $recommendedModels[0]
    Write-Info "Pulling recommended model: $primaryModel"
    
    try {
        & ollama pull $primaryModel
        Write-Success "Model $primaryModel ready"
    } catch {
        Write-Warn "Failed to pull model: $_"
    }
}

function Install-AllServices {
    param($HardwareProfile, $NodeDir)
    
    if ($SkipServices) {
        Write-Info "Skipping service installation (disabled by parameter)"
        return
    }
    
    Write-Step "Installing AI Services"
    
    $results = @{
        comfyui = Install-ComfyUI -HardwareProfile $HardwareProfile -NodeDir $NodeDir
        stable_diffusion = Install-StableDiffusion -HardwareProfile $HardwareProfile -NodeDir $NodeDir
    }
    
    Set-OllamaModels -HardwareProfile $HardwareProfile
    
    return $results
}
#endregion

#region Service Supervision (Task Scheduler)
function New-NebulaScheduledTask {
    param(
        [string]$TaskName,
        [string]$Description,
        [string]$Command,
        [string]$Arguments,
        [string]$WorkingDirectory,
        [switch]$StartOnBoot
    )
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would create scheduled task: $TaskName"
        return $true
    }
    
    try {
        # Remove existing task if present
        $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($existingTask) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }
        
        $action = New-ScheduledTaskAction -Execute $Command -Argument $Arguments -WorkingDirectory $WorkingDirectory
        
        $triggers = @()
        if ($StartOnBoot) {
            $triggers += New-ScheduledTaskTrigger -AtStartup
        }
        
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        
        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -RestartCount 3 `
            -RestartInterval (New-TimeSpan -Minutes 1)
        
        Register-ScheduledTask -TaskName $TaskName -Action $action -Principal $principal -Settings $settings -Description $Description -Force
        
        if ($triggers.Count -gt 0) {
            Set-ScheduledTask -TaskName $TaskName -Trigger $triggers
        }
        
        Write-Success "Created scheduled task: $TaskName"
        return $true
    } catch {
        Write-Err "Failed to create scheduled task $TaskName : $_"
        return $false
    }
}

function New-WatchdogScript {
    param($NodeDir)
    
    $watchdogPath = Join-Path $NodeDir "watchdog.ps1"
    
    $watchdogContent = @'
#Requires -Version 5.1
# Nebula Command Service Watchdog
# Monitors AI services and restarts them if they crash

$ErrorActionPreference = "SilentlyContinue"
$LogFile = Join-Path $PSScriptRoot "logs\watchdog.log"

function Write-WatchdogLog {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $Message" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

function Test-ServiceHealth {
    param([string]$Url, [int]$TimeoutSeconds = 5)
    
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -UseBasicParsing
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Restart-OllamaService {
    Write-WatchdogLog "Restarting Ollama..."
    Stop-Process -Name ollama -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 5
}

function Restart-ComfyUIService {
    Write-WatchdogLog "Restarting ComfyUI..."
    $comfyPath = "C:\AI\ComfyUI"
    if (Test-Path $comfyPath) {
        Get-Process -Name python | Where-Object { $_.Path -like "*ComfyUI*" } | Stop-Process -Force
        Start-Sleep -Seconds 2
        $env = Get-Content (Join-Path $PSScriptRoot ".env") | Where-Object { $_ -match "COMFYUI_EXTRA_ARGS" }
        $args = if ($env) { ($env -split "=")[1] } else { "--listen 0.0.0.0 --port 8188" }
        Start-Process -FilePath "$comfyPath\venv\Scripts\python.exe" -ArgumentList "$comfyPath\main.py $args" -WorkingDirectory $comfyPath -WindowStyle Hidden
    }
}

# Main watchdog loop
Write-WatchdogLog "Watchdog started"

while ($true) {
    # Check Ollama
    if (-not (Test-ServiceHealth "http://localhost:11434/api/version")) {
        Write-WatchdogLog "Ollama health check failed"
        Restart-OllamaService
    }
    
    # Check ComfyUI
    if (-not (Test-ServiceHealth "http://localhost:8188/system_stats")) {
        Write-WatchdogLog "ComfyUI health check failed"
        Restart-ComfyUIService
    }
    
    Start-Sleep -Seconds 60
}
'@
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would create watchdog script at: $watchdogPath"
        return $watchdogPath
    }
    
    $watchdogContent | Out-File -FilePath $watchdogPath -Encoding UTF8
    Write-Info "Watchdog script created at: $watchdogPath"
    
    return $watchdogPath
}

function New-ServiceSupervision {
    param($HardwareProfile, $NodeDir)
    
    if ($SkipServices) {
        Write-Info "Skipping service supervision setup (disabled by parameter)"
        return
    }
    
    Write-Step "Setting Up Service Supervision"
    
    if (-not (Test-Admin)) {
        Write-Warn "Administrator privileges required for Task Scheduler setup"
        Write-Info "Run script as Administrator to enable auto-start"
        return
    }
    
    # Create watchdog script
    $watchdogPath = New-WatchdogScript -NodeDir $NodeDir
    
    # Create Ollama auto-start task
    if ((Test-OllamaInstalled) -and -not $NoOllama) {
        $ollamaPath = (Get-Command ollama).Source
        New-NebulaScheduledTask `
            -TaskName "NebulaCommand-Ollama" `
            -Description "Nebula Command - Ollama LLM Service" `
            -Command $ollamaPath `
            -Arguments "serve" `
            -WorkingDirectory (Split-Path $ollamaPath) `
            -StartOnBoot
    }
    
    # Create ComfyUI auto-start task
    $comfyuiPath = "C:\AI\ComfyUI"
    if ((Test-Path $comfyuiPath) -and -not $NoComfyUI) {
        $pythonPath = "$comfyuiPath\venv\Scripts\python.exe"
        $vramArgs = if ($HardwareProfile.gpu.vram_mb -lt 6000) { "--lowvram" } elseif ($HardwareProfile.gpu.vram_mb -ge 12000) { "--highvram" } else { "--normalvram" }
        
        New-NebulaScheduledTask `
            -TaskName "NebulaCommand-ComfyUI" `
            -Description "Nebula Command - ComfyUI Image Generation" `
            -Command $pythonPath `
            -Arguments "main.py --listen 0.0.0.0 --port 8188 $vramArgs" `
            -WorkingDirectory $comfyuiPath `
            -StartOnBoot
    }
    
    # Create Dashboard auto-start task
    $dashboardPath = Join-Path $NodeDir "services\dashboard-next"
    if (Test-Path $dashboardPath) {
        $npmPath = (Get-Command npm -ErrorAction SilentlyContinue).Source
        if ($npmPath) {
            New-NebulaScheduledTask `
                -TaskName "NebulaCommand-Dashboard" `
                -Description "Nebula Command - Dashboard (Next.js)" `
                -Command $npmPath `
                -Arguments "run start" `
                -WorkingDirectory $dashboardPath `
                -StartOnBoot
        }
    }
    
    # Create Discord Bot auto-start task
    $discordBotPath = Join-Path $NodeDir "services\discord-bot"
    if (Test-Path $discordBotPath) {
        $npmPath = (Get-Command npm -ErrorAction SilentlyContinue).Source
        if ($npmPath) {
            New-NebulaScheduledTask `
                -TaskName "NebulaCommand-DiscordBot" `
                -Description "Nebula Command - Discord Bot" `
                -Command $npmPath `
                -Arguments "run start" `
                -WorkingDirectory $discordBotPath `
                -StartOnBoot
        }
    }
    
    # Create Stream Bot auto-start task
    $streamBotPath = Join-Path $NodeDir "services\stream-bot"
    if (Test-Path $streamBotPath) {
        $npmPath = (Get-Command npm -ErrorAction SilentlyContinue).Source
        if ($npmPath) {
            New-NebulaScheduledTask `
                -TaskName "NebulaCommand-StreamBot" `
                -Description "Nebula Command - Stream Bot" `
                -Command $npmPath `
                -Arguments "run start" `
                -WorkingDirectory $streamBotPath `
                -StartOnBoot
        }
    }
    
    # Create watchdog task
    if (-not $DryRun) {
        New-NebulaScheduledTask `
            -TaskName "NebulaCommand-Watchdog" `
            -Description "Nebula Command - Service Health Monitor" `
            -Command "powershell.exe" `
            -Arguments "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogPath`"" `
            -WorkingDirectory $NodeDir `
            -StartOnBoot
    }
    
    Write-Success "Service supervision configured"
}
#endregion

#region Validation & Health Checks
function Test-ServiceHealth {
    param(
        [string]$ServiceName,
        [string]$Url,
        [int]$TimeoutSeconds = 10
    )
    
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -UseBasicParsing -ErrorAction Stop
        return @{
            name = $ServiceName
            status = "healthy"
            code = $response.StatusCode
            url = $Url
        }
    } catch {
        return @{
            name = $ServiceName
            status = "unhealthy"
            error = $_.Exception.Message
            url = $Url
        }
    }
}

function Invoke-ServiceValidation {
    param($HardwareProfile)
    
    Write-Step "Validating Services"
    
    $results = @()
    $advertiseIP = $HardwareProfile.network.advertise_ip
    
    # Check Ollama
    if ((Test-OllamaInstalled) -and -not $NoOllama) {
        $result = Test-ServiceHealth -ServiceName "Ollama" -Url "http://localhost:11434/api/version"
        $results += $result
        
        if ($result.status -eq "healthy") {
            Write-Success "Ollama: Running at http://${advertiseIP}:11434"
        } else {
            Write-Warn "Ollama: Not responding - $($result.error)"
        }
    }
    
    # Check ComfyUI
    if ((Test-Path "C:\AI\ComfyUI") -and -not $NoComfyUI) {
        $result = Test-ServiceHealth -ServiceName "ComfyUI" -Url "http://localhost:8188/system_stats"
        $results += $result
        
        if ($result.status -eq "healthy") {
            Write-Success "ComfyUI: Running at http://${advertiseIP}:8188"
        } else {
            Write-Warn "ComfyUI: Not responding (may need to be started manually first time)"
        }
    }
    
    # Check Stable Diffusion
    if ((Test-Path "C:\AI\stable-diffusion-webui") -and -not $NoStableDiffusion) {
        $result = Test-ServiceHealth -ServiceName "StableDiffusion" -Url "http://localhost:7860/sdapi/v1/options"
        $results += $result
        
        if ($result.status -eq "healthy") {
            Write-Success "Stable Diffusion: Running at http://${advertiseIP}:7860"
        } else {
            Write-Warn "Stable Diffusion: Not responding (requires first-run setup)"
        }
    }
    
    # Check Dashboard
    $dashboardPath = Join-Path $env:NEBULA_HOME "services\dashboard-next"
    if (-not $dashboardPath) { $dashboardPath = "C:\NebulaCommand\services\dashboard-next" }
    if (Test-Path $dashboardPath) {
        $result = Test-ServiceHealth -ServiceName "Dashboard" -Url "http://localhost:5000/"
        $results += $result
        
        if ($result.status -eq "healthy") {
            Write-Success "Dashboard: Running at http://${advertiseIP}:5000"
        } else {
            Write-Warn "Dashboard: Not responding"
        }
    }
    
    # Check Discord Bot (process-based check since no HTTP endpoint)
    $discordBotPath = Join-Path $env:NEBULA_HOME "services\discord-bot"
    if (-not $discordBotPath) { $discordBotPath = "C:\NebulaCommand\services\discord-bot" }
    if (Test-Path $discordBotPath) {
        $task = Get-ScheduledTask -TaskName "NebulaCommand-DiscordBot" -ErrorAction SilentlyContinue
        if ($task -and $task.State -eq "Running") {
            Write-Success "Discord Bot: Running"
            $results += @{ name = "DiscordBot"; status = "healthy"; url = "N/A" }
        } else {
            Write-Warn "Discord Bot: Not running"
            $results += @{ name = "DiscordBot"; status = "unhealthy"; error = "Task not running" }
        }
    }
    
    # Check Stream Bot
    $streamBotPath = Join-Path $env:NEBULA_HOME "services\stream-bot"
    if (-not $streamBotPath) { $streamBotPath = "C:\NebulaCommand\services\stream-bot" }
    if (Test-Path $streamBotPath) {
        $result = Test-ServiceHealth -ServiceName "StreamBot" -Url "http://localhost:3000/"
        $results += $result
        
        if ($result.status -eq "healthy") {
            Write-Success "Stream Bot: Running at http://${advertiseIP}:3000"
        } else {
            Write-Warn "Stream Bot: Not responding"
        }
    }
    
    return $results
}

function Invoke-SmokeTest {
    param($HardwareProfile, $NodeDir)
    
    Write-Step "Running Smoke Test Validation"
    
    $results = Invoke-ServiceValidation -HardwareProfile $HardwareProfile
    
    $healthy = ($results | Where-Object { $_.status -eq "healthy" }).Count
    $unhealthy = ($results | Where-Object { $_.status -eq "unhealthy" }).Count
    $total = $results.Count
    
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    if ($unhealthy -eq 0 -and $healthy -gt 0) {
        Write-Host "  ✓ SMOKE TEST PASSED" -ForegroundColor Green -NoNewline
        Write-Host " - All $healthy enabled services are healthy"
        $smokeTestPassed = $true
    } elseif ($unhealthy -gt 0) {
        Write-Host "  ✗ SMOKE TEST FAILED" -ForegroundColor Red -NoNewline
        Write-Host " - $unhealthy service(s) unhealthy, $healthy healthy"
        $smokeTestPassed = $false
    } else {
        Write-Host "  ○ SMOKE TEST SKIPPED" -ForegroundColor Yellow -NoNewline
        Write-Host " - No services configured"
        $smokeTestPassed = $true
    }
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    
    $validationFile = Join-Path $NodeDir "validation-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    $validationData = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        smoke_test_passed = $smokeTestPassed
        healthy_count = $healthy
        unhealthy_count = $unhealthy
        results = $results
    } | ConvertTo-Json -Depth 5
    $validationData | Out-File -FilePath $validationFile -Encoding UTF8
    
    Write-Info "Validation results saved to: $validationFile"
    
    return @{
        passed = $smokeTestPassed
        results = $results
    }
}

function Show-DeploymentSummary {
    param($HardwareProfile, $NodeDir, $ValidationResults)
    
    $nodeId = $HardwareProfile.node_id
    $advertiseIP = $HardwareProfile.network.advertise_ip
    $tailscaleIP = $HardwareProfile.network.tailscale_ip
    $primaryIP = $HardwareProfile.network.primary_ip
    
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║              Nebula Command - Bootstrap Complete                              ║" -ForegroundColor Green
    Write-Host "╚═══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "Node Information:" -ForegroundColor Cyan
    Write-Host "  Node ID:        $nodeId"
    Write-Host "  Platform:       Windows $($HardwareProfile.os.build)"
    Write-Host "  Config Dir:     $NodeDir"
    Write-Host "  Log File:       $LogFile"
    Write-Host ""
    
    Write-Host "Hardware:" -ForegroundColor Cyan
    Write-Host "  CPU:            $($HardwareProfile.cpu.name) ($($HardwareProfile.cpu.cores) cores)"
    Write-Host "  RAM:            $($HardwareProfile.ram.total_gb) GB"
    Write-Host "  GPU:            $($HardwareProfile.gpu.name)"
    Write-Host "  VRAM:           $($HardwareProfile.gpu.vram_mb) MB"
    if ($HardwareProfile.gpu.cuda_version) {
        Write-Host "  CUDA:           $($HardwareProfile.gpu.cuda_version)"
    }
    Write-Host ""
    
    Write-Host "Network:" -ForegroundColor Cyan
    Write-Host "  Primary IP:     $primaryIP"
    if ($tailscaleIP) {
        Write-Host "  Tailscale IP:   $tailscaleIP"
    }
    Write-Host "  Advertise IP:   $advertiseIP"
    Write-Host ""
    
    Write-Host "Services:" -ForegroundColor Cyan
    
    $healthy = $ValidationResults | Where-Object { $_.status -eq "healthy" }
    $unhealthy = $ValidationResults | Where-Object { $_.status -eq "unhealthy" }
    
    foreach ($service in $healthy) {
        Write-Host "  ✓ " -ForegroundColor Green -NoNewline
        Write-Host "$($service.name): " -NoNewline
        Write-Host "$($service.url)" -ForegroundColor Gray
    }
    
    foreach ($service in $unhealthy) {
        Write-Host "  ✗ " -ForegroundColor Yellow -NoNewline
        Write-Host "$($service.name): " -NoNewline
        Write-Host "Not running" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Quick Commands:" -ForegroundColor Cyan
    Write-Host "  Start Ollama:   ollama serve"
    Write-Host "  Start ComfyUI:  cd C:\AI\ComfyUI && .\venv\Scripts\python.exe main.py --listen 0.0.0.0"
    Write-Host "  Start SD:       cd C:\AI\stable-diffusion-webui && .\webui-user.bat"
    Write-Host ""
    
    if ($DashboardUrl) {
        Write-Host "Dashboard:" -ForegroundColor Cyan
        Write-Host "  URL:            $DashboardUrl"
        Write-Host ""
    }
    
    Write-Host "Environment Variables (add to dashboard):" -ForegroundColor Cyan
    Write-Host "  WINDOWS_VM_TAILSCALE_IP=$advertiseIP"
    Write-Host "  OLLAMA_URL=http://${advertiseIP}:11434"
    Write-Host "  COMFYUI_URL=http://${advertiseIP}:8188"
    Write-Host ""
}

function Register-WithDashboard {
    param($HardwareProfile)
    
    if (-not $DashboardUrl) {
        Write-Info "No DashboardUrl specified, skipping registration"
        return
    }
    
    Write-Info "Registering node with dashboard..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would register with dashboard at: $DashboardUrl"
        return
    }
    
    try {
        $payload = $HardwareProfile | ConvertTo-Json -Depth 10
        
        $response = Invoke-RestMethod `
            -Uri "$DashboardUrl/api/nodes/register" `
            -Method Post `
            -Body $payload `
            -ContentType "application/json" `
            -ErrorAction Stop
        
        if ($response.success) {
            Write-Success "Node registered with dashboard"
        } else {
            Write-Warn "Dashboard registration response: $($response | ConvertTo-Json -Compress)"
        }
    } catch {
        Write-Warn "Dashboard registration failed: $($_.Exception.Message)"
        Write-Info "You can manually add this node later"
    }
}
#endregion

#region Main Execution
function Main {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                    Nebula Command - Automated Node Bootstrap                  ║" -ForegroundColor Cyan
    Write-Host "║                              Version $Script:ScriptVersion                               ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    
    # Check admin status
    if (-not (Test-Admin)) {
        Write-Warn "Not running as Administrator"
        Write-Info "Some features (Task Scheduler, system-wide install) may not work"
        Write-Info "For full functionality, run: Start-Process powershell -Verb RunAs -ArgumentList '-File $($MyInvocation.MyCommand.Path)'"
        Write-Host ""
    }
    
    if ($DryRun) {
        Write-Warn "DRY RUN MODE - No changes will be made"
        Write-Host ""
    }
    
    # Create state directory
    if (-not (Test-Path $StateDir)) {
        New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
    }
    
    # Step 1: Hardware Detection
    Write-Step "Detecting Hardware"
    $hardwareProfile = Get-HardwareProfile
    
    Write-Info "Node ID:     $($hardwareProfile.node_id)"
    Write-Info "CPU:         $($hardwareProfile.cpu.name) ($($hardwareProfile.cpu.cores) cores)"
    Write-Info "RAM:         $($hardwareProfile.ram.total_gb) GB"
    Write-Info "GPU:         $($hardwareProfile.gpu.name)"
    Write-Info "VRAM:        $($hardwareProfile.gpu.vram_mb) MB"
    Write-Info "GPU Vendor:  $($hardwareProfile.gpu.vendor)"
    if ($hardwareProfile.gpu.cuda_version) {
        Write-Info "CUDA:        $($hardwareProfile.gpu.cuda_version)"
    }
    Write-Success "Hardware detection complete"
    
    # Step 2: Install Dependencies
    $depResults = Install-AllDependencies -HardwareProfile $hardwareProfile
    
    # Step 3: Generate Configurations
    $nodeDir = New-AllConfigurations -HardwareProfile $hardwareProfile
    
    # Step 4: Install Services
    $serviceResults = Install-AllServices -HardwareProfile $hardwareProfile -NodeDir $nodeDir
    
    # Step 5: Setup Service Supervision
    New-ServiceSupervision -HardwareProfile $hardwareProfile -NodeDir $nodeDir
    
    # Step 6: Validate Services with Smoke Test
    $smokeTestResult = Invoke-SmokeTest -HardwareProfile $hardwareProfile -NodeDir $nodeDir
    
    # Step 7: Register with Dashboard
    Register-WithDashboard -HardwareProfile $hardwareProfile
    
    # Show Summary
    Show-DeploymentSummary -HardwareProfile $hardwareProfile -NodeDir $nodeDir -ValidationResults $smokeTestResult.results
    
    if ($smokeTestResult.passed) {
        Write-Success "Bootstrap completed successfully!"
        Write-Info "Log saved to: $LogFile"
        return 0
    } else {
        Write-Warn "Bootstrap completed with some services not responding"
        Write-Info "Log saved to: $LogFile"
        Write-Info "Some services may still be starting up - check status in a few minutes"
        return 1
    }
}

# Run main function and exit with appropriate code
$exitCode = Main
exit $exitCode
#endregion
