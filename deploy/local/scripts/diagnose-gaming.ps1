# Gaming Diagnostics Script for Windows VM
# Checks common issues that cause game freezing and streaming problems
# Returns JSON for API consumption

param(
    [switch]$Json,
    [switch]$Fix
)

$diagnostics = @{
    timestamp = (Get-Date).ToString("o")
    hostname = $env:COMPUTERNAME
    issues = @()
    warnings = @()
    checks = @{}
    fixes_applied = @()
}

function Add-Issue {
    param([string]$Message, [string]$Fix = "")
    $diagnostics.issues += @{ message = $Message; fix = $Fix }
}

function Add-Warning {
    param([string]$Message)
    $diagnostics.warnings += @{ message = $Message }
}

# 1. Check Hardware-Accelerated GPU Scheduling (HAGS)
Write-Host "Checking Hardware-Accelerated GPU Scheduling..." -ForegroundColor Cyan
try {
    $hags = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name "HwSchMode" -ErrorAction SilentlyContinue
    $hagsEnabled = $hags.HwSchMode -eq 2
    $diagnostics.checks.hags = @{ enabled = $hagsEnabled; value = $hags.HwSchMode }
    
    if ($hagsEnabled) {
        Add-Issue "Hardware-Accelerated GPU Scheduling (HAGS) is ENABLED - can cause streaming issues" "Disable in Settings > System > Display > Graphics > Change default graphics settings"
        
        if ($Fix) {
            Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name "HwSchMode" -Value 1
            $diagnostics.fixes_applied += "Disabled HAGS (requires reboot)"
        }
    }
} catch {
    $diagnostics.checks.hags = @{ error = $_.Exception.Message }
}

# 2. Check Xbox Game Bar / Game DVR
Write-Host "Checking Xbox Game Bar..." -ForegroundColor Cyan
try {
    $gameDvr = Get-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -ErrorAction SilentlyContinue
    $gameBar = Get-ItemProperty -Path "HKCU:\System\GameConfigStore" -ErrorAction SilentlyContinue
    
    $gameDvrEnabled = ($gameDvr.AppCaptureEnabled -eq 1) -or ($gameDvr.GameDVR_Enabled -eq 1)
    $gameBarEnabled = $gameBar.GameDVR_Enabled -eq 1
    
    $diagnostics.checks.game_bar = @{ 
        game_dvr_enabled = $gameDvrEnabled
        game_bar_enabled = $gameBarEnabled 
    }
    
    if ($gameDvrEnabled -or $gameBarEnabled) {
        Add-Issue "Xbox Game Bar/DVR is enabled - can interfere with streaming" "Disable in Settings > Gaming > Xbox Game Bar"
        
        if ($Fix) {
            Set-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -Name "AppCaptureEnabled" -Value 0 -ErrorAction SilentlyContinue
            Set-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -Name "GameDVR_Enabled" -Value 0 -ErrorAction SilentlyContinue
            Set-ItemProperty -Path "HKCU:\System\GameConfigStore" -Name "GameDVR_Enabled" -Value 0 -ErrorAction SilentlyContinue
            $diagnostics.fixes_applied += "Disabled Xbox Game Bar/DVR"
        }
    }
} catch {
    $diagnostics.checks.game_bar = @{ error = $_.Exception.Message }
}

# 3. Check NVIDIA Driver
Write-Host "Checking NVIDIA Driver..." -ForegroundColor Cyan
try {
    $nvidiaSmi = & "nvidia-smi" --query-gpu=driver_version,name,memory.total,temperature.gpu --format=csv,noheader 2>&1
    if ($LASTEXITCODE -eq 0) {
        $parts = $nvidiaSmi -split ","
        $driverVersion = $parts[0].Trim()
        $gpuName = $parts[1].Trim()
        $vram = $parts[2].Trim()
        $temp = $parts[3].Trim()
        
        $diagnostics.checks.nvidia = @{
            driver_version = $driverVersion
            gpu_name = $gpuName
            vram = $vram
            temperature = $temp
            available = $true
        }
        
        # Check if using Studio Driver (recommended)
        $driverInfo = Get-WmiObject Win32_PnPSignedDriver | Where-Object { $_.DeviceName -like "*NVIDIA*" -and $_.DeviceName -like "*GeForce*" } | Select-Object -First 1
        if ($driverInfo -and $driverInfo.DriverVersion) {
            Add-Warning "Consider using NVIDIA Studio Driver instead of Game Ready Driver for better stability"
        }
    } else {
        $diagnostics.checks.nvidia = @{ available = $false; error = "nvidia-smi failed" }
        Add-Issue "NVIDIA driver not responding" "Reinstall NVIDIA drivers"
    }
} catch {
    $diagnostics.checks.nvidia = @{ available = $false; error = $_.Exception.Message }
}

# 4. Check NVENC encoder
Write-Host "Checking NVENC encoder..." -ForegroundColor Cyan
try {
    $nvencStats = & "nvidia-smi" --query-gpu=encoder.stats.sessionCount,encoder.stats.averageFps,encoder.stats.averageLatency --format=csv,noheader 2>&1
    if ($LASTEXITCODE -eq 0) {
        $parts = $nvencStats -split ","
        $diagnostics.checks.nvenc = @{
            available = $true
            session_count = $parts[0].Trim()
            average_fps = $parts[1].Trim()
            average_latency = $parts[2].Trim()
        }
    }
} catch {
    $diagnostics.checks.nvenc = @{ available = $false; error = $_.Exception.Message }
}

