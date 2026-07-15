import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const assetKindFromText = (text: string) => {
  const t = text.toLowerCase();
  if (t.includes("screenshot")) return "screenshot";
  if (t.includes("receipt") || t.includes("ruling") || t.includes("citation")) return "receipt";
  if (t.includes("product") || t.includes("bottle") || t.includes("label")) return "product";
  if (t.includes("reference") || t.includes("face") || t.includes("soul")) return "reference";
  if (t.includes("voice") || t.includes("vo") || t.includes("record")) return "voice";
  if (t.includes("video")) return "generated_video";
  if (t.includes("image") || t.includes("visual")) return "generated_image";
  return "other";
};

const postStage = (status: string) => {
  if (status === "idea") return "ideas";
  if (status === "gate1" || status === "gate2") return "approvals";
  if (status === "ready_to_post") return "ready";
  if (status === "posted" || status === "rated") return "posted";
  return "drafts";
};

const isCarouselFormat = (format?: string) => /carousel/i.test(format ?? "");
const assetMeta = (asset: any) => {
  try {
    return JSON.parse(asset.meta ?? "{}");
  } catch {
    return {};
  }
};
const latestCarouselImages = (assets: any[]) => {
  const slides = assets.filter((a) => a.kind === "image" && assetMeta(a).carouselSlide);
  if (slides.length === 0) return [];
  const latest = Math.max(...slides.map((a) => Number(assetMeta(a).renderedAt ?? 0)));
  return slides
    .filter((a) => !latest || Number(assetMeta(a).renderedAt ?? 0) === latest)
    .sort((a, b) => Number(assetMeta(a).sectionIndex ?? 0) - Number(assetMeta(b).sectionIndex ?? 0));
};

const reviewGate = v.union(
  v.literal("green"),
  v.literal("amber"),
  v.literal("red"),
  v.literal("pending")
);

const reviewProof = v.object({
  firstFrame: v.string(),
  hookPromise: v.string(),
  messageSpine: v.string(),
  appResolver: v.string(),
  cta: v.string(),
  pixelEvidence: v.string(),
  finalViewerAction: v.string(),
});

const reviewGateRevisions = v.object({
  formatLock: v.string(),
  hook: v.string(),
  messageSpine: v.string(),
  appResolver: v.string(),
  assetTruth: v.string(),
  voiceCompliance: v.string(),
  pixelMotion: v.string(),
  platformNative: v.string(),
});

const reviewProofFields = [
  "firstFrame",
  "hookPromise",
  "messageSpine",
  "appResolver",
  "cta",
  "pixelEvidence",
  "finalViewerAction",
] as const;

const reviewGateFields = [
  "formatLock",
  "hook",
  "messageSpine",
  "appResolver",
  "assetTruth",
  "voiceCompliance",
  "pixelMotion",
  "platformNative",
] as const;

const hasReadyProof = (proof?: Record<string, string>) =>
  !!proof && reviewProofFields.every((field) => (proof[field] ?? "").trim().length >= 12);

const hasReviewArtifact = (artifactPath?: string) => (artifactPath ?? "").trim().length >= 6;
const hasVisualReviewEvidence = (contactSheetPath?: string) => (contactSheetPath ?? "").trim().length >= 6;
const hasOpenReviewGate = (gates: Record<string, string>) =>
  Object.values(gates).some((gate) => gate === "amber" || gate === "red");

const hasActionableRevision = (requiredRevisions: string) => {
  const text = requiredRevisions.trim();
  return text.length >= 20 && text.toLowerCase() !== "no revision notes recorded.";
};

const hasActionableNextAsset = (nextAssetNeeded?: string) => {
  const text = nextAssetNeeded?.trim() ?? "";
  return text.length >= 12 && text.toLowerCase() !== "more assets";
};

