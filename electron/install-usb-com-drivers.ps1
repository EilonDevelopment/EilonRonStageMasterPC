#Requires -RunAsAdministrator
<#
  Instala drivers USB virtual COM (CP210x + FTDI) para CRR en otra PC.
  Clic derecho en PowerShell -> Ejecutar como administrador:

    Set-ExecutionPolicy -Scope Process Bypass -Force
    cd "C:\ruta\a\Ron Stage Master PC"
    .\install-usb-com-drivers.ps1
#>

$ErrorActionPreference = 'Stop'

function Get-PackageRoot {
  if ($env:PORTABLE_EXECUTABLE_DIR) {
    return $env:PORTABLE_EXECUTABLE_DIR
  }
  return Split-Path -Parent $MyInvocation.MyCommand.Path
}

$Root = Get-PackageRoot
$Drivers = Join-Path $Root 'resources\usb-drivers'
if (-not (Test-Path $Drivers)) {
  $Drivers = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'usb-drivers'
}

Write-Host "=== Ron Stage Master PC — drivers USB COM ===" -ForegroundColor Cyan
Write-Host "Carpeta drivers: $Drivers" -ForegroundColor DarkGray

# --- Silicon Labs CP210x ---
$cpZip = Join-Path $Drivers 'CP210x_Universal_Windows_Driver.zip'
$cpDir = Join-Path $Drivers 'CP210x'
if (-not (Test-Path (Join-Path $cpDir 'silabser.inf'))) {
  if (-not (Test-Path $cpZip)) {
    Write-Host "Descargando driver CP210x..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri 'https://www.silabs.com/documents/public/software/CP210x_Universal_Windows_Driver.zip' `
      -OutFile $cpZip -UseBasicParsing
  }
  Expand-Archive -Path $cpZip -DestinationPath $cpDir -Force
}

Write-Host "Instalando CP210x (silabser.inf)..." -ForegroundColor Green
pnputil /add-driver (Join-Path $cpDir 'silabser.inf') /install

# --- FTDI VCP ---
$ftdiExe = Get-ChildItem -Path $Drivers -Recurse -Filter 'CDM*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $ftdiExe) {
  Write-Host ""
  Write-Host "Driver FTDI no encontrado en el paquete." -ForegroundColor Yellow
  Write-Host "Descargue manualmente:" -ForegroundColor Yellow
  Write-Host "  https://ftdichip.com/drivers/vcp-drivers/" -ForegroundColor White
  Write-Host "  -> Windows (Desktop) -> ejecutable setup (zip)" -ForegroundColor White
  Write-Host "  Guarde el zip en: $Drivers" -ForegroundColor White
  Write-Host "  Extraiga y ejecute CDM*.exe como administrador." -ForegroundColor White
} else {
  Write-Host "Ejecutando instalador FTDI: $($ftdiExe.FullName)" -ForegroundColor Green
  Start-Process -FilePath $ftdiExe.FullName -ArgumentList '/S' -Wait
}

Write-Host ""
Write-Host "Reescaneando dispositivos..." -ForegroundColor Cyan
pnputil /scan-devices

Write-Host ""
Write-Host "Puertos COM actuales:" -ForegroundColor Cyan
Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
  Select-Object Status, FriendlyName |
  Format-Table -AutoSize

Write-Host "Listo. Reconecte el cable USB del CRR si hace falta." -ForegroundColor Green
