# Appts — Epics

Appts is Weng's personal medical-visit tracker. Everything is organized by **condition / disease**, not by person. Each condition holds typed entries (doctors, visits, letters, appeals, supplies, care, treatment, and any custom type Weng defines).

Source of truth for the request: `docs/gauntlet/request.md` (verbatim). Quality bar and gates: `docs/gauntlet/contract.md`.

## E1 — Server-side file storage and accounts
- Plain PHP (`index.php` entry, `api.php` JSON endpoint, `includes/*.php`). No Composer, vendor, router, or bundler.
- Per-account JSON document under `storage/data/`, written atomically (temp file + `rename`) under an exclusive `flock`, with rotating backups in `storage/backups/`.
- Images stored as files under `storage/uploads/<account>/`, content-addressed by SHA-256.
- Web access to `storage/` blocked three ways: `.htaccess` deny, `storage/index.php` 404, and every stored file is a `.php` file that begins with a 404-and-exit guard, so even `php -S` without a router executes the guard instead of serving bytes.
- Accounts: `demo` (synthetic seed data, public demo-only credentials, click-to-fill row) and `wf` (Weng's real account, same password, starts empty). Only `password_hash` values are stored. Real data files are git-ignored.

## E2 — Condition-centric domain model
- Conditions replace accountability "partners": name, status (active / resolved / archived), diagnosed date, color, rich notes.
- Entries belong to one condition and one entry type; values are keyed by stable field ids.
- Cross-links: link fields point at other entries (visit → doctor, letter → visit, appeal → visit, supply → doctor, care → doctor, treatment → doctor). Backlinks are computed and shown.

## E3 — Extensible entry types
- Ten built-in types are only seed definitions stored per account: Doctors/specialists, Visits, Authorization/referral letters, Insurance appeals/coordination, Medical supplies, Care, Treatment, and (Weng, t5u-appts) Clinical events, Insurance events, Other care disruptions (renamed from Care disruptions in t11u-appts).
- Naming decision: Weng's "Logistics event" was first named **Care disruptions**; Weng renamed it **Other care disruptions** (singular "Other care disruption") in t11u-appts: it says what the record is for — something outside the body that broke the plan (machine down, appointment cancelled, supply late) — and reads clearly beside Clinical events and Insurance events. Clinical event = a change in the body (e.g. wound worse); Insurance event = a coverage decision or request (e.g. denied).
- An **Entry types** page adds new types and edits existing ones: rename, icon, color, add / remove / reorder fields. Field kinds: text, long text, date, number, select, checkbox, link (to doctor, visit, or any type).
- Types can be archived and restored. Removing a field moves it to `retiredFields`; values stay in entries and remain visible. Archiving a type keeps all its entries.
- Forms, detail views, timeline events, and filters all render from the definitions.

## E4 — Views: overview, condition workspace, timeline, upcoming, search & filter
- Overview: hero, condition cards with per-type counts and next upcoming item, global upcoming list.
- Condition workspace: entries grouped by type, type filter chips, status filter, text search.
- Timeline: every date field of every entry becomes an event, grouped by month, filterable by condition and type, searchable.
- Upcoming: future events sorted soonest first, with relative labels ("in 3 days").

## E5 — Pictures everywhere
- Ctrl/Cmd+V a clipboard image into any entry form (attachments) and into rich-text notes (inline), plus drag-and-drop and a file picker.
- PNG / JPEG / GIF / WebP up to 8 MB, validated server-side by magic bytes and dimensions.

## E6 — Brand, docs, verification
- Rename all Accountability branding to Appts; rewrite README (with real screenshots), `.impeccable.md`, implementation notes.
- Automated gates: `php -l`, PHP storage tests, Node domain tests (every entry type, custom types), Python HTTP tests (login, isolation, persistence across restart, storage blocking, concurrency), Playwright browser tests (demo click-fill, custom type create/use/reload, paste image), headless screenshots reviewed by a fresh critic pass.

## E7 — Tags and timeline filters (added by Weng, t4u-appts)
- Every entry can carry one or more tags. Tags are stored per account (`doc.tags`: id, label, color) and created on the fly from a type-ahead picker ("+ Create “…”" or Enter).
- Timeline filter by entry type: the chips are derived from the types that actually appear in the timeline's events (after the condition filter), not from every defined type. Archived types still appear if their entries are on the timeline.
- Timeline filter by tags: pick one or more tags; an event matches when its entry has **all** selected tags. Tag chips are likewise derived from tags present on timeline entries.
- Tags are renamed/recolored centrally; deleting a tag only removes it from entries, never the entries.

## E8 — Type icons and colors (added by Weng, t6u-appts)
- Icons are a built-in inline-SVG set in `js/icons.js` (no fonts, emoji, or dependencies), stored on the type as an icon key. Each of the 10 built-in types seeds a distinct icon: stethoscope (doctors), calendar (visits), document (letters), scale (appeals), box (supplies), bandage (care), radiation (treatment), pulse-alert (clinical events), receipt (insurance events), traffic cone (care disruptions).
- Custom types pick an icon from the set on the Entry types page; when none is chosen (empty key or an unknown key) a generic placeholder icon is shown.
- Every type, built-in or custom, has a color chosen from swatches or a free color input. Icon tile + color are rendered by one helper everywhere: timeline items, upcoming items, filter chips, entry forms and detail, condition sections, and the Entry types page.
- Contrast: text and icons drawn on a type color use black or white, whichever has the higher contrast ratio (always ≥ 4.5:1). Type color is never used as text on paper.

## E9 — Rich-text notes (added by Weng, t7u-appts)
- Every entry and every condition has a rich-text notes field built from accountability's editor (`js/richText.js`): same toolbar (Bold, Italic, Underline, Bullet list, Numbered list, Link, Add image, My images, Expand editor), same paste/drop behavior, same allowlist.
- Images pasted, dropped, or picked inside notes are uploaded to the account and inserted inline by stored image id; remote image URLs are never kept.
- HTML is sanitized twice: client-side (`cleanHTML`) before save and on display, and server-side (`sanitize_html`, DOM allowlist) before it is written.

## E10 — Documents: PDF and image uploads with labels (added by Weng, t9u-appts)
- Visits cover lab work too: the Visit kind select includes **Lab work** (and Imaging); the doctor link is optional, so a lab draw needs no doctor.
- Any entry and any condition can carry documents: PDFs and images added by file picker, drag-and-drop, or paste (Ctrl/⌘+V). Stored as guarded files in `storage/uploads/<account>/` (content-addressed), validated by magic bytes + MIME (PDF ≤ 20 MB, images ≤ 8 MB), served only through authenticated `api.php`.
- Every document has a **document label**. Seeds per account: Lab, Consultation Note, PCP Note, Progress Note, Imaging, Discharge Summary, Insurance Letter, Other. Typing a new label creates it on the fly; it is saved per account and offered everywhere afterwards.
- A **Documents** page lists every upload across conditions with thumbnails (images) or a PDF tile, filter chips by file type (derived from what exists), by label, and by condition, grouping by label or file type, an inline viewer (image or embedded PDF), and a link back to the owning entry or condition. "Upload documents" on that page attaches files to a chosen condition/entry in one step.
- Rich notes per entry (t8u-appts) are confirmed: every entry has its own rich-text note (E9).

## E11 — Free-text statuses and "Other care disruptions" (added by Weng, t11u-appts)
- Select fields get an **Allow free text** flag (`allowCustom`). Such a select shows its preset options, then values typed before for that field ("Used before"), then **Free text…**, which reveals a text box. The typed text is stored as the field's value and displays, searches, and filters like any preset.
- Every built-in **Status** field has it on: Visits, Authorization & referral letters, Insurance appeals & coordination, Medical supplies, Treatment. Other built-in selects (kind, role, severity…) stay preset-only but can be switched on from the Entry types page. Custom select fields can turn it on when they are added or later.
- The server keeps accepting any text for a select value (≤ 500 chars). Presets are a UI aid, so an old value never becomes unsavable.
- The built-in "Care disruptions" type is renamed **Other care disruptions** (singular "Other care disruption").
- **Migration (document version 2):** on load, a version-1 account document is migrated once under the account lock, after the normal pre-write backup. It renames the disruption type only while its name or singular is still the old default (a user's own rename is kept), and sets `allowCustom: true` on built-in status fields that don't have the flag yet. Conditions, entries, tags, documents, and labels are never touched. The migration is idempotent. `tools/migrate-dry-run.php <account>` shows what would change, using a temp copy.

## E12 — Home health nursing (added by Weng, t14u-appts)
- Three built-in types: **Home health authorizations** (agency, nurse/discipline, authorized visits, start/end, auth #, status with free text, linked insurance event and letter, "Continues authorization"), **Home health visits** (date, time, nurse, linked authorization, outcome: Scheduled / Completed / Missed: waiting for insurance approval / Missed: nurse unavailable / Missed: patient at clinic / Rescheduled, free text allowed), and **Home health events** (Waiting for further approval, Spoke to home health case manager, Re-authorization requested, New visits approved, Agency rescheduled, Nurse changed, free text allowed).
- Decision: events are their own type rather than a select on visits, so they get their own timeline chip and don't pretend to be visits.
- Countdown: only outcome "Completed" counts. States are ok, low (2 or fewer left), used up, awaiting (status Pending/Waiting, or a linked "Waiting for further approval" event), ended (past end date with visits left; quiet), and superseded (a newer authorization continues it).
- Shown on the authorization row and detail, the condition sidebar, and the overview.
- **Migration (document version 3):** appends the three types to accounts that don't have them, after the account's own types. Steps are gated by the version they start from, so a v2 account never re-runs the v2 rename. Records are never touched, and the normal pre-write backup runs first.
- Demo: the scalp condition has a used-up first authorization, three missed visits (one per reason), a waiting-for-approval event, a case manager call, and a second authorization with 2 of 5 left.

## E13 — AI intake skill (added by Weng, t15u-appts)
- `.agents/skills/log-health-update/SKILL.md` is for AI coding agents working in the repo. It asks which account (listed from `includes/accounts.php`) and which condition (listed, or a new one), never asks for a password, extracts facts from images, PDFs, and text, maps them to the account's current entry types (custom included), shows a preview, and applies the plan on confirmation.
- `tools/intake.php` (PHP 7.4+) provides `accounts`, `conditions`, `types`, `entries`, and `apply [--dry-run]`. It reuses `includes/storage.php` (lock, atomic write, backup first) and the app's own `apply_ops` validation, and the whole plan is checked before anything is written. Attachments go through the app's upload rules into `storage/uploads/<account>/` with reusable document labels. Tags are created on the fly and `@ref` links work within a plan.
- Append-only by design: updates fill only empty fields, add tags, append notes, and add documents. Changing a filled value or a title is refused with a suggestion. Plans have no delete operation.
- Decision: accounts are limited to `accounts.php` plus accounts that already have a stored document, so tests can use a temporary account without adding a login.
- No Add-with-AI harness panel exists in Appts, so there's nothing to mention the skill in.

## E14 — Offline mode (relayed from Weng via APP All Root, t17-appts)
- Ported from Postop's Offline mode (OFFLINE_MODE.md "Reusing this in another PHP app"). Postop was read-only and untouched.
- A header toggle plus (i) explainer (inline SVG of a doctor at a clinic without guest Wi-Fi: turn this on first, while you're still online), and a status panel (on/off, last saved, items, size, waiting changes).
- `sw.php` worker: when on, every same-origin GET is answered from Cache Storage (exact, normalized, saved app page, friendly miss page). Only the version check reaches the network.
- `api.php?action=offline-plan`: shell, views, data JSON, and the account's uploads with sizes, deduplicated, own account only.
- Writes while on (or while unsynced) are queued in IndexedDB, including pasted images and PDFs. Sync after turning off is a three-way merge that never loses data (a clash keeps the server value and writes ours into the notes).
- A new version re-saves the copy, keeps the mode on, and reloads. Sign-out waits for sync, then clears the account copy.
- Decisions: records and app always saved, documents chosen per condition; the version covers every shell file (Appts is many modules); `sw.php` at the app root so the scope is right under MAMP and php -S.

## E15 — Built-in Disruptions filter (Weng, t18u-appts)
- A **Disruptions** preset on the Timeline: insurance denials, missed, cancelled, or rescheduled visits, delays, backorders, paused or pending approvals, plus every appeal, clinical event, and other care disruption.
- The rule reads the entry type and the value of every choice field, so free-text statuses ("Backordered at pharmacy") and the user's own types count too. Free text in other fields does not, to keep it precise.
- **Edit Disruption mode** exists only for this filter. It shows every event, with those outside the filter grayed out; a click adds or removes one. Edits are saved per account as a `filters` record (`id: disruptions`, include/exclude entry ids), so the built-in rule keeps working for new entries.
- Offline: the record queues like any other and merges as two sets on sync.

## E16 — @ links in notes (Weng, t18u-appts)
- Typing `@` in any rich note (entries and conditions) opens a popover at the caret: **Documents** (every uploaded PDF and image once), **Events** (every entry, newest first), **Notes** (records with notes already written).
- Hovering a library lists its items; typing after `@` filters all libraries at once into one list; full keyboard support.
- The chip stores only kind, id, and label. Both sanitizers enforce that, and click handling is added only when a saved note is displayed. A document chip opens the viewer; an event or note chip opens the record. Works offline, because the data comes from the saved copy.
- Decisions: the label is captured when linked (a later rename keeps the old label; the link still opens the right record); deleted targets show a notice instead of failing.
