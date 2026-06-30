import type { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { StateV3, StateV3Task } from "../schema/state-v3.js";
import { invalidateHubPayloadCache } from "../hub/objective-hub.mjs";
import {
  decomposeStateV3,
  intakeRowFromDecomposed,
  rulesRowFromDecomposed,
  type ObjectiveRow,
} from "./state-mapper.mjs";
import { normalizeStoredDirPath } from "./objective-lookup.mjs";
import { ensureWorkspace, withTransaction } from "./connection.mjs";
import { getDb, objectiveRowBySlug } from "./state-repository-db.mjs";
import { loadStateV3 } from "./state-repository-read.mjs";
import { replaceSubobjectiveLinks } from "./state-subobjective-links.mjs";
import { persistObjectivePatchInDb } from "./state-objective-patch.mjs";
import type { LoadedObjective } from "./state-repository-types.mjs";

export { persistObjectivePatchInDb } from "./state-objective-patch.mjs";
export type { ObjectivePatchFields } from "./state-objective-patch.mjs";

type DecomposedState = ReturnType<typeof decomposeStateV3>;

export function clearTasksOnly(db: Database, objectiveId: number): void {
  db.query("DELETE FROM tasks WHERE objective_id = ?").run(objectiveId);
}

function clearObjectiveSatellitesOnly(db: Database, objectiveId: number): void {
  db.query("DELETE FROM objective_intake WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_success_criteria WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_rules WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_agents WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_visual_board WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_checks WHERE objective_id = ?").run(objectiveId);
}

export function clearObjectiveDependents(db: Database, objectiveId: number): void {
  clearTasksOnly(db, objectiveId);
  clearObjectiveSatellitesOnly(db, objectiveId);
}

export function insertObjectiveSatellites(db: Database, objectiveId: number, parts: DecomposedState): void {
  if (parts.intake) {
    const intakeRow = intakeRowFromDecomposed(parts.intake);
    db.query(
      `INSERT INTO objective_intake (
        objective_id, original_request, interpreted_outcome, input_shape, audience, authority,
        proof_type, completion_proof, likely_misfire, blind_spots_considered_json, existing_plan_facts_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objectiveId,
      intakeRow.original_request as string | null,
      intakeRow.interpreted_outcome as string | null,
      intakeRow.input_shape as string | null,
      intakeRow.audience as string | null,
      intakeRow.authority as string | null,
      intakeRow.proof_type as string | null,
      intakeRow.completion_proof as string | null,
      intakeRow.likely_misfire as string | null,
      intakeRow.blind_spots_considered_json as string | null,
      intakeRow.existing_plan_facts_json as string | null,
    );
  }

  db.query(
    "INSERT INTO objective_success_criteria (objective_id, signal, cadence, final_proof) VALUES (?, ?, ?, ?)",
  ).run(
    objectiveId,
    String(parts.successCriteria.signal),
    parts.successCriteria.cadence == null ? null : String(parts.successCriteria.cadence),
    String(parts.successCriteria.final_proof),
  );

  if (parts.rules) {
    const rulesRow = rulesRowFromDecomposed(parts.rules);
    db.query(
      `INSERT INTO objective_rules (
        objective_id, pm_owns_state, one_active_task, max_write_workers,
        no_implementation_without_worker_or_pm_task, no_completion_without_approval_gate_or_pm_audit,
        planning_is_not_completion, queued_required_worker_blocks_completion, continuous_until_full_outcome,
        missing_input_or_credentials_do_not_stop_objective, preserve_and_validate_existing_plan,
        intake_misfire_must_be_audited, goal_pressure_requires_success_criteria, no_completion_on_weak_proof,
        slice_policy_json, extra_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objectiveId,
      rulesRow.pm_owns_state as number | null,
      rulesRow.one_active_task as number | null,
      rulesRow.max_write_workers as number | null,
      rulesRow.no_implementation_without_worker_or_pm_task as number | null,
      rulesRow.no_completion_without_approval_gate_or_pm_audit as number | null,
      rulesRow.planning_is_not_completion as number | null,
      rulesRow.queued_required_worker_blocks_completion as number | null,
      rulesRow.continuous_until_full_outcome as number | null,
      rulesRow.missing_input_or_credentials_do_not_stop_objective as number | null,
      rulesRow.preserve_and_validate_existing_plan as number | null,
      rulesRow.intake_misfire_must_be_audited as number | null,
      rulesRow.goal_pressure_requires_success_criteria as number | null,
      rulesRow.no_completion_on_weak_proof as number | null,
      rulesRow.slice_policy_json as string | null,
      rulesRow.extra_json as string | null,
    );
  }

  db.query(
    "INSERT INTO objective_agents (objective_id, scout, worker, approval_gate) VALUES (?, ?, ?, ?)",
  ).run(objectiveId, parts.agents.scout, parts.agents.worker, parts.agents.approval_gate);

  if (parts.visualBoard) {
    db.query("INSERT INTO objective_visual_board (objective_id, payload_json) VALUES (?, ?)").run(
      objectiveId,
      JSON.stringify(parts.visualBoard),
    );
  }

  if (parts.checks) {
    db.query(
      "INSERT INTO objective_checks (objective_id, dirty_fingerprint, last_verification_json) VALUES (?, ?, ?)",
    ).run(
      objectiveId,
      (parts.checks.dirty_fingerprint as string | undefined) ?? null,
      parts.checks.last_verification ? JSON.stringify(parts.checks.last_verification) : null,
    );
  }
}

export function insertTasksAndListItems(db: Database, objectiveId: number, parts: DecomposedState): void {
  for (const task of parts.tasks) {
    db.query(
      `INSERT INTO tasks (
        objective_id, task_id, type, assignee, status, reasoning_hint, objective_text, receipt_json, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objectiveId,
      task.task_id,
      task.type,
      task.assignee,
      task.status,
      task.reasoning_hint,
      task.objective_text,
      task.receipt_json,
      task.sort_order,
    );
  }

  for (const item of parts.listItems) {
    db.query(
      "INSERT INTO task_list_items (objective_id, task_id, list_name, position, value) VALUES (?, ?, ?, ?, ?)",
    ).run(objectiveId, item.task_id, item.list_name, item.position, item.value);
  }
}

function updateObjectiveHeader(db: Database, objectiveId: number, parts: DecomposedState): void {
  db.query(
    `UPDATE objectives SET
      slug = ?, dir_path = ?, dir_path_normalized = ?, parent_objective_id = ?, parent_task_id = ?,
      version = ?, title = ?, kind = ?, tranche = ?, status = ?, active_task_id = ?,
      first_milestone_complete = ?, updated_at = datetime('now')
    WHERE id = ?`,
  ).run(
    parts.objective.slug,
    parts.objective.dir_path,
    normalizeStoredDirPath(parts.objective.dir_path),
    parts.objective.parent_objective_id,
    parts.objective.parent_task_id,
    parts.objective.version,
    parts.objective.title,
    parts.objective.kind,
    parts.objective.tranche,
    parts.objective.status,
    parts.objective.active_task_id,
    parts.objective.first_milestone_complete,
    objectiveId,
  );
}

function writeObjectiveGraph(
  db: Database,
  workspaceId: number,
  state: StateV3,
  dirPath: string,
  parentObjectiveId: number | null,
  parentTaskId: string | null,
  existingObjectiveId?: number,
): number {
  // Full graph replace: import/register/saveStateV3 only. Runtime patches use surgical persist* helpers.
  const parts = decomposeStateV3(
    state,
    workspaceId,
    existingObjectiveId ?? 0,
    dirPath,
    parentObjectiveId,
    parentTaskId,
  );

  if (existingObjectiveId !== undefined) {
    clearObjectiveDependents(db, existingObjectiveId);
    updateObjectiveHeader(db, existingObjectiveId, parts);
    insertObjectiveSatellites(db, existingObjectiveId, parts);
    insertTasksAndListItems(db, existingObjectiveId, parts);
    return existingObjectiveId;
  }

  const objectiveResult = db
    .query(
      `INSERT INTO objectives (
        workspace_id, slug, dir_path, dir_path_normalized, parent_objective_id, parent_task_id,
        version, title, kind, tranche, status, active_task_id, first_milestone_complete, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      workspaceId,
      parts.objective.slug,
      parts.objective.dir_path,
      normalizeStoredDirPath(parts.objective.dir_path),
      parts.objective.parent_objective_id,
      parts.objective.parent_task_id,
      parts.objective.version,
      parts.objective.title,
      parts.objective.kind,
      parts.objective.tranche,
      parts.objective.status,
      parts.objective.active_task_id,
      parts.objective.first_milestone_complete,
    );
  const objectiveId = Number(objectiveResult.lastInsertRowid);
  insertObjectiveSatellites(db, objectiveId, parts);
  insertTasksAndListItems(db, objectiveId, parts);
  return objectiveId;
}

export function insertObjectiveGraph(
  db: Database,
  workspaceId: number,
  state: StateV3,
  dirPath: string,
  parentObjectiveId: number | null,
  parentTaskId: string | null,
  existingObjectiveId?: number,
): number {
  return writeObjectiveGraph(
    db,
    workspaceId,
    state,
    dirPath,
    parentObjectiveId,
    parentTaskId,
    existingObjectiveId,
  );
}

export function replaceObjectiveGraphInDb(
  db: Database,
  workspaceId: number,
  existing: ObjectiveRow,
  state: StateV3,
  dirPath: string,
): number {
  return writeObjectiveGraph(
    db,
    workspaceId,
    state,
    dirPath,
    existing.parent_objective_id,
    existing.parent_task_id,
    existing.id,
  );
}

export function persistReceiptState(db: Database, objectiveId: number, state: StateV3): void {
  db.query(
    "UPDATE objectives SET status = ?, active_task_id = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(state.objective.status, state.active_task, objectiveId);

  for (const task of state.tasks) {
    db.query(
      "UPDATE tasks SET status = ?, receipt_json = ? WHERE objective_id = ? AND task_id = ?",
    ).run(task.status, task.receipt ? JSON.stringify(task.receipt) : null, objectiveId, task.id);
  }

  if (state.checks?.last_verification !== undefined) {
    const checksRow = db
      .query<{ objective_id: number }, [number]>(
        "SELECT objective_id FROM objective_checks WHERE objective_id = ?",
      )
      .get(objectiveId);
    const verificationJson = JSON.stringify(state.checks.last_verification);
    if (checksRow) {
      db.query(
        "UPDATE objective_checks SET last_verification_json = ?, dirty_fingerprint = COALESCE(?, dirty_fingerprint) WHERE objective_id = ?",
      ).run(verificationJson, state.checks.dirty_fingerprint ?? null, objectiveId);
    } else {
      db.query(
        "INSERT INTO objective_checks (objective_id, dirty_fingerprint, last_verification_json) VALUES (?, ?, ?)",
      ).run(objectiveId, state.checks.dirty_fingerprint ?? null, verificationJson);
    }
  }
}

const TASK_LIST_NAMES = [
  "inputs",
  "constraints",
  "expected_output",
  "allowed_files",
  "verify",
  "stop_if",
] as const;

export function persistObjectiveActiveTask(
  db: Database,
  objectiveId: number,
  activeTaskId: string | null,
): void {
  db.query(
    "UPDATE objectives SET active_task_id = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(activeTaskId, objectiveId);
}

export function persistTaskPatchInDb(
  db: Database,
  objectiveId: number,
  task: StateV3Task,
  sortOrder: number,
): void {
  db.query(
    `UPDATE tasks SET type = ?, assignee = ?, status = ?, reasoning_hint = ?, objective_text = ?, receipt_json = ?, sort_order = ?
     WHERE objective_id = ? AND task_id = ?`,
  ).run(
    task.type,
    task.assignee,
    task.status,
    task.reasoning_hint ?? null,
    task.objective,
    task.receipt ? JSON.stringify(task.receipt) : null,
    sortOrder,
    objectiveId,
    task.id,
  );

  db.query("DELETE FROM task_list_items WHERE objective_id = ? AND task_id = ?").run(objectiveId, task.id);
  for (const listName of TASK_LIST_NAMES) {
    const values = task[listName];
    if (!Array.isArray(values)) continue;
    values.forEach((value, position) => {
      db.query(
        "INSERT INTO task_list_items (objective_id, task_id, list_name, position, value) VALUES (?, ?, ?, ?, ?)",
      ).run(objectiveId, task.id, listName, position, String(value));
    });
  }
}

export function replaceObjectiveStateV3(
  workspaceRoot: string,
  state: StateV3,
  options: { dirPath: string },
): LoadedObjective {
  const root = resolve(workspaceRoot);
  const db = getDb(root);
  const result = withTransaction(db, () => {
    const workspaceId = ensureWorkspace(db, root);
    const existing = objectiveRowBySlug(db, workspaceId, state.objective.slug);
    if (!existing) {
      throw new Error(`Objective not found in database: ${state.objective.slug}`);
    }
    const objectiveId = replaceObjectiveGraphInDb(db, workspaceId, existing, state, options.dirPath);
    replaceSubobjectiveLinks(db, workspaceId, root, objectiveId, state, options.dirPath);
    return loadStateV3(root, state.objective.slug);
  });
  invalidateHubPayloadCache();
  return result;
}
