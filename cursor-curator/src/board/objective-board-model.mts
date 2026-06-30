import { boardColumnLabels } from "./board-theme.mjs";

export const VALID_STATUSES = new Set(["queued", "active", "blocked", "done"]);
export const COLUMN_ORDER = ["todo", "in-progress", "blocked", "completed"];

export interface NormalizedBoardReceipt {
  present: boolean;
  summary: string;
  result: string;
  note: string;
  decision?: string;
  changedFiles?: string[];
  commands?: Array<{ cmd: string; status: string }>;
  evidence?: string[];
}

export interface NormalizedBoardSubobjective {
  status: string;
  path: string;
  depth?: number;
  owner?: string;
  createdFrom?: string;
  rollupReceipt?: string;
  board?: unknown;
}

export interface NormalizedBoardTask {
  id: string;
  title: string;
  objective: string;
  status: string;
  column: string;
  type: string;
  assignee: string;
  active: boolean;
  inputs: string[];
  constraints: string[];
  expectedOutput: string[];
  allowedFiles: string[];
  verify: string[];
  stopIf: string[];
  subobjective: NormalizedBoardSubobjective | null;
  receipt: NormalizedBoardReceipt;
}

export class ObjectiveBoardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectiveBoardError";
  }
}

export function normalizeObjectiveBoard(document: Record<string, unknown>, objectiveDir = "<memory>") {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new ObjectiveBoardError("Objective state must be a YAML mapping.");
  }
  if (Number(document.version) !== 2 && Number(document.version) !== 3) {
    throw new ObjectiveBoardError("Only Cursor Curator state v2 (YAML) or v3 (JSON) files are supported.");
  }
  const objective = document.objective;
  if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
    throw new ObjectiveBoardError("Missing objective metadata.");
  }
  if (!Array.isArray(document.tasks) || document.tasks.length === 0) {
    throw new ObjectiveBoardError("Missing non-empty tasks list.");
  }

  const objectiveRecord = objective as Record<string, unknown>;
  const tasks = document.tasks.map((task, index) => normalizeTask(task as Record<string, unknown>, index));
  const activeTasks = tasks.filter((task) => task.status === "active");
  if (activeTasks.length > 1) {
    throw new ObjectiveBoardError("Objective state has more than one active task.");
  }

  return {
    objectiveDir,
    title: cleanText(objectiveRecord.title || "Untitled objective"),
    slug: cleanText(objectiveRecord.slug || "untitled-objective"),
    kind: cleanText(objectiveRecord.kind || "open_ended"),
    tranche: cleanText(objectiveRecord.tranche || ""),
    status: cleanText(objectiveRecord.status || "active"),
    activeTask: cleanText(document.active_task || activeTasks[0]?.id || ""),
    tasks,
  };
}

export function normalizeTask(task: Record<string, unknown>, index: number): NormalizedBoardTask {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw new ObjectiveBoardError(`Task ${index + 1} must be a mapping.`);
  }

  const id = cleanText(task.id);
  const status = normalizeTaskStatus(task.status);
  if (!id) throw new ObjectiveBoardError(`Task ${index + 1} is missing id.`);
  if (!VALID_STATUSES.has(status)) {
    throw new ObjectiveBoardError(`Task ${id} has unsupported status "${status}".`);
  }

  return {
    id,
    title: titleForTask(task),
    objective: cleanText(task.objective || ""),
    status,
    column: columnForStatus(status),
    type: cleanText(task.type || "pm"),
    assignee: cleanText(task.assignee || ""),
    active: status === "active",
    inputs: normalizeStringList(task.inputs),
    constraints: normalizeStringList(task.constraints),
    expectedOutput: normalizeStringList(task.expected_output),
    allowedFiles: normalizeStringList(task.allowed_files),
    verify: normalizeStringList(task.verify),
    stopIf: normalizeStringList(task.stop_if),
    subobjective: normalizeSubobjective(task.subobjective),
    receipt: normalizeReceipt(task.receipt),
  };
}

export function buildColumns(tasks: NormalizedBoardTask[]) {
  const byColumn = new Map<string, NormalizedBoardTask[]>(COLUMN_ORDER.map((id) => [id, []]));
  for (const task of tasks) {
    byColumn.get(task.column)?.push(task);
  }

  for (const [columnId, columnTasks] of byColumn.entries()) {
    columnTasks.sort((left, right) => compareColumnTasks(columnId, left, right));
  }

  return COLUMN_ORDER.map((id) => {
    const labels = boardColumnLabels(id);
    return {
      id,
      title: labels.title,
      description: labels.description,
      tasks: byColumn.get(id) ?? [],
    };
  });
}

