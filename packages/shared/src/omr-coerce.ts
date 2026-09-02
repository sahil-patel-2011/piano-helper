import { LessonSchema, type Lesson, type LessonSource } from "./lesson.js";
import { pitchToMidi } from "./pitch.js";

function slug(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "imported-score"}-${Date.now().toString(36)}`;
}

function normalizePitch(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/♮/g, "")
    .replace(/\s+/g, "");
  const m = s.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const pitch = `${m[1].toUpperCase()}${m[2] ?? ""}${m[3]}`;
  try {
    pitchToMidi(pitch);
    return pitch;
  } catch {
    return null;
  }
}

function pitchesFrom(value: unknown): string[] {
  const parts: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) parts.push(...String(item).split(/[\s,+/]+/));
  } else if (typeof value === "string") {
    parts.push(...value.split(/[\s,+/]+/));
  }
  const out: string[] = [];
  for (const part of parts) {
    const p = normalizePitch(part);
    if (p && !out.includes(p) && out.length < 3) out.push(p);
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function coerceLesson(data: unknown, source: LessonSource): Lesson {
  const raw = asRecord(data);
  const title = String(raw.title ?? raw.name ?? "Imported score").trim() || "Imported score";
  const measuresIn = Array.isArray(raw.measures) ? raw.measures : Array.isArray(data) ? data : [];
  const measures = measuresIn
    .map((m, i) => {
      const mr = asRecord(m);
      const eventsIn = Array.isArray(mr.events) ? mr.events : [];
      const events = eventsIn
        .map((e, j) => {
          const er = asRecord(e);
          const pitches = pitchesFrom(er.pitches ?? er.notes ?? er.note);
          if (!pitches.length) return null;
          const hand = er.hand === "lh" || er.hand === "both" ? er.hand : "rh";
          return {
            beat: Number(er.beat) > 0 ? Number(er.beat) : j + 1,
            durationBeats: Number(er.durationBeats) > 0 ? Number(er.durationBeats) : 1,
            pitches,
            hand,
            uncertain: Boolean(er.uncertain),
          };
        })
        .filter((e): e is NonNullable<typeof e> => Boolean(e));
      if (!events.length) return null;
      return { n: Number(mr.n) > 0 ? Number(mr.n) : i + 1, events };
    })
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  if (!measures.length) {
    throw new Error("Could not read notes on that page. Try a flatter, brighter photo of one staff.");
  }

  const ts = asRecord(raw.timeSignature);
  const lesson = {
    id: String(raw.id ?? "").trim() || slug(title),
    title,
    source:
      source === "pdf" ? "pdf" : source === "musicxml" ? "musicxml" : source === "claude" ? "claude" : "photo",
    timeSignature: {
      num: Number(ts.num) > 0 ? Number(ts.num) : 4,
      den: Number(ts.den) > 0 ? Number(ts.den) : 4,
    },
    tempoBpm: Number(raw.tempoBpm) > 0 ? Number(raw.tempoBpm) : 90,
    keySignature: String(raw.keySignature ?? "C") || "C",
    difficulty: Math.min(5, Math.max(1, Number(raw.difficulty) || 1)),
    measures,
  };
  return LessonSchema.parse(lesson);
}

export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? cleaned).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Claude did not return lesson JSON. Try the photo again.");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    const repaired = body
      .slice(start, end + 1)
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    return JSON.parse(repaired);
  }
}
