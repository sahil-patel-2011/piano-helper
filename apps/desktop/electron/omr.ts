import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, basename } from "node:path";
import {
  OMR_PROMPT,
  coerceLesson,
  extractJsonObject,
  parseLesson,
  type Lesson,
  type ProviderId,
} from "@piano-helper/shared";
import { findClaudeBin, subscriptionEnv } from "./claude-connect.js";
import { getSecret } from "./storage.js";
import { parseMusicXml } from "./musicxml.js";

function parseOrThrow(data: unknown, source: Lesson["source"]): Lesson {
  try {
    return coerceLesson(data, source);
  } catch {
    return parseLesson({ ...(data as object), source });
  }
}

function runProcess(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: subscriptionEnv(),
      cwd: homedir(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude Code took too long reading that page. Try a closer crop of one staff."));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Install Claude Code and sign in with your Max plan (run: claude). No API key needed."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const blob = `${err}\n${out}`;
      if (/oauth|authenticat|not logged|unauthorized|login expired/i.test(blob)) {
        reject(new Error("Claude Code login expired. Open a terminal, run claude, sign in with Max, then import again."));
        return;
      }
      if (code !== 0 && !out.trim()) reject(new Error(err.trim() || "claude CLI failed"));
      else resolve(out);
    });
  });
}

async function runClaudeCli(filePath: string, extra = ""): Promise<string> {
  const bin = findClaudeBin();
  if (!bin) throw new Error("Install Claude Code and sign in with your Max plan (run: claude). No API key needed.");
  const prompt = `${OMR_PROMPT}

The score file is attached at:
${filePath}

${extra}

Return ONLY the JSON object.`;
  return runProcess(bin, ["-p", prompt, filePath, "--output-format", "text"], 180_000);
}

async function visionPost(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    content?: { text?: string }[];
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `Provider error ${res.status}`);
  return json.content?.[0]?.text ?? json.choices?.[0]?.message?.content ?? "";
}

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  return "image/jpeg";
}

export async function runOmr(filePath: string, provider: ProviderId): Promise<Lesson> {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".xml" || ext === ".musicxml") {
    const xml = await readFile(filePath, "utf8");
    return parseLesson(parseMusicXml(xml, basename(filePath)));
  }

  const source: Lesson["source"] = ext === ".pdf" ? "pdf" : "photo";

  if (provider === "none") {
    throw new Error("Connect Claude Code in Settings, then import the photo again.");
  }

  const tryParse = (text: string) => parseOrThrow(extractJsonObject(text), source);

  if (provider === "claude-cli") {
    const first = await runClaudeCli(filePath);
    try {
      return tryParse(first);
    } catch {
      const second = await runClaudeCli(
        filePath,
        `Your last answer was not valid lesson JSON. Fix it.\nBroken output:\n${first.slice(0, 6000)}`,
      );
      return tryParse(second);
    }
  }

  const b64 = (await readFile(filePath)).toString("base64");
  const media = mimeFor(filePath);
  const key = provider === "openrouter" ? await getSecret("openrouter") : await getSecret(provider);
  if (!key) throw new Error("Connect Claude Code in Settings, or add an API key.");

  if (provider === "anthropic") {
    const text = await visionPost(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": key, "anthropic-version": "2023-06-01" },
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OMR_PROMPT },
              media === "application/pdf"
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
                : { type: "image", source: { type: "base64", media_type: media, data: b64 } },
            ],
          },
        ],
      },
    );
    try {
      return tryParse(text);
    } catch {
      return tryParse(
        await visionPost(
          "https://api.anthropic.com/v1/messages",
          { "x-api-key": key, "anthropic-version": "2023-06-01" },
          {
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            messages: [{ role: "user", content: `${OMR_PROMPT}\nFix this into valid JSON only:\n${text}` }],
          },
        ),
      );
    }
  }

  const openAiStyle = async (base: string, model: string, extraHeaders: Record<string, string> = {}) => {
    const imageUrl = media === "application/pdf" ? undefined : `data:${media};base64,${b64}`;
    const content: unknown[] = [{ type: "text", text: OMR_PROMPT }];
    if (imageUrl) content.push({ type: "image_url", image_url: { url: imageUrl } });
    else content[0] = { type: "text", text: `${OMR_PROMPT}\n(PDF base64 follows)\n${b64.slice(0, 20000)}` };
    const text = await visionPost(
      `${base}/chat/completions`,
      { Authorization: `Bearer ${key}`, ...extraHeaders },
      { model, max_tokens: 4096, messages: [{ role: "user", content }] },
    );
    return tryParse(text);
  };

  if (provider === "openai") return openAiStyle("https://api.openai.com/v1", "gpt-4o");
  if (provider === "mistral") return openAiStyle("https://api.mistral.ai/v1", "pixtral-large-latest");
  if (provider === "openrouter") {
    return openAiStyle("https://openrouter.ai/api/v1", "anthropic/claude-sonnet-4", {
      "HTTP-Referer": "https://pianohelper.app",
      "X-Title": "Piano Helper",
    });
  }

  throw new Error("Connect Claude Code in Settings, then import the photo again.");
}

export async function testProvider(provider: ProviderId): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === "none") return { ok: false, message: "Pick a provider." };
    if (provider === "claude-cli") {
      const bin = findClaudeBin();
      if (!bin) return { ok: false, message: "Claude Code not found. Install it, then Settings → Connect." };
      await runProcess(bin, ["-p", "Reply with the single word ok", "--output-format", "text"], 30_000);
      return { ok: true, message: "Claude Code · Max subscription (no API credits)" };
    }
    const key = await getSecret(provider === "openrouter" ? "openrouter" : provider);
    if (!key) return { ok: false, message: "No key saved." };
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8,
          messages: [{ role: "user", content: "Reply ok" }],
        }),
      });
      return { ok: res.ok, message: res.ok ? "Anthropic · ok" : `Anthropic · ${res.status}` };
    }
    const bases: Record<string, [string, string]> = {
      openai: ["https://api.openai.com/v1/models", "OpenAI"],
      mistral: ["https://api.mistral.ai/v1/models", "Mistral"],
      openrouter: ["https://openrouter.ai/api/v1/models", "OpenRouter"],
    };
    const pair = bases[provider];
    const res = await fetch(pair[0], { headers: { Authorization: `Bearer ${key}` } });
    return { ok: res.ok, message: res.ok ? `${pair[1]} · ok` : `${pair[1]} · ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Test failed" };
  }
}
