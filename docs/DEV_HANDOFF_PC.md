# Dev handoff — Windows PC repo

Mailbox for **EilonRonStageMasterPC** (`main`). Mobile handoff remains in the other repo: `EilonRonStageMaster` → `docs/DEV_HANDOFF.md`.

---

## Repositories

| Repository | URL | Role |
|------------|-----|------|
| Mobile | `https://github.com/EilonDevelopment/EilonRonStageMaster.git` | Android + iOS, BLE, Play Store, TestFlight |
| **PC (this)** | `https://github.com/EilonDevelopment/EilonRonStageMasterPC.git` | Windows desktop, USB data path |

**Rule:** PC shell and USB transport live **only here**. Android/iOS native work stays in the mobile repo.

---

## Branches

| Branch | Use |
|--------|-----|
| `main` | All PC development (default) |

Mobile branches (`development-ai`, `ios-development-ai`) are **not** used in this repo.

---

## Data path (target architecture)

```
PRR (USB cable) → serial/COM reader (PC-only) → bt_parse(bytes) → same Monitor / Reports UI
```

Mobile path remains BLE → `BleClient` → `bt_parse`. Do not replace BLE in the mobile repo for PC work.

---

## When to pull from mobile

Merge `mobile/development-ai` into `main` when you need:

- Monitor / Settings / Reports UI fixes
- Shared helpers (`src/helper/*`, i18n, `db.ts`, etc.)
- User manuals under `docs/`

Skip or resolve carefully:

- `android/`, `ios/` — keep for reference; PC build may ignore
- BLE-only changes in `CommonLayout.tsx` — keep mobile behavior; add `platform === 'electron'` or USB branch **here**

---

## Log (append when you push meaningful PC work)

| Date (UTC) | Branch | Author | Summary | Commit |
|------------|--------|--------|---------|--------|
| 2026-06-22 | main | Windows | Repo created from mobile `development-ai` @ `67f2aae`; PC/USB work isolated | initial |
