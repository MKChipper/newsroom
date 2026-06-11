// Receipt slide compositor — deterministic, no AI, no artifacts.
// The house template for "claim vs receipt" posts: their claim on a white
// card, the study it links to on a second white card, an orange verdict
// strip. Real pixels of real evidence — that's the whole point.
//
// Reusable: pass any claim crop + study crop + labels and get a pixel-
// identical branded slide. This is the first entry in the house-style palette.

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const NAVY = "#152336";
const ORANGE = "#F76928";
const PARCH = "#F3EDEA";
const WHITE = "#FFFFFF";
const W = 1080;
const H = 1350; // 4:5 carousel

const MONO = "Courier New, Courier, monospace";
const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// crop -> white rounded card, fit inside (cardW x maxH), return {buffer,w,h}
async function card(cropPath, cardW, maxH, pad = 22, radius = 20) {
  const inner = await sharp(cropPath)
    .resize(cardW - pad * 2, maxH - pad * 2, { fit: "inside", withoutEnlargement: false })
    .toBuffer();
  const meta = await sharp(inner).metadata();
  const w = meta.width + pad * 2;
  const h = meta.height + pad * 2;
  const white = await sharp({
    create: { width: w, height: h, channels: 4, background: WHITE },
  })
    .composite([{ input: inner, left: pad, top: pad }])
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  );
  const rounded = await sharp(white)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return { buffer: rounded, w, h };
}

function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

export async function receiptSlide({
  claimCrop,
  studyCrop,
  index,
  total,
  claimLabel = "WHAT THE LABEL SAYS",
  studyLabel = "WHAT THE LINKED STUDY IS ACTUALLY ABOUT",
  verdict, // the orange one-liner; keep it factual
  kicker = "THE RECEIPTS",
  footer = "EVIDENCE, NOT INFLUENCE.",
  out,
}) {
  const margin = 80;
  const cardW = W - margin * 2;
  const claim = await card(claimCrop, cardW, 360);
  const study = await card(studyCrop, cardW, 430);

  // vertical layout, top-down
  const yKicker = 70;
  const yClaimLabel = 150;
  const yClaim = 182;
  const yStudyLabel = yClaim + claim.h + 34;
  const yStudy = yStudyLabel + 32;
  const yVerdict = yStudy + study.h + 40;

  const verdictLines = verdict ? wrap(verdict, 46) : [];
  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <text x="${margin}" y="${yKicker}" font-family="${MONO}" font-size="26" font-weight="bold" fill="${ORANGE}" letter-spacing="3">${esc(kicker)}</text>
  <text x="${W - margin}" y="${yKicker}" text-anchor="end" font-family="${MONO}" font-size="26" font-weight="bold" fill="${PARCH}" letter-spacing="2">${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}</text>
  <rect x="${margin}" y="${yKicker + 16}" width="${cardW}" height="3" fill="${ORANGE}"/>
  <text x="${margin}" y="${yClaimLabel}" font-family="${MONO}" font-size="22" fill="${PARCH}" opacity="0.7" letter-spacing="2">${esc(claimLabel)}</text>
  <text x="${margin}" y="${yStudyLabel}" font-family="${MONO}" font-size="22" fill="${ORANGE}" letter-spacing="2">${esc(studyLabel)}</text>
  ${verdictLines
    .map(
      (l, i) =>
        `<text x="${margin}" y="${yVerdict + i * 42}" font-family="${SANS}" font-size="34" font-weight="bold" fill="${PARCH}">${esc(l)}</text>`
    )
    .join("\n")}
  <text x="${W - margin}" y="${H - 50}" text-anchor="end" font-family="${MONO}" font-size="22" fill="${PARCH}" opacity="0.55" letter-spacing="3">${esc(footer)}</text>
</svg>`;

  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg))
    .composite([
      { input: claim.buffer, left: margin, top: yClaim },
      { input: study.buffer, left: margin, top: yStudy },
    ])
    .png()
    .toFile(out);
  return out;
}

// Establishing slide: the full real product page shown once, to prove the
// bullets and their links are genuine. One white card + a header.
export async function establishingSlide({ crop, kicker, headline, footer = "EVIDENCE, NOT INFLUENCE.", out }) {
  const margin = 80;
  const cardW = W - margin * 2;
  const big = await card(crop, cardW, 760);
  const headLines = wrap(headline, 30);
  const yHead = 150;
  const yCard = yHead + headLines.length * 50 + 40;
  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <text x="${margin}" y="74" font-family="${MONO}" font-size="26" font-weight="bold" fill="${ORANGE}" letter-spacing="3">${esc(kicker)}</text>
  <rect x="${margin}" y="90" width="${cardW}" height="3" fill="${ORANGE}"/>
  ${headLines
    .map((l, i) => `<text x="${margin}" y="${yHead + i * 50}" font-family="${SANS}" font-size="42" font-weight="bold" fill="${WHITE}">${esc(l)}</text>`)
    .join("\n")}
  <text x="${W - margin}" y="${H - 50}" text-anchor="end" font-family="${MONO}" font-size="22" fill="${PARCH}" opacity="0.55" letter-spacing="3">${esc(footer)}</text>
</svg>`;
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg))
    .composite([{ input: big.buffer, left: Math.round((W - big.w) / 2), top: yCard }])
    .png()
    .toFile(out);
  return out;
}

