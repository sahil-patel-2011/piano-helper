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
  type ShiftFor,
  type TimedHit,
} from "@piano-helper/shared";
import { estimatePace, smoothPace } from "@piano-helper/shared";

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
  /** The player's own tempo right now (null until a few notes are in). */
  paceBpm: number | null;
  writtenBpm: number;
};

type Options = {
  lesson: Lesson;
  mode: PracticeMode;
  hands: Hand | "all";
  measures?: [number, number];
  matchWindowCents: number;
  preferMidi: boolean;
  targetRepeats?: number;
  /** From this device's mic check: keys the mic hears an octave off. */
  shiftFor?: ShiftFor;
  /** Pace carried over from the last run, so a new loop starts at the player's speed. */
  initialPace?: number | null;
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
  /** Where the player really is: the last step played and when, so play-along follows them. */
  private anchor: TimedHit | null = null;
  private timedHits: TimedHit[] = [];
  private pace: number | null = null;
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
  private lastHitMidi: number[] = [];
  private lastHitAt = 0;
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
    this.anchor = null;
    this.timedHits = [];
    this.pace = this.opts.initialPace ?? null;
    if (this.opts.mode === "play") {
      // Play-along follows the player: no clock runs ahead of them.
      this.state = "playing";
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
    this.heard = notesInWindow(this.heard, now, 260);
    const event = this.events[this.cursor];
    if (!event) return;
    // Hands never land a chord at exactly the same instant; give multi-key steps longer.
    const windowMs = event.expectedMidi.length > 1 ? 250 : this.opts.mode === "play" ? 180 : 120;
    const recent = notesInWindow(this.heard, now, windowMs);
    const hit = expectedHit(recent, event.expectedMidi, this.opts.matchWindowCents, this.opts.shiftFor);
    if (hit) {
      this.registerHit(event, now);
      return;
    }
    // Score following: if the player has moved on to the next step or the one after,
    // go with them and count what they skipped. Not for the key that is still ringing.
    if (this.opts.mode === "play") {
      const ringing = (m: number) => now - this.lastHitAt < 500 && this.lastHitMidi.includes(m);
      for (const k of [1, 2]) {
        const ahead = this.events[this.cursor + k];
        if (!ahead || ahead.expectedMidi.some(ringing)) continue;
        if (expectedHit(recent, ahead.expectedMidi, this.opts.matchWindowCents, this.opts.shiftFor)) {
          this.attempts += k;
          this.spanDirty = true;
          this.consecutiveHits = 0;
          this.cursor += k;
          this.registerHit(ahead, now);
          return;
        }
      }
    }
    let extra = unexpectedPitch(recent, event.expectedMidi, this.opts.matchWindowCents, this.opts.shiftFor);
    // The key just played is still ringing when the next one is struck. Hearing it again is not a mistake.
    // After a chord, its ringing tail can alias to pitches that were never played; don't trust those either.
    if (
      extra !== null &&
      now - this.lastHitAt < 500 &&
      (this.lastHitMidi.length > 1 || this.lastHitMidi.some((m) => (((extra as number) - m) % 12 + 12) % 12 === 0))
    )
      extra = null;
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
    this.lastHitMidi = event.expectedMidi;
    this.lastHitAt = now;
    this.attempts += 1;
    this.hits += 1;
    const gap = now - this.lastEventAt;
    this.longestGap = Math.max(this.longestGap, gap);
    this.lastEventAt = now;
    if (this.opts.mode === "play" && this.anchor) {
      const window = Math.max(90, this.msPerBeat() * 0.2);
      if (Math.abs(now - this.expectedAt(event)) <= window) this.onTime += 1;
    }
    this.timedHits.push({ t: now, beat: event.absBeat });
    if (this.timedHits.length > 16) this.timedHits.shift();
    this.pace = smoothPace(this.pace, estimatePace(this.timedHits, this.opts.lesson.tempoBpm));
    this.anchor = { t: now, beat: event.absBeat };
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

  /** Milliseconds per beat at the player's pace (the written tempo until there is one). */
  private msPerBeat(): number {
    return 60000 / (this.pace ?? this.opts.lesson.tempoBpm);
  }

  /** When this step should land if the player keeps their current pace from the last note they played. */
  private expectedAt(event: FlatEvent): number {
    if (!this.anchor) return performance.now();
    const beats = Math.max(0, event.absBeat - this.anchor.beat);
    return this.anchor.t + beats * this.msPerBeat();
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
      paceBpm: this.pace === null ? null : Math.round(this.pace),
      writtenBpm: this.opts.lesson.tempoBpm,
    };
  }

  private emit() {
    this.onChange?.(this.snapshot());
  }
}
