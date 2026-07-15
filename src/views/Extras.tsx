import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fmtTime, slugify } from "../lib";

// The quieter rooms: the wire, recording desk, memos, brain, settings, and the
// "New idea" composer. Kept deliberately plain — the Posts board is the product.

export function Wire({ onOpen }: { onOpen: (id: Id<"stories">) => void }) {
  const events = useQuery(api.events.recent, { limit: 80 }) ?? [];
  return (
    <section className="wire">
      <div className="wire-head">
        <h2>Newsroom wire</h2>
        <p className="muted">Live activity from the desks — newest first. Click a line to open its post.</p>
      </div>
      {events.length === 0 && <p className="muted">No activity yet. As the desks work, it shows up here in real time.</p>}
      <ul className="wire-list">
        {(events as any[]).map((e) => (
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

export function RecordingDesk() {
  const queue = useQuery(api.production.recordingQueue) ?? [];
  return (
    <div className="page">
      <h1>Recording desk</h1>
      <p className="page-kicker">
        Drop finished files into <code>recordings-inbox/</code> named <code>[story-slug].[vo|intro].wav</code>.
      </p>
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

export function Memos() {
  const memos = useQuery(api.pipeline.memosList) ?? [];
  return (
    <div className="page">
      <h1>Monday memos</h1>
      <p className="page-kicker">
        Run <code>npm run memo</code> after adding numbers to posted stories.
      </p>
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

export function Brain() {
  const docs = useQuery(api.brain.docs) ?? [];
  const saveDoc = useMutation(api.brain.saveDoc);
  const deleteDoc = useMutation(api.brain.deleteDoc);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<any>("voice");
  const [body, setBody] = useState("");
  const load = (d: any) => {
    setSlug(d.slug);
    setTitle(d.title);
    setKind(d.kind);
    setBody(d.body);
  };

  return (
    <div className="page split-page">
      <section>
        <h1>Brand brain</h1>
        {(docs as any[]).map((d) => (
          <div className="doccard clickable" key={d._id} onClick={() => load(d)}>
            <strong>{d.title}</strong> <span className="pill">{d.kind}</span> <span className="pill">v{d.version}</span>
            <button
              className="mini-button float"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${d.title}"?`)) deleteDoc({ slug: d.slug });
              }}
            >
              Delete
            </button>
            <p>{d.body.slice(0, 160)}</p>
          </div>
        ))}
      </section>
      <section className="surface">
        <h2>Add or update doc</h2>
        <label>
          Slug
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="voice-corpus" />
        </label>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["philosophy", "voice", "audience", "legal", "product", "house_style", "formats", "evidence"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Body
          <textarea className="tall" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <button
          className="primary"
          onClick={() => {
            const s = slugify(slug || title);
            if (s && title && body) {
              saveDoc({ slug: s, title, kind, body });
              setBody("");
              setSlug("");
              setTitle("");
            }
          }}
        >
          Save to brain
        </button>
      </section>
    </div>
  );
}

export function Settings() {
  const settings = useQuery(api.brain.allSettings) ?? {};
  const setSetting = useMutation(api.brain.setSetting);
  const seed = useMutation(api.brain.seedDefaults);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const keys = [
    "speech_wpm",
    "format_targets",
    "price_table",
    "telegram_chat_id",
    "telegram_thread_id",
    "telegram_delivery_chat_id",
    "telegram_delivery_thread_id",
  ];

  return (
    <div className="page">
      <h1>Settings</h1>
      {Object.keys(settings as any).length === 0 && (
        <button className="primary" onClick={() => seed()}>
          Seed defaults
        </button>
      )}
      {keys.map((k) =>
        (settings as any)[k] !== undefined ? (
          <section className="surface setting" key={k}>
            <label>
              {k}
              <textarea value={drafts[k] ?? (settings as any)[k]} onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })} />
            </label>
            {drafts[k] !== undefined && drafts[k] !== (settings as any)[k] && (
              <button className="primary" onClick={() => setSetting({ key: k, value: drafts[k] })}>
                Save
              </button>
            )}
          </section>
        ) : null
      )}
    </div>
  );
}

// "+ New idea" — the tip line as a small modal instead of a whole screen.
export function TipComposer({ onClose }: { onClose: () => void }) {
  const tips = useQuery(api.pipeline.tipsList) ?? [];
  const addTip = useMutation(api.pipeline.addTip);
  const [kind, setKind] = useState<any>("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [filed, setFiled] = useState(false);

  const file = () => {
    const isPath = sourceUrl.startsWith("/");
    addTip({
      kind,
      sourceUrl: !isPath && sourceUrl ? sourceUrl : undefined,
      filePath: isPath ? sourceUrl : undefined,
      rawText: rawText || undefined,
      note: noteText || undefined,
    });
    setSourceUrl("");
    setRawText("");
    setNoteText("");
    setFiled(true);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New idea</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <p className="muted">Drop a link, a note, or a screenshot path — the tip desk grades it and files a story card with concepts.</p>
        <div className="form-grid">
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {["url", "reddit", "ruling", "pdf", "screenshot", "note"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            URL or file path
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https:// or /Users/lizw/..." />
          </label>
        </div>
        <label>
          Raw text
          <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} />
        </label>
        <label>
          Note to desk
          <input value={noteText} onChange={(e) => setNoteText(e.target.value)} />
        </label>
        <div className="actions">
          <button className="primary" onClick={file}>File tip</button>
          {filed && <span className="muted">Filed — the desk picks it up in a moment.</span>}
        </div>
        {(tips as any[]).length > 0 && (
          <details className="rail-acc">
            <summary>Recent tips</summary>
            {(tips as any[]).slice(0, 8).map((t) => (
              <div className="doccard" key={t._id}>
                <span className="pill">{t.kind}</span> <span className="pill">{t.status}</span>
                {t.sourceGrade && <span className="pill">grade {t.sourceGrade}</span>}
                <p>{t.sourceUrl ?? t.filePath ?? (t.rawText ?? "").slice(0, 140)}</p>
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}
