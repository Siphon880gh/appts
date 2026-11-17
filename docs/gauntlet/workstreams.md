# Workstreams

Coupled pieces (storage format ↔ schema ↔ rendering) are built in one sequential chain; only independent pieces run beside it.

| Id | Workstream | Depends on | Coupled with | Judge by |
|----|-----------|-----------|--------------|----------|
| W1 | Storage + auth + API | — | W2 (op shapes) | G1, G2, G5–G8 |
| W2 | Schema + built-in types + validation | W1 | W3 (rendering) | G3, G4 |
| W3 | UI: overview, condition, entry form/detail, types page, timeline, upcoming, search/filter | W2 | W4 | G9, G10 |
| W3b | Tags + timeline type/tag filters | W3 | W2 (schema) | G14–G16 |
| W3c | Type icons + colors | W3b | W3 rendering | G17–G19 |
| W4 | Pictures: paste / drop / pick into notes and entries | W1, W3 | — | G11 |
| W4b | Rich-text notes | W4 | W3 rendering | G20–G22 |
| W5 | Demo seed | W1, W2 | — | G12 |
| W6 | Brand, README, .impeccable.md, screenshots | W3–W5 | — | G13 |

Integration: W6 runs a single smoothing pass, then the final fresh critic judges the whole app.
