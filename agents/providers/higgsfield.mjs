// Higgsfield image lane via the authenticated CLI (cost preflight included).

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const meta = {
  name: "higgsfield",
  models: ["gpt_image_2", "flux_2", "nano_banana_2", "text2image_soul_v2", "grok_image"],
  defaultModel: "gpt_image_2",
};

function cli(args, timeout = 10 * 60 * 1000) {
  return execFileSync("higgsfield", [...args, "--json", "--no-color"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });
}

function extractUrls(value, found = []) {
  if (typeof value === "string") {
    if (/^https?:\/\/.+\.(png|jpe?g|webp)(\?.*)?$/i.test(value) || /\/(raw|results?)\//.test(value)) {
      if (value.startsWith("http")) found.push(value);
    }
  } else if (Array.isArray(value)) {
    for (const v of value) extractUrls(v, found);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) extractUrls(v, found);
  }
  return [...new Set(found)];
}

export async function generate({ prompt, model, count, aspect, quality, outDir, baseName }) {
  const args = [
    "generate", "create", model,
    "--prompt", prompt,
    "--aspect_ratio", aspect,
    "--batch_size", String(count),
    "--wait", "--wait-timeout", "10m",
  ];
  if (quality && ["low", "medium", "high"].includes(quality)) {
    args.push("--quality", quality);
  }
  const raw = cli(args);
  let urls = [];
  try {
    // output may be one JSON doc or several concatenated ones
    const docs = raw
      .split(/\n(?=[{[])/)
      .map((chunk) => { try { return JSON.parse(chunk); } catch { return null; } })
      .filter(Boolean);
    for (const doc of docs) urls = extractUrls(doc, urls);
  } catch {}
  if (!urls.length) {
    // fall back to scraping any URLs from the raw output
    urls = [...raw.matchAll(/https?:\/\/\S+/g)].map((m) => m[0].replace(/[",\]]+$/, ""));
  }
  if (!urls.length) throw new Error(`higgsfield returned no result URLs: ${raw.slice(0, 200)}`);

  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const [i, url] of urls.slice(0, count).entries()) {
    const dl = await fetch(url);
    if (!dl.ok) continue;
    const buf = Buffer.from(await dl.arrayBuffer());
    const ext = url.includes(".webp") ? "webp" : url.includes(".jpg") || url.includes(".jpeg") ? "jpg" : "png";
    const out = join(outDir, `${baseName}-${i + 1}.${ext}`);
    writeFileSync(out, buf);
    files.push(out);
  }
  if (!files.length) throw new Error("higgsfield results could not be downloaded");
  return { files, costUsd: undefined };
}

export function preflightCredits({ prompt, model, aspect, count }) {
  try {
    const raw = cli(
      ["generate", "cost", model, "--prompt", prompt, "--aspect_ratio", aspect, "--batch_size", String(count)],
      60_000
    );
    const m = raw.match(/"credits?"\s*:\s*([\d.]+)/i) ?? raw.match(/([\d.]+)\s*credits/i);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}
