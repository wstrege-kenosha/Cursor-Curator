import { existsSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BoardPayload } from "./board-payload-types.mjs";
import { createBoardPayload } from "./objective-board.mjs";
import { resolveDbPath } from "../db/connection.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";

export function watchObjective(objectiveDir: string, onChange: () => void) {
  const watchers: ReturnType<typeof watch>[] = [];
  const schedule = debounce(onChange, 80);
  let watchedDirs = new Set<string>();
  const workspaceRoot = resolveWorkspaceForObjective(objectiveDir);
  const dbDir = dirname(resolveDbPath(workspaceRoot));

  const rebuild = (cachedPayload?: PayloadDirNode) => {
    for (const watcher of watchers.splice(0)) watcher.close();
    watchedDirs = objectiveDirsForPayload(objectiveDir, cachedPayload);
    if (existsSync(dbDir)) {
      watchers.push(watch(dbDir, { persistent: true }, () => schedule()));
      for (const dbFile of ["curator.db", "curator.db-wal", "curator.db-shm"]) {
        const dbPath = join(dbDir, dbFile);
        if (existsSync(dbPath)) {
          watchers.push(watch(dbPath, { persistent: true }, schedule));
        }
      }
    }
    for (const dir of watchedDirs) {
      const notesDir = join(dir, "notes");
      if (existsSync(notesDir)) watchers.push(watch(notesDir, { persistent: true }, schedule));
    }
  };

  rebuild();
  return {
    close() {
      for (const watcher of watchers) watcher.close();
    },
    refresh(cachedPayload?: PayloadDirNode) {
      const next = objectiveDirsForPayload(objectiveDir, cachedPayload);
      if (!sameSet(watchedDirs, next)) rebuild(cachedPayload);
    },
  };
}

export function safeBoardPayload(objectiveDir: string): BoardPayload {
  try {
    return createBoardPayload(objectiveDir);
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      objective: {
        title: "Cursor Curator Board",
        slug: "",
        kind: "",
        status: "error",
        tranche: "",
        activeTask: "",
      },
      columns: [
        { id: "todo", title: "Todo", description: "Queued work ready to pull", tasks: [] },
        { id: "in-progress", title: "In Progress", description: "The active task", tasks: [] },
        { id: "blocked", title: "Blocked", description: "Needs unblock or a smaller slice", tasks: [] },
        { id: "completed", title: "Completed", description: "Receipted work", tasks: [] },
      ],
      tasks: [],
      notes: [],
    };
  }
}

interface PayloadDirNode {
  source?: { objectiveDir?: string };
  tasks?: Array<{ subobjective?: { board?: PayloadDirNode } | null }>;
}

function objectiveDirsForPayload(objectiveDir: string, cachedPayload?: PayloadDirNode): Set<string> {
  const dirs = new Set([resolve(objectiveDir)]);
  try {
    const payload = cachedPayload ?? (createBoardPayload(objectiveDir) as PayloadDirNode);
    collectPayloadObjectiveDirs(payload, dirs);
  } catch {
    // Keep watching the parent when the board is temporarily invalid.
  }
  return dirs;
}

function collectPayloadObjectiveDirs(payload: PayloadDirNode, dirs: Set<string>) {
  if (payload.source?.objectiveDir) dirs.add(resolve(payload.source.objectiveDir));
  for (const task of payload.tasks || []) {
    if (task.subobjective?.board) collectPayloadObjectiveDirs(task.subobjective.board, dirs);
  }
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function debounce(fn: () => void, delay: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}
