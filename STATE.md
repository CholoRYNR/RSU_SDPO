# RSU SDPO Build Loop — State

Last updated: 2026-08-29 (build loop started — first run in progress)
Repo: `C:\Users\markl\Downloads\RSU-SDPO (V2)\RSU-SDPO` on device "bisibi", connected to this session. GitHub remote: `https://github.com/CholoRYNR/RSU_SDPO.git`, branch `main`, **public** — confirmed by the user to be pushed recently, so this is the real undo point referenced in the runbook's "before the first run" note. Being public also means a future build sprint can clone it directly into the cloud workspace (for a full `npm install`/Jest run) without needing any credentials set up.

Everything below is now based on directly listing and reading the files, not on the user's written description alone (that description was accurate everywhere it was checkable, and is credited inline).

## Sprint status

| Sprint | Scope | Status | Notes |
|---|---|---|---|
| S0 | Scaffold | done | Express app, Sequelize/Supabase Postgres connection, JWT auth middleware, Bootstrap-flavored static frontend all working. `npm test` is a literal no-op (`echo "No tests specified yet" && exit 0`) — no Jest harness actually wired despite it being the intended stack. |
| S1 | Inventory Management | done | Equipment CRUD (`equipment.controller.js`) and per-unit Item tracking (via `qr.controller.js`, not the empty `inventory.controller.js` — see Findings) both work against real Sequelize models. |
| S2 | QR Code Identification | done, with a real gap | Generation (`qr.controller.js#generate`) and public lookup (`#lookup`, backing `scan.html`) work. **`/api/qr/generate` and `/api/qr/items` have no auth/role middleware at all** — see Findings, this is new. |
| S3 | Transaction Tracking | done | `borrow.routes.js` correctly separates Staff (review) from Director (approve) per the approved workflow; return + overdue sweep + damage/loss all wired with proper role gating. |
| S4 | Automated Reports | reported done — not yet independently opened | Route file (`report.routes.js`) and a substantial `report.controller.js` (10.7KB) exist with correct staff-only gating. Have not yet read the controller body or confirmed PDFKit/ExcelJS output actually renders. |
| S5 | Notification Engine | partial (confirmed) | In-app works via `helpers/notify.js`. `config/mailer.js`, `config/semaphore.js`, `services/notificationService/emailService.js`, `smsService.js`, `inAppService.js` are all confirmed 0 bytes. |
| S6 | Integration & final verification | not started | See Findings — this sprint's real acceptance criteria are below, and it's bigger than originally scoped. |

## Findings — verified directly against the repo (2026-08-29)

**New, not in the original write-up — highest priority:**
- `server/routes/equipment.routes.js` has **no `authMiddleware`/`roleMiddleware` on any route**, including `POST /`, `PUT /:id`, `DELETE /:id`. Anyone who can reach the API can create, edit, or delete equipment records with no login at all.
- `server/routes/qr.routes.js` has **no auth on `/items` or `/generate`**, only `/lookup/:itemCode` should reasonably be public. `/generate` lets anyone mint new physical-item records and increment stock; `/items` returns every item including the current borrower's name — an unauthenticated PII leak. Every other route file in the project (borrow, return, damage-loss, dashboard, audit-logs, reports, notifications, borrowers, users) correctly applies `authMiddleware`/`roleMiddleware`, so this reads as an oversight on these two files specifically, not a project-wide pattern.
- This is exactly what the write-up's own recommendation #3 asked to verify ("grep router. calls without roleMiddleware") — verifying it found a real, concrete hole.

