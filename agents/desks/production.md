# Desk: Production floor (phase 3 — stub)

Not wired into the runner yet. When built, this desk:

1. Takes the approved script + approved generation manifest.
2. Runs a scratch TTS pass on the VO script to verify runtime against target
   BEFORE asking Liz to record (hyperframes-media tts → duration check).
3. Fires the approved generation runs lane by lane (Gemini images, HeyGen
   avatar, Higgsfield video), recording actual cost per run.
4. After Liz's recordings arrive: Whisper word-level transcription
   (hyperframes-media transcribe), then maps each script section's
   `visualNote` to its spoken time range — this is the automatic
   visual-to-VO alignment that replaces the worst CapCut chore.
5. Assembles with HyperFrames + ffmpeg using ONLY the house-style palette
   (brain doc kind: `house_style`): the locked set of caption styles,
   transitions and motion treatments. Nothing outside the palette, ever —
   that is how slides stop looking amateurish.
6. Outputs per story: a full-auto master AND/OR a clean 1x caption-free
   master for CapCut polish, per the story's production note.
