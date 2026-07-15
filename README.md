# Newsroom

A one-person newsroom for De-Influenced. Stories — not "posts" — move desk to
desk through a state machine: tip line → story desk → writers' room → legal
desk → Gate 1 → (recording) → production → Gate 2 → packaging → posted →
rated. You are editor-in-chief; you commission ideas, approve copy + spend at
Gate 1, record batched VO/intros, approve the final cut at Gate 2, and post by
hand. Everything else is staff.

## Run it

```bash
cd ~/Developer/newsroom
npm run newsroom     # everything: backend + dashboard + all workers
```

Or double-click `Newsroom.app` (rebuild it any time with
`scripts/make-app.sh`). Dashboard: http://localhost:5180

Pieces individually, if you ever need them:

```bash
npx convex dev       # backend only
npm run dev          # dashboard only
npm run staff        # workers only (desks + gates + inbox)
npm run agents       # desk runner (--once to drain and exit)
npm run gates        # telegram gate buttons (--dry-run to preview)
npm run inbox        # recordings-inbox watcher (--once to scan and exit)
npm run memo         # Monday memo — run after adding numbers to Live stories
```

Gates from your phone: when a story reaches Gate 1 or 2, the bot posts the
script + generation manifest with Approve / Redo / Kill buttons (Redo asks
you to reply with a note for the desks). Where messages land is set by
`telegram_chat_id` / `telegram_thread_id` in Settings. The bot token is
found automatically (env, `.env.local`, or the studio `.env`).

⚠ If anything else in your stack polls @deinfluencedbot, the button
callbacks race and can be lost (notices still arrive; deciding on the
dashboard always works). Fix permanently: message @BotFather → /newbot →
put `DE_NEWSROOM_BOT_TOKEN=<token>` in `.env.local`, add the new bot to
your group, and restart. The newsroom prefers that token automatically.

Recordings: the recording desk lists everything owed. Record, then drop
files into `recordings-inbox/` named `[story-slug].[vo|intro].[wav/m4a/mp3]`
— duration is probed, the file moves to `media-vault/[slug]/`, and the story
resumes into production on its own.

Scratch TTS: after a script passes legal, a local Kokoro voice reads it and
the measured duration shows next to the word-count estimate ("scratch read
29s / target 32s"). Scripts that read more than 10% over target arrive at
Gate 1 with a trim warning — so you never record a script that's too long.

Then, in the dashboard:
1. More → Settings → Seed defaults, then set real numbers in `price_table`
   and your true `speech_wpm`.
2. More → Brand brain → add your first docs. Templates live in
   `brain/seeds/`. The voice corpus is the highest-leverage one.
3. "+ New idea" → file a tip. Watch the Posts board.

The dashboard is one flow: Ideas → In the making → Your call → Ready → Live,
with a "Needs you" shelf on top for everything waiting on you. Opening a post
shows a nine-stop stepper (Idea → Concept → Copy → Visuals → Voice → Assembly
→ Final check → Ready → Live) with only the current stage's workspace on
screen; briefs, claims, costs, activity, and the CapCut package fold away in
the Details rail. In the Visuals stage, type a note to the art director
("warmer, leave clean space top-left for a text overlay") and it re-authors
every image prompt to that direction.

## Layout

- `convex/` — schema + functions (pipeline state machine, claims ledger,
  generation manifest, brain, settings, cost ledger)
- `agents/runner.mjs` — polls Convex, runs desk prompt-packs through headless
  Claude Agent SDK sessions, writes structured results back
- `agents/desks/*.md` — the editorial law of each desk
- `src/` — React dashboard (Posts board + per-stage story studio in
  `src/views/`, shared stage model in `src/lib.ts`)
- `brain/seeds/` — templates for the docs you feed the brain
- `docs/DECISIONS.md` — locked product decisions and build phases
