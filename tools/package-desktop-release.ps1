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

$ftdiExe = Get-ChildItem -Path $Drivers -Recurse -Filter 'CDM*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ftdiExe) {
  Write-Host 'FTDI: no local CDM*.exe; install script will show manual download steps.' -ForegroundColor Yellow
} else {
  Write-Host ('FTDI included: ' + $ftdiExe.Name) -ForegroundColor Green
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

Write-Host 'electron-builder (portable + zip)...' -ForegroundColor Cyan
npm run package
if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed' }
Pop-Location

$releaseDir = Join-Path $RepoRoot 'release'
$zipFile = Get-ChildItem -Path $releaseDir -Filter '*.zip' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host ('Output folder: ' + $releaseDir) -ForegroundColor White
if ($zipFile) {
  Write-Host ('ZIP for other PC: ' + $zipFile.FullName) -ForegroundColor Green
}
Get-ChildItem $releaseDir -ErrorAction SilentlyContinue | Format-Table Name, Length, LastWriteTime
