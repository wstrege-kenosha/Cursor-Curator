# Usage

## In Cursor (PM loop)

1. `/objective-prep` — describe your outcome; Cursor Curator scaffolds `docs/objectives/<slug>/` in your workspace.
2. `/objective Follow docs/objectives/<slug>/objective.md.` — PM runs Scout → Approval Gate → Worker using **cursor-curator MCP tools** each turn.

### MCP tool sequence (each `/objective` turn)

0. `session_resume_digest` — turn-0 handoff; use `list_objectives` with `stale_days: 7` when objectives may be idle
1. `get_active_task` → `validate_state` (stop if errors)
2. `misfire_audit_check` / `subobjective_rollup_check` when rules require them
3. `render_task_prompt` → spawn Task subagent (`objective-scout` | `objective-approval-gate` | `objective-worker`)
4. `validate_receipt` → `verify_worker_receipt` for done Workers (writes `checks.last_verification` patch)
5. PM updates `state.json`
6. `validate_state` again → `append_session_note`

## CLI (after install)

Add `%USERPROFILE%\.cursor\bin` (Windows) or `~/.cursor/bin` (macOS/Linux) to PATH. Then from any repo with an objective:

```bash
curator doctor --objective-ready
curator hub --json
curator board docs/objectives/<slug>
curator resume docs/objectives/<slug> --json
curator verify-receipt docs/objectives/<slug> --task T003 --receipt-file notes/T003-worker.md
curator blocked docs/objectives/<slug> --json
curator misfire-audit docs/objectives/<slug>
curator subobjective-rollup docs/objectives/<slug>
curator prompt docs/objectives/<slug> --task T001 --json
curator completion-check docs/objectives/<slug>
curator stale --days 7
curator receipt notes/T003-worker.md --role worker
```

Or use the full path:

```bash
node ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs doctor --objective-ready
```

## Local board and hub

- **Hub** (all objectives): http://curator.localhost:41737/
- **Single objective**: http://curator.localhost:41737/<slug>/

Boards show **agent time and token usage** per task when Cursor hooks are installed (`curator install` writes `~/.cursor/hooks.json`). Metrics accumulate in `docs/objectives/<slug>/notes/usage.json` and appear on the board progress rail, task cards, and hub cards.

Use http://127.0.0.1:41737/ if `curator.localhost` does not resolve.

### Usage metrics (hooks)

Install registers two hooks that call `cursor-curator/scripts/hooks/append-usage-metrics.mjs`:

- **`stop`** — PM/agent session end; also appends `notes/SESSION.md`
- **`subagentStop`** (matcher: `objective-scout|objective-worker|objective-approval-gate`) — higher-fidelity per-task attribution

Each event reads `duration_ms`, `input_tokens`, `output_tokens`, and cache token fields from the Cursor hook payload (when present) and attributes usage to `active_task` in `state.json` when that task is `active`. Otherwise usage goes to an **unattributed** bucket (shown as a board warning).

`input_tokens` is the total input count Cursor reports (includes cache read/write). Rollups do not double-count cache fields.

For project-level hooks instead of user hooks, copy [`cursor-curator/hooks.example.json`](../../cursor-curator/hooks.example.json) to `.cursor/hooks.json` in your repo and adjust paths.

## Repo layout

| Path | Purpose |
|------|---------|
| `cursor-curator/src/` | TypeScript sources (state, CLI, MCP, board) |
| `cursor-curator/dist/` | Compiled ESM for CLI, MCP, and board |
| `cursor-curator/scripts/lib/objective-*.mjs` | PM helper shims (import `dist/`; dual-read via `loadState`) |
| `objective-prep/` | Prep skill |
| `scripts/install-from-repo.mjs` | Install into `~/.cursor/skills` + skill runtime deps |

Canonical board truth is **`state.json`** (v3, Zod-validated in `cursor-curator/src/state/` → `dist/state/`). `loadState()` resolves JSON first, then legacy `state.yaml` v2 with a deprecation warning. Board UI and hub code live in `cursor-curator/src/board/` → `dist/board/`.
