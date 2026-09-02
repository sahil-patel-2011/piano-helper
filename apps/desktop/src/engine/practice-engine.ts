import {
  expectedHit,
  filterMeasures,
  flattenLesson,
  notesInWindow,
  scoreStars,
  unexpectedPitch,
  type FlatEvent,
  type Hand,
  type HeardNote,
  type Lesson,
  type PracticeMode,
} from "@piano-helper/shared";

export type EngineState = "idle" | "ready" | "waiting" | "playing" | "paused" | "finished";

export type EngineSnapshot = {
  state: EngineState;
  cursor: number;
  events: FlatEvent[];
  expected: string[];
  expectedMidi: number[];
  measure: number;
  measureCount: number;
  hitMidi: number | null;
  missMidi: number | null;
  elapsedMs: number;
  accuracy: number;
  stars: number;
  cleanRepeats: number;
  lastHit: string | null;
  lastMiss: string | null;
  consecutiveHits: number;
  measureClean: boolean;
};

type Options = {
  lesson: Lesson;
  mode: PracticeMode;
  hands: Hand | "all";
  measures?: [number, number];
  matchWindowCents: number;
  preferMidi: boolean;
  targetRepeats?: number;
};

export class PracticeEngine {
  private opts: Options;
  private events: FlatEvent[];
  private state: EngineState = "ready";
  private cursor = 0;
  private heard: HeardNote[] = [];
  private startedAt = 0;
  private elapsedFrozen = 0;
  private hits = 0;
  private attempts = 0;
  private onTime = 0;
  private playStarted = 0;
  private lastEventAt = 0;
  private longestGap = 0;
  private cleanRepeats = 0;
  private spanDirty = false;
  private hitMidi: number | null = null;
  private missMidi: number | null = null;
  private lastHit: string | null = null;
  private lastMiss: string | null = null;
  private consecutiveHits = 0;
  private lastMidiAt = 0;
  private flashTimer: number | null = null;
  private playTimer: number | null = null;
  onChange: ((snap: EngineSnapshot) => void) | null = null;
  onMeasureClean: ((measure: number) => void) | null = null;

  constructor(opts: Options) {
    this.opts = opts;
    const slice = filterMeasures(opts.lesson, opts.measures?.[0], opts.measures?.[1]);
    this.events = flattenLesson(slice, opts.hands);
  }

  start() {
    this.cursor = 0;
    this.hits = 0;
    this.attempts = 0;
    this.onTime = 0;
    this.cleanRepeats = 0;
    this.spanDirty = false;
    this.startedAt = performance.now();
    this.lastEventAt = this.startedAt;
    if (this.opts.mode === "play") {
      this.state = "playing";
      this.playStarted = performance.now();
      this.armPlay();
    } else {
      this.state = "waiting";
    }
    this.emit();
  }

  pause() {
    if (this.state !== "waiting" && this.state !== "playing") return;
    this.elapsedFrozen += performance.now() - this.startedAt;
    this.state = "paused";
    this.clearPlay();
    this.emit();
  }

  resume() {
    if (this.state !== "paused") return;
    this.startedAt = performance.now();
    this.state = this.opts.mode === "play" ? "playing" : "waiting";
    if (this.state === "playing") this.armPlay();
    this.emit();
  }

  stop() {
    this.clearPlay();
    this.state = "ready";
    this.emit();
  }

  ingest(note: HeardNote) {
    if (note.source === "midi") this.lastMidiAt = note.t;
    if (note.source === "mic" && note.t - this.lastMidiAt < 280) return;
    if (this.state !== "waiting" && this.state !== "playing") return;
    this.heard.push(note);
    const now = performance.now();
    this.heard = notesInWindow(this.heard, now, 160);
    const event = this.events[this.cursor];
    if (!event) return;
    const windowMs = this.opts.mode === "play" ? 180 : 120;
    const recent = notesInWindow(this.heard, now, windowMs);
    const hit = expectedHit(recent, event.expectedMidi, this.opts.matchWindowCents);
    if (hit) {
      this.registerHit(event, now);
      return;
    }
    const extra = unexpectedPitch(recent, event.expectedMidi);
    if (extra !== null && this.opts.mode === "play") {
      this.flash("miss", extra, event.pitches[0] ?? null);
      this.attempts += 1;
      this.spanDirty = true;
      this.emit();
    } else if (extra !== null) {
      this.attempts += 1;
      this.spanDirty = true;
      this.flash("miss", extra, null);
      this.emit();
    }
  }

