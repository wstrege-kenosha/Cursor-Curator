import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { resolveObjectiveDirsFromHook } from "./objective-hook-resolve.mjs";

function writeState(objectiveDir: string, state: unknown): void {
  writeFileSync(join(objectiveDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function scaffoldObjective(root: string, slug: string, activeTask: string | null, activeStatus = "active") {
  const objectiveDir = join(root, "docs", "objectives", slug);
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
  return { objectiveDir };
}

test("resolveObjectiveDirsFromHook filters by objective slug", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-hook-resolve-"));
  try {
    scaffoldObjective(root, "one", "T001");
    scaffoldObjective(root, "two", "T001");
    const dirs = resolveObjectiveDirsFromHook({ workspace_roots: [root], objective_slug: "two" });
    assert.equal(dirs.length, 1);
    assert.match(dirs[0]!, /two$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveObjectiveDirsFromHook returns one dir when workspace has a single objective", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-hook-resolve-"));
  try {
    scaffoldObjective(root, "solo", "T001");
    const dirs = resolveObjectiveDirsFromHook({ workspace_roots: [root] });
    assert.equal(dirs.length, 1);
    assert.match(dirs[0]!, /solo$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
