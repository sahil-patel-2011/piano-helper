import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import {
  OMR_PROMPT,
  coerceLesson,
  extractJsonObject,
  type AppSettings,
  type Lesson,
  type OmrEngine,
} from "@piano-helper/shared";

export type EngineId = "claude" | "codex";

export type EngineInfo = { id: EngineId; label: string; path: string | null; found: boolean };

export type EngineStatus = {
  engines: EngineInfo[];
  /** Engine that will read the next photo, or null when neither CLI is installed. */
  active: EngineId | null;
  preferred: OmrEngine;
};

function whichSync(name: string): string | null {
  const sep = process.platform === "win32" ? ";" : ":";
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + ext.toLowerCase());
      if (existsSync(candidate)) return candidate;
    }
    if (process.platform !== "win32" && existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

function findBin(id: EngineId): string | null {
  const home = homedir();
  const npmDir = join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "npm");
  const guesses =
    id === "claude"
      ? [
          whichSync("claude"),
          join(home, ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
          join(npmDir, "claude.cmd"),
          join(process.env.LOCALAPPDATA ?? "", "Programs", "claude", "claude.exe"),
        ]
      : [whichSync("codex"), join(npmDir, "codex.cmd"), join(home, ".local", "bin", "codex")];
  return guesses.find((p): p is string => Boolean(p && existsSync(p))) ?? null;
}

export function engineStatus(preferred: OmrEngine): EngineStatus {
  const engines: EngineInfo[] = (["claude", "codex"] as const).map((id) => {
    const path = findBin(id);
    return { id, label: id === "claude" ? "Claude Code" : "Codex", path, found: Boolean(path) };
  });
  const found = (id: EngineId) => engines.find((e) => e.id === id)?.found;
  let active: EngineId | null = null;
  if (preferred !== "auto" && found(preferred)) active = preferred;
  else if (found("claude")) active = "claude";
  else if (found("codex")) active = "codex";
  return { engines, active, preferred };
}

/** Strip API keys so both CLIs fall back to the signed-in Max/Pro or ChatGPT plan. */
function subscriptionEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  return env;
}

