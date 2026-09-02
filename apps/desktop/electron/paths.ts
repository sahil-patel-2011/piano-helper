import { app } from "electron";
import { join } from "node:path";

export function dataDir(): string {
  return app.getPath("userData");
}

export function filePath(name: string): string {
  return join(dataDir(), name);
}
