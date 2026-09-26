// Stand-in for the real `claude` / `codex` CLIs so the photo pipeline can be tested
// without a signed-in subscription. Behaviour is chosen per test via STUB_<NAME> env vars.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const name = process.argv[2];
const args = process.argv.slice(3);
const mode = process.env[`STUB_${name.toUpperCase()}`] ?? "signed-out";
const log = process.env.STUB_LOG;

const lesson = {
  id: "ode-to-joy",
  title: "Ode to Joy",
  timeSignature: { num: 4, den: 4 },
  tempoBpm: 96,
  summary: "Right thumb on middle C, one finger per white key up to G.",
  measures: [
    { n: 1, tip: "Middle finger twice, then ring, then pinky.", events: ["E4", "E4", "F4", "G4"].map((p, i) => ({ beat: i + 1, durationBeats: 1, pitches: [p], hand: "rh", fingering: [[3, 3, 4, 5][i]] })) },
    { n: 2, tip: "Walk back down: 5-4-3-2.", events: ["G4", "F4", "E4", "D4"].map((p, i) => ({ beat: i + 1, durationBeats: 1, pitches: [p], hand: "rh", fingering: [[5, 4, 3, 2][i]], uncertain: i === 3 })) },
  ],
};

let stdin = "";
process.stdin.on("data", (d) => (stdin += d));
process.stdin.on("end", () => {
  const argAfter = (flag) => args[args.indexOf(flag) + 1];
  const calls = log && existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((l) => l.startsWith(name)).length : 0;
  if (log) appendFileSync(log, `${name} ${JSON.stringify({ args, promptHasImage: /sheet-music image/.test(stdin), apiKey: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) })}\n`);

  if (mode === "signed-out") {
    console.log("Failed to authenticate: OAuth session expired and could not be refreshed");
    process.exit(1);
  }
  if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
    console.error("stub: an API key leaked into the CLI environment");
    process.exit(3);
  }
  const garbage = mode === "garbage-once" && calls === 0;
  const answer = garbage ? "I looked at the page and I think it is a melody in C." : "Here is the lesson:\n```json\n" + JSON.stringify(lesson) + "\n```\n";
  if (name === "codex") {
    const image = argAfter("-i");
    if (!existsSync(image)) {
      console.error(`stub: image not found ${image}`);
      process.exit(2);
    }
    writeFileSync(argAfter("-o"), answer);
  } else {
    process.stdout.write(answer);
  }
});
