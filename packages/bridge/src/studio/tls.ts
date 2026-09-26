import { readFile, writeFile } from "node:fs/promises";
import { hostname, networkInterfaces } from "node:os";
import { join } from "node:path";
import { generate } from "selfsigned";
import { studioDir } from "./store.js";

/** IPv4 addresses a phone on the same Wi-Fi can reach, best guess first. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      // Virtual adapters (WSL, Hyper-V, Docker, VPNs) are rarely what the phone sees.
      const virtual = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|Loopback/i.test(name);
      if (virtual) out.push(addr.address);
      else out.unshift(addr.address);
    }
  }
  return [...new Set(out)];
}

type CertCache = { hosts: string[]; key: string; cert: string; createdAt: string };

/**
 * Phones only grant microphone access on HTTPS pages. A self-signed cert
 * covering every LAN address is enough — the browser warns once, the user
 * taps "Advanced → Proceed", and the mic works from then on.
 */
export async function loadOrCreateCert(): Promise<{ key: string; cert: string }> {
  const hosts = ["localhost", "127.0.0.1", hostname().toLowerCase(), ...lanAddresses()].sort();
  const cachePath = join(studioDir(), "tls.json");
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as CertCache;
    const fresh = Date.now() - Date.parse(cached.createdAt) < 300 * 24 * 3600 * 1000;
    if (fresh && hosts.every((h) => cached.hosts.includes(h))) return cached;
  } catch {
    /* first run */
  }
  const altNames = hosts.map((h) => (/^\d+\.\d+\.\d+\.\d+$/.test(h) ? { type: 7 as const, ip: h } : { type: 2 as const, value: h }));
  const notAfterDate = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const pems = await generate([{ name: "commonName", value: "Piano Helper Studio" }], {
    keySize: 2048,
    notAfterDate,
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames },
    ],
  });
  const cache: CertCache = { hosts, key: pems.private, cert: pems.cert, createdAt: new Date().toISOString() };
  await writeFile(cachePath, JSON.stringify(cache), "utf8");
  return cache;
}
