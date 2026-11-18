---
name: print-contrast-fix
description: Make a faded, pale, or badly scanned medical PDF or photo print with solid black text, save it as a new "(print, black)" version, and attach it to its Appts event. Use when a record prints faded, washed-out, blue, gray, or hard to read, or a scan/photo of a document needs more contrast for printing or faxing.
---

# Print contrast fix

A faint report (thin light-gray or blue text, gray background, scanner specks) becomes a crisp black-on-white
PDF at US Letter size. This is the recipe that fixed the faded "CT Left Foot 10.11.26 - Hong Xiaoping.pdf"
(Weng confirmed the print looked great).

## Rules

- **Never alter or overwrite the original.** Work on a copy. The new file is a separate version named
  `<original name> (print, black).pdf`.
- **Back up the account before attaching** (`tools/intake.php apply` takes one automatically; also copy
  `storage/data/<account>.json.php` to `storage/backups/<account>/manual-<YYYYMMDD-HHMMSS>/` first).
- **Verify the clinical text is intact** before attaching: compare page 1 (and every page with numbers on it)
  of the original and the new version side by side. Every date, measurement, name, impression line, signature
  line and footer must still be readable. If any text is lost, lower the strength (see Tuning) and redo it.
- Remove older versions only when the user asks. Before deleting an upload, re-point any `@` file mentions in
  notes (`data-mention="file" data-ref="<old id>"`) to the new id, and delete the upload file only when no
  entry, condition, or highlight still references it.

## 1. Get the original out of storage

Uploads are stored guarded: `storage/uploads/<account>/<sha256>.<ext>.php`. Decode to a work folder:

```sh
php -r 'require "includes/storage.php"; file_put_contents("/tmp/orig.pdf", guarded_decode(file_get_contents("storage/uploads/wf/<id>.php")));'
shasum -a 256 /tmp/orig.pdf   # must equal the id
```

(Use the file the user sent directly if it is not in Appts yet.)

## 2. Make the print copy

```sh
tools/print-contrast.sh "/tmp/work/CT Left Foot 10.11.26 - Hong Xiaoping.pdf"
# -> "/tmp/work/CT Left Foot 10.11.26 - Hong Xiaoping (print, black).pdf" and a "...preview.png" of page 1
```

What it does (do the same by hand if the script is not available):

1. **Render at 300 dpi.** PDFs: `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -r300 -sOutputFile=src-%03d.png in.pdf`.
   Images (JPG, PNG, TIFF, HEIC/HEIF photos of paper): `magick in.heic -auto-orient -background white -alpha remove src-%03d.png`.
2. **Grayscale + levels:** `-colorspace Gray -level 0%,75%,0.5` pushes faint gray/blue text to solid black.
3. **Speck cleanup:** `-white-threshold 90%` makes the near-white background and scanner dust pure white.
4. **Thicken strokes 1 px:** `-morphology Erode Diamond:1` (erode grows dark text on a white page).
5. **Letter size:** fit each page into 2550x3300 px (3300x2550 for landscape) on white, then
   `magick p-*.png -units PixelsPerInch -density 300 -compress Zip out.pdf` → MediaBox 612x792 pt.
   Do not use `-page Letter` here; it shrinks the page to a fraction of Letter.

### Tuning

- Text still pale: `--level 70%` (or gamma `0.45`).
- Letters filling in / blobby (heavy original, small print): `--no-thicken`, or `--level 80%`.
- Photo of a page with shadows or a dark table: crop and deskew first (`magick in.jpg -deskew 40% -trim`),
  or flatten uneven lighting (`-lat 60x60-8%` instead of `-level`) and check closely that nothing was lost.
- Colored highlights or stamps that matter: say so to the user; grayscale turns them gray or black.

## 3. Check it visually

Open the preview PNG (or `gs -sDEVICE=pnggray -r150` each page) next to the original rendered the same way.
Confirm: black text, pure white background, page count unchanged, `gs -dPDFINFO` shows `612 792`,
nothing cut off at the edges, every number and line from the original present.

## 4. Attach it to the event

```json
{"condition": "<condition id>", "update": [{"id": "<entry id>", "attachments": [
  {"path": "/tmp/work/<name> (print, black).pdf", "name": "<name> (print, black).pdf", "label": "<same label as the original, e.g. imaging>"}]}]}
```

```sh
php tools/intake.php apply <account> plan.json --dry-run   # read the preview
php tools/intake.php apply <account> plan.json             # backs up first, bumps the revision
```

Report: the new file name and id, the entry it is attached to, the backup, and the preview path. Offer to put a
copy on the user's Desktop for printing.
