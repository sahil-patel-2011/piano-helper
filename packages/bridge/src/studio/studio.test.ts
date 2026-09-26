import { request } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Everything runs against a throwaway data folder and stand-in CLIs, so these
// tests never touch the real library and never need a signed-in subscription.
const data = mkdtempSync(join(tmpdir(), "piano-studio-"));
const stubBin = fileURLToPath(new URL("../../test/stub-bin", import.meta.url));
const stubLog = join(data, "stub-calls.log");
process.env.APPDATA = data;
process.env.XDG_CONFIG_HOME = data;
process.env.HOME = data;
process.env.PATH = `${stubBin}${delimiter}${process.env.PATH}`;
process.env.STUB_LOG = stubLog;
// Must be stripped before either CLI runs; the stubs fail loudly if it leaks through.
process.env.OPENAI_API_KEY = "sk-should-not-be-used";
process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-be-used";

type Server = typeof import("./server.js");
type Engines = typeof import("./engines.js");
type Store = typeof import("./store.js");

let server: Server;
let engines: Engines;
let store: Store;
let base = "";
let key = "";
let close: () => Promise<void> = async () => undefined;

const IMAGE = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4096, 7)]);

function calls() {
  try {
    return readFileSync(stubLog, "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function api<T = Record<string, unknown>>(path: string, init: RequestInit = {}, withKey = true): Promise<{ status: number; body: T }> {
  const res = await fetch(base + path, { ...init, headers: { ...(withKey ? { "x-piano-key": key } : {}), ...init.headers } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

async function importPhoto(): Promise<Record<string, unknown>> {
  const started = await api<{ id: string }>("/api/import?name=page.jpg", {
    method: "POST",
    body: IMAGE,
    headers: { "Content-Type": "application/octet-stream" },
  });
  expect(started.status).toBe(202);
  for (let i = 0; i < 200; i++) {
    const job = await api<{ status: string }>(`/api/jobs/${started.body.id}`);
    if (job.body.status !== "running") return job.body;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("import job never finished");
}

beforeAll(async () => {
  server = await import("./server.js");
  engines = await import("./engines.js");
  store = await import("./store.js");
  const info = await server.startStudio({ port: 0, https: false, bridgePort: 0, handleSignals: false });
  base = `http://127.0.0.1:${info.localPort}`;
  key = info.key;
  close = info.close;
});

afterAll(async () => {
  await close();
  rmSync(data, { recursive: true, force: true });
});

beforeEach(async () => {
  writeFileSync(stubLog, "");
  process.env.STUB_CLAUDE = "signed-out";
  process.env.STUB_CODEX = "good";
  await store.saveSettings({ ...(await store.getSettings()), omrEngine: "auto" });
});

describe("pairing", () => {
  it("refuses devices without the key from the QR code", async () => {
    expect((await api("/api/state", {}, false)).status).toBe(401);
    expect((await api<{ paired: boolean }>("/api/ping", {}, false)).body.paired).toBe(false);
    expect((await api<{ paired: boolean }>("/api/ping")).body.paired).toBe(true);
  });

  it("refuses requests for a hostname that isn't this computer", async () => {
    // fetch() won't let a page forge Host, but a DNS-rebinding attack arrives with one. Send it raw.
    const status = await new Promise<number>((done, fail) => {
      const req = request(`${base}/api/ping`, { headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        done(res.statusCode ?? 0);
      });
      req.on("error", fail);
      req.end();
    });
    expect(status).toBe(421);
  });

  it("only hands the key to pages opened on this computer", async () => {
    const html = await fetch(`${base}/`).then((r) => r.text());
    if (html.includes("__PH_STUDIO__")) expect(html).toContain(`"key":"${key}"`);
  });
});

describe("photo → lesson", () => {
  it("reads a photo with Codex when Claude Code is signed out", async () => {
    const job = await importPhoto();
    expect(job.status).toBe("done");
    expect(job.engine).toBe("codex");
    const lesson = job.lesson as { id: string; title: string; summary: string; measures: { tip?: string; events: { fingering?: number[]; uncertain?: boolean }[] }[] };
    expect(lesson.title).toBe("Ode to Joy");
    expect(lesson.summary).toMatch(/middle C/);
    expect(lesson.measures[0].tip).toMatch(/Middle finger/);
    expect(lesson.measures[0].events.map((e) => e.fingering?.[0])).toEqual([3, 3, 4, 5]);
    expect(lesson.measures[1].events[3].uncertain).toBe(true);
    // A photo never reuses the AI's id, so it can't hide the built-in "ode-to-joy".
    expect(lesson.id).not.toBe("ode-to-joy");

    const saved = await api<{ title: string }>(`/api/lessons/${lesson.id}`);
    expect(saved.body.title).toBe("Ode to Joy");
    const lib = await api<{ items: { id: string }[] }>("/api/library");
    expect(lib.body.items.map((i) => i.id)).toContain(lesson.id);

    const log = calls();
    expect(log[0]).toMatch(/^claude /);
    const codex = JSON.parse(log[1].slice("codex ".length)) as { args: string[]; promptHasImage: boolean; apiKey: boolean };
    expect(codex.promptHasImage).toBe(true);
    expect(codex.apiKey).toBe(false);
    expect(codex.args).toEqual(expect.arrayContaining(["exec", "--skip-git-repo-check", "-s", "read-only", "-i", "-o"]));
  });

  it("uses Claude Code when it is signed in", async () => {
    process.env.STUB_CLAUDE = "good";
    const job = await importPhoto();
    expect(job.status).toBe("done");
    expect(job.engine).toBe("claude");
    expect(calls()).toHaveLength(1);
    const claude = JSON.parse(calls()[0].slice("claude ".length)) as { args: string[]; apiKey: boolean };
    expect(claude.apiKey).toBe(false);
    expect(claude.args).toEqual(expect.arrayContaining(["-p", "--allowedTools", "Read"]));
  });

  it("asks again when the first answer isn't lesson JSON", async () => {
    process.env.STUB_CODEX = "garbage-once";
    const job = await importPhoto();
    expect(job.status).toBe("done");
    expect(calls().filter((l) => l.startsWith("codex"))).toHaveLength(2);
  });

  it("sticks to the chosen reader instead of falling back", async () => {
    await store.saveSettings({ ...(await store.getSettings()), omrEngine: "claude" });
    const job = await importPhoto();
    expect(job.status).toBe("error");
    expect(String(job.error)).toMatch(/claude/i);
    expect(calls().some((l) => l.startsWith("codex"))).toBe(false);
  });

  it("explains how to sign in when both are signed out", async () => {
    process.env.STUB_CODEX = "signed-out";
    const job = await importPhoto();
    expect(job.status).toBe("error");
    expect(String(job.error)).toMatch(/signed out/i);
  });

  it("rejects an empty upload", async () => {
    const res = await api("/api/import?name=x.jpg", { method: "POST", body: Buffer.alloc(10) });
    expect(res.status).toBe(400);
  });
});

describe("shared library and progress", () => {
  it("saves settings and progress on the computer for every device", async () => {
    const state = await api<{ settings: Record<string, unknown> }>("/api/state");
    const put = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ ...state.body.settings, dailyGoalMinutes: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(put.status).toBe(200);
    expect((await store.getSettings()).dailyGoalMinutes).toBe(20);

    const progress = { stats: { sessions: [], dailySeconds: { "2026-01-01": 60 }, lastActiveDate: "2026-01-01" }, measures: { x: { "1": { state: "mastered", cleanWaits: 3 } } } };
    await api("/api/progress", { method: "PUT", body: JSON.stringify(progress), headers: { "Content-Type": "application/json" } });
    expect((await store.getProgress()).stats.dailySeconds["2026-01-01"]).toBe(60);
  });

  it("refuses lesson ids that could escape the library folder", async () => {
    expect((await api("/api/lessons/..%2F..%2Fsettings")).status).toBe(404);
  });
});

describe("engine detection", () => {
  it("finds both CLIs and prefers Claude Code on automatic", () => {
    const status = engines.engineStatus("auto");
    expect(status.engines.every((e) => e.found)).toBe(true);
    expect(status.active).toBe("claude");
    expect(engines.engineStatus("codex").active).toBe("codex");
  });
});
