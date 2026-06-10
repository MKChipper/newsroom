// Newsroom agent runner.
// Polls Convex for desk work, runs the matching desk prompt-pack through a
// headless Claude Agent SDK session, and writes the structured result back.
// Crash-safe by design: every story is a row with a status; kill this process
// any time and restart it.
//
// Usage:  node agents/runner.mjs          (continuous)
//         node agents/runner.mjs --once   (drain current work, then exit)

import { readFileSync, existsSync, mkdirSync, openAsBlob } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { scratchRuntime } from "./scratch-tts.mjs";
import { telegramToken } from "./env.mjs";
import {
  transcribe, alignSections, writeSrtFile, assemble, probeDuration,
} from "./production.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = `runner-${process.pid}`;
const ONCE = process.argv.includes("--once");

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
const pack = (name) =>
  readFileSync(join(ROOT, "agents", "desks", `${name}.md`), "utf8");

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("{"));
  // walk to the matching close brace of the first object
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    if (raw[i] === "}") depth--;
    if (depth === 0 && raw[i] === "}") {
      return JSON.parse(raw.slice(0, i + 1));
    }
  }
  throw new Error("no JSON object found in agent output");
}

async function runDesk(deskName, prompt, { tools = [], maxTurns = 6, mcpServers } = {}) {
  console.log(`  → ${deskName} desk thinking…`);
  let finalText = "";
  const session = query({
    prompt,
    options: {
      systemPrompt: pack(deskName),
      allowedTools: tools,
      permissionMode: "bypassPermissions",
      maxTurns,
      ...(mcpServers ? { mcpServers } : {}),
      stderr: (d) => {
        const line = String(d).trim();
        if (line) console.error(`  [${deskName} stderr] ${line.slice(0, 300)}`);
      },
    },
  });
  for await (const message of session) {
    if (message.type === "result") {
      if (message.subtype !== "success") {
        throw new Error(`${deskName} desk failed: ${message.subtype}`);
      }
      finalText = message.result;
    }
  }
  return extractJson(finalText);
}

async function brainContext() {
  const docs = await client.query("brain:docs", {});
  const settings = await client.query("brain:allSettings", {});
  const brainVersion = await client.query("brain:brainVersion", {});
  const docText = docs.length
    ? docs
        .map((d) => `### Brain doc: ${d.title} (${d.kind}, v${d.version})\n${d.body}`)
        .join("\n\n")
    : "### Brain is empty\nNo brand docs loaded yet. Work from the desk rules alone and keep output conservative.";
  return { docText, settings, brainVersion };
}

const countWords = (t) => t.trim().split(/\s+/).filter(Boolean).length;

// agents emit `null` for missing optionals (their JSON contracts say so);
// Convex optionals want the field absent — normalise here, once
const sanitizeClaims = (claims) =>
  (claims ?? []).map((c) => ({
    text: String(c.text ?? ""),
    classification: ["sourced", "inferred", "opinion", "unsafe"].includes(c.classification)
      ? c.classification
      : "opinion",
    citation: c.citation ?? undefined,
    brandNames: Array.isArray(c.brandNames) ? c.brandNames.map(String) : [],
    riskNote: c.riskNote ?? undefined,
  })).filter((c) => c.text);

// ---- Tip line + story desk ---------------------------------------------------

