// Run the whole staff with one command: desk runner, telegram gates,
// recordings-inbox watcher. Each child is restarted if it dies; Ctrl-C
// stops everything.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { telegramToken } from "./env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const STAFF = [
  { name: "desks ", script: "runner.mjs" },
  { name: "gates ", script: "telegram-gates.mjs", optional: !telegramToken() },
  { name: "inbox ", script: "inbox-watcher.mjs" },
];

let shuttingDown = false;
const children = [];

function start({ name, script, optional }) {
  if (optional) {
    console.log(`[${name}] skipped — DE_TELEGRAM_BOT_TOKEN not set`);
    return;
  }
  const child = spawn(process.execPath, [join(HERE, script)], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const tag = (data) =>
    String(data).trimEnd().split("\n").forEach((l) => console.log(`[${name}] ${l}`));
  child.stdout.on("data", tag);
  child.stderr.on("data", tag);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.log(`[${name}] exited (${code}) — restarting in 10s`);
    setTimeout(() => start({ name, script }), 10_000);
  });
}

process.on("SIGINT", () => {
  shuttingDown = true;
  for (const c of children) c.kill();
  process.exit(0);
});

console.log("Newsroom staff clocking in…");
STAFF.forEach(start);
