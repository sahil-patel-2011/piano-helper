import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import {
  BRIDGE_DEFAULT_PORT,
  BRIDGE_MAX_LESSON_BYTES,
  IMPORT_EXTENSIONS,
  ImportBodySchema,
  MixerPatchSchema,
  OpenPieceBodySchema,
  coerceLesson,
  composeClaudePrompt,
  type BridgeDiscovery,
} from "@piano-helper/shared";
import { getLive, isConnected, jobs, sendCommand, setLive, touchConnected } from "./app-state.js";
import { copyImport, getPendingImport, getProfile, getSettings, listLibrary, loadLesson, newToken, saveLesson } from "./storage.js";
import { filePath } from "./paths.js";
import { runOmr } from "./omr.js";

let server: Server | null = null;
let discovery: BridgeDiscovery | null = null;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function err(res: ServerResponse, status: number, code: string, message: string) {
  json(res, status, { error: { code, message } });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > BRIDGE_MAX_LESSON_BYTES) throw new Error("payload too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function authorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  return Boolean(discovery && token && token === discovery.token);
}

function assertImportPath(raw: string): string {
  if (raw.startsWith("\\\\")) throw new Error("UNC paths are not allowed");
  const path = resolve(raw);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error("File not found");
  const ext = extname(path).toLowerCase();
  if (!IMPORT_EXTENSIONS.includes(ext as (typeof IMPORT_EXTENSIONS)[number])) {
    throw new Error("File type not allowed");
  }
  return path;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }
  if (!authorized(req)) {
    err(res, 401, "UNAUTHORIZED", "Missing or invalid token");
    return;
  }
  touchConnected();

  try {
    if (req.method === "GET" && url.pathname === "/v1/status") {
      const s = getLive();
      json(res, 200, {
        appVersion: "0.1.0",
        calibrated: s.calibrated,
        input: s.input,
        midiName: s.midiName,
        piece: s.pieceId ? { id: s.pieceId, title: s.pieceTitle, mode: s.mode, measure: s.measure } : null,
        connected: isConnected(),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/library") {
      json(res, 200, { items: await listLibrary() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/pending-import") {
      const pending = await getPendingImport();
      const settings = await getSettings();
      json(res, 200, {
        pending,
        model: settings.claudeModel,
        effort: settings.claudeEffort,
        prompt: pending?.prompt ?? composeClaudePrompt({
          extraPrompt: settings.extraPrompt,
          model: settings.claudeModel,
          effort: settings.claudeEffort,
          filePath: pending?.path,
        }),
        hint: pending
          ? "Read the score at pending.path, follow prompt, then call push_lesson. Include fingering."
          : "No score is waiting. Ask the user to drop a photo in Piano Helper, or attach one here and push_lesson.",
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/expected") {
      json(res, 200, { pitches: getLive().expected });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/session") {
      const s = getLive();
      json(res, 200, {
        elapsedMs: s.elapsedMs,
        measure: s.measure,
        measureCount: s.measureCount,
        accuracy: s.accuracy,
        lastHit: s.lastHit,
        lastMiss: s.lastMiss,
        mode: s.mode,
      });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/v1/jobs/")) {
      const id = url.pathname.slice("/v1/jobs/".length);
      const job = jobs.get(id);
      if (!job) {
        err(res, 404, "NOT_FOUND", "Job not found");
        return;
      }
      json(res, 200, job);
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/import") {
      const body = ImportBodySchema.parse(JSON.parse(await readBody(req)));
      const path = assertImportPath(body.path);
      const profile = await getProfile();
      if (!profile) {
        err(res, 400, "NOT_CALIBRATED", "Calibrate this device first.");
        return;
      }
      const settings = await getSettings();
      const id = randomUUID();
      jobs.set(id, { id, status: "running" });
      json(res, 202, { id, status: "running" });
      void (async () => {
        try {
          const copied = await copyImport(path);
          const lesson = await runOmr(copied.dest, settings.providerId, settings);
          await saveLesson(lesson);
          jobs.set(id, { id, status: "done", lesson });
          sendCommand({ type: "imported", lesson });
        } catch (e) {
          jobs.set(id, {
            id,
            status: "error",
            error: e instanceof Error ? e.message : "IMPORT_FAILED",
          });
        }
      })();
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/lessons") {
      const raw = JSON.parse(await readBody(req)) as { lesson?: unknown };
      const lesson = coerceLesson(raw.lesson ?? raw, "claude");
      await saveLesson(lesson);
      sendCommand({ type: "imported", lesson });
      json(res, 200, { ok: true, id: lesson.id, title: lesson.title });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/open") {
      const body = OpenPieceBodySchema.parse(JSON.parse(await readBody(req) || "{}"));
      const id = body.id ?? (body.title
        ? (await listLibrary()).find((i) => i.title.toLowerCase().includes(body.title!.toLowerCase()))?.id
        : undefined);
      if (!id) {
        err(res, 404, "NOT_FOUND", "Piece not found");
        return;
      }
      const lesson = await loadLesson(id);
      if (!lesson) {
        err(res, 404, "NOT_FOUND", "Piece not found");
        return;
      }
      sendCommand({
        type: "open",
        id,
        mode: body.mode,
        measures: body.measures,
        tempo: body.tempo,
        hands: body.hands,
      });
      json(res, 200, { ok: true, id, title: lesson.title });
      return;
    }
    if (req.method === "PATCH" && url.pathname === "/v1/mixer") {
      const patch = MixerPatchSchema.parse(JSON.parse(await readBody(req) || "{}"));
      sendCommand({ type: "mixer", patch });
      const next = { ...getLive(), mixer: { ...getLive().mixer, ...patch } };
      setLive(next);
      json(res, 200, { mixer: next.mixer });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/stop") {
      sendCommand({ type: "stop" });
      json(res, 200, { ok: true });
      return;
    }
    err(res, 404, "NOT_FOUND", "Unknown route");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    const code = message.includes("not allowed") || message.includes("UNC") ? "IMPORT_FAILED" : "INVALID_LESSON";
    err(res, 400, code, message);
  }
}

export function writeBridgeFile(disc: BridgeDiscovery | { alive: false }) {
  const payload = JSON.stringify(disc, null, 2);
  writeFileSync(filePath("bridge.json"), payload, "utf8");
  const extra = join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Piano Helper", "bridge.json");
  if (extra !== filePath("bridge.json")) {
    mkdirSync(dirname(extra), { recursive: true });
    writeFileSync(extra, payload, "utf8");
  }
}

export async function startBridge(appVersion: string): Promise<BridgeDiscovery> {
  await stopBridge();
  const token = newToken();
  await new Promise<void>((resolve, reject) => {
    server = createServer((req, res) => {
      void handle(req, res);
    });
    server.on("error", reject);
    const tryListen = (port: number) => {
      server!.listen(port, "127.0.0.1", () => {
        const address = server!.address();
        const used = typeof address === "object" && address ? address.port : port;
        discovery = {
          version: 1,
          name: "piano-helper",
          port: used,
          token,
          pid: process.pid,
          appVersion,
          alive: true,
        };
        writeBridgeFile(discovery);
        resolve();
      });
    };
    server.once("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EADDRINUSE") {
        server = createServer((req, res) => {
          void handle(req, res);
        });
        tryListen(0);
      } else reject(e);
    });
    tryListen(BRIDGE_DEFAULT_PORT);
  });
  return discovery!;
}

export async function stopBridge() {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
  if (discovery) {
    writeBridgeFile({ ...discovery, alive: false });
  }
  discovery = null;
}

export function getDiscovery(): BridgeDiscovery | null {
  return discovery;
}