// Receipt slide, type variant: the claim is rendered as bold type with an
// orange hyperlink underline (their verbatim words), the study stays a real
// screenshot. This is the repeatable workhorse of a claim-vs-receipt post.
export async function receiptTypeSlide({
  claimText,
  index,
  total,
  studyCrop,
  verdict,
  kicker = "THE RECEIPTS",
  footer = "EVIDENCE, NOT INFLUENCE.",
  out,
}) {
  const margin = 80;
  const cardW = W - margin * 2;
  const study = await card(studyCrop, cardW, 500);

  const claimLines = wrap(`"${claimText}"`, 24);
  const claimFontSize = claimLines.length > 2 ? 54 : 64;
  const yKicker = 70;
  const yClaimLabel = 150;
  const yClaim = 210;
  const claimBlockH = claimLines.length * (claimFontSize + 12);
  // underline width estimate for the longest claim line (bold Helvetica ~0.56em)
  const longest = claimLines.reduce((a, b) => (a.length > b.length ? a : b), "");
  const ulW = Math.min(cardW, Math.round(longest.length * claimFontSize * 0.56));
  const yUnderline = yClaim + claimBlockH - claimFontSize + 14;
  const yStudyLabel = yClaim + claimBlockH + 50;
  const yStudy = yStudyLabel + 30;
  const yVerdict = yStudy + study.h + 46;
  const verdictLines = verdict ? wrap(verdict, 46) : [];

  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <text x="${margin}" y="${yKicker}" font-family="${MONO}" font-size="26" font-weight="bold" fill="${ORANGE}" letter-spacing="3">${esc(kicker)}</text>
  <text x="${W - margin}" y="${yKicker}" text-anchor="end" font-family="${MONO}" font-size="26" font-weight="bold" fill="${PARCH}" letter-spacing="2">${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}</text>
  <rect x="${margin}" y="${yKicker + 16}" width="${cardW}" height="3" fill="${ORANGE}"/>
  <text x="${margin}" y="${yClaimLabel}" font-family="${MONO}" font-size="22" fill="${PARCH}" opacity="0.7" letter-spacing="2">THEIR BULLET, VERBATIM:</text>
  ${claimLines
    .map((l, i) => `<text x="${margin}" y="${yClaim + i * (claimFontSize + 12)}" font-family="${SANS}" font-size="${claimFontSize}" font-weight="bold" fill="${WHITE}">${esc(l)}</text>`)
    .join("\n")}
  <rect x="${margin}" y="${yUnderline}" width="${ulW}" height="5" fill="${ORANGE}"/>
  <text x="${margin}" y="${yStudyLabel}" font-family="${MONO}" font-size="22" fill="${ORANGE}" letter-spacing="2">WHAT THAT LINK ACTUALLY GOES TO:</text>
  ${verdictLines
    .map((l, i) => `<text x="${margin}" y="${yVerdict + i * 42}" font-family="${SANS}" font-size="34" font-weight="bold" fill="${PARCH}">${esc(l)}</text>`)
    .join("\n")}
  <text x="${W - margin}" y="${H - 50}" text-anchor="end" font-family="${MONO}" font-size="22" fill="${PARCH}" opacity="0.55" letter-spacing="3">${esc(footer)}</text>
</svg>`;

  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg))
    .composite([{ input: study.buffer, left: margin, top: yStudy }])
    .png()
    .toFile(out);
  return out;
}

// Plain navy text slide — establishing copy or the CTA payoff.
export async function textSlide({ kicker, lines = [], accentLast = false, footer, out }) {
  const margin = 80;
  const y0 = 320;
  const body = lines
    .map((l, i) => {
      const last = i === lines.length - 1;
      const fill = accentLast && last ? ORANGE : i === 0 ? WHITE : PARCH;
      const size = i === 0 ? 58 : 38;
      const weight = i === 0 || (accentLast && last) ? "bold" : "normal";
      return `<text x="${margin}" y="${y0 + i * 66}" font-family="${SANS}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(l)}</text>`;
    })
    .join("\n");
  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  ${kicker ? `<text x="${margin}" y="120" font-family="${MONO}" font-size="26" font-weight="bold" fill="${ORANGE}" letter-spacing="3">${esc(kicker)}</text><rect x="${margin}" y="136" width="${W - margin * 2}" height="3" fill="${ORANGE}"/>` : ""}
  ${body}
  ${footer ? `<text x="${W - margin}" y="${H - 50}" text-anchor="end" font-family="${MONO}" font-size="22" fill="${PARCH}" opacity="0.55" letter-spacing="3">${esc(footer)}</text>` : ""}
</svg>`;
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(out);
  return out;
}

// Hook slide: the re-graded product shot, edge-to-edge, dark gradient scrim,
// headline + orange micro-rule.
export async function hookSlide({ bgImage, headline, subhead, out }) {
  const base = await sharp(bgImage)
    .resize(W, H, { fit: "cover", position: "centre" })
    .toBuffer();
  const lines = wrap(headline, 22);
  const startY = H - 360;
  const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.45" stop-color="${NAVY}" stop-opacity="0"/>
      <stop offset="1" stop-color="${NAVY}" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <rect x="80" y="${startY - 44}" width="90" height="6" fill="${ORANGE}"/>
  ${lines
    .map(
      (l, i) =>
        `<text x="80" y="${startY + i * 66}" font-family="${SANS}" font-size="60" font-weight="bold" fill="${WHITE}">${esc(l)}</text>`
    )
    .join("\n")}
  ${subhead ? `<text x="80" y="${startY + lines.length * 66 + 24}" font-family="${MONO}" font-size="28" fill="${PARCH}" opacity="0.85">${esc(subhead)}</text>` : ""}
</svg>`;
  mkdirSync(dirname(out), { recursive: true });
  await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(out);
  return out;
}
