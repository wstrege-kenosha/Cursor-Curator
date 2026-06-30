import type { Database } from "bun:sqlite";
import type { StateV3 } from "../schema/state-v3.js";
import {
  decomposeStateV3,
  intakeRowFromDecomposed,
  rulesRowFromDecomposed,
} from "./state-mapper.mjs";
import { replaceSubobjectiveLinks } from "./state-subobjective-links.mjs";

export interface ObjectivePatchFields {
  objective?: Partial<StateV3["objective"]>;
  rules?: StateV3["rules"];
  agents?: Partial<StateV3["agents"]>;
  checks?: StateV3["checks"];
  active_task?: StateV3["active_task"];
  visual_board?: StateV3["visual_board"];
}

function upsertObjectiveIntake(db: Database, objectiveId: number, intake: Record<string, unknown> | null): void {
  db.query("DELETE FROM objective_intake WHERE objective_id = ?").run(objectiveId);
  if (!intake) {
    return;
  }
  const intakeRow = intakeRowFromDecomposed(intake);
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

function replaceObjectiveRules(db: Database, objectiveId: number, state: StateV3): void {
  db.query("DELETE FROM objective_rules WHERE objective_id = ?").run(objectiveId);
  if (!state.rules) {
    return;
  }
  const parts = decomposeStateV3(state, 0, objectiveId, "", null, null);
  if (!parts.rules) {
    return;
  }
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

function upsertObjectiveChecks(db: Database, objectiveId: number, checks: StateV3["checks"]): void {
  if (!checks) {
    db.query("DELETE FROM objective_checks WHERE objective_id = ?").run(objectiveId);
    return;
  }
  const checksRow = db
    .query<{ objective_id: number }, [number]>(
      "SELECT objective_id FROM objective_checks WHERE objective_id = ?",
    )
    .get(objectiveId);
  const verificationJson = checks.last_verification ? JSON.stringify(checks.last_verification) : null;
  if (checksRow) {
    db.query(
      "UPDATE objective_checks SET dirty_fingerprint = ?, last_verification_json = ? WHERE objective_id = ?",
    ).run(checks.dirty_fingerprint ?? null, verificationJson, objectiveId);
    return;
  }
  db.query(
    "INSERT INTO objective_checks (objective_id, dirty_fingerprint, last_verification_json) VALUES (?, ?, ?)",
  ).run(objectiveId, checks.dirty_fingerprint ?? null, verificationJson);
}

function upsertObjectiveVisualBoard(db: Database, objectiveId: number, visualBoard: StateV3["visual_board"]): void {
  db.query("DELETE FROM objective_visual_board WHERE objective_id = ?").run(objectiveId);
  if (!visualBoard) {
    return;
  }
  db.query("INSERT INTO objective_visual_board (objective_id, payload_json) VALUES (?, ?)").run(
    objectiveId,
    JSON.stringify(visualBoard),
  );
}

export function persistObjectivePatchInDb(
  db: Database,
  objectiveId: number,
  state: StateV3,
  patch: ObjectivePatchFields,
): void {
  if (patch.objective) {
    db.query(
      `UPDATE objectives SET
        title = ?, kind = ?, tranche = ?, status = ?, version = ?,
        active_task_id = ?, first_milestone_complete = ?, updated_at = datetime('now')
      WHERE id = ?`,
    ).run(
      state.objective.title,
      state.objective.kind ?? null,
      state.objective.tranche ?? null,
      state.objective.status,
      state.version,
      state.active_task,
      state.objective.first_milestone_complete === true ? 1 : null,
      objectiveId,
    );

    if (patch.objective.success_criteria) {
      db.query(
        "UPDATE objective_success_criteria SET signal = ?, cadence = ?, final_proof = ? WHERE objective_id = ?",
      ).run(
        state.objective.success_criteria.signal,
        state.objective.success_criteria.cadence ?? null,
        state.objective.success_criteria.final_proof,
        objectiveId,
      );
    }

    if ("intake" in patch.objective) {
      upsertObjectiveIntake(db, objectiveId, state.objective.intake ?? null);
    }
  } else if (patch.active_task !== undefined) {
    db.query(
      "UPDATE objectives SET active_task_id = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(state.active_task, objectiveId);
  }

  if (patch.rules) {
    replaceObjectiveRules(db, objectiveId, state);
  }

  if (patch.agents) {
    db.query(
      "UPDATE objective_agents SET scout = ?, worker = ?, approval_gate = ? WHERE objective_id = ?",
    ).run(state.agents.scout, state.agents.worker, state.agents.approval_gate, objectiveId);
  }

  if (patch.checks !== undefined) {
    upsertObjectiveChecks(db, objectiveId, state.checks);
  }

  if (patch.visual_board !== undefined) {
    upsertObjectiveVisualBoard(db, objectiveId, state.visual_board);
  }
}
