import { useState } from "react";
import type { Lesson } from "@piano-helper/shared";
import { getPiano } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";

export function EditorScreen() {
  const lesson = useAppStore((s) => s.lesson);
  const setLesson = useAppStore((s) => s.setLesson);
  const setScreen = useAppStore((s) => s.setScreen);
  const [draft, setDraft] = useState<Lesson | null>(lesson);

  if (!draft) {
    return (
      <div className="page">
        <p>Nothing to edit.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="stack" style={{ maxWidth: 960 }}>
        <h1>Edit notes</h1>
        <p className="muted">Gold rows were marked uncertain. Fix pitches like C4 or F#3, then practice.</p>
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        {draft.measures.map((measure, mi) => (
          <div key={measure.n} className="card">
            <div className="muted">Measure {measure.n}</div>
            {measure.events.map((ev, ei) => (
              <div key={ei} className="row" style={{ marginTop: 8, background: ev.uncertain ? "#2a2416" : undefined, padding: 6 }}>
                <input
                  value={ev.pitches.join(" ")}
                  onChange={(e) => {
                    const next = structuredClone(draft);
                    next.measures[mi].events[ei].pitches = e.target.value.trim().split(/\s+/);
                    next.measures[mi].events[ei].uncertain = false;
                    setDraft(next);
                  }}
                />
                <select
                  value={ev.hand}
                  onChange={(e) => {
                    const next = structuredClone(draft);
                    next.measures[mi].events[ei].hand = e.target.value as "rh" | "lh" | "both";
                    setDraft(next);
                  }}
                >
                  <option value="rh">RH</option>
                  <option value="lh">LH</option>
                  <option value="both">Both</option>
                </select>
              </div>
            ))}
          </div>
        ))}
        <div className="row">
          <button
            className="primary"
            onClick={async () => {
              await getPiano().saveLesson(draft);
              setLesson(draft);
              setScreen("practice");
            }}
          >
            Practice this
          </button>
        </div>
      </div>
    </div>
  );
}
