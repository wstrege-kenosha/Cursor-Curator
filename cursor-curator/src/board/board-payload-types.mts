import type { NormalizedBoardTask } from "./objective-board-model.mjs";

export interface BoardPayloadObjective {
  title: string;
  slug: string;
  kind: string;
  status: string;
  tranche: string;
  activeTask: string;
  success_criteria?: unknown;
  intake?: unknown;
}

export interface BoardPayloadColumn {
  id: string;
  title: string;
  description: string;
  tasks: NormalizedBoardTask[];
}

export interface BoardPayloadSource {
  objectiveDir: string;
  statePath: string;
  boardPath: string;
  dbPath?: string;
  stateMtimeMs?: number;
  notesDir?: string;
}

export interface BoardPayload {
  generatedAt: string;
  error?: string;
  repo?: unknown;
  source?: BoardPayloadSource;
  objective: BoardPayloadObjective;
  validation?: unknown;
  completion?: unknown;
  lastVerification?: unknown;
  activeTaskDetail?: unknown;
  progress?: unknown;
  sessionPreview?: unknown;
  usage?: unknown;
  counts?: unknown;
  columns: BoardPayloadColumn[];
  tasks: NormalizedBoardTask[];
  notes: Array<{ path: string; title?: string; mtimeMs?: number }>;
  sessionLog?: string | null;
}

export function boardPayloadObjective(payload: BoardPayload): BoardPayloadObjective {
  return payload.objective;
}
