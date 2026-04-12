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

**Android (`development-ai`):** `git fetch origin` and merge `origin/ios-development-ai` (recomendado). Si cherry-pick puntual: ghost/layout commit `286dbc4`; grupo UX + modals/settings commit `7ae7b33`. Rutas tocadas en este push: `src/pages/Monitor/index.tsx`, `src/components/Modals/GroupActionModal.tsx`, `src/components/Monitor/MonitorView.tsx`, `src/Layout/CommonLayout.tsx`, `src/components/Modals/Modal.tsx`, `src/components/Modals/NewLCModal.tsx`, `src/components/Modals/index.css`, `src/helper/functions.ts`, `src/hooks/useFunctions.tsx`, `src/pages/Settings/index.tsx`, `src/assets/i18n/en.json`, `src/assets/i18n/jp.json` (y desde `286dbc4`: `MonitorView.css` si aún no fusionado).

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
