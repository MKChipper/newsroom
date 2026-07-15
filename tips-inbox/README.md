# tips-inbox

Drop folder for machine-filed tips (currently fed by the `weekly-industry-scan`
Cowork scheduled task, Mondays 08:00). Mirrors the `recordings-inbox` pattern.

## Flow

1. The scan writes `*.tip.json` files here plus a briefing at
   `briefings/industry-scan-YYYY-MM-DD.md`.
2. `node agents/tips-inbox.mjs --once` (or without `--once` to keep watching)
   files each tip into Convex via `pipeline:addTip`, then moves the file to
   `tips-inbox/filed/`.
3. The newsroom runner picks the tips up as normal: tip line extracts claims,
   story desk decides which earn idea cards.

Run the watcher wherever you start the runner — e.g. alongside
`node agents/runner.mjs`.

## Tip file format

```json
{
  "kind": "url" | "note" | "ruling" | "reddit",
  "sourceUrl": "https://primary-receipt...",
  "rawText": "summary, suggested angles, secondary source URLs",
  "note": "industry-scan 2026-07-20 · short label"
}
```

`ledger.md` is the scan's state file (last-run date + dedup memory) — the
watcher ignores it. Don't hand-edit unless you want to forget/allow a signal.
