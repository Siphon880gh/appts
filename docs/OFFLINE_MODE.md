# Offline mode

Ported from `app/healthcare/postop` (docs/OFFLINE_MODE.md, commits 1630fa4..2caa3de) for Weng's t17 request.
Purpose: some clinics don't share their internet. Turn Offline mode on at home, while still online, and
Appts then opens every page, record, and document from a copy on the device. Changes made at the clinic
are kept on the device and synced when the mode is turned off.

## Pieces

| File | Role |
|---|---|
| `includes/version.php` | `app_version()`: 10-char hash of the shell files' mtimes and sizes (index.php, its includes, styles.css, every `js/*.js`, sw.php, manifest.php, includes/sw.js) |
| `sw.php` + `includes/sw.js` | The service worker, served from the app folder (scope = the folder, MAMP subpath or php -S root) with the version injected and `no-store` |
| `manifest.php` + `assets/icon*.{svg,png}` | Web app manifest (`start_url ./index.php`, `scope ./`), linked as `manifest.php?v=<version>` |
| `api.php?action=version` | The only request Offline mode lets reach the network. No sign-in needed |
| `api.php?action=offline-plan` (`includes/offline.php`) | Signed-in only. Lists the shell (with byte sizes), one URL per view, the data URLs (`session`, `data`, `images`, `files`), and per condition the uploads its records reference, with byte sizes, deduplicated, plus an estimate. Built only from the session account's document and upload folder |
| `js/offline.js` | Header toggle **Offline On/Off** plus (i), the status panel, the clinic explainer (inline SVG), filling the copy, version updates, sync, sign-out guard |
| `js/outbox.js` | Mode state (`localStorage['appts-offline']`), IndexedDB `appts-offline` (`pending` records, `files` added offline), overlay of queued changes |
| `js/merge.js` | Pure helpers: apply ops locally like api.php, overlay, three-way merge, sync plan (Node-tested) |

## Caches

- `appts-offline-shell`: `./`, `index.php`, `styles.css`, every module, manifest, icons.
- `appts-offline-acct-<account>`: `api.php?action=session|data|images|files` and `api.php?action=file&id=…` for the chosen conditions' documents. Uploads are only ever served by authenticated api.php, so these are the signed-in account's responses and nobody else's.
- `appts-offline-state`: `./__appts-offline-mode` → `{on, at}`. The worker reads it once and keeps it in memory; the page updates it with `postMessage({type:'appts-offline-mode', on})`.

## Worker rules

- Requests with `X-Appts-Fill: 1` (saving the copy, reading the plan) and `sw.php` itself always go to the network. So do POSTs (writes are queued by the page instead).
- **Off:** normal network. A failed page navigation falls back to the saved app page.
- **On:** every same-origin GET is answered from Cache Storage only:
  1. exact match;
  2. normalized URL: `dir/` = `dir/index.php`, query sorted, `v` and `t` ignored, `action=image` and `action=file` share one copy, `name` and `download` ignored;
  3. nearest saved page: any `index.php?…` or the folder URL is the saved app page (all views are hash routes of index.php);
  4. a friendly "Not saved for offline use" page for other pages, or a 504 JSON for other requests.
  Only `api.php?action=version` may try the network (503 JSON when unreachable).

## Turning it on

The panel fetches the plan, lists each condition with its document count and size (all checked), and shows the estimate next to
`navigator.storage.estimate()` free space. **Turn on** asks for `navigator.storage.persist()`, refuses up front when the estimate
won't fit, deletes the old copy, and fetches every URL with 4 workers using `cache:'no-store'` and the fill header, showing
"Saving n of N…". A quota error, or a failed shell or data URL, deletes the partial copy and leaves the mode **off**. A
missing document only counts as "could not be saved". Then the state goes to localStorage, Cache Storage, and the worker.

Decision: the records (the account's data JSON) and the app are always saved; only documents are chosen per condition. The
JSON is small and every view and the sync merge need all of it.

## While on

`store.save(ops)` and `images.send(file)` are the only write paths, and both check `queueing()`: true while the mode is on
**or** while earlier offline changes are still unsynced, so writes can never jump the queue.
- Saves apply the ops to the local document (`applyLocal`, mirroring api.php: entries keep unsent values, condition deletes
  with entries and type/label deletes are refused) and store one `pending` item per record: `base` (the record when first
  touched offline) and `ours` (latest, or null if deleted).
- Uploads (paste, drop, file picker) are hashed with SHA-256 like the server (`<sha256>.<ext>`). The blob is kept in IndexedDB
  and put into the account cache at `api.php?action=file&id=…`, so it shows immediately and after a reload.
- Every load (boot, focus, reload) shows the saved or server document with the pending records on top.
- The toggle shows a count of waiting changes. Reset demo is blocked. Sync is blocked until the mode is off.

## Turning it off and syncing

Turning off flips the flag (network again) and the panel offers **Sync n changes now**:
1. queued files are uploaded; if the server assigns another id, references are remapped;
2. the current server document is fetched;
3. each record is merged three-way (`planSync`):
   - created offline → put;
   - deleted offline → deleted only if the server copy is unchanged since `base`, otherwise kept and reported;
   - edited offline but deleted on the server → restored and reported;
   - both changed → per key: one-sided changes win; `values` merge per field; tag, option, image, and attachment lists merge
     as sets; type fields merge by id; notes edited on both sides keep both texts; any other clash keeps the server value,
     and for entries and conditions our value is written into the notes ("Offline edit not applied…"), so nothing is lost;
4. ops are sent in server order (tags, labels, types, conditions, entries, then deletes) in chunks of ≤200. If a chunk
   fails, each op is retried alone, and failures stay queued with their error. The panel lists them with **Discard this change**.

## Versions

The version is in the worker URL (`sw.php?v=`), the manifest URL, and `<meta name="appts-version">`. When the mode is on and
the page is online, boot asks `action=version`. If it differs, it re-saves the copy (new shell and current data, same
condition choice), installs the new worker **before** reloading (otherwise the reloaded page keeps the old worker
controlling it), keeps the mode on, and reloads once (sessionStorage guard).

Decision: unlike Postop (one big index.php), Appts' code is spread over many modules, so the version covers every shell
file. Otherwise an edit to a JS module would leave a stale copy.

## Sign-out

Sign-out is refused while anything is waiting to sync (the panel explains why). Otherwise, after the server signs out, the
account cache, the shell cache, the account's IndexedDB items, and the state are removed and the mode is off.

## Tests

- `tests/offline.test.py` (headless Chromium, php -S, temp storage, demo plus a temp `otheracct`; never wf): G40–G49.
  It turns the mode on with the server running, stops the server, reloads, opens every view and a PDF/image, and queues an
  entry edit, a new entry with a pasted image, and a type edit. Then it restarts the server, makes a server-side edit, turns
  the mode off, syncs, checks the merge over the API, bumps the version, simulates a full disk, and signs out.
- `tests/merge.test.mjs`: the merge rules.
- `tests/live.check.py`: worker registration and scope under MAMP's `/weng/app/healthcare/appts/`, offline-plan, cache-only
  answer.
