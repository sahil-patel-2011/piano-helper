import { z } from "zod";

export const MixerSchema = z.object({
  metronome: z.number().min(0).max(100).default(0),
  preview: z.number().min(0).max(100).default(40),
  backing: z.number().min(0).max(100).default(50),
  ui: z.number().min(0).max(100).default(15),
});

export const ProviderIdSchema = z.enum([
  "none",
  "claude-cli",
  "anthropic",
  "openai",
  "mistral",
  "openrouter",
]);

export const OmrEngineSchema = z.enum(["auto", "claude", "codex"]);

export const AppSettingsSchema = z.object({
  mixer: MixerSchema.default({}),
  quiet: z.boolean().default(false),
  dailyGoalMinutes: z.number().int().min(5).max(60).default(15),
  providerId: ProviderIdSchema.default("claude-cli"),
  openrouterModel: z.string().default("anthropic/claude-sonnet-4"),
  bridgeEnabled: z.boolean().default(true),
  lastPieceId: z.string().nullable().default(null),
  showFingering: z.boolean().default(true),
  slowFactor: z.number().min(0.4).max(0.9).default(0.6),
  syncStats: z.boolean().default(false),
  onboardingComplete: z.boolean().default(false),
  placementComplete: z.boolean().default(false),
  claudeModel: z.string().default("opus"),
  claudeEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  extraPrompt: z.string().max(4000).default(""),
  /** Which terminal AI reads score photos in `piano-helper studio`. */
  omrEngine: OmrEngineSchema.default("auto"),
  /** Blank = Codex's configured default model. */
  codexModel: z.string().max(80).default(""),
  /** Keys + finger numbers only: hides the staff and letter names so no note reading is needed. */
  simpleView: z.boolean().default(true),
});

export type OmrEngine = z.infer<typeof OmrEngineSchema>;
export type Mixer = z.infer<typeof MixerSchema>;
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const defaultSettings = (): AppSettings => AppSettingsSchema.parse({});
