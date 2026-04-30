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
| 2026-04-21 | ios-development-ai | Mac | UX/interaction cleanup block: Settings list got paginated UI index + total LC counter; More Settings modal footer made sticky on Android; Add LC default underload changed to `-10`; menu visual polish (logo/menu width balance, subtle divider/version, language selector restyle, remove send-logs item, light-mode header label/icon contrast). Monitor Home flow redesigned: no home drag, touch-scroll over full home area, click-to-send LC to canvas first free slot, double-tap on canvas LC returns to Home first free slot, and canvas-wide placement (including non-image area) with overlap/clipping fixes. | pending push |
| 2026-04-23 | ios-development-ai | Mac | Stability + UX follow-up: project-switch runtime now clears transient BLE display caches and uses active-project filtering in live parse path (prevents stalled/mixed LC updates after switching projects online). Group single-tap behavior changed to direct Show-only toggle (no visual modal prompt), keeping highlight on group card only; external ring highlight clipping fixed by adding top spacing in group strip. Group tare/untare is now persisted to DB (`lcs` + `groups`) so switching projects and returning does not clear tared groups. Also includes platform version/orientation updates merged in branch state (`1.4.6`, landscape lock). | pending push |
| 2026-04-23 | ios-development-ai | Mac | Release version alignment for next store rollout: menu label bumped to `1.4.7`, Android Play version updated to `versionName 1.4.7` + `versionCode 24`, and iOS/TestFlight updated to `MARKETING_VERSION 1.4.7` + `CURRENT_PROJECT_VERSION 25`. | pending push |
| 2026-04-26 | ios-development-ai | Mac | Hotfix block: iOS upload fix for landscape-only build (`UIRequiresFullScreen=true`), Reports delete button reworked to partial deletion by active filters (project + date/hour + status) across `daily_logs` and legacy stores, alarm audio no longer auto-suspends on native iOS (fixes mute-until-touch), and Android Home lane touch-scroll now works from empty background areas (not only when dragging from an LC tile). | pending push |
| 2026-04-26 | ios-development-ai | Mac | Monitor Home-column compaction tweak: when user single-taps an LC in Home to move it to canvas, all LCs below shift up one slot immediately (no gaps left in Home lane). This avoids persistent empty slots and keeps Android touch-scroll behavior consistent. | pending push |
| 2026-04-30 | ios-development-ai | Mac | Monitor Plans feature added end-to-end: per-project multi-plan data model (`monitor_plans`, `monitor_plan_lc_layouts`, `monitor_plan_state`), Monitor header plan selector dialog (create/select/edit/rename/delete with General Plan protected), per-plan group visibility + per-plan image/layout persistence, per-plan group-visual local state (show-only/highlight no longer global), race-condition hardening for plan/image switching, and project export/import now includes plans + plan layouts + selected plan state (with ID remap and layout dedupe). | pending push |

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

**Android (`development-ai`) import checklist (Monitor Plans + project export/import parity, 2026-04-30):**
- `git fetch origin && git checkout development-ai && git merge origin/ios-development-ai`
- Validate Monitor Plans UX:
  1) Under `Monitoring Screen`, current plan name is shown; tapping opens a large Plans dialog (not clipped dropdown)
  2) `+ New plan` opens create dialog with editable `Plan Name` + group switches (no value reset while typing/toggling)
  3) `General Plan` is selectable only (no edit/rename/delete actions)
  4) Non-general plans support edit/rename/delete; removing groups in edit shows destructive warning
- Validate plan behavior/persistence:
  1) Each plan keeps its own background image + LC positions independently
  2) Switching quickly between plans does not swap/mix background images
  3) Group show-only/highlight selection is local per plan (tare/zero remain global)
  4) If a legacy/empty plan has no included groups, app self-heals to include all project groups
- Validate project backup/restore:
  1) Export project CSV includes `[MonitorPlans]`, `[MonitorPlanLayouts]`, `[MonitorPlanState]`
  2) Import into a new project restores plans, per-plan images, per-plan LC positions, and selected active plan
  3) General Plan restores correct LC positions (no cross-plan mixing)
- Primary files in this block: `src/db.ts`, `src/pages/Monitor/index.tsx`, `src/Layout/CommonLayout.tsx`, `src/components/Modals/MonitorPlanModal.tsx`, `src/hooks/useFunctions.tsx`.

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

