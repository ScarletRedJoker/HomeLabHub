# Nebula Command - AI Model Installation Script
# Downloads and installs AI models to correct directories
# Supports: Checkpoints, LoRA, VAE, Embeddings, ControlNet, Upscalers

param(
    [Parameter(Mandatory=$false)]
    [string]$ModelUrl,
    
    [Parameter(Mandatory=$false)]
    [string]$ModelPath,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("checkpoint", "lora", "vae", "embedding", "controlnet", "upscaler", "clip", "auto")]
    [string]$ModelType = "auto",
    
    [string]$SDPath = "C:\AI\stable-diffusion-webui",
    [string]$ComfyUIPath = "C:\AI\ComfyUI",
    
    [ValidateSet("sd", "comfyui", "both")]
    [string]$Target = "both",
    
    [string]$Checksum = "",
    [string]$CustomName = "",
    [switch]$Force,
    [switch]$Verify,
    [switch]$ListModels
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogFile = "C:\ProgramData\NebulaCommand\logs\model-install-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$ModelDatabase = "C:\ProgramData\NebulaCommand\models\installed-models.json"

$MODEL_DIRECTORIES = @{
    sd = @{
        checkpoint = "models\Stable-diffusion"
        lora = "models\Lora"
        vae = "models\VAE"
        embedding = "embeddings"
        controlnet = "models\ControlNet"
        upscaler = "models\ESRGAN"
        clip = "models\CLIP"
    }
    comfyui = @{
        checkpoint = "models\checkpoints"
        lora = "models\loras"
        vae = "models\vae"
        embedding = "models\embeddings"
        controlnet = "models\controlnet"
        upscaler = "models\upscale_models"
        clip = "models\clip"
    }
}

$MODEL_EXTENSIONS = @{
    checkpoint = @(".safetensors", ".ckpt", ".pt")
    lora = @(".safetensors", ".pt")
    vae = @(".safetensors", ".pt", ".ckpt")
    embedding = @(".safetensors", ".pt", ".bin")
    controlnet = @(".safetensors", ".pth", ".pt")
    upscaler = @(".pth", ".pt")
    clip = @(".safetensors", ".pt", ".bin")
}

