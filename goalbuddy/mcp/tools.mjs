import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { checkCompletionReadiness } from "../scripts/lib/goal-completion.mjs";
import { buildHubPayload } from "../scripts/lib/goal-hub.mjs";
import { validateReceipt } from "../scripts/lib/goal-receipt.mjs";
import { appendSessionNote } from "../scripts/lib/goal-session.mjs";
import { findStaleGoals } from "../scripts/lib/goal-stale.mjs";
import { validateGoalState } from "../scripts/lib/goal-state.mjs";
import { createParallelPlan } from "../scripts/parallel-plan.mjs";
import { loadBoard, renderTaskPrompt, selectTask } from "../scripts/render-task-prompt.mjs";
import { getWorkspaceRoot, resolveGoalDir, resolveGoalStatePath, collectWorkspaceCandidates, resolveWorkspaceForGoal } from "./path-utils.mjs";

function workspaceForArgs(args = {}) {
  if (args.workspace_root) {
    return resolve(String(args.workspace_root));
  }
  if (args.goal) {
    return resolveWorkspaceForGoal(args.goal);
  }
  return getWorkspaceRoot();
}

function goalRootsForList(args = {}) {
  if (args.workspace_root) {
    return [resolve(String(args.workspace_root))];
  }
  const roots = collectWorkspaceCandidates().filter((root) => {
    try {
      return existsSync(join(root, "docs", "goals"));
    } catch {
      return false;
    }
  });
  return roots.length ? roots : [getWorkspaceRoot()];
}

const CURSOR_AGENT_MAP = {
  goal_scout: "goal-scout",
  goal_judge: "goal-judge",
  goal_worker: "goal-worker",
};

export function toolListGoals(args = {}) {
  const roots = goalRootsForList(args);
  const workspaceRoot = workspaceForArgs(args);
  const days = Number(args.stale_days) > 0 ? Number(args.stale_days) : 0;
  const payload = buildHubPayload({ roots });
  const stale = days > 0 ? findStaleGoals({ days, roots }) : null;
  const staleSlugs = new Set((stale?.goals || []).map((goal) => goal.slug));

  return {
    workspace_root: workspaceRoot,
    scanned_roots: roots,
    goal_count: payload.goal_count,
    goals: payload.goals.map((goal) => ({
      slug: goal.slug,
      title: goal.title,
      status: goal.status,
      active_task: goal.active_task,
      active_task_type: goal.active_task_type,
      oracle_health: goal.oracle_health,
      validation_ok: goal.validation_ok,
      stale: staleSlugs.has(goal.slug),
      state_path: goal.state_path,
      url: goal.url,
    })),
    stale_report: stale,
  };
}

export function toolGetGoalState(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveGoalStatePath(args.goal, workspaceRoot);
  const board = loadBoard(statePath);
  const validation = validateGoalState(statePath);

  return {
    workspace_root: workspaceRoot,
    state_path: statePath,
    goal_dir: dirname(statePath),
    slug: basename(dirname(statePath)),
    validation,
    goal: board.goal,
    rules: board.document.rules || {},
    checks: board.document.checks || {},
    agents: board.document.agents || {},
    active_task: board.document.active_task,
    tasks: board.document.tasks || [],
  };
}

export function toolGetActiveTask(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveGoalStatePath(args.goal, workspaceRoot);
  const board = loadBoard(statePath);
  const validation = validateGoalState(statePath);
  const taskId = args.task_id || board.document.active_task;
  const task = selectTask(board, taskId);

  return {
    workspace_root: workspaceRoot,
    state_path: statePath,
    active_task: board.document.active_task,
    task: {
      id: task.id,
      type: task.type,
      status: task.status,
      objective: task.objective || "",
      assignee: task.assignee || null,
      allowed_files: task.allowed_files || [],
      verify: task.verify || [],
      stop_if: task.stop_if || [],
      receipt: task.receipt || null,
    },
    validation_ok: validation.ok,
    validation_errors: validation.errors,
  };
}

