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

**Android (`development-ai`):** `git fetch origin` and merge `origin/ios-development-ai` (recomendado). Reconexión PRR BLE: commit `1eec9a2` (`src/Layout/CommonLayout.tsx`). Hardening runtime/reportes: `f0d49ae`. Cherry-pick solo BLE: `1eec9a2`. Si faltan commits viejos: `f0d49ae`, `841ccef`, `286dbc4`, `7ae7b33`. Rutas en `f0d49ae`: `src/Layout/CommonLayout.tsx`, `src/hooks/useFunctions.tsx`, `src/helper/reportGrouping.ts`, `src/pages/Reports/index.tsx`, `src/components/Monitor/MonitorView.tsx`, `src/components/Monitor/MonitorList.tsx`, `src/components/Monitor/MonitorProg.tsx`, `src/components/Monitor/MonitorStop.tsx`, `src/App.tsx`, `src/_backup_2026-04-14_reports_runtime_reset/`.

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
