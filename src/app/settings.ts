export type Language = "en" | "tr";

export const LANGUAGES: readonly Language[] = ["en", "tr"];

export interface Settings {
  /** 0 to 1. */
  readonly sfx: number;
  /** 0 to 1. */
  readonly music: number;
  readonly haptics: boolean;
  /** Undefined follows the device language. */
  readonly language: Language | undefined;
}

export const DEFAULT_SETTINGS: Settings = {
  sfx: 0.8,
  music: 0.5,
  haptics: true,
  language: undefined,
};

const isVolume = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/** Stored settings are untrusted; each field falls back to its default on its own. */
export function parseSettings(value: unknown): Settings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;
  const raw = value as Record<string, unknown>;
  return {
    sfx: isVolume(raw["sfx"]) ? raw["sfx"] : DEFAULT_SETTINGS.sfx,
    music: isVolume(raw["music"]) ? raw["music"] : DEFAULT_SETTINGS.music,
    haptics: typeof raw["haptics"] === "boolean" ? raw["haptics"] : DEFAULT_SETTINGS.haptics,
    language: isLanguage(raw["language"]) ? raw["language"] : undefined,
  };
}

/** Picks a supported language from the device's preferred languages, English otherwise. */
export function resolveLanguage(
  settings: Pick<Settings, "language">,
  preferred: readonly string[],
): Language {
  if (settings.language) return settings.language;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLanguage(base)) return base;
  }
  return "en";
}