$MODEL_SIZE_HINTS = @{
    checkpoint = @{ MinMB = 1000; MaxMB = 10000 }
    lora = @{ MinMB = 1; MaxMB = 500 }
    vae = @{ MinMB = 100; MaxMB = 500 }
    embedding = @{ MinMB = 0.001; MaxMB = 50 }
    controlnet = @{ MinMB = 500; MaxMB = 3000 }
    upscaler = @{ MinMB = 10; MaxMB = 200 }
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

function Initialize-ModelDatabase {
    $dbDir = Split-Path $ModelDatabase -Parent
    if (-not (Test-Path $dbDir)) {
        New-Item -ItemType Directory -Path $dbDir -Force | Out-Null
    }
    
    if (-not (Test-Path $ModelDatabase)) {
        $initialDb = @{
            version = "1.0"
            models = @()
            lastUpdated = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
        $initialDb | ConvertTo-Json -Depth 10 | Set-Content $ModelDatabase
    }
    
    return Get-Content $ModelDatabase | ConvertFrom-Json
}

function Add-ModelToDatabase {
    param(
        [string]$Name,
        [string]$Type,
        [string]$Path,
        [string]$Checksum,
        [string]$Source
    )
    
    $db = Initialize-ModelDatabase
    
    $existingModel = $db.models | Where-Object { $_.path -eq $Path }
    if ($existingModel) {
        return
    }
    
    $newModel = @{
        id = [guid]::NewGuid().ToString()
        name = $Name
        type = $Type
        path = $Path
        checksum = $Checksum
        source = $Source
        installedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    
    $modelsList = [System.Collections.ArrayList]@($db.models)
    $modelsList.Add($newModel) | Out-Null
    $db.models = $modelsList.ToArray()
    $db.lastUpdated = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    
    $db | ConvertTo-Json -Depth 10 | Set-Content $ModelDatabase
}

function Get-InstalledModels {
    $db = Initialize-ModelDatabase
    return $db.models
}

function Detect-ModelType {
    param([string]$FileName, [long]$FileSize = 0)
    
    $extension = [System.IO.Path]::GetExtension($FileName).ToLower()
    $nameLower = $FileName.ToLower()
    $sizeMB = $FileSize / 1MB
    
    if ($nameLower -match "lora|loha|locon") { return "lora" }
    if ($nameLower -match "vae") { return "vae" }
    if ($nameLower -match "embedding|textual.?inversion|ti_") { return "embedding" }
    if ($nameLower -match "controlnet|control|cn_") { return "controlnet" }
    if ($nameLower -match "upscale|esrgan|realesrgan|swinir") { return "upscaler" }
    if ($nameLower -match "clip") { return "clip" }
    
    if ($sizeMB -gt 0) {
        if ($sizeMB -lt 50) { return "embedding" }
        if ($sizeMB -lt 500) { return "lora" }
        if ($sizeMB -lt 800) { return "vae" }
        return "checkpoint"
    }
    
    if ($extension -in @(".ckpt")) { return "checkpoint" }
    if ($extension -in @(".safetensors")) {
        if ($nameLower -match "v1|v2|sd|sdxl|xl|base") { return "checkpoint" }
        return "checkpoint"
    }
    
    return "checkpoint"
}

function Get-FileChecksum {
    param([string]$FilePath)
    
    try {
        $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
        return $hash.Hash
    } catch {
        return $null
    }
}

function Download-Model {
    param(
        [string]$Url,
        [string]$DestinationPath,
        [string]$ExpectedChecksum = ""
    )
    
    Write-Log "Downloading from: $Url"
    Write-Log "Destination: $DestinationPath"
    
    $tempPath = "$DestinationPath.download"
    
    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", "NebulaCommand/1.0")
        
        if ($Url -match "civitai\.com") {
            Write-Log "CivitAI detected - may require API token for some models" "WARN"
        }
        if ($Url -match "huggingface\.co") {
            Write-Log "HuggingFace detected - using HF download method"
        }
        
        $webClient.DownloadFile($Url, $tempPath)
        
        if ($ExpectedChecksum) {
            Write-Log "Verifying checksum..."
            $actualChecksum = Get-FileChecksum -FilePath $tempPath
            if ($actualChecksum -ne $ExpectedChecksum) {
                Write-Log "Checksum mismatch! Expected: $ExpectedChecksum, Got: $actualChecksum" "ERROR"
                Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                return $false
            }
            Write-Log "Checksum verified" "SUCCESS"
        }
        
        Move-Item -Path $tempPath -Destination $DestinationPath -Force
        return $true
        
    } catch {
        Write-Log "Download failed: $_" "ERROR"
        Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
        return $false
    }
}

function Install-Model {
    param(
        [string]$Source,
        [string]$Type,
        [string]$Target,
        [string]$CustomName = "",
        [string]$Checksum = ""
    )
    
    $isUrl = $Source -match "^https?://"
    $isLocalFile = Test-Path $Source
    
    if (-not $isUrl -and -not $isLocalFile) {
        Write-Log "Source not found: $Source" "ERROR"
        return $false
    }
    
    if ($isUrl) {
        if ($Source -match "/([^/]+\.(safetensors|ckpt|pt|pth|bin))(\?|$)") {
            $fileName = $matches[1]
        } else {
            $fileName = "model_$(Get-Date -Format 'yyyyMMddHHmmss').safetensors"
        }
    } else {
        $fileName = [System.IO.Path]::GetFileName($Source)
    }
    
    if ($CustomName) {
        $extension = [System.IO.Path]::GetExtension($fileName)
        $fileName = "$CustomName$extension"
    }
    
    if ($Type -eq "auto") {
        if ($isLocalFile) {
            $fileInfo = Get-Item $Source
            $Type = Detect-ModelType -FileName $fileName -FileSize $fileInfo.Length
        } else {
            $Type = Detect-ModelType -FileName $fileName
        }
        Write-Log "Auto-detected model type: $Type"
    }
    
    $installedPaths = @()
    
    $targets = @()
    if ($Target -eq "both") {
        $targets = @("sd", "comfyui")
    } else {
        $targets = @($Target)
    }
    
    foreach ($t in $targets) {
        $basePath = if ($t -eq "sd") { $SDPath } else { $ComfyUIPath }
        
        if (-not (Test-Path $basePath)) {
            Write-Log "$t installation not found at $basePath - skipping" "WARN"
            continue
        }
        
        $modelDir = Join-Path $basePath $MODEL_DIRECTORIES[$t][$Type]
        
        if (-not (Test-Path $modelDir)) {
            Write-Log "Creating directory: $modelDir"
            New-Item -ItemType Directory -Path $modelDir -Force | Out-Null
        }
        
        $destPath = Join-Path $modelDir $fileName
        
        if ((Test-Path $destPath) -and -not $Force) {
            Write-Log "Model already exists at $destPath (use -Force to overwrite)" "WARN"
            $installedPaths += $destPath
            continue
        }
        
        if ($isUrl) {
            Write-Log "Downloading model for $t..."
            $success = Download-Model -Url $Source -DestinationPath $destPath -ExpectedChecksum $Checksum
            if (-not $success) {
                Write-Log "Failed to download model for $t" "ERROR"
                continue
            }
        } else {
            Write-Log "Copying model to $t..."
            try {
                Copy-Item -Path $Source -Destination $destPath -Force
            } catch {
                Write-Log "Failed to copy model: $_" "ERROR"
                continue
            }
        }
        
        if (Test-Path $destPath) {
            $fileInfo = Get-Item $destPath
            $sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
            Write-Log "Model installed: $destPath ($sizeMB MB)" "SUCCESS"
            
            $installedPaths += $destPath
            
            $actualChecksum = if ($Checksum) { $Checksum } else { Get-FileChecksum -FilePath $destPath }
            Add-ModelToDatabase -Name $fileName -Type $Type -Path $destPath -Checksum $actualChecksum -Source $Source
        }
    }
    
    return $installedPaths.Count -gt 0
}

function Show-InstalledModels {
    $models = Get-InstalledModels
    
    if ($models.Count -eq 0) {
        Write-Host "No models registered in database" -ForegroundColor Yellow
        return
    }
    
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                    INSTALLED MODELS                        ║" -ForegroundColor Cyan
    Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    
    $groupedModels = $models | Group-Object -Property type
    
    foreach ($group in $groupedModels) {
        Write-Host "║                                                            ║" -ForegroundColor Cyan
        Write-Host "║  $($group.Name.ToUpper().PadRight(56))║" -ForegroundColor Yellow
        
        foreach ($model in $group.Group) {
            $name = if ($model.name.Length -gt 50) { $model.name.Substring(0, 47) + "..." } else { $model.name }
            Write-Host "║    • $($name.PadRight(54))║" -ForegroundColor White
        }
    }
    
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Total: $($models.Count) models" -ForegroundColor Gray
}

if (-not (Test-Path (Split-Path $LogFile -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $LogFile -Parent) -Force | Out-Null
}

if ($ListModels) {
    Show-InstalledModels
    exit 0
}

if (-not $ModelUrl -and -not $ModelPath) {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "║     NEBULA COMMAND - AI MODEL INSTALLER                    ║" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  Install-Model.ps1 -ModelUrl <URL> [-ModelType <type>] [-Target <target>]" -ForegroundColor White
    Write-Host "  Install-Model.ps1 -ModelPath <path> [-ModelType <type>] [-Target <target>]" -ForegroundColor White
    Write-Host "  Install-Model.ps1 -ListModels" -ForegroundColor White
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Cyan
    Write-Host "  -ModelUrl      URL to download model from (CivitAI, HuggingFace, etc.)" -ForegroundColor White
    Write-Host "  -ModelPath     Local path to model file" -ForegroundColor White
    Write-Host "  -ModelType     checkpoint, lora, vae, embedding, controlnet, upscaler, clip, auto" -ForegroundColor White
    Write-Host "  -Target        sd, comfyui, or both (default: both)" -ForegroundColor White
    Write-Host "  -CustomName    Custom name for the model file" -ForegroundColor White
    Write-Host "  -Checksum      SHA256 checksum for verification" -ForegroundColor White
    Write-Host "  -Force         Overwrite existing models" -ForegroundColor White
    Write-Host "  -ListModels    Show installed models" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  # Install checkpoint from CivitAI" -ForegroundColor Gray
    Write-Host '  .\Install-Model.ps1 -ModelUrl "https://civitai.com/api/download/models/12345"' -ForegroundColor White
    Write-Host ""
    Write-Host "  # Install local LoRA to both SD and ComfyUI" -ForegroundColor Gray
    Write-Host '  .\Install-Model.ps1 -ModelPath "C:\Downloads\my-lora.safetensors" -ModelType lora' -ForegroundColor White
    Write-Host ""
    Write-Host "  # Install VAE with custom name" -ForegroundColor Gray
    Write-Host '  .\Install-Model.ps1 -ModelPath "vae.safetensors" -CustomName "sd-vae-ft-mse"' -ForegroundColor White
    exit 0
}

$source = if ($ModelUrl) { $ModelUrl } else { $ModelPath }

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " Installing Model" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

Write-Log "Source: $source"
Write-Log "Type: $ModelType"
Write-Log "Target: $Target"

$result = Install-Model -Source $source -Type $ModelType -Target $Target -CustomName $CustomName -Checksum $Checksum

if ($result) {
    Write-Host ""
    Write-Host "Model installation completed successfully!" -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "Model installation failed. Check log: $LogFile" -ForegroundColor Red
    exit 1
}
