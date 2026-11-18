---
name: clinical-significance
description: Draft or update a condition's Clinical significance highlights in Appts from its reports (pathology, imaging, orders, denials), with key-phrase links that jump to the source entries. Use when asked to add, refresh, or check highlights.
---

# Clinical significance highlights

The condition page shows a compact **Clinical significance · N** bar (collapsed by default). Expanded,
it is a panel docked to the bottom of the screen. Each highlight is one short, sourced statement; its
**key phrases** are links that scroll the condition page to the entry they come from and flash it.

## Rules (medical records: exact and serious)

1. **Only what the records say.** Every number, date, and diagnosis must come from an entry or an
   attached document. Never estimate, round, or "improve" clinical wording. Quotes are copied exactly.
2. **Flag mismatches, don't fix them.** If records disagree (wrong diagnosis on an order, wrong body
   site, wrong code), say so in `caveat`, which shows as a visible **Check:** note.
3. Use `certainty`: `documented` (in a report), `reported` (someone said it; no report), `uncertain`.
   Use `origin: "ai"` for anything you draft.
4. Neutral titles; no "Per Weng:" prefixes; no jokes or filler.
5. **Back up first.** `tools/intake.php apply` backs up the account automatically. Always run
   `--dry-run` first and read the preview.

## Steps

1. Read the condition and its entries:
   `php tools/intake.php entries <account> --condition=<id>` and the existing highlights:
   `php tools/intake.php highlights <account> --condition=<id>`.
2. Pick the facts that change care or prove urgency: final pathology (Breslow depth, ulceration),
   imaging impressions, staging steps done or missed, delays, denials and appeal deadlines, orders.
3. Write a plan (`highlights` block) and apply it:

```json
{"condition": "<condition id>", "highlights": [
  {"order": 0, "title": "Final pathology after the wide local excision", "date": "2026-09-21",
   "summary": "Invasive acral lentiginous melanoma, Breslow thickness about 6.6 mm, ulcerated.",
   "detail": "Longer context, shown under “Detail and sources”.",
   "quote": "Exact words from the report.",
   "caveat": "Only if something needs checking.",
   "certainty": "documented",
   "entry": "<source entry id or exact title>", "file": "<attached file name or id>",
   "links": [
     {"text": "Breslow thickness about 6.6 mm", "entry": "<entry id, ref, or exact title>"}
   ]}
]}
```

   `php tools/intake.php apply <account> plan.json --dry-run`, then without `--dry-run`.
   An existing title is left alone unless the item has `"update": true`.

## Key-phrase links (`links`)

- Stored on the highlight as `links: [{text, entryId}]`. The app turns the first occurrence of each
  `text` in the summary, detail, or caveat (case-insensitive; longest phrase first; no overlaps) into a
  link. The text itself stays plain, so the record's wording is never changed by the markup.
- `text` must appear verbatim in the summary or detail (the intake tool refuses it otherwise) and
  `entry` must be an entry in the same condition.
- Link the phrase that names the evidence ("Breslow thickness about 6.6 mm", "lymph node machine was
  broken", "C43.59") to the entry that holds that document or event. Aim for 1–5 links per highlight.
- Clicking a link clears condition filters if they hide the entry, scrolls to it, and flashes it.
- In the app, the highlight form's **Key phrase links** rows edit the same data.

## Verify

Open the condition, expand Clinical significance, click each link once, and check it lands on the
right entry. Report what was added, with sources, and every caveat raised.
