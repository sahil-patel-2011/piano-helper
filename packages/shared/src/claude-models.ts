export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type ClaudeModelOption = {
  id: string;
  label: string;
  hint: string;
  latest?: boolean;
};

/** Aliases always resolve to the newest model on the user's Max plan. */
export const CLAUDE_MODELS: ClaudeModelOption[] = [
  { id: "opus", label: "Opus (latest)", hint: "Follows new Opus releases — currently Opus 5", latest: true },
  { id: "sonnet", label: "Sonnet (latest)", hint: "Follows new Sonnet releases — currently Sonnet 5", latest: true },
  { id: "haiku", label: "Haiku (latest)", hint: "Fast. Follows new Haiku releases", latest: true },
  { id: "fable", label: "Fable (latest)", hint: "Longest reasoning. Follows new Fable releases", latest: true },
  { id: "claude-opus-5", label: "Opus 5", hint: "Pin this generation" },
  { id: "claude-sonnet-5", label: "Sonnet 5", hint: "Pin this generation" },
  { id: "claude-opus-4-8", label: "Opus 4.8", hint: "Previous Opus" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", hint: "Previous Sonnet" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", hint: "Previous Haiku" },
];

export const CLAUDE_EFFORTS: { id: ClaudeEffort; label: string; hint: string }[] = [
  { id: "low", label: "Low", hint: "Fast, less thinking" },
  { id: "medium", label: "Medium", hint: "Balanced" },
  { id: "high", label: "High", hint: "Best for reading scores" },
  { id: "xhigh", label: "Extra high", hint: "Hard pages, dense staves" },
  { id: "max", label: "Max", hint: "Slowest, deepest" },
];

export function modelLabel(id: string): string {
  return CLAUDE_MODELS.find((m) => m.id === id)?.label ?? id;
}

export function effortLabel(id: string): string {
  return CLAUDE_EFFORTS.find((e) => e.id === id)?.label ?? id;
}
