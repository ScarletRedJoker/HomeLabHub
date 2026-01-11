# Windows Remote Management Setup Script
# Run as Administrator on the Windows VM
# This enables WinRM, configures firewall, and sets up remote access

param(
    [string]$AllowedHosts = "192.168.0.0/24,100.64.0.0/10",
    [switch]$Force,
    [switch]$InstallSSH
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message, [string]$Type = "INFO")
    $color = switch ($Type) {
        "INFO"    { "Cyan" }
        "OK"      { "Green" }
        "WARN"    { "Yellow" }
        "ERROR"   { "Red" }
        default   { "White" }
    }
    Write-Host "[$Type] $Message" -ForegroundColor $color
}

function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Status "This script must be run as Administrator!" "ERROR"
    Write-Host "Right-click PowerShell and select 'Run as Administrator'"
    exit 1
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " Windows Remote Management Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Status "Enabling WinRM service..."
try {
    Enable-PSRemoting -Force -SkipNetworkProfileCheck
    Write-Status "WinRM enabled" "OK"
} catch {
    Write-Status "Failed to enable WinRM: $_" "ERROR"
    exit 1
}

Write-Status "Configuring WinRM service..."
Set-Service -Name WinRM -StartupType Automatic
Start-Service WinRM
Write-Status "WinRM service started" "OK"

Write-Status "Configuring WinRM settings..."
winrm set winrm/config/service '@{AllowUnencrypted="false"}'
winrm set winrm/config/service/auth '@{Basic="true"}'
winrm set winrm/config/service/auth '@{Negotiate="true"}'
winrm set winrm/config/service/auth '@{Kerberos="true"}'
winrm set winrm/config/service/auth '@{CredSSP="true"}'

winrm set winrm/config/client '@{TrustedHosts="*"}'

Write-Status "Creating HTTPS listener..."
$cert = Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object { $_.Subject -like "*$env:COMPUTERNAME*" } | Select-Object -First 1

if (-not $cert) {
    Write-Status "Creating self-signed certificate..." "INFO"
    $cert = New-SelfSignedCertificate -DnsName $env:COMPUTERNAME, "localhost", "192.168.0.159" `
        -CertStoreLocation "Cert:\LocalMachine\My" `
        -KeyExportPolicy Exportable `
        -KeySpec KeyExchange `
        -NotAfter (Get-Date).AddYears(5)
    Write-Status "Certificate created: $($cert.Thumbprint)" "OK"
}

$existingListener = Get-WSManInstance -ResourceURI winrm/config/Listener -Enumerate | Where-Object { $_.Transport -eq "HTTPS" }
if ($existingListener) {
    Write-Status "Removing existing HTTPS listener..." "WARN"
    Remove-WSManInstance -ResourceURI winrm/config/Listener -SelectorSet @{Address="*";Transport="HTTPS"} -ErrorAction SilentlyContinue
}

New-WSManInstance -ResourceURI winrm/config/Listener -SelectorSet @{Address="*";Transport="HTTPS"} -ValueSet @{CertificateThumbprint=$cert.Thumbprint}
Write-Status "HTTPS listener configured" "OK"

Write-Status "Configuring Windows Firewall..."
$ruleName = "WinRM-HTTPS-In"
$existingRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
    Remove-NetFirewallRule -Name $ruleName
}

New-NetFirewallRule -Name $ruleName `
    -DisplayName "Windows Remote Management (HTTPS-In)" `
    -Description "Allow WinRM HTTPS connections from homelab network" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 5986 `
    -Action Allow `
    -Profile Any
Write-Status "Firewall rule created for port 5986" "OK"

$httpRuleName = "WinRM-HTTP-In"
$existingHttpRule = Get-NetFirewallRule -Name $httpRuleName -ErrorAction SilentlyContinue
if ($existingHttpRule) {
    Remove-NetFirewallRule -Name $httpRuleName
}

New-NetFirewallRule -Name $httpRuleName `
    -DisplayName "Windows Remote Management (HTTP-In)" `
    -Description "Allow WinRM HTTP connections from homelab network" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 5985 `
    -Action Allow `
    -Profile Any
Write-Status "Firewall rule created for port 5985" "OK"

if ($InstallSSH) {
    Write-Status "Installing OpenSSH Server..."
    
    $sshCapability = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
    if ($sshCapability.State -ne 'Installed') {
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
        Write-Status "OpenSSH Server installed" "OK"
    } else {
        Write-Status "OpenSSH Server already installed" "OK"
    }
    
    Start-Service sshd
    Set-Service -Name sshd -StartupType Automatic
    
    New-NetFirewallRule -Name "SSH-In" `
        -DisplayName "OpenSSH Server (SSH-In)" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 22 `
        -Action Allow `
        -Profile Any -ErrorAction SilentlyContinue
    
    Write-Status "SSH configured on port 22" "OK"
}

Write-Status "Installing management tools..."

$chocoInstalled = Get-Command choco -ErrorAction SilentlyContinue
if (-not $chocoInstalled) {
    Write-Status "Installing Chocolatey..." "INFO"
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    Write-Status "Chocolatey installed" "OK"
} else {
    Write-Status "Chocolatey already installed" "OK"
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host " Setup Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "WinRM Endpoints:"
Write-Host "  HTTP:  http://$($env:COMPUTERNAME):5985/wsman"
Write-Host "  HTTPS: https://$($env:COMPUTERNAME):5986/wsman"
Write-Host ""
Write-Host "Test from Linux:"
Write-Host "  curl -k https://192.168.0.159:5986/wsman"
Write-Host ""
Write-Host "Certificate Thumbprint: $($cert.Thumbprint)"
Write-Host ""

$result = @{
    ComputerName = $env:COMPUTERNAME
    WinRMHttpPort = 5985
    WinRMHttpsPort = 5986
    CertificateThumbprint = $cert.Thumbprint
    SSHInstalled = $InstallSSH.IsPresent
    Timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
}

$result | ConvertTo-Json | Out-File -FilePath "$env:ProgramData\winrm-setup.json" -Encoding UTF8
Write-Status "Configuration saved to $env:ProgramData\winrm-setup.json" "OK"
