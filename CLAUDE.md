@AGENTS.md

# CLAUDE.md

Project context for AI assistants working in this repository. Read this before writing code.

`brixa-web` is the staff web app for **Brixa HMIS**, a hospital management system for Kenyan Level 4 hospitals. Call the product Brixa HMIS on every screen and document; the repositories keep their names. The API lives in the sibling repository `../api` (`brixa-api`), and **every domain rule lives there**: its `CLAUDE.md`, `SPEC.md`, `SCHEMA.md` and `ROADMAP.md` are the source of truth. This app holds no business rules. The API decides and refuses; a screen shows the work and explains a refusal.

---

## 1. Where the work stands

Decided 2026-11-17 (`../api/ROADMAP.md` §1): the frontend is the next piece of work, and the pilot goes live as an **outpatient** hospital. Inpatient screens wait for the API's P5.

| Step | Work | State |
|---|---|---|
| F1 Foundation | This repository, its stack and CI, the typed API client | Done |
| F2 The journey, sketched | A clickable mockup of one outpatient visit, walked through with the pilot's staff | Sketched; the walkthrough is still to do. See `docs/outpatient-journey.md` |
| F3 The outpatient screens | Sign-in and the facility picker; then front desk, triage, consultation, lab, pharmacy, cashier; then stores and administration | Not started |
| P6 | Reports, offline support, the timed simplicity test | Later |

**Design before build.** No role's screen is built before its sketch has been walked through with the pilot's staff. Sign-in and the facility picker are the exception: they are plumbing, and they prove the session, the facility header and the typed client end to end.

**The mockup** of the outpatient journey: https://claude.ai/artifact/DK7SUAtHVCMssmwXDLSwxg (the owner's claude.ai account; read it with the Artifact tool, never a web fetch). It is the reference for every outpatient screen.

`docs/outpatient-journey.md` maps every sketched screen to the API calls behind it and lists what the sketch asks of the API that it cannot give yet. Settle those in `brixa-api` before building the screen that needs them.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19. **Read `node_modules/next/dist/docs/` before using a Next API**: this version differs from what you remember |
| Server state | TanStack Query, in memory only (section 4) |
| API client | `openapi-fetch`, typed from `src/lib/api/schema.d.ts` |
| Auth | Better Auth's React client. Invite-only: sign-in and accepting an invitation, no sign-up |
| Styling | Tailwind 4, shadcn/ui (`radix-nova`, neutral). System fonts: nothing to download on a slow connection |
| Tests | Vitest, on plain functions (`src/**/*.test.ts`) |
| PWA | A manifest now. The service worker and offline support come with P6 |

Devices: **desktop and tablet**, not phones. Language: **English**, with every string in `src/strings/en.ts`.

---

## 3. Talking to the API

- The **browser calls the API directly**, with the session cookie. The API answers credentialed CORS for this app's origin only (its `APP_URL`), and Better Auth trusts that origin alone. Nothing is proxied through Next.
- `NEXT_PUBLIC_API_URL` says where the API is (`http://localhost:9999` in development).
- **`src/lib/api/client.ts` is the one way to call it.** `api.GET("/patients/{id}", { params: { path: { id } } })` is typed from `schema.d.ts`, which `pnpm codegen` generates from the API's `/doc`. Never edit `schema.d.ts` by hand, and never restate a response shape: read it off `paths`.
- **Every tenant request names its facility** in `X-Facility-Id`. The client adds it from `src/lib/facility.ts`. `GET /me/facilities` lists where the person works and their roles there; one membership goes straight in, several show the picker.
- **Roles come from the membership**, per facility. A role decides which desk a person lands on. The API still checks every call; hiding a button is a convenience, not a control.
- **What the API answers** (`src/lib/api/refusal.ts` turns a failure into one of these):

| Outcome | Status | Body |
|---|---|---|
| Success | 200 / 201 | The resource, or a named list: `{ encounters: [...] }` |
| Refusal | 409 usually, 403 for a role | `{ message, code }`, plus any fields that refusal carries |
| Not found, or not yours | 404 | `{ message }` |
| A field is not valid | 422 | `{ success: false, error: { issues } }` |
| Our failure | 500 | `{ message, requestId }` |

