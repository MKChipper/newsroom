// Newsroom agent runner.
// Polls Convex for desk work, runs the matching desk prompt-pack through a
// headless Claude Agent SDK session, and writes the structured result back.
// Crash-safe by design: every story is a row with a status; kill this process
// any time and restart it.
//
// Usage:  node agents/runner.mjs          (continuous)
//         node agents/runner.mjs --once   (drain current work, then exit)

import { readFileSync, existsSync, mkdirSync, openAsBlob } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { scratchRuntime } from "./scratch-tts.mjs";
import { claudeModel, claudeSdkEnv, deliveryToken } from "./env.mjs";
import {
  transcribe, alignSections, writeSrtFile, assemble, probeDuration,
} from "./production.mjs";
import { renderCarouselDeck } from "./compositors/carousel-deck.mjs";
import { exportCapcut } from "./export-capcut.mjs";
import * as gemini from "./providers/gemini.mjs";
import * as fal from "./providers/fal.mjs";
import * as higgsfield from "./providers/higgsfield.mjs";

const PROVIDERS = { gemini, fal, higgsfield };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = `runner-${process.pid}`;
const ONCE = process.argv.includes("--once");
const CLAUDE_ENV = claudeSdkEnv();
const CLAUDE_MODEL = claudeModel();

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

// like runDesk but returns the raw conversational text (no JSON contract)
async function runDeskText(deskName, prompt, { maxTurns = 2 } = {}) {
  console.log(`  → ${deskName} desk thinking…`);
  let finalText = "";
  const session = query({
    prompt,
    options: {
      systemPrompt: pack(deskName),
      allowedTools: [],
      permissionMode: "bypassPermissions",
      maxTurns,
      ...(CLAUDE_MODEL ? { model: CLAUDE_MODEL } : {}),
      env: CLAUDE_ENV,
    },
  });
  for await (const message of session) {
    if (message.type === "result") {
      if (message.subtype !== "success") throw new Error(`${deskName} desk failed: ${message.subtype}`);
      finalText = message.result;
    }
  }
  return finalText.trim();
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
      ...(CLAUDE_MODEL ? { model: CLAUDE_MODEL } : {}),
      env: CLAUDE_ENV,
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
const isCarouselFormat = (format = "") => /carousel/i.test(String(format));
const carouselRenderFormat = (story) =>
  String(story.format ?? "").includes("tiktok") || story.platform === "tiktok"
    ? "tiktok"
    : "instagram";
const assetMeta = (asset) => {
  try {
    return JSON.parse(asset.meta ?? "{}");
  } catch {
    return {};
  }
};
const currentCarouselSlides = (assets = []) => {
  const slides = assets.filter((a) => a.kind === "image" && assetMeta(a).carouselSlide);
  if (!slides.length) return [];
  const latest = Math.max(...slides.map((a) => Number(assetMeta(a).renderedAt ?? 0)));
  return slides
    .filter((a) => !latest || Number(assetMeta(a).renderedAt ?? 0) === latest)
    .sort((a, b) => Number(assetMeta(a).sectionIndex ?? 0) - Number(assetMeta(b).sectionIndex ?? 0));
};

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

const ASSET_STRATEGIES = new Set(["agent_can_create", "needs_liz_assets", "mixed", "informational_only"]);
const RISKS = new Set(["low", "medium", "high"]);

function cleanRoute(story, route = {}, order = 0) {
  const platform = route.platform ?? story.platform ?? "tiktok";
  const format = route.format ?? story.format ?? (platform === "instagram" ? "ig_reel" : "tiktok_video");
  const postType = route.postType ?? (format.includes("carousel") ? "informational carousel" : "receipt-led reel");
  const tier = Math.max(1, Math.min(4, Number(route.tier ?? route.productionTier ?? route.effort ?? order + 1) || 1));
  return {
    title: String(route.title ?? `${postType} route`),
    angle: String(route.angle ?? story.angle ?? story.summary ?? story.title),
    platform: String(platform),
    format: String(format),
    tier,
    postType: String(postType),
    structure: String(route.structure ?? "hook, receipt beat, payoff"),
    visualTreatment: String(route.visualTreatment ?? "clean editorial visuals with receipt-led composition and no generated text"),
    assetStrategy: ASSET_STRATEGIES.has(route.assetStrategy) ? route.assetStrategy : "agent_can_create",
    lizAssetNeeds: Array.isArray(route.lizAssetNeeds) ? route.lizAssetNeeds.map(String) : [],
    agentAssetPlan: Array.isArray(route.agentAssetPlan)
      ? route.agentAssetPlan.map(String)
      : ["generate visual backgrounds for each script beat"],
    rationale: String(route.rationale ?? "Default route inferred from the story desk recommendation."),
    risk: RISKS.has(route.risk) ? route.risk : "medium",
    effort: Math.max(1, Math.min(5, Number(route.effort ?? story.score?.effort ?? order + 1) || 1)),
  };
}

function creativeBriefForStory(story) {
  const brief = story.creativeBrief ?? {};
  const routes = Array.isArray(brief.routes) && brief.routes.length
    ? brief.routes
    : [
        {
          title: story.format ? `${story.format} default` : "Receipt-led default",
          angle: story.angle,
          platform: story.platform ?? "tiktok",
          format: story.format ?? "tiktok_video",
          tier: story.score?.effort >= 4 ? 3 : story.score?.effort >= 3 ? 2 : 1,
          postType: story.format === "ig_carousel" ? "informational carousel" : "receipt-led reel",
          structure: "hook, receipt beat, payoff",
          visualTreatment: "editorial proof-first visuals that make the receipt legible without putting text inside generated images",
          assetStrategy: "agent_can_create",
          lizAssetNeeds: [],
          agentAssetPlan: ["generate one vertical background or receipt visual per script beat"],
          rationale: "Fallback route from the story desk's original recommendation.",
          risk: story.score?.risk >= 4 ? "high" : story.score?.risk >= 3 ? "medium" : "low",
          effort: story.score?.effort ?? 2,
        },
      ];
  return {
    researchSummary: String(brief.researchSummary ?? story.summary ?? story.angle ?? story.title),
    audienceLanguage: Array.isArray(brief.audienceLanguage) ? brief.audienceLanguage.map(String) : [],
    routes: routes.map((r, i) => cleanRoute(story, r, i)),
  };
}

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
    const brief = creativeBriefForStory(s);
    await client.mutation("design:saveCreativeBrief", {
      storyId,
      researchSummary: brief.researchSummary,
      audienceLanguage: brief.audienceLanguage,
      routes: brief.routes,
    });
    await logEvent("story", `Story desk filed "${s.title}" [${s.job}]`, { storyId, storyTitle: s.title });
    console.log(`  filed story card: ${s.title} [${s.job}]`);
  }
}

