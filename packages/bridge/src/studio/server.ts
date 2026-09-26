import { createServer as createHttp, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createHttps } from "node:https";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRIDGE_DEFAULT_PORT,
  MixerPatchSchema,
  OpenPieceBodySchema,
  coerceLesson,
  type Lesson,
} from "@piano-helper/shared";
import { appDataDir, bridgePath } from "../paths.js";
import { engineStatus, readScore } from "./engines.js";
import {
  getProgress,
  getSettings,
  initStore,
  listLibrary,
  loadLesson,
  saveLesson,
  saveProgress,
  saveSettings,
  saveUpload,
  studioDir,
} from "./store.js";
import { lanAddresses, loadOrCreateCert } from "./tls.js";

const here = dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = resolve(here, "..", "..", "..", "..", "apps", "desktop", "dist");

const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;

type Job = { id: string; status: "running" | "done" | "error"; engine?: string; lesson?: Lesson; error?: string; startedAt: number };
type Live = Record<string, unknown>;

const jobs = new Map<string, Job>();
const clients = new Set<ServerResponse>();
let live: Live = { screen: "idle", expected: [] };
let pairKey = "";

// ---------------------------------------------------------------- helpers

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, status: number, message: string, code = "ERROR") {
  send(res, status, { error: { code, message } });
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > limit) throw Object.assign(new Error("That file is too big (25 MB max)."), { status: 413 });
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
  const raw = (await readBody(req, MAX_JSON)).toString("utf8");
  return (raw ? JSON.parse(raw) : {}) as T;
}

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function broadcast(event: Record<string, unknown>) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(line);
}

/** Blocks DNS-rebinding: only answer to hostnames that really are this machine. */
function hostAllowed(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  const ok = new Set(["localhost", "127.0.0.1", "::1", hostname().toLowerCase(), `${hostname().toLowerCase()}.local`, ...lanAddresses()]);
  return ok.has(host) || host.endsWith(".ts.net");
}

async function loadPairKey(): Promise<string> {
  const path = join(studioDir(), "pair-key.txt");
  try {
    const saved = (await readFile(path, "utf8")).trim();
    if (saved.length >= 16) return saved;
  } catch {
    /* first run */
  }
  const key = randomBytes(12).toString("base64url");
  writeFileSync(path, key, "utf8");
  return key;
}

// ---------------------------------------------------------------- static app

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

let indexCache: { mtimeMs: number; html: string } | null = null;

