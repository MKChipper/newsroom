# Newsroom

A one-person newsroom for De-Influenced. Stories — not "posts" — move desk to
desk through a state machine: tip line → story desk → writers' room → legal
desk → Gate 1 → (recording) → production → Gate 2 → packaging → posted →
rated. You are editor-in-chief; you commission ideas, approve copy + spend at
Gate 1, record batched VO/intros, approve the final cut at Gate 2, and post by
hand. Everything else is staff.

## First run

```bash
cd ~/Developer/newsroom
npm install

# 1. Backend — first time opens a browser login, then keeps types in sync.
#    Leave it running in its own terminal.
npx convex dev

# 2. Dashboard
npm run dev          # http://localhost:5180

# 3. Agents (separate terminal; uses your Claude Code auth)
npm run agents       # or: node agents/runner.mjs --once
```

Then, in the dashboard:
1. Settings → Seed defaults, then set real numbers in `price_table` and your
   true `speech_wpm`.
2. Brain → add your first docs. Templates live in `brain/seeds/`. The voice
   corpus is the highest-leverage one.
3. Tip line → file a tip. Watch the floor.

## Layout

- `convex/` — schema + functions (pipeline state machine, claims ledger,
  generation manifest, brain, settings, cost ledger)
- `agents/runner.mjs` — polls Convex, runs desk prompt-packs through headless
  Claude Agent SDK sessions, writes structured results back
- `agents/desks/*.md` — the editorial law of each desk
- `src/` — React dashboard (the floor, tip line, recording desk, brain,
  settings)
- `brain/seeds/` — templates for the docs you feed the brain
- `docs/DECISIONS.md` — locked product decisions and build phases
