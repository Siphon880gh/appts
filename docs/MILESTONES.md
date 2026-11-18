# Appts — Milestones

Each milestone ends with its gates green and a small focused commit set. Gate ids refer to `docs/gauntlet/contract.md`.

| # | Milestone | Epics | Exit gates |
|---|-----------|-------|-----------|
| M0 | Planning docs committed (epics, milestones, graph prompt, loop prompt, gauntlet contract/state) | all | docs exist, committed before code |
| M1 | Storage + auth: `includes/storage.php`, `includes/auth.php`, `api.php` actions `session/login/logout/data/ops`, accounts file with hashes, storage guards, `.gitignore` | E1 | G1 php -l, G2 storage unit tests, G5 login both accounts, G6 isolation, G7 restart persistence, G8 storage blocked |
| M2 | Domain + types: `includes/seed-types.json`, `js/schema.js` pure functions (validate, events, upcoming, search, filter, field add/remove/reorder, archive), server-side op validation | E2, E3 | G3 domain tests for every built-in type, G4 custom type create/use/survive reload |
| M3 | UI: login with demo row, overview, condition workspace, entry form/detail rendered from definitions, entry types page, timeline, upcoming, search & filter; rebrand | E2–E4 | G9 browser flows, G10 390px no overflow |
| M3c | Type icons + colors: SVG icon set, placeholder, icon picker, color swatches, readable-text helper used everywhere | E8 | G17, G18, G19 |
| M4 | Pictures: upload API on files, paste into entry + rich notes, drag-drop, picker | E5 | G11 paste-image test |
| M4b | Rich-text notes on entries and conditions (accountability editor), double sanitization | E9 | G20, G21, G22 |
| M4c | Documents: PDF + image uploads on entries and conditions, per-account document labels (seeded + on the fly), Documents page with type/label/condition filters and viewer; Lab work visit kind | E10 | G23–G26 |
| M5 | Demo seed data (clearly synthetic) for demo account; wf starts empty | E1, E2 | G5, G12 seed sanity |
| M3b | Tags + timeline filters: per-account tags, type-ahead create, timeline type chips derived from present types, multi-tag filter | E7 | G14, G15, G16 |
| M6 | Docs + screenshots: README, `.impeccable.md`, IMPLEMENTATION.md, headless screenshots; fresh critic review; loop until WIN | E6 | G13 critic WIN, all gates green |
| M7 | Home health: authorization/visit/event types, countdown and warnings, v3 migration, demo story | E12 | G33, G34, G35 |
| M8 | AI intake: log-health-update skill + tools/intake.php CLI + tests | E13 | G36–G39 |
| M9 | Offline mode: version, manifest, sw.php, offline-plan, toggle/panel/explainer, IndexedDB queue, three-way sync, tests | E14 | G40–G49 |
| M10 | Disruptions preset + Edit Disruption mode; @ link popover and chips; tests | E15, E16 | G52–G57 |
