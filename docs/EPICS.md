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
- Seven built-in types are only seed definitions stored per account: Doctors/specialists, Visits, Authorization/referral letters, Insurance appeals/coordination, Medical supplies, Care, Treatment.
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
