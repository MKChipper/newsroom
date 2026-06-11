// Fal.ai image lane. Key: FAL_KEY in newsroom/.env.local (or env).

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const meta = {
  name: "fal",
  models: ["fal-ai/flux/dev", "fal-ai/flux-pro/v1.1", "fal-ai/flux/schnell", "fal-ai/recraft-v3"],
  defaultModel: "fal-ai/flux/dev",
};

function apiKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8").match(/^FAL_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error("no FAL_KEY — add FAL_KEY=... to newsroom/.env.local");
}

const SIZE = {
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

export async function generate({ prompt, model, count, aspect, outDir, baseName }) {
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: SIZE[aspect] ?? SIZE["9:16"],
      num_images: count,
    }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const images = data.images ?? [];
  if (!images.length) throw new Error("fal returned no images");
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const [i, img] of images.entries()) {
    const dl = await fetch(img.url);
    const buf = Buffer.from(await dl.arrayBuffer());
    const ext = img.content_type?.includes("jpeg") ? "jpg" : "png";
    const out = join(outDir, `${baseName}-${i + 1}.${ext}`);
    writeFileSync(out, buf);
    files.push(out);
  }
  return { files, costUsd: undefined };
}