export function toolValidateState(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveGoalStatePath(args.goal, workspaceRoot);
  const result = validateGoalState(statePath);
  return {
    ...result,
    workspace_root: workspaceRoot,
    goal_root: dirname(statePath),
    slug: basename(dirname(statePath)),
  };
}

export function toolRenderTaskPrompt(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveGoalStatePath(args.goal, workspaceRoot);
  const board = loadBoard(statePath);
  const taskId = args.task_id || board.document.active_task;
  const result = renderTaskPrompt({
    boardPath: statePath,
    taskId,
    json: true,
  });
  return {
    workspace_root: workspaceRoot,
    ...mapCursorAgentsInPayload(result.payload),
  };
}

export function toolParallelPlan(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const goalDir = resolveGoalDir(args.goal, workspaceRoot);
  const plan = createParallelPlan({ goalRoot: goalDir, json: true });
  return {
    workspace_root: workspaceRoot,
    ...plan,
    candidates: (plan.candidates || []).map(mapParallelCandidate),
    spawn_plan: (plan.spawn_plan || []).map(mapSpawnPlanEntry),
  };
}

export function toolValidateReceipt(args = {}) {
  let input = args.receipt;
  if (args.receipt_file) {
    input = readFileSync(args.receipt_file, "utf8");
  }
  if (input === undefined || input === null) {
    throw new Error("receipt or receipt_file is required.");
  }
  return validateReceipt(input, {
    role: args.role,
    expectedTaskId: args.task_id,
  });
}

export function toolCompletionCheck(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveGoalStatePath(args.goal, workspaceRoot);
  return {
    workspace_root: workspaceRoot,
    ...checkCompletionReadiness(statePath),
  };
}

export function toolAppendSessionNote(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  return appendSessionNote({
    workspaceRoot,
    summary: args.summary,
    task_id: args.task_id,
    goal_slug: args.goal_slug,
  });
}

export function runMcpSmokeTest(options = {}) {
  const workspaceRoot = options.workspaceRoot || getWorkspaceRoot();
  const goal = options.goal || "sample-cursor-smoke";
  const statePath = resolveGoalStatePath(goal, workspaceRoot);
  const validation = validateGoalState(statePath);
  const prompt = toolRenderTaskPrompt({ goal });
  const completion = checkCompletionReadiness(statePath);

  return {
    ok: validation.ok && Boolean(prompt?.metadata?.board_path),
    workspace_root: workspaceRoot,
    state_path: statePath,
    validation_ok: validation.ok,
    prompt_task_id: prompt?.task?.id || null,
    completion_ready: completion.ready,
    tools_exercised: ["validate_state", "render_task_prompt", "completion_check"],
  };
}

function mapCursorAgentsInPayload(payload) {
  const agent = payload.metadata.recommended_agent;
  const mapped = CURSOR_AGENT_MAP[agent] || agent;
  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      recommended_agent: mapped,
      required_spawn_agent_type: mapped === "PM" ? null : mapped,
      cursor_task_subagent_type: mapped === "PM" ? null : mapped,
    },
  };
}

function mapParallelCandidate(candidate) {
  const mapped = CURSOR_AGENT_MAP[candidate.recommended_agent] || candidate.recommended_agent;
  return {
    ...candidate,
    recommended_agent: mapped,
    cursor_task_subagent_type: mapped,
  };
}

function mapSpawnPlanEntry(entry) {
  const mapped = entry.cursor_task_subagent_type ||
    CURSOR_AGENT_MAP[entry.recommended_agent] ||
    entry.recommended_agent;
  return {
    ...entry,
    cursor_task_subagent_type: mapped,
    task_prompt: entry.task_prompt ? mapCursorAgentsInPayload(entry.task_prompt) : entry.task_prompt,
  };
}

export const TOOL_HANDLERS = {
  list_goals: toolListGoals,
  get_goal_state: toolGetGoalState,
  get_active_task: toolGetActiveTask,
  validate_state: toolValidateState,
  render_task_prompt: toolRenderTaskPrompt,
  parallel_plan: toolParallelPlan,
  validate_receipt: toolValidateReceipt,
  completion_check: toolCompletionCheck,
  append_session_note: toolAppendSessionNote,
};
