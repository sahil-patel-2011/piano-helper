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
});

export type Mixer = z.infer<typeof MixerSchema>;
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const defaultSettings = (): AppSettings => AppSettingsSchema.parse({});
