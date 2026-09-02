import { z } from "zod";
import { LessonSchema, PracticeModeSchema, HandSchema } from "./lesson.js";
import { MixerSchema } from "./settings.js";

export const BRIDGE_DEFAULT_PORT = 18765;
export const BRIDGE_MAX_LESSON_BYTES = 1_000_000;

export const BridgeDiscoverySchema = z.object({
  version: z.literal(1),
  name: z.literal("piano-helper"),
  port: z.number().int(),
  token: z.string().min(16),
  pid: z.number().int(),
  appVersion: z.string(),
  alive: z.boolean(),
});

export type BridgeDiscovery = z.infer<typeof BridgeDiscoverySchema>;

export const BridgeErrorCodeSchema = z.enum([
  "APP_OFF",
  "UNAUTHORIZED",
  "NOT_CALIBRATED",
  "NOT_FOUND",
  "INVALID_LESSON",
  "IMPORT_FAILED",
  "NO_PROVIDER",
]);

export type BridgeErrorCode = z.infer<typeof BridgeErrorCodeSchema>;

export const OpenPieceBodySchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  mode: PracticeModeSchema.default("wait"),
  measures: z.tuple([z.number(), z.number()]).optional(),
  tempo: z.number().optional(),
  hands: z.union([HandSchema, z.literal("all")]).default("all"),
});

export const ImportBodySchema = z.object({
  path: z.string().min(1),
});

export const PushLessonBodySchema = z.object({
  lesson: LessonSchema,
});

export const MixerPatchSchema = MixerSchema.partial();

export const IMPORT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".xml", ".musicxml"] as const;