// ---- Activity wire --------------------------------------------------------------
// Every meaningful desk step posts a one-line event so the dashboard can show
// what's happening. Best-effort: a logging failure never breaks the runner.
async function logEvent(kind, message, opts = {}) {
  try {
    await client.mutation("events:log", { kind, message, ...opts });
  } catch (err) {
    console.error(`  (event log failed: ${String(err.message).slice(0, 60)})`);
  }
}

// ---- Writers' room -------------------------------------------------------------

// Coerce the producer desk's JSON into the exact shape applyProducerBrief expects
// (omit undefined optionals so Convex validation is happy).
function normalizeBrief(b) {
  const out = {
    format: String(b.format),
    postType: String(b.postType ?? "post"),
    spine: String(b.spine ?? ""),
    structure: String(b.structure ?? ""),
    assets: (b.assets ?? []).map((a) => {
      const asset = {
        owner: a.owner === "agent" ? "agent" : "liz",
        kind: String(a.kind ?? "other"),
        label: String(a.label ?? "asset").slice(0, 80),
        instructions: String(a.instructions ?? a.label ?? ""),
        required: a.required !== false,
      };
      if (typeof a.canAgentAttempt === "boolean") asset.canAgentAttempt = a.canAgentAttempt;
      if (a.sourceUrl) asset.sourceUrl = String(a.sourceUrl);
      return asset;
    }),
  };
  if (b.platform) out.platform = String(b.platform);
  if (b.visualTreatment) out.visualTreatment = String(b.visualTreatment);
  if (b.assetStrategy) out.assetStrategy = String(b.assetStrategy);
  if (b.rationale) out.rationale = String(b.rationale);
  return out;
}

