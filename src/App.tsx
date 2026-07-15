import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import PostsBoard from "./views/PostsBoard";
import Studio from "./views/Studio";
import { Brain, Memos, RecordingDesk, Settings, TipComposer, Wire } from "./views/Extras";

type View = "posts" | "wire" | "recording" | "memos" | "brain" | "settings";

const MORE_VIEWS: { id: View; label: string }[] = [
  { id: "recording", label: "Recording desk" },
  { id: "memos", label: "Monday memos" },
  { id: "brain", label: "Brand brain" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [view, setView] = useState<View>("posts");
  const [selected, setSelected] = useState<Id<"stories"> | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [newIdea, setNewIdea] = useState(false);
  const spend = useQuery(api.production.monthSpend);

  const openStory = (id: Id<"stories">) => {
    setSelected(id);
    setView("posts");
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <strong>Newsroom</strong>
          <span>idea → ready to post</span>
        </div>
        <nav className="nav">
          <button
            className={view === "posts" ? "active" : ""}
            onClick={() => {
              setView("posts");
              setSelected(null);
            }}
          >
            Posts
          </button>
          <button className={view === "wire" ? "active" : ""} onClick={() => setView("wire")}>
            Wire
          </button>
          <div className="more-wrap">
            <button
              className={MORE_VIEWS.some((m) => m.id === view) ? "active" : ""}
              onClick={() => setMoreOpen((v) => !v)}
            >
              More ▾
            </button>
            {moreOpen && (
              <div className="more-menu" onMouseLeave={() => setMoreOpen(false)}>
                {MORE_VIEWS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setView(m.id);
                      setMoreOpen(false);
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
        <button className="primary new-idea" onClick={() => setNewIdea(true)}>
          + New idea
        </button>
        <span className="spend">{spend ? `${spend.month}: $${spend.total.toFixed(2)}` : ""}</span>
      </header>
      <main>
        {view === "posts" &&
          (selected ? <Studio storyId={selected} onBack={() => setSelected(null)} /> : <PostsBoard onOpen={openStory} />)}
        {view === "wire" && <Wire onOpen={openStory} />}
        {view === "recording" && <RecordingDesk />}
        {view === "memos" && <Memos />}
        {view === "brain" && <Brain />}
        {view === "settings" && <Settings />}
      </main>
      {newIdea && <TipComposer onClose={() => setNewIdea(false)} />}
    </>
  );
}
