# Migrate 1.0.0 → 2.0.0

Upgrade guide for existing GoalBuddy Cursor Port installs.

**Full doc in repo:** `docs/MIGRATION-1.0-to-2.0.md`

## Quick steps

```bash
cd GoalBuddy-Cursor-Port
git pull
npm install
npm run install:cursor
```

1. **Cursor Settings → MCP** — enable `goalbuddy`
2. **Restart Cursor**
3. Verify: `node goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready`

## What you must do differently

| 1.0.0 | 2.0.0 |
|-------|-------|
| `/goal` + CLI prompts | `/goal` + **MCP tools** (`validate_state`, `render_task_prompt`, `validate_receipt`) |
| Install skills only | Install skills **and** MCP config |
| Manual turns only | Optional `run --auto N` with `CURSOR_API_KEY` |

**No `state.yaml` migration** — existing goals work as-is.

## Verify version

```bash
node -e "console.log(require('./goalbuddy/version.json').cursorPortVersion)"
# 2.0.0
```

## Optional: SDK auto-loop

```bash
export CURSOR_API_KEY="cursor_..."
node goalbuddy/scripts/goalbuddy.mjs run docs/goals/<slug> --auto 3
```

See [Usage](Usage) and [Troubleshooting](Troubleshooting) for MCP and `run` issues.
