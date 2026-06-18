import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildMcpServerEntry, buildMcpServerEntryForProject, checkMcpConfig, installMcpConfig, mergeMcpConfig, readPortConfig, resolveMcpRepoRoot } from "../install-mcp.mjs";
import { resolveGoalStatePath, getWorkspaceRoot, resolveWorkspaceForGoal, registerKnownWorkspace } from "../../mcp/path-utils.mjs";
import {
  runMcpSmokeTest,
  toolCompletionCheck,
  toolGetActiveTask,
  toolListGoals,
  toolRenderTaskPrompt,
  toolValidateReceipt,
  toolValidateState,
} from "../../mcp/tools.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const skillRoot = join(repoRoot, "goalbuddy");
const smokeSlug = "sample-cursor-smoke";

process.env.GOALBUDDY_SKILL_ROOT = skillRoot;
const previousGoalWorkspace = process.env.GOALBUDDY_WORKSPACE;
process.env.GOALBUDDY_WORKSPACE = repoRoot;

test("resolveGoalStatePath stays under docs/goals", () => {
  const statePath = resolveGoalStatePath(smokeSlug, repoRoot);
  assert.match(statePath, /docs[/\\]goals[/\\]sample-cursor-smoke[/\\]state\.yaml$/);
});

test("resolveGoalStatePath rejects escape attempts", () => {
  assert.throws(() => resolveGoalStatePath("../../package.json", repoRoot));
});

test("getWorkspaceRoot prefers GOALBUDDY_WORKSPACE when forced", () => {
  const previous = process.env.GOALBUDDY_WORKSPACE;
  const previousForce = process.env.GOALBUDDY_WORKSPACE_FORCE;
  const previousWorkspace = process.env.WORKSPACE_FOLDER_PATHS;
  process.env.GOALBUDDY_WORKSPACE = join(repoRoot, "docs");
  process.env.GOALBUDDY_WORKSPACE_FORCE = "1";
  process.env.WORKSPACE_FOLDER_PATHS = repoRoot;
  try {
    assert.equal(getWorkspaceRoot(), resolve(join(repoRoot, "docs")));
  } finally {
    if (previous === undefined) {
      delete process.env.GOALBUDDY_WORKSPACE;
    } else {
      process.env.GOALBUDDY_WORKSPACE = previous;
    }
    if (previousForce === undefined) {
      delete process.env.GOALBUDDY_WORKSPACE_FORCE;
    } else {
      process.env.GOALBUDDY_WORKSPACE_FORCE = previousForce;
    }
    if (previousWorkspace === undefined) {
      delete process.env.WORKSPACE_FOLDER_PATHS;
    } else {
      process.env.WORKSPACE_FOLDER_PATHS = previousWorkspace;
    }
  }
});

test("getWorkspaceRoot prefers WORKSPACE_FOLDER_PATHS over stale home GOALBUDDY_WORKSPACE", () => {
  const previousWorkspace = process.env.WORKSPACE_FOLDER_PATHS;
  const previousGoalWorkspace = process.env.GOALBUDDY_WORKSPACE;
  process.env.GOALBUDDY_WORKSPACE = homedir();
  process.env.WORKSPACE_FOLDER_PATHS = repoRoot;
  try {
    assert.equal(getWorkspaceRoot(), repoRoot);
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.WORKSPACE_FOLDER_PATHS;
    } else {
      process.env.WORKSPACE_FOLDER_PATHS = previousWorkspace;
    }
    if (previousGoalWorkspace === undefined) {
      delete process.env.GOALBUDDY_WORKSPACE;
    } else {
      process.env.GOALBUDDY_WORKSPACE = previousGoalWorkspace;
    }
  }
});

test("resolveWorkspaceForGoal finds goal in registered workspace when cwd is home", () => {
  const previousGoalWorkspace = process.env.GOALBUDDY_WORKSPACE;
  const configPath = join(skillRoot, "known-workspaces.json");
  const previousConfig = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
  delete process.env.GOALBUDDY_WORKSPACE;
  registerKnownWorkspace(repoRoot);
  try {
    assert.equal(resolveWorkspaceForGoal(smokeSlug), repoRoot);
    const statePath = resolveGoalStatePath(smokeSlug);
    assert.match(statePath, /sample-cursor-smoke[/\\]state\.yaml$/);
  } finally {
    if (previousGoalWorkspace === undefined) {
      delete process.env.GOALBUDDY_WORKSPACE;
    } else {
      process.env.GOALBUDDY_WORKSPACE = previousGoalWorkspace;
    }
    if (previousConfig === null) {
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
    } else {
      writeFileSync(configPath, previousConfig, "utf8");
    }
  }
});

test("getWorkspaceRoot uses WORKSPACE_FOLDER_PATHS when cwd is home", () => {
  const previousWorkspace = process.env.WORKSPACE_FOLDER_PATHS;
  const previousGoalWorkspace = process.env.GOALBUDDY_WORKSPACE;
  delete process.env.GOALBUDDY_WORKSPACE;
  process.env.WORKSPACE_FOLDER_PATHS = repoRoot;
  try {
    assert.equal(getWorkspaceRoot(), repoRoot);
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.WORKSPACE_FOLDER_PATHS;
    } else {
      process.env.WORKSPACE_FOLDER_PATHS = previousWorkspace;
    }
    if (previousGoalWorkspace === undefined) {
      delete process.env.GOALBUDDY_WORKSPACE;
    } else {
      process.env.GOALBUDDY_WORKSPACE = previousGoalWorkspace;
    }
  }
});

