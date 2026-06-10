# CLAUDE.md — Youth Camp Platform

> **Scope:** the real **camp** app — TS/Express backend (`src/`) + `public/` SPA. The offline demos live in `../youth app demo/CLAUDE.md` (that folder is the Vercel deploy source; `git push` here no longer deploys). Project map: `../CLAUDE.md`. Sibling app: `../youth-allocation-platform/CLAUDE.md`. Change workflow: `../CHANGE-PROMPTS.md`.

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
| `public/index.html` | Implementation-ready SPA — **rebuilt 2026-06-10 from the demo, wired to the real Express backend.** Same UI/RENDER layer as `camp-platform.html`; demo-only layers (MockAPI/`_DB`/seed/localStorage/phone affordances) removed; a real `api()` + role-based auth substituted. |
| `../youth app demo/camp-platform.html` | Standalone offline demo — all API calls handled by an embedded MockAPI. The **UI source of truth**; the SPA's screens are ported from here. |

> **Demos moved out of this repo.** All demo HTML (landing `index.html`, `camp-platform.html`, the `allocation-*` demos, `exec-presentation.html`, `suite-briefing.html`, `training.html`, `assets/`) now lives in the sibling **`youth app demo/`** folder, which is the Vercel deploy source for `yc-camp-demo`. Deploy with `vercel deploy --prod --yes` **from `youth app demo/`** (CLI; the `.vercel` link lives there). This repo's Git auto-deploy has been disconnected, so **`git push` no longer deploys**. This repo keeps only the real camp backend (`src/`, `public/`, `docs/`).

The mode badge in the header shows **PRE-CAMP** (amber) or **AT CAMP** (green). In the demo, clicking the badge switches mode for anyone; in the SPA the badge is display-only (mode switches via the admin console). The **Day 1/Day 2** badge in the SPA is client-side only (the backend has no `campDay` field).

## SPA ↔ backend contract (rebuild notes)

The SPA was forked from an earlier demo and had drifted onto the demo's **MockAPI contract**, which differs from the real Express API. When porting a screen from `camp-platform.html`, watch these (the rebuild fixed them all):

- **No envelope.** The backend returns results *bare* (`res.json(result)`); errors are an HTTP error status + `{code,message}`. `api()` returns the bare result and throws on non-2xx. (The demo's MockAPI used `{ok,data}` and `d.actor`; real login returns `{token,user}` and the SPA builds `ACTOR` + a client-side `displayName`.)
- **`/campers` returns a bare array**, not `{items}`. Camper `kind` is `'student'|'leader'`.
- **Check-in status** = `{session, roster:[{camperId,firstName,lastName,church,zone,checkedIn}], checkedInCount, totalCount}` — roster has no gender/grade, so the SPA enriches from `/campers`.
- **Attendance** is `POST /attendance/sign-in|sign-out` with a `camperId` body (not `/campers/:id/sign-*`). Notes for a camper = `GET /notes/camper/:id`. Search reveal = `GET /search/contact/:camperId/:role` (role like `male-primary`).
- **`/home`** DTO differs by mode: pre-camp has `totalCampers/totalLeaders/noBlueCardCount/accommodationSummary[]/perChurchBreakdown[]` (no gender split, no church `code`, no `expected`); the by-ministry M/F table and church code are derived client-side from `/registrants` and `/accounts/churches`.
- **Accommodation** = blocks (`/accommodation/blocks`, with `price`) + per-church reservations (`POST /accommodation/reservations`) + `/accommodation/held/:churchId`. There is **no rooms/allocations model** — the demo's room-by-room placement was reworked to the per-church spot model. **Budget prices come from blocks** (settings has no price fields); there is no fee-tier.
- **Notes** require a `camperId`; a **testimony** is a note with `category:'testimony'` (so the testimonies screen picks a student). `/notes/recent` has no camper details (joined from `/campers`); `/notes/export` returns a **CSV string** (downloaded directly) with a Category column.
- **Admin paths**: `/accounts/users`, `/accounts/churches`, `/admin/defaults`, `DELETE /admin/notifications`, `/import/csv` (body `{csvData}`, CSV only), `/devotional/:day` (path param). Passwords are **min 8**. Church create needs `code`+`selfRegisterSlug`+`account*` fields.

**Backend additions made for the rebuild** (see git history): optional `StudentNote.category` (+ create-schema + enriched CSV export), `DELETE /notifications/:id`, and `contacts` added to `UpdateChurchSchema` (so the ministry-contacts editor can persist). The check-in screen handles an empty session list gracefully (note: `POST /admin/reset` re-seeds without schedule items, so no sessions exist until the schedule is configured).

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
2. `POST /admin/defaults` — snapshots the scaffold as the new-year baseline.
3. After camp: `POST /admin/new-year` — purges all registrants/campers/notes/notifications/devotionals, restores the baseline. Admin account and camp settings are kept.
