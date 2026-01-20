# Nebula Command - AI Environment Validation Script
# Pre-flight checks for Windows AI Stack (Stable Diffusion, ComfyUI)
# Run as Administrator for full functionality

param(
    [string]$SDPath = "C:\AI\stable-diffusion-webui",
    [string]$ComfyUIPath = "C:\AI\ComfyUI",
    [switch]$Detailed,
    [switch]$JsonOutput
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogFile = "C:\ProgramData\NebulaCommand\logs\ai-validation-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

$ValidationResults = @{
    Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    System = @{}
    Python = @{}
    CUDA = @{}
    GPU = @{}
    StableDiffusion = @{}
    ComfyUI = @{}
    Issues = @()
    Recommendations = @()
    OverallStatus = "UNKNOWN"
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    if (-not $JsonOutput) {
        Write-Host $logEntry -ForegroundColor $(switch($Level) { 
            "ERROR" { "Red" } 
            "WARN" { "Yellow" } 
            "SUCCESS" { "Green" } 
            "HEADER" { "Cyan" }
            "CHECK" { "Magenta" }
            default { "White" } 
        })
    }
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
}

function Add-Issue {
    param([string]$Component, [string]$Issue, [string]$Severity = "ERROR")
    $script:ValidationResults.Issues += @{
        Component = $Component
        Issue = $Issue
        Severity = $Severity
    }
}

function Add-Recommendation {
    param([string]$Action, [string]$Script = "", [string]$Priority = "MEDIUM")
    $script:ValidationResults.Recommendations += @{
        Action = $Action
        Script = $Script
        Priority = $Priority
    }
}

function Test-AdminPrivileges {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-SystemPythonInfo {
    $result = @{
        Installed = $false
        Version = $null
        Path = $null
        Is310 = $false
    }
    
    try {
        $python = Get-Command python -ErrorAction SilentlyContinue
        if ($python) {
            $result.Installed = $true
            $result.Path = $python.Source
            $versionOutput = & python --version 2>&1
            if ($versionOutput -match "Python (\d+\.\d+\.\d+)") {
                $result.Version = $matches[1]
                $result.Is310 = $result.Version -match "^3\.10\."
            }
        }
    } catch {}
    
    return $result
}

function Get-GPUInfo {
    $result = @{
        HasNvidia = $false
        Name = $null
        DriverVersion = $null
        VRAM_MB = 0
        CudaDriverVersion = $null
    }
    
    try {
        $gpu = Get-CimInstance -ClassName Win32_VideoController | Where-Object { $_.Name -like "*NVIDIA*" } | Select-Object -First 1
        if ($gpu) {
            $result.HasNvidia = $true
            $result.Name = $gpu.Name
        }
        
        $nvidiaSmi = & nvidia-smi --query-gpu=driver_version,memory.total --format=csv,noheader,nounits 2>$null
        if ($nvidiaSmi -and $LASTEXITCODE -eq 0) {
            $parts = $nvidiaSmi -split ","
            $result.DriverVersion = $parts[0].Trim()
            $result.VRAM_MB = [int]$parts[1].Trim()
        }
        
        $cudaOutput = & nvidia-smi 2>&1
        if ($cudaOutput -match "CUDA Version:\s*(\d+\.\d+)") {
            $result.CudaDriverVersion = $matches[1]
        }
    } catch {}
    
    return $result
}

function Get-CUDAToolkitInfo {
    $result = @{
        Installed = $false
        Version = $null
        Path = $null
    }
    
    try {
        $cudaPath = $env:CUDA_PATH
        if ($cudaPath -and (Test-Path $cudaPath)) {
            $result.Installed = $true
            $result.Path = $cudaPath
            if ($cudaPath -match "v(\d+\.\d+)") {
                $result.Version = $matches[1]
            }
        }
        
        if (-not $result.Version) {
            $nvcc = Get-Command nvcc -ErrorAction SilentlyContinue
            if ($nvcc) {
                $nvccOutput = & nvcc --version 2>&1
                if ($nvccOutput -match "release (\d+\.\d+)") {
                    $result.Installed = $true
                    $result.Version = $matches[1]
                }
            }
        }
    } catch {}
    
    return $result
}

function Test-PythonVenv {
    param([string]$BasePath, [string]$Component)
    
    $result = @{
        Exists = $false
        PythonPath = $null
        PythonVersion = $null
        TorchVersion = $null
        TorchCuda = $null
        XformersVersion = $null
        XformersWorking = $false
        TransformersVersion = $null
        ProtobufVersion = $null
        OpenCVInstalled = $false
        ImageIOFFmpegInstalled = $false
        Issues = @()
    }
    
    $venvPython = Join-Path $BasePath "venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        return $result
    }
    
    $result.Exists = $true
    $result.PythonPath = $venvPython
    
    try {
        $pyVersion = & $venvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $result.PythonVersion = $pyVersion.Trim()
        }
    } catch {}
    
    try {
        $torchInfo = & $venvPython -c "import torch; print(torch.__version__, torch.version.cuda if torch.cuda.is_available() else 'NO_CUDA')" 2>&1
        if ($LASTEXITCODE -eq 0 -and $torchInfo -notmatch "Error") {
            $parts = $torchInfo.Trim() -split '\s+'
            $result.TorchVersion = $parts[0]
            $result.TorchCuda = if ($parts.Length -gt 1) { $parts[1] } else { "N/A" }
        }
    } catch {}
    
    try {
        $xformersVersion = & $venvPython -c "import xformers; print(xformers.__version__)" 2>&1
        if ($LASTEXITCODE -eq 0 -and $xformersVersion -notmatch "Error|No module") {
            $result.XformersVersion = $xformersVersion.Trim()
            
            $xformersTest = & $venvPython -c "import torch; import xformers.ops; print('OK')" 2>&1
            $result.XformersWorking = $xformersTest -match "OK"
        }
    } catch {}
    
    try {
        $transformersVersion = & $venvPython -c "import transformers; print(transformers.__version__)" 2>&1
        if ($LASTEXITCODE -eq 0 -and $transformersVersion -notmatch "Error|No module") {
            $result.TransformersVersion = $transformersVersion.Trim()
        }
    } catch {}
    
    try {
        $protobufVersion = & $venvPython -c "import google.protobuf; print(google.protobuf.__version__)" 2>&1
        if ($LASTEXITCODE -eq 0 -and $protobufVersion -notmatch "Error|No module") {
            $result.ProtobufVersion = $protobufVersion.Trim()
        }
    } catch {}
    
    try {
        $cv2Test = & $venvPython -c "import cv2; print('OK')" 2>&1
        $result.OpenCVInstalled = $cv2Test -match "OK"
    } catch {}
    
    try {
        $ffmpegTest = & $venvPython -c "import imageio_ffmpeg; print('OK')" 2>&1
        $result.ImageIOFFmpegInstalled = $ffmpegTest -match "OK"
    } catch {}
    
    if ($result.PythonVersion -and -not ($result.PythonVersion -match "^3\.10\.")) {
        $result.Issues += "Python version is $($result.PythonVersion), should be 3.10.x"
    }
    
    if ($result.TorchCuda -eq "NO_CUDA") {
        $result.Issues += "PyTorch installed without CUDA support"
    }
    
    if ($result.XformersVersion -and -not $result.XformersWorking) {
        $result.Issues += "xFormers installed but not working (CUDA mismatch)"
    }
    
    if ($result.ProtobufVersion -and $result.ProtobufVersion -match "^4\.") {
        $result.Issues += "Protobuf version $($result.ProtobufVersion) is 4.x (should be 3.x)"
    }
    
    if ($result.TransformersVersion -and $result.TransformersVersion -match "^4\.(3[7-9]|[4-9])") {
        $result.Issues += "Transformers version $($result.TransformersVersion) may cause CLIP import issues"
    }
    
    return $result
}

