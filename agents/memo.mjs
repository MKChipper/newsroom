// The Monday memo: gather posted stories + their metrics, run the ratings
// desk, save the memo, mark stories rated.
//
// Usage: node agents/memo.mjs        (also wired as: npm run memo)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { ROOT, convexUrl } from "./env.mjs";

const client = new ConvexHttpClient(convexUrl());

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("{"));
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    if (raw[i] === "}") depth--;
    if (depth === 0 && raw[i] === "}") return JSON.parse(raw.slice(0, i + 1));
  }
  throw new Error("no JSON object in ratings output");
}

const { posted, rated } = await client.query("pipeline:postedStories", {});
const withMetrics = posted.filter((s) => s.metrics);
if (!withMetrics.length) {
  console.log(
    posted.length
      ? `${posted.length} posted stories but none have metrics yet — add numbers in the dashboard (click a Live story), then rerun.`
      : "Nothing posted since the last memo. No memo to write."
  );
  process.exit(0);
}

const docs = await client.query("brain:docs", {});
const memos = await client.query("pipeline:memosList", {});
const strip = (s) => ({
  storyId: s._id, title: s.title, job: s.job, platform: s.platform,
  format: s.format, angle: s.angle, metrics: s.metrics,
});

const prompt = [
  docs.length ? docs.map((d) => `### ${d.title}\n${d.body}`).join("\n\n") : "",
  "## Posted this period (judge these)",
  JSON.stringify(withMetrics.map(strip), null, 2),
  "## Previously rated (history, for patterns only)",
  JSON.stringify(rated.slice(0, 20).map(strip), null, 2),
  memos[0] ? `## Last memo\n${memos[0].body}` : "",
].filter(Boolean).join("\n\n");

console.log(`Ratings desk: judging ${withMetrics.length} stories…`);
let finalText = "";
const session = query({
  prompt,
  options: {
    systemPrompt: readFileSync(join(ROOT, "agents", "desks", "ratings.md"), "utf8"),
    allowedTools: [],
    permissionMode: "bypassPermissions",
    maxTurns: 2,
  },
});
for await (const m of session) {
  if (m.type === "result") {
    if (m.subtype !== "success") throw new Error(`ratings desk failed: ${m.subtype}`);
    finalText = m.result;
  }
}
const result = extractJson(finalText);

const week = new Date().toISOString().slice(0, 10);
await client.mutation("pipeline:saveMemo", { week, body: result.memo });
for (const s of withMetrics) {
  await client.mutation("pipeline:transition", { storyId: s._id, to: "rated" }).catch(() => {});
}
console.log(`\nMemo saved (${week}); ${withMetrics.length} stories marked rated.\n`);
console.log(result.memo);
