// Shared helpers + the stage model the whole dashboard is built around.

// ---- The journey ---------------------------------------------------------------
// One post, nine stops. Every screen orients itself against this list — the board
// groups it, the studio stepper draws it, the cards show progress along it.

export type StageId =
  | "idea"
  | "concept"
  | "copy"
  | "visuals"
  | "voice"
  | "assembly"
  | "final"
  | "ready"
  | "live";

export const STAGES: { id: StageId; label: string; statuses: string[] }[] = [
  { id: "idea", label: "Idea", statuses: ["idea"] },
  { id: "concept", label: "Concept", statuses: ["angle"] },
  { id: "copy", label: "Copy", statuses: ["drafting", "legal_review", "gate1"] },
  { id: "visuals", label: "Visuals", statuses: ["design"] },
  { id: "voice", label: "Voice", statuses: ["recording"] },
  { id: "assembly", label: "Assembly", statuses: ["production", "packaging"] },
  { id: "final", label: "Final check", statuses: ["gate2"] },
  { id: "ready", label: "Ready", statuses: ["ready_to_post"] },
  { id: "live", label: "Live", statuses: ["posted", "rated"] },
];

export const stageIndex = (status: string) =>
  Math.max(0, STAGES.findIndex((s) => s.statuses.includes(status)));

export const stageOf = (status: string): StageId => STAGES[stageIndex(status)].id;

// Board groups: the five stops Liz thinks in, drawn as one flow strip.
export const BOARD_GROUPS: { id: string; label: string; hint: string; statuses: string[] }[] = [
  { id: "ideas", label: "Ideas", hint: "pick a concept", statuses: ["idea"] },
  {
    id: "making",
    label: "In the making",
    hint: "desks + you",
    statuses: ["angle", "drafting", "legal_review", "design", "recording", "production", "packaging"],
  },
  { id: "approvals", label: "Your call", hint: "approve copy / final", statuses: ["gate1", "gate2"] },
  { id: "ready", label: "Ready to post", hint: "post by hand", statuses: ["ready_to_post"] },
  { id: "live", label: "Live", hint: "add numbers", statuses: ["posted", "rated"] },
];

// ---- Live status ----------------------------------------------------------------
// Lock TTL must match convex/pipeline.ts — a story locked within this window is
// being actively worked by a desk; older/absent locks mean it's only queued.
const LOCK_TTL_MS = 30 * 60 * 1000;
const AUTO_DESKS: Record<string, string> = {
  drafting: "Writers' room",
  legal_review: "Legal desk",
  production: "Production",
  packaging: "Packaging",
};

export type LiveTone = "working" | "queued" | "you" | "done";
export const LIVE_ICON: Record<LiveTone, string> = { working: "▶", queued: "⏳", you: "◆", done: "✓" };

// One plain-language line answering "what is happening with this post right now".
export const liveStatus = (story: any): { text: string; tone: LiveTone } => {
  if (!story) return { text: "", tone: "you" };
  const desk = AUTO_DESKS[story.status];
  if (desk) {
    const working = story.lockedBy && (story.lockedAt ?? 0) > Date.now() - LOCK_TTL_MS;
    return working
      ? { text: `${desk} working now`, tone: "working" }
      : { text: `Queued for ${desk.toLowerCase()}`, tone: "queued" };
  }
  if (story.status === "posted" || story.status === "rated") return { text: "Posted", tone: "done" };
  const owed: Record<string, string> = {
    idea: "Pick a concept",
    angle: "Agree the concept",
    gate1: "Approve the copy",
    design: "Direct the visuals",
    recording: "Record your voice",
    gate2: "Approve the final",
    ready_to_post: "Post it",
  };
  return { text: owed[story.status] ?? pretty(story.status), tone: "you" };
};

// ---- Media + misc ----------------------------------------------------------------

export const mediaUrl = (p?: string) => {
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const rel = p.split("/media-vault/").pop();
  return rel && rel !== p ? "/media/" + rel : "";
};

export const noteFor = (a: any) => {
  try {
    return JSON.parse(a?.meta ?? "{}");
  } catch {
    return {};
  }
};

export const latestCarouselImages = (images: any[] = []) => {
  const slides = images.filter((a) => noteFor(a).carouselSlide);
  if (slides.length === 0) return [];
  const latest = Math.max(...slides.map((a) => Number(noteFor(a).renderedAt ?? 0)));
  return slides
    .filter((a) => !latest || Number(noteFor(a).renderedAt ?? 0) === latest)
    .sort((a, b) => Number(noteFor(a).sectionIndex ?? 0) - Number(noteFor(b).sectionIndex ?? 0));
};

export const pretty = (s?: string) => (s ?? "?").replace(/_/g, " ");
export const isCarouselFormat = (format?: string) => /carousel/i.test(format ?? "");
export const shortDate = (t?: number) =>
  t ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ---- Image generation ------------------------------------------------------------

export const PROVIDER_MODELS: Record<string, string[]> = {
  higgsfield: ["gpt_image_2", "flux_2", "nano_banana_2", "text2image_soul_v2", "grok_image"],
  gemini: ["gemini-3-pro-image", "gemini-3.1-flash-image"],
  fal: ["fal-ai/flux/dev", "fal-ai/flux-pro/v1.1", "fal-ai/flux/schnell", "fal-ai/recraft-v3"],
};

export const tidyPromptText = (value = "") => String(value).replace(/\s+/g, " ").trim();

