import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const COLUMNS: { title: string; statuses: string[] }[] = [
  { title: "Ideas", statuses: ["idea"] },
  { title: "Angle room", statuses: ["angle"] },
  { title: "Desks at work", statuses: ["drafting", "legal_review"] },
  { title: "Gate 1 — copy", statuses: ["gate1"] },
  { title: "Design studio", statuses: ["design"] },
  { title: "Recording", statuses: ["recording"] },
  { title: "Assembly", statuses: ["production", "packaging"] },
  { title: "Gate 2 — final", statuses: ["gate2"] },
  { title: "Ready to post", statuses: ["ready_to_post"] },
  { title: "Live", statuses: ["posted", "rated"] },
];

export default function App() {
  const [view, setView] = useState<"board" | "tips" | "recording" | "memos" | "brain" | "settings">("board");
  const [selected, setSelected] = useState<Id<"stories"> | null>(null);
  const spend = useQuery(api.production.monthSpend);

  return (
    <>
      <header>
        <h1>NEWSROOM</h1>
        <nav>
          {(["board", "tips", "recording", "memos", "brain", "settings"] as const).map((v) => (
            <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
              {v === "board" ? "Floor" : v === "tips" ? "Tip line" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </nav>
        <span className="spend">
          {spend ? `${spend.month} spend: $${spend.total.toFixed(2)}` : ""}
        </span>
      </header>
      <main>
        {view === "board" && <Board selected={selected} setSelected={setSelected} />}
        {view === "tips" && <TipLine />}
        {view === "recording" && <RecordingDesk />}
        {view === "memos" && <Memos />}
        {view === "brain" && <Brain />}
        {view === "settings" && <Settings />}
        {view === "board" && selected && (
          <Detail storyId={selected} close={() => setSelected(null)} />
        )}
      </main>
    </>
  );
}

function Board({ selected, setSelected }: { selected: Id<"stories"> | null; setSelected: (id: Id<"stories">) => void }) {
  const stories = useQuery(api.pipeline.board) ?? [];
  return (
    <div className="board">
      {COLUMNS.map((col) => {
        const items = stories.filter((s: any) => col.statuses.includes(s.status));
        return (
          <div className="col" key={col.title}>
            <h2>
              {col.title} <span>{items.length}</span>
            </h2>
            {items.map((s: any) => (
              <div
                key={s._id}
                className={"story" + (selected === s._id ? " sel" : "")}
                onClick={() => setSelected(s._id)}
              >
                <div className="t">{s.title}</div>
                <div className="meta">
                  <span className={`chip job-${s.job}`}>{s.job}</span>
                  {s.format && <span className="chip">{s.format}</span>}
                  {s.score && <span className="chip">★ {s.score.total}</span>}
                  {s.status === "legal_review" && <span className="chip">legal</span>}
                </div>
              </div>
            ))}
            {items.length === 0 && <div className="empty">—</div>}
          </div>
        );
      })}
    </div>
  );
}

function Detail({ storyId, close }: { storyId: Id<"stories">; close: () => void }) {
  const detail = useQuery(api.pipeline.storyDetail, { storyId });
  const transition = useMutation(api.pipeline.transition);
  const gate = useMutation(api.pipeline.gateDecision);
  const [note, setNote] = useState("");
  if (!detail) return <div className="detail" />;
  const { story, claims, scripts, runs, recordings, assets } = detail as any;
  const script = scripts.find((s: any) => s.status !== "superseded");
  const plannedRuns = runs.filter((r: any) => r.status !== "failed");
  const estTotal = plannedRuns.reduce((n: number, r: any) => n + r.estCostUsd, 0);
  const over = script && script.estRuntimeSec > script.targetRuntimeSec;

  // /media/<relative-to-vault> — served by the vite media-vault middleware
  const mediaUrl = (p: string) => "/media/" + p.split("/media-vault/").pop();
  const images = (assets ?? []).filter((a: any) => a.kind === "image");
  const master = (assets ?? []).find((a: any) => a.kind === "master");
  const noteFor = (a: any) => {
    try { return JSON.parse(a.meta ?? "{}"); } catch { return {}; }
  };

  return (
    <div className="detail" style={story.status === "design" ? { width: 760 } : undefined}>
      <button className="act ghost" style={{ float: "right" }} onClick={close}>×</button>
      <h2>{story.title}</h2>
      <div className="meta">
        <span className={`chip job-${story.job}`}>{story.job}</span>
        <span className="chip">{story.status}</span>
        {story.format && <span className="chip">{story.format}</span>}
        {story.brainVersion != null && <span className="chip">brain v{story.brainVersion}</span>}
      </div>
      {story.summary && <p className="summary">{story.summary}</p>}
      {story.statusNote && (
        <>
          <h3>Desk note</h3>
          <div className="statusnote">{story.statusNote}</div>
        </>
      )}

      {story.status === "angle" && <AngleRoom storyId={storyId} currentAngle={story.angle} />}
      {story.status === "design" && <DesignStudio storyId={storyId} />}

      {script && (
        <>
          <h3>Script v{script.version}</h3>
          <div className="runtime">
            <span>
              {script.totalWords}w · est {script.estRuntimeSec.toFixed(0)}s
              {script.scratchRuntimeSec ? ` · scratch read ${script.scratchRuntimeSec.toFixed(0)}s` : ""}
              {" / target "}{script.targetRuntimeSec}s
            </span>
            <div className="bar">
              <i
                className={over ? "over" : ""}
                style={{ width: Math.min(100, (script.estRuntimeSec / script.targetRuntimeSec) * 100) + "%" }}
              />
            </div>
          </div>
          {script.sections.map((s: any, i: number) => (
            <div className="section" key={i}>
              <div className="kind">{s.kind} · {s.wordCount}w · {s.estSeconds}s</div>
              <div>{s.text}</div>
              {s.visualNote && <div className="visual">▣ {s.visualNote}</div>}
            </div>
          ))}
          {script.voiceNotes && <div className="statusnote">{script.voiceNotes}</div>}
          {script.legalNotes && (
            <>
              <h3>Legal desk</h3>
              <div className="statusnote">{script.legalNotes}</div>
            </>
          )}
        </>
      )}

      {master && (
        <>
          <h3>Final cut {noteFor(master).captionFree ? "· caption-free master" : ""}</h3>
          <video
            src={mediaUrl(master.filePath)}
            controls
            style={{ width: "100%", borderRadius: 8, background: "#000", maxHeight: 520 }}
          />
          <div className="note">
            {noteFor(master).durationSec ? `${noteFor(master).durationSec}s · ` : ""}
            no text burned in yet — captions are a separate layer (CapCut or the house-style step)
          </div>
        </>
      )}

      {images.length > 0 && (
        <>
          <h3>Generated visuals ({images.length}) · backgrounds, no text overlay</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {images
              .slice()
              .sort((a: any, b: any) => (noteFor(a).sectionIndex ?? 0) - (noteFor(b).sectionIndex ?? 0))
              .map((a: any) => {
                const m = noteFor(a);
                return (
                  <a key={a._id} href={mediaUrl(a.filePath)} target="_blank" rel="noreferrer" title={m.prompt ?? ""}>
                    <img
                      src={mediaUrl(a.filePath)}
                      alt={m.prompt ?? "generated visual"}
                      style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", borderRadius: 6, display: "block" }}
                    />
                  </a>
                );
              })}
          </div>
          <div className="note">click any image to open full size · hover for the prompt used</div>
        </>
      )}

      {claims.length > 0 && (
        <>
          <h3>Claims ledger</h3>
          {claims.map((c: any) => (
            <div className="claim" key={c._id}>
              <span className={`chip ${c.classification}`}>{c.classification}</span> {c.text}
              {c.citation && <div className="cite">↳ {c.citation}</div>}
            </div>
          ))}
        </>
      )}

      {plannedRuns.length > 0 && (
        <>
          <h3>Generation manifest</h3>
          <table>
            <thead>
              <tr><th>Lane</th><th>Model</th><th>Qty</th><th>Quality</th><th>Format</th><th>Est cost</th></tr>
            </thead>
            <tbody>
              {plannedRuns.map((r: any) => (
                <tr key={r._id}>
                  <td>{r.lane}</td><td>{r.model}</td><td>{r.count}</td>
                  <td>{r.quality}</td><td>{r.format}</td><td>${r.estCostUsd.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="total">
                <td colSpan={5}>Estimated total</td>
                <td>${estTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {recordings.length > 0 && (
        <>
          <h3>Recordings</h3>
          {recordings.map((r: any) => (
            <div className="claim" key={r._id}>
              <span className="chip">{r.kind}</span> <span className="chip">{r.status}</span> {r.brief.slice(0, 120)}
            </div>
          ))}
        </>
      )}

      <div className="actions">
        {story.status === "idea" && (
          <>
            <button className="act" onClick={() => transition({ storyId, to: "angle" })}>
              To the angle room
            </button>
            <button className="act ghost" onClick={() => transition({ storyId, to: "drafting" })}>
              Straight to draft
            </button>
            <button className="act danger" onClick={() => transition({ storyId, to: "killed" })}>
              Spike it
            </button>
          </>
        )}
        {(story.status === "gate1" || story.status === "gate2") && (
          <>
            <input
              placeholder="note to the desks (optional, required for redo)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              className="act"
              onClick={() => gate({ storyId, gate: story.status === "gate1" ? 1 : 2, decision: "approve", note: note || undefined })}
            >
              Approve{story.status === "gate1" && estTotal > 0 ? ` · spend ~$${estTotal.toFixed(2)}` : ""}
            </button>
            <button
              className="act ghost"
              onClick={() => gate({ storyId, gate: story.status === "gate1" ? 1 : 2, decision: "redo", note })}
            >
              Redo
            </button>
            <button
              className="act danger"
              onClick={() => gate({ storyId, gate: story.status === "gate1" ? 1 : 2, decision: "kill", note: note || undefined })}
            >
              Kill
            </button>
          </>
        )}
        {story.status === "ready_to_post" && (
          <button className="act" onClick={() => transition({ storyId, to: "posted" })}>
            Mark posted
          </button>
        )}
      </div>

      {(story.status === "posted" || story.status === "rated") && (
        <MetricsForm storyId={storyId} metrics={story.metrics} />
      )}
    </div>
  );
}

function AngleRoom({ storyId, currentAngle }: { storyId: Id<"stories">; currentAngle?: string }) {
  const thread = useQuery(api.design.angleThread, { storyId }) ?? [];
  const send = useMutation(api.design.addAngleMessage);
  const lock = useMutation(api.design.lockAngle);
  const [draft, setDraft] = useState("");
  const [angleDraft, setAngleDraft] = useState(currentAngle ?? "");
  const awaitingDesk = thread.length > 0 && thread[thread.length - 1].role === "liz";

  return (
    <>
      <h3>Angle room — argue it into shape, then lock it</h3>
      {thread.length === 0 && (
        <p className="note">
          Open with your take on the angle — the desk will push back, bring its own,
          and argue from the receipts. Lock when you've agreed.
        </p>
      )}
      {thread.map((m: any) => (
        <div
          key={m._id}
          className="statusnote"
          style={{
            marginBottom: 8,
            background: m.role === "liz" ? "var(--card)" : undefined,
            borderStyle: m.role === "liz" ? "solid" : "dashed",
          }}
        >
          <strong style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {m.role === "liz" ? "You" : "Desk"}
          </strong>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{m.text}</div>
        </div>
      ))}
      {awaitingDesk && <p className="note">desk is thinking…</p>}
      <textarea
        style={{ minHeight: 70 }}
        placeholder="your take, your pushback, your question…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="actions">
        <button
          className="act"
          disabled={!draft.trim()}
          onClick={() => { send({ storyId, role: "liz", text: draft.trim() }); setDraft(""); }}
        >
          Send
        </button>
      </div>
      <h3>Lock the angle</h3>
      <textarea
        style={{ minHeight: 50 }}
        placeholder="the agreed editorial spine, 1-2 sentences — the writers' room drafts from this"
        value={angleDraft}
        onChange={(e) => setAngleDraft(e.target.value)}
      />
      <div className="actions">
        <button
          className="act"
          disabled={!angleDraft.trim()}
          onClick={() => lock({ storyId, angle: angleDraft.trim() })}
        >
          Lock angle → writers' room
        </button>
      </div>
    </>
  );
}

const PROVIDER_MODELS: Record<string, string[]> = {
  higgsfield: ["gpt_image_2", "flux_2", "nano_banana_2", "text2image_soul_v2", "grok_image"],
  gemini: ["gemini-3-pro-image", "gemini-3.1-flash-image"],
  fal: ["fal-ai/flux/dev", "fal-ai/flux-pro/v1.1", "fal-ai/flux/schnell", "fal-ai/recraft-v3"],
};

function DesignStudio({ storyId }: { storyId: Id<"stories"> }) {
  const board = useQuery(api.design.board, { storyId });
  const updatePrompt = useMutation(api.design.updatePrompt);
  const selectCandidate = useMutation(api.design.selectCandidate);
  const queueGen = useMutation(api.design.queueGen);
  const sendToAssembly = useMutation(api.design.sendToAssembly);
  const [gen, setGen] = useState({ provider: "higgsfield", model: "gpt_image_2", count: 2, aspect: "9:16", quality: "high" });
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const mediaUrl = (p: string) => "/media/" + p.split("/media-vault/").pop();

  if (!board) return null;
  const { slides, candidates, requests } = board as any;
  const slideCands = (id: string) => candidates.filter((c: any) => c.slideId === id);
  const mockups = candidates.filter((c: any) => c.kind === "mockup");
  const busy = (id?: string) =>
    requests.some((r: any) => (id ? r.slideId === id : r.kind === "mockup") && ["queued", "running"].includes(r.status));
  const lastFail = (id?: string) =>
    requests.filter((r: any) => (id ? r.slideId === id : r.kind === "mockup") && r.status === "failed").slice(-1)[0];
  const allPicked = slides.length > 0 && slides.every((s: any) => s.selectedCandidateId);

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

  return (
    <>
      <h3>Design studio — your prompts, your picks</h3>
      <div className="row2" style={{ alignItems: "end", flexWrap: "wrap", gap: 8 }}>
        <div>
          <label>Provider</label>
          <select
            value={gen.provider}
            onChange={(e) => {
              const provider = e.target.value;
              setGen({ ...gen, provider, model: PROVIDER_MODELS[provider][0] });
            }}
          >
            {Object.keys(PROVIDER_MODELS).map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label>Model</label>
          <select value={gen.model} onChange={(e) => setGen({ ...gen, model: e.target.value })}>
            {PROVIDER_MODELS[gen.provider].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ maxWidth: 70 }}>
          <label>Count</label>
          <input type="number" min={1} max={4} value={gen.count}
            onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })} />
        </div>
        <div style={{ maxWidth: 90 }}>
          <label>Aspect</label>
          <select value={gen.aspect} onChange={(e) => setGen({ ...gen, aspect: e.target.value })}>
            {["9:16", "4:5", "1:1", "16:9"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ maxWidth: 100 }}>
          <label>Quality</label>
          <select value={gen.quality} onChange={(e) => setGen({ ...gen, quality: e.target.value })}>
            {["high", "medium", "low"].map((q) => <option key={q}>{q}</option>)}
          </select>
        </div>
      </div>
      <div className="actions">
        <button
          className="act ghost"
          disabled={busy()}
          onClick={() =>
            fire(
              null,
              `single storyboard contact sheet, ${slides.length} panels in a grid, sketch/concept style, one panel per beat: ` +
                slides.map((s: any, i: number) => `panel ${i + 1}: ${s.visualNote ?? s.voLine}`).join("; ") +
                ". No readable text in panels."
            )
          }
        >
          {busy() ? "Mockup generating…" : "⊞ Storyboard mockup (cheap vibe check)"}
        </button>
      </div>
      {lastFail() && <div className="statusnote" style={{ color: "var(--accent)" }}>mockup failed: {lastFail().error}</div>}
      {mockups.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, margin: "8px 0" }}>
          {mockups.map((c: any) => (
            <a key={c._id} href={mediaUrl(c.filePath)} target="_blank" rel="noreferrer">
              <img src={mediaUrl(c.filePath)} style={{ width: "100%", borderRadius: 6, display: "block" }} />
            </a>
          ))}
        </div>
      )}

      {slides.map((s: any) => {
        const cands = slideCands(s._id);
        const fail = lastFail(s._id);
        return (
          <div key={s._id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 12, background: "var(--card)" }}>
            <div className="kind" style={{ fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }}>
              {s.order + 1} · {s.kind}
            </div>
            <div style={{ margin: "4px 0 8px" }}>{s.voLine}</div>
            <label>Prompt (yours to rewrite)</label>
            <textarea
              style={{ minHeight: 60 }}
              value={prompts[s._id] ?? s.prompt}
              onChange={(e) => setPrompts({ ...prompts, [s._id]: e.target.value })}
              onBlur={(e) => {
                if (e.target.value !== s.prompt) updatePrompt({ slideId: s._id, prompt: e.target.value });
              }}
            />
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="act" disabled={busy(s._id)} onClick={() => fire(s, prompts[s._id] ?? s.prompt)}>
                {busy(s._id) ? "Generating…" : `Generate ×${gen.count} (${gen.provider})`}
              </button>
              {s.selectedCandidateId && (
                <button className="act ghost" onClick={() => selectCandidate({ slideId: s._id, candidateId: undefined })}>
                  Clear pick
                </button>
              )}
            </div>
            {fail && <div className="statusnote" style={{ color: "var(--accent)", marginTop: 6 }}>failed: {fail.error}</div>}
            {cands.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
                {cands.map((c: any) => (
                  <div key={c._id} style={{ position: "relative" }}>
                    <img
                      src={mediaUrl(c.filePath)}
                      title={`${c.provider}/${c.model} — click to pick, ⤢ to view full size`}
                      onClick={() => selectCandidate({ slideId: s._id, candidateId: c._id })}
                      style={{
                        width: "100%", aspectRatio: "9/16", objectFit: "cover", borderRadius: 6,
                        cursor: "pointer", display: "block",
                        outline: s.selectedCandidateId === c._id ? "3px solid var(--ok)" : "1px solid var(--line)",
                      }}
                    />
                    <a
                      href={mediaUrl(c.filePath)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="open full size in a new tab"
                      style={{
                        position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.55)",
                        color: "#fff", borderRadius: 4, padding: "1px 6px", fontSize: 12,
                        textDecoration: "none", lineHeight: "18px",
                      }}
                    >
                      ⤢
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {slides.length === 0 && <p className="note">seeding storyboard from the approved script…</p>}
      {err && <div className="statusnote" style={{ color: "var(--accent)" }}>{err}</div>}
      <div className="actions">
        <button
          className="act"
          disabled={!allPicked}
          onClick={async () => {
            try { setErr(""); await sendToAssembly({ storyId }); }
            catch (e: any) { setErr(e.message ?? String(e)); }
          }}
        >
          {allPicked ? "Send to assembly →" : "Pick a visual for every row first"}
        </button>
      </div>
    </>
  );
}

const METRIC_KEYS = ["views", "likes", "comments", "saves", "shares", "clicks", "follows"] as const;

function MetricsForm({ storyId, metrics }: { storyId: Id<"stories">; metrics?: any }) {
  const setMetrics = useMutation(api.pipeline.setMetrics);
  const [m, setM] = useState<any>(() => {
    const init: any = { notes: metrics?.notes ?? "" };
    for (const k of METRIC_KEYS) init[k] = metrics?.[k] ?? 0;
    return init;
  });
  return (
    <>
      <h3>Numbers (feeds the Monday memo)</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {METRIC_KEYS.map((k) => (
          <div key={k}>
            <label>{k}</label>
            <input
              type="number"
              value={m[k]}
              onChange={(e) => setM({ ...m, [k]: Number(e.target.value) })}
            />
          </div>
        ))}
      </div>
      <label>Notes (comment quality, anything the numbers miss)</label>
      <input value={m.notes} onChange={(e) => setM({ ...m, notes: e.target.value })} />
      <div className="actions">
        <button
          className="act"
          onClick={() => {
            const { notes, ...nums } = m;
            setMetrics({ storyId, metrics: { ...nums, notes: notes || undefined } });
          }}
        >
          Save numbers
        </button>
      </div>
    </>
  );
}

function Memos() {
  const memos = useQuery(api.pipeline.memosList) ?? [];
  return (
    <div className="page">
      <h2>Monday memos</h2>
      <p className="note">
        Run <code>npm run memo</code> after adding numbers to posted stories. Each story is
        judged only against the one job it was commissioned for.
      </p>
      {memos.length === 0 && <p className="empty" style={{ marginTop: 20 }}>No memos yet.</p>}
      {memos.map((m: any) => (
        <div className="doccard" key={m._id} style={{ cursor: "default" }}>
          <strong>{m.week}</strong>
          <div className="note" style={{ whiteSpace: "pre-wrap", marginTop: 8, color: "var(--ink)" }}>
            {m.body}
          </div>
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
      <h2>Tip line</h2>
      <div className="row2">
        <div>
          <label>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["url", "reddit", "ruling", "pdf", "screenshot", "note"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
        <div>
          <label>URL or file path</label>
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://… or /Users/lizw/…" />
        </div>
      </div>
      <label>Raw text (paste a thread, an abstract, anything)</label>
      <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} />
      <label>Your note to the desk (what caught your eye)</label>
      <input value={noteText} onChange={(e) => setNoteText(e.target.value)} />
      <div className="actions">
        <button
          className="act"
          onClick={() => {
            const isPath = sourceUrl.startsWith("/");
            addTip({
              kind,
              sourceUrl: !isPath && sourceUrl ? sourceUrl : undefined,
              filePath: isPath ? sourceUrl : undefined,
              rawText: rawText || undefined,
              note: noteText || undefined,
            });
            setSourceUrl(""); setRawText(""); setNoteText("");
          }}
        >
          File the tip
        </button>
      </div>
      <h3 style={{ marginTop: 28 }}>Recent tips</h3>
      {tips.map((t: any) => (
        <div className="doccard" key={t._id}>
          <span className="chip">{t.kind}</span> <span className="chip">{t.status}</span>{" "}
          {t.sourceGrade && <span className="chip">grade {t.sourceGrade}</span>}
          <div className="note">{t.sourceUrl ?? t.filePath ?? (t.rawText ?? "").slice(0, 110)}</div>
        </div>
      ))}
    </div>
  );
}

function RecordingDesk() {
  const queue = useQuery(api.production.recordingQueue) ?? [];
  return (
    <div className="page">
      <h2>Recording desk</h2>
      <p className="note">
        Everything waiting on your voice or your face, batched so you can knock it out in one
        session. Drop finished files into <code>recordings-inbox/</code> named{" "}
        <code>[story-slug].[vo|intro].wav</code> — the pipeline resumes itself.
      </p>
      {queue.length === 0 && <p className="empty" style={{ marginTop: 20 }}>Nothing owed. Enjoy it.</p>}
      {queue.map((r: any) => (
        <div className="doccard" key={r._id}>
          <span className="chip">{r.kind}</span> <strong>{r.storyTitle}</strong>
          <div className="note" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{r.brief}</div>
        </div>
      ))}
    </div>
  );
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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
    <div className="page">
      <h2>Brand brain</h2>
      <p className="note">
        Versioned knowledge the desks work from. Starts empty on purpose — feed it philosophy,
        voice corpus, audience, legal phrasing table, product facts, house style. Saving an
        existing slug bumps its version.
      </p>
      {docs.map((d: any) => (
        <div className="doccard" key={d._id} onClick={() => load(d)}>
          <strong>{d.title}</strong> <span className="chip">{d.kind}</span>{" "}
          <span className="chip">v{d.version}</span>{" "}
          <span
            className="chip"
            style={{ cursor: "pointer", float: "right" }}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${d.title}" (all versions)?`)) deleteDoc({ slug: d.slug });
            }}
          >
            delete
          </span>
          <div className="note">{d.body.slice(0, 140)}</div>
        </div>
      ))}
      <h3 style={{ marginTop: 24 }}>Add / update doc</h3>
      <div className="row2">
        <div>
          <label>Slug (doc identity — reuse to update, blank = from title)</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="voice-corpus" />
        </div>
        <div>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["philosophy", "voice", "audience", "legal", "product", "house_style", "formats", "evidence"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
      </div>
      <label>Body (markdown)</label>
      <textarea style={{ minHeight: 220 }} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="actions">
        <button
          className="act"
          onClick={() => {
            const s = slugify(slug || title);
            if (s && title && body) { saveDoc({ slug: s, title, kind, body }); setBody(""); setSlug(""); setTitle(""); }
          }}
        >
          Save to brain
        </button>
      </div>
    </div>
  );
}

function Settings() {
  const settings = useQuery(api.brain.allSettings) ?? {};
  const setSetting = useMutation(api.brain.setSetting);
  const seed = useMutation(api.brain.seedDefaults);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const keys = ["speech_wpm", "format_targets", "price_table"];

  return (
    <div className="page">
      <h2>Settings</h2>
      {Object.keys(settings).length === 0 && (
        <div className="actions">
          <button className="act" onClick={() => seed()}>Seed defaults</button>
        </div>
      )}
      {keys.map((k) =>
        settings[k] !== undefined ? (
          <div key={k}>
            <label>{k}</label>
            <textarea
              style={{ minHeight: k === "speech_wpm" ? 40 : 120, fontFamily: "ui-monospace, monospace" }}
              value={drafts[k] ?? settings[k]}
              onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })}
            />
            {drafts[k] !== undefined && drafts[k] !== settings[k] && (
              <div className="actions">
                <button className="act" onClick={() => { setSetting({ key: k, value: drafts[k] }); }}>
                  Save {k}
                </button>
              </div>
            )}
          </div>
        ) : null
      )}
      <p className="note" style={{ marginTop: 16 }}>
        price_table keys are <code>lane:quality</code> and drive the generation manifest
        estimates. The seeded numbers are placeholders — set real per-unit costs from your
        actual plans.
      </p>
    </div>
  );
}
