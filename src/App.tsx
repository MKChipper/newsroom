import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type View = "posts" | "needs" | "wire" | "pipeline" | "tips" | "recording" | "memos" | "brain" | "settings";
type PostTab = "ideas" | "drafts" | "approvals" | "ready" | "posted";

const POST_TABS: { id: PostTab; label: string }[] = [
  { id: "ideas", label: "Ideas" },
  { id: "drafts", label: "Drafts" },
  { id: "approvals", label: "Approvals" },
  { id: "ready", label: "Ready" },
  { id: "posted", label: "Posted" },
];

const PIPELINE_COLUMNS: { title: string; statuses: string[] }[] = [
  { title: "Ideas", statuses: ["idea"] },
  { title: "Angle room", statuses: ["angle"] },
  { title: "Desks at work", statuses: ["drafting", "legal_review"] },
  { title: "Gate 1 - copy", statuses: ["gate1"] },
  { title: "Design studio", statuses: ["design"] },
  { title: "Recording", statuses: ["recording"] },
  { title: "Assembly", statuses: ["production", "packaging"] },
  { title: "Gate 2 - final", statuses: ["gate2"] },
  { title: "Ready to post", statuses: ["ready_to_post"] },
  { title: "Live", statuses: ["posted", "rated"] },
];

const PROVIDER_MODELS: Record<string, string[]> = {
  higgsfield: ["gpt_image_2", "flux_2", "nano_banana_2", "text2image_soul_v2", "grok_image"],
  gemini: ["gemini-3-pro-image", "gemini-3.1-flash-image"],
  fal: ["fal-ai/flux/dev", "fal-ai/flux-pro/v1.1", "fal-ai/flux/schnell", "fal-ai/recraft-v3"],
};

const tidyPromptText = (value = "") => String(value).replace(/\s+/g, " ").trim();
const promptNeedsRealAsset = (text: string) =>
  /\b(screenshot|screen recording|app screen|app recording|real label|product page|receipt|pubmed|doi|pmid|coa|certificate|search result|url)\b/i.test(text);
const promptHasOverlayDirection = (text: string) =>
  /\b(title card|headline|sub-line|subtitle|caption|citation|footnote|pmid|bullet|tag|number|overlay|text|lettering|quote marks)\b/i.test(text) ||
  /['"][^'"]{2,}['"]/.test(text);
const promptHasChartDirection = (text: string) =>
  /\b(forest plot|bar|chart|axis|confidence interval|effect size|p\s*=|meta-analysis|trial|rct)\b/i.test(text);
