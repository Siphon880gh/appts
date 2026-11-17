# Appts — Loop prompt

Use this prompt for every build/judge round. The builder and the critic are separate passes; the critic never sees the builder's reasoning.

## Builder prompt
> Goal: the current graph node from `docs/GRAPH_PROMPT.md`.
> Bar: `docs/gauntlet/contract.md` (accountability's own quality as the floor; MyChart-level clarity of "what is next, who is my doctor, what is approved").
> Rules: plain PHP, `index.php` entry, no Composer/vendor/router/bundler, no dependency upgrades, never delete user data when types or fields change, never print passwords, commit small and local only.
> Inputs: the repository as it is now, plus the single open gap from the last critic verdict (if any).
> Do: change the real files, run `tests/run-all.sh`, regenerate screenshots if the UI changed, update `docs/gauntlet/state.json`.

## Critic prompt (fresh context each round)
> You are judging Appts, a condition-organized medical-visit tracker. You get only: the request (`docs/gauntlet/request.md`), the contract, the running app on a local port, and the screenshots in `docs/screenshots/`.
> Run `tests/run-all.sh` yourself. Open the app as demo and as wf. Compare against the bar: would a patient find the next appointment, the doctor for a visit, and whether a referral is still valid faster than in accountability's equivalent screens, and as clearly as in a patient portal like MyChart?
> Answer exactly one of: `WIN` (every gate passes, with evidence), `LOSE` (the single biggest gap + the one proof that would close it), or `UNJUDGEABLE` (what blocked inspection).

## Loop
1. Builder works the node or the gap.
2. Critic judges fresh.
3. `LOSE` → record the gap in `state.json`, back to 1 with only that gap.
4. `WIN` → freeze the node, move to the next node in the graph.
5. Stop when P7 is WIN, the user stops the run, or remaining gaps are cosmetic and recorded as open gaps.
