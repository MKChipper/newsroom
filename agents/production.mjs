// Deterministic production helpers: VO transcription (Whisper via
// hyperframes), section-to-audio alignment, SRT captions, and ffmpeg
// assembly of a clean caption-free 1x master.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---- Transcription ------------------------------------------------------------

export function transcribe(voPath, workDir) {
  // phone recordings arrive as aiff/m4a/whatever — normalise to wav first
  const wav = join(workDir, "vo-normalized.wav");
  execFileSync("ffmpeg", ["-y", "-i", voPath, "-ar", "16000", "-ac", "1", wav], {
    stdio: "pipe",
    timeout: 5 * 60 * 1000,
  });
  execFileSync("npx", ["hyperframes", "transcribe", wav, "--model", "small.en"], {
    cwd: workDir,
    stdio: "pipe",
    timeout: 20 * 60 * 1000,
  });
  const out = join(workDir, "transcript.json");
  if (!existsSync(out)) throw new Error("transcribe produced no transcript.json");
  return normalizeWords(JSON.parse(readFileSync(out, "utf8")));
}

// accept any of the common whisper JSON shapes and return [{word,start,end}]
export function normalizeWords(json) {
  let words = [];
  if (Array.isArray(json.words)) words = json.words;
  else if (Array.isArray(json.segments)) {
    for (const seg of json.segments) {
      if (Array.isArray(seg.words)) words = words.concat(seg.words);
      else words.push({ word: seg.text, start: seg.start, end: seg.end });
    }
  } else if (Array.isArray(json)) words = json;
  return words
    .map((w) => ({
      word: String(w.word ?? w.text ?? "").trim(),
      start: Number(w.start),
      end: Number(w.end),
    }))
    .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end));
}

// ---- Alignment ------------------------------------------------------------------
// Proportional: distribute transcript words across sections by their script
// word counts, then snap section boundaries to real word timings. Robust even
// when the spoken read drifts from the script.

export function alignSections(sections, words) {
  const total = sections.reduce((n, s) => n + s.wordCount, 0) || 1;
  const out = [];
  let cum = 0;
  let prevIdx = 0;
  for (const [i, s] of sections.entries()) {
    cum += s.wordCount;
    const endIdx =
      i === sections.length - 1
        ? words.length
        : Math.max(prevIdx + 1, Math.round((cum / total) * words.length));
    const startWord = words[prevIdx];
    const endWord = words[Math.min(endIdx, words.length) - 1];
    out.push({
      kind: s.kind,
      sectionIndex: i,
      start: i === 0 ? 0 : startWord.start,
      end: endWord.end,
    });
    prevIdx = endIdx;
  }
  return out;
}

// ---- SRT captions ----------------------------------------------------------------

const srtTime = (sec) => {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const f = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${f}`;
};

export function buildSrt(words, { maxWords = 6, maxSpanSec = 2.8 } = {}) {
  const cues = [];
  let cue = [];
  for (const w of words) {
    if (
      cue.length &&
      (cue.length >= maxWords || w.end - cue[0].start > maxSpanSec)
    ) {
      cues.push(cue);
      cue = [];
    }
    cue.push(w);
  }
  if (cue.length) cues.push(cue);
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${srtTime(c[0].start)} --> ${srtTime(c[c.length - 1].end)}\n${c
          .map((w) => w.word)
          .join(" ")}\n`
    )
    .join("\n");
}

// ---- Assembly --------------------------------------------------------------------
// One image per section, held for the section's aligned duration, scaled and
// centre-cropped to the target frame, VO underneath. Caption-free 1x master.

export function assemble({ alignment, sectionImages, voPath, outPath, width = 1080, height = 1920 }) {
  const segs = alignment.filter((a) => sectionImages[a.sectionIndex]);
  if (!segs.length) throw new Error("no images to assemble");
  const args = ["-y"];
  const filters = [];
  for (const [i, seg] of segs.entries()) {
    const dur = Math.max(0.5, seg.end - seg.start);
    args.push("-loop", "1", "-t", dur.toFixed(2), "-i", sectionImages[seg.sectionIndex]);
    filters.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=30,format=yuv420p[v${i}]`
    );
  }
  args.push("-i", voPath);
  const concatIn = segs.map((_, i) => `[v${i}]`).join("");
  filters.push(`${concatIn}concat=n=${segs.length}:v=1:a=0[v]`);
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[v]",
    "-map", `${segs.length}:a`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "19",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest", outPath
  );
  execFileSync("ffmpeg", args, { stdio: "pipe", timeout: 20 * 60 * 1000 });
  return outPath;
}

export function probeDuration(path) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    { encoding: "utf8" }
  ).trim();
  const sec = Number(out);
  return Number.isFinite(sec) ? Math.round(sec * 10) / 10 : undefined;
}

export function writeSrtFile(words, path) {
  writeFileSync(path, buildSrt(words));
  return path;
}