function Show-Banner {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "║     NEBULA COMMAND - AI ENVIRONMENT VALIDATION             ║" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "║     Pre-flight checks for Windows AI Stack                 ║" -ForegroundColor Cyan
    Write-Host "║                                                            ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

if (-not $JsonOutput) {
    Show-Banner
}

if (-not (Test-Path (Split-Path $LogFile -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $LogFile -Parent) -Force | Out-Null
}

Write-Log "Starting AI Environment Validation" "HEADER"

Write-Log "═══════════════════════════════════════" "CHECK"
Write-Log " PHASE 1: System Requirements" "CHECK"
Write-Log "═══════════════════════════════════════" "CHECK"

$pythonInfo = Get-SystemPythonInfo
$ValidationResults.Python = $pythonInfo

if ($pythonInfo.Installed) {
    Write-Log "Python: $($pythonInfo.Version) at $($pythonInfo.Path)" "SUCCESS"
    if (-not $pythonInfo.Is310) {
        Write-Log "Python version is not 3.10.x - AI tools require Python 3.10" "WARN"
        Add-Issue "Python" "System Python is $($pythonInfo.Version), AI tools require 3.10.x" "WARNING"
        Add-Recommendation "Install Python 3.10.x from python.org" "" "HIGH"
    }
} else {
    Write-Log "Python not found in PATH" "ERROR"
    Add-Issue "Python" "Python not installed or not in PATH" "ERROR"
    Add-Recommendation "Install Python 3.10.x from python.org" "" "CRITICAL"
}

Write-Log "" "INFO"
Write-Log "═══════════════════════════════════════" "CHECK"
Write-Log " PHASE 2: GPU & CUDA" "CHECK"
Write-Log "═══════════════════════════════════════" "CHECK"

$gpuInfo = Get-GPUInfo
$ValidationResults.GPU = $gpuInfo

if ($gpuInfo.HasNvidia) {
    Write-Log "GPU: $($gpuInfo.Name)" "SUCCESS"
    Write-Log "Driver: $($gpuInfo.DriverVersion)" "SUCCESS"
    Write-Log "VRAM: $($gpuInfo.VRAM_MB) MB" "SUCCESS"
    Write-Log "CUDA Driver: $($gpuInfo.CudaDriverVersion)" "SUCCESS"
    
    if ($gpuInfo.VRAM_MB -lt 4000) {
        Write-Log "VRAM is below 4GB - may limit model sizes" "WARN"
        Add-Issue "GPU" "VRAM ($($gpuInfo.VRAM_MB) MB) is below recommended 6GB" "WARNING"
    }
    
    if ($gpuInfo.CudaDriverVersion) {
        $cudaMajor = [int]($gpuInfo.CudaDriverVersion -split '\.')[0]
        if ($cudaMajor -lt 12) {
            Write-Log "CUDA driver version $($gpuInfo.CudaDriverVersion) - recommend updating to 12.x" "WARN"
        }
    }
} else {
    Write-Log "NVIDIA GPU not detected" "ERROR"
    Add-Issue "GPU" "No NVIDIA GPU detected" "CRITICAL"
    Add-Recommendation "Install NVIDIA GPU with CUDA support" "" "CRITICAL"
}

$cudaInfo = Get-CUDAToolkitInfo
$ValidationResults.CUDA = $cudaInfo

if ($cudaInfo.Installed) {
    Write-Log "CUDA Toolkit: $($cudaInfo.Version) at $($cudaInfo.Path)" "SUCCESS"
} else {
    Write-Log "CUDA Toolkit not detected (optional if using PyTorch wheels)" "WARN"
}

Write-Log "" "INFO"
Write-Log "═══════════════════════════════════════" "CHECK"
Write-Log " PHASE 3: Stable Diffusion WebUI" "CHECK"
Write-Log "═══════════════════════════════════════" "CHECK"

if (Test-Path $SDPath) {
    Write-Log "SD WebUI found at: $SDPath" "SUCCESS"
    $sdVenv = Test-PythonVenv -BasePath $SDPath -Component "StableDiffusion"
    $ValidationResults.StableDiffusion = $sdVenv
    
    if ($sdVenv.Exists) {
        Write-Log "  Python: $($sdVenv.PythonVersion)" "INFO"
        Write-Log "  PyTorch: $($sdVenv.TorchVersion) (CUDA: $($sdVenv.TorchCuda))" "INFO"
        Write-Log "  xFormers: $(if ($sdVenv.XformersVersion) { "$($sdVenv.XformersVersion) $(if ($sdVenv.XformersWorking) { '(Working)' } else { '(BROKEN)' })" } else { 'Not installed' })" "INFO"
        Write-Log "  Transformers: $($sdVenv.TransformersVersion)" "INFO"
        Write-Log "  Protobuf: $($sdVenv.ProtobufVersion)" "INFO"
        
        foreach ($issue in $sdVenv.Issues) {
            Write-Log "  ISSUE: $issue" "ERROR"
            Add-Issue "StableDiffusion" $issue "ERROR"
        }
        
        if ($sdVenv.TorchCuda -eq "NO_CUDA") {
            Add-Recommendation "Reinstall PyTorch with CUDA support" "Fix-StableDiffusion-Complete.ps1" "HIGH"
        }
        
        if ($sdVenv.XformersVersion -and -not $sdVenv.XformersWorking) {
            Add-Recommendation "Reinstall xFormers matching PyTorch version" "Fix-StableDiffusion-Complete.ps1" "HIGH"
        }
        
        if ($sdVenv.ProtobufVersion -match "^4\.") {
            Add-Recommendation "Downgrade protobuf to 3.20.x" "Fix-StableDiffusion-Complete.ps1" "HIGH"
        }
    } else {
        Write-Log "  venv not found - run webui.bat first" "WARN"
        Add-Issue "StableDiffusion" "Virtual environment not created" "WARNING"
        Add-Recommendation "Run webui.bat to create venv, then run repair script" "" "MEDIUM"
    }
} else {
    Write-Log "SD WebUI not found at $SDPath" "WARN"
    $ValidationResults.StableDiffusion.Installed = $false
}

Write-Log "" "INFO"
Write-Log "═══════════════════════════════════════" "CHECK"
Write-Log " PHASE 4: ComfyUI" "CHECK"
Write-Log "═══════════════════════════════════════" "CHECK"

if (Test-Path $ComfyUIPath) {
    Write-Log "ComfyUI found at: $ComfyUIPath" "SUCCESS"
    $comfyVenv = Test-PythonVenv -BasePath $ComfyUIPath -Component "ComfyUI"
    $ValidationResults.ComfyUI = $comfyVenv
    
    if ($comfyVenv.Exists) {
        Write-Log "  Python: $($comfyVenv.PythonVersion)" "INFO"
        Write-Log "  PyTorch: $($comfyVenv.TorchVersion) (CUDA: $($comfyVenv.TorchCuda))" "INFO"
        Write-Log "  OpenCV: $(if ($comfyVenv.OpenCVInstalled) { 'Installed' } else { 'NOT INSTALLED' })" $(if ($comfyVenv.OpenCVInstalled) { "INFO" } else { "ERROR" })
        Write-Log "  imageio-ffmpeg: $(if ($comfyVenv.ImageIOFFmpegInstalled) { 'Installed' } else { 'NOT INSTALLED' })" $(if ($comfyVenv.ImageIOFFmpegInstalled) { "INFO" } else { "ERROR" })
        
        if (-not $comfyVenv.OpenCVInstalled) {
            Add-Issue "ComfyUI" "OpenCV (cv2) not installed" "ERROR"
            Add-Recommendation "Install opencv-python in ComfyUI venv" "Fix-ComfyUI-Complete.ps1" "HIGH"
        }
        
        if (-not $comfyVenv.ImageIOFFmpegInstalled) {
            Add-Issue "ComfyUI" "imageio-ffmpeg not installed (video nodes broken)" "ERROR"
            Add-Recommendation "Install imageio-ffmpeg and system ffmpeg" "Fix-ComfyUI-Complete.ps1" "HIGH"
        }
        
        foreach ($issue in $comfyVenv.Issues) {
            Write-Log "  ISSUE: $issue" "ERROR"
            Add-Issue "ComfyUI" $issue "ERROR"
        }
    } else {
        Write-Log "  venv not found - install ComfyUI first" "WARN"
        Add-Issue "ComfyUI" "Virtual environment not created" "WARNING"
    }
} else {
    Write-Log "ComfyUI not found at $ComfyUIPath" "WARN"
    $ValidationResults.ComfyUI.Installed = $false
}

Write-Log "" "INFO"
Write-Log "═══════════════════════════════════════" "CHECK"
Write-Log " PHASE 5: System Tools" "CHECK"
Write-Log "═══════════════════════════════════════" "CHECK"

$ffmpegInstalled = $false
try {
    $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($ffmpeg) {
        $ffmpegVersion = (& ffmpeg -version 2>&1 | Select-Object -First 1)
        Write-Log "FFmpeg: $ffmpegVersion" "SUCCESS"
        $ffmpegInstalled = $true
    }
} catch {}

if (-not $ffmpegInstalled) {
    Write-Log "FFmpeg: NOT INSTALLED" "ERROR"
    Add-Issue "System" "FFmpeg not installed or not in PATH" "ERROR"
    Add-Recommendation "Install FFmpeg to system PATH" "Install-FFmpeg.ps1" "HIGH"
}

$gitInstalled = $false
try {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        Write-Log "Git: Installed" "SUCCESS"
        $gitInstalled = $true
    }
} catch {}

if (-not $gitInstalled) {
    Write-Log "Git: NOT INSTALLED" "WARN"
    Add-Issue "System" "Git not installed" "WARNING"
}

$criticalIssues = ($ValidationResults.Issues | Where-Object { $_.Severity -eq "ERROR" -or $_.Severity -eq "CRITICAL" }).Count
$warningIssues = ($ValidationResults.Issues | Where-Object { $_.Severity -eq "WARNING" }).Count

if ($criticalIssues -eq 0 -and $warningIssues -eq 0) {
    $ValidationResults.OverallStatus = "HEALTHY"
} elseif ($criticalIssues -eq 0) {
    $ValidationResults.OverallStatus = "WARNINGS"
} else {
    $ValidationResults.OverallStatus = "NEEDS_REPAIR"
}

Write-Log "" "INFO"
Write-Log "════════════════════════════════════════════════════════════" "HEADER"
Write-Log " VALIDATION SUMMARY" "HEADER"
Write-Log "════════════════════════════════════════════════════════════" "HEADER"

$statusColor = switch ($ValidationResults.OverallStatus) {
    "HEALTHY" { "Green" }
    "WARNINGS" { "Yellow" }
    default { "Red" }
}

Write-Host ""
Write-Host "Overall Status: $($ValidationResults.OverallStatus)" -ForegroundColor $statusColor
Write-Host "Critical Issues: $criticalIssues" -ForegroundColor $(if ($criticalIssues -gt 0) { "Red" } else { "Green" })
Write-Host "Warnings: $warningIssues" -ForegroundColor $(if ($warningIssues -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

if ($ValidationResults.Issues.Count -gt 0) {
    Write-Host "Issues Found:" -ForegroundColor Cyan
    foreach ($issue in $ValidationResults.Issues) {
        $color = switch ($issue.Severity) { "CRITICAL" { "Red" } "ERROR" { "Red" } "WARNING" { "Yellow" } default { "White" } }
        Write-Host "  [$($issue.Severity)] $($issue.Component): $($issue.Issue)" -ForegroundColor $color
    }
    Write-Host ""
}

if ($ValidationResults.Recommendations.Count -gt 0) {
    Write-Host "Recommended Actions:" -ForegroundColor Cyan
    foreach ($rec in $ValidationResults.Recommendations) {
        $scriptInfo = if ($rec.Script) { " (Run: $($rec.Script))" } else { "" }
        Write-Host "  [$($rec.Priority)] $($rec.Action)$scriptInfo" -ForegroundColor White
    }
    Write-Host ""
}

if ($JsonOutput) {
    $ValidationResults | ConvertTo-Json -Depth 10
}

Write-Log "Validation complete. Log saved to: $LogFile"

if ($ValidationResults.OverallStatus -eq "NEEDS_REPAIR") {
    Write-Host "Run Repair-AIStack-Master.ps1 to fix detected issues" -ForegroundColor Yellow
    exit 1
} elseif ($ValidationResults.OverallStatus -eq "WARNINGS") {
    exit 0
} else {
    Write-Host "Environment is healthy and ready for AI workloads!" -ForegroundColor Green
    exit 0
}
