import { describe, expect, it } from "vitest";
import { coerceLesson, extractJsonObject } from "./omr-coerce.js";

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

  it("extracts JSON from markdown", () => {
    const data = extractJsonObject('Sure.\n```json\n{"title":"A","measures":[]}\n```');
    expect((data as { title: string }).title).toBe("A");
  });
});
