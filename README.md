# Ron Stage Master — Windows (PC)

Desktop variant of **Ron Stage Master** (EilonRonStage). This repository is **separate** from the mobile app repo on purpose.

| Repo | Platform | Primary branch |
|------|----------|----------------|
| [EilonRonStageMaster](https://github.com/EilonDevelopment/EilonRonStageMaster) | Android + iOS (Capacitor) | `development-ai` (Android/Windows mobile), `ios-development-ai` (Mac) |
| **This repo** (`EilonRonStageMasterPC`) | Windows desktop | `main` |

## What belongs here

- Electron (or other desktop shell) for Windows
- **USB / serial** connection to the PRR (not BLE)
- Windows installers, COM-port UI, desktop-only dependencies
- PC-specific docs and build scripts

## What stays in the mobile repo

- Android Play releases (`android/`, `build.gradle` version codes)
- iOS / Xcode / TestFlight
- BLE scan, connect, auto-reconnect
- Day-to-day Monitor / Reports / Settings fixes for **tablet and phone**

Do **not** add Electron or USB serial work to the mobile repo unless it is shared UI logic that you later **merge into this repo**.

## Local folder

```
C:\Users\Moshe\Cursor\EilonRonStageMasterPC
```

## First-time setup

```powershell
cd C:\Users\Moshe\Cursor\EilonRonStageMasterPC
npm install
npm run build
```

Desktop packaging (Electron, etc.) will be added on this branch as the PC port progresses.

## Syncing shared app code from mobile

When the mobile team ships UI or business-logic changes you need on PC:

1. In the **mobile** repo, note the commit on `development-ai` (or `ios-development-ai` if iOS-only).
2. In **this** repo:

```powershell
git fetch mobile
git merge mobile/development-ai
# resolve conflicts; keep PC-only files (electron/, usb helpers, etc.)
npm install
```

Add the mobile remote once:

```powershell
git remote add mobile https://github.com/EilonDevelopment/EilonRonStageMaster.git
```

Prefer **merging** `development-ai` into `main` here after meaningful mobile releases, not copying files by hand.

## Syncing PC-only work

Commit and push only to **this** repository (`origin main`). Do not push PC/Electron/USB commits to `EilonRonStageMaster`.

## Handoff log

See [docs/DEV_HANDOFF_PC.md](docs/DEV_HANDOFF_PC.md).
