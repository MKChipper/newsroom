# Newsroom — locked decisions (2026-06-10)

1. **Hands-on publish, forever (for now).** Gate 2 approval produces a publish
   package delivered to Liz; she posts manually. No Postiz, no platform APIs.
2. **No spend cap, full transparency.** Every story carries a generation
   manifest (lane, model, count, quality, format, estimated cost) shown at
   Gate 1 — approval explicitly approves the spend. Actual costs land in the
   ledger; month total always visible in the header.
3. **CapCut pain → product features.**
   - Scripts written to a hard word budget from measured speech wpm and a
     per-format runtime target. Copy gets cut, voice never sped up.
   - Scratch TTS duration check before Liz records (phase 3).
   - Whisper word timestamps on her recordings drive automatic visual
     alignment (phase 3).
   - Locked house-style palette: production may only use curated treatments,
     so nothing looks amateurish (phase 3).
   - Output per story: full-auto master and/or clean 1x caption-free master
     for optional CapCut polish.
4. **Tauri shell.** V0 runs in a browser tab; Tauri wrap + menubar gate
   counter in phase 4.
5. **Brain starts empty.** No carryover of existing templates or branding.
   Liz feeds philosophy, voice corpus, audience, legal table, product facts,
   house style. Everything versioned; every story records its brain version.
6. **Two gates only.** Gate 1 (copy + spend, before production) and Gate 2
   (final cut, before packaging). Plus the recording desk as a batched,
   drop-folder human moment. Ideas are commissioned by Liz from the board —
   the desks never advance an idea she hasn't picked.
7. **Every story has ONE business job** — visibility, trust, or conversion —
   set at commissioning and judged against that job alone at the ratings desk.

## Build phases

- [x] Phase 1 — spine: schema, state machine, desk packs (tip line, story
      desk, writers' room, legal desk), runner, dashboard.
- [x] Phase 2 — Telegram gates (approve/redo/kill from phone via
      @deinfluencedbot), recordings-inbox file watcher (auto-resume),
      scratch-TTS runtime check (Kokoro bf_emma via hyperframes; runs after
      legal pass, flags scripts that read >10% over target). `npm run staff`
      runs all three workers.
- [x] Phase 3 — production floor: gemini_image lane (direct API via
      agents/gen-image.mjs), Whisper VO alignment, SRT captions, ffmpeg
      caption-free master, publishing desk (caption/hashtags/MANIFEST +
      Telegram delivery). Outstanding: higgsfield/heygen lanes (left
      "approved" with a note when planned), HyperFrames full-auto caption
      layer + house-style palette audit (needs Liz).
- [ ] Phase 4 — ratings desk + Monday memo, Tauri wrap, menubar.
