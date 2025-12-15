# Disable HDR and Auto HDR on Windows
# Run as Administrator

$ErrorActionPreference = "Stop"

Write-Host "=== Disabling HDR and Auto HDR ===" -ForegroundColor Cyan

Write-Host "Disabling Auto HDR in GraphicsDrivers..." -ForegroundColor Yellow
$GraphicsPath = "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers"
if (-not (Test-Path $GraphicsPath)) {
    New-Item -Path $GraphicsPath -Force | Out-Null
}
Set-ItemProperty -Path $GraphicsPath -Name "AutoHDREnabled" -Value 0 -Type DWord

Write-Host "Disabling Auto HDR in DirectX settings..." -ForegroundColor Yellow
$DirectXPath = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
if (Test-Path $DirectXPath) {
    $currentValue = Get-ItemProperty -Path $DirectXPath -Name "DirectXUserGlobalSettings" -ErrorAction SilentlyContinue
    if ($currentValue -and $currentValue.DirectXUserGlobalSettings) {
        $newValue = $currentValue.DirectXUserGlobalSettings -replace "AutoHDREnable=1", "AutoHDREnable=0"
        Set-ItemProperty -Path $DirectXPath -Name "DirectXUserGlobalSettings" -Value $newValue
        Write-Host "Updated DirectX settings" -ForegroundColor Green
    }
}

Write-Host "Disabling HDR via display settings registry..." -ForegroundColor Yellow
$DisplayPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\VideoSettings"
if (-not (Test-Path $DisplayPath)) {
    New-Item -Path $DisplayPath -Force | Out-Null
}
Set-ItemProperty -Path $DisplayPath -Name "EnableHDRForPlayback" -Value 0 -Type DWord -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== HDR Disabled ===" -ForegroundColor Green
Write-Host ""
Write-Host "Changes applied:" -ForegroundColor Cyan
Write-Host "  - Auto HDR: Disabled" -ForegroundColor White
Write-Host "  - HDR video playback: Disabled" -ForegroundColor White
Write-Host ""
Write-Host "You may need to restart for all changes to take effect." -ForegroundColor Yellow
Write-Host ""
Write-Host "Quick toggle: Press Win + Alt + B to toggle HDR on/off" -ForegroundColor Cyan