const missingGateRevisionFields = (gates: Record<string, string>, gateRevisions?: Record<string, string>) =>
  reviewGateFields.filter((field) => {
    const open = gates[field] === "amber" || gates[field] === "red";
    return open && (gateRevisions?.[field] ?? "").trim().length < 20;
  });

const openRequiredAssetRequests = (requests: any[], routeId?: any, allowReviewGenerated = false) =>
  requests.filter((request: any) => {
    const appliesToActiveScope = !request.routeId || (routeId && request.routeId === routeId);
    const isOpen = request.status === "needed" || request.status === "generating";
    const reviewGenerated = request.owner === "liz" && request.label.startsWith("Review asset:");
    return appliesToActiveScope &&
      request.required &&
      isOpen &&
      (!allowReviewGenerated || !reviewGenerated);
  });

const assertReviewRouteScope = async (ctx: any, storyId: any, routeId?: any) => {
  const story = await ctx.db.get(storyId);
  if (!story) throw new Error("Story not found.");

  const routes = await ctx.db
    .query("formatRoutes")
    .withIndex("by_story", (q: any) => q.eq("storyId", storyId))
    .collect();
  if (routes.length === 0) {
    if (routeId) throw new Error("Review route does not belong to this story.");
    return;
  }

  const selectedRoute = routes.find((route: any) => route.selected);
  if (!selectedRoute) throw new Error("Review pass requires a selected route.");
  if (!routeId) throw new Error("Review pass must be saved against the selected route.");
  if (routeId !== selectedRoute._id) throw new Error("Review pass must match the selected route.");
};

const syncReviewAssetRequest = async (ctx: any, args: {
  storyId: any;
  routeId?: any;
  passNo: number;
  decision: string;
  nextAssetNeeded?: string;
}) => {
  const now = Date.now();
  const requests = await ctx.db
    .query("assetRequests")
    .withIndex("by_story", (q: any) => q.eq("storyId", args.storyId))
    .collect();

  if (args.decision === "ready") {
    for (const request of requests) {
      const sameActiveScope = !request.routeId || (args.routeId && request.routeId === args.routeId);
      const open = request.status === "needed" || request.status === "generating";
      if (sameActiveScope && request.owner === "liz" && open && request.label.startsWith("Review asset:")) {
        await ctx.db.patch(request._id, { status: "waived", updatedAt: now });
      }
    }
    return;
  }

  const need = args.nextAssetNeeded?.trim();
  if (!need) return;

  const existing = requests.find((request: any) => {
    const sameRoute = args.routeId ? request.routeId === args.routeId : !request.routeId;
    return sameRoute &&
      request.owner === "liz" &&
      request.status !== "waived" &&
      request.instructions.trim().toLowerCase() === need.toLowerCase();
  });

  if (existing) {
    await ctx.db.patch(existing._id, { status: "needed", required: true, updatedAt: now });
    return;
  }

  await ctx.db.insert("assetRequests", {
    storyId: args.storyId,
    ...(args.routeId ? { routeId: args.routeId } : {}),
    owner: "liz",
    kind: assetKindFromText(need) as any,
    label: `Review asset: ${need}`.slice(0, 80),
    instructions: need,
    required: true,
    status: "needed",
    createdAt: now,
    updatedAt: now,
  });
};

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
      statusNote: "angle locked — producer rebuilding the brief",
      // the runner's producer pass turns the angle-room conversation into the
      // real brief (format + structure + split assets) before drafting.
      producerPending: true,
      updatedAt: Date.now(),
    });
  },
});

export const clearProducerPending = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    await ctx.db.patch(storyId, { producerPending: false });
  },
});

const ASSET_KINDS = new Set([
  "screenshot", "receipt", "product", "reference", "voice", "face",
  "generated_image", "generated_video", "other",
]);
const ASSET_STRATEGIES = new Set([
  "agent_can_create", "needs_liz_assets", "mixed", "informational_only",
]);

