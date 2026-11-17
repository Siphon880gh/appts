# Appts — Graph of build prompts

Each node is a self-contained build prompt. A node may start only when all of its parents are frozen (their gates pass). Coupled parts (schema, storage format, rendering) are kept in one chain so they never drift.

```
P0 docs ──► P1 storage+auth ──► P2 schema+types ──► P3 UI shell+views ──► P3b tags+timeline filters ──► P4 pictures ──► P6 docs+screens ──► P7 final gauntlet
                     │                  │                                   ▲
                     └──────────────────┴──► P5 demo seed ──────────────────┘
```

## P0 — Planning docs
Write EPICS, MILESTONES, this graph, LOOP_PROMPT, and `gauntlet/` (request verbatim, contract, workstreams, state). Commit before any code.

## P1 — Storage and accounts (parents: P0)
Build `includes/storage.php` (path helpers, guarded read/write, `flock` on a sidecar lock file, temp+rename, backups capped at 20), `includes/auth.php` (session cookie HttpOnly + SameSite=Strict, `password_verify`, account list from `includes/accounts.php` with optional git-ignored overrides), and `api.php` (`session`, `login`, `logout`, `data`, `ops`, `upload`, `image`, `images`, `reset-demo`). All writes require POST + `X-Appts: 1` header. Storage root overridable by `APPTS_STORAGE_DIR` for tests. Prove with `tests/storage.test.php` and `tests/api.test.py`.

## P2 — Schema and extensible types (parents: P1)
Seed ten built-in types (seven originals + Clinical events, Insurance events, Care disruptions) in `includes/seed-types.json` with stable field ids. Implement `js/schema.js` as pure ES module (no DOM): `validateEntry`, `entryTitle`, `entryEvents`, `upcoming`, `matchesSearch`, `filterEntries`, `addField`, `removeField` (→ `retiredFields`), `restoreField`, `moveField`, `archiveType`, `backlinks`, `linkTargets`. Server validates op shapes (ids, sizes, kinds) and sanitizes rich HTML with an allowlist. Prove with `tests/schema.test.mjs`.

## P3 — UI shell and views (parents: P2)
Rebrand head/layout. `js/app.js` renders login, overview (hero, condition cards, upcoming), condition workspace (type chips, status filter, search, grouped entries), entry form and detail from definitions, Entry types page, timeline and upcoming views. Hash state (`#/condition/<id>`, `#/types`, `#/timeline`) so reloads return to the same view.

## P3b — Tags and timeline filters (parents: P3)
Add `doc.tags` and `entry.tagIds` (server-validated; unknown tag ids dropped on save). Tag picker in the entry form: type-ahead over existing tags, Enter or "+ Create" makes a new tag in the same save. Pure helpers in `js/schema.js`: `timelineTypes(events)` (types present, in definition order), `timelineTags(events)`, `filterEvents(events,{typeIds,tagIds,conditionId,query})` with AND semantics for tags. Timeline renders type and tag chips only from what is present. Prove with node tests and the browser test (create tag on the fly → reload → still there → filter by one and two tags).

## P3c — Type icons and colors (parents: P3b)
Add `js/icons.js` (keyed inline SVG set + `placeholder`), `typeBadge(type)` rendering an icon tile in the type color with `readableText(color)`. Entry types page: icon grid picker (with "No icon" → placeholder) and color swatches + `<input type=color>`. Server stores `icon` as a key (`^[a-z0-9-]{0,32}$`). Prove with node tests (contrast for all built-ins and random colors, placeholder fallback) and the browser test (change icon + color → reload → still applied; custom type without icon shows placeholder).

## P4 — Pictures (parents: P3c)
Adapt `js/richText.js` and `js/images.js` to the account-scoped API. Paste/drag/pick into rich notes (inline) and into the entry form (attachments gallery). Prove with Playwright synthetic ClipboardEvent carrying a PNG `File`.

## P4b — Rich-text notes (parents: P4)
Mount `richEditor()`/`bindEditor()` in the entry form and the condition form; render saved notes with `noteHTML()`. Keep accountability's toolbar, paste and expanded-editor behavior. Prove with the browser test: bold + bullet list + link survive save and reload; a pasted image inside notes survives reload; a `<script>`/`onerror` payload pasted or sent directly to the API never survives.

## P4c — Documents (parents: P4b)
Generalize uploads to PDF + images (`inspect_file_bytes`, `FILE_ID_PATTERN`), add `doc.docLabels` with seeds and `docLabel` ops, store `attachments` as `{id,name,mime,bytes,label,addedAt}` on entries and conditions. Client: `js/documents.js` helpers (`documentList`, `documentKinds`, `filterDocuments`, `groupDocuments`), attachment zone with label combo (type-ahead + create), Documents page (filters, grouping, viewer, back-links), quick upload dialog. Add Lab work to the Visit kind seed. Prove with api tests (PDF+image persist across restart, isolation for PDFs, custom label reused) and browser tests (filters by file type and label).

## P5 — Demo seed (parents: P1, P2)
`includes/demo-seed.php` builds clearly synthetic conditions and entries (names end in "(sample)", "Dr. Example …") relative to today, exercising every type and every link. `reset-demo` restores it. wf gets only the type seeds.

## P6 — Docs and screenshots (parents: P4, P5)
Playwright screenshots into `docs/screenshots/`. Rewrite README (run, accounts, storage, screenshots), `.impeccable.md`, `docs/IMPLEMENTATION.md`.

## P7 — Final gauntlet (parents: P6)
Run every gate via `tests/run-all.sh`. Fresh critic reviews screenshots + live app against the bar; on LOSE fix the single biggest gap and repeat.
