import { readFile } from "node:fs/promises";
import { BridgeDiscoverySchema, type BridgeDiscovery } from "@piano-helper/shared";
import { bridgePath } from "./paths.js";

export class BridgeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function readDiscovery(): Promise<BridgeDiscovery> {
  try {
    const raw = await readFile(bridgePath(), "utf8");
    const parsed = BridgeDiscoverySchema.parse(JSON.parse(raw));
    if (!parsed.alive) {
      throw new BridgeError("APP_OFF", "Start Piano Helper and enable Settings → Claude Code.", 503);
    }
    return parsed;
  } catch (err) {
    if (err instanceof BridgeError) throw err;
    throw new BridgeError("APP_OFF", "Start Piano Helper and enable Settings → Claude Code.", 503);
  }
}

export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const disc = await readDiscovery();
  const res = await fetch(`http://127.0.0.1:${disc.port}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${disc.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: { code: string; message: string } } & T;
  if (!res.ok) {
    throw new BridgeError(json.error?.code ?? "ERROR", json.error?.message ?? res.statusText, res.status);
  }
  return json;
}
