import type { Database } from "bun:sqlite";
import { DIR_PATH_NORMALIZED_INDEX_SQL } from "./migrations/003_dir_path_normalized.mjs";
import { normalizeStoredDirPath } from "./objective-lookup.mjs";

export function backfillDirPathNormalized(db: Database): void {
  const rows = db
    .query<{ id: number; dir_path: string; dir_path_normalized: string | null }, []>(
      "SELECT id, dir_path, dir_path_normalized FROM objectives",
    )
    .all();
  const update = db.query("UPDATE objectives SET dir_path_normalized = ? WHERE id = ?");
  for (const row of rows) {
    const normalized = normalizeStoredDirPath(row.dir_path);
    if (row.dir_path_normalized === normalized) {
      continue;
    }
    update.run(normalized, row.id);
  }
  db.exec(DIR_PATH_NORMALIZED_INDEX_SQL);
}
