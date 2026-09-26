import { describe, expect, it } from "vitest";
import { coerceLesson, extractJsonObject } from "./omr-coerce.js";
import { composeClaudePrompt } from "./omr-prompt.js";

describe("coerceLesson", () => {
  it("normalizes messy Claude output into a playable lesson", () => {
    const lesson = coerceLesson(
      {
        title: " Mini minuet ",
        measures: [
          {
            events: [{ pitches: "C4, E4", beat: 1 }, { notes: ["Bb2"], uncertain: true }],
          },
        ],
      },
      "photo",
    );
    expect(lesson.title).toBe("Mini minuet");
    expect(lesson.source).toBe("photo");
    expect(lesson.measures[0].events[0].pitches).toEqual(["C4", "E4"]);
    expect(lesson.measures[0].events[1].pitches).toEqual(["Bb2"]);
    expect(lesson.measures[0].events[1].uncertain).toBe(true);
  });

  it("keeps fingering from Claude", () => {
    const lesson = coerceLesson(
      {
        title: "Scale",
        measures: [{ events: [{ pitches: ["C4"], hand: "rh", fingering: [1] }] }],
      },
      "claude",
    );
    expect(lesson.measures[0].events[0].fingering).toEqual([1]);
  });

  it("injects extra pianist instructions into the Claude prompt", () => {
    const text = composeClaudePrompt({
      extraPrompt: "Keep stretches under an octave.",
      model: "opus",
      effort: "high",
    });
    expect(text).toContain("Keep stretches under an octave.");
    expect(text).toContain("opus");
    expect(text).toContain("high");
    expect(text).toContain("subscription");
  });

  it("extracts JSON from markdown", () => {
    const data = extractJsonObject('Sure.\n```json\n{"title":"A","measures":[]}\n```');
    expect((data as { title: string }).title).toBe("A");
  });
});