// Apply the producer's brief: supersede the commissioned route with one built
// from what the angle room actually agreed, and rebuild the asset list (split by
// owner, with the screenshot agent/human flags). This is what stops the drafted
// post drifting back to a stale route.
export const applyProducerBrief = mutation({
  args: {
    storyId: v.id("stories"),
    brief: v.object({
      format: v.string(),
      platform: v.optional(v.string()),
      postType: v.string(),
      spine: v.string(),
      structure: v.string(),
      visualTreatment: v.optional(v.string()),
      assetStrategy: v.optional(v.string()),
      rationale: v.optional(v.string()),
      assets: v.array(
        v.object({
          owner: v.string(),
          kind: v.string(),
          label: v.string(),
          instructions: v.string(),
          required: v.optional(v.boolean()),
          canAgentAttempt: v.optional(v.boolean()),
          sourceUrl: v.optional(v.string()),
        })
      ),
    }),
  },
  handler: async (ctx, { storyId, brief }) => {
    const now = Date.now();
    const story = await ctx.db.get(storyId);
    if (!story) throw new Error("story not found");
    const platform = brief.platform || story.platform || "instagram";
    const strategy = ASSET_STRATEGIES.has(brief.assetStrategy ?? "") ? (brief.assetStrategy as any) : "mixed";

    // 1. supersede every existing route
    const routes = await ctx.db
      .query("formatRoutes")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    const order = routes.reduce((m, r) => Math.max(m, r.order), 0) + 1;
    for (const r of routes) {
      if (r.selected) await ctx.db.patch(r._id, { selected: false, updatedAt: now });
    }

    // 2. insert the producer's route as the selected one
    const routeId = await ctx.db.insert("formatRoutes", {
      storyId,
      order,
      title: brief.postType,
      angle: brief.spine,
      platform,
      format: brief.format,
      postType: brief.postType,
      structure: brief.structure,
      visualTreatment: brief.visualTreatment ?? "",
      assetStrategy: strategy,
      lizAssetNeeds: brief.assets.filter((a) => a.owner === "liz").map((a) => a.label),
      agentAssetPlan: brief.assets.filter((a) => a.owner === "agent").map((a) => a.label),
      rationale: brief.rationale ?? "Rebuilt from the angle room.",
      risk: "low",
      effort: 3,
      selected: true,
      createdAt: now,
      updatedAt: now,
    });

    // 3. clear the stale open asset demands, keep anything already supplied
    const requests = await ctx.db
      .query("assetRequests")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const req of requests) {
      if (req.status === "needed" || req.status === "generating") {
        await ctx.db.delete(req._id);
      }
    }

    // 4. create the agreed split asset list
    for (const a of brief.assets) {
      await ctx.db.insert("assetRequests", {
        storyId,
        routeId,
        owner: a.owner === "agent" ? "agent" : "liz",
        kind: (ASSET_KINDS.has(a.kind) ? a.kind : "other") as any,
        label: a.label.slice(0, 80),
        instructions: a.instructions,
        required: a.required ?? true,
        ...(a.canAgentAttempt !== undefined ? { canAgentAttempt: a.canAgentAttempt } : {}),
        ...(a.sourceUrl ? { sourceUrl: a.sourceUrl } : {}),
        status: "needed",
        createdAt: now,
        updatedAt: now,
      });
    }

    // 5. patch the story onto the agreed format + clean spine
    await ctx.db.patch(storyId, {
      format: brief.format,
      platform,
      angle: brief.spine,
      producerPending: false,
      statusNote: "brief rebuilt from the angle room",
      updatedAt: now,
    });
  },
});

// ---- Post studio ---------------------------------------------------------------