function normalizeReceipt(receipt: unknown): NormalizedBoardReceipt {
  if (!receipt) return { present: false, summary: "", result: "", note: "" };
  if (typeof receipt === "string") {
    return { present: true, summary: cleanText(receipt), result: "", note: "" };
  }
  if (Array.isArray(receipt) || typeof receipt !== "object") {
    return { present: true, summary: cleanText(receipt), result: "", note: "" };
  }
  const record = receipt as Record<string, unknown>;
  return {
    present: true,
    result: cleanText(record.result || ""),
    summary: cleanText(record.summary || record.decision || record.note || record.result || ""),
    decision: cleanText(record.decision || ""),
    note: cleanText(record.note || ""),
    changedFiles: normalizeStringList(record.changed_files),
    commands: normalizeCommands(record.commands),
    evidence: normalizeStringList(record.evidence),
  };
}

function normalizeSubobjective(subobjective: unknown): NormalizedBoardSubobjective | null {
  if (!subobjective || typeof subobjective !== "object" || Array.isArray(subobjective)) return null;
  const record = subobjective as Record<string, unknown>;
  return {
    status: cleanText(record.status || ""),
    path: cleanText(record.path || ""),
    owner: cleanText(record.owner || ""),
    createdFrom: cleanText(record.created_from || ""),
    depth: Number(record.depth || 0),
    rollupReceipt: cleanText(record.rollup_receipt || ""),
    board: null,
  };
}

function normalizeCommands(commands: unknown) {
  if (!commands) return [];
  if (!Array.isArray(commands)) return [cleanText(commands)].filter(Boolean).map((cmd) => ({ cmd, status: "" }));
  return commands.map((command) => {
    if (typeof command === "string") return { cmd: cleanText(command), status: "" };
    const record = command as Record<string, unknown>;
    return {
      cmd: cleanText(record.cmd || ""),
      status: cleanText(record.status || ""),
    };
  }).filter((command) => command.cmd || command.status);
}

function titleForTask(task: Record<string, unknown>) {
  if (task.title) return compactTaskTitle(task.title);
  const objective = cleanText(task.objective || "Untitled task");
  return compactTaskTitle(objective);
}

function compactTaskTitle(value: unknown) {
  const text = cleanText(value).replace(/\.$/, "");
  const routeMatch = text.match(/^Implement\b.*?\s(\/[A-Za-z0-9_./:-]+)\s+(route|queue slice|slice)\b/i);
  if (routeMatch) return `Implement ${routeMatch[1]} ${routeMatch[2]}`;

  const firstClause = text
    .split(/(?<=[.!?])\s+|\s+(?:Use only|Add|Match|Render|Clearly label|Do not)\b/i)[0]
    .replace(/\bas the next first-milestone slice\b/gi, "")
    .replace(/\bblocker documentation\b/gi, "blocker docs")
    .replace(/\benv\/setup notes\b/gi, "setup notes")
    .replace(/\s+/g, " ")
    .replace(/[.;:,]\s*$/, "")
    .trim();

  return firstClause || text;
}

function columnForStatus(status: string) {
  if (status === "blocked") return "blocked";
  if (status === "done") return "completed";
  if (status === "queued") return "todo";
  return "in-progress";
}

function taskSortKey(task: NormalizedBoardTask) {
  const rank = task.status === "active" ? "0" : task.status === "queued" ? "1" : task.status === "blocked" ? "2" : "3";
  return `${rank}:${task.id}`;
}

function compareColumnTasks(columnId: string, left: NormalizedBoardTask, right: NormalizedBoardTask) {
  const order = taskSortKey(left).localeCompare(taskSortKey(right));
  if (columnId === "completed") return -order;
  return order;
}

function normalizeStringList(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return [cleanText(value)].filter(Boolean);
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTaskStatus(value: unknown): string {
  const status = cleanText(value);
  if (status === "complete" || status === "completed") return "done";
  return status;
}

export { parseObjectiveStateText } from "./objective-board-yaml-legacy.mjs";
