import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  PROVIDER_MODELS,
  buildImagePrompt,
  cleanVisualBrief,
  isCarouselFormat,
  mediaUrl,
} from "../lib";

// The Visuals stage: a filmstrip of beats, one beat in focus at a time, and a
// direct line to the art director. Pick a winner for every beat, then send on.
export default function DesignStage({ storyId, data }: { storyId: Id<"stories">; data: any }) {
  const updatePrompt = useMutation(api.design.updatePrompt);
  const selectCandidate = useMutation(api.design.selectCandidate);
  const queueGen = useMutation(api.design.queueGen);
  const addCandidate = useMutation(api.design.addCandidate);
  const sendToAssembly = useMutation(api.design.sendToAssembly);
  const queuePromptRewrite = useMutation(api.design.queuePromptRewrite);

  const [gen, setGen] = useState({ provider: "higgsfield", model: "gpt_image_2", count: 2, aspect: "9:16", quality: "high" });
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [artNote, setArtNote] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const story = data.story;
  const slides: any[] = (data.slides ?? []).slice().sort((a: any, b: any) => a.order - b.order);
  const candidates: any[] = data.candidates ?? [];
  const genRequests: any[] = data.genRequests ?? [];
  const rewriting = Boolean(story.promptsRewriteAt);
  const carousel = isCarouselFormat(story.format ?? "");

  const slideCands = (id: string) => candidates.filter((c: any) => c.slideId === id);
  const mockups = candidates.filter((c: any) => c.kind === "mockup");
  const busy = (id?: string) =>
    genRequests.some((r: any) => (id ? r.slideId === id : r.kind === "mockup") && ["queued", "running"].includes(r.status));
  const lastFail = (id?: string) =>
    genRequests.filter((r: any) => (id ? r.slideId === id : r.kind === "mockup") && r.status === "failed").slice(-1)[0];

  const active = slides.find((s) => s._id === activeId) ?? slides.find((s) => !s.selectedCandidateId) ?? slides[0];
  const allPicked = slides.length > 0 && (carousel || slides.every((s: any) => s.selectedCandidateId));
  const pickedCount = slides.filter((s: any) => s.selectedCandidateId).length;

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

  const attachFiles = async (slideId: Id<"designSlides">, files: FileList | null) => {
    if (!files || !story.slug) return;
    for (const file of Array.from(files)) {
      const res = await fetch(
        `/media-upload?slug=${encodeURIComponent(story.slug)}&name=${encodeURIComponent(file.name)}`,
        { method: "POST", body: file }
      );
      const { path } = await res.json();
      await addCandidate({ storyId, slideId, filePath: path, note: `attached: ${file.name}` });
    }
  };

  const sendArtNote = async () => {
    await queuePromptRewrite({ storyId, note: artNote.trim() || undefined });
    setArtNote("");
  };

  if (slides.length === 0) {
    return (
      <div className="stage">
        <header className="stage-head">
          <h2>Direct the visuals</h2>
          <p>Building the storyboard from the approved script — beats appear here in a moment.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="stage design-stage">
      <header className="stage-head">
        <h2>Direct the visuals</h2>
        <p>
          {carousel
            ? "Pick or generate a plate per slide — picked winners drive the carousel deck."
            : `Pick a winner for every beat (${pickedCount}/${slides.length} picked), then send to assembly.`}
        </p>
      </header>

      <div className="art-director-bar">
        <textarea
          value={artNote}
          disabled={rewriting}
          placeholder='Tell the art director what to change — e.g. "warmer light, leave clean space top-left for a text overlay, more close-ups of the actual label"'
          onChange={(e) => setArtNote(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !rewriting) sendArtNote();
          }}
        />
        <button className="primary" disabled={rewriting} onClick={sendArtNote}>
          {rewriting ? "Rewriting…" : "Redo all prompts"}
        </button>
      </div>
      {rewriting && (
        <p className="muted working-line">
          ▶ Art director is rewriting every prompt{story.promptsRewriteNote ? ` to: "${story.promptsRewriteNote}"` : ""} — new prompts land in the beats below.
        </p>
      )}

      <div className="gen-toolbar">
        <label>
          Model
          <select
            value={`${gen.provider}::${gen.model}`}
            onChange={(e) => {
              const [provider, model] = e.target.value.split("::");
              setGen({ ...gen, provider, model });
            }}
          >
            {Object.entries(PROVIDER_MODELS).flatMap(([provider, models]) =>
              models.map((m) => (
                <option key={`${provider}::${m}`} value={`${provider}::${m}`}>
                  {provider} · {m}
                </option>
              ))
            )}
          </select>
        </label>
        <label>
          Aspect
          <select value={gen.aspect} onChange={(e) => setGen({ ...gen, aspect: e.target.value })}>
            {["9:16", "4:5", "1:1", "16:9"].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Variants
          <select value={String(gen.count)} onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>x{n}</option>
            ))}
          </select>
        </label>
        <label>
          Quality
          <select value={gen.quality} onChange={(e) => setGen({ ...gen, quality: e.target.value })}>
            {["high", "medium", "low"].map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={busy()}
          onClick={() =>
            fire(
              null,
              [
                `16:9 internal storyboard contact sheet for a De-Influenced social post, ${slides.length} panels in a clean grid.`,
                "Each panel is a distinct editorial background plate concept with strong focal composition, clear negative space for later text overlays, and no finished typography.",
                `Panel briefs: ${slides.map((s: any, i: number) => `panel ${i + 1}: ${cleanVisualBrief(s.visualNote ?? s.voLine)}`).join("; ")}.`,
                "Use restrained documentary product-research style, realistic lighting, no readable text, no numbers, no logos, no fake screenshots, no brand names.",
              ].join(" ")
            )
          }
        >
          {busy() ? "Mockup generating…" : "Whole-post mockup"}
        </button>
      </div>
      {lastFail() && <p className="error">mockup failed: {lastFail().error}</p>}
      {mockups.length > 0 && (
        <div className="mockup-grid">
          {mockups.map((c: any) => (
            <a key={c._id} href={mediaUrl(c.filePath)} target="_blank" rel="noreferrer">
              <img src={mediaUrl(c.filePath)} alt="" />
            </a>
          ))}
        </div>
      )}

      <div className="filmstrip">
        {slides.map((s: any) => {
          const cands = slideCands(s._id);
          const picked = cands.find((c: any) => c._id === s.selectedCandidateId);
          const thumb = picked ?? cands[cands.length - 1];
          return (
            <button
              key={s._id}
              className={`film-cell ${active?._id === s._id ? "active" : ""} ${s.selectedCandidateId ? "picked" : ""}`}
              onClick={() => setActiveId(s._id)}
              title={s.voLine}
            >
              {thumb ? <img src={mediaUrl(thumb.filePath)} alt="" /> : <span className="film-empty">{s.order + 1}</span>}
              <span className="film-tag">
                {s.order + 1} {s.selectedCandidateId ? "✓" : busy(s._id) ? "…" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="beat-panel">
          <div className="beat-copy">
            <span className="slide-label">Beat {active.order + 1} · {active.kind}</span>
            <p className="beat-line">“{active.voLine}”</p>
            {active.visualNote && <em className="muted">{active.visualNote}</em>}
            <textarea
              className="beat-prompt"
              value={prompts[active._id] ?? active.prompt}
              onChange={(e) => setPrompts({ ...prompts, [active._id]: e.target.value })}
              onBlur={(e) => {
                if (e.target.value !== active.prompt) updatePrompt({ slideId: active._id, prompt: e.target.value });
              }}
            />
            <div className="actions">
              <button className="primary" disabled={busy(active._id)} onClick={() => fire(active, prompts[active._id] ?? active.prompt)}>
                {busy(active._id) ? "Generating…" : `Generate x${gen.count}`}
              </button>
              <button
                className="secondary"
                onClick={async () => {
                  const nextPrompt = buildImagePrompt(active, gen.aspect);
                  setPrompts((current) => ({ ...current, [active._id]: nextPrompt }));
                  await updatePrompt({ slideId: active._id, prompt: nextPrompt });
                }}
              >
                Reset prompt
              </button>
              <label className="secondary attach-btn">
                Attach your own
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e: any) => {
                    attachFiles(active._id, e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {active.selectedCandidateId && (
                <button onClick={() => selectCandidate({ slideId: active._id, candidateId: undefined })}>Clear pick</button>
              )}
            </div>
            {lastFail(active._id) && <p className="error">failed: {lastFail(active._id).error}</p>}
          </div>
          <div className="candidate-grid big">
            {slideCands(active._id).length === 0 && (
              <div className="preview-empty">No images yet — hit Generate or attach your own.</div>
            )}
            {slideCands(active._id).map((c: any) => (
              <button
                key={c._id}
                className={active.selectedCandidateId === c._id ? "picked" : ""}
                title={c.prompt ?? ""}
                onClick={() => selectCandidate({ slideId: active._id, candidateId: c._id })}
              >
                <img src={mediaUrl(c.filePath)} alt="" />
                {active.selectedCandidateId === c._id && <span className="picked-flag">✓ picked</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {err && <p className="error">{err}</p>}
      <button
        className="primary wide"
        disabled={!allPicked}
        onClick={async () => {
          try {
            setErr("");
            await sendToAssembly({ storyId });
          } catch (e: any) {
            setErr(e.message ?? String(e));
          }
        }}
      >
        {allPicked
          ? carousel
            ? "Render carousel deck →"
            : "Send to assembly →"
          : `Pick a winner for every beat (${pickedCount}/${slides.length})`}
      </button>
    </div>
  );
}
