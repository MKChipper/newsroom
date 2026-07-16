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
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[,;:\s]+$/, "") + " …";
    return kept;
  }
  return lines;
}

// Fit body copy without ever chopping mid-sentence: try the base size, then
// step the font down (chars-per-line scale up) until it fits; ellipsize only
// as a last resort at the smallest size.
function fitBody(text, baseMax, maxLines, baseSize, lineH) {
  const clean = String(text ?? "").trim();
  if (!clean) return { lines: [], size: baseSize, lineH };
  for (const scale of [1, 1.12, 1.28, 1.45]) {
    const size = Math.round(baseSize / scale);
    const max = Math.round(baseMax * scale);
    const words = clean.split(/\s+/);
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
    if (lines.length <= maxLines) {
      return { lines, size, lineH: Math.round(lineH * (size / baseSize)) };
    }
    if (scale === 1.45) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = kept[maxLines - 1].replace(/[,;:\s]+$/, "") + " …";
      return { lines: kept, size, lineH: Math.round(lineH * (size / baseSize)) };
    }
  }
  return { lines: [clean], size: baseSize, lineH };
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

// Pull ONLY a real citation out of the beat's visual note. The note mixes
// citations with production directions ("… — footnote; needs Liz asset: …"),
// and anything that isn't a citation must never reach the rendered slide.
function splitEvidenceNote(note = "") {
  const text = String(note).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const found = [];
  const doi = text.match(/\bDOI\s*:?\s*10\.\d{4,9}\/[^\s;,)"']+/i);
  if (doi) found.push(doi[0].replace(/^doi\s*:?\s*/i, "DOI "));
  const pmid = text.match(/\bPMID\s*:?\s*\d{6,9}\b/i);
  if (pmid) found.push(pmid[0].toUpperCase().replace(/\s+/g, " "));
  // "Prentice C et al., Menopause, 15 Jul 2026 (via news-medical.net)"
  const etal = text.match(/[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z.'-]*)?\s+et al\.?,[^;—|]{0,90}/);
  if (etal) found.push(etal[0].trim().replace(/[,\s]+$/, ""));
  if (found.length) return [...new Set(found)].join(" · ").slice(0, 120);
  // fallback: text after an explicit source:/citation: marker, cut hard at the
  // first separator that starts a production note
  const marked = text.split(/(?:source|citation)\s*:/i)[1];
  if (!marked) return "";
  return marked.split(/\s*(?:—|;|\||\bfootnote\b|\bneeds\b|\bgenerated\b|\boverlay\b|\bshown\b|\basset\b)\s*/i)[0]
    .trim()
    .replace(/[,\s]+$/, "")
    .slice(0, 120);
}

// Full-bleed cover band: the plate fills a wide rounded panel edge to edge
// instead of floating as a small padded card in empty canvas.
async function coverBand(imagePath, width, height, radius = 20) {
  const inner = await sharp(imagePath)
    .resize(width, height, { fit: "cover", position: "attention" })
    .toBuffer();
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  );
  const buffer = await sharp(inner).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return { buffer, width, height };
}

function svgText(lines, { x, y, size, lineH, fill, weight = "normal", family = SANS, opacity = 1 }) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * lineH}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${esc(line)}</text>`
    )
    .join("\n");
}

// Shared layout so the SVG text and the composited plate never collide: fit
// the copy first, then give the plate whatever height remains above the
// citation/brand footer.
function layoutInstagram({ preset, copy, hasImage }) {
  const { width: W, height: H, margin } = preset;
  const isHook = copy.kind.includes("hook");
  const headlineLines = wrap(copy.headline, isHook ? 18 : preset.maxHeadline, isHook ? 4 : 3);
  const headlineSize = isHook ? 76 : 60;
  const headlineLineH = isHook ? 86 : 68;
  const headlineY = isHook ? 300 : 210;
  const body = fitBody(copy.body, preset.maxBody, hasImage ? 6 : 9, isHook ? 38 : 36, 47);
  const bodyY = headlineY + headlineLines.length * headlineLineH + 30;
  const bodyEnd = body.lines.length ? bodyY + (body.lines.length - 1) * body.lineH : bodyY - 30;
  let band = null;
  if (hasImage) {
    const bottomReserve = 176; // citation + brand footer
    const top = Math.max(bodyEnd + 52, 500);
    const height = Math.max(260, Math.min(isHook ? 520 : 480, H - bottomReserve - top));
    band = { left: margin, top, width: W - margin * 2, height };
  }
  return { isHook, headlineLines, headlineSize, headlineLineH, headlineY, body, bodyY, bodyEnd, band };
}

function instagramSlideSvg({ preset, copy, index, total, layout }) {
  const { width: W, height: H, margin } = preset;
  const label = kindLabel(copy.kind);
  const isCta = copy.kind.includes("cta") || copy.kind.includes("payoff");
  const { isHook, headlineLines, headlineSize, headlineLineH, headlineY, body, bodyY, bodyEnd } = layout;
  const source = splitEvidenceNote(copy.visualNote);
  const sourceLines = wrap(source, 58, 2);
  const bodyBlock = body.lines.length
    ? svgText(body.lines, {
        x: margin,
        y: bodyY,
        size: body.size,
        lineH: body.lineH,
        fill: PARCH,
        family: SANS,
      })
    : "";
  const cue = isHook
    ? `<text x="${margin}" y="${H - 150}" font-family="${MONO}" font-size="24" font-weight="bold" fill="${ORANGE}" letter-spacing="3">SWIPE FOR THE RECEIPT</text>`
    : "";
  const ctaRule = isCta
    ? `<rect x="${margin}" y="${bodyEnd + 34}" width="${W - margin * 2}" height="6" fill="${ORANGE}"/>`
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
    lineH: headlineLineH,
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
  const { width: W } = preset;
  const hasImage = Boolean(imagePath);
  const layout = layoutInstagram({ preset, copy, hasImage });
  const svg = instagramSlideSvg({ preset, copy, index, total, layout });
  const composites = [];
  if (imagePath && layout.band) {
    const band = await coverBand(imagePath, layout.band.width, layout.band.height);
    composites.push({
      input: band.buffer,
      left: Math.round((W - band.width) / 2),
      top: layout.band.top,
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
  const body = fitBody(copy.body, preset.maxBody, 7, 41, 54);
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
  ${svgText(body.lines, {
    x: margin,
    y: bodyY,
    size: body.size,
    lineH: body.lineH,
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
