import { homedir } from "node:os";
import { join } from "node:path";

export function appDataDir(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Piano Helper");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Piano Helper");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "Piano Helper");
}

export function bridgePath(): string {
  return join(appDataDir(), "bridge.json");
}
