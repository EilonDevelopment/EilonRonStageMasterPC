#Requires -RunAsAdministrator
<#
  Install USB virtual COM drivers for CRR/FTDI/CP210x development on Windows.
  Right-click PowerShell -> Run as administrator, then:

    Set-ExecutionPolicy -Scope Process Bypass -Force
    cd C:\Users\Moshe\Cursor\EilonRonStageMasterPC\tools
    .\install-usb-com-drivers.ps1
#>

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Drivers = Join-Path $PSScriptRoot 'usb-drivers'

Write-Host "=== Ron Stage Master PC — USB COM drivers ===" -ForegroundColor Cyan

# --- Silicon Labs CP210x (already downloaded) ---
$cpZip = Join-Path $Drivers 'CP210x_Universal_Windows_Driver.zip'
$cpDir = Join-Path $Drivers 'CP210x'
if (-not (Test-Path (Join-Path $cpDir 'silabser.inf'))) {
  if (-not (Test-Path $cpZip)) {
    Write-Host "Downloading CP210x Universal Windows Driver..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri 'https://www.silabs.com/documents/public/software/CP210x_Universal_Windows_Driver.zip' `
      -OutFile $cpZip -UseBasicParsing
  }
  Expand-Archive -Path $cpZip -DestinationPath $cpDir -Force
}

Write-Host "Installing Silicon Labs CP210x (silabser.inf)..." -ForegroundColor Green
pnputil /add-driver (Join-Path $cpDir 'silabser.inf') /install

# --- FTDI VCP (manual download if missing) ---
$ftdiZip = Join-Path $Drivers 'FTDI_Windows_CD_Driver_Setup.zip'
$ftdiExe = Get-ChildItem -Path $Drivers -Recurse -Filter 'CDM*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $ftdiExe) {
  Write-Host ""
  Write-Host "FTDI driver not found locally." -ForegroundColor Yellow
  Write-Host "Download manually (browser):" -ForegroundColor Yellow
  Write-Host "  https://ftdichip.com/drivers/vcp-drivers/" -ForegroundColor White
  Write-Host "  -> Windows (Desktop) -> setup executable (zip)" -ForegroundColor White
  Write-Host "  Save zip to: $Drivers" -ForegroundColor White
  Write-Host "  Extract and run CDM*.exe as administrator." -ForegroundColor White
} else {
  Write-Host "Running FTDI installer: $($ftdiExe.FullName)" -ForegroundColor Green
  Start-Process -FilePath $ftdiExe.FullName -ArgumentList '/S' -Wait
}

Write-Host ""
Write-Host "Rescanning devices..." -ForegroundColor Cyan
pnputil /scan-devices

Write-Host ""
Write-Host "Current COM ports:" -ForegroundColor Cyan
Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
  Select-Object Status, FriendlyName |
  Format-Table -AutoSize

Write-Host "Done. Reconnect the CRR USB cable if needed." -ForegroundColor Green