/** Re-read after a rebuild: the shell names the hashed asset files. */
async function indexHtml(): Promise<string> {
  const path = join(WEB_ROOT, "index.html");
  const { mtimeMs } = await stat(path);
  if (!indexCache || indexCache.mtimeMs !== mtimeMs) indexCache = { mtimeMs, html: await readFile(path, "utf8") };
  return indexCache.html;
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL, trustedLocal: boolean) {
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const target = resolve(WEB_ROOT, rel);
  if (target !== WEB_ROOT && !target.startsWith(WEB_ROOT + sep)) {
    fail(res, 403, "Forbidden");
    return;
  }
  const isFile = rel && existsSync(target) && (await stat(target)).isFile();
  if (isFile && extname(target) !== ".html") {
    const immutable = rel.startsWith("assets" + sep) || rel.startsWith("assets/");
    res.writeHead(200, {
      "Content-Type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(await readFile(target));
    return;
  }
  // SPA: every other path gets the app shell with the studio flag injected.
  const boot = { studio: true, key: trustedLocal ? pairKey : null };
  const html = (await indexHtml()).replace("<head>", `<head><script>window.__PH_STUDIO__=${JSON.stringify(boot)}</script>`);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(html);
  void req;
}

// ---------------------------------------------------------------- device API

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (path === "/api/ping") {
    const key = String(req.headers["x-piano-key"] ?? "");
    send(res, 200, { ok: true, paired: Boolean(key) && sameSecret(key, pairKey) });
    return;
  }

  // EventSource cannot send headers, so the events stream takes the key as a query param.
  const key = String(req.headers["x-piano-key"] ?? (path === "/api/events" ? url.searchParams.get("key") ?? "" : ""));
  if (!key || !sameSecret(key, pairKey)) {
    fail(res, 401, "This device is not paired. Scan the QR code in the terminal again.", "UNPAIRED");
    return;
  }

  if (method === "GET" && path === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }
  if (method === "GET" && path === "/api/state") {
    const [settings, progress, library] = await Promise.all([getSettings(), getProgress(), listLibrary()]);
    send(res, 200, { settings, progress, library });
    return;
  }
  if (method === "GET" && path === "/api/status") {
    const settings = await getSettings();
    send(res, 200, { ...engineStatus(settings.omrEngine), dataDir: appDataDir(), lan: lanAddresses() });
    return;
  }
  if (method === "PUT" && path === "/api/settings") {
    await saveSettings(await readJsonBody(req));
    send(res, 200, { ok: true });
    return;
  }
  if (method === "PUT" && path === "/api/progress") {
    const body = await readJsonBody<{ stats: unknown; measures: unknown }>(req);
    await saveProgress(body.stats, body.measures);
    send(res, 200, { ok: true });
    return;
  }
  if (method === "GET" && path === "/api/library") {
    send(res, 200, { items: await listLibrary() });
    return;
  }
  if (method === "GET" && path.startsWith("/api/lessons/")) {
    const lesson = await loadLesson(decodeURIComponent(path.slice("/api/lessons/".length)));
    if (!lesson) fail(res, 404, "Piece not found", "NOT_FOUND");
    else send(res, 200, lesson);
    return;
  }
  if (method === "PUT" && path === "/api/lessons") {
    const lesson = await saveLesson(await readJsonBody(req));
    broadcast({ type: "library" });
    send(res, 200, { ok: true, id: lesson.id });
    return;
  }
  if (method === "POST" && path === "/api/import") {
    const name = url.searchParams.get("name") || "score.jpg";
    const bytes = await readBody(req, MAX_UPLOAD);
    if (bytes.length < 100) {
      fail(res, 400, "That file was empty.");
      return;
    }
    const settings = await getSettings();
    if (!engineStatus(settings.omrEngine).active) {
      fail(res, 503, "No reader found. Install Claude Code or Codex on the studio computer and sign in once.", "NO_PROVIDER");
      return;
    }
    const imagePath = await saveUpload(name, bytes);
    const job: Job = { id: randomUUID(), status: "running", startedAt: Date.now() };
    jobs.set(job.id, job);
    send(res, 202, { id: job.id, status: job.status });
    log(`reading ${name} (${Math.round(bytes.length / 1024)} KB)…`);
    void readScore(imagePath, settings)
      .then(async ({ lesson, engine }) => {
        const saved = await saveLesson(lesson);
        Object.assign(job, { status: "done", lesson: saved, engine });
        broadcast({ type: "library" });
        log(`read "${saved.title}" with ${engine} in ${Math.round((Date.now() - job.startedAt) / 1000)}s`);
      })
      .catch((e: unknown) => {
        Object.assign(job, { status: "error", error: e instanceof Error ? e.message : "Could not read that page." });
        log(`import failed: ${job.error}`);
      });
    return;
  }
  if (method === "GET" && path.startsWith("/api/jobs/")) {
    const job = jobs.get(path.slice("/api/jobs/".length));
    if (!job) fail(res, 404, "Job not found", "NOT_FOUND");
    else send(res, 200, { ...job, elapsedMs: Date.now() - job.startedAt });
    return;
  }
  if (method === "POST" && path === "/api/live") {
    live = await readJsonBody<Live>(req);
    send(res, 200, { ok: true });
    return;
  }
  fail(res, 404, "Unknown route", "NOT_FOUND");
}

// ---------------------------------------------------------------- Claude MCP bridge (/v1, localhost only)

let bridgeToken = "";

async function handleBridge(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/health") {
    send(res, 200, { ok: true });
    return;
  }
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !sameSecret(token, bridgeToken)) {
    fail(res, 401, "Missing or invalid token", "UNAUTHORIZED");
    return;
  }
  const p = url.pathname;
  const m = req.method ?? "GET";
  if (m === "GET" && p === "/v1/status") {
    send(res, 200, {
      appVersion: "0.1.0",
      mode: "studio",
      calibrated: Boolean(live.calibrated),
      input: live.input ?? "mic",
      piece: live.pieceId ? { id: live.pieceId, title: live.pieceTitle, mode: live.mode, measure: live.measure } : null,
      connected: clients.size > 0,
      devices: clients.size,
    });
    return;
  }
  if (m === "GET" && p === "/v1/library") return send(res, 200, { items: await listLibrary() });
  if (m === "GET" && p === "/v1/expected") return send(res, 200, { pitches: live.expected ?? [] });
  if (m === "GET" && p === "/v1/session") return send(res, 200, live);
  if (m === "GET" && p === "/v1/pending-import") {
    return send(res, 200, { pending: null, hint: "Studio mode: photos are read automatically. Attach a score here and call push_lesson." });
  }
  if (m === "POST" && p === "/v1/lessons") {
    const raw = await readJsonBody<{ lesson?: unknown }>(req);
    const lesson = await saveLesson(coerceLesson(raw.lesson ?? raw, "claude"));
    broadcast({ type: "imported", lesson });
    return send(res, 200, { ok: true, id: lesson.id, title: lesson.title });
  }
  if (m === "POST" && p === "/v1/open") {
    const body = OpenPieceBodySchema.parse(await readJsonBody(req));
    const needle = body.title?.toLowerCase();
    const id = body.id ?? (needle ? (await listLibrary()).find((i) => i.title.toLowerCase().includes(needle))?.id : undefined);
    const lesson = id ? await loadLesson(id) : null;
    if (!lesson) return fail(res, 404, "Piece not found", "NOT_FOUND");
    broadcast({ type: "open", id: lesson.id, mode: body.mode, measures: body.measures, tempo: body.tempo, hands: body.hands });
    return send(res, 200, { ok: true, id: lesson.id, title: lesson.title });
  }
  if (m === "PATCH" && p === "/v1/mixer") {
    const patch = MixerPatchSchema.parse(await readJsonBody(req));
    broadcast({ type: "mixer", patch });
    return send(res, 200, { mixer: patch });
  }
  if (m === "POST" && p === "/v1/stop") {
    broadcast({ type: "stop" });
    return send(res, 200, { ok: true });
  }
  if (m === "POST" && p === "/v1/import") {
    return fail(res, 400, "In studio mode, attach the image in chat and call push_lesson, or upload it from the Import screen.", "IMPORT_FAILED");
  }
  fail(res, 404, "Unknown route", "NOT_FOUND");
}

