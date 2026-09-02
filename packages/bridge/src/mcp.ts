import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api } from "./client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function startMcp() {
  const server = new McpServer({
    name: "piano-helper",
    version: "0.1.0",
  });

  server.tool("app_status", "Piano Helper running state, calibration, current piece", {}, async () =>
    text(await api("GET", "/v1/status")),
  );

  server.tool(
    "pending_import",
    "Latest score photo dropped in Piano Helper, plus the lesson JSON schema. Read that file yourself, then call push_lesson.",
    {},
    async () => text(await api("GET", "/v1/pending-import")),
  );

  server.tool(
    "import_score",
    "Ask Piano Helper to run OMR on a local path. Prefer pending_import + push_lesson when you can see the image.",
    { path: z.string() },
    async ({ path }) => text(await api("POST", "/v1/import", { path })),
  );

  server.tool(
    "push_lesson",
    "Send transcribed piano lesson JSON into Piano Helper and open it. Use this after you read a score photo.",
    { lesson: z.unknown() },
    async ({ lesson }) => text(await api("POST", "/v1/lessons", { lesson })),
  );

  server.tool("list_library", "List built-in and imported pieces", {}, async () =>
    text(await api("GET", "/v1/library")),
  );

  server.tool(
    "open_piece",
    "Open a piece and start practice",
    {
      id: z.string().optional(),
      title: z.string().optional(),
      mode: z.enum(["wait", "slow", "loop", "play"]).optional(),
      measures: z.tuple([z.number(), z.number()]).optional(),
      tempo: z.number().optional(),
      hands: z.enum(["rh", "lh", "both", "all"]).optional(),
    },
    async (args) => text(await api("POST", "/v1/open", args)),
  );

  server.tool("get_expected", "Pitches the keyboard is waiting for", {}, async () =>
    text(await api("GET", "/v1/expected")),
  );

  server.tool("get_session", "Live timer, measure, accuracy", {}, async () =>
    text(await api("GET", "/v1/session")),
  );

  server.tool(
    "set_mixer",
    "Set mixer sliders 0-100",
    {
      metronome: z.number().min(0).max(100).optional(),
      preview: z.number().min(0).max(100).optional(),
      backing: z.number().min(0).max(100).optional(),
      ui: z.number().min(0).max(100).optional(),
    },
    async (args) => text(await api("PATCH", "/v1/mixer", args)),
  );

  server.tool("stop_practice", "Stop the current practice session", {}, async () =>
    text(await api("POST", "/v1/stop", {})),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
