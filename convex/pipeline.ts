import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { storyStatus, job } from "./schema";

// ---- Pipeline state machine -------------------------------------------------
// idea          story desk filed it; waiting for Liz to commission
// drafting      writers' room (agent)
// legal_review  legal desk (agent)
// gate1         copy + generation manifest awaiting Liz approval
// recording     waiting on Liz VO / intro files
// production    asset generation + assembly (agent, phase 3)
// gate2         final cut awaiting Liz approval
// packaging     publish package being written (agent)
// ready_to_post package delivered; Liz posts by hand
// posted        Liz marked it live
// rated         ratings desk has scored it against its job

const TRANSITIONS: Record<string, string[]> = {
  idea: ["angle", "drafting", "parked", "killed"],
  angle: ["drafting", "parked", "killed"],
  drafting: ["legal_review", "parked", "killed"],
  legal_review: ["gate1", "drafting", "parked", "killed"],
  gate1: ["design", "recording", "production", "drafting", "killed", "parked"],
  design: ["recording", "production", "drafting", "parked", "killed"],
  recording: ["production", "parked", "killed"],
  production: ["gate2", "design", "parked", "killed"],
  gate2: ["packaging", "production", "design", "killed", "parked"],
  packaging: ["ready_to_post"],
  ready_to_post: ["posted", "parked", "killed"],
  posted: ["rated"],
  parked: ["idea", "angle", "drafting", "killed"],
  rated: [],
  killed: [],
};

const assertGate2ReviewReady = async (ctx: any, storyId: any) => {
  const routes = await ctx.db
    .query("formatRoutes")
    .withIndex("by_story", (q: any) => q.eq("storyId", storyId))
    .collect();
  const selectedRoute = routes.find((route: any) => route.selected);

  const assetRequests = await ctx.db
    .query("assetRequests")
    .withIndex("by_story", (q: any) => q.eq("storyId", storyId))
    .collect();
  const outstandingRequiredAssets = assetRequests.filter((request: any) => {
    const appliesToActiveScope = !request.routeId || (selectedRoute && request.routeId === selectedRoute._id);
    return appliesToActiveScope &&
      request.required &&
      (request.status === "needed" || request.status === "generating");
  });
  if (outstandingRequiredAssets.length > 0) {
    const labels = outstandingRequiredAssets.map((request: any) => request.label).join("; ");
    throw new Error(`Gate 2 approval requires required assets to be supplied, selected, or waived: ${labels}`);
  }

  // The structured review loop is deliberately OPTIONAL (2026-07-16): Liz
  // approves by looking at the rendered deck itself. The full form remains
  // available for when she wants a documented pass, but it never blocks the
  // gate. Only genuinely missing required assets (above) block approval.
};

export const board = query({
  args: {},
  handler: async (ctx) => {
    const stories = await ctx.db.query("stories").collect();
    return stories.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const storyDetail = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return null;
    const byStory = (table:
      | "claims"
      | "scripts"
      | "generationRuns"
      | "assets"
      | "recordings"
      | "gateEvents"
      | "creativeBriefs"
      | "formatRoutes"
      | "assetRequests"
      | "postDrafts"
    ) =>
      ctx.db
        .query(table)
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect();
    const [claims, scripts, runs, assets, recordings, gates, briefs, routes, assetRequests, postDrafts] = await Promise.all([
      byStory("claims"),
      byStory("scripts"),
      byStory("generationRuns"),
      byStory("assets"),
      byStory("recordings"),
      byStory("gateEvents"),
      byStory("creativeBriefs"),
      byStory("formatRoutes"),
      byStory("assetRequests"),
      byStory("postDrafts"),
    ]);
    return { story, claims, scripts, runs, assets, recordings, gates, briefs, routes, assetRequests, postDrafts };
  },
});

export const storyBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("stories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

export const createStory = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    job,
    angle: v.optional(v.string()),
    summary: v.optional(v.string()),
    platform: v.optional(v.string()),
    format: v.optional(v.string()),
    score: v.optional(
      v.object({
        hook: v.number(),
        evidence: v.number(),
        effort: v.number(),
        risk: v.number(),
        total: v.number(),
      })
    ),
    brainVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("stories", {
      ...args,
      status: "idea",
      updatedAt: Date.now(),
    });
  },
});

export const transition = mutation({
  args: {
    storyId: v.id("stories"),
    to: storyStatus,
    note: v.optional(v.string()),
  },
  handler: async (ctx, { storyId, to, note }) => {
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("story not found");
    const allowed = TRANSITIONS[story.status] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`illegal transition ${story.status} -> ${to}`);
    }
    if (story.status === "gate2" && to === "packaging") {
      await assertGate2ReviewReady(ctx, storyId);
    }
    await ctx.db.patch(storyId, {
      status: to,
      statusNote: note,
      lockedBy: undefined,
      lockedAt: undefined,
      updatedAt: Date.now(),
    });
    if (to === "posted") {
      const drafts = await ctx.db
        .query("postDrafts")
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect();
      for (const draft of drafts) await ctx.db.patch(draft._id, { status: "posted", updatedAt: Date.now() });
    }
  },
});

