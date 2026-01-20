# Nebula Command - AI Stack Master Repair Orchestrator
# Runs complete diagnostics and repairs for Windows AI Stack
# Run as Administrator

param(
    [string]$SDPath = "C:\AI\stable-diffusion-webui",
    [string]$ComfyUIPath = "C:\AI\ComfyUI",
    [string]$FFmpegPath = "C:\ffmpeg",
    [switch]$SkipValidation,
    [switch]$SkipSD,
    [switch]$SkipComfyUI,
    [switch]$SkipFFmpeg,
    [switch]$Force,
    [switch]$CreateFreshVenvs,
    [switch]$FullTest,
    [switch]$Unattended
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogFile = "C:\ProgramData\NebulaCommand\logs\master-repair-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$RepairResults = @{
    StartTime = Get-Date
    Validation = @{ Status = "PENDING"; Issues = @(); Duration = 0 }
    FFmpeg = @{ Status = "SKIPPED"; Duration = 0 }
    StableDiffusion = @{ Status = "SKIPPED"; Duration = 0 }
    ComfyUI = @{ Status = "SKIPPED"; Duration = 0 }
    FinalTest = @{ Status = "PENDING"; Results = @(); Duration = 0 }
    OverallStatus = "PENDING"
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
        "PHASE" { "Magenta" }
        default { "White" } 
    })
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
}

