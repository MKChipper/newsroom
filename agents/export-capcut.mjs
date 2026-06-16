// Assemble a CapCut-ready package for a story:
//   media-vault/<slug>/capcut/
//     ORDER.txt      — beat-by-beat running order + which asset to use
//     script.txt     — the VO, per beat
//     captions.txt   — platform captions (if packaged)
//     screenshots/   — your supplied receipts (originals)
//     plates/        — AI background plates / generated images, numbered by beat
//
// Deterministic: no LLM, just gathers what exists on disk + in Convex and lays
// it out so you open one folder and drag it into CapCut. Exposed as exportCapcut
// for the runner; also runnable directly: node agents/export-capcut.mjs <storyId>

import { ConvexHttpClient } from "convex/browser";
import {
  copyFileSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync,
} from "node:fs";
import { join, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { convexUrl } from "./env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = join(ROOT, "media-vault");
const IMG = /\.(png|jpe?g|webp)$/i;

// Conservative receipt matching: only suggest a screenshot when a beat names a
// specific anchor (ASA, NAD, the live page, an ingredient/benefit claim…). The
// detailed "On screen" note is the real guide; this is just a head start.
const ANCHORS = [
  { test: /\basa\b|advertising standards/i, file: /asa/i },
  { test: /\bnad\b|national ad|bbb/i, file: /nad/i },
  { test: /87|4-7|four to seven|percent/i, file: /87|percent/i },
  { test: /pubmed|14,?087|scientifically|scientific studies/i, file: /scientific/i },
  { test: /home ?page|landing/i, file: /homepage/i },
  { test: /ingredient/i, file: /ing.?claim/i },
  { test: /benefit|symptom|hot ?flush|hot ?flash|sleep|bloat/i, file: /benefit/i },
  { test: /\bsteps?\b|how it works|system/i, file: /steps/i },
];

function sectionIndexOf(asset) {
  try { return Number(JSON.parse(asset.meta ?? "{}").sectionIndex ?? -1); }
  catch { return -1; }
}

export async function exportCapcut(client, storyId) {
  const w = await client.query("design:creativeWorkspace", { storyId });
  if (!w?.story) throw new Error("story not found");

  const story = w.story;
  const slug = story.slug;
  const route = (w.routes || []).find((r) => r.selected);
  const script = (w.scripts || [])
    .filter((s) => s.status !== "superseded")
    .sort((a, b) => b.version - a.version)[0];
  const sections = script?.sections ?? [];
  const draft = w.postDraft;

  const storyDir = join(VAULT, slug);
  const supplyDir = join(storyDir, "design", "uploads");
  const outDir = join(storyDir, "capcut");
  const shotsOut = join(outDir, "screenshots");
  const platesOut = join(outDir, "plates");

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(shotsOut, { recursive: true });
  mkdirSync(platesOut, { recursive: true });

  // supplied screenshots: attached files + anything dropped in uploads/
  const seen = new Set();
  const screenshots = [];
  const addShot = (p) => {
    if (!p || !existsSync(p) || seen.has(p)) return;
    seen.add(p);
    const name = basename(p);
    copyFileSync(p, join(shotsOut, name));
    screenshots.push(name);
  };
  for (const r of (w.assetRequests || [])) {
    if (r.filePath && (r.status === "supplied" || r.status === "selected")) addShot(r.filePath);
  }
  if (existsSync(supplyDir)) {
    for (const f of readdirSync(supplyDir)) if (IMG.test(f)) addShot(join(supplyDir, f));
  }

  // AI plates / generated images, ordered by beat where known
  const plates = [];
  const imageAssets = (w.assets || []).filter((a) => a.kind === "image");
  imageAssets.sort((a, b) => sectionIndexOf(a) - sectionIndexOf(b));
  imageAssets.forEach((a, i) => {
    if (!existsSync(a.filePath)) return;
    const idx = sectionIndexOf(a);
    const tag = idx >= 0 ? String(idx + 1).padStart(2, "0") : `x${String(i + 1).padStart(2, "0")}`;
    const name = `plate-${tag}${extname(a.filePath) || ".png"}`;
    copyFileSync(a.filePath, join(platesOut, name));
    plates.push({ name, sectionIndex: idx });
  });

  const suggestShots = (beatText) =>
    ANCHORS.filter((a) => a.test.test(beatText))
      .flatMap((a) => screenshots.filter((n) => a.file.test(n)))
      .filter((n, i, arr) => arr.indexOf(n) === i);

  // ORDER.txt
  const wpm = 155;
  const order = [];
  order.push(`CAPCUT RUNNING ORDER — ${story.title}`);
  order.push(`Format: ${route?.format ?? story.format ?? "?"} (${route?.postType ?? ""})`.trim());
  order.push(`Spine: ${String(route?.angle ?? story.angle ?? "").replace(/\s+/g, " ").slice(0, 400)}`);
  order.push("");
  order.push("Drag this whole folder into CapCut. Beats are in order below; the VO");
  order.push("line is the spoken track and 'On screen' is what to show. Your receipts");
  order.push("are in screenshots/, AI plates in plates/.");
  order.push("");
  sections.forEach((s, i) => {
    const n = String(i + 1).padStart(2, "0");
    const words = String(s.text || "").trim().split(/\s+/).filter(Boolean).length;
    const sec = Math.round((words / wpm) * 60);
    const plate = plates.find((p) => p.sectionIndex === i);
    const suggested = suggestShots(`${s.text} ${s.visualNote ?? ""}`);
    order.push(`BEAT ${n} [${s.kind}] ~${sec}s`);
    order.push(`  VO: ${String(s.text || "").trim()}`);
    if (s.visualNote) order.push(`  On screen: ${String(s.visualNote).replace(/\s+/g, " ").trim()}`);
    if (suggested.length) order.push(`  Best-guess receipt: ${suggested.join(", ")}`);
    if (plate) order.push(`  AI plate: plates/${plate.name}`);
    order.push("");
  });
  if (screenshots.length) {
    order.push(`ALL YOUR SCREENSHOTS (${screenshots.length}) in screenshots/:`);
    screenshots.forEach((n) => order.push(`  - ${n}`));
  }
  writeFileSync(join(outDir, "ORDER.txt"), order.join("\n"));

  // script.txt
  const vo = [`VOICEOVER — ${story.title}`, ""];
  sections.forEach((s, i) => {
    vo.push(`[Beat ${i + 1} — ${s.kind}]`);
    vo.push(String(s.text || "").trim());
    vo.push("");
  });
  writeFileSync(join(outDir, "script.txt"), vo.join("\n"));

  // captions.txt
  const caps = [`CAPTIONS — ${story.title}`, ""];
  if (draft?.caption) {
    caps.push(`Platform: ${draft.platform ?? story.platform ?? ""}`, "", draft.caption);
    if (draft.hashtags) caps.push("", draft.hashtags);
  } else {
    caps.push("(No captions packaged yet — written at the packaging stage.)");
  }
  writeFileSync(join(outDir, "captions.txt"), caps.join("\n"));

  return { outDir, screenshots: screenshots.length, plates: plates.length, beats: sections.length };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith("export-capcut.mjs")) {
  const storyId = process.argv[2];
  if (!storyId) { console.error("usage: node agents/export-capcut.mjs <storyId>"); process.exit(1); }
  const client = new ConvexHttpClient(convexUrl());
  const r = await exportCapcut(client, storyId);
  console.log(`CapCut package: ${r.outDir}`);
  console.log(`  ${r.screenshots} screenshot(s), ${r.plates} plate(s), ${r.beats} beats`);
}
