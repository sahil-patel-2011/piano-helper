/**
 * Live end-to-end test on the REAL subscription: `npm run test:live`.
 *
 * Starts the studio against a throwaway data folder, uploads real score photos, and lets
 * the signed-in Claude Code or Codex read them, exactly as a phone would. Then checks:
 *   - every note, in both hands, is what the page says
 *   - every key has a finger
 *   - the AI's answer is saved word for word next to the photo
 *   - the same photo again is answered from the saved copy with no AI call
 *
 * Each run uses two AI reads from your plan. Options: --engine claude|codex, --only ode|chorale
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

const data = mkdtempSync(join(tmpdir(), "piano-live-"));
process.env.APPDATA = data;
process.env.XDG_CONFIG_HOME = data;

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));

type Case = { name: string; file: string; steps: string[]; title: RegExp };
const CASES: Case[] = [
  {
    name: "ode",
    file: "ode-to-joy.jpg",
    title: /ode/i,
    steps: ["E4", "E4", "F4", "G4", "G4", "F4", "E4", "D4", "C4", "C4", "D4", "E4", "E4", "D4", "D4"],
  },
  {
    name: "chorale",
    file: "two-hand-chorale.jpg",
    title: /chorale/i,
    // Both hands; notes struck together are one step.
    steps: ["C3 E4 G4 C5", "D5", "G2 E5", "C5", "G2 D3 F4 A4 D5", "C5", "B4"],
  },
];

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  const { startStudio } = await import("../src/studio/server.js");
  const store = await import("../src/studio/store.js");
  const { engineStatus } = await import("../src/studio/engines.js");
  const { flattenLesson, planSteps, pitchToMidi, midiToPitch } = await import("@piano-helper/shared");

  const engine = flag("--engine");
  await store.initStore();
  if (engine === "claude" || engine === "codex") await store.saveSettings({ ...(await store.getSettings()), omrEngine: engine });
  const status = engineStatus((await store.getSettings()).omrEngine);
  console.log(`\n  Live test · reader: ${status.active ?? "none"} ${dim(`(installed: ${status.engines.filter((e) => e.found).map((e) => e.id).join(", ") || "none"})`)}`);
  if (!status.active) throw new Error("No Claude Code or Codex found on PATH.");

  const info = await startStudio({ port: 0, https: false, bridgePort: 0, handleSignals: false });
  const base = `http://127.0.0.1:${info.localPort}`;
  const api = async <T>(path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, { ...init, headers: { "x-piano-key": info.key, ...init.headers } });
    return (await res.json()) as T;
  };

  let failures = 0;
  const check = (ok: boolean, label: string, detail = "") => {
    console.log(`    ${ok ? green("✓") : red("✗")} ${label}${detail ? dim(`  ${detail}`) : ""}`);
    if (!ok) failures += 1;
  };

  const only = flag("--only");
  for (const c of CASES.filter((x) => !only || x.name === only)) {
    console.log(`\n  ${c.file}`);
    const photo = readFileSync(join(fixtures, c.file));
    const t0 = Date.now();
    const started = await api<{ id: string; status: string }>(`/api/import?name=${c.file}`, {
      method: "POST",
      body: photo,
      headers: { "Content-Type": "application/octet-stream" },
    });
    type Job = { status: string; engine?: string; error?: string; cached?: boolean; lesson?: import("@piano-helper/shared").Lesson };
    let job: Job = started as Job;
    while (job.status === "running") {
      await new Promise((r) => setTimeout(r, 2000));
      job = await api<Job>(`/api/jobs/${started.id}`);
      process.stdout.write(dim(`\r    reading… ${Math.round((Date.now() - t0) / 1000)}s`));
    }
    process.stdout.write("\r" + " ".repeat(30) + "\r");
    check(job.status === "done", `AI read the photo with ${job.engine ?? "?"}`, job.error ?? `${Math.round((Date.now() - t0) / 1000)}s`);
    if (!job.lesson) continue;
    const lesson = job.lesson;

    check(c.title.test(lesson.title), "title", lesson.title);
    const got = flattenLesson(lesson).map((s) =>
      s.expectedMidi
        .slice()
        .sort((a, b) => a - b)
        .map((m) => midiToPitch(m))
        .join(" "),
    );
    const want = c.steps.map((s) => s.split(" ").map((p) => midiToPitch(pitchToMidi(p))).join(" "));
    const wrong = want.map((w, i) => (w === got[i] ? null : `step ${i + 1}: wanted ${w}, got ${got[i] ?? "nothing"}`)).filter(Boolean);
    check(got.length === want.length && wrong.length === 0, `every note right (${want.length} steps)`, wrong.join("; ") || (got.length !== want.length ? `got ${got.length} steps` : ""));

    const plan = planSteps(flattenLesson(lesson));
    const fingered = plan.flatMap((p) => p.notes).every((n) => n.finger >= 1 && n.finger <= 5);
    check(fingered, "a finger on every key", plan.map((p) => p.notes.map((n) => `${n.hand === "lh" ? "L" : "R"}${n.finger}`).join("+")).join(" "));
    const aiFingered = lesson.measures.flatMap((m) => m.events).every((e) => e.fingering?.length === e.pitches.length);
    check(aiFingered, "the AI itself gave a finger for every note");
    check(Boolean(lesson.summary) && lesson.measures.every((m) => Boolean(m.tip)), "start position + a tip for every bar", lesson.summary ?? "");

    const dir = join(data, "Piano Helper", "imports", lesson.origin?.importId ?? "missing");
    const raw = existsSync(join(dir, "ai-output.txt")) ? readFileSync(join(dir, "ai-output.txt"), "utf8") : "";
    check(raw.length > 50, "AI answer saved word for word", `${raw.length} chars → ${join("imports", lesson.origin?.importId ?? "?", "ai-output.txt")}`);

    const t1 = Date.now();
    const again = await api<Job & { cached?: boolean }>(`/api/import?name=${c.file}`, {
      method: "POST",
      body: photo,
      headers: { "Content-Type": "application/octet-stream" },
    });
    check(Boolean(again.cached) && again.lesson?.id === lesson.id, "same photo again → saved notes, no AI call", `${Date.now() - t1} ms`);
  }

  await info.close();
  rmSync(data, { recursive: true, force: true });
  console.log(failures ? red(`\n  ${failures} check(s) failed\n`) : green("\n  All live checks passed\n"));
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(red(`\n  ${e instanceof Error ? e.message : e}\n`));
  rmSync(data, { recursive: true, force: true });
  process.exit(1);
});
