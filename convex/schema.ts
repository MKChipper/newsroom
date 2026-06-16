import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const storyStatus = v.union(
  v.literal("idea"),
  v.literal("angle"),
  v.literal("drafting"),
  v.literal("legal_review"),
  v.literal("gate1"),
  v.literal("design"),
  v.literal("recording"),
  v.literal("production"),
  v.literal("gate2"),
  v.literal("packaging"),
  v.literal("ready_to_post"),
  v.literal("posted"),
  v.literal("rated"),
  v.literal("parked"),
  v.literal("killed")
);

export const job = v.union(
  v.literal("visibility"),
  v.literal("trust"),
  v.literal("conversion")
);

export const claimClass = v.union(
  v.literal("sourced"),
  v.literal("inferred"),
  v.literal("opinion"),
  v.literal("unsafe")
);

export const reviewGateStatus = v.union(
  v.literal("green"),
  v.literal("amber"),
  v.literal("red"),
  v.literal("pending")
);

export const reviewProofPack = v.object({
  firstFrame: v.string(),
  hookPromise: v.string(),
  messageSpine: v.string(),
  appResolver: v.string(),
  cta: v.string(),
  pixelEvidence: v.string(),
  finalViewerAction: v.string(),
});

export const reviewGateRevisions = v.object({
  formatLock: v.string(),
  hook: v.string(),
  messageSpine: v.string(),
  appResolver: v.string(),
  assetTruth: v.string(),
  voiceCompliance: v.string(),
  pixelMotion: v.string(),
  platformNative: v.string(),
});

