import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { claimClass } from "./schema";

// ---- Claims ledger ----------------------------------------------------------

export const addClaims = mutation({
  args: {
    storyId: v.optional(v.id("stories")),
    tipId: v.optional(v.id("tips")),
    claims: v.array(
      v.object({
        text: v.string(),
        classification: claimClass,
        citation: v.optional(v.string()),
        brandNames: v.array(v.string()),
        riskNote: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { storyId, tipId, claims }) => {
    for (const claim of claims) {
      await ctx.db.insert("claims", { storyId, tipId, ...claim });
    }
  },
});

export const replaceStoryClaims = mutation({
  args: {
    storyId: v.id("stories"),
    claims: v.array(
      v.object({
        text: v.string(),
        classification: claimClass,
        citation: v.optional(v.string()),
        brandNames: v.array(v.string()),
        riskNote: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { storyId, claims }) => {
    const existing = await ctx.db
      .query("claims")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const c of existing) await ctx.db.delete(c._id);
    for (const claim of claims) {
      await ctx.db.insert("claims", { storyId, ...claim });
    }
  },
});

// ---- Scripts ----------------------------------------------------------------

export const saveScript = mutation({
  args: {
    storyId: v.id("stories"),
    sections: v.array(
      v.object({
        kind: v.string(),
        text: v.string(),
        wordCount: v.number(),
        estSeconds: v.number(),
        visualNote: v.optional(v.string()),
      })
    ),
    targetRuntimeSec: v.number(),
    voiceNotes: v.optional(v.string()),
  },
  handler: async (ctx, { storyId, sections, targetRuntimeSec, voiceNotes }) => {
    const prior = await ctx.db
      .query("scripts")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const p of prior) {
      if (p.status !== "superseded") {
        await ctx.db.patch(p._id, { status: "superseded" });
      }
    }
    const totalWords = sections.reduce((n, s) => n + s.wordCount, 0);
    const estRuntimeSec = sections.reduce((n, s) => n + s.estSeconds, 0);
    return await ctx.db.insert("scripts", {
      storyId,
      version: prior.length + 1,
      sections,
      totalWords,
      estRuntimeSec,
      targetRuntimeSec,
      voiceNotes,
      status: "draft",
    });
  },
});

export const setScratchRuntime = mutation({
  args: { scriptId: v.id("scripts"), scratchRuntimeSec: v.number() },
  handler: async (ctx, { scriptId, scratchRuntimeSec }) => {
    await ctx.db.patch(scriptId, { scratchRuntimeSec });
  },
});

export const setScriptStatus = mutation({
  args: {
    scriptId: v.id("scripts"),
    status: v.union(
      v.literal("draft"),
      v.literal("legal_passed"),
      v.literal("legal_bounced"),
      v.literal("approved"),
      v.literal("superseded")
    ),
    legalNotes: v.optional(v.string()),
  },
  handler: async (ctx, { scriptId, status, legalNotes }) => {
    await ctx.db.patch(scriptId, { status, legalNotes });
  },
});

// ---- Generation manifest (the Higgsfield-style cost card) --------------------

export const planRuns = mutation({
  args: {
    storyId: v.id("stories"),
    runs: v.array(
      v.object({
        lane: v.string(),
        model: v.string(),
        count: v.number(),
        quality: v.string(),
        format: v.string(),
        estCostUsd: v.number(),
        note: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { storyId, runs }) => {
    const existing = await ctx.db
      .query("generationRuns")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const r of existing) {
      if (r.status === "planned") await ctx.db.delete(r._id);
    }
    for (const run of runs) {
      await ctx.db.insert("generationRuns", { storyId, ...run, status: "planned" });
    }
  },
});

export const recordRunResult = mutation({
  args: {
    runId: v.id("generationRuns"),
    status: v.union(v.literal("done"), v.literal("failed")),
    actualCostUsd: v.optional(v.number()),
  },
  handler: async (ctx, { runId, status, actualCostUsd }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("run not found");
    await ctx.db.patch(runId, { status, actualCostUsd });
    if (actualCostUsd && actualCostUsd > 0) {
      const month = new Date().toISOString().slice(0, 7);
      await ctx.db.insert("costLedger", {
        month,
        lane: run.lane,
        amountUsd: actualCostUsd,
        storyId: run.storyId,
        runId,
      });
    }
  },
});

export const monthSpend = query({
  args: {},
  handler: async (ctx) => {
    const month = new Date().toISOString().slice(0, 7);
    const rows = await ctx.db
      .query("costLedger")
      .withIndex("by_month", (q) => q.eq("month", month))
      .collect();
    const byLane: Record<string, number> = {};
    for (const r of rows) byLane[r.lane] = (byLane[r.lane] ?? 0) + r.amountUsd;
    return { month, total: rows.reduce((n, r) => n + r.amountUsd, 0), byLane };
  },
});

// ---- Assets + recordings ------------------------------------------------------

export const addAsset = mutation({
  args: {
    storyId: v.id("stories"),
    kind: v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("vo"),
      v.literal("caption"),
      v.literal("master"),
      v.literal("other")
    ),
    filePath: v.string(),
    lane: v.optional(v.string()),
    meta: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("assets", args);
  },
});

export const requestRecording = mutation({
  args: {
    storyId: v.id("stories"),
    kind: v.union(v.literal("vo"), v.literal("intro")),
    brief: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.storyId, { needsRecording: true, updatedAt: Date.now() });
    return await ctx.db.insert("recordings", { ...args, status: "requested" });
  },
});

export const recordingReceived = mutation({
  args: {
    recordingId: v.id("recordings"),
    filePath: v.string(),
    durationSec: v.optional(v.number()),
  },
  handler: async (ctx, { recordingId, filePath, durationSec }) => {
    await ctx.db.patch(recordingId, { status: "received", filePath, durationSec });
    // if every requested recording for this story is now in, resume the pipeline
    const rec = await ctx.db.get(recordingId);
    if (!rec) return;
    const all = await ctx.db
      .query("recordings")
      .withIndex("by_story", (q) => q.eq("storyId", rec.storyId))
      .collect();
    const story = await ctx.db.get(rec.storyId);
    if (
      story?.status === "recording" &&
      all.every((r) => r.status !== "requested")
    ) {
      await ctx.db.patch(rec.storyId, {
        status: "production",
        statusNote: "recordings in — resumed automatically",
        updatedAt: Date.now(),
      });
    }
  },
});

export const recordingQueue = query({
  args: {},
  handler: async (ctx) => {
    const requested = await ctx.db
      .query("recordings")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .collect();
    const out = [];
    for (const r of requested) {
      const story = await ctx.db.get(r.storyId);
      out.push({ ...r, storyTitle: story?.title ?? "?", storySlug: story?.slug });
    }
    return out;
  },
});
