import { describe, expect, it } from "vitest";
import { centsErrorHz, hzToMidi, midiToPitch, pitchToMidi } from "./pitch.js";
import { expectedHit } from "./matcher.js";
import { LessonSchema } from "./lesson.js";
import { computeStreak } from "./progress.js";

describe("pitch", () => {
  it("maps A4 to midi 69", () => {
    expect(Math.round(hzToMidi(440))).toBe(69);
    expect(pitchToMidi("A4")).toBe(69);
    expect(midiToPitch(60)).toBe("C4");
    expect(pitchToMidi("Bb2")).toBe(46);
  });

  it("measures cents at unison", () => {
    expect(Math.abs(centsErrorHz(440, 69))).toBeLessThan(1);
  });
});

describe("matcher", () => {
  it("hits expected MIDI note", () => {
    expect(
      expectedHit(
        [{ midi: 60, centsError: 0, rms: 0.1, source: "midi", t: 0 }],
        [60],
        35,
      ),
    ).toBe(true);
  });

  it("rejects a wrong pitch", () => {
    expect(
      expectedHit(
        [{ midi: 62, centsError: 200, rms: 0.1, source: "midi", t: 0 }],
        [60],
        35,
      ),
    ).toBe(false);
  });
});

describe("lesson zod", () => {
  it("accepts a valid lesson", () => {
    const lesson = LessonSchema.parse({
      id: "x",
      title: "X",
      source: "builtin",
      timeSignature: { num: 4, den: 4 },
      tempoBpm: 90,
      measures: [{ n: 1, events: [{ beat: 1, durationBeats: 1, pitches: ["C4"] }] }],
    });
    expect(lesson.measures[0].events[0].hand).toBe("rh");
  });

  it("rejects empty measures", () => {
    expect(() =>
      LessonSchema.parse({
        id: "x",
        title: "X",
        source: "builtin",
        timeSignature: { num: 4, den: 4 },
        tempoBpm: 90,
        measures: [],
      }),
    ).toThrow();
  });
});

describe("streak", () => {
  it("counts consecutive 5-minute days", () => {
    const now = new Date("2026-09-01T12:00:00");
    const daily = {
      "2026-09-01": 400,
      "2026-08-31": 400,
      "2026-08-30": 100,
    };
    expect(computeStreak(daily, now)).toBe(2);
  });
});
