import { app, clipboard, shell } from "electron";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { OMR_PROMPT } from "@piano-helper/shared";
import type { ClaudeStatus } from "./claude-types.js";

export type { ClaudeStatus };

function repoRoot() {
  return join(app.getAppPath(), "..", "..");
}

export function subscriptionEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function whichSync(name: string): string | null {
  const path = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of path.split(sep)) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      if (existsSync(candidate)) return candidate;
    }
    const bare = join(dir, name);
    if (existsSync(bare)) return bare;
  }
  return null;
}

export function findClaudeBin(): string | null {
  const home = homedir();
  const guesses = [
    whichSync("claude"),
    join(home, ".local", "bin", "claude.exe"),
    join(home, ".local", "bin", "claude"),
    join(home, "AppData", "Roaming", "npm", "claude.cmd"),
    join(home, "AppData", "Roaming", "npm", "claude"),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "claude", "claude.exe"),
  ];
  return guesses.find((p) => p && existsSync(p)) ?? null;
}

function findNode(): string {
  const guesses = [
    process.env.npm_node_execpath,
    whichSync("node"),
    "C:\\Program Files\\nodejs\\node.exe",
    "/usr/local/bin/node",
  ];
  return guesses.find((p) => p && existsSync(p)) ?? "node";
}

export function stableDataDir() {
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Piano Helper");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Piano Helper");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "Piano Helper");
}

function mcpLauncherPath() {
  return join(stableDataDir(), "mcp-server.cmd");
}

export function mcpLaunch(): { command: string; args: string[]; cwd: string } {
  const root = repoRoot();
  const tsx = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const cli = join(root, "packages", "bridge", "src", "cli.ts");
  if (existsSync(tsx) && existsSync(cli)) {
    return { command: findNode(), args: [tsx, cli, "mcp"], cwd: root };
  }
  return {
    command: process.platform === "win32" ? "cmd" : "npm",
    args: process.platform === "win32" ? ["/c", "npm", "run", "piano-helper", "--", "mcp"] : ["run", "piano-helper", "--", "mcp"],
    cwd: root,
  };
}

export function mcpServerEntry() {
  const launch = mcpLaunch();
  const launcher = mcpLauncherPath();
  if (process.platform === "win32" && existsSync(launcher)) {
    return {
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/c", launcher],
    };
  }
  return {
    command: launch.command,
    args: launch.args,
    cwd: launch.cwd,
  };
}

function claudeJsonPath() {
  return join(homedir(), ".claude.json");
}

function claudeDesktopRoamingPath() {
  return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
}

