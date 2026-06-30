import type { StateV3, StateV3Task } from "../schema/state-v3.js";

export interface LoadedObjective {
  workspaceRoot: string;
  slug: string;
  dirPath: string;
  objectiveId: number;
  state: StateV3;
  boardPath: string;
}

export interface ListedObjective {
  slug: string;
  dirPath: string;
  title: string;
  status: string;
  activeTask: string | null;
  updatedAt: string | null;
}

export interface ApplyReceiptOptions {
  role?: string;
  expectedTaskId?: string;
  dryRun?: boolean;
}

export interface PatchTaskInput {
  status?: string;
  allowed_files?: string[];
  verify?: string[];
  stop_if?: string[];
  inputs?: string[];
  constraints?: string[];
  expected_output?: string[];
  subobjective?: StateV3Task["subobjective"];
}
