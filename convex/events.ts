import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// The runner calls this at every meaningful step so the dashboard "wire" can
// show what's happening. Logging must never break the caller, so the runner
// wraps it in a try/catch — here we just record the row.
export const log = mutation({
  args: {
    kind: v.string(),
    message: v.string(),
    storyId: v.optional(v.id("stories")),
    storyTitle: v.optional(v.string()),
    level: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", { ...args, createdAt: Date.now() });
  },
});

// Recent activity, newest first. Pass a storyId to get just that story's history.
export const recent = query({
  args: { limit: v.optional(v.number()), storyId: v.optional(v.id("stories")) },
  handler: async (ctx, { limit, storyId }) => {
    const n = Math.min(limit ?? 60, 200);
    if (storyId) {
      const rows = await ctx.db
        .query("events")
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect();
      return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, n);
    }
    return await ctx.db.query("events").withIndex("by_time").order("desc").take(n);
  },
});