function writeDiscovery(port: number | null) {
  mkdirSync(dirname(bridgePath()), { recursive: true });
  const disc = port
    ? { version: 1, name: "piano-helper", port, token: bridgeToken, pid: process.pid, appVersion: "0.1.0", alive: true }
    : { version: 1, name: "piano-helper", port: 0, token: bridgeToken || "x".repeat(16), pid: process.pid, appVersion: "0.1.0", alive: false };
  writeFileSync(bridgePath(), JSON.stringify(disc, null, 2), "utf8");
}

// ---------------------------------------------------------------- boot

function log(line: string) {
  const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  console.log(`  ${t}  ${line}`);
}

function wrap(fn: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>, checkHost: boolean) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://studio.local");
    if (checkHost && !hostAllowed(req)) {
      fail(res, 421, "Unknown host");
      return;
    }
    fn(req, res, url).catch((e: unknown) => {
      const status = (e as { status?: number }).status ?? 400;
      if (!res.headersSent) fail(res, status, e instanceof Error ? e.message : "Request failed");
      else res.end();
    });
  };
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolveListen, reject) => {
    const attempt = (p: number, triesLeft: number) => {
      server.once("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "EADDRINUSE" && triesLeft > 0) attempt(p + 1, triesLeft - 1);
        else reject(e);
      });
      server.listen(p, host, () => {
        const addr = server.address();
        resolveListen(typeof addr === "object" && addr ? addr.port : p);
      });
    };
    attempt(port, 10);
  });
}

export type StudioInfo = {
  httpsPort: number | null;
  localPort: number;
  key: string;
  lan: string[];
  webRootReady: boolean;
  close: () => Promise<void>;
};

export async function startStudio(opts: {
  port: number;
  https: boolean;
  /** 0 = any free port (tests). */
  bridgePort?: number;
  /** Tests start and stop the server themselves. */
  handleSignals?: boolean;
}): Promise<StudioInfo> {
  await initStore();
  pairKey = await loadPairKey();
  bridgeToken = randomBytes(24).toString("hex");

  const appHandler = (trustedLocal: boolean) =>
    wrap(async (req, res, url) => {
      if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
      return serveStatic(req, res, url, trustedLocal);
    }, true);

  // Same computer: plain HTTP on localhost is a secure context, so no cert warning.
  const local = createHttp(appHandler(true));
  const localPort = await listen(local, opts.port, "127.0.0.1");

  // Phones and other computers: HTTPS on every interface so the mic is allowed.
  let httpsPort: number | null = null;
  let lanServer: Server | null = null;
  if (opts.https) {
    const tls = await loadOrCreateCert();
    lanServer = createHttps({ key: tls.key, cert: tls.cert }, appHandler(false));
    httpsPort = await listen(lanServer, opts.port + 1, "0.0.0.0");
  }

  const bridge = createHttp(wrap(handleBridge, false));
  const bridgePort = await listen(bridge, opts.bridgePort ?? BRIDGE_DEFAULT_PORT, "127.0.0.1");
  writeDiscovery(bridgePort);

  const shutdown = () => {
    try {
      writeDiscovery(null);
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  if (opts.handleSignals !== false) {
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  const servers: Server[] = [local, bridge, ...(lanServer ? [lanServer] : [])];
  const close = async () => {
    for (const res of clients) res.end();
    clients.clear();
    await Promise.all(servers.map((srv) => new Promise<void>((r) => srv.close(() => r()))));
    writeDiscovery(null);
  };

  return { httpsPort, localPort, key: pairKey, lan: lanAddresses(), webRootReady: existsSync(join(WEB_ROOT, "index.html")), close };
}

export { log as studioLog };