**Corrects a claim in the original write-up:**
- The "clean MVC separation... routes → controllers → services → repositories → models" claim overstates what's there. All 5 files in `server/repositories/` and 6 of 7 files in `server/services/` (`authService.js`, `damageLossService.js`, `inventoryService.js`, `qrService.js`, `reportService.js`, `transactionService.js`) are 0-byte stubs. The real logic lives directly in the controllers (`borrow.controller.js` is 15KB, `report.controller.js` 10.7KB, `damageLoss.controller.js` 8.5KB) — this is a fat-controller architecture with an unused service/repository scaffold layered on top, not the layered architecture the write-up described. Functionally this doesn't block anything working today, but it means "add a service layer" is real, uncredited technical debt, not just a nice-to-have.
- `server/controllers/inventory.controller.js` and `server/routes/inventory.routes.js` are dead code (route file is literally `// TODO: inventory/item endpoints. Placeholder`). This looked like it might mean per-unit Item tracking was missing, but it isn't — that functionality is fully implemented, just living under `/api/qr/items` and `/api/qr/generate` instead. Not a functional gap, just a confusing leftover route.

**Confirmed exactly as reported:**
- Zero tests (`server/tests/*` only `.gitkeep`), `npm test` is a no-op.
- OAuth genuinely unbuilt — `auth.routes.js` has the code comment "Google/Facebook OAuth: not yet implemented," `config/passport.js` is 0 bytes.
- No `express-rate-limit` dependency anywhere in `package.json` — confirmed independently.
- CSP `unsafe-inline` and HSTS-disabled in `app.js` are deliberate, well-commented, dev-only decisions (not sloppiness) — the code comments explicitly say why and flag it as pre-deployment debt themselves.
- In-app notifications work via `helpers/notify.js`; email/SMS services are all 0-byte stubs.

**New minor findings:**
- `package.json` still lists `mysql2` as a dependency even though the app is fully on Postgres/Sequelize — harmless but should be dropped alongside the `rsusdpo_db_backup/` cleanup already recommended.
- `express-validator` is a dependency but unused — `server/validators/*.js` are all 0-byte stubs. Validation that does exist (e.g. in `equipment.controller.js#create`) is manual inline `if` checks, not a validation layer.
- `server/constants/roles.js`, `borrowerCategories.js`, `notificationTypes.js`, `transactionStatus.js` are all 0 bytes — role/status strings are hardcoded inline across controllers/routes instead (e.g. `roleMiddleware(['Admin', 'Director', 'Staff'])` repeated per file).
- `client/layouts/*.html` (3 files) and all of `client/components/**/*.html` (13 files) are 0-byte stubs — the frontend is genuinely standalone HTML pages with inline scripts per page (matches the CSP finding), not using the layout/component scaffolding the folder structure implies. Not a bug, just confirms the actual frontend architecture.
- Most of `client/js/<page>/*.js` (17 of ~20 files) are 0 bytes — page logic for login, register, borrower-slip, my-requests, dashboard, notifications, qr-generator/scanner, reports, return, settings, users lives inline inside the large `.html` files instead (`transaction-management.html` is 47.7KB, `user-login.html` 28.7KB). Only `equipment.js`, `api.js`, and `app-shell.js` have real content.

## Not yet independently checked

- `report.controller.js` body (does PDF/Excel output actually work, or is it also thinner than it looks).
- The actual DB migrations' correctness against the ERD/data dictionary in the manuscript.
- `client/pages/*.html` inline-script contents, beyond confirming they're non-empty.

## Escalation log

(Empty — nothing has blocked a run yet, because no build/fix run has started. The two items below are flagged for the user's decision, not treated as escalations mid-run.)

1. Finish vs. strip the email/SMS/OAuth stubs — a product decision.
2. What to do with `rsusdpo_db_backup/` (may contain real personal data from earlier testing) — deletion isn't the loop's call to make unilaterally.
3. **New:** whether to patch the missing auth on `equipment.routes.js`/`qr.routes.js` now, as a quick fix, or fold it into the S6 pass later — flagged to the user, not yet acted on.

## Guardrail counters (reset per sprint, not global)

- Per-sprint retry cap: 3
- No-progress rule: identical failure signature two attempts in a row → escalate, don't retry a 3rd time.

## Notes

This file is the loop's memory. Every run reads it fresh and rewrites it before doing anything else.
