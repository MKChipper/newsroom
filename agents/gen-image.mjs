// Direct Gemini image generation (same models + key as the nanobanana MCP,
// without the MCP layer — headless agent sessions call this via Bash).
//
// Usage: node agents/gen-image.mjs --prompt "..." --out /abs/path.png [--quality pro|flash]
// Prints JSON: { "path": ..., "model": ... } on success; exits 1 on failure.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const MODELS = {
  pro: "gemini-3-pro-image",
  flash: "gemini-3.1-flash-image",
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const prompt = arg("prompt");
const out = arg("out");
const quality = arg("quality", "pro");
if (!prompt || !out) {
  console.error('usage: gen-image.mjs --prompt "..." --out /abs/path.png [--quality pro|flash]');
  process.exit(1);
}

let apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
    apiKey = cfg.mcpServers?.nanobanana?.env?.GOOGLE_API_KEY;
  } catch {}
}
if (!apiKey) {
  console.error("no GOOGLE_API_KEY (env or ~/.claude.json nanobanana config)");
  process.exit(1);
}

const model = MODELS[quality] ?? MODELS.pro;
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  }
);
if (!res.ok) {
  console.error(`gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
const data = await res.json();
const parts = data.candidates?.[0]?.content?.parts ?? [];
const img = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
if (!img) {
  const text = parts.find((p) => p.text)?.text ?? "no candidates";
  console.error(`gemini returned no image: ${String(text).slice(0, 300)}`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(img.inlineData.data, "base64"));
console.log(JSON.stringify({ path: out, model }));
