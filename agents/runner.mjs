// Newsroom agent runner.
// Polls Convex for desk work, runs the matching desk prompt-pack through a
// headless Claude Agent SDK session, and writes the structured result back.
// Crash-safe by design: every story is a row with a status; kill this process
// any time and restart it.
//
// Usage:  node agents/runner.mjs          (continuous)
//         node agents/runner.mjs --once   (drain current work, then exit)

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { scratchRuntime } from "./scratch-tts.mjs";

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

async function runDesk(deskName, prompt, { tools = [], maxTurns = 6 } = {}) {
  console.log(`  → ${deskName} desk thinking…`);
  let finalText = "";
  const session = query({
    prompt,
    options: {
      systemPrompt: pack(deskName),
      allowedTools: tools,
      permissionMode: "bypassPermissions",
      maxTurns,
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

  const result = await runDesk("tip-line", tipPrompt, {
    tools: ["WebFetch", "WebSearch", "Read"],
    maxTurns: 12,
  });

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

  await client.mutation("production:addClaims", { tipId, claims: result.claims ?? [] });

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
    const storyClaims = (result.claims ?? []).filter((c) =>
      (s.claimTexts ?? []).some((t) => c.text.includes(t) || t.includes(c.text))
    );
    await client.mutation("production:addClaims", {
      storyId,
      claims: storyClaims.length ? storyClaims : result.claims ?? [],
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
      visualNote: s.visualNote,
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
    lane: r.lane,
    model: r.model,
    count: r.count,
    quality: r.quality,
    format: r.format,
    note: r.note,
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
            visualNote: s.visualNote,
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

// ---- Main loop --------------------------------------------------------------------

const IDLE_MS = 20_000;

async function tick() {
  const work = await client.query("pipeline:nextWork", {});
  if (!work) return false;
  try {
    if (work.type === "tip") await processTip(work.id);
    else if (work.desk === "drafting") await draftStory(work.id);
    else if (work.desk === "legal_review") await legalReview(work.id);
  } catch (err) {
    console.error(`work item failed: ${err.message}`);
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