const quote = (s: string) => (/[\s"&|<>^]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function run(bin: string, args: string[], stdin: string, cwd: string, timeoutMs: number): Promise<{ out: string; err: string; code: number }> {
  return new Promise((resolve, reject) => {
    // npm-installed CLIs on Windows are .cmd shims, which Node only launches through a shell.
    const viaShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
    const child = viaShell
      ? spawn([bin, ...args].map(quote).join(" "), { shell: true, cwd, env: subscriptionEnv(), windowsHide: true })
      : spawn(bin, args, { cwd, env: subscriptionEnv(), windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The AI took too long reading that page. Try a closer photo of one or two lines of music."));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ out, err, code: code ?? 1 });
    });
    child.stdin.end(stdin);
  });
}

function loginHint(engine: EngineId, blob: string): string | null {
  if (!/oauth|authenticat|not logged in|logged out|run .{0,20}login|unauthori[sz]ed|session expired|token expired|401/i.test(blob)) return null;
  return engine === "claude"
    ? "Claude Code is signed out. In a terminal run `claude`, sign in with your Pro/Max plan, then try again."
    : "Codex is signed out. In a terminal run `codex login` with your ChatGPT plan, then try again.";
}

function studioPrompt(imagePath: string, settings: AppSettings, repair?: string): string {
  const parts = [
    "You are the score reader for Piano Helper, a practice app for adults who learn by keys and finger numbers instead of reading notation.",
    `Open and read the sheet-music image at: ${imagePath}`,
    OMR_PROMPT,
    [
      "Work carefully before you answer:",
      "1. Find the clef of each staff, the key signature (apply its sharps/flats to every affected note) and the time signature.",
      "2. Read bar by bar. Check that the durations in every bar add up to the time signature; re-read any bar that does not.",
      "3. Treble staff is the right hand, bass staff the left hand. Transcribe everything written for both hands (full chords, held bass notes). Give notes that sound together the same beat so they are played together.",
      "4. Choose fingering for EVERY note, as a piano teacher would for this piece: plan each hand's positions ahead, few hand shifts, the same fingers for repeated patterns, thumb-under/cross-over in runs, no thumb on black keys. The player memorises by hand position and never reads the music.",
      "5. Write `summary`: where each hand starts (e.g. 'Right thumb on middle C'). Write a short `tip` for every bar that helps remember it by feel or by comparison (e.g. 'Same as bar 1, then walk down'). Plain words, no note-reading jargon.",
      "Mark any note you are unsure of with uncertain: true rather than guessing silently.",
    ].join("\n"),
  ];
  const extra = settings.extraPrompt.trim();
  if (extra) parts.push(`Additional instructions from the pianist:\n${extra}`);
  if (repair) parts.push(`Your previous answer was not valid lesson JSON. Fix it and return only JSON.\nPrevious answer:\n${repair.slice(0, 6000)}`);
  parts.push("Reply with ONLY the JSON object. Do not call tools other than reading the image. Do not write files.");
  return parts.join("\n\n");
}

async function askClaude(bin: string, imagePath: string, settings: AppSettings, repair?: string): Promise<string> {
  const dir = dirname(imagePath);
  const args = [
    "-p",
    "--output-format",
    "text",
    "--model",
    settings.claudeModel || "opus",
    "--effort",
    settings.claudeEffort || "high",
    "--allowedTools",
    "Read",
    "--add-dir",
    dir,
  ];
  const res = await run(bin, args, studioPrompt(imagePath, settings, repair), dir, 240_000);
  const hint = loginHint("claude", `${res.err}\n${res.code !== 0 ? res.out : ""}`);
  if (hint) throw new Error(hint);
  if (res.code !== 0 && !res.out.trim()) throw new Error(res.err.trim() || "Claude Code exited without an answer.");
  return res.out;
}

async function askCodex(bin: string, imagePath: string, settings: AppSettings, repair?: string): Promise<string> {
  if (extname(imagePath).toLowerCase() === ".pdf") {
    throw new Error("Codex reads photos, not PDFs. Screenshot the page, or switch the reader to Claude Code in Settings.");
  }
  const dir = dirname(imagePath);
  const outFile = join(dir, "codex-answer.txt");
  const effort = settings.claudeEffort === "max" ? "xhigh" : settings.claudeEffort;
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "-s",
    "read-only",
    "-C",
    dir,
    "-i",
    imagePath,
    "-o",
    outFile,
    "-c",
    `model_reasoning_effort=${effort}`,
    ...(settings.codexModel ? ["-m", settings.codexModel] : []),
    "-",
  ];
  const res = await run(bin, args, studioPrompt(basename(imagePath), settings, repair), dir, 300_000);
  const answer = await readFile(outFile, "utf8").catch(() => "");
  await rm(outFile, { force: true });
  const hint = loginHint("codex", `${res.err}\n${answer ? "" : res.out}`);
  if (!answer.trim() && hint) throw new Error(hint);
  if (!answer.trim() && !res.out.trim()) throw new Error(res.err.trim().split("\n").slice(-3).join(" ") || "Codex exited without an answer.");
  return answer || res.out;
}

export type ScoreReading = {
  lesson: Lesson;
  engine: EngineId;
  /** Everything the AI answered, verbatim (a second entry means it was asked to fix its JSON). */
  raw: string[];
};

/** The only place the app talks to an AI: one photo in, one lesson out. */
export async function readScore(imagePath: string, settings: AppSettings): Promise<ScoreReading> {
  const status = engineStatus(settings.omrEngine);
  const engine = status.active;
  if (!engine) {
    throw new Error("No reader found. Install Claude Code (claude) or Codex (codex) on this computer and sign in once.");
  }
  const source: Lesson["source"] = extname(imagePath).toLowerCase() === ".pdf" ? "pdf" : "photo";
  // In automatic mode a signed-out CLI should not block the other one.
  const order = [engine, ...(settings.omrEngine === "auto" ? status.engines.filter((e) => e.found && e.id !== engine).map((e) => e.id) : [])];
  let lastError: unknown = null;
  for (const id of order) {
    const bin = status.engines.find((e) => e.id === id)!.path!;
    const ask = id === "claude" ? askClaude : askCodex;
    try {
      const first = await ask(bin, imagePath, settings);
      try {
        return { lesson: coerceLesson(extractJsonObject(first), source), engine: id, raw: [first] };
      } catch {
        const second = await ask(bin, imagePath, settings, first);
        return { lesson: coerceLesson(extractJsonObject(second), source), engine: id, raw: [first, second] };
      }
    } catch (e) {
      lastError = e;
      if (!(e instanceof Error && /signed out/i.test(e.message))) throw e;
    }
  }
  throw lastError;
}