function Test-AdminPrivileges {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-ScriptWithLogging {
    param(
        [string]$ScriptPath,
        [hashtable]$Parameters = @{},
        [string]$ComponentName
    )
    
    if (-not (Test-Path $ScriptPath)) {
        Write-Log "Script not found: $ScriptPath" "ERROR"
        return @{ Success = $false; ExitCode = -1 }
    }
    
    $startTime = Get-Date
    Write-Log "Executing: $ScriptPath"
    
    try {
        $argList = @()
        foreach ($key in $Parameters.Keys) {
            if ($Parameters[$key] -is [switch] -and $Parameters[$key]) {
                $argList += "-$key"
            } elseif ($Parameters[$key] -isnot [switch]) {
                $argList += "-$key"
                $argList += $Parameters[$key]
            }
        }
        
        & $ScriptPath @argList
        $exitCode = $LASTEXITCODE
        
        $duration = (Get-Date) - $startTime
        
        return @{ 
            Success = ($exitCode -eq 0)
            ExitCode = $exitCode
            Duration = $duration.TotalSeconds
        }
    } catch {
        Write-Log "Script execution error: $_" "ERROR"
        return @{ Success = $false; ExitCode = -1; Duration = 0 }
    }
}

function Show-MasterBanner {
    Clear-Host
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                                            ║" -ForegroundColor Cyan
    Write-Host "║     ███╗   ██╗███████╗██████╗ ██╗   ██╗██╗      █████╗                      ║" -ForegroundColor Cyan
    Write-Host "║     ████╗  ██║██╔════╝██╔══██╗██║   ██║██║     ██╔══██╗                     ║" -ForegroundColor Cyan
    Write-Host "║     ██╔██╗ ██║█████╗  ██████╔╝██║   ██║██║     ███████║                     ║" -ForegroundColor Cyan
    Write-Host "║     ██║╚██╗██║██╔══╝  ██╔══██╗██║   ██║██║     ██╔══██║                     ║" -ForegroundColor Cyan
    Write-Host "║     ██║ ╚████║███████╗██████╔╝╚██████╔╝███████╗██║  ██║                     ║" -ForegroundColor Cyan
    Write-Host "║     ╚═╝  ╚═══╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝                     ║" -ForegroundColor Cyan
    Write-Host "║                                                                            ║" -ForegroundColor Cyan
    Write-Host "║              WINDOWS AI STACK - MASTER REPAIR UTILITY                      ║" -ForegroundColor Cyan
    Write-Host "║                                                                            ║" -ForegroundColor Cyan
    Write-Host "║     Comprehensive repair for:                                              ║" -ForegroundColor Cyan
    Write-Host "║       • Stable Diffusion WebUI (CLIP, protobuf, xFormers, CUDA)            ║" -ForegroundColor Cyan
    Write-Host "║       • ComfyUI (OpenCV, imageio_ffmpeg, video nodes)                      ║" -ForegroundColor Cyan
    Write-Host "║       • System dependencies (FFmpeg, Python, CUDA)                         ║" -ForegroundColor Cyan
    Write-Host "║                                                                            ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Show-PhaseHeader {
    param([int]$PhaseNum, [int]$TotalPhases, [string]$PhaseName)
    
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host "║  PHASE $PhaseNum/$TotalPhases`: $($PhaseName.PadRight(47))║" -ForegroundColor Magenta
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
    Write-Host ""
}

function Show-FinalSummary {
    param($Results)
    
    $endTime = Get-Date
    $totalDuration = ($endTime - $Results.StartTime).TotalMinutes
    
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                              REPAIR SUMMARY                                ║" -ForegroundColor Cyan
    Write-Host "╠════════════════════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    
    $components = @(
        @{ Name = "Environment Validation"; Key = "Validation" },
        @{ Name = "FFmpeg Installation"; Key = "FFmpeg" },
        @{ Name = "Stable Diffusion Repair"; Key = "StableDiffusion" },
        @{ Name = "ComfyUI Repair"; Key = "ComfyUI" },
        @{ Name = "Final Verification"; Key = "FinalTest" }
    )
    
    foreach ($comp in $components) {
        $status = $Results[$comp.Key].Status
        $duration = if ($Results[$comp.Key].Duration -gt 0) { 
            " ({0:N1}s)" -f $Results[$comp.Key].Duration 
        } else { "" }
        
        $color = switch ($status) {
            "SUCCESS" { "Green" }
            "PARTIAL" { "Yellow" }
            "SKIPPED" { "Gray" }
            "PENDING" { "Gray" }
            default { "Red" }
        }
        
        $icon = switch ($status) {
            "SUCCESS" { "✓" }
            "PARTIAL" { "~" }
            "SKIPPED" { "-" }
            "PENDING" { "?" }
            default { "✗" }
        }
        
        $line = "║  $icon $($comp.Name.PadRight(30)) $($status.PadRight(10))$($duration.PadRight(10))       ║"
        Write-Host $line -ForegroundColor $color
    }
    
    Write-Host "╠════════════════════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    
    $overallColor = switch ($Results.OverallStatus) {
        "SUCCESS" { "Green" }
        "PARTIAL" { "Yellow" }
        default { "Red" }
    }
    
    Write-Host "║                                                                            ║" -ForegroundColor Cyan
    Write-Host "║  OVERALL STATUS: $($Results.OverallStatus.PadRight(20)) Total Time: $("{0:N1}" -f $totalDuration) minutes       ║" -ForegroundColor $overallColor
    Write-Host "║                                                                            ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
}

Show-MasterBanner

if (-not (Test-Path (Split-Path $LogFile -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $LogFile -Parent) -Force | Out-Null
}

Write-Log "═══════════════════════════════════════════════════════════════" "HEADER"
Write-Log " NEBULA COMMAND - MASTER AI STACK REPAIR" "HEADER"
Write-Log "═══════════════════════════════════════════════════════════════" "HEADER"
Write-Log "Start Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Log "SD Path: $SDPath"
Write-Log "ComfyUI Path: $ComfyUIPath"

if (-not (Test-AdminPrivileges)) {
    Write-Log "WARNING: Not running as Administrator. Some repairs may fail." "WARN"
    Write-Host ""
    Write-Host "⚠ Not running as Administrator. Some operations may fail." -ForegroundColor Yellow
    Write-Host "  Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    
    if (-not $Unattended) {
        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            exit 1
        }
    }
}

$totalPhases = 5
$currentPhase = 0

if (-not $SkipValidation) {
    $currentPhase++
    Show-PhaseHeader -PhaseNum $currentPhase -TotalPhases $totalPhases -PhaseName "Environment Validation"
    
    $validationScript = Join-Path $ScriptDir "Validate-AIEnvironment.ps1"
    $startTime = Get-Date
    
    if (Test-Path $validationScript) {
        $validationResult = Invoke-ScriptWithLogging -ScriptPath $validationScript -Parameters @{
            SDPath = $SDPath
            ComfyUIPath = $ComfyUIPath
        } -ComponentName "Validation"
        
        $RepairResults.Validation.Status = if ($validationResult.Success) { "SUCCESS" } else { "ISSUES_FOUND" }
        $RepairResults.Validation.Duration = $validationResult.Duration
    } else {
        Write-Log "Validation script not found - continuing with repairs" "WARN"
        $RepairResults.Validation.Status = "SKIPPED"
    }
} else {
    $RepairResults.Validation.Status = "SKIPPED"
}

if (-not $SkipFFmpeg) {
    $currentPhase++
    Show-PhaseHeader -PhaseNum $currentPhase -TotalPhases $totalPhases -PhaseName "FFmpeg Installation"
    
    $ffmpegScript = Join-Path $ScriptDir "Install-FFmpeg.ps1"
    
    if (Test-Path $ffmpegScript) {
        $params = @{ InstallPath = $FFmpegPath }
        if ($Force) { $params.Force = $true }
        
        $ffmpegResult = Invoke-ScriptWithLogging -ScriptPath $ffmpegScript -Parameters $params -ComponentName "FFmpeg"
        $RepairResults.FFmpeg.Status = if ($ffmpegResult.Success) { "SUCCESS" } else { "FAILED" }
        $RepairResults.FFmpeg.Duration = $ffmpegResult.Duration
    } else {
        Write-Log "FFmpeg script not found" "ERROR"
        $RepairResults.FFmpeg.Status = "NOT_FOUND"
    }
} else {
    Write-Log "Skipping FFmpeg (--SkipFFmpeg)"
}

if (-not $SkipSD) {
    $currentPhase++
    Show-PhaseHeader -PhaseNum $currentPhase -TotalPhases $totalPhases -PhaseName "Stable Diffusion Repair"
    
    if (-not (Test-Path $SDPath)) {
        Write-Log "Stable Diffusion not found at $SDPath - skipping" "WARN"
        $RepairResults.StableDiffusion.Status = "NOT_FOUND"
    } else {
        $sdScript = Join-Path $ScriptDir "Fix-StableDiffusion-Complete.ps1"
        
        if (Test-Path $sdScript) {
            $params = @{ SDPath = $SDPath }
            if ($Force) { $params.Force = $true }
            if ($CreateFreshVenvs) { $params.CreateFreshVenv = $true; $params.BackupFirst = $true }
            
            $sdResult = Invoke-ScriptWithLogging -ScriptPath $sdScript -Parameters $params -ComponentName "StableDiffusion"
            $RepairResults.StableDiffusion.Status = if ($sdResult.Success) { "SUCCESS" } elseif ($sdResult.ExitCode -eq 0) { "PARTIAL" } else { "FAILED" }
            $RepairResults.StableDiffusion.Duration = $sdResult.Duration
        } else {
            Write-Log "SD repair script not found" "ERROR"
            $RepairResults.StableDiffusion.Status = "NOT_FOUND"
        }
    }
} else {
    Write-Log "Skipping Stable Diffusion (--SkipSD)"
}

if (-not $SkipComfyUI) {
    $currentPhase++
    Show-PhaseHeader -PhaseNum $currentPhase -TotalPhases $totalPhases -PhaseName "ComfyUI Repair"
    
    if (-not (Test-Path $ComfyUIPath)) {
        Write-Log "ComfyUI not found at $ComfyUIPath - skipping" "WARN"
        $RepairResults.ComfyUI.Status = "NOT_FOUND"
    } else {
        $comfyScript = Join-Path $ScriptDir "Fix-ComfyUI-Complete.ps1"
        
        if (Test-Path $comfyScript) {
            $params = @{ 
                ComfyUIPath = $ComfyUIPath
                FFmpegPath = $FFmpegPath
                InstallFFmpeg = $true
            }
            if ($Force) { $params.Force = $true }
            
            $comfyResult = Invoke-ScriptWithLogging -ScriptPath $comfyScript -Parameters $params -ComponentName "ComfyUI"
            $RepairResults.ComfyUI.Status = if ($comfyResult.Success) { "SUCCESS" } elseif ($comfyResult.ExitCode -eq 0) { "PARTIAL" } else { "FAILED" }
            $RepairResults.ComfyUI.Duration = $comfyResult.Duration
        } else {
            Write-Log "ComfyUI repair script not found" "ERROR"
            $RepairResults.ComfyUI.Status = "NOT_FOUND"
        }
    }
} else {
    Write-Log "Skipping ComfyUI (--SkipComfyUI)"
}

$currentPhase++
Show-PhaseHeader -PhaseNum $currentPhase -TotalPhases $totalPhases -PhaseName "Final Verification"

$startTime = Get-Date
$testResults = @()

$ffmpegTest = Get-Command ffmpeg -ErrorAction SilentlyContinue
$testResults += @{
    Component = "FFmpeg"
    Status = if ($ffmpegTest) { "PASS" } else { "FAIL" }
}

if (Test-Path $SDPath) {
    $sdPython = Join-Path $SDPath "venv\Scripts\python.exe"
    if (Test-Path $sdPython) {
        $torchTest = & $sdPython -c "import torch; print('OK' if torch.cuda.is_available() else 'NO_CUDA')" 2>&1
        $clipTest = & $sdPython -c "from transformers.models.clip.modeling_clip import CLIPTextModel; print('OK')" 2>&1
        $xformersTest = & $sdPython -c "import xformers.ops; print('OK')" 2>&1
        
        $testResults += @{
            Component = "SD-PyTorch"
            Status = if ($torchTest -match "OK") { "PASS" } else { "FAIL" }
        }
        $testResults += @{
            Component = "SD-CLIP"
            Status = if ($clipTest -match "OK") { "PASS" } else { "FAIL" }
        }
        $testResults += @{
            Component = "SD-xFormers"
            Status = if ($xformersTest -match "OK") { "PASS" } else { "FAIL" }
        }
    }
}

if (Test-Path $ComfyUIPath) {
    $comfyPython = Join-Path $ComfyUIPath "venv\Scripts\python.exe"
    if (-not (Test-Path $comfyPython)) {
        $comfyPython = Join-Path $ComfyUIPath "python_embeded\python.exe"
    }
    
    if (Test-Path $comfyPython) {
        $cv2Test = & $comfyPython -c "import cv2; print('OK')" 2>&1
        $imageioTest = & $comfyPython -c "import imageio_ffmpeg; print('OK')" 2>&1
        
        $testResults += @{
            Component = "ComfyUI-OpenCV"
            Status = if ($cv2Test -match "OK") { "PASS" } else { "FAIL" }
        }
        $testResults += @{
            Component = "ComfyUI-imageio"
            Status = if ($imageioTest -match "OK") { "PASS" } else { "FAIL" }
        }
    }
}

$RepairResults.FinalTest.Duration = ((Get-Date) - $startTime).TotalSeconds
$RepairResults.FinalTest.Results = $testResults

Write-Host ""
Write-Host "Test Results:" -ForegroundColor Cyan
foreach ($test in $testResults) {
    $color = if ($test.Status -eq "PASS") { "Green" } else { "Red" }
    $icon = if ($test.Status -eq "PASS") { "✓" } else { "✗" }
    Write-Host "  $icon $($test.Component): $($test.Status)" -ForegroundColor $color
}

$passedTests = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$totalTests = $testResults.Count

if ($passedTests -eq $totalTests) {
    $RepairResults.FinalTest.Status = "SUCCESS"
} elseif ($passedTests -gt 0) {
    $RepairResults.FinalTest.Status = "PARTIAL"
} else {
    $RepairResults.FinalTest.Status = "FAILED"
}

$successCount = @($RepairResults.Values | Where-Object { $_.Status -eq "SUCCESS" }).Count
$failCount = @($RepairResults.Values | Where-Object { $_.Status -eq "FAILED" }).Count

if ($failCount -eq 0 -and $RepairResults.FinalTest.Status -eq "SUCCESS") {
    $RepairResults.OverallStatus = "SUCCESS"
} elseif ($successCount -gt 0 -or $RepairResults.FinalTest.Status -eq "PARTIAL") {
    $RepairResults.OverallStatus = "PARTIAL"
} else {
    $RepairResults.OverallStatus = "FAILED"
}

Show-FinalSummary -Results $RepairResults

Write-Host ""
Write-Log "Master repair completed. Log saved to: $LogFile"

if ($RepairResults.OverallStatus -eq "SUCCESS") {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host " ALL REPAIRS COMPLETED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Restart your terminal for PATH changes to take effect" -ForegroundColor White
    Write-Host "  2. Start Stable Diffusion: cd $SDPath && .\webui-user.bat" -ForegroundColor White
    Write-Host "  3. Start ComfyUI: cd $ComfyUIPath && .\run_nvidia_gpu.bat" -ForegroundColor White
    Write-Host ""
    exit 0
} elseif ($RepairResults.OverallStatus -eq "PARTIAL") {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host " REPAIRS PARTIALLY COMPLETED" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Some components may still have issues." -ForegroundColor Yellow
    Write-Host "Review the log file for details: $LogFile" -ForegroundColor White
    Write-Host ""
    Write-Host "You can re-run individual repair scripts:" -ForegroundColor Cyan
    Write-Host "  .\Fix-StableDiffusion-Complete.ps1 -Force" -ForegroundColor White
    Write-Host "  .\Fix-ComfyUI-Complete.ps1 -Force" -ForegroundColor White
    Write-Host ""
    exit 0
} else {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host " REPAIRS FAILED" -ForegroundColor Red
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check:" -ForegroundColor Yellow
    Write-Host "  1. Run as Administrator" -ForegroundColor White
    Write-Host "  2. Ensure NVIDIA drivers are installed" -ForegroundColor White
    Write-Host "  3. Verify Python 3.10 is installed" -ForegroundColor White
    Write-Host "  4. Check the log file: $LogFile" -ForegroundColor White
    Write-Host ""
    exit 1
}