export const cleanVisualBrief = (text: string) => {
  // Keep the subject; strip only literal copy meant to be rendered as text.
  const clean = tidyPromptText(text)
    .replace(/\bSlide\s*\d+\s*[:,;-]?\s*/gi, "")
    .replace(/\btitle card\b/gi, "")
    .replace(/\b(sub-?line|subtitle|caption|headline|lower third)\b\s*:?/gi, "")
    .replace(/\bcitation[^,.;]*/gi, "")
    .replace(/\bPMID\s*\d+\b/gi, "")
    .replace(/\bp\s*=\s*[-\d.]+\b/gi, "")
    .replace(/['"][^'"]+['"]/g, "")
    .replace(/\s*[,;](\s*[,;])+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "the subject of the spoken beat";
};

// Deterministic fallback for the manual "Rebuild prompt" button — the art-director
// desk writes the real prompts. Leads with the surviving subject, slim house tail.
export const buildImagePrompt = (slide: any, aspect = "9:16") => {
  const subject = cleanVisualBrief(tidyPromptText(slide?.visualNote ?? slide?.voLine));
  return [
    `${aspect} editorial documentary photograph for a De-Influenced social post: ${subject}.`,
    "Premium product-research look: a real desk or counter scene, soft directional light, one clear focal subject, modern neutral palette with a single sharp accent colour, generous clean negative space for editor-added text.",
    "No text, letters, numbers, logos, brand names, fake screenshots, charts with data, watermarks, or cartoon style.",
  ].join(" ");
};

// ---- Review loop (Gate 2 quality checks) -------------------------------------------

export const REVIEW_GATES = [
  ["formatLock", "Format lock"],
  ["hook", "First-frame hook"],
  ["messageSpine", "Message spine"],
  ["appResolver", "App resolver"],
  ["assetTruth", "Asset truth"],
  ["voiceCompliance", "Voice/compliance"],
  ["pixelMotion", "Pixel/motion"],
  ["platformNative", "Platform-native"],
] as const;
export const REVIEW_STATUSES = ["pending", "green", "amber", "red"] as const;
export const REVIEW_DECISIONS = ["pending", "revise", "blocked", "ready"] as const;
export const REVIEW_PROOF_FIELDS = [
  ["firstFrame", "First-frame proof", "What is visible/readable in the first 1.5s with sound off?"],
  ["hookPromise", "Hook promise", "What promise does the hook make, and where is it paid off?"],
  ["messageSpine", "Message spine", "This helps the viewer with [pain] by showing them [check]."],
  ["appResolver", "App resolver", "Where does the app enter, what job does it do, and why is it not just a logo?"],
  ["cta", "CTA proof", "What single action is asked for, and what benefit makes it worth doing?"],
  ["pixelEvidence", "Pixel evidence", "Which rendered file/stills prove text, crops, safe areas, and motion are publishable?"],
  ["finalViewerAction", "Viewer outcome", "What exactly does the viewer know or do differently after this post?"],
] as const;

export const defaultReviewGates = () =>
  Object.fromEntries(REVIEW_GATES.map(([id]) => [id, "pending"])) as Record<string, string>;
export const defaultReviewProof = () =>
  Object.fromEntries(REVIEW_PROOF_FIELDS.map(([id]) => [id, ""])) as Record<string, string>;
export const defaultGateRevisions = () =>
  Object.fromEntries(REVIEW_GATES.map(([id]) => [id, ""])) as Record<string, string>;

export const reviewLabel = (s?: string) => (s ?? "pending").replace(/_/g, " ");
export const reviewMissingItems = (review?: any) => {
  if (!review) return ["No review pass saved for the selected concept."];
  const missing: string[] = [];
  if (review.decision !== "ready") missing.push(`Decision is ${reviewLabel(review.decision)}, not ready.`);
  const openGates = REVIEW_GATES
    .filter(([id]) => review.gates?.[id] !== "green")
    .map(([id, label]) => `${label}: ${reviewLabel(review.gates?.[id])}`);
  if (openGates.length) missing.push(`Open gates: ${openGates.join("; ")}.`);
  const missingProof = REVIEW_PROOF_FIELDS
    .filter(([id]) => (review.proof?.[id] ?? "").trim().length < 12)
    .map(([, label]) => label);
  if (missingProof.length) missing.push(`Missing proof: ${missingProof.join(", ")}.`);
  if ((review.artifactPath ?? "").trim().length < 6) missing.push("Missing rendered artifact path.");
  if ((review.contactSheetPath ?? "").trim().length < 6) missing.push("Missing contact sheet or reviewed stills path.");
  if (review.nextAssetNeeded) missing.push(`Next asset needed: ${review.nextAssetNeeded}`);
  return missing;
};
export const reviewTone = (review?: any) => {
  if (!review) return "pending";
  if (reviewMissingItems(review).length === 0) return "green";
  const gates = REVIEW_GATES.map(([id]) => review.gates?.[id]);
  if (gates.includes("red")) return "red";
  if (gates.includes("amber")) return "amber";
  return "pending";
};
export const reviewIsReady = (review?: any) => reviewMissingItems(review).length === 0;
export const selectedRouteReview = (reviews: any[] = [], routeId?: string) =>
  (routeId ? reviews.filter((review) => review.routeId === routeId) : reviews)[0];
export const routeNeedsReview = (route?: any) => Number(route?.tier ?? 1) >= 2;

export const METRIC_KEYS = ["views", "likes", "comments", "saves", "shares", "clicks", "follows"] as const;