export const saveCreativeBrief = mutation({
  args: {
    storyId: v.id("stories"),
    researchSummary: v.string(),
    audienceLanguage: v.array(v.string()),
    editorFocus: v.optional(v.string()),
    routes: v.array(
      v.object({
        title: v.string(),
        angle: v.string(),
        platform: v.string(),
        format: v.string(),
        tier: v.optional(v.number()),
        postType: v.string(),
        structure: v.string(),
        visualTreatment: v.string(),
        assetStrategy: v.union(
          v.literal("agent_can_create"),
          v.literal("needs_liz_assets"),
          v.literal("mixed"),
          v.literal("informational_only")
        ),
        lizAssetNeeds: v.array(v.string()),
        agentAssetPlan: v.array(v.string()),
        rationale: v.string(),
        risk: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
        effort: v.number(),
      })
    ),
  },
  handler: async (ctx, { storyId, researchSummary, audienceLanguage, editorFocus, routes }) => {
    const now = Date.now();
    const priorBriefs = await ctx.db
      .query("creativeBriefs")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const brief of priorBriefs) {
      if (brief.status !== "superseded") await ctx.db.patch(brief._id, { status: "superseded", updatedAt: now });
    }
    const priorRoutes = await ctx.db
      .query("formatRoutes")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const route of priorRoutes) {
      if (!route.selected) await ctx.db.delete(route._id);
    }
    const briefId = await ctx.db.insert("creativeBriefs", {
      storyId,
      status: "drafted",
      researchSummary,
      audienceLanguage,
      editorFocus,
      createdAt: now,
      updatedAt: now,
    });
    for (const [order, route] of routes.entries()) {
      await ctx.db.insert("formatRoutes", {
        storyId,
        briefId,
        order,
        selected: false,
        createdAt: now,
        updatedAt: now,
        ...route,
      });
    }
    await ctx.db.patch(storyId, { updatedAt: now });
    return briefId;
  },
});

