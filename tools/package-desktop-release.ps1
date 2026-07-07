#Requires -Version 5.1
<#
  Build portable + ZIP package for another PC (app + Serial Debug + USB drivers).
  Run from repo root:

    Set-ExecutionPolicy -Scope Process Bypass -Force
    .\tools\package-desktop-release.ps1
#>

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host '=== Ron Stage Master PC - packaging ===' -ForegroundColor Cyan

$Drivers = Join-Path $RepoRoot 'tools\usb-drivers'
$cpZip = Join-Path $Drivers 'CP210x_Universal_Windows_Driver.zip'
$cpDir = Join-Path $Drivers 'CP210x'
if (-not (Test-Path (Join-Path $cpDir 'silabser.sys'))) {
  if (-not (Test-Path $cpZip)) {
    Write-Host 'Downloading CP210x driver...' -ForegroundColor Yellow
    Invoke-WebRequest -Uri 'https://www.silabs.com/documents/public/software/CP210x_Universal_Windows_Driver.zip' `
      -OutFile $cpZip -UseBasicParsing
  }
  if (Test-Path $cpDir) { Remove-Item -Recurse -Force $cpDir }
  Expand-Archive -Path $cpZip -DestinationPath $cpDir -Force
}

$ftdiZip = Join-Path $Drivers 'CDM21228_Setup.zip'
$ftdiDir = Join-Path $Drivers 'FTDI'
$ftdiExe = Get-ChildItem -Path $Drivers -Recurse -Filter 'CDM*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ftdiExe) {
  Write-Host 'Downloading FTDI VCP driver (CDM21228)...' -ForegroundColor Yellow
  try {
    if (-not (Test-Path $ftdiZip)) {
      Invoke-WebRequest -Uri 'https://www.ftdichip.com/Drivers/CDM/CDM21228_Setup.zip' `
        -OutFile $ftdiZip -UseBasicParsing
    }
    if (-not (Test-Path $ftdiDir)) { New-Item -ItemType Directory -Path $ftdiDir | Out-Null }
    Expand-Archive -Path $ftdiZip -DestinationPath $ftdiDir -Force
    $ftdiExe = Get-ChildItem -Path $ftdiDir -Recurse -Filter 'CDM*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  } catch {
    Write-Host ('FTDI download failed: ' + $_.Exception.Message) -ForegroundColor Yellow
    Write-Host 'Place CDM*.exe under tools\usb-drivers\FTDI\ and rebuild.' -ForegroundColor Yellow
  }
}
if ($ftdiExe) {
  Write-Host ('FTDI included: ' + $ftdiExe.Name) -ForegroundColor Green
} else {
  Write-Host 'FTDI: not bundled — CP210x only; user may need manual FTDI install.' -ForegroundColor Yellow
}

Write-Host 'Build React...' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }

Write-Host 'Staging build + drivers under electron/...' -ForegroundColor Cyan
$electronDir = Join-Path $RepoRoot 'electron'
$stageBuild = Join-Path $electronDir 'build'
if (Test-Path $stageBuild) { Remove-Item -Recurse -Force $stageBuild }
Copy-Item -Recurse -Force (Join-Path $RepoRoot 'build') $stageBuild

$usbPack = Join-Path $electronDir 'usb-drivers-pack'
if (Test-Path $usbPack) { Remove-Item -Recurse -Force $usbPack }
Copy-Item -Recurse -Force $Drivers $usbPack

Copy-Item -Force (Join-Path $RepoRoot 'tools\install-usb-com-drivers-portable.ps1') (Join-Path $electronDir 'install-usb-com-drivers.ps1')
Copy-Item -Force (Join-Path $RepoRoot 'tools\LEEME-INSTALACION.txt') (Join-Path $electronDir 'LEEME-INSTALACION.txt')
Copy-Item -Force (Join-Path $RepoRoot 'tools\Abrir-Serial-Debug.bat') (Join-Path $electronDir 'Abrir-Serial-Debug.bat')

Write-Host 'Electron deps + rebuild serialport...' -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot 'electron')
npm install
if ($LASTEXITCODE -ne 0) { throw 'electron npm install failed' }
npm run rebuild
if ($LASTEXITCODE -ne 0) { throw 'electron-rebuild failed' }

Write-Host 'electron-builder (NSIS installer + portable + zip)...' -ForegroundColor Cyan
npm run package
if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed' }
Pop-Location

$releaseDir = Join-Path $RepoRoot 'release'
$installerExe = Get-ChildItem -Path $releaseDir -Filter 'RonStageMasterPC-*-PC-Setup-win-x64.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$zipFile = Get-ChildItem -Path $releaseDir -Filter '*.zip' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host ('Output folder: ' + $releaseDir) -ForegroundColor White
if ($installerExe) {
  Write-Host ('Windows installer (give this to users): ' + $installerExe.FullName) -ForegroundColor Green
}
if ($zipFile) {
  Write-Host ('ZIP portable: ' + $zipFile.FullName) -ForegroundColor White
}
Get-ChildItem $releaseDir -ErrorAction SilentlyContinue | Format-Table Name, Length, LastWriteTime
