// Tips inbox: watch tips-inbox/ for machine-filed tip files named *.tip.json
// (dropped by the weekly-industry-scan Cowork schedule, or anything else).
// On arrival: validate, file into Convex via pipeline:addTip, move the file
// to tips-inbox/filed/. The runner's tip-line desk takes it from there.
//
// Mirrors agents/inbox-watcher.mjs (recordings inbox).
//
// Usage:  node agents/tips-inbox.mjs [--once]

import {
  readFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(ROOT, "tips-inbox");
const FILED = join(INBOX, "filed");
const REJECTED = join(INBOX, "rejected");
const ONCE = process.argv.includes("--once");
const FILE_RE = /\.tip\.json$/i;

const KINDS = new Set(["url", "pdf", "note", "reddit", "ruling", "screenshot"]);

mkdirSync(INBOX, { recursive: true });
mkdirSync(FILED, { recursive: true });

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

// wait until the file size is stable (still being written)
async function settled(path) {
  let prev = -1;
  for (let i = 0; i < 10; i++) {
    const size = statSync(path).size;
    if (size > 0 && size === prev) return true;
    prev = size;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function parseTip(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const kind = KINDS.has(raw.kind) ? raw.kind : "note";
  const tip = { kind };
  if (typeof raw.sourceUrl === "string" && raw.sourceUrl) tip.sourceUrl = raw.sourceUrl;
  if (typeof raw.rawText === "string" && raw.rawText) tip.rawText = raw.rawText;
  if (typeof raw.note === "string" && raw.note) tip.note = raw.note;
  if (!tip.sourceUrl && !tip.rawText) throw new Error("tip has neither sourceUrl nor rawText");
  return tip;
}

async function processFile(name) {
  const path = join(INBOX, name);
  if (!(await settled(path))) {
    console.warn(`[tips-inbox] ${name}: never settled, skipping this pass`);
    return;
  }
  let tip;
  try {
    tip = parseTip(path);
  } catch (err) {
    mkdirSync(REJECTED, { recursive: true });
    renameSync(path, join(REJECTED, name));
    console.error(`[tips-inbox] ${name}: invalid (${err.message}) — moved to rejected/`);
    return;
  }
  const id = await client.mutation("pipeline:addTip", tip);
  renameSync(path, join(FILED, name));
  console.log(`[tips-inbox] filed ${name} → tip ${id} (${tip.kind})`);
}

async function sweep() {
  const names = readdirSync(INBOX).filter((n) => FILE_RE.test(n)).sort();
  for (const name of names) {
    try {
      await processFile(name);
    } catch (err) {
      console.error(`[tips-inbox] ${name}: ${err.message}`);
    }
  }
  return names.length;
}

const count = await sweep();
if (ONCE) {
  console.log(`[tips-inbox] done — ${count} file(s) seen`);
  process.exit(0);
}
console.log(`[tips-inbox] watching ${INBOX} — polling ${convexUrl()}`);
// simple poll loop, same spirit as the recordings inbox
// eslint-disable-next-line no-constant-condition
while (true) {
  await new Promise((r) => setTimeout(r, 15_000));
  try {
    await sweep();
  } catch (err) {
    console.error(`[tips-inbox] sweep failed: ${err.message}`);
  }
}