export const gateDecision = mutation({
  args: {
    storyId: v.id("stories"),
    gate: v.number(),
    decision: v.union(v.literal("approve"), v.literal("redo"), v.literal("kill")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { storyId, gate, decision, note }) => {
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("story not found");
    await ctx.db.insert("gateEvents", { storyId, gate, decision, note });

    let to: string;
    if (decision === "kill") to = "killed";
    else if (gate === 1) {
      // approving Gate 1 releases the story into the design studio — assets
      // are made WITH Liz there, never fire-and-forget
      to = decision === "approve" ? "design" : "drafting";
      if (decision === "approve") {
        // approving gate 1 also approves the planned generation manifest
        const runs = await ctx.db
          .query("generationRuns")
          .withIndex("by_story", (q) => q.eq("storyId", storyId))
          .collect();
        for (const run of runs) {
          if (run.status === "planned") {
            await ctx.db.patch(run._id, { status: "approved" });
          }
        }
      }
    } else {
      to = decision === "approve" ? "packaging" : "production";
      if (decision === "approve") {
        await assertGate2ReviewReady(ctx, storyId);
      }
    }
    await ctx.db.patch(storyId, {
      status: to as any,
      statusNote: note,
      updatedAt: Date.now(),
    });
  },
});

// ---- Ratings desk -------------------------------------------------------------

export const setMetrics = mutation({
  args: {
    storyId: v.id("stories"),
    metrics: v.object({
      views: v.number(),
      likes: v.number(),
      comments: v.number(),
      saves: v.number(),
      shares: v.number(),
      clicks: v.number(),
      follows: v.number(),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { storyId, metrics }) => {
    await ctx.db.patch(storyId, {
      metrics: { ...metrics, recordedAt: Date.now() },
      updatedAt: Date.now(),
    });
  },
});

export const postedStories = query({
  args: {},
  handler: async (ctx) => {
    const posted = await ctx.db
      .query("stories")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();
    const rated = await ctx.db
      .query("stories")
      .withIndex("by_status", (q) => q.eq("status", "rated"))
      .collect();
    return { posted, rated };
  },
});

export const saveMemo = mutation({
  args: { week: v.string(), body: v.string() },
  handler: async (ctx, { week, body }) => {
    const existing = await ctx.db
      .query("memos")
      .withIndex("by_week", (q) => q.eq("week", week))
      .first();
    if (existing) await ctx.db.patch(existing._id, { body });
    else await ctx.db.insert("memos", { week, body });
  },
});

export const memosList = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("memos").order("desc").take(20);
  },
});

// ---- Tip line ---------------------------------------------------------------

export const addTip = mutation({
  args: {
    kind: v.union(
      v.literal("url"),
      v.literal("pdf"),
      v.literal("note"),
      v.literal("reddit"),
      v.literal("ruling"),
      v.literal("screenshot")
    ),
    sourceUrl: v.optional(v.string()),
    filePath: v.optional(v.string()),
    rawText: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tips", { ...args, status: "new" });
  },
});

export const tipsList = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tips").order("desc").take(100);
  },
});

// ---- Agent runner coordination ----------------------------------------------
// Agent-actionable work, in priority order. The runner claims one item at a
// time; locks older than 30 minutes are treated as dead and reclaimed.

const LOCK_TTL_MS = 30 * 60 * 1000;

export const nextWork = query({
  args: {},
  handler: async (ctx) => {
    const tip = await ctx.db
      .query("tips")
      .withIndex("by_status", (q) => q.eq("status", "new"))
      .first();
    if (tip) return { type: "tip" as const, id: tip._id };

    for (const desk of ["drafting", "legal_review", "production", "packaging"] as const) {
      const stories = await ctx.db
        .query("stories")
        .withIndex("by_status", (q) => q.eq("status", desk))
        .collect();
      const free = stories.find(
        (s) => !s.lockedBy || (s.lockedAt ?? 0) < Date.now() - LOCK_TTL_MS
      );
      if (free) return { type: "story" as const, id: free._id, desk };
    }
    return null;
  },
});

export const claimStory = mutation({
  args: { storyId: v.id("stories"), worker: v.string() },
  handler: async (ctx, { storyId, worker }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return null;
    if (story.lockedBy && (story.lockedAt ?? 0) > Date.now() - LOCK_TTL_MS) {
      return null;
    }
    await ctx.db.patch(storyId, { lockedBy: worker, lockedAt: Date.now() });
    return story;
  },
});

export const releaseStory = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    await ctx.db.patch(storyId, { lockedBy: undefined, lockedAt: undefined });
  },
});

export const claimTip = mutation({
  args: { tipId: v.id("tips") },
  handler: async (ctx, { tipId }) => {
    const tip = await ctx.db.get(tipId);
    if (!tip || tip.status !== "new") return null;
    await ctx.db.patch(tipId, { status: "processing" });
    return tip;
  },
});

export const deleteStory = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    for (const table of [
      "claims", "scripts", "generationRuns", "assets", "recordings",
      "gateEvents", "telegramNotices", "angleMessages", "designSlides",
      "designCandidates", "genRequests", "creativeBriefs", "formatRoutes",
      "assetRequests", "postDrafts", "postReviews",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    await ctx.db.delete(storyId);
  },
});

export const resetTip = mutation({
  args: { tipId: v.id("tips") },
  handler: async (ctx, { tipId }) => {
    await ctx.db.patch(tipId, { status: "new", extracted: undefined, sourceGrade: undefined });
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_tip", (q) => q.eq("tipId", tipId))
      .collect();
    for (const c of claims) await ctx.db.delete(c._id);
  },
});

export const finishTip = mutation({
  args: {
    tipId: v.id("tips"),
    extracted: v.string(),
    sourceGrade: v.string(),
    status: v.union(v.literal("processed"), v.literal("rejected")),
  },
  handler: async (ctx, { tipId, extracted, sourceGrade, status }) => {
    await ctx.db.patch(tipId, { extracted, sourceGrade, status });
  },
});