export function claudeDesktopMsixConfigPaths(): string[] {
  const packages = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Packages");
  if (!existsSync(packages)) return [];
  return readdirSync(packages)
    .filter((name) => name.startsWith("Claude_"))
    .map((name) => join(packages, name, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"));
}

export function claudeDesktopConfigPaths(): string[] {
  return [claudeDesktopRoamingPath(), ...claudeDesktopMsixConfigPaths()];
}

function claudeDesktopConfigJsonPaths(): string[] {
  return claudeDesktopConfigPaths().map((p) => join(dirname(p), "config.json"));
}

async function writeMcpLauncher() {
  const launch = mcpLaunch();
  await mkdir(stableDataDir(), { recursive: true });
  const quoted = [launch.command, ...launch.args].map((p) => `"${p}"`).join(" ");
  const body = `@echo off\r\nset ANTHROPIC_API_KEY=\r\ncd /d "${launch.cwd}"\r\n${quoted}\r\n`;
  await writeFile(mcpLauncherPath(), body, "utf8");
}

async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function mergePianoMcp(path: string, entry: ReturnType<typeof mcpServerEntry>) {
  const json = await readJsonFile(path);
  const servers =
    json.mcpServers && typeof json.mcpServers === "object" && !Array.isArray(json.mcpServers)
      ? { ...(json.mcpServers as Record<string, unknown>) }
      : {};
  servers["piano-helper"] = entry;
  json.mcpServers = servers;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(json, null, 2), "utf8");
}

function mcpListedIn(json: Record<string, unknown>): boolean {
  const servers = json.mcpServers;
  if (!servers || typeof servers !== "object") return false;
  return "piano-helper" in servers;
}

function run(cmd: string, args: string[], timeoutMs = 20000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: true, env: subscriptionEnv(), windowsHide: true });
    let out = "";
    let err = "";
    const t = setTimeout(() => {
      child.kill();
      resolve({ code: 1, out, err: err || "timed out" });
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(t);
      resolve({ code: 1, out, err: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

async function probeLogin(cli: string | null): Promise<boolean> {
  if (!cli) return false;
  const auth = await run(cli, ["auth", "status"], 8000);
  const blob = `${auth.out}\n${auth.err}`.toLowerCase();
  if (/logged in|max|pro|subscription|oauth|authenticated/.test(blob) && !/not logged|unauthor|"loggedin": false/.test(blob)) {
    return true;
  }
  return false;
}

export function desktopAppInstalled(): boolean {
  return claudeDesktopMsixConfigPaths().length > 0 || existsSync(dirname(claudeDesktopRoamingPath()));
}

export function desktopProcessRunning(): boolean {
  if (process.platform !== "win32") return false;
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\").ExecutablePath",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 6000 },
    );
    return /WindowsApps\\Claude/i.test(out);
  } catch {
    return false;
  }
}

async function desktopLooksSignedIn(): Promise<boolean> {
  for (const path of claudeDesktopConfigJsonPaths()) {
    const json = await readJsonFile(path);
    if (json.windowSizeWasSignedIn === true) return true;
    if (typeof json.lastKnownAccountUuid === "string" && json.lastKnownAccountUuid) return true;
    if (json["oauth:tokenCache"] || json["oauth:tokenCacheV2"]) return true;
  }
  return desktopProcessRunning();
}

export function handoffPrompt(filePath: string) {
  return `Piano Helper is open and waiting.

Read this piano score photo and send the notes into Piano Helper using the piano-helper MCP tools.

Score file:
${filePath}

Steps:
1. Call pending_import (it has the JSON schema).
2. Open the score file and transcribe the notes you can see.
3. Call push_lesson with that lesson JSON.

Keep Piano Helper open. Do not ask me for an API key.`;
}

export function desktopAskPrompt() {
  return `Piano Helper is running on this PC.

Use the piano-helper MCP tools:
- pending_import — latest score I dropped in Piano Helper, plus the JSON schema
- push_lesson — send transcribed notes into the app
- list_library / open_piece / app_status — control practice

If I attach a score photo here, read it yourself and call push_lesson. No API key.`;
}

export async function getClaudeStatus(): Promise<ClaudeStatus> {
  const cliPath = findClaudeBin();
  const launch = mcpLaunch();
  const userJson = await readJsonFile(claudeJsonPath());
  const desktopPaths = claudeDesktopConfigPaths();
  let mcpRegistered = mcpListedIn(userJson);
  let desktopConfigPath: string | null = claudeDesktopMsixConfigPaths()[0] ?? desktopPaths[0] ?? null;
  for (const path of desktopPaths) {
    const json = await readJsonFile(path);
    if (mcpListedIn(json)) {
      mcpRegistered = true;
      desktopConfigPath = path;
    }
  }
  const apiKeyInEnv = Boolean(process.env.ANTHROPIC_API_KEY);
  const cliLoggedIn = await probeLogin(cliPath);
  const desktopAppFound = desktopAppInstalled();
  const desktopRunning = desktopProcessRunning();
  const desktopSignedIn = await desktopLooksSignedIn();
  const loggedIn = cliLoggedIn || desktopSignedIn;
  const usingSubscription = desktopSignedIn || (cliLoggedIn && !apiKeyInEnv);
  const targets = [claudeJsonPath(), ...desktopPaths];
  let message = "Claude Desktop is not installed.";
  if (desktopSignedIn && mcpRegistered) {
    message = "Claude Desktop is signed in and Piano Helper is connected. Drop a score in Import, or ask Claude in the desktop app.";
  } else if (desktopSignedIn) {
    message = "Claude Desktop is signed in. Click Connect so this app can talk to it.";
  } else if (desktopAppFound) {
    message = "Claude Desktop is installed. Open it and sign in, then click Connect.";
  } else if (cliPath && cliLoggedIn) {
    message = "Claude Code CLI is signed in. Click Connect to add Piano Helper.";
  } else if (cliPath) {
    message = "Claude CLI is installed but logged out. Use the Claude Desktop app you are already signed into — click Connect.";
  }
  return {
    cliPath,
    cliFound: Boolean(cliPath),
    cliLoggedIn,
    loggedIn,
    usingSubscription,
    apiKeyInEnv,
    mcpRegistered,
    mcpTargets: targets,
    command: [launch.command, ...launch.args],
    message,
    desktopAppFound,
    desktopRunning,
    desktopSignedIn,
    desktopConfigPath,
  };
}

export async function writeMcpConfigs() {
  await writeMcpLauncher();
  const entry = mcpServerEntry();
  const written: string[] = [];
  await mergePianoMcp(claudeJsonPath(), entry);
  written.push("Claude Code");
  for (const path of claudeDesktopConfigPaths()) {
    try {
      await mergePianoMcp(path, entry);
      written.push(path.includes("Packages") ? "Claude Desktop" : "Claude Desktop (Roaming)");
    } catch {
      /* optional */
    }
  }
  return [...new Set(written)];
}

export function openClaudeDesktop() {
  if (process.platform === "win32") {
    spawn("explorer.exe", ["shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude"], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  void shell.openExternal("https://claude.ai");
}

export async function restartClaudeDesktop() {
  if (process.platform !== "win32") {
    openClaudeDesktop();
    return;
  }
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | Where-Object { $_.ExecutablePath -like '*WindowsApps*Claude*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
      ],
      { windowsHide: true, timeout: 8000 },
    );
  } catch {
    /* already closed */
  }
  await new Promise((r) => setTimeout(r, 1200));
  openClaudeDesktop();
}

export async function connectClaudeCode(): Promise<{ ok: boolean; message: string; status: ClaudeStatus }> {
  const before = await getClaudeStatus();
  const neededRestart = before.desktopAppFound && !before.mcpRegistered;
  let written: string[] = [];
  try {
    written = await writeMcpConfigs();
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not write Claude Desktop config",
      status: await getClaudeStatus(),
    };
  }

  const cli = findClaudeBin();
  if (cli) {
    const entry = mcpServerEntry();
    const quoted = [entry.command, ...entry.args];
    await run(cli, ["mcp", "remove", "piano-helper"], 8000);
    const added = await run(cli, ["mcp", "add", "--scope", "user", "--transport", "stdio", "piano-helper", "--", ...quoted], 15000);
    if (added.code !== 0) {
      await mergePianoMcp(claudeJsonPath(), entry);
    }
  }

  if (neededRestart || before.desktopRunning) {
    await restartClaudeDesktop();
  } else if (before.desktopAppFound) {
    openClaudeDesktop();
  }

  const status = await getClaudeStatus();
  const ok = status.desktopAppFound || status.cliFound;
  const extra = status.desktopSignedIn
    ? "Claude Desktop reopened with Piano Helper. Keep this window open, then drop a score here or ask Claude in that app."
    : "Open Claude Desktop, sign in, then click Connect again.";
  return {
    ok,
    message: `Registered for ${written.join(" + ")}. ${extra}`,
    status,
  };
}

export async function handoffImportToDesktop(filePath: string) {
  const prompt = handoffPrompt(filePath);
  clipboard.writeText(prompt);
  openClaudeDesktop();
  return {
    ok: true,
    path: filePath,
    prompt,
    message: "Claude Desktop is opening. Press Ctrl+V in a new chat and send. Keep Piano Helper open.",
  };
}

export function copyDesktopAskPrompt() {
  const prompt = desktopAskPrompt();
  clipboard.writeText(prompt);
  return prompt;
}

export function mcpConfigJson() {
  return JSON.stringify({ mcpServers: { "piano-helper": mcpServerEntry() } }, null, 2);
}

export function omrPromptText() {
  return OMR_PROMPT;
}
