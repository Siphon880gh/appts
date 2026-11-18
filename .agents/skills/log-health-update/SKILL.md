---
name: log-health-update
description: Turn free-form notes, photos, screenshots, and PDFs about appointments, insurance, clinical changes, care disruptions, or home health nursing into Appts records for a chosen account and condition. Use when someone in this repo drops files or describes what happened ("the nurse didn't come", "insurance denied the MRI", "here's my lab report") and wants Appts updated.
---

# Log a health update into Appts

You are working directly in the Appts codebase, so no password is needed and you must never ask for one. All reads and writes go through `tools/intake.php`, which uses the app's own storage code (atomic writes, the account lock, a backup before every write) and **never deletes or overwrites** anything.

Use the PHP the app runs on. On Weng's Mac that's MAMP's `/Applications/MAMP/bin/php/php7.4.33/bin/php`; plain `php` (8.x) works too. Run every command from the repo root (`app/healthcare/appts`).

## 1. Ask which account

Run `php tools/intake.php accounts` and list the accounts by display name and username, for example "Weng (`wf`)" and "Demo Patient (`demo`)". Ask which one this update is for. `wf` holds Weng's real records and `demo` is sample data, so never guess.

## 2. Ask which condition

Run `php tools/intake.php conditions <account>` and list the conditions by name, with their entry counts. Ask which one the update belongs to, and offer **"a new condition"** as an option. For a new condition, ask for its name and, optionally, when it was diagnosed.

If the material clearly covers more than one condition, say so and do one condition per plan.

## 3. Read everything the user gave you

- **Images** (photos, screenshots, faxes): look at them and read any text in them.
- **PDFs**: run `pdftotext -layout file.pdf -`. If that returns nothing (a scanned PDF), open it as images.
- **Free text**: treat it as the user's own account of what happened.

Extract only what is actually there: dates, times, who (doctor, nurse, agency, insurer, case manager), what happened, statuses, reference or auth numbers, visit counts, amounts, deadlines, and follow-ups. Resolve relative dates ("last Tuesday") against today's date and say how you resolved them. Don't invent values. If something is unclear, leave the field empty and mention it in that entry's notes or ask.

## 4. Map the facts to the account's entry types

Run `php tools/intake.php types <account>`. It returns this account's own definitions, **including custom types and renamed built-ins**, with each field's id, label, kind, select options, and whether free text is allowed (`allowCustom`). Always map to what it returns, not to the list below.

Typical built-in mappings:

