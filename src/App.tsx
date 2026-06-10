import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const COLUMNS: { title: string; statuses: string[] }[] = [
  { title: "Ideas", statuses: ["idea"] },
  { title: "Desks at work", statuses: ["drafting", "legal_review"] },
  { title: "Gate 1 — copy", statuses: ["gate1"] },
  { title: "Recording", statuses: ["recording"] },
  { title: "Production", statuses: ["production", "packaging"] },
  { title: "Gate 2 — final", statuses: ["gate2"] },
  { title: "Ready to post", statuses: ["ready_to_post"] },
  { title: "Live", statuses: ["posted", "rated"] },
];

export default function App() {
  const [view, setView] = useState<"board" | "tips" | "recording" | "brain" | "settings">("board");
  const [selected, setSelected] = useState<Id<"stories"> | null>(null);
  const spend = useQuery(api.production.monthSpend);

  return (
    <>
      <header>
        <h1>NEWSROOM</h1>
        <nav>
          {(["board", "tips", "recording", "brain", "settings"] as const).map((v) => (
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
  const { story, claims, scripts, runs, recordings } = detail as any;
  const script = scripts.find((s: any) => s.status !== "superseded");
  const plannedRuns = runs.filter((r: any) => r.status !== "failed");
  const estTotal = plannedRuns.reduce((n: number, r: any) => n + r.estCostUsd, 0);
  const over = script && script.estRuntimeSec > script.targetRuntimeSec;

  return (
    <div className="detail">
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
            <button className="act" onClick={() => transition({ storyId, to: "drafting" })}>
              Commission
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
