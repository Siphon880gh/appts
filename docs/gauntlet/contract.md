# Gauntlet contract — Appts

## Goal
Turn the accountability clone into Appts: Weng's medical-visit tracker organized by condition/disease, with extensible entry types, cross-links, timeline/upcoming, search & filter, picture pasting, file-based server storage, and `demo` + `wf` accounts. Verbatim request: `request.md`.

## Bar
1. **Floor:** accountability's own quality (`app/motivation/accountability` at 3c0897e): sanitized rich notes, image validation, keyboard access, visible focus, 390px layouts without overflow, honest loading/error states, README with real screenshots.
2. **Reference for clarity:** a patient portal like Epic **MyChart** (Visits / Upcoming, Care team, Referrals list). A patient must be able to answer, within one screen from the overview: *What's my next appointment? Which doctor is it with? Is my referral/authorization still valid? What is the status of my appeal?*
A critic compares Appts screenshots with the reference blind and picks the clearer one per question. Ours must not lose on any question.

## Required gates (each must pass independently; no averaging)
| Id | Gate | Evidence |
|----|------|----------|
| G1 | `php -l` passes on every PHP file | `tests/run-all.sh` output |
| G2 | Storage unit tests: guarded round-trip, atomic temp+rename, backups capped, lock, HTML sanitizer | `php tests/storage.test.php` PASS |
| G3 | Domain tests for **every** built-in entry type (all 10, including Clinical events, Insurance events, Care disruptions) (valid entry, required field, events, links, search, filter) | `node tests/schema.test.mjs` PASS |
| G4 | Custom type: create, add every field kind, use it for an entry, survive reload; removing a field / archiving a type keeps data | node + browser tests PASS |
| G5 | Login works for `demo` and `wf`; wrong password rejected; only `password_hash` values on disk | `tests/api.test.py` PASS + grep shows no plaintext |
| G6 | Account isolation: data and images of one account unreadable by the other | `tests/api.test.py` PASS |
| G7 | Persistence across a php -S restart | `tests/api.test.py` PASS |
| G8 | Storage blocked from the web even under `php -S` (no router) | `tests/api.test.py` PASS (404, no data bytes) |
| G9 | Browser flows: demo row click-fills, sign in, add condition, add entry with link, filter, search, timeline, upcoming | `tests/browser.test.py` PASS |
| G10 | 390px: no horizontal overflow on overview, condition, types, timeline | `tests/browser.test.py` PASS |
| G11 | Paste image (Ctrl/Cmd+V) into rich notes and entry attachments; drag-drop + picker wired | `tests/browser.test.py` PASS |
| G12 | Demo seed is clearly synthetic, exercises all 10 built-in types and every link field; wf starts empty | api + browser tests |
| G14 | Timeline type-filter options equal the set of types present in the timeline events, and filtering by them is correct | node + browser tests PASS |
| G15 | Tag created on the fly in an entry form persists across reload | browser + api tests PASS |
| G16 | Timeline tag filter works for one and for multiple tags (AND) | node + browser tests PASS |
| G17 | Icon and color change on a type survive reload | browser test PASS |
| G18 | A type without an icon (or with an unknown key) shows the placeholder icon | node + browser tests PASS |
| G19 | Text/icon on every type color meets WCAG 4.5:1 (all built-ins + 500 random colors) | node test PASS |
| G20 | Rich-text formatting (bold, bullet list, link) in entry and condition notes persists across reload | browser test PASS |
| G21 | Image pasted into notes persists across reload | browser test PASS |
| G22 | Script/handler injection never survives (client paste, direct API) | storage + api + browser tests PASS |
| G13 | Fresh critic reviews headless screenshots + live app and returns WIN | `state.json` verdict log |

## Hard boundaries
- Work only inside `app/healthcare/appts/`. Local commits only: never push, no PRs, no cloud agents.
- Plain PHP, `index.php` entry, no Composer/vendor/router/bundler; no dependency upgrades.
- Never delete user data on type/field changes. Never print passwords. wf data never committed.
- Serve only with `php -S` on a free port, not 8099/8416/8500/8505/8518/8554; kill servers afterwards.

## Stop conditions
WIN from a fresh integration critic with all gates green; or Weng stops the run; or remaining gaps are cosmetic and recorded in `state.json` as open gaps.
