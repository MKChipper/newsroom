// Shared env loading for the staff workers.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function fromFile(file, key) {
  if (!existsSync(file)) return undefined;
  const m = readFileSync(file, "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim() : undefined;
}

export function convexUrl() {
  const url =
    process.env.VITE_CONVEX_URL ?? fromFile(join(ROOT, ".env.local"), "VITE_CONVEX_URL");
  if (!url) throw new Error("No VITE_CONVEX_URL — run `npx convex dev` once first.");
  return url;
}

export function telegramToken() {
  // gates: the dedicated newsroom bot wins — anything else long-polling the
  // shared De-Influenced bot races our getUpdates and loses button taps.
  return (
    process.env.DE_NEWSROOM_BOT_TOKEN ??
    fromFile(join(ROOT, ".env.local"), "DE_NEWSROOM_BOT_TOKEN") ??
    deliveryToken()
  );
}

export function deliveryToken() {
  // publish packages: always the original De-Influenced bot — it's the one
  // that's a member of the SOCIAL POSTS group.
  return (
    process.env.DE_TELEGRAM_BOT_TOKEN ??
    fromFile(join(ROOT, ".env.local"), "DE_TELEGRAM_BOT_TOKEN") ??
    fromFile(join(homedir(), "de-influenced-studio", ".env"), "DE_TELEGRAM_BOT_TOKEN")
  );
}
