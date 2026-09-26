import { describe, expect, it } from "vitest";
import { expectedHit, unexpectedPitch, type HeardNote } from "./matcher.js";
import { calibrationPlan, octaveShiftNear, tuningOffset, type CalibrationPoint } from "./profile.js";

const mic = (midi: number, centsError = 0): HeardNote => ({ midi, centsError, rms: 0.1, source: "mic", t: 0 });
const key = (midi: number): HeardNote => ({ midi, centsError: 0, rms: 0.5, source: "midi", t: 0 });

describe("calibrationPlan", () => {
  it("starts at middle C and covers both ends of an 88-key piano", () => {
    const plan = calibrationPlan(88).map((s) => s.midi);
    expect(plan[0]).toBe(60);
    expect(plan).toContain(21);
    expect(plan).toContain(108);
    expect(new Set(plan).size).toBe(plan.length);
  });

  it("stays inside a 61-key keyboard", () => {
    const plan = calibrationPlan(61).map((s) => s.midi);
    expect(Math.min(...plan)).toBe(36);
    expect(Math.max(...plan)).toBe(96);
  });
});

describe("calibration corrections", () => {
  const points: CalibrationPoint[] = [
    { midi: 60, heard: 60, cents: -20, rms: 0.1 },
    { midi: 67, heard: 67, cents: -24, rms: 0.1 },
    { midi: 72, heard: 72, cents: -18, rms: 0.1 },
    { midi: 21, heard: 33, cents: null, rms: 0.05 },
    { midi: 108, heard: null, cents: null, rms: null },
  ];

  it("undoes a flat piano", () => {
    expect(tuningOffset(points)).toBe(20);
  });

  it("applies the octave slip only near the key that showed it", () => {
    expect(octaveShiftNear(points, 23)).toBe(12);
    expect(octaveShiftNear(points, 62)).toBe(0);
    expect(octaveShiftNear(points, 100)).toBe(0);
  });

  it("accepts a low note the mic reads an octave high", () => {
    const shiftFor = (m: number) => octaveShiftNear(points, m);
    expect(expectedHit([mic(33)], [21], 50, shiftFor)).toBe(true);
    expect(expectedHit([mic(33)], [21], 50)).toBe(false);
    expect(unexpectedPitch([mic(33)], [21], 50, shiftFor)).toBeNull();
  });
});

describe("chords", () => {
  it("needs one chord tone from the mic but every key from MIDI", () => {
    expect(expectedHit([mic(64)], [60, 64, 67], 50)).toBe(true);
    expect(expectedHit([key(64)], [60, 64, 67], 50)).toBe(false);
    expect(expectedHit([key(60), key(64), key(67)], [60, 64, 67], 50)).toBe(true);
  });

  it("accepts a chord the mic hears as its root an octave or two down", () => {
    expect(expectedHit([mic(36)], [60, 64, 67], 50)).toBe(true);
    expect(expectedHit([mic(38)], [60, 64, 67], 50)).toBe(false);
  });

  it("keeps single notes exact", () => {
    expect(expectedHit([mic(48)], [60], 50)).toBe(false);
  });

  it("still rejects a wrong key", () => {
    expect(expectedHit([mic(62)], [60, 64, 67], 50)).toBe(false);
    expect(unexpectedPitch([mic(62)], [60, 64, 67])).toBe(62);
  });
});
