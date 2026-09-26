import { spawn } from "node:child_process";
import qrcode from "qrcode-terminal";
import { getSettings, initStore, saveSettings } from "./store.js";
import { engineStatus } from "./engines.js";
import { startStudio, studioLog, WEB_ROOT } from "./server.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const gold = (s: string) => `\x1b[33m${s}\x1b[0m`;

export async function runStudio(argv: string[]) {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const port = Number(arg("--port") ?? 5080);
  const engine = arg("--engine");

  // Already running (e.g. the launcher was double-clicked twice): just show it.
  const running = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(800) })
    .then((r) => r.ok)
    .catch(() => false);
  if (running) {
    console.log(`  Piano Helper is already running at http://localhost:${port}`);
    if (argv.includes("--open")) openBrowser(`http://localhost:${port}`);
    return;
  }

  await initStore();
  if (engine === "claude" || engine === "codex" || engine === "auto") {
    await saveSettings({ ...(await getSettings()), omrEngine: engine });
  }

  const info = await startStudio({ port, https: !argv.includes("--no-https") });
  const status = engineStatus((await getSettings()).omrEngine);
  const phoneUrl = info.httpsPort && info.lan[0] ? `https://${info.lan[0]}:${info.httpsPort}/?key=${info.key}` : null;

  console.log("");
  console.log(`  ${gold("♪")} ${bold("Piano Helper Studio")} is running`);
  console.log("");
  console.log(`  This computer   ${bold(`http://localhost:${info.localPort}`)}`);
  if (phoneUrl) {
    console.log(`  Phone / tablet  ${bold(phoneUrl)}`);
    for (const ip of info.lan.slice(1)) console.log(dim(`                  https://${ip}:${info.httpsPort}/?key=${info.key}`));
  }
  const reader = status.active ? status.engines.find((e) => e.id === status.active)!.label : "none installed";
  console.log(`  Score reader    ${bold(reader)} ${dim("— uses your subscription, no API key")}`);
  if (!info.webRootReady) {
    console.log("");
    console.log(`  ${gold("!")} App not built yet (${WEB_ROOT}). Run ${bold("npm run studio")} from the repo root.`);
  }
  if (phoneUrl) {
    console.log("");
    console.log(dim("  Scan with your phone camera (same Wi-Fi). First visit shows a privacy warning"));
    console.log(dim("  because the certificate is self-made: tap Advanced → Proceed / Visit website."));
    console.log("");
    qrcode.generate(phoneUrl, { small: true }, (code: string) => {
      console.log(code.replace(/^/gm, "    "));
    });
  }
  console.log(dim("  Ctrl+C to stop. Activity:"));
  studioLog("ready");
  if (argv.includes("--open")) openBrowser(`http://localhost:${info.localPort}`);
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", '""', url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true, windowsVerbatimArguments: true }).unref();
}