export const selectFormatRoute = mutation({
  args: {
    storyId: v.id("stories"),
    routeId: v.id("formatRoutes"),
  },
  handler: async (ctx, { storyId, routeId }) => {
    const route = await ctx.db.get(routeId);
    if (!route || route.storyId !== storyId) throw new Error("route not found for story");
    const now = Date.now();
    const routes = await ctx.db
      .query("formatRoutes")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const r of routes) {
      await ctx.db.patch(r._id, { selected: r._id === routeId, updatedAt: now });
    }
    if (route.briefId) {
      await ctx.db.patch(route.briefId, { status: "selected", updatedAt: now });
    }
    const requests = await ctx.db
      .query("assetRequests")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const req of requests) {
      if (req.routeId && req.routeId !== routeId && (req.status === "needed" || req.status === "generating")) {
        await ctx.db.patch(req._id, { status: "waived", updatedAt: now });
      }
    }
    const currentLabels = new Set(
      requests
        .filter((r) => r.routeId === routeId && r.status !== "waived")
        .map((r) => `${r.owner}:${r.label}`)
    );
    for (const need of route.lizAssetNeeds) {
      const label = need.slice(0, 80);
      if (!currentLabels.has(`liz:${label}`)) {
        await ctx.db.insert("assetRequests", {
          storyId,
          routeId,
          owner: "liz",
          kind: assetKindFromText(need) as any,
          label,
          instructions: need,
          required: true,
          status: "needed",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    for (const plan of route.agentAssetPlan) {
      const label = plan.slice(0, 80);
      if (!currentLabels.has(`agent:${label}`)) {
        await ctx.db.insert("assetRequests", {
          storyId,
          routeId,
          owner: "agent",
          kind: assetKindFromText(plan) as any,
          label,
          instructions: plan,
          required: route.assetStrategy !== "informational_only",
          status: "needed",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch(storyId, {
      angle: route.angle,
      platform: route.platform,
      format: route.format,
      statusNote: `route selected: ${route.title}`,
      updatedAt: now,
    });
  },
});

export const addAssetRequest = mutation({
  args: {
    storyId: v.id("stories"),
    routeId: v.optional(v.id("formatRoutes")),
    owner: v.union(v.literal("liz"), v.literal("agent")),
    kind: v.union(
      v.literal("screenshot"),
      v.literal("receipt"),
      v.literal("product"),
      v.literal("reference"),
      v.literal("voice"),
      v.literal("face"),
      v.literal("generated_image"),
      v.literal("generated_video"),
      v.literal("other")
    ),
    label: v.string(),
    instructions: v.string(),
    required: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("assetRequests", {
      ...args,
      status: "needed",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateAssetRequest = mutation({
  args: {
    requestId: v.id("assetRequests"),
    status: v.optional(
      v.union(
        v.literal("needed"),
        v.literal("supplied"),
        v.literal("generating"),
        v.literal("selected"),
        v.literal("waived")
      )
    ),
    filePath: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, status, filePath }) => {
    await ctx.db.patch(requestId, {
      ...(status ? { status } : {}),
      ...(filePath ? { filePath } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const savePostDraft = mutation({
  args: {
    storyId: v.id("stories"),
    platform: v.string(),
    format: v.string(),
    caption: v.string(),
    hashtags: v.array(v.string()),
    coverText: v.optional(v.string()),
    postingNotes: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("awaiting_approval"),
      v.literal("ready"),
      v.literal("posted")
    ),
    scheduleIntent: v.optional(
      v.union(
        v.literal("next_available"),
        v.literal("prioritize"),
        v.literal("date_time"),
        v.literal("manual_now")
      )
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("postDrafts")
      .withIndex("by_story", (q) => q.eq("storyId", args.storyId))
      .first();
    const row = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("postDrafts", row);
  },
});

export const savePostReview = mutation({
  args: {
    storyId: v.id("stories"),
    routeId: v.optional(v.id("formatRoutes")),
    passNo: v.number(),
    gates: v.object({
      formatLock: reviewGate,
      hook: reviewGate,
      messageSpine: reviewGate,
      appResolver: reviewGate,
      assetTruth: reviewGate,
      voiceCompliance: reviewGate,
      pixelMotion: reviewGate,
      platformNative: reviewGate,
    }),
    decision: v.union(
      v.literal("ready"),
      v.literal("revise"),
      v.literal("blocked"),
      v.literal("pending")
    ),
    proof: v.optional(reviewProof),
    artifactPath: v.optional(v.string()),
    contactSheetPath: v.optional(v.string()),
    gateRevisions: v.optional(reviewGateRevisions),
    requiredRevisions: v.string(),
    nextAssetNeeded: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertReviewRouteScope(ctx, args.storyId, args.routeId);
    const assetRequests = await ctx.db
      .query("assetRequests")
      .withIndex("by_story", (q) => q.eq("storyId", args.storyId))
      .collect();
    if (hasOpenReviewGate(args.gates) && !hasActionableRevision(args.requiredRevisions)) {
      throw new Error("Amber or red review gates require a concrete revision instruction.");
    }
    if (args.decision !== "ready" && !hasActionableRevision(args.requiredRevisions) && !hasActionableNextAsset(args.nextAssetNeeded)) {
      throw new Error("Non-ready review passes require a concrete revision instruction or a specific next asset.");
    }
    if (missingGateRevisionFields(args.gates, args.gateRevisions).length > 0) {
      throw new Error("Every amber or red review gate requires its own concrete fix.");
    }
    if (args.decision === "ready") {
      const hasOpenGate = reviewGateFields.some((field) => args.gates[field] !== "green");
      if (hasOpenGate) throw new Error("Ready review requires every gate to be green.");
      if (!hasReadyProof(args.proof)) {
        throw new Error("Ready review requires proof for first frame, hook promise, message spine, app resolver, CTA, pixel evidence, and final viewer action.");
      }
      if (!hasReviewArtifact(args.artifactPath)) {
        throw new Error("Ready review requires the rendered artifact path.");
      }
      if (!hasVisualReviewEvidence(args.contactSheetPath)) {
        throw new Error("Ready review requires a contact sheet or reviewed stills path.");
      }
      if (args.nextAssetNeeded?.trim()) {
        throw new Error("Ready review cannot request a next asset.");
      }
      const outstandingAssets = openRequiredAssetRequests(assetRequests, args.routeId, true);
      if (outstandingAssets.length > 0) {
        const labels = outstandingAssets.map((request: any) => request.label).join("; ");
        throw new Error(`Ready review requires required assets to be supplied, selected, or waived: ${labels}`);
      }
    }
    const now = Date.now();
    const reviewId = await ctx.db.insert("postReviews", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    await syncReviewAssetRequest(ctx, args);
    return reviewId;
  },
});

export const assetInbox = query({
  args: {},
  handler: async (ctx) => {
    const requests = await ctx.db
      .query("assetRequests")
      .withIndex("by_owner_status", (q) => q.eq("owner", "liz").eq("status", "needed"))
      .collect();
    const supplied = await ctx.db
      .query("assetRequests")
      .withIndex("by_owner_status", (q) => q.eq("owner", "liz").eq("status", "supplied"))
      .collect();
    const out = [];
    for (const req of [...requests, ...supplied]) {
      const story = await ctx.db.get(req.storyId);
      out.push({ ...req, story });
    }
    return out.sort((a, b) => {
      if (a.status !== b.status) return a.status === "needed" ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  },
});

export const postStudioList = query({
  args: {},
  handler: async (ctx) => {
    const stories = await ctx.db.query("stories").collect();
    const out = [];
    for (const story of stories.sort((a, b) => b.updatedAt - a.updatedAt)) {
      const [briefs, routes, requests, drafts, reviews, assets, scripts] = await Promise.all([
        ctx.db.query("creativeBriefs").withIndex("by_story", (q) => q.eq("storyId", story._id)).collect(),
        ctx.db.query("formatRoutes").withIndex("by_story", (q) => q.eq("storyId", story._id)).collect(),
        ctx.db.query("assetRequests").withIndex("by_story", (q) => q.eq("storyId", story._id)).collect(),
        ctx.db.query("postDrafts").withIndex("by_story", (q) => q.eq("storyId", story._id)).collect(),
        ctx.db.query("postReviews").withIndex("by_story", (q) => q.eq("storyId", story._id)).collect(),
        ctx.db.query("assets").withIndex("by_story", (q) => q.eq("storyId", story._id)).collect(),
        ctx.db.query("scripts").withIndex("by_story", (q) => q.eq("storyId", story._id)).collect(),
      ]);
      const selectedRoute = routes.find((r) => r.selected);
      const lizNeeded = requests.filter((r) => r.owner === "liz" && r.status === "needed").length;
      const agentNeeded = requests.filter((r) => r.owner === "agent" && (r.status === "needed" || r.status === "generating")).length;
      const master = assets.find((a) => a.kind === "master");
      const carouselImage = latestCarouselImages(assets)[0];
      const image = carouselImage ?? assets.find((a) => a.kind === "image");
      const draft = drafts.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const sortedReviews = reviews.sort((a, b) => b.updatedAt - a.updatedAt);
      const latestReview = selectedRoute
        ? sortedReviews.find((review) => review.routeId === selectedRoute._id)
        : sortedReviews[0];
      const script = scripts.filter((s) => s.status !== "superseded").sort((a, b) => b.version - a.version)[0];
      out.push({
        story,
        stage: postStage(story.status),
        brief: briefs.filter((b) => b.status !== "superseded").sort((a, b) => b.updatedAt - a.updatedAt)[0],
        routes: routes.sort((a, b) => a.order - b.order),
        selectedRoute,
        draft,
        latestReview,
        assetCounts: {
          lizNeeded,
          agentNeeded,
          supplied: requests.filter((r) => r.status === "supplied" || r.status === "selected").length,
        },
        previewAsset: master ?? image,
        scriptPreview: script?.sections?.[0]?.text,
      });
    }
    return out;
  },
});

export const creativeWorkspace = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return null;
    const [
      claims,
      scripts,
      runs,
      assets,
      recordings,
      gates,
      briefs,
      routes,
      assetRequests,
      postDrafts,
      postReviews,
      slides,
      candidates,
      requests,
    ] = await Promise.all([
      ctx.db.query("claims").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("scripts").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("generationRuns").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("assets").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("recordings").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("gateEvents").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("creativeBriefs").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("formatRoutes").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("assetRequests").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("postDrafts").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("postReviews").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("designSlides").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("designCandidates").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
      ctx.db.query("genRequests").withIndex("by_story", (q) => q.eq("storyId", storyId)).collect(),
    ]);
    return {
      story,
      claims,
      scripts,
      runs,
      assets,
      recordings,
      gates,
      brief: briefs.filter((b) => b.status !== "superseded").sort((a, b) => b.updatedAt - a.updatedAt)[0],
      routes: routes.sort((a, b) => a.order - b.order),
      assetRequests: assetRequests.sort((a, b) => b.updatedAt - a.updatedAt),
      postDraft: postDrafts.sort((a, b) => b.updatedAt - a.updatedAt)[0],
      postReviews: postReviews.sort((a, b) => b.updatedAt - a.updatedAt),
      slides: slides.sort((a, b) => a.order - b.order),
      candidates,
      genRequests: requests,
    };
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

// "Rewrite prompts" button: flag the story so the runner re-authors every slide's
// image prompt with the art-director desk.
export const queuePromptRewrite = mutation({
  args: { storyId: v.id("stories"), note: v.optional(v.string()) },
  handler: async (ctx, { storyId, note }) => {
    await ctx.db.patch(storyId, {
      promptsRewriteAt: Date.now(),
      promptsRewriteNote: note?.trim() || undefined,
    });
  },
});

export const clearPromptRewrite = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    await ctx.db.patch(storyId, { promptsRewriteAt: undefined, promptsRewriteNote: undefined });
  },
});

// The runner polls this; returns the oldest story waiting on a prompt rewrite.
export const nextPromptRewrite = query({
  args: {},
  handler: async (ctx) => {
    const stories = await ctx.db
      .query("stories")
      .withIndex("by_status", (q) => q.eq("status", "design"))
      .collect();
    const waiting = stories
      .filter((s) => s.promptsRewriteAt)
      .sort((a, b) => (a.promptsRewriteAt ?? 0) - (b.promptsRewriteAt ?? 0));
    return waiting[0]?._id ?? null;
  },
});

// ---- CapCut export -------------------------------------------------------------

export const queueCapcutExport = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    await ctx.db.patch(storyId, { capcutExportAt: Date.now() });
  },
});

export const clearCapcutExport = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    await ctx.db.patch(storyId, { capcutExportAt: undefined });
  },
});

export const setCapcutPath = mutation({
  args: { storyId: v.id("stories"), path: v.string() },
  handler: async (ctx, { storyId, path }) => {
    await ctx.db.patch(storyId, { capcutPath: path, capcutExportAt: undefined });
  },
});

// The runner polls this; returns any story whose CapCut package was requested.
export const nextCapcutExport = query({
  args: {},
  handler: async (ctx) => {
    const stories = await ctx.db.query("stories").collect();
    const waiting = stories
      .filter((s) => s.capcutExportAt)
      .sort((a, b) => (a.capcutExportAt ?? 0) - (b.capcutExportAt ?? 0));
    return waiting[0]?._id ?? null;
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
    const carousel = isCarouselFormat(story.format);
    if (!slides.length) throw new Error("no slides on the board");
    if (unpicked.length && !carousel) {
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
      if (!s.selectedCandidateId) continue;
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
        : carousel
          ? "carousel copy locked — rendering deck"
          : "design locked — assembling",
      updatedAt: Date.now(),
    });
  },
});
