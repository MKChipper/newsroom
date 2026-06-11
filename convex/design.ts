import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ---- Angle room ---------------------------------------------------------------
// A real discussion before any drafting: Liz + a sparring-partner desk that
// pushes back. Locking the agreed angle releases the writers' room.

export const angleThread = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    return await ctx.db
      .query("angleMessages")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
  },
});

export const addAngleMessage = mutation({
  args: {
    storyId: v.id("stories"),
    role: v.union(v.literal("liz"), v.literal("desk")),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("angleMessages", args);
    await ctx.db.patch(args.storyId, { updatedAt: Date.now() });
  },
});

// stories in the angle room whose last word was Liz's — the desk owes a reply
export const pendingAngleReplies = query({
  args: {},
  handler: async (ctx) => {
    const stories = await ctx.db
      .query("stories")
      .withIndex("by_status", (q) => q.eq("status", "angle"))
      .collect();
    const out = [];
    for (const story of stories) {
      const msgs = await ctx.db
        .query("angleMessages")
        .withIndex("by_story", (q) => q.eq("storyId", story._id))
        .collect();
      const last = msgs[msgs.length - 1];
      if (last && last.role === "liz") out.push(story._id);
    }
    return out;
  },
});

export const lockAngle = mutation({
  args: { storyId: v.id("stories"), angle: v.string() },
  handler: async (ctx, { storyId, angle }) => {
    await ctx.db.patch(storyId, {
      angle,
      status: "drafting",
      statusNote: "angle locked in the angle room",
      updatedAt: Date.now(),
    });
  },
});

// ---- Design studio --------------------------------------------------------------
// Storyboard rows derived from the approved script: row = the line being said
// (or shown) + the shot that serves it. Prompts are Liz's to edit; candidates
// accumulate per row; she picks winners; assembly uses only winners.

export const board = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const slides = await ctx.db
      .query("designSlides")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    const candidates = await ctx.db
      .query("designCandidates")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    const requests = await ctx.db
      .query("genRequests")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    return {
      slides: slides.sort((a, b) => a.order - b.order),
      candidates,
      requests,
    };
  },
});

export const seedSlides = mutation({
  args: {
    storyId: v.id("stories"),
    slides: v.array(
      v.object({
        order: v.number(),
        kind: v.string(),
        voLine: v.string(),
        visualNote: v.optional(v.string()),
        prompt: v.string(),
      })
    ),
  },
  handler: async (ctx, { storyId, slides }) => {
    const existing = await ctx.db
      .query("designSlides")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    if (existing.length) return; // already seeded — never clobber Liz's edits
    for (const s of slides) {
      await ctx.db.insert("designSlides", { storyId, ...s });
    }
  },
});

export const updatePrompt = mutation({
  args: { slideId: v.id("designSlides"), prompt: v.string() },
  handler: async (ctx, { slideId, prompt }) => {
    await ctx.db.patch(slideId, { prompt });
  },
});

export const selectCandidate = mutation({
  args: {
    slideId: v.id("designSlides"),
    candidateId: v.optional(v.id("designCandidates")),
  },
  handler: async (ctx, { slideId, candidateId }) => {
    await ctx.db.patch(slideId, { selectedCandidateId: candidateId });
  },
});

// Liz-made assets (Higgsfield with references, screenshots, anything) attach
// as candidates alongside generated ones — same picking flow.
export const addCandidate = mutation({
  args: {
    storyId: v.id("stories"),
    slideId: v.id("designSlides"),
    filePath: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { storyId, slideId, filePath, note }) => {
    return await ctx.db.insert("designCandidates", {
      storyId,
      slideId,
      kind: "slide",
      provider: "liz",
      model: "attached",
      filePath,
      prompt: note ?? "attached by Liz",
    });
  },
});

// ---- Generation queue --------------------------------------------------------

export const queueGen = mutation({
  args: {
    storyId: v.id("stories"),
    slideId: v.optional(v.id("designSlides")),
    kind: v.union(v.literal("slide"), v.literal("mockup")),
    provider: v.string(),
    model: v.string(),
    count: v.number(),
    aspect: v.string(),
    quality: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("genRequests", { ...args, status: "queued" });
  },
});

export const nextGenRequest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("genRequests")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .first();
  },
});

export const claimGenRequest = mutation({
  args: { requestId: v.id("genRequests") },
  handler: async (ctx, { requestId }) => {
    const req = await ctx.db.get(requestId);
    if (!req || req.status !== "queued") return null;
    await ctx.db.patch(requestId, { status: "running" });
    return req;
  },
});

export const finishGenRequest = mutation({
  args: {
    requestId: v.id("genRequests"),
    status: v.union(v.literal("done"), v.literal("failed")),
    error: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    candidates: v.array(
      v.object({
        filePath: v.string(),
        prompt: v.string(),
      })
    ),
  },
  handler: async (ctx, { requestId, status, error, costUsd, candidates }) => {
    const req = await ctx.db.get(requestId);
    if (!req) return;
    await ctx.db.patch(requestId, { status, error, costUsd });
    for (const c of candidates) {
      await ctx.db.insert("designCandidates", {
        storyId: req.storyId,
        slideId: req.slideId,
        kind: req.kind,
        provider: req.provider,
        model: req.model,
        filePath: c.filePath,
        prompt: c.prompt,
        costUsd: costUsd && candidates.length ? costUsd / candidates.length : undefined,
      });
    }
    if (costUsd && costUsd > 0) {
      await ctx.db.insert("costLedger", {
        month: new Date().toISOString().slice(0, 7),
        lane: `${req.provider}:${req.model}`,
        amountUsd: costUsd,
        storyId: req.storyId,
      });
    }
  },
});

// ---- Send to assembly ----------------------------------------------------------

export const sendToAssembly = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story || story.status !== "design") throw new Error("story not in design");
    const slides = await ctx.db
      .query("designSlides")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    const unpicked = slides.filter((s) => !s.selectedCandidateId);
    if (!slides.length) throw new Error("no slides on the board");
    if (unpicked.length) {
      throw new Error(`${unpicked.length} slide(s) have no selected visual`);
    }
    // register winners as story assets so assembly + gate 2 see them —
    // replacing any image assets from earlier rounds (re-design must not
    // mix old visuals with new picks)
    const oldImages = await ctx.db
      .query("assets")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const a of oldImages) {
      if (a.kind === "image") await ctx.db.delete(a._id);
    }
    for (const s of slides) {
      const winner = await ctx.db.get(s.selectedCandidateId!);
      if (winner) {
        await ctx.db.insert("assets", {
          storyId,
          kind: "image",
          filePath: winner.filePath,
          lane: `${winner.provider}:${winner.model}`,
          meta: JSON.stringify({ sectionIndex: s.order, prompt: winner.prompt, slideKind: s.kind }),
        });
      }
    }
    // if a recording is still owed, go wait for it; otherwise straight to assembly
    const recs = await ctx.db
      .query("recordings")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    const owed = recs.some((r) => r.status === "requested");
    await ctx.db.patch(storyId, {
      status: owed ? "recording" : "production",
      statusNote: owed
        ? "design locked — waiting on recordings"
        : "design locked — assembling",
      updatedAt: Date.now(),
    });
  },
});
