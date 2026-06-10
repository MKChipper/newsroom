import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Gate notices: stories sitting at gate1/gate2 that haven't been pushed to
// Telegram yet. The telegram-gates worker sends a message with inline
// approve/redo/kill buttons and records the notice here.

export const pendingGateNotices = query({
  args: {},
  handler: async (ctx) => {
    const out = [];
    for (const status of ["gate1", "gate2"] as const) {
      const gate = status === "gate1" ? 1 : 2;
      const stories = await ctx.db
        .query("stories")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const story of stories) {
        const notices = await ctx.db
          .query("telegramNotices")
          .withIndex("by_story", (q) => q.eq("storyId", story._id))
          .collect();
        // a story can pass a gate, get bounced, and come back — only the
        // notice count for THIS visit matters, so compare against how many
        // gate events it already has for this gate
        const events = await ctx.db
          .query("gateEvents")
          .withIndex("by_story", (q) => q.eq("storyId", story._id))
          .collect();
        const visits = events.filter((e) => e.gate === gate).length;
        const sent = notices.filter((n) => n.gate === gate).length;
        if (sent <= visits) out.push({ storyId: story._id, gate });
      }
    }
    return out;
  },
});

export const noticeSent = mutation({
  args: {
    storyId: v.id("stories"),
    gate: v.number(),
    chatId: v.string(),
    messageId: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("telegramNotices", { ...args, status: "sent" });
  },
});

export const noticeAnswered = mutation({
  args: { storyId: v.id("stories"), gate: v.number() },
  handler: async (ctx, { storyId, gate }) => {
    const notices = await ctx.db
      .query("telegramNotices")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const n of notices) {
      if (n.gate === gate && n.status === "sent") {
        await ctx.db.patch(n._id, { status: "answered" });
      }
    }
  },
});