async function processTip(tipId) {
  const tip = await client.mutation("pipeline:claimTip", { tipId });
  if (!tip) return;
  console.log(`Tip ${tipId}: ${tip.kind} ${tip.sourceUrl ?? tip.filePath ?? ""}`);
  const { docText, settings, brainVersion } = await brainContext();

  const tipPrompt = [
    docText,
    "## The tip",
    `Kind: ${tip.kind}`,
    tip.sourceUrl ? `URL: ${tip.sourceUrl} (fetch it)` : "",
    tip.filePath ? `Local file: ${tip.filePath} (read it)` : "",
    tip.rawText ? `Raw text:\n${tip.rawText}` : "",
    tip.note ? `Editor's note: ${tip.note}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let result;
  try {
    result = await runDesk("tip-line", tipPrompt, {
      tools: ["WebFetch", "WebSearch", "Read"],
      maxTurns: 30,
    });
  } catch (err) {
    // don't leave the tip stuck in "processing" — reject with the reason so
    // Liz can see it on the tip line and re-file
    await client.mutation("pipeline:finishTip", {
      tipId,
      extracted: `tip-line desk error: ${err.message}`,
      sourceGrade: "D",
      status: "rejected",
    });
    throw err;
  }

  await client.mutation("pipeline:finishTip", {
    tipId,
    extracted: JSON.stringify(
      { summary: result.summary, audienceLanguage: result.audienceLanguage, angles: result.angles },
      null,
      2
    ),
    sourceGrade: result.sourceGrade ?? "D",
    status: result.status === "rejected" ? "rejected" : "processed",
  });
  if (result.status === "rejected") return;

  const tipClaims = sanitizeClaims(result.claims);
  await client.mutation("production:addClaims", { tipId, claims: tipClaims });

  // chain straight into the story desk
  const deskPrompt = [
    docText,
    "## Processed tip",
    JSON.stringify(result, null, 2),
  ].join("\n\n");
  const desk = await runDesk("story-desk", deskPrompt, { maxTurns: 4 });

  for (const s of desk.stories ?? []) {
    const storyId = await client.mutation("pipeline:createStory", {
      title: s.title,
      slug: s.slug,
      job: s.job,
      angle: s.angle,
      summary: s.summary,
      platform: s.platform ?? undefined,
      format: s.format ?? undefined,
      score: s.score,
      brainVersion,
    });
    const storyClaims = tipClaims.filter((c) =>
      (s.claimTexts ?? []).some((t) => c.text.includes(t) || t.includes(c.text))
    );
    await client.mutation("production:addClaims", {
      storyId,
      claims: storyClaims.length ? storyClaims : tipClaims,
    });
    console.log(`  filed story card: ${s.title} [${s.job}]`);
  }
}

// ---- Writers' room -------------------------------------------------------------

async function draftStory(storyId) {
  const story = await client.mutation("pipeline:claimStory", { storyId, worker: WORKER });
  if (!story) return;
  console.log(`Drafting: ${story.title}`);
  const detail = await client.query("pipeline:storyDetail", { storyId });
  const { docText, settings } = await brainContext();

  const wpm = Number(settings.speech_wpm ?? 155);
  const targets = JSON.parse(settings.format_targets ?? "{}");
  const target = targets[story.format ?? "tiktok_video"] ?? 32;

  const prompt = [
    docText,
    "## The story",
    JSON.stringify(
      { title: story.title, job: story.job, angle: story.angle, summary: story.summary, platform: story.platform, format: story.format },
      null,
      2
    ),
    "## Claims ledger",
    JSON.stringify(detail.claims, null, 2),
    "## Timing",
    `speech_wpm: ${wpm}\ntargetRuntimeSec: ${target}`,
    story.statusNote ? `## Editor/legal notes from last round\n${story.statusNote}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await runDesk("writers-room", prompt, { maxTurns: 4 });

  const sections = (result.sections ?? []).map((s) => {
    const wordCount = countWords(s.text);
    return {
      kind: s.kind,
      text: s.text,
      wordCount,
      estSeconds: Math.round((wordCount / wpm) * 60 * 10) / 10,
      visualNote: s.visualNote ?? undefined,
    };
  });

  await client.mutation("production:saveScript", {
    storyId,
    sections,
    targetRuntimeSec: target,
    voiceNotes: [
      result.voiceNotes,
      result.hooks?.length
        ? "Alternate hooks:\n" + result.hooks.map((h, i) => `${i + 1}. ${h.text}`).join("\n")
        : "",
      result.missingClaims?.length
        ? "MISSING CLAIMS the script wanted: " + result.missingClaims.join(" | ")
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  // price the generation plan from the live price table
  const priceTable = JSON.parse(settings.price_table ?? "{}");
  const runs = (result.generationPlan ?? []).map((r) => ({
    lane: String(r.lane),
    model: String(r.model),
    count: Number(r.count) || 1,
    quality: String(r.quality),
    format: String(r.format),
    note: r.note ?? undefined,
    estCostUsd:
      Math.round((priceTable[`${r.lane}:${r.quality}`] ?? 0) * r.count * 100) / 100,
  }));
  if (runs.length) await client.mutation("production:planRuns", { storyId, runs });

  for (const b of result.recordingBriefs ?? []) {
    await client.mutation("production:requestRecording", {
      storyId,
      kind: b.kind,
      brief: b.brief,
    });
  }

  await client.mutation("pipeline:transition", { storyId, to: "legal_review" });
  console.log(`  drafted v-next, ${sections.reduce((n, s) => n + s.wordCount, 0)} words → legal desk`);
}

// ---- Legal desk -----------------------------------------------------------------

async function legalReview(storyId) {
  const story = await client.mutation("pipeline:claimStory", { storyId, worker: WORKER });
  if (!story) return;
  console.log(`Legal review: ${story.title}`);
  const detail = await client.query("pipeline:storyDetail", { storyId });
  const { docText, settings } = await brainContext();
  const script = detail.scripts.find((s) => s.status === "draft");
  if (!script) {
    await client.mutation("pipeline:transition", { storyId, to: "drafting", note: "no draft script found" });
    return;
  }

  const prompt = [
    docText,
    "## Script under review",
    JSON.stringify(script.sections, null, 2),
    "## Claims ledger",
    JSON.stringify(detail.claims, null, 2),
  ].join("\n\n");

  const result = await runDesk("legal-desk", prompt, { maxTurns: 4 });

  if (result.verdict === "pass") {
    if (result.rewrittenSections?.length) {
      const wpm = Number(settings.speech_wpm ?? 155);
      await client.mutation("production:saveScript", {
        storyId,
        sections: result.rewrittenSections.map((s) => {
          const wordCount = countWords(s.text);
          return {
            kind: s.kind,
            text: s.text,
            wordCount,
            estSeconds: Math.round((wordCount / wpm) * 60 * 10) / 10,
            visualNote: s.visualNote ?? undefined,
          };
        }),
        targetRuntimeSec: script.targetRuntimeSec,
        voiceNotes: script.voiceNotes,
      });
    }
    const latest = await client.query("pipeline:storyDetail", { storyId });
    const current = latest.scripts.find((s) => s.status === "draft");
    let gateNote = result.riskSummary ?? "";
    if (current) {
      await client.mutation("production:setScriptStatus", {
        scriptId: current._id,
        status: "legal_passed",
        legalNotes: result.riskSummary,
      });
      // scratch TTS: measure real spoken duration before Liz records
      if ((settings.scratch_tts_enabled ?? "true") !== "false") {
        const spoken = current.sections.map((s) => s.text).join("\n\n");
        const sec = scratchRuntime(spoken, settings.scratch_tts_voice ?? "bf_emma");
        if (sec) {
          await client.mutation("production:setScratchRuntime", {
            scriptId: current._id,
            scratchRuntimeSec: sec,
          });
          console.log(`  scratch read: ${sec}s (target ${current.targetRuntimeSec}s)`);
          if (sec > current.targetRuntimeSec * 1.1) {
            gateNote += `\n⚠ Scratch read ran ${sec}s against a ${current.targetRuntimeSec}s target — copy likely needs a trim before recording.`;
          }
        }
      }
    }
    await client.mutation("pipeline:transition", {
      storyId,
      to: "gate1",
      note: gateNote || undefined,
    });
    console.log("  passed → Gate 1");
  } else {
    await client.mutation("production:setScriptStatus", {
      scriptId: script._id,
      status: "legal_bounced",
      legalNotes: JSON.stringify(result.lineNotes ?? [], null, 2),
    });
    await client.mutation("pipeline:transition", {
      storyId,
      to: "drafting",
      note:
        "Legal bounce:\n" +
        (result.lineNotes ?? [])
          .map((n) => `- "${n.quote}": ${n.problem}. Fix: ${n.fix}`)
          .join("\n"),
    });
    console.log("  bounced → writers' room");
  }
}

// ---- Production floor -----------------------------------------------------------

const VAULT = join(ROOT, "media-vault");

async function produceStory(storyId) {
  const story = await client.mutation("pipeline:claimStory", { storyId, worker: WORKER });
  if (!story) return;
  console.log(`Production: ${story.title}`);
  const detail = await client.query("pipeline:storyDetail", { storyId });
  const { docText, settings } = await brainContext();
  const script = detail.scripts.find((s) => s.status !== "superseded");
  if (!script) {
    await client.mutation("pipeline:transition", { storyId, to: "parked", note: "production: no script" });
    return;
  }

  const outDir = join(VAULT, story.slug);
  const assetDir = join(outDir, "assets");
  mkdirSync(assetDir, { recursive: true });

  // 1. generate images for approved gemini runs via the production agent
  const geminiRuns = detail.runs.filter(
    (r) => r.lane === "gemini_image" && r.status === "approved"
  );
  const otherRuns = detail.runs.filter(
    (r) => r.lane !== "gemini_image" && r.status === "approved"
  );
  const sectionImages = {};
  let agentNotes = "";
  if (geminiRuns.length) {
    const result = await runDesk(
      "production",
      [
        docText,
        "## Script sections (0-indexed)",
        JSON.stringify(script.sections.map((s) => ({ kind: s.kind, text: s.text, visualNote: s.visualNote })), null, 2),
        "## Claims ledger",
        JSON.stringify(detail.claims.map((c) => ({ text: c.text, classification: c.classification })), null, 2),
        "## Approved generation runs",
        JSON.stringify(geminiRuns.map((r) => ({ lane: r.lane, model: r.model, count: r.count, quality: r.quality, format: r.format, note: r.note })), null, 2),
        "## gen-image path",
        join(ROOT, "agents", "gen-image.mjs"),
        "## Story slug",
        story.slug,
        "## Output directory",
        assetDir,
      ].join("\n\n"),
      { tools: ["Bash", "Read"], maxTurns: 40 }
    );
    agentNotes = result.notes ?? "";
    for (const a of result.assets ?? []) {
      if (!existsSync(a.path)) continue;
      await client.mutation("production:addAsset", {
        storyId, kind: "image", filePath: a.path, lane: "gemini_image",
        meta: JSON.stringify({ sectionIndex: a.sectionIndex, prompt: a.prompt }),
      });
      if (sectionImages[a.sectionIndex] === undefined) sectionImages[a.sectionIndex] = a.path;
    }
    for (const run of geminiRuns) {
      await client.mutation("production:recordRunResult", {
        runId: run._id, status: "done", actualCostUsd: run.estCostUsd,
      });
    }
    console.log(`  ${Object.keys(sectionImages).length} sections covered by generated images`);
  }
  let unwiredNote = "";
  if (otherRuns.length) {
    unwiredNote = `Lanes not yet wired (left approved, run manually): ${otherRuns.map((r) => r.lane).join(", ")}.`;
    console.log(`  ${unwiredNote}`);
  }

  // 2. transcription, alignment, captions, assembly — only when a VO exists
  const vo = detail.recordings.find((r) => r.kind === "vo" && r.filePath);
  let masterNote = "no VO recording — image package only, no assembly";
  if (vo && Object.keys(sectionImages).length) {
    console.log("  transcribing VO…");
    const words = transcribe(vo.filePath, outDir);
    const alignment = alignSections(script.sections, words);
    const srtPath = writeSrtFile(words, join(outDir, `${story.slug}.srt`));
    await client.mutation("production:addAsset", {
      storyId, kind: "caption", filePath: srtPath,
      meta: JSON.stringify({ alignment }),
    });
    console.log("  assembling master…");
    const masterPath = join(outDir, `${story.slug}-master.mp4`);
    assemble({ alignment, sectionImages, voPath: vo.filePath, outPath: masterPath });
    const dur = probeDuration(masterPath);
    await client.mutation("production:addAsset", {
      storyId, kind: "master", filePath: masterPath,
      meta: JSON.stringify({ durationSec: dur, captionFree: true }),
    });
    masterNote = `caption-free master assembled (${dur}s) + SRT captions`;
    console.log(`  master: ${masterPath} (${dur}s)`);
  }

  await client.mutation("pipeline:transition", {
    storyId,
    to: "gate2",
    note: [masterNote, unwiredNote, agentNotes].filter(Boolean).join("\n"),
  });
  console.log("  → Gate 2");
}

// ---- Publishing desk --------------------------------------------------------------

async function packageStory(storyId) {
  const story = await client.mutation("pipeline:claimStory", { storyId, worker: WORKER });
  if (!story) return;
  console.log(`Packaging: ${story.title}`);
  const detail = await client.query("pipeline:storyDetail", { storyId });
  const { docText, settings } = await brainContext();
  const script = detail.scripts.find((s) => s.status !== "superseded");
  const outDir = join(VAULT, story.slug);
  mkdirSync(outDir, { recursive: true });

  const result = await runDesk(
    "publishing-desk",
    [
      docText,
      "## Story",
      JSON.stringify({ title: story.title, job: story.job, platform: story.platform, format: story.format, angle: story.angle }, null, 2),
      "## Script (as spoken)",
      (script?.sections ?? []).map((s) => s.text).join("\n\n"),
      "## Claims",
      JSON.stringify(detail.claims.map((c) => ({ text: c.text, citation: c.citation })), null, 2),
    ].join("\n\n"),
    { maxTurns: 4 }
  );

  const master = detail.assets.find((a) => a.kind === "master");
  const manifest = [
    `# ${story.title}`,
    "",
    `Job: ${story.job} · Platform: ${story.platform ?? "?"} · Format: ${story.format ?? "?"}`,
    "",
    "## Caption",
    "",
    result.caption,
    "",
    "## Hashtags",
    "",
    (result.hashtags ?? []).join(" "),
    "",
    `## Cover text`,
    "",
    result.coverText ?? "",
    result.postingNotes ? `\n## Posting notes\n\n${result.postingNotes}` : "",
    "",
    "## Files",
    "",
    ...detail.assets.map((a) => `- ${a.kind}: ${a.filePath}`),
  ].join("\n");
  const manifestPath = join(outDir, "MANIFEST.md");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(manifestPath, manifest);
  await client.mutation("production:addAsset", { storyId, kind: "other", filePath: manifestPath });

  // hand-delivery to Telegram: master + caption, ready to download and post
  const token = telegramToken();
  let deliveryNote = "package written to media-vault";
  if (token && master) {
    try {
      const form = new FormData();
      form.append("chat_id", settings.telegram_delivery_chat_id ?? settings.telegram_chat_id);
      const thread = settings.telegram_delivery_thread_id;
      if (thread) form.append("message_thread_id", thread);
      form.append(
        "caption",
        `${story.title}\n\n${result.caption}\n\n${(result.hashtags ?? []).join(" ")}`.slice(0, 1000)
      );
      form.append("video", await openAsBlob(master.filePath), `${story.slug}.mp4`);
      const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      deliveryNote = data.ok
        ? "package delivered to Telegram — download and post"
        : `telegram delivery failed: ${data.description}`;
    } catch (err) {
      deliveryNote = `telegram delivery failed: ${err.message}`;
    }
  }
  console.log(`  ${deliveryNote}`);
  await client.mutation("pipeline:transition", { storyId, to: "ready_to_post", note: deliveryNote });
}

// ---- Main loop --------------------------------------------------------------------

const IDLE_MS = 20_000;

async function tick() {
  const work = await client.query("pipeline:nextWork", {});
  if (!work) return false;
  try {
    if (work.type === "tip") await processTip(work.id);
    else if (work.desk === "drafting") await draftStory(work.id);
    else if (work.desk === "legal_review") await legalReview(work.id);
    else if (work.desk === "production") await produceStory(work.id);
    else if (work.desk === "packaging") await packageStory(work.id);
  } catch (err) {
    console.error(`work item failed: ${err.message}`);
    if (work.type === "story") {
      await client
        .mutation("pipeline:releaseStory", { storyId: work.id })
        .catch(() => {});
    }
    return false;
  }
  return true;
}

console.log(`Newsroom runner ${WORKER} — polling ${convexUrl()}`);
await client.mutation("brain:seedDefaults", {});
for (;;) {
  const didWork = await tick();
  if (!didWork) {
    if (ONCE) break;
    await new Promise((r) => setTimeout(r, IDLE_MS));
  }
}
console.log("Runner done.");