**Android (`development-ai`) import checklist (UI + Monitor interaction redesign, 2026-04-21):**
- `git fetch origin && git checkout development-ai && git merge origin/ios-development-ai`
- Validate menu/header UI parity:
  1) Hamburger icon + `Total Weight` + `PRR` labels are black in light mode, readable in dark mode
  2) Side menu width/logo/language selector spacing looks aligned on Android tablet
  3) `Send logs to the developer` no longer appears in side menu
- Validate Settings:
  1) LC list first column shows UI index respecting pagination
  2) Total LC count appears above grid and updates after add/delete
  3) In Add LC, default underload is `-10`
  4) More Settings `OK` / `Cancel` remain visible with keyboard open
- Validate Monitor redesigned Home interactions:
  1) Home has no manual scrollbar strip; vertical touch scroll works on whole home area (cells + empty space)
  2) Home LCs are not draggable; single tap moves LC to canvas first free grid slot
  3) On-canvas LC supports drag/drop across full canvas (including non-image area)
  4) Double tap on on-canvas LC returns it to Home first free slot
  5) No LC overlap/clipping in top-left canvas fringe after repeated home->canvas taps
- Primary files: `src/components/Monitor/MonitorView.tsx`, `src/pages/Settings/index.tsx`, `src/components/Modals/NewLCModal.tsx`, `src/components/Modals/ProjectSettingModal.tsx`, `src/components/Menu.tsx`, `src/components/Menu.css`, `src/Layout/CommonLayout.tsx`, `src/theme/variables.css`, `src/assets/i18n/en.json`, `src/assets/i18n/jp.json`.

---

**Android (`development-ai`) import checklist (runtime + group UX/tare persistence, 2026-04-23):**
- `git fetch origin && git checkout development-ai && git merge origin/ios-development-ai`
- Validate project switch while PRR remains connected:
  1) Project A live values update normally
  2) Switch to project B and confirm immediate live updates (no "stalled"/mixed values)
  3) Switch back to A and confirm values remain stable
- Validate group strip UX:
  1) Single tap on group now toggles Show-only directly (no highlight/show-only chooser dialog)
  2) Tapping selected group again clears Show-only
  3) Focus ring remains external and fully visible (not clipped at top)
- Validate tare persistence:
  1) Apply tare to a group, switch to another project, return: group tare + LC tare state remains
  2) Untare persists after project switch as well
- Validate native/version alignment after merge:
  1) Side menu version label shows `1.4.6`
  2) App stays landscape-only on Android
- Primary files: `src/Layout/CommonLayout.tsx`, `src/pages/Monitor/index.tsx`, `src/components/Monitor/MonitorView.tsx`, `android/app/src/main/AndroidManifest.xml`, `ios/App/App/Info.plist`, `ios/App/App.xcodeproj/project.pbxproj`.

---

**Android (`development-ai`) import checklist (release version bump, 2026-04-23):**
- `git fetch origin && git checkout development-ai && git merge origin/ios-development-ai`
- Validate Android release metadata:
  1) `android/app/build.gradle` has `versionName "1.4.7"` and `versionCode 24`
  2) Side menu footer shows `version-1.4.7`
- Validate iOS release metadata after merge on Mac branch:
  1) `MARKETING_VERSION = 1.4.7`
  2) `CURRENT_PROJECT_VERSION = 25`
- Primary files: `src/components/Menu.tsx`, `android/app/build.gradle`, `ios/App/App.xcodeproj/project.pbxproj`.

---

**Android (`development-ai`) import checklist (hotfix parity + reports delete, 2026-04-26):**
- `git fetch origin && git checkout development-ai && git merge origin/ios-development-ai`
- Validate Monitor Home lane on Android tablet:
  1) Vertical scroll works when finger starts on LC tiles
  2) Vertical scroll also works when finger starts on empty background spaces in Home column
  3) After moving an LC from Home to canvas by single tap, remaining Home LCs compact upward with no empty gaps
- Validate Reports delete behavior:
  1) Delete button removes only rows matching current filters (project + date range + single-day hour range + status toggles)
  2) Deleting filtered rows does not leave stale rows reappearing from legacy fallback tables
  3) Loading overlay closes correctly after delete (no stuck "Loading report..." state)
- Validate iOS upload compatibility after merge-back:
  1) `Info.plist` contains `UIRequiresFullScreen=true` so landscape-only iPad upload passes App Store validation
- Validate iOS runtime alarm audio:
  1) After long idle time, warning beeps continue without requiring a new touch to "wake" audio
- Primary files: `src/pages/Reports/index.tsx`, `src/services/alarmFeedback.ts`, `src/components/Monitor/MonitorView.tsx`, `ios/App/App/Info.plist`.

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
