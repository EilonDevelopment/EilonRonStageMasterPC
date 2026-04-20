# Dev handoff (Mac iOS ↔ Windows Android)

Use this file so **both Cursor sessions** (and humans) stay aligned **without relaying chat**. Update it when you push meaningful branch work.

---

## Branches (current convention)

| Branch              | Typical machine | Focus                          |
|---------------------|-----------------|--------------------------------|
| `ios-development-ai`| Mac             | iOS / iPad, Capacitor, Xcode   |
| `development-ai`    | Windows         | Android bugs, Gradle, Play     |
| `main`              | Either          | Integration when you choose    |

Adjust the table if you rename branches.

---

## How to sync (short)

**After the other side pushed:**

```bash
git fetch origin
git checkout <your-working-branch>
git merge origin/<their-branch>   # e.g. merge ios-development-ai into development-ai, or the reverse
npm install                       # if package files changed
```

**iOS-only:** from repo root, after JS changes:

```bash
npm run build && npx cap sync ios
```

**Android:** use your usual `cap sync` / Gradle flow after dependency or native config changes.

---

## Where coordination lives (read before big edits)

| Topic              | File(s) |
|--------------------|---------|
| Monitor group UX   | `src/pages/Monitor/index.tsx`, `GroupActionModal.tsx`, `MonitorView.tsx`, `CommonLayout.tsx` (`toolbarTareClick`) |
| BLE prerequisites  | `src/helper/nativeBleScan.ts` (header comment) |
| Native CSV import  | `src/helper/nativeProjectCsvImport.ts` (header comment) |
| Thin wiring        | `src/Layout/CommonLayout.tsx` (comment above helper imports) |
| iOS permissions    | `ios/App/App/Info.plist` (XML comment + keys) |
| Android permissions| `AndroidManifest.xml` (and related) |

**Rule:** Prefer extending **helpers** for shared native rules; avoid duplicating long platform logic in `CommonLayout`.

---

## Log for the other session (append a row when you push)

