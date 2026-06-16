import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const NAVY = "#152336";
const ORANGE = "#F76928";
const PARCH = "#F3EDEA";
const WHITE = "#FFFFFF";
const GREEN = "#2F7A5F";
const BLACK = "#05070A";

const MONO = "Courier New, Courier, monospace";
const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";

const PRESETS = {
  instagram: {
    width: 1080,
    height: 1350,
    margin: 76,
    maxHeadline: 24,
    maxBody: 42,
    label: "IG 4:5",
  },
  tiktok: {
    width: 1080,
    height: 1920,
    margin: 88,
    maxHeadline: 20,
    maxBody: 34,
    label: "TT 9:16",
  },
};

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function wrap(text, max, maxLines = 12) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = (line + " " + word).trim();
    if (line && next.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function slideCopy(section) {
  const blocks = String(section.text ?? "")
    .split(/\n{2,}|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const headline = blocks[0] || "Untitled slide";
  const body = blocks.slice(1).join(" ");
  return {
    kind: String(section.kind ?? "content").toLowerCase(),
    headline,
    body,
    visualNote: section.visualNote ?? "",
  };
}

function kindLabel(kind) {
  if (kind.includes("hook")) return "THE CHECK";
  if (kind.includes("evidence")) return "THE RECEIPT";
  if (kind.includes("payoff")) return "THE POINT";
  if (kind.includes("cta")) return "CHECK BEFORE YOU BUY";
  return "EVIDENCE";
}

function splitEvidenceNote(note = "") {
  const parts = String(note).split(/(?:source|citation|footnote)\s*:/i);
  if (parts.length < 2) return "";
  return parts.slice(1).join(" ").trim().replace(/\s+/g, " ").slice(0, 120);
}

async function imageCard(imagePath, width, maxHeight, pad = 20, radius = 18) {
  const inner = await sharp(imagePath)
    .resize(width - pad * 2, maxHeight - pad * 2, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .toBuffer();
  const meta = await sharp(inner).metadata();
  const cardW = meta.width + pad * 2;
  const cardH = meta.height + pad * 2;
  const bg = await sharp({
    create: { width: cardW, height: cardH, channels: 4, background: WHITE },
  })
    .composite([{ input: inner, left: pad, top: pad }])
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg width="${cardW}" height="${cardH}"><rect width="${cardW}" height="${cardH}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  );
  const buffer = await sharp(bg).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return { buffer, width: cardW, height: cardH };
}

function svgText(lines, { x, y, size, lineH, fill, weight = "normal", family = SANS, opacity = 1 }) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * lineH}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${esc(line)}</text>`
    )
    .join("\n");
}

function instagramSlideSvg({ preset, copy, index, total, hasImage }) {
  const { width: W, height: H, margin } = preset;
  const label = kindLabel(copy.kind);
  const isHook = copy.kind.includes("hook");
  const isCta = copy.kind.includes("cta") || copy.kind.includes("payoff");
  const headlineLines = wrap(copy.headline, isHook ? 18 : preset.maxHeadline, isHook ? 4 : 3);
  const bodyLines = wrap(copy.body, preset.maxBody, hasImage ? 5 : 8);
  const source = splitEvidenceNote(copy.visualNote);
  const sourceLines = wrap(source, 58, 2);
  const headlineSize = isHook ? 76 : 60;
  const headlineY = isHook ? 320 : 210;
  const bodyY = headlineY + headlineLines.length * (isHook ? 86 : 68) + 30;
  const bodyBlock = bodyLines.length
    ? svgText(bodyLines, {
        x: margin,
        y: bodyY,
        size: isHook ? 38 : 36,
        lineH: 46,
        fill: PARCH,
        family: SANS,
      })
    : "";
  const cue = isHook
    ? `<text x="${margin}" y="${H - 150}" font-family="${MONO}" font-size="24" font-weight="bold" fill="${ORANGE}" letter-spacing="3">SWIPE FOR THE RECEIPT</text>`
    : "";
  const ctaRule = isCta
    ? `<rect x="${margin}" y="${bodyY + Math.max(bodyLines.length, 1) * 52 + 30}" width="${W - margin * 2}" height="6" fill="${ORANGE}"/>`
    : "";
  const sourceBlock = sourceLines.length
    ? svgText(sourceLines, {
        x: margin,
        y: H - 114,
        size: 21,
        lineH: 28,
        fill: PARCH,
        family: MONO,
        opacity: 0.66,
      })
    : "";

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <text x="${margin}" y="78" font-family="${MONO}" font-size="24" font-weight="bold" fill="${ORANGE}" letter-spacing="3">${esc(label)}</text>
  <text x="${W - margin}" y="78" text-anchor="end" font-family="${MONO}" font-size="24" font-weight="bold" fill="${PARCH}" letter-spacing="2">${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</text>
  <rect x="${margin}" y="98" width="${W - margin * 2}" height="3" fill="${ORANGE}"/>
  ${svgText(headlineLines, {
    x: margin,
    y: headlineY,
    size: headlineSize,
    lineH: isHook ? 86 : 68,
    fill: WHITE,
    weight: "bold",
  })}
  ${bodyBlock}
  ${ctaRule}
  ${cue}
  ${sourceBlock}
  <text x="${W - margin}" y="${H - 50}" text-anchor="end" font-family="${MONO}" font-size="21" fill="${PARCH}" opacity="0.55" letter-spacing="3">EVIDENCE, NOT INFLUENCE.</text>
</svg>`;
}

async function renderInstagramSlide({ copy, index, total, imagePath, out }) {
  const preset = PRESETS.instagram;
  const { width: W, height: H, margin } = preset;
  const hasImage = Boolean(imagePath);
  const svg = instagramSlideSvg({ preset, copy, index, total, hasImage });
  const composites = [];
  if (imagePath) {
    const card = await imageCard(imagePath, W - margin * 2, copy.kind.includes("hook") ? 520 : 430);
    const top = copy.kind.includes("hook") ? H - card.height - 245 : H - card.height - 185;
    composites.push({
      input: card.buffer,
      left: Math.round((W - card.width) / 2),
      top: Math.max(520, top),
    });
  }
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).composite(composites).png().toFile(out);
  return out;
}

