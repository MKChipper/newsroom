# The Newsroom — operator's guide

You are the editor-in-chief of a one-person newsroom. Content pieces are
called **stories**, and each one is a card that moves desk-to-desk through a
fixed pipeline. The desks (AI agents) do the work; you make five kinds of
decision and record your voice. Nothing is ever posted automatically.

## Starting up

```bash
cd ~/Developer/newsroom && npm run newsroom
```

or double-click `Newsroom.app`. The dashboard is at http://localhost:5180.
Leave the terminal running — it's the backend, the dashboard, and the three
workers (desks, Telegram gates, recordings inbox) in one supervised process.

## The screens

| Tab | What it's for |
|---|---|
| **Floor** | The kanban board. Every story, by stage. Click a card for the full detail panel: script, claims, costs, gate buttons. |
| **Tip line** | Where raw material goes in: URLs, reddit threads, PDFs, rulings, your own notes. |
| **Recording** | Everything currently waiting on your voice or face, batched, with the exact text to read. |
| **Memos** | The Monday memos — the overseer's honest weekly read. |
| **Brain** | The brand's permanent knowledge: voice corpus, legal table, audience, house style. Versioned; serves every story. |
| **Settings** | Your speaking pace, per-format runtime targets, the generation price table, Telegram destinations. |

## How a story moves (and what each column means)

**1. You file a tip** *(Tip line tab)*.
Paste a URL, a reddit thread, an abstract, a screenshot path, or just a
note. Add a line on what caught your eye — the desks weight it.

**2. Tip + story desks run** *(automatic, seconds to minutes)*.
The tip line extracts every checkable claim (classified sourced / inferred /
opinion / unsafe, with citations), audience quotes, and a source grade. The
story desk then decides if anything clears the bar — most tips produce one
card or none — and files **idea cards** with a score and a single business
job: visibility, trust, or conversion.

**3. You commission** *(Floor → Ideas column)*.
Click a card. You'll see the angle, summary, score, and job. Two buttons:
**Commission** (puts it to work) or **Spike it** (kills it). Nothing
advances from Ideas without you — the desks never spend a penny or a
minute on a story you haven't picked.

**4. Writers' room + legal desk** *(automatic — "Desks at work" column)*.
The writers' room drafts the script against a hard time budget (your
speaking pace × the format's runtime target — copy gets cut, your voice
never gets sped up), writes 5 ranked hooks, plans the generation manifest
(what images/video to make and what it'll cost), and writes recording
briefs if it needs your voice. The legal desk then checks every line
against the claims ledger — named brands need citations, sarcasm must sit
on a receipt — fixing small things itself, bouncing structural problems
back. After passing, a local TTS voice reads the script aloud and the real
duration is checked against target ("scratch read 29s / target 32s").

**5. Gate 1 — you approve copy + spend** *(Telegram buttons or the card)*.
The story arrives with the full script, the legal desk's risk summary, and
the generation manifest priced line by line. The approve button literally
says what it spends: "Approve · spend ~$1.52". **Redo** asks for a note —
whatever you type goes verbatim to the writers' room. **Kill** spikes it.
This is the only moment money gets committed.

**6. Recording — only if the story needs your voice** *(Recording tab)*.
The tab lists everything owed across all stories, batched, with delivery
notes — do a week's worth in one sitting. Save each file as
`[story-slug].vo.wav` (or `.intro.wav`, also m4a/mp3) and drop it into the
`recordings-inbox/` folder. The pipeline notices, files it away, and
resumes the story by itself. If a story needs no recording, this stage is
skipped entirely.

**7. Production floor** *(automatic — "Production" column)*.
Images are generated from each script section's visual note (grounded in
the claims, never showing real brands, never containing text). Your VO is
transcribed with word-level timestamps, the visuals are cut to the exact
spoken section boundaries, captions (SRT) are generated, and ffmpeg
assembles a clean, caption-free 9:16 master — ready for posting as-is or
for a CapCut polish.

**8. Gate 2 — you approve the final cut** *(Telegram or the card)*.
Watch the master (path is on the card; everything lives in
`media-vault/[story-slug]/`). Approve, redo with a note (back to
production), or kill.

**9. Publish package** *(automatic — then "Ready to post")*.
The publishing desk writes the caption (first line = the search query a
curious buyer would type), 5-8 specific hashtags, and a cover-text
suggestion, saves a MANIFEST.md next to the assets, and sends the master +
caption to your Telegram SOCIAL POSTS thread.

**10. You post it** *(your phone, manually — always)*.
Download from Telegram, post to TikTok/IG yourself, then click **Mark
posted** on the card. Later — days, a week — open the card again and fill
in the numbers (views, saves, clicks…) in the metrics form.

**11. The Monday memo** *(run `npm run memo` — Memos tab)*.
The ratings desk judges every posted story against the ONE job it was
commissioned for — a trust post is scored on saves and comment quality,
never raw views — and writes the memo: what worked, honest patterns, what
to commission this week, and the single worry worth acting on. This is
where "is TikTok actually converting?" stops being a feeling.

## Your five moments, in total

1. File tips (whenever you see something)
2. Commission or spike ideas
3. Gate 1 — approve copy + spend (one tap, phone)
4. Record batched VOs → drop in folder
5. Gate 2 — approve final cut, then post it and add numbers

Everything between those moments runs itself, survives restarts (every
story is just a row with a status), and can be killed and resumed any time.

## One-off setup (15 minutes, highest leverage first)

1. **Brain → voice corpus**: 10-30 of your real lines with a "why it works"
   note each. This is what turns generic-good into unmistakably-you.
2. **Settings → price_table**: real per-unit costs so manifests are true.
3. **Settings → speech_wpm**: your true pace (count words in a 60s read).
4. **Brain → legal-phrasing**: your known phrasing swaps (template in
   `brain/seeds/`).

## Where things live

- `media-vault/[story-slug]/` — everything a story produced: assets,
  master, SRT, MANIFEST.md
- `recordings-inbox/` — drop recordings here, named `[slug].[vo|intro].[ext]`
- `brain/seeds/` — templates for the brain docs
- `docs/DECISIONS.md` — the locked product decisions