| What happened | Entry type (id) |
| --- | --- |
| Appointment, lab draw, scan, telehealth | Visit (`visit`); lab work uses Visit kind "Lab work" with no doctor needed |
| A new doctor, specialist, or therapist | Doctor (`doctor`) |
| Referral, prior authorization, or medical-necessity letter | Letter (`letter`) |
| Denial, approval, claim paid, bill, request for info | Insurance event (`insurance_event`) |
| Appeal or ongoing insurance case | Appeal (`appeal`) |
| Symptoms or wound got better or worse | Clinical event (`clinical_event`) |
| Machine down, cancelled slot, transport or supply problem | Other care disruption (`disruption`) |
| Supplies ordered, delivered, or backordered | Supply (`supply`) |
| Routine like wound care or exercises | Care (`care`) |
| A course of radiation, PT, or infusions | Treatment (`treatment`) |
| Home health visits approved (count, dates, auth #) | Home health authorization (`hh_auth`) |
| A nurse visit, done or missed | Home health visit (`hh_visit`), with outcome "Completed" or "Missed: waiting for insurance approval", "Missed: nurse unavailable", or "Missed: patient at clinic" (or free text) |
| Waiting for approval, a call with the case manager | Home health event (`hh_event`) |

Only home health visits with outcome **Completed** count down an authorization. Link each home health visit and event to its authorization. When insurance approves more visits, create a new authorization whose "Continues authorization" field points at the old one.

Then look for existing records to link to or extend: `php tools/intake.php entries <account> --condition=<id>`, optionally with `--type=<id>` or `--query=<text>`. Prefer linking to an existing doctor, visit, letter, or authorization over creating a duplicate. The helper warns when a new entry looks like an existing one.

## 5. Write a plan, dry-run it, and show a short preview

Write the plan as JSON in a temporary file outside the repo (for example `/tmp/appts-plan.json`). Never put it in `storage/`. Then run:

```sh
php tools/intake.php apply <account> /tmp/appts-plan.json --dry-run
```

Show the user a short, plain-language preview built from that output: each entry to create or update, its key values, links, tags, and attached files with their labels. Add any warnings and any assumptions you made, such as resolved dates or fields you left empty. Ask them to confirm or correct it. If they change something, edit the plan and dry-run again.

## 6. On confirmation, apply it

```sh
php tools/intake.php apply <account> /tmp/appts-plan.json
```

Report what was saved, then tell the user to reload Appts and open the condition (the output ends with its `#/c/<id>` link). Delete the temporary plan file afterwards. Don't commit anything under `storage/`, since it's git-ignored real data.

## Plan format

```json
{
  "condition": "cond-skin",
  "create": [
    {
      "ref": "auth3",
      "type": "Home health authorization",
      "title": "Wound care nursing: 6 more visits",
      "values": { "agency": "Sample Home Health Agency", "visits_authorized": 6, "start": "2026-12-07",
                  "status": "Approved", "reference": "HH-1234", "previous": "hh-auth-2" },
      "tags": ["Paperwork"],
      "notes": "Approval came by fax.\nCase manager: Sam.",
      "attachments": [{ "path": "/Users/me/Downloads/approval.pdf", "label": "Insurance Letter" }]
    },
    {
      "type": "hh_visit",
      "title": "Dressing change",
      "values": { "date": "2026-12-08", "nurse": "Pat, RN", "authorization": "@auth3", "outcome": "Missed: nurse unavailable" }
    }
  ],
  "update": [
    { "id": "visit-rad-consult", "values": { "follow_up": "2026-12-20" }, "tags": ["Follow-up needed"],
      "notes": "Doctor's office called to confirm.", "attachments": [{ "path": "/tmp/note.png", "label": "Progress Note" }] }
  ],
  "conditionUpdate": { "notes": "New agency starting next week.", "attachments": [{ "path": "/tmp/summary.pdf", "label": "Discharge Summary" }] }
}
```

- `condition`: an existing condition's id or exact name, or `{"new": {"name": "...", "summary": "...", "diagnosedOn": "YYYY-MM-DD", "notes": "...", "attachments": [...]}}`.
- `type`: a type id, name, or singular name. `values` keys can be field ids or field labels.
- **Dates** use `YYYY-MM-DD`. **Numbers** can be numbers or numeric strings. **Checkboxes** take true or false (or "yes" and "no").
- **Selects** match presets in any case. Other text is accepted only when the field allows free text; otherwise the helper lists the valid options.
- **Links** take an existing entry id, or `"@ref"` for an entry created earlier in the same plan. The linked entry must be the field's target type.
- **Tags** and **document labels** reuse existing ones by name (any case) and create new ones on the fly. Seeded document labels are Lab, Consultation Note, PCP Note, Progress Note, Imaging, Discharge Summary, Insurance Letter, and Other.
- **Attachments**: PDFs up to 20 MB, and PNG, JPEG, GIF, or WebP images up to 8 MB. Files are copied into `storage/uploads/<account>/` and the originals are left where they are. A file that's already attached is skipped.
- **Notes** are plain text: a blank line starts a new paragraph. On updates, notes are appended to the existing notes.
- `update` only fills fields that are **empty**, adds tags, appends notes, and adds documents. It refuses to change a filled-in value or a title. When something changed (a status went from Pending to Approved, say), record it as a new entry such as an insurance event, or as an appended note, and tell the user they can edit the old value in the app.
- The whole plan is checked with the app's own rules first. If anything is wrong, nothing is written and the error names the entry and field.

## Command reference

```text
php tools/intake.php accounts
php tools/intake.php conditions <account>
php tools/intake.php types <account>
php tools/intake.php entries <account> [--condition=<id>] [--type=<id>] [--query=<text>]
php tools/intake.php apply <account> <plan.json|-> [--dry-run]     # "-" reads the plan from stdin
```

`APPTS_STORAGE_DIR=/some/dir` points the helper at another storage root; the tests use this. Tests live in `tests/intake.test.php` and run against `demo` and a temporary account, never `wf`.

## Never

- Ask for or print a password, or read `includes/accounts.php` hashes or `storage/` files directly.
- Edit `storage/` by hand, delete records, or work around the helper's refusal to overwrite.
- Write to `wf` without the user explicitly choosing it in step 1, or try a plan on `wf` "to see what happens". Use `--dry-run` for that.
