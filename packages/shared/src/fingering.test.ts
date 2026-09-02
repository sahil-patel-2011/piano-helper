import { describe, expect, it } from "vitest";
import { flattenLesson, parseLesson } from "./lesson.js";
import { adviceAt, planFingering } from "./fingering.js";

const five = parseLesson({
  id: "five",
  title: "five",
  source: "builtin",
  timeSignature: { num: 4, den: 4 },
  tempoBpm: 80,
  measures: [
    {
      n: 1,
      events: [
        { beat: 1, durationBeats: 1, pitches: ["C4"], hand: "rh", fingering: [1] },
        { beat: 2, durationBeats: 1, pitches: ["D4"], hand: "rh", fingering: [2] },
        { beat: 3, durationBeats: 1, pitches: ["E4"], hand: "rh", fingering: [3] },
        { beat: 4, durationBeats: 1, pitches: ["F4"], hand: "rh", fingering: [4] },
        { beat: 1, durationBeats: 1, pitches: ["G4"], hand: "rh", fingering: [5] },
      ],
    },
  ],
});

const scale = parseLesson({
  id: "scale",
  title: "scale",
  source: "builtin",
  timeSignature: { num: 4, den: 4 },
  tempoBpm: 72,
  measures: [
    {
      n: 1,
      events: ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"].map((p, i) => ({
        beat: i + 1,
        durationBeats: 1,
        pitches: [p],
        hand: "rh",
      })),
    },
  ],
});

describe("fingering", () => {
  it("keeps written five-finger numbers", () => {
    const plan = planFingering(flattenLesson(five));
    expect(plan.map((p) => p.finger)).toEqual([1, 2, 3, 4, 5]);
    expect(plan[0].coach.toLowerCase()).toContain("thumb");
  });

  it("puts the thumb under on a C major scale", () => {
    const plan = planFingering(flattenLesson(scale));
    expect(plan.map((p) => p.finger)).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(plan[3].action).toBe("thumb-under");
    expect(plan[3].coach.toLowerCase()).toContain("thumb");
  });

  it("builds a hand shape around the current finger", () => {
    const tip = adviceAt(flattenLesson(five), 2);
    expect(tip?.finger).toBe(3);
    expect(tip?.shape[64]).toBe(3);
    expect(tip?.shape[60]).toBe(1);
    expect(tip?.shape[67]).toBe(5);
  });
});
