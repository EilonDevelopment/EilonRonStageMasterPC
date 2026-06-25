# USB COM drivers (CRR / FTDI / Silicon Labs)

Windows needs a **virtual COM port (VCP)** driver so the CRR appears as `COMx` for the desktop app.

## Quick install (recommended)

1. **Right-click** PowerShell → **Run as administrator**
2. Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
cd C:\Users\Moshe\Cursor\EilonRonStageMasterPC\tools
.\install-usb-com-drivers.ps1
```

This installs **Silicon Labs CP210x** from the official zip (already in this folder).

## FTDI (manual — site blocks automated download)

1. Open [FTDI VCP drivers](https://ftdichip.com/drivers/vcp-drivers/)
2. Under **Windows (Desktop)**, download the **setup executable** (zip)
3. Extract to `tools/usb-drivers/`
4. Run `CDMxxxx_Setup.exe` **as administrator**

## CH340 (optional — if you see "USB-SERIAL CH340")

Download from WCH: [CH341SER](http://www.wch-ic.com/downloads/CH341SER_EXE.html) and install.

## Verify in Device Manager

`Win + X` → **Device Manager** → **Ports (COM & LPT)**

You should see something like:

- `Silicon Labs CP210x USB to UART Bridge (COM5)` — **Status OK**
- or `USB Serial Port (COMx)` for FTDI

## Use in the app

```powershell
cd C:\Users\Moshe\Cursor\EilonRonStageMasterPC
npm run electron:dev
```

Menu → **Connect Device** → select the COM port.
