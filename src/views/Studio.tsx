import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  LIVE_ICON,
  METRIC_KEYS,
  STAGES,
  isCarouselFormat,
  latestCarouselImages,
  liveStatus,
  mediaUrl,
  noteFor,
  pretty,
  fmtTime,
  stageIndex,
  stageOf,
} from "../lib";
import DesignStage from "./DesignStage";
import ReviewLoop from "./ReviewLoop";

// Full-screen studio for one post. The stepper shows where it is on the journey;
// the canvas shows only the workspace that stage needs; everything else lives in
// the slim rail on the right.
export default function Studio({ storyId, onBack }: { storyId: Id<"stories">; onBack: () => void }) {
  const data = useQuery(api.design.creativeWorkspace, { storyId }) as any;
  const transition = useMutation(api.pipeline.transition);
  const gate = useMutation(api.pipeline.gateDecision);
  const selectRoute = useMutation(api.design.selectFormatRoute);
  const updateAsset = useMutation(api.design.updateAssetRequest);

  if (!data) return <section className="studio-page" />;

  const story = data.story;
  const live = liveStatus(story);
  const stage = stageOf(story.status);
  const idx = stageIndex(story.status);
  const routes = data.routes ?? [];
  const selectedRoute = routes.find((r: any) => r.selected);
  const script = (data.scripts ?? [])
    .filter((s: any) => s.status !== "superseded")
    .sort((a: any, b: any) => b.version - a.version)[0];
  const master = (data.assets ?? []).find((a: any) => a.kind === "master");
  const allImages = (data.assets ?? []).filter((a: any) => a.kind === "image");
  const carouselImages = latestCarouselImages(allImages);
  const images = carouselImages.length ? carouselImages : allImages;
  const estTotal = (data.runs ?? [])
    .filter((r: any) => r.status !== "failed")
    .reduce((n: number, r: any) => n + r.estCostUsd, 0);
  const postReviews = data.postReviews ?? [];

  const attachRequestFiles = async (requestId: Id<"assetRequests">, files: File[] | FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!story.slug) throw new Error("story has no slug");
    const res = await fetch(
      `/media-upload?slug=${encodeURIComponent(story.slug)}&name=${encodeURIComponent(file.name)}`,
      { method: "POST", body: file }
    );
    if (!res.ok) throw new Error(`upload failed (HTTP ${res.status})`);
    const { path } = await res.json();
    await updateAsset({ requestId, filePath: path, status: "supplied" });
  };

  const gateNo = story.status === "gate1" ? 1 : 2;
  const decide = (decision: "approve" | "redo" | "kill", note?: string) =>
    gate({ storyId, gate: gateNo, decision, note: note || undefined });

  const dead = story.status === "killed" || story.status === "parked";

  return (
    <section className="studio-page">
      <div className="studio-top">
        <button className="back-btn" onClick={onBack}>← All posts</button>
        <div className="studio-title">
          <h1>{story.title}</h1>
          <div className="meta-row">
            <span className={`pill job-${story.job}`}>{pretty(story.job)}</span>
            <span className="pill">{pretty(story.platform ?? "platform tbc")}</span>
            <span className="pill">{pretty(story.format ?? "format tbc")}</span>
          </div>
        </div>
        <span className={`live-banner state-live-${live.tone}`}>
          {LIVE_ICON[live.tone]} {live.text}
        </span>
      </div>

      {dead ? (
        <div className="studio-dead">This post is {pretty(story.status)}.</div>
      ) : (
        <div className="stepper">
          {STAGES.map((s, i) => (
            <div key={s.id} className={`step ${i < idx ? "done" : i === idx ? "now" : ""} ${i === idx ? `tone-${live.tone}` : ""}`}>
              <i>{i < idx ? "✓" : i + 1}</i>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="studio-cols">
        <div className="studio-canvas">
          {stage === "idea" && (
            <IdeaStage
              routes={routes}
              selectedRoute={selectedRoute}
              brief={data.brief}
              onSelect={(routeId: Id<"formatRoutes">) => selectRoute({ storyId, routeId })}
              toConcept={() => transition({ storyId, to: "angle" })}
              toDraft={() => transition({ storyId, to: "drafting" })}
              spike={() => transition({ storyId, to: "killed" })}
            />
          )}
          {stage === "concept" && <ConceptStage storyId={storyId} selectedRoute={selectedRoute} />}
          {stage === "copy" && (
            <CopyStage story={story} script={script} claims={data.claims ?? []} estTotal={estTotal} live={live} decide={decide} />
          )}
          {stage === "visuals" && <DesignStage storyId={storyId} data={data} />}
          {stage === "voice" && <VoiceStage story={story} recordings={data.recordings ?? []} script={script} />}
          {stage === "assembly" && <AssemblyStage storyId={storyId} live={live} images={images} master={master} />}
          {stage === "final" && (
            <FinalStage
              storyId={storyId}
              story={story}
              master={master}
              images={images}
              script={script}
              draft={data.postDraft}
              selectedRoute={selectedRoute}
              reviews={postReviews}
              assetRequests={data.assetRequests ?? []}
              decide={decide}
              fixVisuals={() => transition({ storyId, to: "design", note: "gate 2: sent back to visuals for a slide fix" })}
            />
          )}
          {stage === "ready" && (
            <ReadyStage
              story={story}
              draft={data.postDraft}
              master={master}
              images={images}
              markPosted={() => transition({ storyId, to: "posted" })}
            />
          )}
          {stage === "live" && <LiveStage storyId={storyId} story={story} draft={data.postDraft} master={master} images={images} />}
        </div>

        <aside className="studio-rail">
          <AssetsPanel
            requests={data.assetRequests ?? []}
            attachFiles={attachRequestFiles}
            updateAsset={updateAsset}
          />
          <DetailsRail
            stage={stage}
            story={story}
            brief={data.brief}
            selectedRoute={selectedRoute}
            script={script}
            claims={data.claims ?? []}
            runs={data.runs ?? []}
            estTotal={estTotal}
            storyId={storyId}
          />
        </aside>
      </div>
    </section>
  );
}

// ---- Stage: Idea — pick a concept -----------------------------------------------

function IdeaStage({ routes, selectedRoute, brief, onSelect, toConcept, toDraft, spike }: any) {
  return (
    <div className="stage">
      <header className="stage-head">
        <h2>Pick a concept</h2>
        <p>These are the ways this idea could become a post. Pick one, then commission it.</p>
      </header>
      {brief?.researchSummary && <p className="stage-brief">{brief.researchSummary}</p>}
      {routes.length === 0 && <p className="muted">No concepts yet — the story desk writes them when it files the card.</p>}
      <div className="concept-grid">
        {routes.map((route: any) => (
          <button
            key={route._id}
            className={`concept-card ${route.selected ? "selected" : ""}`}
            onClick={() => onSelect(route._id)}
          >
            <div className="concept-top">
              <strong>{route.title}</strong>
              {route.selected && <span className="pill picked-pill">✓ picked</span>}
            </div>
            <span className="concept-format">{pretty(route.platform)} · {pretty(route.format)} · {route.postType}</span>
            <p>{route.angle}</p>
            <p className="concept-why">{route.rationale}</p>
            <div className="concept-facts">
              <span>effort {route.effort}/5</span>
              <span className={`risk-${route.risk}`}>{route.risk} risk</span>
              <span>{pretty(route.assetStrategy)}</span>
            </div>
            {route.lizAssetNeeds?.length > 0 && (
              <div className="concept-needs">You'd supply: {route.lizAssetNeeds.join("; ")}</div>
            )}
          </button>
        ))}
      </div>
      <div className="stage-actions">
        <button className="primary" disabled={!selectedRoute} onClick={toConcept}>
          Commission → talk the concept through
        </button>
        <button className="secondary" disabled={!selectedRoute} onClick={toDraft}>
          Skip the chat, straight to writing
        </button>
        <button className="danger" onClick={spike}>Spike it</button>
      </div>
    </div>
  );
}

// ---- Stage: Concept — chat with the desk, lock the spine --------------------------

function ConceptStage({ storyId, selectedRoute }: { storyId: Id<"stories">; selectedRoute?: any }) {
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

  return (
    <div className="stage">
      <header className="stage-head">
        <h2>Agree the concept</h2>
        <p>Spar with the desk until the idea feels right, then lock the spine — that releases the writers' room.</p>
      </header>
      <div className="angle-thread">
        {thread.length === 0 && (
          <p className="muted">Open with the angle you're leaning toward — the desk will push back.</p>
        )}
        {thread.map((m: any) => (
          <div key={m._id} className={`angle-msg angle-${m.role}`}>
            <span className="angle-who">{m.role === "liz" ? "You" : "Desk"}</span>
            <p>{m.text}</p>
          </div>
        ))}
        {deskThinking && (
          <div className="angle-msg angle-desk angle-pending">
            <span className="angle-who">Desk</span>
            <p className="muted">thinking…</p>
          </div>
        )}
      </div>
      <div className="angle-compose">
        <textarea
          value={draft}
          placeholder="Make your case to the desk…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
        />
        <button className="primary" disabled={!draft.trim() || sending} onClick={send}>
          {sending ? "Sending" : "Send"}
        </button>
      </div>
      <div className="angle-lock">
        <h3>Lock the agreed concept</h3>
        <textarea
          value={angle}
          placeholder={selectedRoute?.angle ?? "One or two sentences — the editorial spine this post is written from."}
          onChange={(e) => setAngle(e.target.value)}
        />
        <button className="primary wide" disabled={!angle.trim()} onClick={() => lockAngle({ storyId, angle: angle.trim() })}>
          Lock it → writers' room
        </button>
      </div>
    </div>
  );
}

// ---- Stage: Copy — desks write, you approve at Gate 1 ------------------------------

function CopyStage({ story, script, claims, estTotal, live, decide }: any) {
  const atGate = story.status === "gate1";
  const carousel = isCarouselFormat(story.format ?? "");
  const beats = script?.sections?.length ?? 0;
  return (
    <div className="stage">
      <header className="stage-head">
        <h2>{atGate ? "Approve the copy" : "The desks are writing"}</h2>
        <p>
          {atGate
            ? `Read the script, check the claims, and approve the copy + the generation spend.${carousel && beats ? ` This becomes a ${beats}-slide carousel.` : ""}`
            : `${live.text}. The script lands here the moment it clears legal.`}
        </p>
      </header>
      {script ? <ScriptView script={script} /> : <p className="muted">No script yet.</p>}
      {claims.length > 0 && (
        <div className="claims-inline">
          {claims.map((c: any) => (
            <div className="claim" key={c._id}>
              <span className={`pill ${c.classification}`}>{c.classification}</span>
              <p>{c.text}</p>
              {c.citation && <small>{c.citation}</small>}
            </div>
          ))}
        </div>
      )}
      {atGate && <ApprovalBox label={`Approve copy${estTotal > 0 ? ` + $${estTotal.toFixed(2)} spend` : ""}`} decide={decide} />}
    </div>
  );
}

// ---- Stage: Voice ------------------------------------------------------------------

function VoiceStage({ story, recordings, script }: any) {
  const owed = recordings.filter((r: any) => r.status === "requested");
  const done = recordings.filter((r: any) => r.status !== "requested");
  return (
    <div className="stage">
      <header className="stage-head">
        <h2>Record your voice</h2>
        <p>
          Record, then drop the file into <code>recordings-inbox/</code> named{" "}
          <code>{story.slug}.vo.wav</code> — it gets picked up and the post moves on by itself.
        </p>
      </header>
      {owed.map((r: any) => (
        <div className="voice-card" key={r._id}>
          <span className="pill">{r.kind}</span>
          <p>{r.brief}</p>
          <p className="muted mono">recordings-inbox/{story.slug}.{r.kind}.wav</p>
        </div>
      ))}
      {owed.length === 0 && <p className="muted">Nothing owed — waiting for the inbox watcher to align what you dropped.</p>}
      {done.map((r: any) => (
        <div className="voice-card done" key={r._id}>
          <span className="pill">✓ {r.kind} {r.durationSec ? `· ${Math.round(r.durationSec)}s` : ""}</span>
        </div>
      ))}
      {script && (
        <details className="rail-acc" open>
          <summary>Script to read</summary>
          <ScriptView script={script} />
        </details>
      )}
    </div>
  );
}

// ---- Stage: Assembly ----------------------------------------------------------------

function AssemblyStage({ storyId, live, images, master }: any) {
  const events = useQuery(api.events.recent, { storyId, limit: 12 }) ?? [];
  return (
    <div className="stage">
      <header className="stage-head">
        <h2>Assembling the post</h2>
        <p>{live.text}. Voice, visuals, and captions are being cut together — nothing needed from you.</p>
      </header>
      {master && <video src={mediaUrl(master.filePath)} controls className="master" />}
      {images.length > 0 && (
        <div className="image-grid">
          {images.map((a: any) => (
            <img key={a._id} src={mediaUrl(a.filePath)} alt="" />
          ))}
        </div>
      )}
      <ul className="story-activity">
        {(events as any[]).map((e) => (
          <li key={e._id}>
            <span className="wire-time">{fmtTime(e.createdAt)}</span> {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Stage: Final check (Gate 2) ------------------------------------------------------
// Deck-first: the rendered slides ARE the review. Flick through them, fix a
// slide by hopping back to visuals, approve when it looks right. The formal
// quality pass is an optional drawer, never a blocker.

function FinalStage({ storyId, story, master, images, script, draft, selectedRoute, reviews, assetRequests, decide, fixVisuals }: any) {
  const carousel = isCarouselFormat(story.format ?? "") && images.length > 0;
  const outstandingRequiredAssets = (assetRequests ?? []).filter((request: any) => {
    const appliesToActiveScope = !request.routeId || (selectedRoute && request.routeId === selectedRoute._id);
    return appliesToActiveScope && request.required && (request.status === "needed" || request.status === "generating");
  });
  const blocked = outstandingRequiredAssets.length > 0;
  const beats = script?.sections?.length ?? 0;

  return (
    <div className="stage">
      <header className="stage-head">
        <h2>{carousel ? `Approve the final — ${images.length}-slide carousel` : "Approve the final"}</h2>
        <p>
          {carousel
            ? "This is the deck exactly as it will post. Flick through every slide, fix what's off, approve when it looks right."
            : "This is what would go out. Watch it, then make the call."}
        </p>
      </header>

      {carousel && beats > 0 && images.length !== beats && (
        <p className="warning">
          The approved script has {beats} beat{beats === 1 ? "" : "s"} but {images.length} slide{images.length === 1 ? "" : "s"} rendered — if that's not what you expect, fix it in visuals before approving.
        </p>
      )}

      {carousel ? (
        <DeckReview images={images} script={script} onFix={fixVisuals} />
      ) : (
        <div className="final-preview">
          <PhonePreview story={story} draft={draft} master={master} images={images} />
          <div className="final-side">
            <button className="secondary" onClick={fixVisuals}>← Back to visuals</button>
          </div>
        </div>
      )}

      {blocked && (
        <div className="review-gate-note blocked">
          Approval is blocked until these required assets are supplied or waived:
          <ul className="review-blockers">
            {outstandingRequiredAssets.map((request: any) => (
              <li key={request._id}>{request.label}</li>
            ))}
          </ul>
        </div>
      )}
      <ApprovalBox label="Approve final" blocked={blocked} decide={decide} />

      <ReviewLoop
        key={`${storyId}:${selectedRoute?._id ?? "no-route"}`}
        storyId={storyId}
        routeId={selectedRoute?._id}
        reviews={reviews}
        assetRequests={assetRequests}
        startOpen={false}
      />
    </div>
  );
}

// One rendered slide in focus with its beat alongside; filmstrip to jump.
function DeckReview({ images, script, onFix }: any) {
  const [idx, setIdx] = useState(0);
  const slides = images as any[];
  const current = Math.min(idx, slides.length - 1);
  const active = slides[current];
  const sectionIndex = noteFor(active)?.sectionIndex ?? current;
  const beat = script?.sections?.[sectionIndex];

  return (
    <div className="deck-review">
      <div className="deck-main">
        <a className="deck-slide" href={mediaUrl(active?.filePath)} target="_blank" rel="noreferrer">
          <img src={mediaUrl(active?.filePath)} alt={`Slide ${current + 1}`} />
        </a>
        <div className="deck-side">
          <span className="slide-label">
            Slide {current + 1} of {slides.length}
            {beat ? ` · ${pretty(beat.kind)}` : ""}
          </span>
          {beat && <p className="beat-line">{beat.text}</p>}
          <button className="secondary" onClick={onFix}>Fix this slide →</button>
          <p className="muted">
            Fix reopens the visuals stage: edit the prompt or pick a different plate, then
            "Send to assembly" re-renders the deck and brings it straight back here.
          </p>
        </div>
      </div>
      <div className="filmstrip">
        {slides.map((s: any, i: number) => (
          <button key={s._id} className={`film-cell ${i === current ? "active" : ""}`} onClick={() => setIdx(i)}>
            <img src={mediaUrl(s.filePath)} alt="" />
            <span className="film-tag">{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Stage: Ready -----------------------------------------------------------------------

function ReadyStage({ story, draft, master, images, markPosted }: any) {
  const caption = draft?.caption ?? "";
  return (
    <div className="stage">
      <header className="stage-head">
        <h2>Ready to post</h2>
        <p>Post it by hand from the package below (or the Telegram delivery), then mark it live.</p>
      </header>
      <div className="final-preview">
        <PhonePreview story={story} draft={draft} master={master} images={images} />
        <div className="final-side">
          {caption && (
            <div className="copy-block">
              <div className="copy-block-head">
                <h3>Caption</h3>
                <button className="mini-button" onClick={() => navigator.clipboard.writeText(caption)}>Copy</button>
              </div>
              <textarea readOnly value={caption} />
            </div>
          )}
          {draft?.hashtags?.length > 0 && (
            <div className="copy-block">
              <div className="copy-block-head">
                <h3>Hashtags</h3>
                <button className="mini-button" onClick={() => navigator.clipboard.writeText(draft.hashtags.join(" "))}>Copy</button>
              </div>
              <div className="hashtag-row">
                {draft.hashtags.map((h: string) => (
                  <span key={h}>{h}</span>
                ))}
              </div>
            </div>
          )}
          {draft?.postingNotes && <p className="muted">{draft.postingNotes}</p>}
          {master && (
            <a className="path-pill" href={mediaUrl(master.filePath)} target="_blank" rel="noreferrer">
              Download final video ↗
            </a>
          )}
          {images.length > 1 && (
            <div className="ready-deck">
              <span className="slide-label">All {images.length} slides — click to open/save</span>
              <div className="filmstrip">
                {images.map((s: any, i: number) => (
                  <a key={s._id} className="film-cell" href={mediaUrl(s.filePath)} target="_blank" rel="noreferrer">
                    <img src={mediaUrl(s.filePath)} alt="" />
                    <span className="film-tag">{i + 1}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          <button className="primary wide" onClick={markPosted}>Mark posted</button>
        </div>
      </div>
    </div>
  );
}

// ---- Stage: Live ----------------------------------------------------------------------

function LiveStage({ storyId, story, draft, master, images }: any) {
  return (
    <div className="stage">
      <header className="stage-head">
        <h2>Live — add the numbers</h2>
        <p>Once you add metrics, the ratings desk judges it against its {pretty(story.job)} job in the Monday memo.</p>
      </header>
      <div className="final-preview">
        <PhonePreview story={story} draft={draft} master={master} images={images} />
        <MetricsForm storyId={storyId} metrics={story.metrics} />
      </div>
    </div>
  );
}

// ---- Shared pieces ----------------------------------------------------------------------

function ApprovalBox({ label, blocked, decide }: { label: string; blocked?: boolean; decide: (d: "approve" | "redo" | "kill", note?: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="approval-box">
      <textarea placeholder="Note for a redo (what to change) — optional for approve" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="actions">
        <button className="primary" disabled={blocked} onClick={() => decide("approve", note)}>
          {label}
        </button>
        <button onClick={() => decide("redo", note)}>Redo</button>
        <button className="danger" onClick={() => decide("kill", note)}>Kill</button>
      </div>
    </div>
  );
}

export function PhonePreview({ story, draft, master, images }: any) {
  const hero = master ?? images?.[0];
  const caption = draft?.caption ?? story.summary ?? "";
  return (
    <div className="phone-preview">
      <div className="phone-top">{pretty(story.platform ?? "post")} preview</div>
      <div className="phone-media">
        {hero?.kind === "master" ? (
          <video src={mediaUrl(hero.filePath)} controls playsInline />
        ) : hero?.filePath ? (
          <img src={mediaUrl(hero.filePath)} alt="" />
        ) : (
          <div className="preview-empty">No visual yet</div>
        )}
      </div>
      {draft?.coverText && <div className="cover-text">{draft.coverText}</div>}
      <div className="phone-caption">{caption.slice(0, 180)}</div>
    </div>
  );
}

function ScriptView({ script }: { script: any }) {
  const over = script.targetRuntimeSec > 0 && script.estRuntimeSec > script.targetRuntimeSec;
  return (
    <div className="script-view">
      <div className="runtime">
        <span>
          v{script.version} · {script.totalWords}w · reads ~{script.estRuntimeSec.toFixed(0)}s
          {script.targetRuntimeSec > 0 ? ` / target ${script.targetRuntimeSec}s` : ""}
          {script.scratchRuntimeSec ? ` · scratch read ${Math.round(script.scratchRuntimeSec)}s` : ""}
        </span>
        <div className="bar">
          <i className={over ? "over" : ""} style={{ width: `${Math.min(100, (script.estRuntimeSec / Math.max(1, script.targetRuntimeSec)) * 100)}%` }} />
        </div>
      </div>
      {script.sections.map((s: any, i: number) => (
        <div className="section-row" key={i}>
          <span>{s.kind} · {s.wordCount}w</span>
          <p>{s.text}</p>
          {s.visualNote && <em>{s.visualNote}</em>}
        </div>
      ))}
      {script.voiceNotes && <p className="note-block">{script.voiceNotes}</p>}
      {script.legalNotes && <p className="note-block">{script.legalNotes}</p>}
    </div>
  );
}

const assetOwnerChip = (req: any): { text: string; tone: string } => {
  if (req.status === "supplied") return { text: "✓ You attached this", tone: "done" };
  if (req.status === "selected") return { text: "✓ Using your file", tone: "done" };
  if (req.kind === "voice") return { text: "🎙️ You record", tone: "you" };
  if (req.owner === "agent") return { text: "🤖 App makes this", tone: "agent" };
  if (req.kind === "screenshot")
    return req.canAgentAttempt ? { text: "📸 App can try, else you", tone: "maybe" } : { text: "📸 You grab", tone: "you" };
  return { text: "🙋 You", tone: "you" };
};

function AssetsPanel({ requests, attachFiles, updateAsset }: any) {
  const open = requests.filter((r: any) => r.status !== "waived");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  if (open.length === 0) return null;

  const onPick = async (requestId: string, fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return;
    setBusyId(requestId);
    setErr("");
    try {
      await attachFiles(requestId, files);
    } catch (e: any) {
      setErr(`${e?.message ?? "attach failed"}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rail-card">
      <h3>Assets</h3>
      {err && <p className="error">{err}</p>}
      {open.map((req: any) => {
        const chip = assetOwnerChip(req);
        const busy = busyId === req._id;
        const done = req.status === "supplied" || req.status === "selected";
        return (
          <div key={req._id} className="asset-row">
            <div>
              <strong>{req.label}</strong>
              <div className="asset-tags">
                <span className={`pill asset-who-${chip.tone}`}>{chip.text}</span>
              </div>
              <p>{req.instructions}</p>
              {req.sourceUrl && <a href={req.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>}
              {req.filePath && <a href={mediaUrl(req.filePath)} target="_blank" rel="noreferrer">Open file</a>}
            </div>
            <div className="asset-actions">
              {req.owner === "liz" && (
                <label className={`mini-button ${busy ? "is-busy" : ""}`}>
                  {busy ? "Uploading…" : done ? "Replace" : "Attach"}
                  <input type="file" disabled={busy} style={{ display: "none" }} onChange={(e: any) => onPick(req._id, e.target.files)} />
                </label>
              )}
              {!done && <button className="mini-button" onClick={() => updateAsset({ requestId: req._id, status: "waived" })}>Waive</button>}
              {req.status === "supplied" && (
                <button className="mini-button" onClick={() => updateAsset({ requestId: req._id, status: "selected" })}>Use</button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DetailsRail({ stage, story, brief, selectedRoute, script, claims, runs, estTotal, storyId }: any) {
  const events = useQuery(api.events.recent, { storyId, limit: 20 }) ?? [];
  const queueExport = useMutation(api.design.queueCapcutExport);
  const building = Boolean(story.capcutExportAt);
  const capcutPath: string | undefined = story.capcutPath;
  const planned = (runs ?? []).filter((r: any) => r.status !== "failed");
  const showScript = script && !["copy", "voice"].includes(stage);

  return (
    <section className="rail-card rail-details">
      <h3>Details</h3>
      {selectedRoute && (
        <details className="rail-acc">
          <summary>Concept</summary>
          <strong>{selectedRoute.title}</strong>
          <p>{selectedRoute.angle}</p>
          <p className="muted">{selectedRoute.postType} — {selectedRoute.rationale}</p>
        </details>
      )}
      {brief?.researchSummary && (
        <details className="rail-acc">
          <summary>Brief</summary>
          <p>{brief.researchSummary}</p>
          {brief.audienceLanguage?.length > 0 && (
            <div className="quote-list">
              {brief.audienceLanguage.slice(0, 4).map((q: string) => (
                <span key={q}>{q}</span>
              ))}
            </div>
          )}
        </details>
      )}
      {showScript && (
        <details className="rail-acc">
          <summary>Script</summary>
          <ScriptView script={script} />
        </details>
      )}
      {claims.length > 0 && stage !== "copy" && (
        <details className="rail-acc">
          <summary>Claims ({claims.length})</summary>
          {claims.map((c: any) => (
            <div className="claim" key={c._id}>
              <span className={`pill ${c.classification}`}>{c.classification}</span>
              <p>{c.text}</p>
            </div>
          ))}
        </details>
      )}
      {planned.length > 0 && (
        <details className="rail-acc">
          <summary>Cost · ${estTotal.toFixed(2)}</summary>
          <table>
            <tbody>
              {planned.map((r: any) => (
                <tr key={r._id}>
                  <td>{r.lane}</td>
                  <td>{r.model}</td>
                  <td>x{r.count}</td>
                  <td>${r.estCostUsd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <details className="rail-acc">
        <summary>CapCut package</summary>
        <p className="muted">One folder to drag into CapCut: screenshots, plates, VO script, captions, running order.</p>
        <button className="secondary wide" disabled={building} onClick={() => queueExport({ storyId })}>
          {building ? "Building…" : capcutPath ? "Rebuild package" : "Build package"}
        </button>
        {capcutPath && !building && (
          <>
            {mediaUrl(`${capcutPath}/ORDER.txt`) && (
              <a href={mediaUrl(`${capcutPath}/ORDER.txt`)} target="_blank" rel="noreferrer">Open running order ↗</a>
            )}
            <p className="muted mono">{capcutPath}</p>
          </>
        )}
      </details>
      {(events as any[]).length > 0 && (
        <details className="rail-acc">
          <summary>Activity</summary>
          <ul className="story-activity">
            {(events as any[]).map((e) => (
              <li key={e._id} className={e.level === "warn" || e.level === "error" ? "wire-warn" : ""}>
                <span className="wire-time">{fmtTime(e.createdAt)}</span> {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
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
    <div className="final-side">
      <div className="metric-grid">
        {METRIC_KEYS.map((k) => (
          <label key={k}>
            {k}
            <input type="number" value={m[k]} onChange={(e) => setM({ ...m, [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <label>
        Notes
        <input value={m.notes} onChange={(e) => setM({ ...m, notes: e.target.value })} />
      </label>
      <button
        className="primary wide"
        onClick={() => {
          const { notes, ...nums } = m;
          setMetrics({ storyId, metrics: { ...nums, notes: notes || undefined } });
        }}
      >
        Save numbers
      </button>
    </div>
  );
}