// Producer pass: turn the locked angle-room conversation into the real brief
// (format + structure + split asset list), superseding the commissioned route.
async function runProducer(storyId) {
  const detail = await client.query("pipeline:storyDetail", { storyId });
  const thread = await client.query("design:angleThread", { storyId });
  const { docText } = await brainContext();
  try {
    const brief = await runDesk(
      "producer",
      [
        docText,
        "## The story",
        JSON.stringify({ title: detail.story.title, job: detail.story.job, angle: detail.story.angle, summary: detail.story.summary, platform: detail.story.platform, format: detail.story.format }, null, 2),
        "## Claims ledger (the receipts)",
        JSON.stringify(detail.claims.map((c) => ({ text: c.text, classification: c.classification, citation: c.citation })), null, 2),
        "## The angle-room conversation (the FINAL agreement is the source of truth — it overrides the commissioned route)",
        thread.map((m) => `${m.role === "liz" ? "LIZ" : "DESK"}: ${m.text}`).join("\n\n"),
        "## Your output",
        "Produce the brief per the rules of the producer desk. Return JSON only.",
      ].join("\n\n"),
      { maxTurns: 3 }
    );
    if (!brief || !brief.format || !Array.isArray(brief.assets)) {
      throw new Error("producer returned no usable brief");
    }
    await client.mutation("design:applyProducerBrief", { storyId, brief: normalizeBrief(brief) });
    await logEvent("draft", `Producer rebuilt the brief from the angle room (${brief.format}, ${brief.assets.length} assets)`, { storyId, storyTitle: detail.story.title });
    console.log(`  producer brief: ${brief.format}, ${brief.assets.length} assets`);
  } catch (err) {
    console.error(`  producer failed — drafting from existing route: ${err.message}`);
    await client.mutation("design:clearProducerPending", { storyId });
    await logEvent("draft", `Producer failed (${String(err.message).slice(0, 80)}) — kept existing route`, { storyId, storyTitle: detail.story.title, level: "warn" });
  }
}

