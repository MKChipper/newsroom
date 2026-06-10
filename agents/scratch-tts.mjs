// Scratch TTS runtime check: synthesise the VO script with a local Kokoro
// voice (via hyperframes-media) and measure real spoken duration, so a
// script proves it fits the time budget BEFORE Liz records it.
// First run downloads the TTS model — slow once, fast after.

import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function scratchRuntime(text, voice = "bf_emma") {
  const dir = mkdtempSync(join(tmpdir(), "scratch-tts-"));
  const txt = join(dir, "script.txt");
  const wav = join(dir, "scratch.wav");
  try {
    writeFileSync(txt, text);
    execFileSync("npx", ["hyperframes", "tts", txt, "--voice", voice, "--output", wav], {
      stdio: "pipe",
      timeout: 10 * 60 * 1000,
    });
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav],
      { encoding: "utf8" }
    ).trim();
    const sec = Number(out);
    return Number.isFinite(sec) ? Math.round(sec * 10) / 10 : null;
  } catch (err) {
    console.error(`scratch TTS skipped: ${String(err.message).slice(0, 200)}`);
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
