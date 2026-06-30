export interface UsageCounters {
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  session_count: number;
}

export interface TaskUsage extends UsageCounters {
  last_session_at?: string;
  models?: string[];
}

export interface UsageSession {
  at: string;
  task_id: string;
  hook: string;
  model: string | null;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  status: string | null;
}

export interface UsageFile {
  version: 1;
  rollup: UsageCounters;
  tasks: Record<string, TaskUsage>;
  unattributed: UsageCounters;
  sessions: UsageSession[];
}

export interface UsageSummary {
  present: boolean;
  rollup: UsageCounters;
  tasks: Record<string, TaskUsage>;
  unattributed: UsageCounters;
  has_unattributed: boolean;
}

export interface UsageBoardView extends UsageSummary {
  visible: boolean;
  summary: string;
  agent_time: string;
  tokens: string;
  tokens_title: string;
  usage_warning: string;
}

export interface SubobjectiveTaskRef {
  id?: string;
  subobjective?: {
    path?: string;
  };
}

export interface ChildUsageDir {
  path: string;
  dir: string;
  usage_path: string;
}

export interface UsageSummaryWithChildren extends UsageSummary {
  children: Record<string, UsageSummary>;
  rollup_includes_subobjectives: boolean;
}

export interface ReadUsageSummaryForObjectiveOptions {
  include_subobjectives?: boolean;
  tasks?: SubobjectiveTaskRef[];
}

export interface ParsedHookUsage {
  model: string | null;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  status: string | null;
}

export function usageNum(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function emptyUsageCounters(): UsageCounters {
  return {
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    session_count: 0,
  };
}

export function emptyUsageFile(): UsageFile {
  return {
    version: 1,
    rollup: emptyUsageCounters(),
    tasks: {},
    unattributed: emptyUsageCounters(),
    sessions: [],
  };
}
