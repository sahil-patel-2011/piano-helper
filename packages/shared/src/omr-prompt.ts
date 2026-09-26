import { effortLabel, modelLabel } from "./claude-models.js";

export const OMR_SCHEMA = `{
  "id": "string-slug",
  "title": "string",
  "source": "photo" | "pdf" | "claude",
  "timeSignature": { "num": 4, "den": 4 },
  "tempoBpm": 90,
  "keySignature": "C",
  "difficulty": 1,
  "summary": "Right hand starts with the thumb on middle C. Left hand rests.",
  "measures": [
    {
      "n": 1,
      "tip": "Climb 3-3-4-5, then hold.",
      "events": [
        {
          "beat": 1,
          "durationBeats": 1,
          "pitches": ["C4"],
          "hand": "rh",
          "fingering": [1],
          "uncertain": false
        }
      ]
    }
  ]
}`;

export const OMR_PROMPT = `You transcribe piano sheet music into Piano Helper lesson JSON.

Look at the attached score. Read every staff you can see.

Return ONLY valid JSON. No markdown. No commentary.

Schema:
${OMR_SCHEMA}

Pitch rules:
- Scientific pitch: C4, F#3, Bb2.
- One event = the notes ONE hand strikes together (up to 5 pitches). Both hands are separate events.
- Notes the two hands play at the same moment get the same measure "n" and the same "beat".
- Unreadable note: still emit it and set uncertain: true.
- Transcribe both hands completely, including full chords and held bass notes. Do not simplify.
- id is a short slug from the title. difficulty 1-5.

Hand and fingering (required — this drives the on-screen hand coach):
- hand is "rh" or "lh".
- fingering is piano finger numbers 1=thumb, 2=index, 3=middle, 4=ring, 5=pinky: EXACTLY one number per pitch, in the same order as "pitches". Every note gets a finger.
- Chords: fingers follow the spacing (RH C-E-G = 1-3-5, octave = 1-5; LH C-E-G = 5-3-1).
- Stay in a five-finger position when the notes fit (RH C-D-E-F-G = 1-2-3-4-5).
- RH ascending scale: 1-2-3-1-2-3-4-5 (thumb under after 3 when the run continues).
- LH five-finger C-G: 5-4-3-2-1.
- Do not put the thumb on a black key unless there is no comfortable alternative.
- If a stretch is wide, prefer a hand shift over crushing 1–5 on a second.
- Think: "if this finger is already here, which finger reaches the next key with the least twist?"
`;

export function composeClaudePrompt(opts: {
  extraPrompt?: string;
  model?: string;
  effort?: string;
  filePath?: string;
  task?: string;
}): string {
  const model = opts.model || "opus";
  const effort = opts.effort || "high";
  const task = opts.task || "Transcribe the score and assign intelligent fingering.";
  const parts = [
    `Piano Helper request. Use the user's Claude subscription (Max/Pro). Do not ask for an API key. Do not use usage-credit billing.`,
    `Preferred model: ${modelLabel(model)} (\`${model}\`). Reasoning effort: ${effortLabel(effort)} (${effort}).`,
    `If you are in Claude Desktop, switch the model picker to that model before you answer.`,
    task,
    OMR_PROMPT,
  ];
  if (opts.filePath) parts.push(`Score file:\n${opts.filePath}`);
  const extra = opts.extraPrompt?.trim();
  if (extra) {
    parts.push(`Additional instructions from the pianist (treat as part of the task):\n${extra}`);
  }
  parts.push("When you are done, call the piano-helper MCP tool push_lesson with the JSON. If MCP is unavailable, return ONLY the JSON object.");
  return parts.join("\n\n");
}

/** @deprecated use composeClaudePrompt */
export const SCORE_PROMPT = OMR_PROMPT;
