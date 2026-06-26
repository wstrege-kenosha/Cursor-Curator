import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  appendUsageEvent,
  attributeTaskId,
  buildUsageBoardView,
  emptyUsageFile,
  formatDuration,
  formatUsageShort,
  parseHookUsagePayload,
  processHookUsage,
  readUsageSummary,
} from "./objective-usage.mjs";

function writeState(objectiveDir: string, state: unknown): void {
  writeFileSync(join(objectiveDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function scaffoldObjective(root: string, slug: string, activeTask: string | null, activeStatus = "active") {
  const objectiveDir = join(root, "docs", "objectives", slug);
  const notesDir = join(objectiveDir, "notes");
  mkdirSync(objectiveDir, { recursive: true });
  writeFileSync(join(objectiveDir, "objective.md"), `# ${slug}\n`, "utf8");
  writeState(objectiveDir, {
    version: 3,
    objective: {
      title: slug,
      slug,
      status: "active",
      success_criteria: { signal: "done", cadence: "once", final_proof: "done" },
    },
    rules: { pm_owns_state: true, one_active_task: true },
    agents: { scout: "installed", worker: "installed", approval_gate: "installed" },
    visual_board: { selected: "none", local: { status: "not_requested" } },
    active_task: activeTask,
    tasks: [
      {
        id: "T001",
        type: "scout",
        assignee: "Scout",
        status: activeTask === "T001" ? activeStatus : "done",
        objective: "Scout slice",
      },
      {
        id: "T002",
        type: "worker",
        assignee: "Worker",
        status: activeTask === "T002" ? activeStatus : "queued",
        objective: "Worker slice",
      },
    ],
  });
  return { objectiveDir, notesDir };
}

test("parseHookUsagePayload tolerates missing token fields", () => {
  const parsed = parseHookUsagePayload({ status: "completed", model: "composer" });
  assert.equal(parsed.duration_ms, 0);
  assert.equal(parsed.input_tokens, 0);
  assert.equal(parsed.model, "composer");
});

test("attributeTaskId prefers explicit task_id then active task", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    const { objectiveDir } = scaffoldObjective(root, "alpha", "T002");
    const statePath = join(objectiveDir, "state.json");
    assert.equal(attributeTaskId({ task_id: "T001" }, statePath), "T001");
    assert.equal(attributeTaskId({}, statePath), "T002");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("attributeTaskId falls back to unattributed when active task is not active", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    const { objectiveDir } = scaffoldObjective(root, "beta", "T002", "queued");
    const statePath = join(objectiveDir, "state.json");
    assert.equal(attributeTaskId({}, statePath), "unattributed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("appendUsageEvent rolls up per task and board totals", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    const { objectiveDir } = scaffoldObjective(root, "gamma", "T002");
    appendUsageEvent(objectiveDir, {
      at: "2026-06-25T12:00:00.000Z",
      task_id: "T002",
      hook: "subagentStop",
      model: "composer",
      duration_ms: 120_000,
      input_tokens: 40_000,
      output_tokens: 1_500,
      cache_read_tokens: 10_000,
      cache_write_tokens: 0,
      status: "completed",
    });
    appendUsageEvent(objectiveDir, {
      at: "2026-06-25T12:05:00.000Z",
      task_id: "unattributed",
      hook: "stop",
      model: null,
      duration_ms: 30_000,
      input_tokens: 5_000,
      output_tokens: 200,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      status: "completed",
    });

    const summary = readUsageSummary(objectiveDir);
    assert.equal(summary.rollup.session_count, 2);
    assert.equal(summary.rollup.duration_ms, 150_000);
    assert.equal(summary.tasks.T002.session_count, 1);
    assert.equal(summary.tasks.T002.input_tokens, 40_000);
    assert.equal(summary.unattributed.session_count, 1);
    assert.equal(summary.has_unattributed, true);

    const file = JSON.parse(readFileSync(join(objectiveDir, "notes", "usage.json"), "utf8"));
    assert.equal(file.version, 1);
    assert.equal(file.sessions.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("processHookUsage resolves objectives from workspace roots", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    scaffoldObjective(root, "delta", "T001");
    const result = processHookUsage({
      hook_event_name: "subagentStop",
      workspace_roots: [root],
      duration_ms: 60_000,
      input_tokens: 12_000,
      output_tokens: 800,
      status: "completed",
    });
    assert.equal(result.appended.length, 1);
    assert.equal(result.appended[0]?.task_id, "T001");
    assert.ok(existsSync(join(result.appended[0]!.objective_dir, "notes", "usage.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("processHookUsage skips ambiguous multi-objective workspaces without objective_slug", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    scaffoldObjective(root, "alpha", "T001");
    scaffoldObjective(root, "beta", "T001");
    const result = processHookUsage({
      hook_event_name: "stop",
      workspace_roots: [root],
      duration_ms: 60_000,
      input_tokens: 12_000,
      output_tokens: 800,
      status: "completed",
    });
    assert.equal(result.appended.length, 0);
    assert.equal(result.skipped, "ambiguous objective; set objective_slug");
    assert.match(result.warnings.join(" "), /objective_slug/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildUsageBoardView preformats rollup strings for board payloads", () => {
  const view = buildUsageBoardView({
    present: true,
    rollup: {
      duration_ms: 120_000,
      input_tokens: 50_000,
      output_tokens: 2_000,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      session_count: 1,
    },
    tasks: {},
    unattributed: emptyUsageFile().unattributed,
    has_unattributed: false,
  });
  assert.equal(view.visible, true);
  assert.match(view.summary, /agent time/);
  assert.equal(view.agent_time, "2m");
  assert.equal(view.tokens, "52k");
  assert.equal(view.usage_warning, "");
});

test("formatUsageShort renders duration and token summary", () => {
  assert.equal(formatDuration(90_000), "2m");
  assert.match(
    formatUsageShort(emptyUsageFile().rollup),
    /^—$/,
  );
  assert.match(
    formatUsageShort({
      duration_ms: 2_520_000,
      input_tokens: 1_700_000,
      output_tokens: 95_000,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      session_count: 3,
    }),
    /42m agent time/,
  );
});
