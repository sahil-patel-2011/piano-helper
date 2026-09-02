#!/usr/bin/env node
import { api, BridgeError } from "./client.js";
import { startMcp } from "./mcp.js";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const cmd = process.argv[2] ?? "status";
  if (cmd === "mcp") {
    await startMcp();
    return;
  }

  const asJson = flag("--json");
  try {
    let data: unknown;
    switch (cmd) {
      case "status":
        data = await api("GET", "/v1/status");
        break;
      case "library":
        data = await api("GET", "/v1/library");
        break;
      case "expected":
        data = await api("GET", "/v1/expected");
        break;
      case "session":
        data = await api("GET", "/v1/session");
        break;
      case "import": {
        const path = process.argv[3];
        if (!path) throw new BridgeError("INVALID_LESSON", "Usage: piano-helper import <path>");
        data = await api("POST", "/v1/import", { path });
        break;
      }
      case "open": {
        data = await api("POST", "/v1/open", {
          id: arg("--id"),
          title: process.argv[3],
          mode: arg("--mode", "wait"),
          tempo: arg("--tempo") ? Number(arg("--tempo")) : undefined,
        });
        break;
      }
      case "stop":
        data = await api("POST", "/v1/stop", {});
        break;
      case "mixer":
        data = await api("PATCH", "/v1/mixer", {
          metronome: arg("--metronome") ? Number(arg("--metronome")) : undefined,
          preview: arg("--preview") ? Number(arg("--preview")) : undefined,
          backing: arg("--backing") ? Number(arg("--backing")) : undefined,
          ui: arg("--ui") ? Number(arg("--ui")) : undefined,
        });
        break;
      default:
        console.error("Unknown command. Try: status | library | import | open | expected | session | stop | mixer | mcp");
        process.exit(1);
    }
    if (asJson) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    const e = err as BridgeError;
    console.error(JSON.stringify({ error: { code: e.code ?? "ERROR", message: e.message } }));
    process.exit(e.code === "APP_OFF" ? 2 : 1);
  }
}

main();
