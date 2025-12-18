# Install Sunshine Watchdog as a Scheduled Task
# Run as Administrator

$ErrorActionPreference = "Stop"

$scriptPath = "$PSScriptRoot\sunshine-watchdog.ps1"
$taskName = "SunshineWatchdog"

Write-Host "Installing Sunshine Watchdog..." -ForegroundColor Cyan

# Check if script exists
if (-not (Test-Path $scriptPath)) {
    Write-Host "[ERROR] Watchdog script not found: $scriptPath" -ForegroundColor Red
    exit 1
}

# Remove existing task if present
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing scheduled task..."
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create the scheduled task
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Monitors Sunshine and automatically restarts it when it crashes"

# Start the task immediately
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "[SUCCESS] Sunshine Watchdog installed and started!" -ForegroundColor Green
Write-Host ""
Write-Host "The watchdog will:" -ForegroundColor Yellow
Write-Host "  - Check Sunshine every 30 seconds"
Write-Host "  - Automatically restart if crashed"
Write-Host "  - Log to C:\ProgramData\Sunshine\watchdog.log"
Write-Host ""
Write-Host "Commands:" -ForegroundColor Cyan
Write-Host "  View logs:    Get-Content C:\ProgramData\Sunshine\watchdog.log -Tail 50"
Write-Host "  Stop:         Stop-ScheduledTask -TaskName $taskName"
Write-Host "  Start:        Start-ScheduledTask -TaskName $taskName"
Write-Host "  Uninstall:    Unregister-ScheduledTask -TaskName $taskName -Confirm:`$false"
