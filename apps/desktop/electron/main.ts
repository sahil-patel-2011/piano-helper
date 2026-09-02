import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getLive, isConnected, setLive, setWindow, type LiveState } from "./app-state.js";
import { getDiscovery, startBridge, stopBridge } from "./bridge-server.js";
import {
  connectClaudeCode,
  copyDesktopAskPrompt,
  getClaudeStatus,
  handoffImportToDesktop,
  mcpConfigJson,
  openClaudeDesktop,
  writeMcpConfigs,
} from "./claude-connect.js";
import { disableAppMenu } from "./disable-menu.js";
import { runOmr, testProvider } from "./omr.js";
import {
  copyImport,
  deleteSecret,
  getProfile,
  getProgress,
  getSecretExists,
  getSettings,
  initStorage,
  listLibrary,
  loadLesson,
  saveImportBytes,
  saveLesson,
  saveProfile,
  saveProgress,
  saveSettings,
  storeSecret,
  writePendingImport,
} from "./storage.js";

function electronDir() {
  return join(app.getAppPath(), "dist-electron");
}

function appIcon() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "assets", "icon.png");
}

process.on("uncaughtException", (err) => {
  console.error("uncaughtException", err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection", err);
});

app.setName("Piano Helper");
if (process.platform === "win32") {
  app.setAppUserModelId("com.pianohelper.desktop");
}

protocol.registerSchemesAsPrivileged([{ scheme: "piano-helper", privileges: { standard: true, secure: true } }]);

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  const darwin = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "Piano Helper",
    icon: appIcon(),
    backgroundColor: "#16140f",
    show: false,
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: darwin ? "hiddenInset" : undefined,
    trafficLightPosition: darwin ? { x: 14, y: 11 } : undefined,
    webPreferences: {
      preload: join(electronDir(), "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  setWindow(mainWindow);
  mainWindow.setMenu(null);
  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("did-fail-load", code, desc);
  });

  const url = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:5173";
  if (app.isPackaged) {
    await mainWindow.loadFile(join(app.getAppPath(), "dist/index.html"));
  } else {
    await mainWindow.loadURL(url);
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("maximize", () => mainWindow?.webContents.send("win:state", true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("win:state", false));
  mainWindow.on("closed", () => {
    mainWindow = null;
    setWindow(null);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

console.log("Piano Helper main starting", { dir: electronDir(), gotLock });

app.whenReady().then(async () => {
  disableAppMenu();
  await initStorage();
  ipcMain.on("win:minimize", () => mainWindow?.minimize());
  ipcMain.on("win:maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("win:close", () => mainWindow?.close());
  ipcMain.handle("win:isMaximized", () => mainWindow?.isMaximized() ?? false);
  protocol.handle("piano-helper", (request) => {
    const url = new URL(request.url);
    mainWindow?.show();
    mainWindow?.webContents.send("piano:command", {
      type: url.hostname || "open",
      id: url.searchParams.get("id"),
      path: url.searchParams.get("path"),
    });
    return new Response("ok");
  });

  ipcMain.handle("piano:getProfile", () => getProfile());
  ipcMain.handle("piano:saveProfile", (_e, p) => saveProfile(p));
  ipcMain.handle("piano:getSettings", () => getSettings());
  ipcMain.handle("piano:saveSettings", (_e, s) => saveSettings(s));
  ipcMain.handle("piano:getProgress", () => getProgress());
  ipcMain.handle("piano:saveProgress", (_e, stats, measures) => saveProgress(stats, measures));
  ipcMain.handle("piano:storeSecret", (_e, provider, key) => storeSecret(provider, key));
  ipcMain.handle("piano:getSecretExists", (_e, provider) => getSecretExists(provider));
  ipcMain.handle("piano:deleteSecret", (_e, provider) => deleteSecret(provider));
  ipcMain.handle("piano:listLibrary", () => listLibrary());
  ipcMain.handle("piano:loadLesson", (_e, id) => loadLesson(id));
  ipcMain.handle("piano:saveLesson", (_e, lesson) => saveLesson(lesson));
  ipcMain.handle("piano:pickImportFile", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      filters: [{ name: "Scores", extensions: ["png", "jpg", "jpeg", "webp", "pdf", "xml", "musicxml"] }],
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("piano:runOmr", async (_e, path: string) => {
    const settings = await getSettings();
    const copied = await copyImport(path);
    return runOmr(copied.dest, settings.providerId);
  });
  ipcMain.handle("piano:importBytes", async (_e, payload: { name: string; base64: string }) => {
    if (!payload?.base64) throw new Error("That file was empty.");
    const buf = Buffer.from(payload.base64, "base64");
    if (buf.length > 20 * 1024 * 1024) throw new Error("That file is too large. Use a photo under 20 MB.");
    const settings = await getSettings();
    const saved = await saveImportBytes(payload.name || "score.jpg", buf);
    return runOmr(saved.dest, settings.providerId);
  });
  ipcMain.handle("piano:testProvider", async () => {
    const settings = await getSettings();
    return testProvider(settings.providerId);
  });
  ipcMain.handle("piano:startBridge", async () => {
    const disc = await startBridge(app.getVersion() || "0.1.0");
    const settings = await getSettings();
    await saveSettings({ ...settings, bridgeEnabled: true });
    return { port: disc.port, token: disc.token };
  });
  ipcMain.handle("piano:stopBridge", async () => {
    await stopBridge();
    const settings = await getSettings();
    await saveSettings({ ...settings, bridgeEnabled: false });
  });
  ipcMain.handle("piano:getBridgeStatus", async () => {
    const disc = getDiscovery();
    const settings = await getSettings();
    return { enabled: settings.bridgeEnabled && Boolean(disc), port: disc?.port ?? null, connected: isConnected() };
  });
  ipcMain.handle("piano:mcpConfig", () => mcpConfigJson());
  ipcMain.handle("piano:claudeStatus", () => getClaudeStatus());
  ipcMain.handle("piano:openClaudeDesktop", () => {
    openClaudeDesktop();
    return { ok: true };
  });
  ipcMain.handle("piano:copyClaudePrompt", () => ({ prompt: copyDesktopAskPrompt() }));
  ipcMain.handle("piano:handoffPath", async (_e, path: string) => {
    const copied = await copyImport(path);
    await writePendingImport(copied.dest);
    return handoffImportToDesktop(copied.dest);
  });
  ipcMain.handle("piano:handoffImport", async (_e, payload: { name: string; base64: string }) => {
    if (!payload?.base64) throw new Error("That file was empty.");
    const buf = Buffer.from(payload.base64, "base64");
    if (buf.length > 20 * 1024 * 1024) throw new Error("That file is too large. Use a photo under 20 MB.");
    const saved = await saveImportBytes(payload.name || "score.jpg", buf);
    await writePendingImport(saved.dest);
    return handoffImportToDesktop(saved.dest);
  });
  ipcMain.handle("piano:addClaudeMcp", async () => {
    const settings = await getSettings();
    await saveSettings({ ...settings, providerId: "claude-cli", bridgeEnabled: true });
    try {
      await startBridge(app.getVersion() || "0.1.0");
    } catch {
      /* already listening */
    }
    return connectClaudeCode();
  });
  ipcMain.handle("piano:connectClaude", async () => {
    const settings = await getSettings();
    await saveSettings({ ...settings, providerId: "claude-cli", bridgeEnabled: true });
    try {
      await startBridge(app.getVersion() || "0.1.0");
    } catch {
      /* already listening */
    }
    return connectClaudeCode();
  });
  ipcMain.on("piano:live", (_e, state: LiveState) => setLive(state));

  await createWindow();
  const settings = await getSettings();
  const next =
    settings.providerId === "none"
      ? { ...settings, providerId: "claude-cli" as const, bridgeEnabled: true }
      : settings;
  if (next !== settings) await saveSettings(next);
  if (next.bridgeEnabled) {
    try {
      await startBridge(app.getVersion() || "0.1.0");
    } catch {
      /* port busy */
    }
    void writeMcpConfigs().catch(() => undefined);
  }
});

app.on("browser-window-created", (_, w) => {
  w.setMenu(null);
  w.removeMenu();
  w.setMenuBarVisibility(false);
});

app.on("window-all-closed", () => {
  void stopBridge();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void stopBridge();
});
