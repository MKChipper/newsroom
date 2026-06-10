import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const storyStatus = v.union(
  v.literal("idea"),
  v.literal("drafting"),
  v.literal("legal_review"),
  v.literal("gate1"),
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
    needsRecording: v.optional(v.boolean()),
    statusNote: v.optional(v.string()),
    lockedBy: v.optional(v.string()),
    lockedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_slug", ["slug"]),

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
