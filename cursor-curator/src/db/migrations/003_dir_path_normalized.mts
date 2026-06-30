export const DIR_PATH_NORMALIZED_MIGRATION_SQL = `ALTER TABLE objectives ADD COLUMN dir_path_normalized TEXT;`;

export const DIR_PATH_NORMALIZED_INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS idx_objectives_workspace_dir_norm
  ON objectives(workspace_id, dir_path_normalized);`;