| Date (UTC) | Branch   | Author / machine | Summary (1–2 lines) | Commit / PR |
|------------|----------|------------------|---------------------|-------------|
| 2026-03-29 | ios-development-ai | Mac | Added `docs/DEV_HANDOFF.md` (branches, sync, coordination pointers) | fcc14f0 |
| 2026-03-29 | development-ai | Windows | Fast-forward merged `origin/ios-development-ai`; adopting repo handoff mailbox | e3f26bd |
| 2026-04-09 | ios-development-ai | Mac | Shared BLE scan update: no auto-timeout, live discovered-device list while scanning, cancel always enabled. Also bumped app UI version to 1.4.2 and Android `versionCode/versionName` to `20/1.4.2`. Android side: pull shared files (`CommonLayout`, `BleDeviceListModal`, `bleLeScanCollection`, `Menu`, `android/app/build.gradle`) from this commit into `development-ai`. | 67a591e |
| 2026-04-09 | development-ai | Windows | Pulled latest `ios-development-ai` into `development-ai`, validated on Android tablet over USB, and sent build to QA/testing. | 2b80018 |
| 2026-04-12 | ios-development-ai | Mac | Monitor view: Android/WebView ghost-cell fixes (clip column in user+image, flushSync, mode-toggle repaint), centered layout-progress overlay (spinner + bar) for Home / crosshair / restore, i18n `Monitor.LayoutProgress*`. | 286dbc4 |
| 2026-04-12 | ios-development-ai | Mac | Monitor group UX: highlight/show-only wired + header ring; single-tap = display-only modal, long-press = zero confirm, double-tap = full actions (unchanged); toolbar Tare targets `groupVisual` group (multi-group tare preserved; tare on focused tared group clears all). `GroupActionModal` modes; `getLCsByGroup` trim; Modal/NewLC sticky footer; bulk LC insert + Settings path. | 7ae7b33 |
| 2026-04-13 | ios-development-ai | Mac | Stabilized post-export navigation and reporting/alarm behavior: removed per-page resume route restore conflicts; removed forced layout remount after native project export share; kept project cycle logging live after Settings toggle; per-group untare keeps other groups tared; exports now include `Name` + `ID`; centralized alarm audio priming/resume helper. | 841ccef |
| 2026-04-14 | ios-development-ai | Mac | Runtime/reporting hardening pass: protocol negative-spike guard at ingest (`< -10% nominal capacity`), persistent `status_code` at log write, queue backpressure to protect UI under long runs, richer agg status counters/worst-status, report filters consume status metadata, exports force full dataset (not preview), and status column/colors across screen + CSV/PDF/SQL/email. Local backup snapshot added under `src/_backup_2026-04-14_reports_runtime_reset/`. | f0d49ae |
| 2026-04-15 | ios-development-ai | Mac | PRR BLE auto-reconnect after long power-off: next retry scheduled in `finally` after releasing `inProgress` (fixes stuck backoff), `bleConnectToDevice` returns success boolean, exponential backoff from disconnect callback. | 1eec9a2 |
| 2026-04-15 | ios-development-ai | Mac | Reports/export pass: unified 100k cap + explicit continue/truncate warning, added `Data` source marker (`raw` / `5-min chunk`) in UI/exports, kept bulk details only in CSV, and fixed 5-min aggregation to exclude `Tr.Err` sentinel values from avg/min/max while preserving error counters. Also improved PRR link event logging consistency (connected/disconnected). | 3271e65 |
| 2026-04-15 | ios-development-ai | Mac | Daily raw reports redesign: new `daily_logs` store + clean migration reset of legacy report stores, ingest writes raw rows by `day_key` with rollover on first sample after midnight, Reports UI changed to project→day tree (today default), exports now mirror selected-day filtered UI without Data/Bulk columns, and added tablet storage usage bar. | local WIP |
| 2026-04-17 | ios-development-ai | Mac | Reports + Monitor stabilization block: date-range reports (no day/hour tree), centered progress kept, 100k UI/export cap with faster IndexedDB streaming, optional hour/min filter for single-day range, refresh-only apply flow, pending-refresh label, segmented storage bar + low-space warning + auto-prune oldest daily logs, Gross/Net ingest fixes (`tare_applied` + `net_value`) and multiple tare consistency fixes in Monitor totals/status, plus ZERO safety guard (block if any group LC raw load >30% capacity), and visual version bump to `1.4.4`. | pending push |
| 2026-04-17 | development-ai | Windows | Android UX parity fix for Monitor gate: keep `Can't be 0` dialog open (no instant dismiss on touch/menu events) and auto-redirect to `Settings` on app open if any current-project group has `overload=0`. | 26a529d |
| 2026-04-20 | ios-development-ai | Mac | Shared BLE/Reports/Monitor sync block: Connect Device direct-PRR flow hardened (single auto-run per open, scan-in-progress dialog, manual-connect wins over auto-reconnect race via reconnect epoch), Monitor view pinch/pan overlay behavior stabilized, no-image manual LC placement fixed, optional background-image removal added, Reports cap raised to 300k, legacy-report recovery paths + storage-source labeling (`device` vs estimated quota) and diagnostics helpers. | pending push |
| 2026-04-20 | development-ai | Windows | Android parity and stability pass: fixed duplicate/hidden BLE scan modal from cached views, kept `Scan in progress` dialog visible on Android touch, hardened large Reports loads (invalid timestamps + safe append path for near-300k), fit background image using real image dimensions for Android/iOS consistency, and bumped Android Play version to `1.4.5` (`versionCode 23`). | 1e516ba |
| 2026-04-20 | ios-development-ai | Mac | Follow-up UX parity fixes: sticky Add LC footer/keyboard handling tuned for Android, Settings now auto-resets empty groups after LC group edits, and Monitor drag/drop hardened for extreme portrait images (home->stage fallback, keep home column x=0, wider stage->home drag slop, transparent stage layers, zoom overflow behavior, Home/Undo visible without background image). | pending push |

**Android (`development-ai`) import checklist (2026-04-17 block):**
- `git fetch origin && git checkout development-ai && git merge origin/ios-development-ai`
- Rebuild shared app layer (`npm install` only if lock/package changed; otherwise `npm run build`)
- Android sync/build as usual (`npx cap sync android`, then Gradle/Android Studio build)
- Validate on device:
  1) Reports load only on Refresh, date range + single-day hour/min range behavior, 100k cap warnings
  2) Monitor tare behavior: tile colors + group/total sums + overload/danger based on gross for safety
  3) ZERO group blocked when any member raw load exceeds 30% of capacity
  4) Left storage bar segmentation + low-space warning + no regressions while ingesting

Primary touched files in this block: `src/pages/Reports/index.tsx`, `src/pages/Reports/index.css`, `src/hooks/useFunctions.tsx`, `src/Layout/CommonLayout.tsx`, `src/pages/Monitor/index.tsx`, `src/components/Monitor/MonitorView.tsx`, `src/components/Menu.tsx`, `src/helper/reportGrouping.ts`, `src/db.ts`.

---

**Android (`development-ai`) import checklist (shared block, 2026-04-20):**
- `git fetch origin && git checkout development-ai && git merge origin/ios-development-ai`
- Validate BLE manual flow on tablet:
  1) Menu -> `Connect Device` starts PRR scan immediately
  2) Re-tap while scan is active shows "Scan in progress" (no duplicate scan)
  3) During auto-reconnect retry window, manual Connect wins (no stale retry re-taking control)