export default defineSchema({
  stories: defineTable({
    title: v.string(),
    slug: v.string(),
    status: storyStatus,
    job,
    platform: v.optional(v.string()),
    format: v.optional(v.string()),
    angle: v.optional(v.string()),
    summary: v.optional(v.string()),
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
    metrics: v.optional(
      v.object({
        views: v.number(),
        likes: v.number(),
        comments: v.number(),
        saves: v.number(),
        shares: v.number(),
        clicks: v.number(),
        follows: v.number(),
        notes: v.optional(v.string()),
        recordedAt: v.number(),
      })
    ),
    needsRecording: v.optional(v.boolean()),
    statusNote: v.optional(v.string()),
    lockedBy: v.optional(v.string()),
    lockedAt: v.optional(v.number()),
    // set when Liz asks the art director to re-author this story's image prompts
    promptsRewriteAt: v.optional(v.number()),
    // set at angle-lock: the runner's producer must (re)build the brief from the
    // angle-room conversation before the writers' room drafts.
    producerPending: v.optional(v.boolean()),
    // "Build CapCut package" button: trigger timestamp + the folder the runner wrote.
    capcutExportAt: v.optional(v.number()),
    capcutPath: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_slug", ["slug"]),

  // Newsroom wire: a running log of what the desks/agents are doing, so the
  // dashboard can show activity instead of it only living in the runner console.
  events: defineTable({
    kind: v.string(), // tip | story | angle | draft | legal | design | gen | produce | publish | error
    level: v.optional(v.string()), // info (default) | warn | error
    storyId: v.optional(v.id("stories")),
    storyTitle: v.optional(v.string()),
    message: v.string(),
    createdAt: v.number(),
  })
    .index("by_time", ["createdAt"])
    .index("by_story", ["storyId"]),

  tips: defineTable({
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
    extracted: v.optional(v.string()),
    sourceGrade: v.optional(v.string()),
    status: v.union(
      v.literal("new"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("rejected")
    ),
    note: v.optional(v.string()),
  }).index("by_status", ["status"]),

  claims: defineTable({
    storyId: v.optional(v.id("stories")),
    tipId: v.optional(v.id("tips")),
    text: v.string(),
    classification: claimClass,
    citation: v.optional(v.string()),
    brandNames: v.array(v.string()),
    riskNote: v.optional(v.string()),
  })
    .index("by_story", ["storyId"])
    .index("by_tip", ["tipId"]),

  scripts: defineTable({
    storyId: v.id("stories"),
    version: v.number(),
    sections: v.array(
      v.object({
        kind: v.string(),
        text: v.string(),
        wordCount: v.number(),
        estSeconds: v.number(),
        visualNote: v.optional(v.string()),
      })
    ),
    totalWords: v.number(),
    estRuntimeSec: v.number(),
    targetRuntimeSec: v.number(),
    scratchRuntimeSec: v.optional(v.number()),
    voiceNotes: v.optional(v.string()),
    legalNotes: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("legal_passed"),
      v.literal("legal_bounced"),
      v.literal("approved"),
      v.literal("superseded")
    ),
  }).index("by_story", ["storyId"]),

  generationRuns: defineTable({
    storyId: v.id("stories"),
    lane: v.string(),
    model: v.string(),
    count: v.number(),
    quality: v.string(),
    format: v.string(),
    estCostUsd: v.number(),
    actualCostUsd: v.optional(v.number()),
    status: v.union(
      v.literal("planned"),
      v.literal("approved"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed")
    ),
    note: v.optional(v.string()),
  }).index("by_story", ["storyId"]),

  assets: defineTable({
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
  }).index("by_story", ["storyId"]),

  recordings: defineTable({
    storyId: v.id("stories"),
    kind: v.union(v.literal("vo"), v.literal("intro")),
    brief: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("received"),
      v.literal("aligned")
    ),
    filePath: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    transcriptPath: v.optional(v.string()),
  })
    .index("by_story", ["storyId"])
    .index("by_status", ["status"]),

  angleMessages: defineTable({
    storyId: v.id("stories"),
    role: v.union(v.literal("liz"), v.literal("desk")),
    text: v.string(),
  }).index("by_story", ["storyId"]),

  creativeBriefs: defineTable({
    storyId: v.id("stories"),
    status: v.union(
      v.literal("drafted"),
      v.literal("selected"),
      v.literal("superseded")
    ),
    researchSummary: v.string(),
    audienceLanguage: v.array(v.string()),
    editorFocus: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_story", ["storyId"]),

  formatRoutes: defineTable({
    storyId: v.id("stories"),
    briefId: v.optional(v.id("creativeBriefs")),
    order: v.number(),
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
    selected: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_story", ["storyId"]),

  assetRequests: defineTable({
    storyId: v.id("stories"),
    routeId: v.optional(v.id("formatRoutes")),
    slideId: v.optional(v.id("designSlides")),
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
    // screenshot split: true if the agent could capture this itself (public URL),
    // false if only Liz can (login-walled, her own footage). sourceUrl when known.
    canAgentAttempt: v.optional(v.boolean()),
    sourceUrl: v.optional(v.string()),
    status: v.union(
      v.literal("needed"),
      v.literal("supplied"),
      v.literal("generating"),
      v.literal("selected"),
      v.literal("waived")
    ),
    filePath: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_story", ["storyId"])
    .index("by_owner_status", ["owner", "status"]),

  postDrafts: defineTable({
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
    updatedAt: v.number(),
  }).index("by_story", ["storyId"]),

  postReviews: defineTable({
    storyId: v.id("stories"),
    routeId: v.optional(v.id("formatRoutes")),
    passNo: v.number(),
    gates: v.object({
      formatLock: reviewGateStatus,
      hook: reviewGateStatus,
      messageSpine: reviewGateStatus,
      appResolver: reviewGateStatus,
      assetTruth: reviewGateStatus,
      voiceCompliance: reviewGateStatus,
      pixelMotion: reviewGateStatus,
      platformNative: reviewGateStatus,
    }),
    decision: v.union(
      v.literal("ready"),
      v.literal("revise"),
      v.literal("blocked"),
      v.literal("pending")
    ),
    proof: v.optional(reviewProofPack),
    artifactPath: v.optional(v.string()),
    contactSheetPath: v.optional(v.string()),
    gateRevisions: v.optional(reviewGateRevisions),
    requiredRevisions: v.string(),
    nextAssetNeeded: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_story", ["storyId"]),

  designSlides: defineTable({
    storyId: v.id("stories"),
    order: v.number(),
    kind: v.string(),
    voLine: v.string(),
    visualNote: v.optional(v.string()),
    prompt: v.string(),
    selectedCandidateId: v.optional(v.id("designCandidates")),
  }).index("by_story", ["storyId"]),

  designCandidates: defineTable({
    storyId: v.id("stories"),
    slideId: v.optional(v.id("designSlides")),
    kind: v.union(v.literal("slide"), v.literal("mockup")),
    provider: v.string(),
    model: v.string(),
    filePath: v.string(),
    prompt: v.string(),
    costUsd: v.optional(v.number()),
  })
    .index("by_slide", ["slideId"])
    .index("by_story", ["storyId"]),

  genRequests: defineTable({
    storyId: v.id("stories"),
    slideId: v.optional(v.id("designSlides")),
    kind: v.union(v.literal("slide"), v.literal("mockup")),
    provider: v.string(),
    model: v.string(),
    count: v.number(),
    aspect: v.string(),
    quality: v.string(),
    prompt: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    costUsd: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_story", ["storyId"]),

  telegramNotices: defineTable({
    storyId: v.id("stories"),
    gate: v.number(),
    chatId: v.string(),
    messageId: v.number(),
    status: v.union(v.literal("sent"), v.literal("answered")),
  })
    .index("by_story", ["storyId"])
    .index("by_status", ["status"]),

  gateEvents: defineTable({
    storyId: v.id("stories"),
    gate: v.number(),
    decision: v.union(
      v.literal("approve"),
      v.literal("redo"),
      v.literal("kill")
    ),
    note: v.optional(v.string()),
  }).index("by_story", ["storyId"]),

  costLedger: defineTable({
    month: v.string(),
    lane: v.string(),
    amountUsd: v.number(),
    storyId: v.optional(v.id("stories")),
    runId: v.optional(v.id("generationRuns")),
  }).index("by_month", ["month"]),

  brainDocs: defineTable({
    slug: v.string(),
    title: v.string(),
    kind: v.union(
      v.literal("philosophy"),
      v.literal("voice"),
      v.literal("audience"),
      v.literal("legal"),
      v.literal("product"),
      v.literal("house_style"),
      v.literal("formats"),
      v.literal("evidence")
    ),
    body: v.string(),
    version: v.number(),
    active: v.boolean(),
  })
    .index("by_kind", ["kind"])
    .index("by_slug", ["slug"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  memos: defineTable({
    week: v.string(),
    body: v.string(),
  }).index("by_week", ["week"]),
});