test("toolValidateState passes smoke goal", () => {
  const result = toolValidateState({ goal: smokeSlug });
  assert.equal(result.ok, true);
  assert.equal(result.slug, smokeSlug);
});

test("toolGetActiveTask returns active task row", () => {
  const result = toolGetActiveTask({ goal: smokeSlug });
  assert.match(result.task.id, /^T\d{3}$/);
  assert.ok(result.task.type);
});

test("toolRenderTaskPrompt includes cursor subagent metadata", () => {
  const result = toolRenderTaskPrompt({ goal: smokeSlug });
  assert.ok(result.metadata.board_path);
  assert.ok(result.task.id);
  assert.ok("cursor_task_subagent_type" in result.metadata);
});

test("toolValidateReceipt rejects malformed receipt", () => {
  const result = toolValidateReceipt({ receipt: { bad: true }, role: "worker" });
  assert.equal(result.ok, false);
});

test("toolCompletionCheck reports not ready for active smoke goal", () => {
  const result = toolCompletionCheck({ goal: smokeSlug });
  assert.equal(result.ready, false);
  assert.equal(result.validation_ok, true);
});

test("toolListGoals discovers repo goals", () => {
  const result = toolListGoals({});
  assert.ok(result.goal_count >= 2);
  assert.ok(result.goals.some((goal) => goal.slug === smokeSlug));
});

test("runMcpSmokeTest passes on sample goal", () => {
  const result = runMcpSmokeTest({ workspaceRoot: repoRoot, goal: smokeSlug });
  assert.equal(result.ok, true);
  assert.equal(result.validation_ok, true);
});

test("mergeMcpConfig preserves other servers", () => {
  const merged = mergeMcpConfig({ mcpServers: { other: { command: "echo" } } }, buildMcpServerEntry(skillRoot));
  assert.ok(merged.mcpServers.other);
  assert.ok(merged.mcpServers.goalbuddy);
});

test("buildMcpServerEntry points at launcher script with workspace cwd", () => {
  const entry = buildMcpServerEntry(skillRoot);
  assert.equal(entry.command, "node");
  assert.equal(entry.cwd, ".");
  assert.equal(
    resolve(String(entry.args[0])),
    resolve(skillRoot, "scripts", "run-mcp-server.mjs"),
  );
});

test("buildMcpServerEntryForProject uses launcher for external repos", () => {
  const externalRoot = resolve(repoRoot, "..", "external-goal-project");
  const entry = buildMcpServerEntryForProject(externalRoot, skillRoot);
  assert.equal(entry.command, "node");
  assert.equal(entry.cwd, ".");
  assert.equal(
    resolve(String(entry.args[0])),
    resolve(skillRoot, "scripts", "run-mcp-server.mjs"),
  );
});

test("buildMcpServerEntryForProject uses portable repo-relative paths", () => {
  const entry = buildMcpServerEntryForProject(repoRoot, skillRoot);
  assert.equal(entry.command, "node");
  assert.deepEqual(entry.args, ["goalbuddy/mcp/server.mjs"]);
  assert.equal(entry.cwd, ".");
  assert.equal(entry.args.some((arg) => arg.includes("Users")), false);
});

test("installMcpConfig writes user-level and project configs", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "goalbuddy-mcp-"));
  const userConfigPath = join(tempHome, "mcp.json");
  writeFileSync(
    userConfigPath,
    `${JSON.stringify({ mcpServers: { other: { command: "echo" } } }, null, 2)}\n`,
    "utf8",
  );

  const result = installMcpConfig({
    skillRoot,
    projectRoots: [repoRoot],
    cursorHome: tempHome,
    repoRoot,
  });

  assert.equal(result.installed.length, 2);
  const userConfig = JSON.parse(readFileSync(userConfigPath, "utf8"));
  assert.ok(userConfig.mcpServers.other);
  assert.ok(userConfig.mcpServers.goalbuddy);
  assert.equal(
    resolve(String(userConfig.mcpServers.goalbuddy.args[0])),
    resolve(skillRoot, "scripts", "run-mcp-server.mjs"),
  );
  assert.equal(readPortConfig(skillRoot)?.repoRoot, repoRoot);
});

test("resolveMcpRepoRoot finds repo deps from port config", () => {
  installMcpConfig({
    skillRoot,
    projectRoots: [repoRoot],
    repoRoot,
  });
  assert.equal(resolveMcpRepoRoot(skillRoot), repoRoot);
});

test("checkMcpConfig accepts repo project config", () => {
  const configPath = join(repoRoot, ".cursor", "mcp.json");
  const check = checkMcpConfig(configPath, skillRoot);
  assert.equal(check.ok, true);
  assert.equal(existsSync(check.server_path), true);
});