- Validate Monitor:
  1) With image: pinch/zoom/pan + LC drag unchanged
  2) Without image: drag LC from home lane into stage and keep visible/editable
  3) Remove background image button works and keeps LC layout intact
- Validate Reports:
  1) 300k load cap behavior and performance
  2) Storage section label/source handling (`device` vs estimated quota)
  3) No regressions in refresh/export baseline flows

Primary files in this block: `src/Layout/CommonLayout.tsx`, `src/components/Monitor/MonitorView.tsx`, `src/pages/Reports/index.tsx`, `src/hooks/useFunctions.tsx`, `src/db.ts`, `src/assets/i18n/en.json`, `src/components/Modals/ProjectSettingModal.tsx`, `src/context/AppContext.tsx`, `src/pages/Monitor/index.tsx`, `src/components/Monitor/MonitorView.css`.

---

**Android (`development-ai`) import checklist (follow-up, 2026-04-20):**
- `git fetch origin && git checkout development-ai && git merge origin/ios-development-ai`
- Validate Settings / Add LC modal on Android tablet:
  1) In `Add LC`, `Cancel` / `Save` stay visible while scrolling and when keyboard is open
  2) Edit LC groups: if a group becomes empty after removing the last LC, it auto-resets/clears in Settings
- Validate Monitor with very tall portrait background image:
  1) Home -> image drag remains reliable even when touchend coordinates are unstable
  2) Stage -> Home drag follows finger farther left (reduced invisible wall effect)
  3) Pinch zoom can overflow stage container when zoomed-in (less fixed-window feeling)
  4) Home/Undo buttons remain visible and functional even with no background image
- Primary files: `src/components/Monitor/MonitorView.tsx`, `src/components/Modals/Modal.tsx`, `src/pages/Settings/index.tsx`.

---

**iOS (`ios-development-ai`) import checklist (Android parity fix, 2026-04-17):**
- `git fetch origin && git checkout ios-development-ai && git merge origin/development-ai`
- Validate:
  1) In Settings, if any group overload is `0`, tapping Monitor shows `Can't be 0` and dialog stays visible (no auto-close)
  2) After app restart with that invalid condition, app lands on `Settings` (not `Monitor`)
- Primary files: `src/components/Menu.tsx`, `src/pages/Monitor/index.tsx`

---

**iOS action request (from 2026-04-20 onward):**
- For every **new dialog** (Swal/Ionic), verify Android touch behavior so it does not auto-dismiss.
- For critical dialogs (validation / scan-in-progress / errors), default to:
  - `allowOutsideClick: false`
  - `allowEscapeKey: false`
- Always run smoke checks on both iOS and Android for open/close timing and backdrop/touch interactions.

---

### Monitor group UX (detail, 2026-04-12)

- **State:** `groupVisual` `{ groupId, highlight, only }` in Monitor; cleared on project change.
- **Gestures (group strip):** single click (after 350 ms) → modal **solo** Highlight / Show only; double click mismo grupo &lt; 350 ms → modal **completo** (Tare, Zero, checkboxes); long press ~600 ms → flujo **Zero** (mismo texto/confirmación). `suppressGroupClickRef` evita click fantasma tras long press.
- **Toolbar Tare (solo Monitor):** `toolbarTareClick` en `CommonLayout`. Requiere highlight **o** show-only activo; si el grupo foco ya tiene `tare === 'true'` → `tare_off()` global; si no → misma validación que modal + `tare_group` + `tare_on`.
- **`tare_group` / `untare_group`:** grupo resuelto con `groups.find` + IDs con `trim` en `groups` string.
- **`GroupActionModal`:** `mode`: `full` | `visualOnly` | `zeroOnly` (tres instancias en Monitor).

*Example:* `2026-03-29 | ios-development-ai | Mac | Info.plist BLE/camera; native CSV on iOS | e250fe7`

---

## Commit / PR message template (copy-paste)

```
[platform: ios|android|shared] Short title

- What changed
- What the other side should do (merge / npm install / cap sync / tests)
- Risks or follow-ups
```

---

## Español (resumen)

- **Ramas:** iOS en `ios-development-ai`, Android en `development-ai` (o como acordéis).
- **Sincronizar:** `git fetch` + `merge` de la rama del otro; `npm install` si aplica.
- **Coordinación:** comentarios en `nativeBleScan.ts`, `nativeProjectCsvImport.ts`, `CommonLayout` (imports), `Info.plist` / manifest Android.
- **Tabla de arriba:** añadid una fila cada vez que subáis un bloque importante para que la otra instancia lo vea al hacer pull.