async function renderTiktokSlide({ copy, index, total, imagePath, out }) {
  const preset = PRESETS.tiktok;
  const { width: W, height: H, margin } = preset;
  const headlineLines = wrap(copy.headline, preset.maxHeadline, 5);
  const bodyLines = wrap(copy.body, preset.maxBody, 6);
  const source = splitEvidenceNote(copy.visualNote);
  const sourceLines = wrap(source, 42, 2);
  const isHook = copy.kind.includes("hook");
  const headlineSize = isHook ? 84 : 72;
  const yHeadline = isHook ? 430 : 300;
  const bodyY = yHeadline + headlineLines.length * (headlineSize + 12) + 44;
  const base = imagePath
    ? await sharp(imagePath).resize(W, H, { fit: "cover", position: "centre" }).toBuffer()
    : await sharp({ create: { width: W, height: H, channels: 4, background: NAVY } }).png().toBuffer();
  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BLACK}" stop-opacity="${imagePath ? 0.54 : 0}"/>
      <stop offset="0.45" stop-color="${NAVY}" stop-opacity="${imagePath ? 0.64 : 0}"/>
      <stop offset="1" stop-color="${NAVY}" stop-opacity="${imagePath ? 0.92 : 0}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <text x="${margin}" y="154" font-family="${MONO}" font-size="26" font-weight="bold" fill="${ORANGE}" letter-spacing="3">DE-INFLUENCED</text>
  <text x="${W - margin - 116}" y="154" text-anchor="end" font-family="${MONO}" font-size="24" font-weight="bold" fill="${PARCH}" opacity="0.78" letter-spacing="2">${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</text>
  <rect x="${margin}" y="${yHeadline - 56}" width="96" height="7" fill="${ORANGE}"/>
  ${svgText(headlineLines, {
    x: margin,
    y: yHeadline,
    size: headlineSize,
    lineH: headlineSize + 12,
    fill: WHITE,
    weight: "bold",
  })}
  ${svgText(bodyLines, {
    x: margin,
    y: bodyY,
    size: 41,
    lineH: 54,
    fill: PARCH,
  })}
  ${sourceLines.length ? `<rect x="${margin}" y="${H - 340}" width="${W - margin * 2 - 150}" height="2" fill="${ORANGE}" opacity="0.8"/>` : ""}
  ${svgText(sourceLines, {
    x: margin,
    y: H - 292,
    size: 24,
    lineH: 32,
    fill: PARCH,
    family: MONO,
    opacity: 0.76,
  })}
  <text x="${margin}" y="${H - 155}" font-family="${MONO}" font-size="24" font-weight="bold" fill="${ORANGE}" letter-spacing="3">EVIDENCE, NOT INFLUENCE.</text>
</svg>`;
  mkdirSync(dirname(out), { recursive: true });
  await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(out);
  return out;
}

async function renderContactSheet({ slidePaths, out }) {
  if (!slidePaths.length) return null;
  const first = await sharp(slidePaths[0]).metadata();
  const cols = Math.min(4, slidePaths.length);
  const gap = 28;
  const margin = 36;
  const thumbW = 300;
  const thumbH = Math.round((thumbW * first.height) / first.width);
  const rows = Math.ceil(slidePaths.length / cols);
  const W = margin * 2 + cols * thumbW + (cols - 1) * gap;
  const H = margin * 2 + rows * thumbH + (rows - 1) * gap;
  const composites = [];
  for (const [i, path] of slidePaths.entries()) {
    const left = margin + (i % cols) * (thumbW + gap);
    const top = margin + Math.floor(i / cols) * (thumbH + gap);
    const input = await sharp(path).resize(thumbW, thumbH, { fit: "cover" }).png().toBuffer();
    composites.push({ input, left, top });
  }
  mkdirSync(dirname(out), { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: PARCH } })
    .composite(composites)
    .png()
    .toFile(out);
  return out;
}

export async function renderCarouselDeck({
  story,
  sections,
  sectionImages = {},
  outDir,
  format = "instagram",
}) {
  const preset = PRESETS[format] ?? PRESETS.instagram;
  const deckDir = join(outDir, format);
  mkdirSync(deckDir, { recursive: true });
  const total = sections.length;
  const slidePaths = [];
  for (const [index, section] of sections.entries()) {
    const copy = slideCopy(section);
    const out = join(deckDir, `${story.slug}-slide-${String(index + 1).padStart(2, "0")}.png`);
    const imagePath = sectionImages[index];
    if (format === "tiktok") {
      await renderTiktokSlide({ copy, index, total, imagePath, out });
    } else {
      await renderInstagramSlide({ copy, index, total, imagePath, out });
    }
    slidePaths.push(out);
  }
  const contactSheet = await renderContactSheet({
    slidePaths,
    out: join(deckDir, `${story.slug}-${format}-contact-sheet.png`),
  });
  return {
    format,
    label: preset.label,
    width: preset.width,
    height: preset.height,
    slidePaths,
    contactSheet,
  };
}