async function draftStory(storyId) {
  let story = await client.mutation("pipeline:claimStory", { storyId, worker: WORKER });
  if (!story) return;
  // angle just locked → rebuild the brief from the conversation before drafting,
  // so the writers' room works from what was agreed, not the commissioned route.
  if (story.producerPending) await runProducer(storyId);
  const detail = await client.query("pipeline:storyDetail", { storyId });
  story = detail.story ?? story;
  console.log(`Drafting: ${story.title}`);
  await logEvent("draft", `Writers' room drafting "${story.title}"`, { storyId, storyTitle: story.title });
  const workspace = await client.query("design:creativeWorkspace", { storyId });
  const selectedRoute = workspace?.routes?.find((r) => r.selected);
  const { docText, settings } = await brainContext();

  const wpm = Number(settings.speech_wpm ?? 155);
  const targets = JSON.parse(settings.format_targets ?? "{}");
  const target = isCarouselFormat(story.format)
    ? 0
    : targets[story.format ?? "tiktok_video"] ?? 32;

  const prompt = [
    docText,
    "## The story",
    JSON.stringify(
      { title: story.title, job: story.job, angle: story.angle, summary: story.summary, platform: story.platform, format: story.format },
      null,
      2
    ),
    selectedRoute
      ? [
          "## Selected creative route",
          JSON.stringify({
            title: selectedRoute.title,
            postType: selectedRoute.postType,
            structure: selectedRoute.structure,
            visualTreatment: selectedRoute.visualTreatment,
            assetStrategy: selectedRoute.assetStrategy,
            lizAssetNeeds: selectedRoute.lizAssetNeeds,
            agentAssetPlan: selectedRoute.agentAssetPlan,
            rationale: selectedRoute.rationale,
          }, null, 2),
          "Draft to this route. Keep the content legally grounded, but let the route decide the post craft.",
        ].join("\n")
      : "",
    "## Claims ledger",
    JSON.stringify(detail.claims, null, 2),
    "## Timing",
    target > 0
      ? `speech_wpm: ${wpm}\ntargetRuntimeSec: ${target}`
      : `This is a static format (${story.format}) — no spoken runtime budget. Write per-slide copy: each section is one slide, tight enough to read in a feed.`,
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
  const totalWords = sections.reduce((n, s) => n + s.wordCount, 0);
  await logEvent("draft", `Drafted ${totalWords} words → legal desk`, { storyId, storyTitle: story.title });
  console.log(`  drafted v-next, ${totalWords} words → legal desk`);
}

// ---- Legal desk -----------------------------------------------------------------

async function legalReview(storyId) {
  const story = await client.mutation("pipeline:claimStory", { storyId, worker: WORKER });
  if (!story) return;
  console.log(`Legal review: ${story.title}`);
  await logEvent("legal", `Legal desk reviewing "${story.title}"`, { storyId, storyTitle: story.title });
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
      // scratch TTS: measure real spoken duration before Liz records.
      // static formats (carousel — target 0) have no runtime to check.
      if ((settings.scratch_tts_enabled ?? "true") !== "false" && current.targetRuntimeSec > 0) {
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
    await logEvent("legal", `Legal cleared → Gate 1 (your copy approval)`, { storyId, storyTitle: story.title });
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
    await logEvent("legal", `Legal bounce: ${result.lineNotes?.length ?? 0} issue(s) → back to writers' room`, { storyId, storyTitle: story.title, level: "warn" });
    console.log("  bounced → writers' room");
  }
}

// ---- Angle room -----------------------------------------------------------------

// Consecutive desk-reply failures per story. A few ticks of transient retry,
// then we surface the error into the thread so it stops spinning behind a
// silent "thinking…".
const angleFailures = new Map();
const ANGLE_MAX_TRIES = 3;

async function angleReply(storyId) {
  const detail = await client.query("pipeline:storyDetail", { storyId });
  if (!detail || detail.story.status !== "angle") return;
  const thread = await client.query("design:angleThread", { storyId });
  const last = thread[thread.length - 1];
  if (!last || last.role !== "liz") return;
  console.log(`Angle room: ${detail.story.title}`);
  const { docText } = await brainContext();
  let reply;
  try {
    reply = await runDeskText(
      "angle-room",
      [
        docText,
        "## The story under discussion",
        JSON.stringify({ title: detail.story.title, job: detail.story.job, angle: detail.story.angle, summary: detail.story.summary }, null, 2),
        "## Claims ledger (the receipts you argue from)",
        JSON.stringify(detail.claims.map((c) => ({ text: c.text, classification: c.classification, citation: c.citation })), null, 2),
        "## The discussion so far",
        thread.map((m) => `${m.role === "liz" ? "LIZ" : "YOU"}: ${m.text}`).join("\n\n"),
        "## Your reply",
        "Respond to Liz's last message per the rules of the room.",
      ].join("\n\n")
    );
  } catch (err) {
    const tries = (angleFailures.get(storyId) ?? 0) + 1;
    console.error(`  angle reply failed (try ${tries}/${ANGLE_MAX_TRIES}): ${err.message}`);
    if (tries < ANGLE_MAX_TRIES) {
      angleFailures.set(storyId, tries); // likely transient — the next tick retries
      return;
    }
    // Persistent failure: post it as a desk turn. That makes Liz's message no
    // longer the latest, so the story drops out of pendingAngleReplies instead
    // of retrying forever behind a silent "thinking…".
    angleFailures.delete(storyId);
    await client.mutation("design:addAngleMessage", {
      storyId,
      role: "desk",
      text: `[the desk hit an error and couldn't reply: ${String(err.message).slice(0, 180)}] Send your last message again to retry.`,
    });
    await logEvent("angle", `Angle desk hit an error: ${String(err.message).slice(0, 120)}`, { storyId, storyTitle: detail.story.title, level: "warn" });
    return;
  }
  angleFailures.delete(storyId);
  await client.mutation("design:addAngleMessage", { storyId, role: "desk", text: reply });
  await logEvent("angle", `Angle desk replied`, { storyId, storyTitle: detail.story.title });
  console.log("  replied");
}

// ---- Design studio: seeding + generation queue --------------------------------------

const tidyPromptText = (value = "") => String(value).replace(/\s+/g, " ").trim();

const promptNeedsRealAsset = (text) =>
  /\b(screenshot|screen recording|app screen|app recording|real label|product page|receipt|pubmed|doi|pmid|coa|certificate|search result|url)\b/i.test(text);

const promptHasOverlayDirection = (text) =>
  /\b(title card|headline|sub-line|subtitle|caption|citation|footnote|pmid|bullet|tag|number|overlay|text|lettering|quote marks)\b/i.test(text) ||
  /['"][^'"]{2,}['"]/.test(text);

const promptHasChartDirection = (text) =>
  /\b(forest plot|bar|chart|axis|confidence interval|effect size|p\s*=|meta-analysis|trial|rct)\b/i.test(text);

const cleanVisualBrief = (text) => {
  // Keep the actual subject; strip only the literal copy the writers' room wanted
  // rendered AS text (quotes, title-card labels, citations, raw stats) — the image
  // itself must carry no words. What survives should still describe a real scene.
  const clean = tidyPromptText(text)
    .replace(/\bSlide\s*\d+\s*[:,;-]?\s*/gi, "")
    .replace(/\btitle card\b/gi, "")
    .replace(/\b(sub-?line|subtitle|caption|headline|lower third)\b\s*:?/gi, "")
    .replace(/\bcitation[^,.;]*/gi, "")
    .replace(/\bPMID\s*\d+\b/gi, "")
    .replace(/\bp\s*=\s*[-\d.]+\b/gi, "")
    .replace(/['"][^'"]+['"]/g, "")
    .replace(/\s*[,;](\s*[,;])+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "the subject of the spoken beat";
};

// Deterministic FALLBACK only — the art-director desk writes the real prompts.
// Leads with whatever concrete subject survives, then a short house-style tail.
const promptFromNote = (visualNote, voLine) => {
  const subject = cleanVisualBrief(tidyPromptText(visualNote ?? voLine));
  return [
    `Editorial documentary photograph for a De-Influenced social post: ${subject}.`,
    "Premium product-research look: a real desk or counter scene, soft directional light, one clear focal subject, modern neutral palette with a single sharp accent colour, generous clean negative space for editor-added text.",
    "No text, letters, numbers, logos, brand names, fake screenshots, charts with data, watermarks, or cartoon style.",
  ].join(" ");
};

// The real prompt writer: one art-director desk call authors a concrete, on-brand
// image prompt per beat. Falls back to promptFromNote per beat if the desk fails.
async function authorSlidePrompts(story, beats) {
  let result = null;
  try {
    const { docText } = await brainContext();
    const prompt = [
      docText,
      "## The post",
      JSON.stringify({ title: story.title, angle: story.angle, summary: story.summary, platform: story.platform, format: story.format }, null, 2),
      "## The beats (author one image prompt per beat, in order)",
      JSON.stringify(beats.map((b, i) => ({ order: i, kind: b.kind, spokenLine: b.voLine, visualNote: b.visualNote ?? null })), null, 2),
      "## Your output",
      "Author one image-generation prompt per beat per the rules of the art-director desk. Return JSON only.",
    ].join("\n\n");
    result = await runDesk("art-director", prompt, { maxTurns: 3 });
  } catch (err) {
    console.error(`  art director failed — using fallback prompts: ${err.message}`);
  }
  const byOrder = new Map((result?.prompts ?? []).map((p) => [Number(p.order), tidyPromptText(p.prompt)]));
  return beats.map((b, i) => {
    const authored = byOrder.get(i);
    return authored && authored.length > 20 ? authored : promptFromNote(b.visualNote, b.voLine);
  });
}

async function seedDesign(storyId) {
  const detail = await client.query("pipeline:storyDetail", { storyId });
  const script = detail.scripts.find((s) => s.status !== "superseded");
  if (!script) return;
  const beats = script.sections.map((s) => ({ kind: s.kind, voLine: s.text, visualNote: s.visualNote ?? null }));
  const prompts = await authorSlidePrompts(detail.story, beats);
  await client.mutation("design:seedSlides", {
    storyId,
    slides: script.sections.map((s, i) => ({
      order: i,
      kind: s.kind,
      voLine: s.text,
      visualNote: s.visualNote ?? undefined,
      prompt: prompts[i],
    })),
  });
  await logEvent("design", `Design studio ready — ${script.sections.length} slides, prompts by art director`, { storyId, storyTitle: detail.story.title });
  console.log(`Design studio seeded: ${detail.story.title} (${script.sections.length} rows)`);
}

// Re-author all image prompts for an existing design story (the "Rewrite prompts"
// button enqueues this). Reuses the art director, then clears the flag.
async function rewriteDesignPrompts(storyId) {
  const detail = await client.query("pipeline:storyDetail", { storyId });
  const board = await client.query("design:board", { storyId });
  const slides = board?.slides ?? [];
  if (!slides.length) {
    await client.mutation("design:clearPromptRewrite", { storyId });
    return;
  }
  console.log(`Rewriting prompts: ${detail.story.title} (${slides.length} slides)`);
  const beats = slides.map((s) => ({ kind: s.kind, voLine: s.voLine, visualNote: s.visualNote ?? null }));
  const prompts = await authorSlidePrompts(detail.story, beats);
  for (let i = 0; i < slides.length; i++) {
    await client.mutation("design:updatePrompt", { slideId: slides[i]._id, prompt: prompts[i] });
  }
  await client.mutation("design:clearPromptRewrite", { storyId });
  await logEvent("design", `Art director rewrote ${slides.length} image prompt(s)`, { storyId, storyTitle: detail.story.title });
  console.log("  prompts rewritten");
}

// Build the CapCut package folder (deterministic file assembly via export-capcut).
async function runCapcutExport(storyId) {
  const detail = await client.query("pipeline:storyDetail", { storyId });
  try {
    const r = await exportCapcut(client, storyId);
    await client.mutation("design:setCapcutPath", { storyId, path: r.outDir });
    await logEvent("publish", `CapCut package built — ${r.screenshots} screenshots, ${r.plates} plates, ${r.beats} beats`, { storyId, storyTitle: detail?.story?.title });
    console.log(`CapCut package: ${r.outDir}`);
  } catch (err) {
    await client.mutation("design:clearCapcutExport", { storyId });
    await logEvent("publish", `CapCut export failed: ${String(err.message).slice(0, 100)}`, { storyId, storyTitle: detail?.story?.title, level: "warn" });
    console.error(`  capcut export failed: ${err.message}`);
  }
}

async function handleGenRequest(requestId) {
  const req = await client.mutation("design:claimGenRequest", { requestId });
  if (!req) return;
  const story = await client.query("pipeline:storyDetail", { storyId: req.storyId });
  const slug = story?.story.slug ?? "unknown";
  const provider = PROVIDERS[req.provider];
  console.log(`Generate [${req.provider}/${req.model}] ×${req.count} for ${slug}`);
  try {
    if (!provider) throw new Error(`unknown provider ${req.provider}`);
    const outDir = join(VAULT, slug, "design");
    const baseName = `${req.kind}-${String(req._id).slice(-6)}`;
    const { files, costUsd } = await provider.generate({
      prompt: req.prompt,
      model: req.model,
      count: req.count,
      aspect: req.aspect,
      quality: req.quality,
      outDir,
      baseName,
    });
    await client.mutation("design:finishGenRequest", {
      requestId,
      status: "done",
      costUsd,
      candidates: files.map((f) => ({ filePath: f, prompt: req.prompt })),
    });
    await logEvent("gen", `Generated ${files.length} image candidate(s) [${req.provider}/${req.model}]`, { storyId: req.storyId, storyTitle: story?.story.title });
    console.log(`  ${files.length} candidate(s) on the board`);
  } catch (err) {
    await client.mutation("design:finishGenRequest", {
      requestId,
      status: "failed",
      error: String(err.message).slice(0, 400),
      candidates: [],
    });
    await logEvent("gen", `Generation failed: ${String(err.message).slice(0, 120)}`, { storyId: req.storyId, storyTitle: story?.story.title, level: "warn" });
    console.error(`  generation failed: ${err.message.slice(0, 200)}`);
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

  // design-studio path: Liz already picked the winners — use them, generate nothing
  const designAssets = detail.assets.filter((a) => a.kind === "image" && !assetMeta(a).carouselSlide);
  if (designAssets.length) {
    for (const a of designAssets) {
      try {
        const m = JSON.parse(a.meta ?? "{}");
        if (m.sectionIndex !== undefined && sectionImages[m.sectionIndex] === undefined) {
          sectionImages[m.sectionIndex] = a.filePath;
        }
      } catch {}
    }
    agentNotes = `assembled from ${Object.keys(sectionImages).length} design-studio selections`;
    console.log(`  ${agentNotes}`);
  } else if (geminiRuns.length) {
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

  // 2a. static carousel rendering — deterministic PNG deck, no VO required
  if (isCarouselFormat(story.format)) {
    const renderFormat = carouselRenderFormat(story);
    console.log(`  rendering ${renderFormat} carousel deck...`);
    const deck = await renderCarouselDeck({
      story,
      sections: script.sections,
      sectionImages,
      outDir: join(outDir, "carousel"),
      format: renderFormat,
    });
    const renderedAt = Date.now();
    for (const [sectionIndex, filePath] of deck.slidePaths.entries()) {
      await client.mutation("production:addAsset", {
        storyId,
        kind: "image",
        filePath,
        lane: `carousel:${renderFormat}`,
        meta: JSON.stringify({
          sectionIndex,
          carouselSlide: true,
          carouselFormat: renderFormat,
          width: deck.width,
          height: deck.height,
          renderedAt,
        }),
      });
    }
    if (deck.contactSheet) {
      await client.mutation("production:addAsset", {
        storyId,
        kind: "other",
        filePath: deck.contactSheet,
        lane: `carousel:${renderFormat}`,
        meta: JSON.stringify({ carouselContactSheet: true, carouselFormat: renderFormat, renderedAt }),
      });
    }
    await client.mutation("pipeline:transition", {
      storyId,
      to: "gate2",
      note: [
        `carousel deck rendered: ${deck.slidePaths.length} ${deck.label} PNG slides + contact sheet`,
        unwiredNote,
        agentNotes,
      ].filter(Boolean).join("\n"),
    });
    console.log(`  carousel: ${deck.slidePaths.length} slides (${deck.label})`);
    console.log("  -> Gate 2");
    return;
  }

  // 2b. transcription, alignment, captions, assembly — only when a VO exists
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
  const carouselSlides = currentCarouselSlides(detail.assets);
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
    carouselSlides.length
      ? `\n## Carousel slides\n\n${carouselSlides.map((a, i) => `${i + 1}. ${a.filePath}`).join("\n")}`
      : "",
    "",
    "## Files",
    "",
    ...detail.assets.map((a) => `- ${a.kind}: ${a.filePath}`),
  ].join("\n");
  const manifestPath = join(outDir, "MANIFEST.md");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(manifestPath, manifest);
  await client.mutation("production:addAsset", { storyId, kind: "other", filePath: manifestPath });
  await client.mutation("design:savePostDraft", {
    storyId,
    platform: story.platform ?? "manual",
    format: story.format ?? "post",
    caption: String(result.caption ?? ""),
    hashtags: Array.isArray(result.hashtags) ? result.hashtags.map(String) : [],
    coverText: result.coverText ? String(result.coverText) : undefined,
    postingNotes: result.postingNotes ? String(result.postingNotes) : undefined,
    status: "ready",
    scheduleIntent: "manual_now",
  });

  // hand-delivery to Telegram: video master or carousel PNGs, ready to download and post
  const token = deliveryToken();
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
  } else if (token && carouselSlides.length) {
    try {
      const form = new FormData();
      form.append("chat_id", settings.telegram_delivery_chat_id ?? settings.telegram_chat_id);
      const thread = settings.telegram_delivery_thread_id;
      if (thread) form.append("message_thread_id", thread);
      const slidesToSend = carouselSlides.slice(0, 10);
      const media = slidesToSend.map((asset, i) => ({
        type: "photo",
        media: `attach://slide${i}`,
        ...(i === 0
          ? { caption: `${story.title}\n\n${result.caption}\n\n${(result.hashtags ?? []).join(" ")}`.slice(0, 1000) }
          : {}),
      }));
      form.append("media", JSON.stringify(media));
      for (const [i, asset] of slidesToSend.entries()) {
        form.append(`slide${i}`, await openAsBlob(asset.filePath), basename(asset.filePath));
      }
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      deliveryNote = data.ok
        ? `carousel package delivered to Telegram (${slidesToSend.length} PNGs)`
        : `telegram delivery failed: ${data.description}`;
    } catch (err) {
      deliveryNote = `telegram delivery failed: ${err.message}`;
    }
  }
  console.log(`  ${deliveryNote}`);
  await client.mutation("pipeline:transition", { storyId, to: "ready_to_post", note: deliveryNote });
  await logEvent("publish", `Packaged → ready to post`, { storyId });
}

// ---- Main loop --------------------------------------------------------------------

const IDLE_MS = 5_000; // design studio + angle room are interactive — poll snappily

async function tick() {
  // Phase 1: connectivity-sensitive reads decide what to do next, in priority
  // order. A throw here really is the backend being down or restarting — back
  // off and retry. No desk/LLM work runs inside this block.
  let action = null;
  try {
    const genReq = await client.query("design:nextGenRequest", {});
    if (genReq) action = { kind: "gen", id: genReq._id }; // Liz is in the design studio waiting
    if (!action) {
      const pendingAngles = await client.query("design:pendingAngleReplies", {});
      if (pendingAngles.length) action = { kind: "angle", id: pendingAngles[0] }; // she's mid-conversation
    }
    if (!action) {
      const board = await client.query("pipeline:board", {});
      for (const s of board) {
        if (s.status !== "design") continue;
        const d = await client.query("design:board", { storyId: s._id });
        if (!d.slides.length) { action = { kind: "design", id: s._id }; break; } // no storyboard rows yet
      }
    }
    if (!action) {
      const rewriteId = await client.query("design:nextPromptRewrite", {});
      if (rewriteId) action = { kind: "rewrite", id: rewriteId }; // she asked the art director to redo prompts
    }
    if (!action) {
      const capcutId = await client.query("design:nextCapcutExport", {});
      if (capcutId) action = { kind: "capcut", id: capcutId }; // she clicked Build CapCut package
    }
    if (!action) {
      const work = await client.query("pipeline:nextWork", {});
      if (work) action = { kind: "work", work };
    }
  } catch (err) {
    // backend down or restarting — wait it out rather than crashing
    console.error(`backend unreachable (${err.message.slice(0, 80)}) — retrying in 15s`);
    await new Promise((r) => setTimeout(r, 15_000));
    return false;
  }
  if (!action) return false;

  // Phase 2: do the work. A throw here is a desk / LLM / generation failure —
  // NOT the backend — so it is labeled and handled as such rather than being
  // mislabeled as "backend unreachable" and silently retried forever.
  // (handleGenRequest and angleReply already record their own failures; this
  // catch is the backstop for the desk work and design seeding.)
  try {
    if (action.kind === "gen") await handleGenRequest(action.id);
    else if (action.kind === "angle") await angleReply(action.id);
    else if (action.kind === "design") await seedDesign(action.id);
    else if (action.kind === "rewrite") await rewriteDesignPrompts(action.id);
    else if (action.kind === "capcut") await runCapcutExport(action.id);
    else {
      const { work } = action;
      if (work.type === "tip") await processTip(work.id);
      else if (work.desk === "drafting") await draftStory(work.id);
      else if (work.desk === "legal_review") await legalReview(work.id);
      else if (work.desk === "production") await produceStory(work.id);
      else if (work.desk === "packaging") await packageStory(work.id);
    }
  } catch (err) {
    console.error(`work item failed (${action.kind}): ${err.message}`);
    if (action.kind === "work" && action.work.type === "story") {
      await client
        .mutation("pipeline:releaseStory", { storyId: action.work.id })
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
