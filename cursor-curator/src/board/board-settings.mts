import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SETTINGS_VERSION = 2;

export const SETTINGS_DEFAULTS = {
  density: "comfortable",
  completedVisibility: "show",
  boardOpenBehavior: "last",
  motion: "system",
  lastBoardPath: "",
} as const;

export interface BoardSettings {
  density: string;
  completedVisibility: string;
  boardOpenBehavior: string;
  motion: string;
  lastBoardPath: string;
}

const SETTINGS_OPTIONS = {
  density: new Set(["comfortable", "compact"]),
  completedVisibility: new Set(["show", "collapse"]),
  boardOpenBehavior: new Set(["last", "newest"]),
  motion: new Set(["system", "reduce", "allow"]),
};

export function readBoardSettings(): BoardSettings {
  try {
    if (!existsSync(settingsPath())) return { ...SETTINGS_DEFAULTS };
    return normalizeSettings(JSON.parse(readFileSync(settingsPath(), "utf8")));
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function writeBoardSettings(settings: unknown): BoardSettings {
  const normalized = normalizeSettings(settings);
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export function normalizeSettings(settings: unknown): BoardSettings {
  const normalized: BoardSettings = { ...SETTINGS_DEFAULTS };
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return normalized;
  const record = settings as Record<string, unknown>;
  for (const [key, allowed] of Object.entries(SETTINGS_OPTIONS)) {
    const value = record[key];
    if (typeof value === "string" && allowed.has(value)) {
      normalized[key as keyof Omit<BoardSettings, "lastBoardPath">] = value;
    }
  }
  if (typeof record.lastBoardPath === "string" && /^\/[a-z0-9][a-z0-9-]*\/$/.test(record.lastBoardPath)) {
    normalized.lastBoardPath = record.lastBoardPath;
  }
  return normalized;
}

function settingsPath(): string {
  return process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH || join(homedir(), ".cursor-curator", "local-board-settings.json");
}
