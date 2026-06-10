# CLAUDE.md — Youth Camp Platform

Guidance for Claude Code when working in this package. Read this before editing.

## What this is

A **combined** youth camp management platform that merges two previously separate apps:

- **Hub** (pre-camp): registrant management, accommodation allocation, blue card & payment tracking, registration codes, FAQ
- **Portal** (at-camp): daily check-in (twice daily), student notes, zone notifications, schedule, devotionals, contact search, CSV import

An admin can switch the entire app between modes via `POST /admin/mode`. All users see the mode on next login.

The app is **platform-agnostic**: no real database or auth provider is wired up. All persistence is in-memory (optionally snapshotted to JSON files). Swapping to a real DB touches only `src/container.ts` + new repository implementations.

## Commands (run from this folder)

```bash
npm install
npm run dev          # backend + frontend on http://localhost:4200 (tsx watch)
npm run start        # same, no watch
npm run typecheck    # tsc --noEmit (strict)
npm run test         # vitest
```

Default port: **4200**. Set `PORT=xxxx` to override.

## Architecture

```
api (Express) → controllers → services → repositories (interfaces) → core
```

- **`src/core/`** — pure types, entities, enums, Zod schemas, errors. No imports from other layers.
- **`src/repositories/`** — interfaces (DB-swap surface) + in-memory implementations + JSON file persistence.
- **`src/services/`** — all business logic + RBAC. Depend on repo *interfaces* only.
- **`src/api/`** — thin controllers → declarative route table (`http/router.ts`) → Express adapter. Express lives only under `src/api/http/` and `src/api/middleware/`.
- **`src/container.ts`** — composition root. The only file that names concrete repositories.

## Roles

| Role | Scope | Key capabilities |
|------|-------|-----------------|
| `church` | Own church | Registrant read/write, daily check-in, write notes |
| `zoneLeader` | Own zone | All of above (zone-scoped), read notes, send zone notices, read registrants in zone |
| `director` | All | All of above (camp-wide), import, camp-wide notices |
| `admin` | All + back office | Everything + admin:manage (settings, accounts, accommodation, FAQ, schedule, devotionals, mode switch) |

There is always exactly one `admin` account. It cannot be deleted or deactivated.

## Camp mode

`CampSettings.campMode: 'pre-camp' | 'at-camp'`

- Controls which tabs and admin tiles appear in the UI.
- Switched via `POST /admin/mode { campMode }`.
- Admin console is **identical in both modes** — admins can configure at-camp content (devotionals, schedule) while still in pre-camp mode.

## Daily check-in (twice daily)

Sessions are derived from schedule items with `isCheckInPoint: true`. There is no hardcoded AM/PM — admins define as many check-in points per day as needed via the Schedule admin screen.

- Each session has its own ID (the schedule item's ID).
- Check-in state is stored per-session in `Camper.checkInHistory[]`.
- `getCurrentSession()` picks the most recently started check-in point for today.
- The frontend shows compact session labels (`Wed AM`, `Wed PM`) derived from day + startTime.

## Key design rules

- **RBAC in one file**: `src/services/access-control.ts`. Never scatter role checks.
- **Validation inside services**: all external input parsed with Zod inside the service, not the controller.
- **Repos return deep clones**: in-memory base repository clones on every read/write.
- **Accommodation lock**: `CampSettings.accommodationLocked` — server blocks non-admin writes when true.
- **Extensionless imports**: ESM, `moduleResolution: "Bundler"`, no `.js` extensions. Each folder has an `index.ts` barrel.
- **Strict TypeScript**: `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`. Guard all indexed access.

## Frontend files

| File | Purpose |
|------|---------|
| `public/index.html` | Implementation-ready SPA — calls the Express backend via relative API paths |
| `../youth app demo/camp-platform.html` | Standalone offline demo — all API calls handled by an embedded MockAPI. This is the canonical demo source. |

> **Demos moved out of this repo.** All demo HTML (landing `index.html`, `camp-platform.html`, the `allocation-*` demos, `exec-presentation.html`, `suite-briefing.html`, `training.html`, `assets/`) now lives in the sibling **`youth app demo/`** folder, which is the Vercel deploy source for `yc-camp-demo`. Deploy with `vercel deploy --prod --yes` **from `youth app demo/`** (CLI; the `.vercel` link lives there). This repo's Git auto-deploy has been disconnected, so **`git push` no longer deploys**. This repo keeps only the real camp backend (`src/`, `public/`, `docs/`).

Both demo files share identical UI code. The mode badge in the header shows **PRE-CAMP** (amber) or **AT CAMP** (green) at all times.

In the demo, clicking the mode badge switches mode for any user (no server needed). In the live app, only admins can switch mode.

## Seed demo accounts (password: `demo1234`)

| Email | Role | Church/Zone |
|-------|------|-------------|
| `victory@campplatform.org` | church | Victory Church · Yellow |
| `gracepoint@campplatform.org` | church | Grace Point Church · Blue |
| `riverbend@campplatform.org` | church | Riverbend Community · Green |
| `api@campplatform.org` | zoneLeader | Yellow Zone |
| `director@campplatform.org` | director | — |
| `admin@campplatform.org` | admin | — |

## Year-to-year reuse

1. Admin sets up churches, accounts, accommodation, FAQ, schedule, devotionals.
2. `POST /admin/save-defaults` — snapshots the scaffold as the new-year baseline.
3. After camp: `POST /admin/new-year` — purges all registrants/campers/notes/notifications/devotionals, restores the baseline. Admin account and camp settings are kept.