# 5. Check Sunshine status
Write-Host "Checking Sunshine..." -ForegroundColor Cyan
try {
    $sunshineProcess = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
    $sunshineService = Get-Service -Name "Sunshine*" -ErrorAction SilentlyContinue
    
    $diagnostics.checks.sunshine = @{
        process_running = $null -ne $sunshineProcess
        process_id = if ($sunshineProcess) { $sunshineProcess.Id } else { $null }
        service_name = if ($sunshineService) { $sunshineService.Name } else { $null }
        service_status = if ($sunshineService) { $sunshineService.Status.ToString() } else { "NotInstalled" }
    }
    
    if (-not $sunshineProcess) {
        Add-Issue "Sunshine is not running" "Start Sunshine from system tray or restart service"
    }
} catch {
    $diagnostics.checks.sunshine = @{ error = $_.Exception.Message }
}

# 6. Check Power Plan
Write-Host "Checking Power Plan..." -ForegroundColor Cyan
try {
    $powerPlan = powercfg /getactivescheme
    $isHighPerformance = $powerPlan -match "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
    $diagnostics.checks.power_plan = @{
        current = $powerPlan
        is_high_performance = $isHighPerformance
    }
    
    if (-not $isHighPerformance) {
        Add-Warning "Not using High Performance power plan - may cause throttling"
        
        if ($Fix) {
            powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
            $diagnostics.fixes_applied += "Set High Performance power plan"
        }
    }
} catch {
    $diagnostics.checks.power_plan = @{ error = $_.Exception.Message }
}

# 7. Check Firewall Rules
Write-Host "Checking Firewall..." -ForegroundColor Cyan
try {
    $sunshineRules = Get-NetFirewallRule -DisplayName "Sunshine*" -ErrorAction SilentlyContinue
    $diagnostics.checks.firewall = @{
        sunshine_rules_count = if ($sunshineRules) { @($sunshineRules).Count } else { 0 }
        rules = @()
    }
    
    if (-not $sunshineRules -or @($sunshineRules).Count -lt 2) {
        Add-Warning "Sunshine firewall rules may be missing - streaming may not work remotely"
    }
} catch {
    $diagnostics.checks.firewall = @{ error = $_.Exception.Message }
}

# 8. Check for common problematic apps
Write-Host "Checking for conflicting applications..." -ForegroundColor Cyan
$conflictingApps = @("OBS64", "GeForceExperience", "NvContainer", "GameBar")
$runningConflicts = @()

foreach ($app in $conflictingApps) {
    $proc = Get-Process -Name $app -ErrorAction SilentlyContinue
    if ($proc) {
        $runningConflicts += $app
    }
}

$diagnostics.checks.conflicting_apps = @{
    running = $runningConflicts
}

if ($runningConflicts.Count -gt 0) {
    Add-Warning "Potentially conflicting apps running: $($runningConflicts -join ', ')"
}

# Summary
$diagnostics.summary = @{
    total_issues = $diagnostics.issues.Count
    total_warnings = $diagnostics.warnings.Count
    fixes_applied = $diagnostics.fixes_applied.Count
    needs_reboot = $diagnostics.fixes_applied -match "reboot"
}

# Output
if ($Json) {
    $diagnostics | ConvertTo-Json -Depth 10
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Gaming Diagnostics Summary" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    if ($diagnostics.issues.Count -eq 0 -and $diagnostics.warnings.Count -eq 0) {
        Write-Host "[OK] No issues detected!" -ForegroundColor Green
    }
    
    if ($diagnostics.issues.Count -gt 0) {
        Write-Host "ISSUES ($($diagnostics.issues.Count)):" -ForegroundColor Red
        foreach ($issue in $diagnostics.issues) {
            Write-Host "  - $($issue.message)" -ForegroundColor Red
            if ($issue.fix) {
                Write-Host "    Fix: $($issue.fix)" -ForegroundColor Yellow
            }
        }
        Write-Host ""
    }
    
    if ($diagnostics.warnings.Count -gt 0) {
        Write-Host "WARNINGS ($($diagnostics.warnings.Count)):" -ForegroundColor Yellow
        foreach ($warn in $diagnostics.warnings) {
            Write-Host "  - $($warn.message)" -ForegroundColor Yellow
        }
        Write-Host ""
    }
    
    if ($diagnostics.fixes_applied.Count -gt 0) {
        Write-Host "FIXES APPLIED:" -ForegroundColor Green
        foreach ($fix in $diagnostics.fixes_applied) {
            Write-Host "  - $fix" -ForegroundColor Green
        }
        Write-Host ""
    }
    
    Write-Host "GPU: $($diagnostics.checks.nvidia.gpu_name)" -ForegroundColor Gray
    Write-Host "Driver: $($diagnostics.checks.nvidia.driver_version)" -ForegroundColor Gray
    Write-Host "Temp: $($diagnostics.checks.nvidia.temperature)C" -ForegroundColor Gray
    Write-Host "Sunshine: $($diagnostics.checks.sunshine.service_status)" -ForegroundColor Gray
    Write-Host ""
    
    if ($diagnostics.summary.needs_reboot) {
        Write-Host "[!] Reboot required for changes to take effect" -ForegroundColor Yellow
    }
}
