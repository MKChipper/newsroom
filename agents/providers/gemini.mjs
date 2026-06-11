// Gemini image lane (direct REST, same key as the nanobanana MCP).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const MODELS = {
  "gemini-3-pro-image": "gemini-3-pro-image",
  "gemini-3.1-flash-image": "gemini-3.1-flash-image",
  pro: "gemini-3-pro-image",
  flash: "gemini-3.1-flash-image",
};

export const meta = {
  name: "gemini",
  models: ["gemini-3-pro-image", "gemini-3.1-flash-image"],
  defaultModel: "gemini-3-pro-image",
};

function apiKey() {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  const cfg = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
  const key = cfg.mcpServers?.nanobanana?.env?.GOOGLE_API_KEY;
  if (!key) throw new Error("no GOOGLE_API_KEY found");
  return key;
}

// Gemini has no aspect param on this endpoint — describe it in the prompt.
const ASPECT_PHRASE = {
  "9:16": "tall vertical 9:16 composition",
  "4:5": "vertical 4:5 portrait composition",
  "1:1": "square 1:1 composition",
  "16:9": "wide 16:9 composition",
};

export async function generate({ prompt, model, count, aspect, outDir, baseName }) {
  const m = MODELS[model] ?? MODELS.pro;
  const fullPrompt = `${ASPECT_PHRASE[aspect] ?? ""}, ${prompt}`.replace(/^, /, "");
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (let i = 0; i < count; i++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey()}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      }
    );
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const img = (data.candidates?.[0]?.content?.parts ?? []).find((p) =>
      p.inlineData?.mimeType?.startsWith("image/")
    );
    if (!img) throw new Error("gemini returned no image");
    const out = join(outDir, `${baseName}-${i + 1}.png`);
    writeFileSync(out, Buffer.from(img.inlineData.data, "base64"));
    files.push(out);
  }
  return { files, costUsd: undefined };
}
