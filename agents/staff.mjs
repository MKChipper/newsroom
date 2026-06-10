// Run the whole staff with one command: desk runner, telegram gates,
// recordings-inbox watcher. Each child is restarted if it dies; Ctrl-C
// stops everything.
//
// --all additionally runs the Convex backend and the dashboard, so
// `npm run newsroom` is the only command needed.

import { spawn } from "node:child_process";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { telegramToken } from "./env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL = process.argv.includes("--all");

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

function startCmd(name, cmd, args) {
  const child = spawn(cmd, args, { cwd: join(HERE, ".."), stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const tag = (data) =>
    String(data).trimEnd().split("\n").forEach((l) => console.log(`[${name}] ${l}`));
  child.stdout.on("data", tag);
  child.stderr.on("data", tag);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.log(`[${name}] exited (${code}) — restarting in 10s`);
    setTimeout(() => startCmd(name, cmd, args), 10_000);
  });
}

const portUp = (port) =>
  new Promise((resolve) => {
    const sock = connect(port, "127.0.0.1");
    sock.on("connect", () => { sock.end(); resolve(true); });
    sock.on("error", () => resolve(false));
  });

const waitForPort = async (port, tries = 60) => {
  for (let n = 0; n < tries; n++) {
    if (await portUp(port)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`port ${port} never came up`);
};

console.log("Newsroom staff clocking in…");
if (ALL) {
  if (await portUp(3210)) console.log("[convex] already running — reusing");
  else startCmd("convex", "npx", ["convex", "dev", "--tail-logs", "disable"]);
  await waitForPort(3210);
  if (await portUp(5180)) console.log("[web   ] already running — reusing");
  else startCmd("web   ", "npx", ["vite"]);
  console.log("[web   ] dashboard: http://localhost:5180");
}
STAFF.forEach(start);