  private registerHit(event: FlatEvent, now: number) {
    this.attempts += 1;
    this.hits += 1;
    const gap = now - this.lastEventAt;
    this.longestGap = Math.max(this.longestGap, gap);
    this.lastEventAt = now;
    if (this.opts.mode === "play") {
      const expectedT = this.eventTime(event);
      const window = Math.max(80, (60 / this.opts.lesson.tempoBpm) * 1000 * 0.15);
      if (Math.abs(now - expectedT) <= window) this.onTime += 1;
    }
    this.consecutiveHits += 1;
    this.flash("hit", event.expectedMidi[0] ?? null, event.pitches.join(" "));
    this.advance();
  }

  private advance() {
    const leaving = this.events[this.cursor];
    this.cursor += 1;
    const next = this.events[this.cursor];
    if (leaving && (!next || next.measure !== leaving.measure) && !this.spanDirty) {
      this.onMeasureClean?.(leaving.measure);
    }
    if (this.cursor >= this.events.length) {
      if (this.opts.mode === "loop") {
        if (!this.spanDirty) this.cleanRepeats += 1;
        this.spanDirty = false;
        const target = this.opts.targetRepeats ?? 3;
        if (this.cleanRepeats >= target) {
          this.finish();
          return;
        }
        this.cursor = 0;
        this.state = "waiting";
        this.emit();
        return;
      }
      this.finish();
      return;
    }
    this.emit();
  }

  private finish() {
    this.clearPlay();
    this.state = "finished";
    this.emit();
  }

  private eventTime(event: FlatEvent): number {
    const msPerBeat = (60 / this.opts.lesson.tempoBpm) * 1000;
    let beats = 0;
    for (const e of this.events) {
      if (e.index === event.index) break;
      beats += e.durationBeats;
    }
    return this.playStarted + beats * msPerBeat;
  }

  private armPlay() {
    this.clearPlay();
    const tick = () => {
      if (this.state !== "playing") return;
      const event = this.events[this.cursor];
      if (!event) {
        this.finish();
        return;
      }
      const due = this.eventTime(event) + Math.max(80, (60 / this.opts.lesson.tempoBpm) * 1000 * 0.35);
      if (performance.now() > due) {
        this.attempts += 1;
        this.spanDirty = true;
        this.flash("miss", null, event.pitches[0] ?? null);
        this.advance();
      }
      this.playTimer = window.setTimeout(tick, 40);
    };
    this.playTimer = window.setTimeout(tick, 40);
  }

  private clearPlay() {
    if (this.playTimer) window.clearTimeout(this.playTimer);
    this.playTimer = null;
  }

  private flash(kind: "hit" | "miss", midi: number | null, label: string | null) {
    if (kind === "hit") {
      this.hitMidi = midi;
      this.missMidi = null;
      this.lastHit = label;
    } else {
      this.missMidi = midi;
      this.lastMiss = label;
      this.consecutiveHits = 0;
    }
    if (this.flashTimer) window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      this.hitMidi = null;
      this.missMidi = null;
      this.emit();
    }, 250);
  }

  snapshot(): EngineSnapshot {
    const event = this.events[this.cursor];
    const elapsed =
      this.state === "paused" || this.state === "ready" || this.state === "finished"
        ? this.elapsedFrozen + (this.state === "finished" ? 0 : 0)
        : this.elapsedFrozen + (this.startedAt ? performance.now() - this.startedAt : 0);
    const accuracy = this.attempts ? this.hits / this.attempts : 0;
    const stars = scoreStars({
      noteHitRate: accuracy,
      onTimeRate: this.attempts ? this.onTime / this.attempts : 0,
      finished: this.state === "finished",
      longestGapMs: this.longestGap,
    });
    return {
      state: this.state,
      cursor: this.cursor,
      events: this.events,
      expected: event?.pitches ?? [],
      expectedMidi: event?.expectedMidi ?? [],
      measure: event?.measure ?? this.opts.lesson.measures[this.opts.lesson.measures.length - 1]?.n ?? 1,
      measureCount: this.opts.lesson.measures.length,
      hitMidi: this.hitMidi,
      missMidi: this.missMidi,
      elapsedMs: elapsed,
      accuracy,
      stars,
      cleanRepeats: this.cleanRepeats,
      lastHit: this.lastHit,
      lastMiss: this.lastMiss,
      consecutiveHits: this.consecutiveHits,
      measureClean: !this.spanDirty,
    };
  }

  private emit() {
    this.onChange?.(this.snapshot());
  }
}
