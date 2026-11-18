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
| G3 | Domain tests for **every** built-in entry type (all 10, including Clinical events, Insurance events, Other care disruptions) (valid entry, required field, events, links, search, filter) | `node tests/schema.test.mjs` PASS |
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
| G23 | PDF and image uploads persist across a php -S restart | api test PASS |
| G24 | A custom document label created on the fly is saved and offered/reused on the next upload | api + browser tests PASS |
| G25 | Documents page filters by file type and by label (chips derived from existing uploads) | node + browser tests PASS |
| G26 | Cross-account access to an upload (PDF or image) is denied | api test PASS |
| G27 | PHP 7.4 compatibility (MAMP mod_php 7.4.33) and 8.4: every PHP file lints on both; storage tests pass on 7.4; full suite passes with `APPTS_PHP=<7.4 binary>`; live MAMP check returns JSON | `tests/run-all.sh` + `APPTS_PHP=… sh tests/run-all.sh` |
| G28 | A free-text status typed in an entry saves, survives reload, shows in the row and detail, is found by search and the timeline filter, and is offered again under "Used before" | browser + api + node tests PASS |
| G29 | All built-in Status fields (6 since home health) offer **Free text…**; "Allow free text" can be toggled on any select field on the Entry types page (custom selects included) | node + browser tests PASS |
| G30 | The built-in type is called "Other care disruptions" / "Other care disruption" everywhere (seed, condition page, timeline chips, Entry types page, demo, docs) | node + browser tests + `git grep` |
| G31 | Migration v1→v2 is idempotent, backs up first, renames only a default-named disruption type, enables free text on built-in status fields, and leaves every condition, entry, tag, label, and attachment byte-identical; dry run on a copy of `wf` shows only type changes | storage + api tests PASS + `tools/migrate-dry-run.php wf` |
| G32 | Tagline (t12u): sign-in headline + description, quiet overview line, README intro, page title/meta | browser test PASS + README |
| G33 | Home health countdown: "X of N authorized visits left" on the authorization, condition sidebar, and overview; low (2 or fewer), used-up, and awaiting-approval warnings; survives reload | node + browser + live tests PASS |
| G34 | Only Completed visits count; each missed reason (insurance approval, nurse unavailable, patient at clinic, typed) is listed and never counted; home health events filter on the timeline | node + browser tests PASS |
| G35 | Migration v2→v3 appends the home health types after existing ones, backs up first, is idempotent, leaves every existing type and record byte-identical, never re-runs v2 steps; dry run on a copy of `wf` shows only type changes | storage + api tests PASS + `tools/migrate-dry-run.php wf` |
| G36 | Intake CLI lists accounts (no hashes), conditions, types (with options/allowCustom, custom types), and entries | `tests/intake.test.php` PASS (PHP 8.4 + 7.4) |
| G37 | Dry run writes nothing; apply writes once, after a backup, with typed values, @ref links, tags/labels created or reused, attachments copied guarded and byte-identical; warns about likely duplicates, re-attachments, and other-condition updates | `tests/intake.test.php` PASS |
| G38 | Intake never deletes or overwrites: filled values and titles refused, bad dates/selects/links/files refused with the entry and field named, nothing written on any error; tests never use `wf`, real `storage/` untouched | `tests/intake.test.php` PASS |
| G39 | Entries written by the CLI show in the running app after reload (row, tag, value, document label, notes); SKILL.md frontmatter valid and its plan example dry-runs | browser + intake tests PASS |
| G40 | Offline mode toggle in the header (fits at 390px); service worker registers with the app folder as scope under php -S and under MAMP's subpath | offline + browser + live tests PASS |
| G41 | `offline-plan` is sign-in only, lists the shell, a URL per view (one per condition), the data JSON via the API, and the account's uploads with byte sizes, deduplicated, with an estimate; another account's conditions and uploads never appear | offline + live tests PASS |
| G42 | (i) `<dialog>` explainer with an inline SVG (doctor, clinic without guest Wi-Fi, phone with the saved copy): "Turn this on first, while you're still online"; Escape closes it | offline test PASS + offline-info.png |
| G43 | Turning on: choose conditions, estimate versus `storage.estimate()`, `storage.persist()`, fill with the fill header showing "n of N"; not enough space stops cleanly and the mode stays off | offline test PASS |
| G44 | Status panel shows on/off, last saved, saved items, size, and changes waiting to sync | offline test PASS + offline-panel.png |
| G45 | Version from the shell files in the worker and manifest URLs; `sw.php` not cached; manifest scoped to the app folder; `action=version` open | offline + live tests PASS |
| G46 | When on, every same-origin GET comes from the copy even with the server running (only the version check reaches it): with the server stopped, dir/, index.php, index.php?anything, every view, a PDF, and an image open; unknown pages show "Not saved for offline use" | offline + live tests PASS |
| G47 | While on, an entry edit, a new entry with a pasted image, and a type edit are queued on the device (IndexedDB), shown at once, and still shown after an offline reload | offline test PASS |
| G48 | Sync is blocked while on; turning off offers it; sync merges three-way with a server edit made meanwhile and every change reaches the server (checked over the API); sign-out warns and waits while changes are unsynced, and afterwards removes the account copy | offline + merge tests PASS |
| G49 | A new version while on re-saves the copy, installs the new worker, stays on, and reloads into it | offline test PASS |
| G50 | Header order: brand, tagline, the Offline group (button + (i)) and a thin `nav-sep` rule at the far LEFT of the navbar, then the main links, then the "…" menu alone at the right; no horizontal overflow at any width | offline test PASS + header-desktop.png |
| G51 | The (i) explainer opens with the bold, brand-colored headline "Want to show clinical information to your doctor?" above the clinic picture | offline test PASS + offline-info.png |
| G52 | Timeline has a built-in **Disruptions** preset (with count) that shows insurance denials, missed/cancelled/rescheduled visits, delays, backorders, paused or pending approvals, appeals, clinical events, and other care disruptions (by type, and by the value of any choice field, free-text values included); approvals and completed visits are not in it | unit + Playwright + live MAMP PASS + timeline-disruptions.png |
| G53 | **Edit Disruption mode** appears only while the preset is on: every event shows, those outside the filter grayed out; clicking (or Enter/Space) adds or removes one, saved per account as include/exclude ids, survives reload, queues and merges while offline; the server accepts only the built-in filter id | unit + storage + API + offline + Playwright PASS + disruption-edit.png |
| G54 | Typing `@` in any rich note opens a popover at the caret listing the libraries (Documents, Events, Notes, with counts); hovering a library lists its items (documents show their type); clicking inserts a link chip and closes the popover | Playwright + live MAMP PASS + mention-popover.png |
| G55 | Typing after `@` filters every library at once into one list (a library's name narrows to it), says when nothing matches; ↑/↓, →/←, Enter/Tab pick, Escape closes without closing the form; no popover inside an email address | unit + Playwright PASS |
| G56 | Chips are stored as kind + id + label only (server and browser sanitizers drop handlers, styles, and invalid ids); in a saved note a document chip opens the document, an event or note chip opens its record (keyboard reachable); chips survive reload and are inert while editing | storage + API + Playwright PASS + mention-chips.png |
| G57 | Edit Disruption mode and the @ popover fit at 375px with no horizontal overflow; no page errors; real `storage/` untouched | Playwright PASS |
| G58 | "…" menu (t19u): name, Reset demo data (demo only), and Sign out are hidden until it opens; menu button pattern (aria-haspopup=menu, aria-expanded, aria-controls); click/Enter/↓ open on the first item, ↑ on the last; ↑/↓ wrap, Home/End; Escape closes and returns focus; Tab, an outside click, and navigation close it; stays on screen at desktop and 375px; works through Apache | offline + live tests PASS + header-menu-open.png |
| G59 | When the Offline group, the links, and "…" don't fit on one row (measured with a ResizeObserver on the header width, plus a ≤640px fallback), the inline group and separator hide, and the "…" menu shows "Offline mode" with its live On/Off state and waiting count, plus "What is Offline mode?"; both open the same dialogs, are reachable by keyboard, and focus returns to "…" after the dialog closes. At 390/375px it collapses; back at 1280px it expands, still in sync | offline + live tests PASS + header-narrow.png, header-narrow-menu.png |
| G13 | Fresh critic reviews headless screenshots + live app and returns WIN | `state.json` verdict log |

## Hard boundaries
- Work only inside `app/healthcare/appts/`. Local commits; push only when Weng asks (t18u did), never force, no PRs, no cloud agents.
- Plain PHP, `index.php` entry, no Composer/vendor/router/bundler; no dependency upgrades.
- Never delete user data on type/field changes. Never print passwords. wf data never committed.
- Serve only with `php -S` on a free port, not 8099/8416/8500/8505/8518/8554; kill servers afterwards.

## Stop conditions
WIN from a fresh integration critic with all gates green; or Weng stops the run; or remaining gaps are cosmetic and recorded in `state.json` as open gaps.
