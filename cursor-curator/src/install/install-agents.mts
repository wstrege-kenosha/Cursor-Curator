import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, "../..");
const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
const agentsSrc = join(skillRoot, "agents-src");
const commandsSrc = join(skillRoot, "commands-src");
const agentsDest = join(cursorHome, "agents");
const commandsDest = join(cursorHome, "commands");
const manifestPath = join(skillRoot, "install.json");
const LEGACY_AGENTS = ["goal-scout.md", "goal-approval-gate.md", "goal-worker.md"];
const LEGACY_COMMANDS = ["curator-prep.md"];
const HOOK_SCRIPT = "scripts/hooks/append-usage-metrics.mjs";
const CURATOR_HOOK_MARKER = "append-usage-metrics.mjs";

export interface InstallHooksResult {
  path: string;
  status: "installed" | "unchanged";
  command: string;
}

export interface InstallSurfacesResult {
  agents: InstallSurfaceEntry[];
  commands: InstallSurfaceEntry[];
  hooks: InstallHooksResult | null;
  errors: string[];
  removed: string[];
}

export interface InstallSurfaceEntry {
  file: string;
  path: string;
  status: string;
}

export function installCursorSurfaces({ force = false, quiet = false } = {}): InstallSurfacesResult {
  const installed: InstallSurfacesResult = { agents: [], commands: [], hooks: null, errors: [], removed: [] };

  mkdirSync(agentsDest, { recursive: true });
  mkdirSync(commandsDest, { recursive: true });

  for (const file of LEGACY_AGENTS) {
    const legacyPath = join(agentsDest, file);
    if (existsSync(legacyPath)) {
      unlinkSync(legacyPath);
      installed.removed.push(legacyPath);
      if (!quiet) console.log(`removed legacy ${legacyPath}`);
    }
  }

  for (const file of LEGACY_COMMANDS) {
    const legacyPath = join(commandsDest, file);
    if (existsSync(legacyPath)) {
      unlinkSync(legacyPath);
      installed.removed.push(legacyPath);
      if (!quiet) console.log(`removed legacy ${legacyPath}`);
    }
  }

  for (const { src, dest, kind } of [
    { src: agentsSrc, dest: agentsDest, kind: "agents" as const },
    { src: commandsSrc, dest: commandsDest, kind: "commands" as const },
  ]) {
    if (!existsSync(src)) {
      installed.errors.push(`missing source: ${src}`);
      continue;
    }
    for (const file of readdirSync(src).filter((f) => f.endsWith(".md"))) {
      const srcPath = join(src, file);
      const destPath = join(dest, file);
      let status = "installed";
      if (existsSync(destPath) && !force) {
        const srcHash = sha256(readFileSync(srcPath));
        const destHash = sha256(readFileSync(destPath));
        if (srcHash !== destHash) {
          if (!quiet) console.log(`skip existing ${destPath} (use --force to overwrite)`);
          status = "skipped";
        } else {
          status = "unchanged";
        }
      } else {
        copyFileSync(srcPath, destPath);
        if (!quiet) console.log(`installed ${destPath}`);
      }
      installed[kind].push({ file, path: destPath, status });
    }
  }

  const manifest = {
    target: "cursor",
    installedAt: new Date().toISOString(),
    cursorHome,
    agents: installed.agents.map((e) => e.path),
    commands: installed.commands.map((e) => e.path),
    skillRoot,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  try {
    installed.hooks = installCursorHooks({ force, quiet });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    installed.errors.push(message);
  }

  return installed;
}

export function installCursorHooks({
  skillRoot: root = skillRoot,
  cursorHome: home = cursorHome,
  force = false,
  quiet = false,
}: {
  skillRoot?: string;
  cursorHome?: string;
  force?: boolean;
  quiet?: boolean;
} = {}): InstallHooksResult {
  const hookScript = join(resolve(root), HOOK_SCRIPT);
  if (!existsSync(hookScript)) {
    throw new Error(`Missing hook script: ${hookScript}`);
  }

  const command = `${process.execPath} ${hookScript}`;
  const hooksPath = join(home, "hooks.json");
  const desiredStop = { command };
  const desiredSubagentStop = {
    command,
    matcher: "objective-scout|objective-worker|objective-approval-gate",
  };

  let existing: { version?: number; hooks?: Record<string, unknown> } = { version: 1, hooks: {} };
  if (existsSync(hooksPath)) {
    try {
      existing = JSON.parse(readFileSync(hooksPath, "utf8")) as typeof existing;
    } catch {
      if (!quiet) console.log(`replacing invalid ${hooksPath}`);
    }
  }

  const hooks = existing.hooks && typeof existing.hooks === "object" ? { ...existing.hooks } : {};
  const nextStop = mergeCuratorHookList(hooks.stop, desiredStop);
  const nextSubagentStop = mergeCuratorHookList(hooks.subagentStop, desiredSubagentStop);
  const unchanged =
    !force
    && existsSync(hooksPath)
    && JSON.stringify(hooks.stop) === JSON.stringify(nextStop)
    && JSON.stringify(hooks.subagentStop) === JSON.stringify(nextSubagentStop);

  hooks.stop = nextStop;
  hooks.subagentStop = nextSubagentStop;

  const payload = { version: 1, hooks };
  writeFileSync(hooksPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  if (!quiet) console.log(`${unchanged ? "updated" : "installed"} ${hooksPath}`);

  return {
    path: hooksPath,
    status: unchanged ? "unchanged" : "installed",
    command,
  };
}

function isCuratorHookEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const command = String((entry as { command?: string }).command || "");
  return command.includes("append-session-note.mjs") || command.includes(CURATOR_HOOK_MARKER);
}

function mergeCuratorHookList(existing: unknown, desired: { command: string; matcher?: string }) {
  const list = Array.isArray(existing) ? existing.filter((entry) => !isCuratorHookEntry(entry)) : [];
  list.push(desired);
  return list;
}

export function resetCursorSurfaces({
  quiet = false,
  manifestRoot = skillRoot,
}: {
  quiet?: boolean;
  manifestRoot?: string;
} = {}) {
  const manifestPath = join(resolve(manifestRoot), "install.json");
  if (!existsSync(manifestPath)) {
    if (!quiet) console.log("No install.json manifest; nothing to reset.");
    return { removed: [] as string[], manifest: null };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    agents?: string[];
    commands?: string[];
  };
  const paths = [...new Set([...(manifest.agents || []), ...(manifest.commands || [])])];
  const removed: string[] = [];
  for (const path of paths) {
    if (existsSync(path)) {
      unlinkSync(path);
      removed.push(path);
      if (!quiet) console.log(`removed ${path}`);
    }
  }
  return { removed, manifest };
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}
