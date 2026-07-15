import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  BOARD_GROUPS,
  LIVE_ICON,
  STAGES,
  liveStatus,
  mediaUrl,
  pretty,
  stageIndex,
} from "../lib";

// The home screen: one flow strip (Ideas → In the making → Your call → Ready → Live)
// with a "Needs you" shelf on top. Click any card to open its studio.
export default function PostsBoard({ onOpen }: { onOpen: (id: Id<"stories">) => void }) {
  const items = (useQuery(api.design.postStudioList) ?? []) as any[];
  const [group, setGroup] = useState<string | null>(null);
  const [platform, setPlatform] = useState("all");

  const visible = items.filter((item) => item.story.status !== "killed" && item.story.status !== "parked");

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of BOARD_GROUPS) out[g.id] = 0;
    for (const item of visible) {
      const g = BOARD_GROUPS.find((g) => g.statuses.includes(item.story.status));
      if (g) out[g.id]++;
    }
    return out;
  }, [items]);

  const activeGroup = group ?? BOARD_GROUPS.find((g) => counts[g.id] > 0)?.id ?? "ideas";

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const item of visible) if (item.story.platform) set.add(item.story.platform);
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const needsYou = visible.filter((item) => {
    const live = liveStatus(item.story);
    return live.tone === "you" || item.assetCounts.lizNeeded > 0;
  });

  const groupDef = BOARD_GROUPS.find((g) => g.id === activeGroup)!;
  const cards = visible.filter(
    (item) =>
      groupDef.statuses.includes(item.story.status) &&
      (platform === "all" || item.story.platform === platform)
  );

  return (
    <div className="board">
      {needsYou.length > 0 && (
        <section className="needs-shelf">
          <h2>Needs you</h2>
          <div className="needs-row">
            {needsYou.map((item) => {
              const live = liveStatus(item.story);
              return (
                <button key={item.story._id} className="needs-chip" onClick={() => onOpen(item.story._id)}>
                  <strong>{item.story.title}</strong>
                  <span>
                    {live.tone === "you" ? live.text : ""}
                    {live.tone === "you" && item.assetCounts.lizNeeded > 0 ? " · " : ""}
                    {item.assetCounts.lizNeeded > 0 ? `${item.assetCounts.lizNeeded} asset${item.assetCounts.lizNeeded > 1 ? "s" : ""} owed` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="flow-strip">
        {BOARD_GROUPS.map((g, i) => (
          <button
            key={g.id}
            className={`flow-stop ${activeGroup === g.id ? "active" : ""} ${counts[g.id] === 0 ? "empty" : ""}`}
            onClick={() => setGroup(g.id)}
          >
            <span className="flow-count">{counts[g.id]}</span>
            <span className="flow-label">{g.label}</span>
            <span className="flow-hint">{g.hint}</span>
            {i < BOARD_GROUPS.length - 1 && <span className="flow-arrow">→</span>}
          </button>
        ))}
        <div className="flow-filters">
          {platforms.length > 2 && (
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {platforms.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="card-grid">
        {cards.length === 0 && <div className="empty-state">Nothing here right now.</div>}
        {cards.map((item) => (
          <PostCard key={item.story._id} item={item} onClick={() => onOpen(item.story._id)} />
        ))}
      </div>
    </div>
  );
}

function PostCard({ item, onClick }: { item: any; onClick: () => void }) {
  const story = item.story;
  const route = item.selectedRoute ?? item.routes?.[0];
  const asset = item.previewAsset;
  const live = liveStatus(story);
  const idx = stageIndex(story.status);
  return (
    <button className="post-card" onClick={onClick}>
      <div className="thumb">
        {asset?.kind === "master" ? (
          <video src={mediaUrl(asset.filePath)} muted playsInline />
        ) : asset?.filePath ? (
          <img src={mediaUrl(asset.filePath)} alt="" />
        ) : (
          <span className="thumb-placeholder">{pretty(route?.postType ?? story.format ?? story.job)}</span>
        )}
        <span className={`state state-live-${live.tone}`}>
          {LIVE_ICON[live.tone]} {live.text}
        </span>
      </div>
      <div className="post-card-body">
        <strong>{story.title}</strong>
        <div className="post-card-meta">
          <span>{pretty(story.platform ?? "platform tbc")}</span>
          <span>·</span>
          <span>{pretty(story.format ?? route?.format ?? "format tbc")}</span>
          {item.assetCounts.lizNeeded > 0 && <span className="pill warn">{item.assetCounts.lizNeeded} from you</span>}
        </div>
        <div className="stage-dots" title={STAGES[idx].label}>
          {STAGES.map((s, i) => (
            <i key={s.id} className={i < idx ? "done" : i === idx ? "now" : ""} />
          ))}
          <em>{STAGES[idx].label}</em>
        </div>
      </div>
    </button>
  );
}
