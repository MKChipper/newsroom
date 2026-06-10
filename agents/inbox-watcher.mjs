// Recordings inbox: watch recordings-inbox/ for files named
//   [story-slug].[vo|intro].(wav|mp3|m4a|aiff|aac|mov|mp4)
// On arrival: probe duration, file it into media-vault/[slug]/, mark the
// recording received in Convex — which auto-resumes the story into
// production once everything owed is in.
//
// Usage:  node agents/inbox-watcher.mjs [--once]

import {
  readFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "recordings-inbox");
const VAULT = join(ROOT, "media-vault");
const ONCE = process.argv.includes("--once");
const FILE_RE = /^(.+)\.(vo|intro)\.(wav|mp3|m4a|aiff|aac|mov|mp4)$/i;

mkdirSync(INBOX, { recursive: true });
mkdirSync(VAULT, { recursive: true });

function convexUrl() {
  if (process.env.VITE_CONVEX_URL) return process.env.VITE_CONVEX_URL;
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8").match(/VITE_CONVEX_URL=(.+)/);
    if (m) return m[1].trim();
  }
  throw new Error("No VITE_CONVEX_URL — run `npx convex dev` once first.");
}
const client = new ConvexHttpClient(convexUrl());

function probeDuration(path) {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { encoding: "utf8" }
    ).trim();
    const sec = Number(out);
    return Number.isFinite(sec) ? Math.round(sec * 10) / 10 : undefined;
  } catch {
    return undefined;
  }
}

// wait until the file size is stable (still copying from phone/AirDrop)
async function settled(path) {
  let prev = -1;
  for (let i = 0; i < 30; i++) {
    const size = statSync(path).size;
    if (size > 0 && size === prev) return true;
    prev = size;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function processFile(name) {
  const m = name.match(FILE_RE);
  if (!m) {
    if (!name.startsWith(".")) {
      console.log(`ignored ${name} — expected [story-slug].[vo|intro].[ext]`);
    }
    return;
  }
  const [, slug, kindRaw] = m;
  const kind = kindRaw.toLowerCase();
  const src = join(INBOX, name);
  if (!(await settled(src))) {
    console.log(`${name}: never finished copying, skipped`);
    return;
  }

  const story = await client.query("pipeline:storyBySlug", { slug });
  if (!story) {
    console.log(`${name}: no story with slug "${slug}"`);
    return;
  }
  const queue = await client.query("production:recordingQueue", {});
  const rec = queue.find((r) => r.storyId === story._id && r.kind === kind);
  if (!rec) {
    console.log(`${name}: "${story.title}" has no requested ${kind} recording`);
    return;
  }

  const destDir = join(VAULT, slug);
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, name);
  renameSync(src, dest);
  const durationSec = probeDuration(dest);

  await client.mutation("production:recordingReceived", {
    recordingId: rec._id,
    filePath: dest,
    durationSec,
  });
  await client.mutation("production:addAsset", {
    storyId: story._id,
    kind: "vo",
    filePath: dest,
    meta: JSON.stringify({ recordingKind: kind, durationSec }),
  });
  console.log(
    `✓ ${story.title}: ${kind} received` +
      (durationSec ? ` (${durationSec}s)` : "") +
      ` → ${dest}`
  );
}

async function scan() {
  for (const name of readdirSync(INBOX)) {
    try {
      await processFile(name);
    } catch (err) {
      console.error(`${name}: ${err.message}`);
    }
  }
}

console.log(`Inbox watcher — drop files into ${INBOX}`);
await scan();
if (!ONCE) {
  const { watch } = await import("node:fs");
  let timer = null;
  watch(INBOX, () => {
    clearTimeout(timer);
    timer = setTimeout(scan, 2000);
  });
  // safety net: rescan every 5 minutes in case fs events are missed
  setInterval(scan, 5 * 60 * 1000);
}
