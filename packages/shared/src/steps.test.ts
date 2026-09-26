import { describe, expect, it } from "vitest";
import { flattenLesson, parseLesson } from "./lesson.js";
import { planSteps } from "./fingering.js";
import { estimatePace } from "./tempo.js";

const twoHands = parseLesson({
  id: "two",
  title: "Two hands",
  source: "photo",
  timeSignature: { num: 4, den: 4 },
  tempoBpm: 80,
  measures: [
    {
      n: 1,
      // Written right hand first, then left hand, as the AI usually returns it.
      events: [
        { beat: 1, durationBeats: 1, pitches: ["C5", "E5", "G5"], hand: "rh", fingering: [1, 3, 5] },
        { beat: 2, durationBeats: 1, pitches: ["D5"], hand: "rh" },
        { beat: 3, durationBeats: 2, pitches: ["E5"], hand: "rh", fingering: [3] },
        { beat: 1, durationBeats: 2, pitches: ["C3", "G3"], hand: "lh" },
        { beat: 3, durationBeats: 2, pitches: ["G2"], hand: "lh", fingering: [5] },
      ],
    },
  ],
});

describe("steps", () => {
  it("plays both hands together when they start on the same beat", () => {
    const steps = flattenLesson(twoHands);
    expect(steps.map((s) => s.pitches)).toEqual([["C5", "E5", "G5", "C3", "G3"], ["D5"], ["E5", "G2"]]);
    expect(steps.map((s) => s.absBeat)).toEqual([0, 1, 2]);
    expect(steps[0].hand).toBe("both");
  });

  it("keeps one hand when the other is filtered out", () => {
    expect(flattenLesson(twoHands, "lh").map((s) => s.pitches)).toEqual([["C3", "G3"], ["G2"]]);
  });

  it("gives every key a finger, chords and both hands included", () => {
    const plan = planSteps(flattenLesson(twoHands));
    const first = plan[0].notes.map((n) => `${n.pitch}:${n.hand}${n.finger}`);
    expect(first).toEqual(["C5:rh1", "E5:rh3", "G5:rh5", "C3:lh5", "G3:lh1"]);
    expect(plan.every((p) => p.notes.every((n) => n.finger >= 1 && n.finger <= 5))).toBe(true);
    expect(plan[1].notes[0].finger).toBe(2); // D between thumb-C and middle-E
  });

  it("draws both hands, and shows the idle one resting", () => {
    const plan = planSteps(flattenLesson(twoHands));
    expect(plan[0].hands.map((h) => [h.side, h.resting, h.active.sort()])).toEqual([
      ["rh", false, [1, 3, 5]],
      ["lh", false, [1, 5]],
    ]);
    const lhWhileRightPlays = plan[1].hands.find((h) => h.side === "lh");
    expect(lhWhileRightPlays?.resting).toBe(true);
    expect(lhWhileRightPlays?.shape[48]).toBe(5); // still waiting on C3
    // Pressed keys always carry their finger in the hand shape.
    expect(plan[0].hands[0].shape[76]).toBe(3);
  });
});

describe("pace", () => {
  const hits = (bpm: number, n: number, start = 0) => Array.from({ length: n }, (_, i) => ({ t: start + (i * 60000) / bpm, beat: i }));

  it("follows a player slower than written", () => {
    expect(Math.round(estimatePace(hits(60, 6), 100) ?? 0)).toBe(60);
  });

  it("follows a player who speeds up", () => {
    const slow = hits(70, 4);
    const fast = hits(110, 6, slow[3].t + 60000 / 110).map((h) => ({ ...h, beat: h.beat + 4 }));
    expect(Math.round(estimatePace([...slow, ...fast], 90) ?? 0)).toBe(110);
  });

  it("ignores a pause", () => {
    const h = hits(90, 6);
    h.push({ t: h[5].t + 8000, beat: 6 });
    expect(Math.round(estimatePace(h, 90) ?? 0)).toBe(90);
  });

  it("waits for a few notes before guessing", () => {
    expect(estimatePace(hits(90, 2), 90)).toBeNull();
  });
});
