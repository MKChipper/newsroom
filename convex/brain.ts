import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// The brain is versioned: saving a doc with an existing slug bumps its version
// and deactivates the old one. Every story records the max brain version it was
// generated under, so output is always traceable to the knowledge that made it.

export const docs = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("brainDocs").collect();
    return all.filter((d) => d.active);
  },
});

export const docHistory = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("brainDocs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
  },
});

export const saveDoc = mutation({
  args: {
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
  },
  handler: async (ctx, { slug, title, kind, body }) => {
    const versions = await ctx.db
      .query("brainDocs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    for (const old of versions) {
      if (old.active) await ctx.db.patch(old._id, { active: false });
    }
    return await ctx.db.insert("brainDocs", {
      slug,
      title,
      kind,
      body,
      version: versions.length + 1,
      active: true,
    });
  },
});

export const brainVersion = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("brainDocs").collect();
    return all.length;
  },
});

// ---- Settings -----------------------------------------------------------------

export const allSettings = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("settings").collect();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
});

export const setSetting = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) await ctx.db.patch(existing._id, { value });
    else await ctx.db.insert("settings", { key, value });
  },
});

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const defaults: Record<string, string> = {
      // Liz's measured speaking pace. Recalibrate from real recordings:
      // the alignment step writes actual wpm back here over time.
      speech_wpm: "155",
      // Runtime targets per format, in seconds. The writers' room treats
      // these as hard budgets — copy gets cut to fit, voice never sped up.
      format_targets: JSON.stringify({
        tiktok_video: 32,
        ig_reel: 30,
        ig_carousel: 0,
        meta_ad: 20,
        yt_short: 45,
      }),
      // Price table for the generation manifest. PLACEHOLDER NUMBERS —
      // set real per-unit costs from your actual plans before trusting
      // the estimates. Keys are lane:quality.
      price_table: JSON.stringify({
        "gemini_image:1k": 0.04,
        "gemini_image:2k": 0.13,
        "gemini_image:4k": 0.25,
        "heygen_avatar:per_min": 1.5,
        "higgsfield_video:5s": 0.5,
        "higgsfield_video:10s": 1.0,
        "tts_scratch:per_run": 0,
      }),
    };
    for (const [key, value] of Object.entries(defaults)) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (!existing) await ctx.db.insert("settings", { key, value });
    }
  },
});
