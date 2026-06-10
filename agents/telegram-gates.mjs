// Telegram gate notifications: when a story reaches Gate 1 or Gate 2, send
// Liz a message with inline Approve / Redo / Kill buttons and apply her
// decision back to the pipeline. Redo asks for a follow-up note (reply in
// chat) so the desks know what to fix.
//
// Usage:  node agents/telegram-gates.mjs [--dry-run]
// Env:    DE_TELEGRAM_BOT_TOKEN

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { ROOT, convexUrl, telegramToken } from "./env.mjs";

const DRY = process.argv.includes("--dry-run");
const OFFSET_FILE = join(ROOT, ".telegram-offset");

const TOKEN = telegramToken();
if (!TOKEN) {
  console.error("DE_TELEGRAM_BOT_TOKEN not found (env, .env.local, or studio .env)");
  process.exit(1);
}
const TG = `https://api.telegram.org/bot${TOKEN}`;
const client = new ConvexHttpClient(convexUrl());

async function tg(method, payload) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description}`);
  return data.result;
}

const esc = (t) =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function gateMessage(detail, gate) {
  const { story, scripts, runs } = detail;
  const script = scripts.find((s) => s.status !== "superseded");
  const planned = runs.filter((r) => ["planned", "approved"].includes(r.status));
  const estTotal = planned.reduce((n, r) => n + r.estCostUsd, 0);

  const lines = [
    `<b>GATE ${gate} — ${esc(story.title)}</b>`,
    `${story.job} · ${story.format ?? "?"} · ${story.status}`,
    "",
  ];
  if (gate === 1 && script) {
    lines.push(
      `<i>${script.totalWords}w · est ${Math.round(script.estRuntimeSec)}s` +
        (script.scratchRuntimeSec
          ? ` · scratch read ${Math.round(script.scratchRuntimeSec)}s`
          : "") +
        ` / target ${script.targetRuntimeSec}s</i>`,
      ""
    );
    for (const s of script.sections) {
      lines.push(`<b>${s.kind.toUpperCase()}</b>`, esc(s.text), "");
    }
    if (story.statusNote) lines.push(`<i>Legal: ${esc(story.statusNote)}</i>`, "");
    if (planned.length) {
      lines.push("<b>Generation manifest</b>");
      for (const r of planned) {
        lines.push(
          `· ${r.lane} ${r.model} ×${r.count} ${r.quality} ${r.format} — $${r.estCostUsd.toFixed(2)}`
        );
      }
      lines.push(`<b>Approving spends ~$${estTotal.toFixed(2)}</b>`);
    }
  } else {
    lines.push("Final cut ready for review. Check the assets in the dashboard, then decide.");
    if (story.statusNote) lines.push("", `<i>${esc(story.statusNote)}</i>`);
  }
  let text = lines.join("\n");
  if (text.length > 4000) text = text.slice(0, 3990) + "\n…";
  return text;
}

const keyboard = (storyId, gate) => ({
  inline_keyboard: [
    [
      { text: "✅ Approve", callback_data: `g:${storyId}:${gate}:approve` },
      { text: "↩️ Redo", callback_data: `g:${storyId}:${gate}:redo` },
      { text: "🗑 Kill", callback_data: `g:${storyId}:${gate}:kill` },
    ],
  ],
});

// chatId -> { storyId, gate } awaiting a redo note
const pendingNotes = new Map();

async function sendPending(settings) {
  const pending = await client.query("telegram:pendingGateNotices", {});
  for (const { storyId, gate } of pending) {
    const detail = await client.query("pipeline:storyDetail", { storyId });
    if (!detail) continue;
    const text = gateMessage(detail, gate);
    if (DRY) {
      console.log(`--- DRY RUN gate ${gate} message for "${detail.story.title}" ---`);
      console.log(text.replace(/<[^>]+>/g, ""));
      continue;
    }
    const payload = {
      chat_id: settings.telegram_chat_id,
      text,
      parse_mode: "HTML",
      reply_markup: keyboard(storyId, gate),
    };
    if (settings.telegram_thread_id) {
      payload.message_thread_id = Number(settings.telegram_thread_id);
    }
    const msg = await tg("sendMessage", payload);
    await client.mutation("telegram:noticeSent", {
      storyId,
      gate,
      chatId: String(settings.telegram_chat_id),
      messageId: msg.message_id,
    });
    console.log(`sent gate ${gate} notice: ${detail.story.title}`);
  }
}

async function applyDecision(cb) {
  const [, storyId, gateStr, decision] = cb.data.split(":");
  const gate = Number(gateStr);
  if (decision === "redo") {
    pendingNotes.set(String(cb.message.chat.id), { storyId, gate });
    await tg("answerCallbackQuery", {
      callback_query_id: cb.id,
      text: "Reply with a note for the desks.",
    });
    await tg("sendMessage", {
      chat_id: cb.message.chat.id,
      message_thread_id: cb.message.message_thread_id,
      text: "↩️ Redo — reply with what needs to change.",
    });
    return;
  }
  try {
    await client.mutation("pipeline:gateDecision", { storyId, gate, decision });
    await client.mutation("telegram:noticeAnswered", { storyId, gate });
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: `${decision}d` });
    await tg("editMessageReplyMarkup", {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
    await tg("sendMessage", {
      chat_id: cb.message.chat.id,
      message_thread_id: cb.message.message_thread_id,
      text: decision === "approve" ? `✅ Gate ${gate} approved.` : `🗑 Killed.`,
    });
  } catch (err) {
    await tg("answerCallbackQuery", {
      callback_query_id: cb.id,
      text: "Already decided elsewhere.",
    });
  }
}

async function applyRedoNote(msg) {
  const pending = pendingNotes.get(String(msg.chat.id));
  if (!pending) return false;
  pendingNotes.delete(String(msg.chat.id));
  try {
    await client.mutation("pipeline:gateDecision", {
      storyId: pending.storyId,
      gate: pending.gate,
      decision: "redo",
      note: msg.text,
    });
    await client.mutation("telegram:noticeAnswered", {
      storyId: pending.storyId,
      gate: pending.gate,
    });
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      message_thread_id: msg.message_thread_id,
      text: "↩️ Sent back to the desks with your note.",
    });
  } catch {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      message_thread_id: msg.message_thread_id,
      text: "Couldn't apply — story already moved on.",
    });
  }
  return true;
}

let offset = existsSync(OFFSET_FILE) ? Number(readFileSync(OFFSET_FILE, "utf8")) : 0;

async function pollUpdates() {
  const updates = await tg("getUpdates", {
    offset,
    timeout: 20,
    allowed_updates: ["callback_query", "message"],
  });
  for (const u of updates) {
    offset = u.update_id + 1;
    writeFileSync(OFFSET_FILE, String(offset));
    if (u.callback_query?.data?.startsWith("g:")) await applyDecision(u.callback_query);
    else if (u.message?.text) await applyRedoNote(u.message);
  }
}

const me = await tg("getMe", {});
console.log(`Telegram gates worker — @${me.username}${DRY ? " (dry run)" : ""}`);
await client.mutation("brain:seedDefaults", {});
const settings = await client.query("brain:allSettings", {});

for (;;) {
  try {
    await sendPending(settings);
    if (DRY) break;
    await pollUpdates();
  } catch (err) {
    console.error(err.message);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
