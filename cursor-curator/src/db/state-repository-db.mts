import type { Database } from "bun:sqlite";
import { openDatabase } from "./connection.mjs";
import type { ObjectiveRow } from "./state-mapper.mjs";

export function getDb(workspaceRoot: string, memory = false): Database {
  return openDatabase(workspaceRoot, { memory });
}

export function objectiveRowBySlug(db: Database, workspaceId: number, slug: string): ObjectiveRow | null {
  return (
    db
      .query<ObjectiveRow, [number, string]>(
        "SELECT * FROM objectives WHERE workspace_id = ? AND slug = ?",
      )
      .get(workspaceId, slug) ?? null
  );
}
