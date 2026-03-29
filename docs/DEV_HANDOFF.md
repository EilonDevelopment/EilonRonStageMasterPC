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
|            |          |                  |                     |             |

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
