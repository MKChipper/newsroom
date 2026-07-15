import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  REVIEW_DECISIONS,
  REVIEW_GATES,
  REVIEW_PROOF_FIELDS,
  REVIEW_STATUSES,
  defaultGateRevisions,
  defaultReviewGates,
  defaultReviewProof,
  mediaUrl,
  pretty,
  reviewMissingItems,
  reviewTone,
  shortDate,
} from "../lib";

// The Gate-2 quality pass. Same rules as before (Tier 2+ concepts must loop until
// green + proof-backed), but folded away so it only takes over the screen when
// you're actually running a pass.
export default function ReviewLoop({
  storyId,
  routeId,
  reviews,
  assetRequests,
  startOpen,
}: {
  storyId: Id<"stories">;
  routeId?: Id<"formatRoutes">;
  reviews: any[];
  assetRequests: any[];
  startOpen?: boolean;
}) {
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
  const updateGateRevision = (id: string, value: string) =>
    setGateRevisions((current) => ({ ...current, [id]: value }));
  const proofComplete = REVIEW_PROOF_FIELDS.every(([id]) => proof[id]?.trim().length >= 12);
  const artifactComplete = artifactPath.trim().length >= 6;
  const visualEvidenceComplete = contactSheetPath.trim().length >= 6;
  const allGatesGreen = REVIEW_GATES.every(([id]) => gates[id] === "green");
  const openGateIds = REVIEW_GATES.filter(([id]) => gates[id] === "amber" || gates[id] === "red").map(([id]) => id);
  const hasOpenGate = openGateIds.length > 0;
  const revisionsActionable = requiredRevisions.trim().length >= 20;
  const nextAssetActionable =
    nextAssetNeeded.trim().length >= 12 && nextAssetNeeded.trim().toLowerCase() !== "more assets";
  const missingGateFixes = openGateIds.filter((id) => gateRevisions[id]?.trim().length < 20);
  const outstandingReadyAssets = (assetRequests ?? []).filter((request: any) => {
    const appliesToActiveScope = !request.routeId || (routeId && request.routeId === routeId);
    const isOpen = request.status === "needed" || request.status === "generating";
    const reviewGenerated = request.owner === "liz" && request.label.startsWith("Review asset:");
    return appliesToActiveScope && request.required && isOpen && !reviewGenerated;
  });
  const routeBlockedReason = !routeId ? "Select a concept before saving a review pass." : "";
  const readyBlockedReason =
    decision === "ready" && !allGatesGreen
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
  const revisionBlockedReason =
    hasOpenGate && !revisionsActionable
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
        passNo: Number(passNo) || (latest?.passNo ?? 0) + 1,
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
    <details className="review-loop rail-acc" open={startOpen}>
      <summary>
        Quality pass
        {latest && (
          <span className={`pill review-${reviewTone(latest)}`}>
            pass {latest.passNo} · {pretty(latest.decision)}
          </span>
        )}
      </summary>

      {latest && (
        <div className="review-latest">
          <div className="review-gate-grid">
            {REVIEW_GATES.map(([id, label]) => (
              <span key={id} className={`review-status review-${latest.gates?.[id] ?? "pending"}`}>
                {label}: {pretty(latest.gates?.[id] ?? "pending")}
              </span>
            ))}
          </div>
          {latest.gateRevisions && <GateFixList gates={latest.gates} revisions={latest.gateRevisions} />}
          {(latest.artifactPath || latest.contactSheetPath) && (
            <div className="review-artifacts">
              {latest.artifactPath && <PathPill label="Artifact" path={latest.artifactPath} />}
              {latest.contactSheetPath && <PathPill label="Contact sheet" path={latest.contactSheetPath} />}
            </div>
          )}
          <p>{latest.requiredRevisions}</p>
          {latest.nextAssetNeeded && <p className="muted">Next asset: {latest.nextAssetNeeded}</p>}
        </div>
      )}
      {!latest && (
        <p className="muted">No pass yet for this concept. Tier 2+ posts must loop here before the final can be approved.</p>
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
                      {blockers.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  <p>{review.requiredRevisions}</p>
                  {review.gateRevisions && <GateFixList gates={review.gates} revisions={review.gateRevisions} />}
                  {review.nextAssetNeeded && <p className="muted">Next asset: {review.nextAssetNeeded}</p>}
                </div>
              </details>
            );
          })}
        </div>
      )}

      <div className="review-form">
        <label>
          Pass
          <input type="number" min={1} value={passNo} onChange={(e) => setPassNo(e.target.value)} />
        </label>
        {REVIEW_GATES.map(([id, label]) => (
          <label key={id}>
            {label}
            <select value={gates[id]} onChange={(e) => updateGate(id, e.target.value)}>
              {REVIEW_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Decision
          <select value={decision} onChange={(e) => setDecision(e.target.value as any)}>
            {REVIEW_DECISIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        {openGateIds.length > 0 && (
          <div className="gate-fixes">
            <h4>Gate fixes</h4>
            <p className="muted">Each amber/red gate needs its own specific fix before this pass can be saved.</p>
            {REVIEW_GATES.filter(([id]) => openGateIds.includes(id)).map(([id, label]) => (
              <label key={id}>
                {label}
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
          <p className="muted">Required for a ready pass — concrete evidence from the artifact, rendered stills, or review notes.</p>
          <label>
            Rendered artifact path
            <input value={artifactPath} onChange={(e) => setArtifactPath(e.target.value)} placeholder="/media-vault/.../final.mp4 or reviewed output path" />
          </label>
          <label>
            Contact sheet or stills path
            <input value={contactSheetPath} onChange={(e) => setContactSheetPath(e.target.value)} placeholder="/media-vault/.../review-contact.jpg or stills folder" />
          </label>
          {REVIEW_PROOF_FIELDS.map(([id, label, placeholder]) => (
            <label key={id}>
              {label}
              <textarea value={proof[id]} onChange={(e) => updateProof(id, e.target.value)} placeholder={placeholder} />
            </label>
          ))}
        </div>
        <label className="review-wide">
          Required revisions
          <textarea
            value={requiredRevisions}
            onChange={(e) => setRequiredRevisions(e.target.value)}
            placeholder="Specific fix for the open gate. Example: Replace generic app demo with 6-10s menopause claim check recording, then rerender and review frames 16-27s."
          />
        </label>
        <label className="review-wide">
          Next asset needed
          <input value={nextAssetNeeded} onChange={(e) => setNextAssetNeeded(e.target.value)} placeholder="One asset only, if needed" />
        </label>
        <p className="review-form-note">Saving a next asset creates a Liz-owned asset request for this concept.</p>
        <label className="review-wide">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional review context" />
        </label>
      </div>
      {readyBlockedReason && <p className="warning">{readyBlockedReason}</p>}
      {revisionBlockedReason && <p className="warning">{revisionBlockedReason}</p>}
      {routeBlockedReason && <p className="warning">{routeBlockedReason}</p>}
      {err && <p className="error">{err}</p>}
      <button className="primary wide" disabled={Boolean(routeBlockedReason)} onClick={save}>
        Save review pass
      </button>
    </details>
  );
}

function PathPill({ label, path }: { label: string; path: string }) {
  const href = mediaUrl(path) || (/^https?:\/\//i.test(path) ? path : "");
  return href ? (
    <a className="path-pill" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <span className="path-pill" title={path}>
      {label}: {path}
    </span>
  );
}

function GateFixList({ gates, revisions }: { gates: Record<string, string>; revisions: Record<string, string> }) {
  const fixes = REVIEW_GATES.filter(
    ([id]) => (gates?.[id] === "amber" || gates?.[id] === "red") && revisions?.[id]
  ).map(([id, label]) => ({ id, label, text: revisions[id] }));
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
