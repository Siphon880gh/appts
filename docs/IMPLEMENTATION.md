# Appts implementation notes

Appts was cloned from `app/motivation/accountability` (base commit `3c0897e`) and rebuilt as a server-backed, condition-organized medical-visit tracker. See [EPICS.md](EPICS.md), [MILESTONES.md](MILESTONES.md), and the [gauntlet contract](gauntlet/contract.md).

## Architecture
- **Shell:** `index.php` sends security headers and a strict CSP, then renders `includes/head.php` and `layout.php`. `js/app.js` routes on the hash (`#/`, `#/c/<id>`, `#/timeline`, `#/upcoming`, `#/documents`, `#/types`).
- **API:** `api.php?action=` session, login, logout, data, ops, upload, files, file, image, images, and reset-demo (demo only). POSTs need `X-Appts: 1`.
- **Document model** (one JSON doc per account): `conditions`, `types` (with `fields`, `retiredFields`, `icon`, `color`, `archived`, `order`), `entries` (`typeId`, `conditionId`, `title`, `values`, `tagIds`, `notes {html}`, `attachments [{file,label,name}]`), `tags`, and `docLabels`.
- **Writes:** the client sends `{ops:[{op:'put'|'delete', kind, value|id}]}`. `apply_ops()` cleans every op server-side: it validates field kinds, link targets, tags, labels, and attachments that belong to this account, and sanitizes HTML. The rules are:
  - Types are archived, never deleted.
  - Fields dropped from a type move to `retiredFields`, and entry values stay.
  - A condition that still has entries can't be deleted.
  - Doc labels persist.
- **Storage:** `includes/storage.php` handles the guarded `.php` files, `atomic_write`, `with_lock`, and backups (20 kept). `APPTS_STORAGE_DIR` overrides the root.
- **Uploads:** content-addressed (`sha256.ext`). Images are checked with GD and finfo. A PDF must start with `%PDF-`, carry the `application/pdf` MIME type, and end with `%%EOF`.
- **Client:** `schema.js` holds pure, tested domain logic (events, filters, sorting, contrast). `documents.js` handles document grouping and labels. `forms.js` builds the entry and condition forms, the tag picker, the document zone, and the viewer. `richText.js` is the editor and sanitizer adapted from accountability.

## Decisions
| Decision | Why |
| --- | --- |
| Data files are guarded `.php` | `php -S` without a router would otherwise serve `storage/` files directly |
| "Other care disruptions" for the logistics event | Weng's rename (t11u) of the original "Care disruptions": the patient impact (a broken machine, a cancelled slot), not shipping |
| Free text on select fields (`allowCustom`) | Weng (t11u): every built-in Status field offers presets plus typed text. The server stores any text, so presets are only a UI aid; typed values are suggested again |
| Document version 2 + migration on load | Existing accounts (including `wf`) get the rename and the free-text flags without touching records. It's idempotent, runs under the lock, backs up first, and keeps user renames. `tools/migrate-dry-run.php` previews it on a copy |
| Every date field produces a timeline event | One rule covers built-in and custom types alike |
| Next up shows one event per record | Showing the same record twice (care date plus next due) was noise; the full Upcoming view keeps every event |
| `wf` shares the demo password at first | As requested; `tools/set-password.php` changes it |
| PDF viewer is an iframe, with no sandbox CSP on PDFs | Chrome's PDF viewer breaks under `sandbox`; images keep it |
| Badge text is pure black or white | `#111` failed 4.5:1 on some type colors |

## Known gaps
- `wf` starts with the publicly shown demo password. Run `php tools/set-password.php wf`.
- PDF responses aren't CSP-sandboxed (see above). They're same-origin, nosniff, and validated.
- Plain `php -S` caps uploads at 2 MB. Use `tools/serve.sh`.
- PDF thumbnails are a generic tile; there's no server-side PDF rendering (no new dependencies).
- No export/import yet; backups are server-side only.
