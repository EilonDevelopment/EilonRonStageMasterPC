@echo off
setlocal enabledelayedexpansion

REM === Config ===
set "OUTDIR=%~dp0overnight_logs"
set "TS=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TS=%TS: =0%"
set "FULL=%OUTDIR%\logcat_full_%TS%.txt"
set "ALERTS=%OUTDIR%\logcat_alerts_%TS%.txt"
set "META=%OUTDIR%\session_%TS%.txt"

if not exist "%OUTDIR%" mkdir "%OUTDIR%"

echo ============================================== > "%META%"
echo Overnight Logcat Session >> "%META%"
echo Start: %date% %time% >> "%META%"
echo Full log: %FULL% >> "%META%"
echo Alerts: %ALERTS% >> "%META%"
echo ============================================== >> "%META%"

echo.
echo [1/4] Verificando dispositivo ADB...
adb get-state >nul 2>&1
if errorlevel 1 (
  echo ERROR: No hay dispositivo ADB conectado o autorizado.
  echo Revisa cable USB, depuracion USB y autorizacion.
  pause
  exit /b 1
)

echo [2/4] Reiniciando buffer de logcat para empezar limpio...
adb logcat -c

echo [3/4] Iniciando captura...
echo.
echo *** Deja esta ventana abierta toda la noche. ***
echo *** Para detener: presiona Ctrl + C y luego Y. ***
echo.

REM Captura completa + alertas en paralelo usando PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$full='%FULL%'; $alerts='%ALERTS%';" ^
  "$pattern='FATAL EXCEPTION|OutOfMemoryError|crashpad|chromium|WebView|SIGTRAP|SIGSEGV|ANR|Abort message|low memory|Renderer|Fatal signal';" ^
  "adb logcat -v time | Tee-Object -FilePath $full | ForEach-Object { if ($_ -match $pattern) { $_ | Out-File -FilePath $alerts -Append -Encoding utf8 } }"

echo [4/4] Sesion finalizada: %date% %time% >> "%META%"
echo.
echo Captura finalizada.
echo Full:   %FULL%
echo Alerts: %ALERTS%
echo Meta:   %META%
pause