const cleanVisualBrief = (text: string) => {
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
const buildImagePrompt = (slide: any, aspect = "9:16") => {
  const subject = cleanVisualBrief(tidyPromptText(slide?.visualNote ?? slide?.voLine));
  return [
    `${aspect} editorial documentary photograph for a De-Influenced social post: ${subject}.`,
    "Premium product-research look: a real desk or counter scene, soft directional light, one clear focal subject, modern neutral palette with a single sharp accent colour, generous clean negative space for editor-added text.",
    "No text, letters, numbers, logos, brand names, fake screenshots, charts with data, watermarks, or cartoon style.",
  ].join(" ");
};

const METRIC_KEYS = ["views", "likes", "comments", "saves", "shares", "clicks", "follows"] as const;
const REVIEW_GATES = [
  ["formatLock", "Format lock"],
  ["hook", "First-frame hook"],
  ["messageSpine", "Message spine"],
  ["appResolver", "App resolver"],
  ["assetTruth", "Asset truth"],
  ["voiceCompliance", "Voice/compliance"],
  ["pixelMotion", "Pixel/motion"],
  ["platformNative", "Platform-native"],
] as const;
const REVIEW_STATUSES = ["pending", "green", "amber", "red"] as const;
const REVIEW_DECISIONS = ["pending", "revise", "blocked", "ready"] as const;
const REVIEW_PROOF_FIELDS = [
  ["firstFrame", "First-frame proof", "What is visible/readable in the first 1.5s with sound off?"],
  ["hookPromise", "Hook promise", "What promise does the hook make, and where is it paid off?"],
  ["messageSpine", "Message spine", "This helps the viewer with [pain] by showing them [check]."],
  ["appResolver", "App resolver", "Where does the app enter, what job does it do, and why is it not just a logo?"],
  ["cta", "CTA proof", "What single action is asked for, and what benefit makes it worth doing?"],
  ["pixelEvidence", "Pixel evidence", "Which rendered file/stills prove text, crops, safe areas, and motion are publishable?"],
  ["finalViewerAction", "Viewer outcome", "What exactly does the viewer know or do differently after this post?"],
] as const;
const defaultReviewGates = () =>
  Object.fromEntries(REVIEW_GATES.map(([id]) => [id, "pending"])) as Record<string, string>;
const defaultReviewProof = () =>
  Object.fromEntries(REVIEW_PROOF_FIELDS.map(([id]) => [id, ""])) as Record<string, string>;
const defaultGateRevisions = () =>
  Object.fromEntries(REVIEW_GATES.map(([id]) => [id, ""])) as Record<string, string>;

const reviewLabel = (s?: string) => (s ?? "pending").replace(/_/g, " ");
const reviewMissingItems = (review?: any) => {
  if (!review) return ["No review pass saved for the selected route."];
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
const reviewTone = (review?: any) => {
  if (!review) return "pending";
  if (reviewMissingItems(review).length === 0) return "green";
  const gates = REVIEW_GATES.map(([id]) => review.gates?.[id]);
  if (gates.includes("red")) return "red";
  if (gates.includes("amber")) return "amber";
  return "pending";
};
const reviewIsReady = (review?: any) => reviewMissingItems(review).length === 0;
const selectedRouteReview = (reviews: any[] = [], routeId?: string) =>
  (routeId ? reviews.filter((review) => review.routeId === routeId) : reviews)[0];
const routeNeedsReview = (route?: any) => Number(route?.tier ?? 1) >= 2;

const mediaUrl = (p?: string) => {
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const rel = p.split("/media-vault/").pop();
  return rel && rel !== p ? "/media/" + rel : "";
};
const noteFor = (a: any) => {
  try {
    return JSON.parse(a?.meta ?? "{}");
  } catch {
    return {};
  }
};
const latestCarouselImages = (images: any[] = []) => {
  const slides = images.filter((a) => noteFor(a).carouselSlide);
  if (slides.length === 0) return [];
  const latest = Math.max(...slides.map((a) => Number(noteFor(a).renderedAt ?? 0)));
  return slides
    .filter((a) => !latest || Number(noteFor(a).renderedAt ?? 0) === latest)
    .sort((a, b) => Number(noteFor(a).sectionIndex ?? 0) - Number(noteFor(b).sectionIndex ?? 0));
};

const pretty = (s?: string) => (s ?? "?").replace(/_/g, " ");
const isCarouselFormat = (format?: string) => /carousel/i.test(format ?? "");
const routeSearchText = (route?: any) =>
  [
    route?.title,
    route?.postType,
    route?.angle,
    route?.structure,
    route?.visualTreatment,
    route?.rationale,
    ...(route?.lizAssetNeeds ?? []),
    ...(route?.agentAssetPlan ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const isAppResolverRoute = (route?: any) => {
  const text = routeSearchText(route);
  return (
    text.includes("app resolver") ||
    text.includes("app-led") ||
    text.includes("de-influenced checks") ||
    text.includes("check before you buy") ||
    text.includes("product + dose + claim") ||
    text.includes("paste the product") ||
    text.includes("paste product")
  );
};

const appResolverInsight = (route?: any) => {
  if (!route || !isAppResolverRoute(route)) return null;
  const text = routeSearchText(route);
  const signals = [
    /(pain|exhaust|confus|overwhelm|guess|trial|trust gap|decision)/.test(text) && "Pain point first",
    /(search|wall|label|claim|product page|receipt|marketing|promise)/.test(text) && "Proof of the confusing environment",
    /(app|de-influenced|paste|check|analyse|analyze|product \+ dose \+ claim)/.test(text) && "App visibly performs the check",
    /(screenshot|screen recording|real|receipt|asset|mixed|needs_liz_assets)/.test(text) && "Uses real proof assets",
  ].filter(Boolean) as string[];
  return {
    title: "App resolver reel",
    spine: "pain point -> proof -> app checks it -> before-you-buy CTA",
    appJob: "Show De-Influenced reducing the buyer's work, not just appearing as a logo.",
    assetRule: "Use real screenshots, product pages, labels, or app recordings when they are doing proof work.",
    signals: signals.length ? signals : ["App-led conversion route"],
  };
};

const shortDate = (t?: number) => {
  if (!t) return "";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const statusGroup = (status: string): PostTab => {
  if (status === "idea") return "ideas";
  if (status === "gate1" || status === "gate2") return "approvals";
  if (status === "ready_to_post") return "ready";
  if (status === "posted" || status === "rated") return "posted";
  return "drafts";
};

const nextAction = (story: any, item?: any) => {
  if (!story) return "";
  if (story.status === "idea") return item?.selectedRoute ? "Commission route" : "Pick route";
  if (story.status === "angle") return "Lock angle";
  if (story.status === "gate1") return "Approve copy";
  if (story.status === "design") return "Pick visuals";
  if (story.status === "recording") return "Record voice";
  if (story.status === "gate2") return "Approve final";
  if (story.status === "ready_to_post") return "Post manually";
  if (story.status === "posted") return "Add numbers";
  return pretty(story.status);
};

// Lock TTL must match convex/pipeline.ts — a story locked within this window is
// being actively worked by a desk; older/absent locks mean it's only queued.
const LOCK_TTL_MS = 30 * 60 * 1000;
const AUTO_DESKS: Record<string, string> = {
  drafting: "Writers' room",
  legal_review: "Legal desk",
  production: "Production",
  packaging: "Packaging",
};

type LiveTone = "working" | "queued" | "you" | "done";
const LIVE_ICON: Record<LiveTone, string> = { working: "▶", queued: "⏳", you: "◆", done: "✓" };

// One plain-language line answering "what is happening with this post right now".
const liveStatus = (story: any): { text: string; tone: LiveTone } => {
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
    idea: "Pick a route",
    angle: "In the angle room",
    gate1: "Approve the copy",
    design: "Pick visuals",
    recording: "Record voice",
    gate2: "Approve the final",
    ready_to_post: "Post it manually",
  };
  return { text: owed[story.status] ?? pretty(story.status), tone: "you" };
};

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function App() {
  const [view, setView] = useState<View>("posts");
  const [selected, setSelected] = useState<Id<"stories"> | null>(null);
  const spend = useQuery(api.production.monthSpend);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <strong>Newsroom</strong>
          <span>Post Studio</span>
        </div>
        <nav className="nav">
          {([
            ["posts", "All posts"],
            ["needs", "Needs me"],
            ["wire", "Wire"],
            ["pipeline", "Pipeline"],
            ["tips", "Tip line"],
            ["recording", "Recording"],
            ["memos", "Memos"],
            ["brain", "Brain"],
            ["settings", "Settings"],
          ] as const).map(([id, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="spend">{spend ? `${spend.month}: $${spend.total.toFixed(2)}` : ""}</span>
      </header>
      <main>
        {view === "posts" && <PostStudio selected={selected} setSelected={setSelected} />}
        {view === "needs" && <AssetInbox setSelected={(id) => { setSelected(id); setView("posts"); }} />}
        {view === "wire" && <Wire onOpen={(id) => { setSelected(id); setView("posts"); }} />}
        {view === "pipeline" && <Pipeline selected={selected} setSelected={setSelected} />}
        {view === "tips" && <TipLine />}
        {view === "recording" && <RecordingDesk />}
        {view === "memos" && <Memos />}
        {view === "brain" && <Brain />}
        {view === "settings" && <Settings />}
      </main>
    </>
  );
}

function PostStudio({
  selected,
  setSelected,
}: {
  selected: Id<"stories"> | null;
  setSelected: (id: Id<"stories"> | null) => void;
}) {
  const items = useQuery(api.design.postStudioList) ?? [];
  const [tab, setTab] = useState<PostTab>("ideas");
  const [platform, setPlatform] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const item of items as any[]) if (item.story.platform) set.add(item.story.platform);
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const counts = useMemo(() => {
    const out: Record<PostTab, number> = { ideas: 0, drafts: 0, approvals: 0, ready: 0, posted: 0 };
    for (const item of items as any[]) out[statusGroup(item.story.status)]++;
    return out;
  }, [items]);

  const filtered = (items as any[]).filter((item) => {
    if (statusGroup(item.story.status) !== tab) return false;
    if (platform !== "all" && item.story.platform !== platform) return false;
    if (mineOnly && item.assetCounts.lizNeeded === 0 && item.story.status !== "gate1" && item.story.status !== "gate2") return false;
    return true;
  });

  return (
    <div className="workspace">
      <section className="listpane">
        <div className="section-head">
          <div>
            <h1>All posts</h1>
            <p>Ideas become platform-aware drafts, approvals, and ready packages.</p>
          </div>
          <button className="icon-btn" title="Clear selection" onClick={() => setSelected(null)}>x</button>
        </div>
        <div className="tabs">
          {POST_TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label} <span>{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="filters">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {platforms.map((p) => <option key={p}>{p}</option>)}
          </select>
          <label className="check">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            Needs me
          </label>
        </div>
        <div className="post-list">
          {filtered.length === 0 && <div className="empty-state">Nothing in this view.</div>}
          {filtered.map((item) => (
            <PostCard
              key={item.story._id}
              item={item}
              selected={selected === item.story._id}
              onClick={() => setSelected(item.story._id)}
            />
          ))}
        </div>
      </section>
      <StoryStudio storyId={selected} />
    </div>
  );
}

function PostCard({ item, selected, onClick }: { item: any; selected: boolean; onClick: () => void }) {
  const story = item.story;
  const draft = item.draft;
  const route = item.selectedRoute ?? item.routes?.[0];
  const asset = item.previewAsset;
  const live = liveStatus(story);
  return (
    <button className={`post-card ${selected ? "selected" : ""}`} onClick={onClick}>
      <div className="thumb">
        {asset?.kind === "master" ? (
          <video src={mediaUrl(asset.filePath)} muted playsInline />
        ) : asset?.filePath ? (
          <img src={mediaUrl(asset.filePath)} alt="" />
        ) : (
          <span>{pretty(story.format).slice(0, 14)}</span>
        )}
      </div>
      <div className="post-card-body">
        <div className="post-card-top">
          <strong>{story.title}</strong>
          <span className={`state state-live-${live.tone}`}>{LIVE_ICON[live.tone]} {live.text}</span>
        </div>
        <div className="post-card-meta">
          <span>{pretty(story.platform)}</span>
          <span>{pretty(story.format)}</span>
          <span>{pretty(story.job)}</span>
        </div>
        <p>{draft?.caption ?? route?.postType ?? story.summary ?? item.scriptPreview ?? "No preview yet."}</p>
        <div className="obligations">
          {item.assetCounts.lizNeeded > 0 && <span className="pill warn">{item.assetCounts.lizNeeded} from Liz</span>}
          {item.assetCounts.agentNeeded > 0 && <span className="pill info">{item.assetCounts.agentNeeded} agent assets</span>}
          {route?.tier && <span className="pill">tier {route.tier}</span>}
          {isAppResolverRoute(route) && <span className="pill app-route">app resolver</span>}
          {item.latestReview && <span className={`pill review-${reviewTone(item.latestReview)}`}>route review {item.latestReview.decision}</span>}
          {route?.assetStrategy && <span className="pill">{pretty(route.assetStrategy)}</span>}
        </div>
      </div>
    </button>
  );
}

function StoryStudio({ storyId }: { storyId: Id<"stories"> | null }) {
  if (!storyId) {
    return (
      <section className="studio empty-studio">
        <div>
          <h2>Select a post</h2>
          <p>Open a story to see route options, asset needs, post preview, approvals, and the ready package.</p>
        </div>
      </section>
    );
  }
  return <StoryStudioLoaded storyId={storyId} />;
}

function StoryStudioLoaded({ storyId }: { storyId: Id<"stories"> }) {
  const data = useQuery(api.design.creativeWorkspace, { storyId });
  const transition = useMutation(api.pipeline.transition);
  const gate = useMutation(api.pipeline.gateDecision);
  const selectRoute = useMutation(api.design.selectFormatRoute);
  const updateAsset = useMutation(api.design.updateAssetRequest);
  const [note, setNote] = useState("");

  if (!data) return <section className="studio" />;

  const story = (data as any).story;
  const live = liveStatus(story);
  const routes = (data as any).routes ?? [];
  const selectedRoute = routes.find((r: any) => r.selected);
  const postReviews = (data as any).postReviews ?? [];
  const latestRouteReview = selectedRouteReview(postReviews, selectedRoute?._id);
  const script = ((data as any).scripts ?? []).filter((s: any) => s.status !== "superseded").sort((a: any, b: any) => b.version - a.version)[0];
  const master = ((data as any).assets ?? []).find((a: any) => a.kind === "master");
  const allImages = ((data as any).assets ?? []).filter((a: any) => a.kind === "image");
  const carouselImages = latestCarouselImages(allImages);
  const images = carouselImages.length ? carouselImages : allImages;
  const estTotal = ((data as any).runs ?? [])
    .filter((r: any) => r.status !== "failed")
    .reduce((n: number, r: any) => n + r.estCostUsd, 0);

  const attachRequestFiles = async (requestId: Id<"assetRequests">, files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const res = await fetch(
      `/media-upload?slug=${encodeURIComponent(story.slug)}&name=${encodeURIComponent(file.name)}`,
      { method: "POST", body: file }
    );
    const { path } = await res.json();
    await updateAsset({ requestId, filePath: path, status: "supplied" });
  };

  return (
    <section className="studio">
      <div className="studio-head">
        <div>
          <h2>{story.title}</h2>
          <div className="meta-row">
            <span className={`pill live-pill state-live-${live.tone}`}>{LIVE_ICON[live.tone]} {live.text}</span>
            <span className={`pill job-${story.job}`}>{pretty(story.job)}</span>
            <span className="pill">{pretty(story.status)}</span>
            <span className="pill">{pretty(story.platform)}</span>
            <span className="pill">{pretty(story.format)}</span>
          </div>
        </div>
        <strong className="next">{nextAction(story, { selectedRoute })}</strong>
      </div>

      <div className="studio-grid">
        <div className="studio-main">
          <PostPreview story={story} route={selectedRoute ?? routes[0]} script={script} draft={(data as any).postDraft} master={master} images={images} />

          {story.status === "angle" && <AngleRoom storyId={storyId} selectedRoute={selectedRoute} />}

          {story.status === "design" && <DesignStudio storyId={storyId} />}

          {master && (
            <section className="surface">
              <h3>Final cut</h3>
              <video src={mediaUrl(master.filePath)} controls className="master" />
              <p className="muted">{noteFor(master).durationSec ? `${noteFor(master).durationSec}s` : ""} caption-free master</p>
            </section>
          )}

          {script && <ScriptPanel script={script} />}
          {images.length > 0 && <ImageGrid images={images} />}
          <ClaimsPanel claims={(data as any).claims ?? []} />
        </div>

        <aside className="studio-side">
          <BriefPanel brief={(data as any).brief} story={story} />
          <StoryActivity storyId={storyId} />
          <RoutePanel
            storyId={storyId}
            routes={routes}
            selectedRoute={selectedRoute}
            onSelect={(routeId: Id<"formatRoutes">) => selectRoute({ storyId, routeId })}
          />
          <ReviewLoopPanel
            key={`${storyId}:${selectedRoute?._id ?? "no-route"}`}
            storyId={storyId}
            routeId={selectedRoute?._id}
            reviews={postReviews}
            assetRequests={(data as any).assetRequests ?? []}
          />
          <AssetRequestPanel requests={(data as any).assetRequests ?? []} attachFiles={attachRequestFiles} updateAsset={updateAsset} />
          <ManifestPanel runs={(data as any).runs ?? []} estTotal={estTotal} />
          <ApprovalPanel
            story={story}
            estTotal={estTotal}
            note={note}
            setNote={setNote}
            selectedRoute={selectedRoute}
            latestReview={latestRouteReview}
            assetRequests={(data as any).assetRequests ?? []}
            approve={() => gate({ storyId, gate: story.status === "gate1" ? 1 : 2, decision: "approve", note: note || undefined })}
            redo={() => gate({ storyId, gate: story.status === "gate1" ? 1 : 2, decision: "redo", note })}
            kill={() => gate({ storyId, gate: story.status === "gate1" ? 1 : 2, decision: "kill", note: note || undefined })}
          />
          <StoryActions
            story={story}
            hasSelectedRoute={Boolean(selectedRoute)}
            toAngle={() => transition({ storyId, to: "angle" })}
            toDraft={() => transition({ storyId, to: "drafting" })}
            kill={() => transition({ storyId, to: "killed" })}
            markPosted={() => transition({ storyId, to: "posted" })}
          />
          {(story.status === "posted" || story.status === "rated") && <MetricsForm storyId={storyId} metrics={story.metrics} />}
        </aside>
      </div>
    </section>
  );
}

function ReviewLoopPanel({ storyId, routeId, reviews, assetRequests }: { storyId: Id<"stories">; routeId?: Id<"formatRoutes">; reviews: any[]; assetRequests: any[] }) {
  const saveReview = useMutation(api.design.savePostReview);
  const routeReviews = (routeId ? reviews.filter((review) => review.routeId === routeId) : reviews)
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const latest = routeReviews?.[0];
  const [passNo, setPassNo] = useState(() => String((latest?.passNo ?? 0) + 1));
  const [gates, setGates] = useState<Record<string, string>>(() => defaultReviewGates());
  const [proof, setProof] = useState<Record<string, string>>(() => defaultReviewProof());
  const [gateRevisions, setGateRevisions] = useState<Record<string, string>>(() => defaultGateRevisions());
  const [artifactPath, setArtifactPath] = useState("");
  const [contactSheetPath, setContactSheetPath] = useState("");
  const [decision, setDecision] = useState<(typeof REVIEW_DECISIONS)[number]>("pending");
  const [requiredRevisions, setRequiredRevisions] = useState("");
  const [nextAssetNeeded, setNextAssetNeeded] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  const updateGate = (id: string, value: string) => setGates((current) => ({ ...current, [id]: value }));
  const updateProof = (id: string, value: string) => setProof((current) => ({ ...current, [id]: value }));
  const updateGateRevision = (id: string, value: string) => setGateRevisions((current) => ({ ...current, [id]: value }));
  const proofComplete = REVIEW_PROOF_FIELDS.every(([id]) => proof[id]?.trim().length >= 12);
  const artifactComplete = artifactPath.trim().length >= 6;
  const visualEvidenceComplete = contactSheetPath.trim().length >= 6;
  const allGatesGreen = REVIEW_GATES.every(([id]) => gates[id] === "green");
  const openGateIds = REVIEW_GATES.filter(([id]) => gates[id] === "amber" || gates[id] === "red").map(([id]) => id);
  const hasOpenGate = openGateIds.length > 0;
  const revisionsActionable = requiredRevisions.trim().length >= 20;
  const nextAssetActionable = nextAssetNeeded.trim().length >= 12 && nextAssetNeeded.trim().toLowerCase() !== "more assets";
  const missingGateFixes = openGateIds.filter((id) => gateRevisions[id]?.trim().length < 20);
  const outstandingReadyAssets = (assetRequests ?? []).filter((request: any) => {
    const appliesToActiveScope = !request.routeId || (routeId && request.routeId === routeId);
    const isOpen = request.status === "needed" || request.status === "generating";
    const reviewGenerated = request.owner === "liz" && request.label.startsWith("Review asset:");
    return appliesToActiveScope && request.required && isOpen && !reviewGenerated;
  });
  const routeBlockedReason = !routeId ? "Select a format route before saving a review pass." : "";
  const readyBlockedReason = decision === "ready" && !allGatesGreen
    ? "Ready needs every gate green."
    : decision === "ready" && !proofComplete
      ? "Ready needs proof for the hook, message, app resolver, CTA, pixel pass, and viewer outcome."
      : decision === "ready" && !artifactComplete
        ? "Ready needs the rendered artifact path."
      : decision === "ready" && !visualEvidenceComplete
        ? "Ready needs a contact sheet or reviewed stills path."
      : decision === "ready" && nextAssetNeeded.trim()
        ? "Ready cannot still request a next asset."
      : decision === "ready" && outstandingReadyAssets.length > 0
        ? `Ready needs required assets supplied, selected, or waived: ${outstandingReadyAssets.map((request: any) => request.label).join("; ")}`
      : "";
  const revisionBlockedReason = hasOpenGate && !revisionsActionable
    ? "Amber or red gates need a concrete revision instruction."
    : decision !== "ready" && !revisionsActionable && !nextAssetActionable
      ? "Non-ready passes need a concrete revision instruction or one specific next asset."
    : missingGateFixes.length > 0
      ? "Each amber or red gate needs its own concrete fix."
    : "";

  const save = async () => {
    try {
      setErr("");
      if (routeBlockedReason || readyBlockedReason || revisionBlockedReason) {
        setErr(routeBlockedReason || readyBlockedReason || revisionBlockedReason);
        return;
      }
      const payload: any = {
        storyId,
        passNo: Number(passNo) || ((latest?.passNo ?? 0) + 1),
        gates: gates as any,
        decision,
        proof: proof as any,
        artifactPath: artifactPath || undefined,
        contactSheetPath: contactSheetPath || undefined,
        gateRevisions: gateRevisions as any,
        requiredRevisions: requiredRevisions || "No revision notes recorded.",
        nextAssetNeeded: nextAssetNeeded || undefined,
        notes: notes || undefined,
      };
      if (routeId) payload.routeId = routeId;
      await saveReview(payload);
      setPassNo(String((Number(passNo) || 0) + 1));
      setGates(defaultReviewGates());
      setProof(defaultReviewProof());
      setGateRevisions(defaultGateRevisions());
      setArtifactPath("");
      setContactSheetPath("");
      setDecision("pending");
      setRequiredRevisions("");
      setNextAssetNeeded("");
      setNotes("");
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  };

  return (
    <section className="surface review-loop">
      <h3>Review loop</h3>
      {latest ? (
        <div className="review-latest">
          <div className="toolbar-line">
            <span className={`pill review-${reviewTone(latest)}`}>pass {latest.passNo}</span>
            <span className="pill">{pretty(latest.decision)}</span>
          </div>
          <div className="review-gate-grid">
            {REVIEW_GATES.map(([id, label]) => (
              <span key={id} className={`review-status review-${latest.gates?.[id] ?? "pending"}`}>
                {label}: {pretty(latest.gates?.[id] ?? "pending")}
              </span>
            ))}
          </div>
          {latest.proof && (
            <div className="proof-list">
              {REVIEW_PROOF_FIELDS.map(([id, label]) => latest.proof?.[id] && (
                <div key={id}>
                  <strong>{label}</strong>
                  <p>{latest.proof[id]}</p>
                </div>
              ))}
            </div>
          )}
          {latest.gateRevisions && (
            <GateFixList gates={latest.gates} revisions={latest.gateRevisions} />
          )}
          {(latest.artifactPath || latest.contactSheetPath) && (
            <div className="review-artifacts">
              {latest.artifactPath && <PathPill label="Artifact" path={latest.artifactPath} />}
              {latest.contactSheetPath && <PathPill label="Contact sheet" path={latest.contactSheetPath} />}
            </div>
          )}
          <p>{latest.requiredRevisions}</p>
          {latest.nextAssetNeeded && <p className="muted">Next asset: {latest.nextAssetNeeded}</p>}
        </div>
      ) : (
        <p className="muted">No review pass yet for this route. Tier 2+ posts must be looped before Gate 2 approval.</p>
      )}
      {routeReviews.length > 1 && (
        <div className="review-history">
          <h4>Pass history</h4>
          {routeReviews.map((review) => {
            const blockers = reviewMissingItems(review);
            return (
              <details key={review._id} className={`review-pass review-${reviewTone(review)}`}>
                <summary>
                  <span>Pass {review.passNo}</span>
                  <span>{pretty(review.decision)}</span>
                  {review.updatedAt && <span>{shortDate(review.updatedAt)}</span>}
                </summary>
                <div className="review-pass-body">
                  {blockers.length === 0 ? (
                    <p className="review-ready-line">Ready: all gates, proof, artifact, and stills are present.</p>
                  ) : (
                    <ul>
                      {blockers.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  )}
                  <p>{review.requiredRevisions}</p>
                  {review.gateRevisions && <GateFixList gates={review.gates} revisions={review.gateRevisions} />}
                  {review.nextAssetNeeded && <p className="muted">Next asset: {review.nextAssetNeeded}</p>}
                  {(review.artifactPath || review.contactSheetPath) && (
                    <div className="review-artifacts">
                      {review.artifactPath && <PathPill label="Artifact" path={review.artifactPath} />}
                      {review.contactSheetPath && <PathPill label="Contact sheet" path={review.contactSheetPath} />}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      <div className="review-form">
        <label>Pass<input type="number" min={1} value={passNo} onChange={(e) => setPassNo(e.target.value)} /></label>
        {REVIEW_GATES.map(([id, label]) => (
          <label key={id}>{label}
            <select value={gates[id]} onChange={(e) => updateGate(id, e.target.value)}>
              {REVIEW_STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
        ))}
        <label>Decision
          <select value={decision} onChange={(e) => setDecision(e.target.value as any)}>
            {REVIEW_DECISIONS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        {openGateIds.length > 0 && (
          <div className="gate-fixes">
            <h4>Gate fixes</h4>
            <p className="muted">Each amber/red gate needs its own specific fix before this pass can be saved.</p>
            {REVIEW_GATES.filter(([id]) => openGateIds.includes(id)).map(([id, label]) => (
              <label key={id}>{label}
                <textarea
                  value={gateRevisions[id]}
                  onChange={(e) => updateGateRevision(id, e.target.value)}
                  placeholder={`Concrete fix for ${label.toLowerCase()}`}
                />
              </label>
            ))}
          </div>
        )}
        <div className="proof-pack">
          <h4>Proof pack</h4>
          <p className="muted">Required for a ready pass. Use concrete evidence from the artifact, rendered stills, or review notes.</p>
          <label>Rendered artifact path
            <input value={artifactPath} onChange={(e) => setArtifactPath(e.target.value)} placeholder="/media-vault/.../final.mp4 or reviewed output path" />
          </label>
          <label>Contact sheet or stills path
            <input value={contactSheetPath} onChange={(e) => setContactSheetPath(e.target.value)} placeholder="/media-vault/.../review-contact.jpg or stills folder" />
          </label>
          {REVIEW_PROOF_FIELDS.map(([id, label, placeholder]) => (
            <label key={id}>{label}
              <textarea value={proof[id]} onChange={(e) => updateProof(id, e.target.value)} placeholder={placeholder} />
            </label>
          ))}
        </div>
        <label className="review-wide">Required revisions<textarea value={requiredRevisions} onChange={(e) => setRequiredRevisions(e.target.value)} placeholder="Specific fix for the open gate. Example: Replace generic app demo with 6-10s menopause claim check recording, then rerender and review frames 16-27s." /></label>
        <label className="review-wide">Next asset needed<input value={nextAssetNeeded} onChange={(e) => setNextAssetNeeded(e.target.value)} placeholder="One asset only, if needed" /></label>
        <p className="review-form-note">Saving a next asset creates a Liz-owned Needs me request for this story route.</p>
        <label className="review-wide">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional review context" /></label>
      </div>
      {readyBlockedReason && <p className="warning">{readyBlockedReason}</p>}
      {revisionBlockedReason && <p className="warning">{revisionBlockedReason}</p>}
      {routeBlockedReason && <p className="warning">{routeBlockedReason}</p>}
      {err && <p className="error">{err}</p>}
      <button className="primary wide" disabled={Boolean(routeBlockedReason)} onClick={save}>Save review pass</button>
    </section>
  );
}

function PathPill({ label, path }: { label: string; path: string }) {
  const href = mediaUrl(path) || (/^https?:\/\//i.test(path) ? path : "");
  return href ? (
    <a className="path-pill" href={href} target="_blank" rel="noreferrer">{label}</a>
  ) : (
    <span className="path-pill" title={path}>{label}: {path}</span>
  );
}

function GateFixList({ gates, revisions }: { gates: Record<string, string>; revisions: Record<string, string> }) {
  const fixes = REVIEW_GATES
    .filter(([id]) => (gates?.[id] === "amber" || gates?.[id] === "red") && revisions?.[id])
    .map(([id, label]) => ({ id, label, text: revisions[id] }));
  if (fixes.length === 0) return null;
  return (
    <div className="gate-fix-list">
      {fixes.map((fix) => (
        <div key={fix.id}>
          <strong>{fix.label}</strong>
          <p>{fix.text}</p>
        </div>
      ))}
    </div>
  );
}

function PostPreview({ story, route, script, draft, master, images }: any) {
  const caption = draft?.caption ?? script?.sections?.map((s: any) => s.text).join(" ") ?? story.summary ?? "";
  const hero = master ?? images?.[0];
  return (
    <section className="composer">
      <div className="composer-copy">
        <div className="toolbar-line">
          <span>{pretty(route?.postType ?? story.format)}</span>
          {route?.tier && <span>tier {route.tier}</span>}
          <span>{pretty(route?.assetStrategy ?? "route pending")}</span>
        </div>
        <h3>{route?.title ?? "Post route pending"}</h3>
        <p>{route?.angle ?? story.angle ?? story.summary}</p>
        {draft?.coverText && <div className="cover-text">{draft.coverText}</div>}
        <textarea readOnly value={caption} />
        {draft?.hashtags?.length > 0 && <div className="hashtag-row">{draft.hashtags.map((h: string) => <span key={h}>{h}</span>)}</div>}
      </div>
      <div className="phone-preview">
        <div className="phone-top">{pretty(story.platform)} preview</div>
        <div className="phone-media">
          {hero?.kind === "master" ? (
            <video src={mediaUrl(hero.filePath)} muted playsInline />
          ) : hero?.filePath ? (
            <img src={mediaUrl(hero.filePath)} alt="" />
          ) : (
            <div className="preview-empty">{pretty(route?.visualTreatment ?? "No visual selected")}</div>
          )}
        </div>
        <div className="phone-caption">{caption.slice(0, 180)}</div>
      </div>
    </section>
  );
}

function BriefPanel({ brief, story }: any) {
  return (
    <section className="surface">
      <h3>Creative brief</h3>
      <p>{brief?.researchSummary ?? story.summary ?? "No creative brief yet."}</p>
      {brief?.audienceLanguage?.length > 0 && (
        <div className="quote-list">
          {brief.audienceLanguage.slice(0, 4).map((q: string) => <span key={q}>{q}</span>)}
        </div>
      )}
    </section>
  );
}

function RoutePanel({ storyId, routes, selectedRoute, onSelect }: any) {
  return (
    <section className="surface">
      <h3>Format routes</h3>
      {routes.length === 0 && <p className="muted">No route options saved yet. New story-desk cards will include them.</p>}
      {routes.map((route: any) => {
        const insight = appResolverInsight(route);
        return (
          <button key={route._id} className={`route ${route.selected ? "selected" : ""} ${insight ? "app-resolver-route" : ""}`} onClick={() => onSelect(route._id)}>
            <div>
              <strong>{route.title}</strong>
              <span>{pretty(route.platform)} / {pretty(route.format)}</span>
            </div>
            <p>{route.postType} - {route.rationale}</p>
            {insight && (
              <div className="route-intel">
                <div className="route-intel-head">
                  <span>{insight.title}</span>
                  <small>{insight.spine}</small>
                </div>
                <p>{insight.appJob}</p>
                <div className="route-signal-row">
                  {insight.signals.map((signal) => <span key={signal}>{signal}</span>)}
                </div>
                <em>{insight.assetRule}</em>
              </div>
            )}
            <div className="obligations">
              {route.tier && <span className="pill">tier {route.tier}</span>}
              {insight && <span className="pill app-route">app resolver</span>}
              <span className="pill">effort {route.effort}</span>
              <span className={`pill risk-${route.risk}`}>{route.risk}</span>
              <span className="pill">{pretty(route.assetStrategy)}</span>
            </div>
          </button>
        );
      })}
      {storyId && selectedRoute && <p className="muted">Selected route drives the writers' room and design studio.</p>}
    </section>
  );
}

const assetOwnerChip = (req: any): { text: string; tone: string } => {
  if (req.kind === "voice") return { text: "🎙️ You record (CapCut)", tone: "you" };
  if (req.owner === "agent") return { text: "🤖 App makes this", tone: "agent" };
  if (req.kind === "screenshot") return req.canAgentAttempt
    ? { text: "📸 App can try, else you", tone: "maybe" }
    : { text: "📸 You grab", tone: "you" };
  return { text: "🙋 You", tone: "you" };
};

function AssetRequestPanel({ requests, attachFiles, updateAsset }: any) {
  const open = requests.filter((r: any) => r.status !== "waived");
  const youCount = open.filter((r: any) => r.owner === "liz").length;
  const agentCount = open.filter((r: any) => r.owner === "agent").length;
  return (
    <section className="surface">
      <h3>Assets</h3>
      {open.length === 0 && <p className="muted">No explicit asset requests.</p>}
      {open.length > 0 && <p className="muted">{youCount} from you · {agentCount} the app makes</p>}
      {open.map((req: any) => {
        const chip = assetOwnerChip(req);
        return (
          <div key={req._id} className="asset-row">
            <div>
              <strong>{req.label}</strong>
              <div className="asset-tags">
                <span className={`pill asset-who-${chip.tone}`}>{chip.text}</span>
                <span className="pill">{pretty(req.status)}</span>
              </div>
              <p>{req.instructions}</p>
              {req.sourceUrl && <a href={req.sourceUrl} target="_blank" rel="noreferrer">Source page ↗</a>}
              {req.filePath && <a href={mediaUrl(req.filePath)} target="_blank" rel="noreferrer">Open file</a>}
            </div>
            <div className="asset-actions">
              {req.owner === "liz" && (
                <label className="mini-button">
                  Attach
                  <input type="file" style={{ display: "none" }} onChange={(e: any) => { attachFiles(req._id, e.target.files); e.target.value = ""; }} />
                </label>
              )}
              {req.status === "needed" && <button className="mini-button" onClick={() => updateAsset({ requestId: req._id, status: "waived" })}>Waive</button>}
              {req.status === "supplied" && <button className="mini-button" onClick={() => updateAsset({ requestId: req._id, status: "selected" })}>Use</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ManifestPanel({ runs, estTotal }: { runs: any[]; estTotal: number }) {
  const planned = runs.filter((r) => r.status !== "failed");
  if (planned.length === 0) return null;
  return (
    <section className="surface">
      <h3>Generation manifest</h3>
      <table>
        <tbody>
          {planned.map((r) => (
            <tr key={r._id}>
              <td>{r.lane}</td>
              <td>{r.model}</td>
              <td>x{r.count}</td>
              <td>${r.estCostUsd.toFixed(2)}</td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={3}>Estimated</td>
            <td>${estTotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function ApprovalPanel({ story, estTotal, note, setNote, selectedRoute, latestReview, assetRequests, approve, redo, kill }: any) {
  if (story.status !== "gate1" && story.status !== "gate2") return null;
  const needsReview = story.status === "gate2" && routeNeedsReview(selectedRoute);
  const outstandingRequiredAssets = story.status === "gate2"
    ? (assetRequests ?? []).filter((request: any) => {
      const appliesToActiveScope = !request.routeId || (selectedRoute && request.routeId === selectedRoute._id);
      return appliesToActiveScope &&
        request.required &&
        (request.status === "needed" || request.status === "generating");
    })
    : [];
  const reviewMissing = needsReview ? reviewMissingItems(latestReview) : [];
  const readyReview = reviewIsReady(latestReview);
  const assetMissing = outstandingRequiredAssets.map((request: any) => `Required asset open: ${request.label}`);
  const approveBlocked = (needsReview && !readyReview) || assetMissing.length > 0;
  const blockers = [...assetMissing, ...(needsReview ? reviewMissing : [])];
  return (
    <section className="surface decision">
      <h3>{story.status === "gate1" ? "Gate 1" : "Gate 2"}</h3>
      {story.status === "gate2" && (
        <div className={`review-gate-note ${approveBlocked ? "blocked" : "ready"}`}>
          {approveBlocked
            ? "Gate 2 approval is blocked until these items are resolved."
            : needsReview
              ? "Review loop ready: every gate is green and proof-backed."
              : "Fast route: review loop is optional before approval."}
          {approveBlocked && (
            <ul className="review-blockers">
              {blockers.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </div>
      )}
      <textarea placeholder="Note for redo or context" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="actions">
        <button className="primary" disabled={approveBlocked} onClick={approve}>
          Approve{story.status === "gate1" && estTotal > 0 ? ` $${estTotal.toFixed(2)}` : ""}
        </button>
        <button onClick={redo}>Redo</button>
        <button className="danger" onClick={kill}>Kill</button>
      </div>
    </section>
  );
}

function StoryActions({ story, hasSelectedRoute, toAngle, toDraft, kill, markPosted }: any) {
  if (story.status === "idea") {
    return (
      <section className="surface">
        <h3>Commission</h3>
        <div className="actions">
          <button className="primary" disabled={!hasSelectedRoute} onClick={toAngle}>To angle room</button>
          <button disabled={!hasSelectedRoute} onClick={toDraft}>Straight to draft</button>
          <button className="danger" onClick={kill}>Spike</button>
        </div>
      </section>
    );
  }
  if (story.status === "ready_to_post") {
    return (
      <section className="surface">
        <h3>Manual post</h3>
        <p className="muted">Post from the Telegram package or media vault, then mark it live here.</p>
        <button className="primary wide" onClick={markPosted}>Mark posted</button>
      </section>
    );
  }
  return null;
}

function ScriptPanel({ script }: { script: any }) {
  const over = script.targetRuntimeSec > 0 && script.estRuntimeSec > script.targetRuntimeSec;
  return (
    <section className="surface">
      <h3>Script v{script.version}</h3>
      <div className="runtime">
        <span>{script.totalWords}w / {script.estRuntimeSec.toFixed(0)}s target {script.targetRuntimeSec}s</span>
        <div className="bar"><i className={over ? "over" : ""} style={{ width: `${Math.min(100, (script.estRuntimeSec / Math.max(1, script.targetRuntimeSec)) * 100)}%` }} /></div>
      </div>
      {script.sections.map((s: any, i: number) => (
        <div className="section-row" key={i}>
          <span>{s.kind} / {s.wordCount}w</span>
          <p>{s.text}</p>
          {s.visualNote && <em>{s.visualNote}</em>}
        </div>
      ))}
      {script.voiceNotes && <p className="note-block">{script.voiceNotes}</p>}
      {script.legalNotes && <p className="note-block">{script.legalNotes}</p>}
    </section>
  );
}

function ImageGrid({ images }: { images: any[] }) {
  return (
    <section className="surface">
      <h3>Selected visuals</h3>
      <div className="image-grid">
        {images
          .slice()
          .sort((a, b) => (noteFor(a).sectionIndex ?? 0) - (noteFor(b).sectionIndex ?? 0))
          .map((a) => (
            <a key={a._id} href={mediaUrl(a.filePath)} target="_blank" rel="noreferrer" title={noteFor(a).prompt ?? ""}>
              <img src={mediaUrl(a.filePath)} alt={noteFor(a).prompt ?? "visual"} />
            </a>
          ))}
      </div>
    </section>
  );
}

function ClaimsPanel({ claims }: { claims: any[] }) {
  if (claims.length === 0) return null;
  return (
    <section className="surface">
      <h3>Claims ledger</h3>
      {claims.map((c) => (
        <div className="claim" key={c._id}>
          <span className={`pill ${c.classification}`}>{c.classification}</span>
          <p>{c.text}</p>
          {c.citation && <small>{c.citation}</small>}
        </div>
      ))}
    </section>
  );
}

function Pipeline({ selected, setSelected }: { selected: Id<"stories"> | null; setSelected: (id: Id<"stories">) => void }) {
  const stories = useQuery(api.pipeline.board) ?? [];
  return (
    <div className="pipeline-wrap">
      <div className="pipeline-board">
        {PIPELINE_COLUMNS.map((col) => {
          const items = (stories as any[]).filter((s) => col.statuses.includes(s.status));
          return (
            <div className="pipeline-col" key={col.title}>
              <h2>{col.title} <span>{items.length}</span></h2>
              {items.map((s) => (
                <button key={s._id} className={`pipeline-card ${selected === s._id ? "selected" : ""}`} onClick={() => setSelected(s._id)}>
                  <strong>{s.title}</strong>
                  <span>{pretty(s.platform)} / {pretty(s.format)}</span>
                </button>
              ))}
              {items.length === 0 && <div className="empty-state compact">-</div>}
            </div>
          );
        })}
      </div>
      <StoryStudio storyId={selected} />
    </div>
  );
}

function Wire({ onOpen }: { onOpen: (id: Id<"stories">) => void }) {
  const events = useQuery(api.events.recent, { limit: 80 }) ?? [];
  return (
    <section className="wire">
      <div className="wire-head">
        <h2>Newsroom wire</h2>
        <p className="muted">Live activity from the desks — newest first. Click a line to open its post.</p>
      </div>
      {events.length === 0 && <p className="muted">No activity yet. As the desks work, it shows up here in real time.</p>}
      <ul className="wire-list">
        {events.map((e: any) => (
          <li key={e._id} className={`wire-row ${e.level === "warn" ? "wire-warn" : ""} ${e.level === "error" ? "wire-error" : ""}`}>
            <span className="wire-time">{fmtTime(e.createdAt)}</span>
            <span className={`wire-kind wire-kind-${e.kind}`}>{e.kind}</span>
            <button className="wire-msg" disabled={!e.storyId} onClick={() => e.storyId && onOpen(e.storyId)}>
              {e.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StoryActivity({ storyId }: { storyId: Id<"stories"> }) {
  const events = useQuery(api.events.recent, { storyId, limit: 25 }) ?? [];
  if (events.length === 0) return null;
  return (
    <section className="surface">
      <h3>Activity</h3>
      <ul className="story-activity">
        {events.map((e: any) => (
          <li key={e._id} className={e.level === "warn" || e.level === "error" ? "wire-warn" : ""}>
            <span className="wire-time">{fmtTime(e.createdAt)}</span> {e.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AngleRoom({ storyId, selectedRoute }: { storyId: Id<"stories">; selectedRoute?: any }) {
  const thread = useQuery(api.design.angleThread, { storyId });
  const addMessage = useMutation(api.design.addAngleMessage);
  const lockAngle = useMutation(api.design.lockAngle);

  const [draft, setDraft] = useState("");
  const [angle, setAngle] = useState("");
  const [sending, setSending] = useState(false);

  if (!thread) return null;

  const last = thread[thread.length - 1];
  const deskThinking = Boolean(last && last.role === "liz");

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await addMessage({ storyId, role: "liz", text });
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  const lock = async () => {
    const spine = angle.trim();
    if (!spine) return;
    await lockAngle({ storyId, angle: spine });
  };

  return (
    <section className="surface angle-room">
      <h3>Angle room</h3>
      <p className="muted">
        Agree the angle and concept with the sparring-partner desk before anything drafts.
        When you have converged, type the agreed spine below and lock it — that releases the
        writers' room. Assets and prompts come later, in the design studio.
      </p>

      <div className="angle-thread">
        {thread.length === 0 && (
          <p className="muted">No messages yet. Open with the angle you are leaning toward and the desk will push back.</p>
        )}
        {thread.map((m: any) => (
          <div key={m._id} className={`angle-msg angle-${m.role}`}>
            <span className="angle-who">{m.role === "liz" ? "You" : "Desk"}</span>
            <p>{m.text}</p>
          </div>
        ))}
        {deskThinking && <div className="angle-msg angle-desk angle-pending"><span className="angle-who">Desk</span><p className="muted">thinking…</p></div>}
      </div>

      <div className="angle-compose">
        <textarea
          value={draft}
          placeholder="Make your case to the desk…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }}
        />
        <button className="primary" disabled={!draft.trim() || sending} onClick={send}>
          {sending ? "Sending" : "Send"}
        </button>
      </div>

      <div className="angle-lock">
        <h4>Lock the agreed angle + concept</h4>
        <p className="muted">One or two sentences — the editorial spine the writers' room drafts from.</p>
        <textarea
          value={angle}
          placeholder={selectedRoute?.angle ?? "The agreed spine for this post…"}
          onChange={(e) => setAngle(e.target.value)}
        />
        <button className="secondary wide" disabled={!angle.trim()} onClick={lock}>Lock angle → writers' room</button>
      </div>
    </section>
  );
}

function DesignStudio({ storyId }: { storyId: Id<"stories"> }) {
  const board = useQuery(api.design.board, { storyId });
  const story = useQuery(api.pipeline.storyDetail, { storyId });
  const updatePrompt = useMutation(api.design.updatePrompt);
  const selectCandidate = useMutation(api.design.selectCandidate);
  const queueGen = useMutation(api.design.queueGen);
  const addCandidate = useMutation(api.design.addCandidate);
  const sendToAssembly = useMutation(api.design.sendToAssembly);
  const queuePromptRewrite = useMutation(api.design.queuePromptRewrite);

  const [gen, setGen] = useState({ provider: "higgsfield", model: "gpt_image_2", count: 2, aspect: "9:16", quality: "high" });
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const attachFiles = async (slideId: Id<"designSlides">, files: FileList | null) => {
    const slug = (story as any)?.story?.slug;
    if (!files || !slug) return;
    for (const file of Array.from(files)) {
      const res = await fetch(`/media-upload?slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
      const { path } = await res.json();
      await addCandidate({ storyId, slideId, filePath: path, note: `attached: ${file.name}` });
    }
  };

  if (!board) return null;
  const { slides, candidates, requests } = board as any;
  const rewriting = Boolean((story as any)?.story?.promptsRewriteAt);
  const storyFormat = (story as any)?.story?.format ?? "";
  const carousel = isCarouselFormat(storyFormat);
  const slideCands = (id: string) => candidates.filter((c: any) => c.slideId === id);
  const mockups = candidates.filter((c: any) => c.kind === "mockup");
  const busy = (id?: string) => requests.some((r: any) => (id ? r.slideId === id : r.kind === "mockup") && ["queued", "running"].includes(r.status));
  const lastFail = (id?: string) => requests.filter((r: any) => (id ? r.slideId === id : r.kind === "mockup") && r.status === "failed").slice(-1)[0];
  const allPicked = slides.length > 0 && (carousel || slides.every((s: any) => s.selectedCandidateId));
  const fire = (slide: any | null, prompt: string) =>
    queueGen({
      storyId,
      slideId: slide?._id,
      kind: slide ? "slide" : "mockup",
      provider: gen.provider,
      model: gen.model,
      count: slide ? Number(gen.count) : 1,
      aspect: slide ? gen.aspect : "16:9",
      quality: gen.quality,
      prompt,
    });
  const rebuildPrompt = async (slide: any) => {
    const nextPrompt = buildImagePrompt(slide, gen.aspect);
    setPrompts((current) => ({ ...current, [slide._id]: nextPrompt }));
    await updatePrompt({ slideId: slide._id, prompt: nextPrompt });
  };
  const rebuildAllPrompts = async () => {
    const nextPrompts: Record<string, string> = {};
    for (const slide of slides) {
      const nextPrompt = buildImagePrompt(slide, gen.aspect);
      nextPrompts[slide._id] = nextPrompt;
      await updatePrompt({ slideId: slide._id, prompt: nextPrompt });
    }
    setPrompts((current) => ({ ...current, ...nextPrompts }));
  };

  return (
    <section className="surface design-surface">
      <h3>Design studio</h3>
      <div className="control-grid">
        <label>Provider<select value={gen.provider} onChange={(e) => {
          const provider = e.target.value;
          setGen({ ...gen, provider, model: PROVIDER_MODELS[provider][0] });
        }}>{Object.keys(PROVIDER_MODELS).map((p) => <option key={p}>{p}</option>)}</select></label>
        <label>Model<select value={gen.model} onChange={(e) => setGen({ ...gen, model: e.target.value })}>{PROVIDER_MODELS[gen.provider].map((m) => <option key={m}>{m}</option>)}</select></label>
        <label>Count<input type="number" min={1} max={4} value={gen.count} onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })} /></label>
        <label>Aspect<select value={gen.aspect} onChange={(e) => setGen({ ...gen, aspect: e.target.value })}>{["9:16", "4:5", "1:1", "16:9"].map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>Quality<select value={gen.quality} onChange={(e) => setGen({ ...gen, quality: e.target.value })}>{["high", "medium", "low"].map((q) => <option key={q}>{q}</option>)}</select></label>
      </div>
      <button className="primary wide" disabled={slides.length === 0 || rewriting} onClick={() => queuePromptRewrite({ storyId })}>
        {rewriting ? "Art director rewriting prompts…" : "Rewrite prompts with the art director"}
      </button>
      <button className="secondary wide" disabled={slides.length === 0} onClick={rebuildAllPrompts}>
        Quick rebuild (offline template)
      </button>
      <button className="secondary wide" disabled={busy()} onClick={() => fire(null, [
        `16:9 internal storyboard contact sheet for a De-Influenced social post, ${slides.length} panels in a clean grid.`,
        "Each panel is a distinct editorial background plate concept with strong focal composition, clear negative space for later text overlays, and no finished typography.",
        `Panel briefs: ${slides.map((s: any, i: number) => `panel ${i + 1}: ${cleanVisualBrief(s.visualNote ?? s.voLine)}`).join("; ")}.`,
        "Use restrained documentary product-research style, realistic lighting, no readable text, no numbers, no logos, no fake screenshots, no brand names.",
      ].join(" "))}>
        {busy() ? "Mockup generating" : "Storyboard mockup"}
      </button>
      {lastFail() && <p className="error">mockup failed: {lastFail().error}</p>}
      {mockups.length > 0 && <div className="mockup-grid">{mockups.map((c: any) => <a key={c._id} href={mediaUrl(c.filePath)} target="_blank" rel="noreferrer"><img src={mediaUrl(c.filePath)} alt="" /></a>)}</div>}
      {slides.length === 0 && <p className="muted">Seeding storyboard from approved script.</p>}
      {slides.map((s: any) => {
        const cands = slideCands(s._id);
        const fail = lastFail(s._id);
        return (
          <div className="slide-row" key={s._id}>
            <div className="slide-label">{s.order + 1} / {s.kind}</div>
            <p>{s.voLine}</p>
            <textarea value={prompts[s._id] ?? s.prompt} onChange={(e) => setPrompts({ ...prompts, [s._id]: e.target.value })} onBlur={(e) => {
              if (e.target.value !== s.prompt) updatePrompt({ slideId: s._id, prompt: e.target.value });
            }} />
            <div className="actions">
              <button className="primary" disabled={busy(s._id)} onClick={() => fire(s, prompts[s._id] ?? s.prompt)}>
                {busy(s._id) ? "Generating" : `Generate x${gen.count}`}
              </button>
              <button className="secondary" onClick={() => rebuildPrompt(s)}>Rebuild prompt</button>
              <label className="secondary">
                Attach
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e: any) => { attachFiles(s._id, e.target.files); e.target.value = ""; }} />
              </label>
              {s.selectedCandidateId && <button onClick={() => selectCandidate({ slideId: s._id, candidateId: undefined })}>Clear pick</button>}
            </div>
            {fail && <p className="error">failed: {fail.error}</p>}
            {cands.length > 0 && (
              <div className="candidate-grid">
                {cands.map((c: any) => (
                  <button key={c._id} className={s.selectedCandidateId === c._id ? "picked" : ""} onClick={() => selectCandidate({ slideId: s._id, candidateId: c._id })}>
                    <img src={mediaUrl(c.filePath)} alt={c.prompt ?? ""} />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {err && <p className="error">{err}</p>}
      <button className="primary wide" disabled={!allPicked} onClick={async () => {
        try {
          setErr("");
          await sendToAssembly({ storyId });
        } catch (e: any) {
          setErr(e.message ?? String(e));
        }
      }}>
        {allPicked ? (carousel ? "Render carousel deck" : "Send to assembly") : "Pick a visual for every row"}
      </button>
    </section>
  );
}

function AssetInbox({ setSelected }: { setSelected: (id: Id<"stories">) => void }) {
  const requests = useQuery(api.design.assetInbox) ?? [];
  const queue = useQuery(api.production.recordingQueue) ?? [];
  const updateAsset = useMutation(api.design.updateAssetRequest);

  const attachFiles = async (req: any, files: FileList | null) => {
    if (!files?.length || !req.story?.slug) return;
    const file = files[0];
    const res = await fetch(`/media-upload?slug=${encodeURIComponent(req.story.slug)}&name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
    const { path } = await res.json();
    await updateAsset({ requestId: req._id, filePath: path, status: "supplied" });
  };

  return (
    <div className="page">
      <h1>Needs me</h1>
      <p className="page-kicker">Screenshots, references, recordings, and other human-owned production inputs.</p>
      <div className="need-grid">
        {(requests as any[]).map((req) => (
          <div className="need-card" key={req._id}>
            <button className="linklike" onClick={() => setSelected(req.storyId)}>{req.story?.title ?? "Story"}</button>
            <strong>{req.label}</strong>
            <span>{pretty(req.kind)} / {pretty(req.status)}</span>
            <p>{req.instructions}</p>
            <div className="actions">
              <label className="secondary">
                Attach
                <input type="file" style={{ display: "none" }} onChange={(e: any) => { attachFiles(req, e.target.files); e.target.value = ""; }} />
              </label>
              <button onClick={() => updateAsset({ requestId: req._id, status: "waived" })}>Waive</button>
            </div>
          </div>
        ))}
        {(queue as any[]).map((r) => (
          <div className="need-card" key={r._id}>
            <button className="linklike" onClick={() => setSelected(r.storyId)}>{r.storyTitle}</button>
            <strong>{r.kind === "vo" ? "Voiceover recording" : "Intro recording"}</strong>
            <span>recordings-inbox</span>
            <p>{r.brief}</p>
          </div>
        ))}
      </div>
      {(requests as any[]).length === 0 && (queue as any[]).length === 0 && <div className="empty-state">Nothing owed right now.</div>}
    </div>
  );
}

function MetricsForm({ storyId, metrics }: { storyId: Id<"stories">; metrics?: any }) {
  const setMetrics = useMutation(api.pipeline.setMetrics);
  const [m, setM] = useState<any>(() => {
    const init: any = { notes: metrics?.notes ?? "" };
    for (const k of METRIC_KEYS) init[k] = metrics?.[k] ?? 0;
    return init;
  });
  return (
    <section className="surface">
      <h3>Numbers</h3>
      <div className="metric-grid">
        {METRIC_KEYS.map((k) => (
          <label key={k}>{k}<input type="number" value={m[k]} onChange={(e) => setM({ ...m, [k]: Number(e.target.value) })} /></label>
        ))}
      </div>
      <label>Notes<input value={m.notes} onChange={(e) => setM({ ...m, notes: e.target.value })} /></label>
      <button className="primary wide" onClick={() => {
        const { notes, ...nums } = m;
        setMetrics({ storyId, metrics: { ...nums, notes: notes || undefined } });
      }}>Save numbers</button>
    </section>
  );
}

function Memos() {
  const memos = useQuery(api.pipeline.memosList) ?? [];
  return (
    <div className="page">
      <h1>Monday memos</h1>
      <p className="page-kicker">Run <code>npm run memo</code> after adding numbers to posted stories.</p>
      {(memos as any[]).length === 0 && <div className="empty-state">No memos yet.</div>}
      {(memos as any[]).map((m) => (
        <div className="doccard" key={m._id}>
          <strong>{m.week}</strong>
          <p>{m.body}</p>
        </div>
      ))}
    </div>
  );
}

function TipLine() {
  const tips = useQuery(api.pipeline.tipsList) ?? [];
  const addTip = useMutation(api.pipeline.addTip);
  const [kind, setKind] = useState<any>("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [noteText, setNoteText] = useState("");

  return (
    <div className="page">
      <h1>Tip line</h1>
      <div className="form-grid">
        <label>Kind<select value={kind} onChange={(e) => setKind(e.target.value)}>{["url", "reddit", "ruling", "pdf", "screenshot", "note"].map((k) => <option key={k}>{k}</option>)}</select></label>
        <label>URL or file path<input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https:// or /Users/lizw/..." /></label>
      </div>
      <label>Raw text<textarea value={rawText} onChange={(e) => setRawText(e.target.value)} /></label>
      <label>Note to desk<input value={noteText} onChange={(e) => setNoteText(e.target.value)} /></label>
      <button className="primary" onClick={() => {
        const isPath = sourceUrl.startsWith("/");
        addTip({ kind, sourceUrl: !isPath && sourceUrl ? sourceUrl : undefined, filePath: isPath ? sourceUrl : undefined, rawText: rawText || undefined, note: noteText || undefined });
        setSourceUrl("");
        setRawText("");
        setNoteText("");
      }}>File tip</button>
      <h2>Recent tips</h2>
      {(tips as any[]).map((t) => (
        <div className="doccard" key={t._id}>
          <span className="pill">{t.kind}</span> <span className="pill">{t.status}</span>
          {t.sourceGrade && <span className="pill">grade {t.sourceGrade}</span>}
          <p>{t.sourceUrl ?? t.filePath ?? (t.rawText ?? "").slice(0, 140)}</p>
        </div>
      ))}
    </div>
  );
}

function RecordingDesk() {
  const queue = useQuery(api.production.recordingQueue) ?? [];
  return (
    <div className="page">
      <h1>Recording desk</h1>
      <p className="page-kicker">Drop finished files into <code>recordings-inbox/</code> named <code>[story-slug].[vo|intro].wav</code>.</p>
      {(queue as any[]).length === 0 && <div className="empty-state">Nothing owed.</div>}
      {(queue as any[]).map((r) => (
        <div className="doccard" key={r._id}>
          <span className="pill">{r.kind}</span> <strong>{r.storyTitle}</strong>
          <p>{r.brief}</p>
        </div>
      ))}
    </div>
  );
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function Brain() {
  const docs = useQuery(api.brain.docs) ?? [];
  const saveDoc = useMutation(api.brain.saveDoc);
  const deleteDoc = useMutation(api.brain.deleteDoc);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<any>("voice");
  const [body, setBody] = useState("");
  const load = (d: any) => { setSlug(d.slug); setTitle(d.title); setKind(d.kind); setBody(d.body); };

  return (
    <div className="page split-page">
      <section>
        <h1>Brand brain</h1>
        {(docs as any[]).map((d) => (
          <div className="doccard clickable" key={d._id} onClick={() => load(d)}>
            <strong>{d.title}</strong> <span className="pill">{d.kind}</span> <span className="pill">v{d.version}</span>
            <button className="mini-button float" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${d.title}"?`)) deleteDoc({ slug: d.slug }); }}>Delete</button>
            <p>{d.body.slice(0, 160)}</p>
          </div>
        ))}
      </section>
      <section className="surface">
        <h2>Add or update doc</h2>
        <label>Slug<input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="voice-corpus" /></label>
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Kind<select value={kind} onChange={(e) => setKind(e.target.value)}>{["philosophy", "voice", "audience", "legal", "product", "house_style", "formats", "evidence"].map((k) => <option key={k}>{k}</option>)}</select></label>
        <label>Body<textarea className="tall" value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <button className="primary" onClick={() => {
          const s = slugify(slug || title);
          if (s && title && body) {
            saveDoc({ slug: s, title, kind, body });
            setBody("");
            setSlug("");
            setTitle("");
          }
        }}>Save to brain</button>
      </section>
    </div>
  );
}

function Settings() {
  const settings = useQuery(api.brain.allSettings) ?? {};
  const setSetting = useMutation(api.brain.setSetting);
  const seed = useMutation(api.brain.seedDefaults);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const keys = ["speech_wpm", "format_targets", "price_table", "telegram_chat_id", "telegram_thread_id", "telegram_delivery_chat_id", "telegram_delivery_thread_id"];

  return (
    <div className="page">
      <h1>Settings</h1>
      {Object.keys(settings as any).length === 0 && <button className="primary" onClick={() => seed()}>Seed defaults</button>}
      {keys.map((k) =>
        (settings as any)[k] !== undefined ? (
          <section className="surface setting" key={k}>
            <label>{k}<textarea value={drafts[k] ?? (settings as any)[k]} onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })} /></label>
            {drafts[k] !== undefined && drafts[k] !== (settings as any)[k] && <button className="primary" onClick={() => setSetting({ key: k, value: drafts[k] })}>Save</button>}
          </section>
        ) : null
      )}
    </div>
  );
}