- Money is integer cents in a field ending `Cents`. Dates are `YYYY-MM-DD`; instants are ISO strings.

---

## 4. Conventions

These carry the API's rules to the screen. Do not deviate without discussion.

1. **One screen per job.** Each role lands on its own work queue: who is waiting on the left, the patient in front of you on the right, one primary button that sends them on. Nothing else appears unless asked for (`../api/SPEC.md` §7.9).
2. **The common case is the shortest path.** A returning patient is found and sent to triage in seconds.
3. **Never ask for what the API derives.** Charges, prices, document numbers, quantities, totals and balances come back from the API. The screens never add money up; they print what they are given (`src/lib/money.ts`).
4. **Plain language.** Diagnoses and medicines are searched by name. Codes are shown only to the roles that need them. A refusal's `message` is written for the member of staff and is shown as it is; nothing else from an error is ever shown.
5. **Every word is in `src/strings/en.ts`.** No text inline in a component.
6. **No patient data outside memory.** Nothing the API returned goes into `localStorage`, `sessionStorage`, IndexedDB, a cookie, a URL, a log line, an analytics event or an error report. URLs carry ids only. The query cache is in memory and is never persisted. P6 decides what offline support may hold, and how.
7. **Opening a record is an audited act.** The API records who viewed a patient, a queue or a document. So never prefetch a patient's record, on hover or in the background: fetch what the person asked to see, when they ask.
8. **Sensitive records** (HIV, mental health, GBV) come back as placeholders to those outside the category. Show the placeholder as it is; opening one is break-glass, which asks for a reason.
9. **Business dates are Nairobi's.** "Today" is never the device's zone. Use one module for it, tested, as the API does.
10. **Touch targets are at least 44 px**, text meets 4.5:1, and every control is a real `<button>`, `<a>` or labelled `<input>`. A status is never told by colour alone.
11. **Slow connections are normal.** Show what is already known while a request runs, say plainly when one failed, and never lose what someone typed.
12. **Synthetic data only** in development, in tests and in mockups. Never a real patient, and never the pilot hospital's name.

---

## 5. Commands

```sh
pnpm dev          # http://localhost:3000; the API must be running on 9999
pnpm lint
pnpm typecheck    # route types, then tsc
pnpm test
pnpm build
pnpm codegen      # regenerate src/lib/api/schema.d.ts from the API's /doc
pnpm screens --as doctor /path   # screenshots and an accessibility scan (section 7)
```

After an API change that touches a route, run `pnpm codegen` and fix what stops compiling.

---

## 6. Working here

The workflow matches `brixa-api`'s: work is grouped into pull requests, each slice's open questions get a recommendation before code, CI is green before the next slice, and the user decides merges.

---

## 7. Seeing a screen

A screen is checked by looking at it, not only by its tests. With the API seeded (`pnpm db:seed` in `brixa-api`, a made-up hospital) and both servers running:

```sh
pnpm screens --as <desk> /route [/another]
```

- **What it does:** it signs in as `<desk>@sample-hospital.test` (`frontdesk`, `triage`, `doctor`, `lab`, `labsupervisor`, `pharmacy`, `stores`, `cashier`, `finance`, `admin`), chooses that person's facility, and opens each route at desktop (1366×768) and tablet (1024×768, 768×1024) sizes.
- **What it writes:** full-page screenshots in `screenshots/` (ignored by git), each named for its route's place in the command, the route and the size, and an axe scan in `screenshots/report.json`. It exits 1 on a serious or critical accessibility violation.
- **The browser:** it uses the machine's Chromium (`CHROMIUM_PATH`, else `/usr/bin/chromium`), so nothing is downloaded.

**Before a screen is called done:**
1. Look at each screenshot.
2. Compare it with the mockup's screen for that desk.
3. Fix what differs or reads badly.
4. Show the owner the screenshots beside the mockup.

Screenshots cannot show how a screen feels in use, or on a slow connection: that is the owner's review and the staff walkthrough.
