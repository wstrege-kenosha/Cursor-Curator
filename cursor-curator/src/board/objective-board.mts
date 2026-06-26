// @ts-nocheck
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readBoardRepoLinks } from "./port-metadata.mjs";
import { checkCompletionReadiness } from "../completion/objective-completion.mjs";
import { readLastVerificationFromState } from "../verify/objective-verify.mjs";
import { readSessionDigest } from "../session/objective-session.mjs";
import { buildTaskMetricsView, buildUsageBoardView, readUsageSummary } from "../usage/objective-usage.mjs";
import { loadState, resolveStatePath } from "../state/objective-state.mjs";
import { validateObjectiveStateFile } from "../mcp/validate-state-bridge.mjs";
import {
  ObjectiveBoardError,
  buildColumns,
  normalizeObjectiveBoard,
} from "./objective-board-model.mjs";
import { boardCss } from "./objective-board-styles.mjs";
import { boardHtml } from "./objective-board-html.mjs";
import { boardJs } from "./objective-board-client.mjs";

export { readBoardRepoLinks } from "./port-metadata.mjs";
export {
  ObjectiveBoardError,
  buildColumns,
  normalizeObjectiveBoard,
  normalizeTask,
  parseObjectiveStateText,
} from "./objective-board-model.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const logoAssetPath = join(packageRoot, "assets", "curator-mark.png");

function readObjectiveStateAtRoot(root) {
  const statePath = resolveStatePath(root);
  const loaded = loadState(root, { warnYaml: false });
  return { statePath, loaded };
}

export async function loadObjectiveBoard(objectiveDir) {
  const root = resolve(objectiveDir);
  const { loaded } = readObjectiveStateAtRoot(root);
  return normalizeObjectiveBoard(loaded.raw, root);
}
export function createBoardPayload(objectiveDir, options = {}) {
  const includeSubobjectives = options.includeSubobjectives !== false;
  const root = resolve(objectiveDir);
  const { statePath, loaded } = readObjectiveStateAtRoot(root);
  const document = loaded.raw;

  const board = normalizeObjectiveBoard(document, root);
  const noteIndex = loadNotes(root);
  const usageSummary = readUsageSummary(root);
  const usage = buildUsageBoardView(usageSummary);
  const tasks = board.tasks
    .map((task) => attachTaskNote(task, noteIndex))
    .map((task) => includeSubobjectives ? attachTaskSubobjective(task, root) : task)
    .map((task) => {
      const metricsView = buildTaskMetricsView(usageSummary.tasks[task.id] ?? null);
      return {
        ...task,
        metrics: metricsView.raw,
        metrics_badge: metricsView.badge,
        metrics_detail: metricsView.detail,
      };
    });
  const columns = buildColumns(tasks);
  const stateStat = statSync(statePath);
  const repo = readBoardRepoLinks();
  const stateText = readFileSync(statePath, "utf8");
  const validation = validateObjectiveStateFile(statePath);
  const completion = checkCompletionReadiness(statePath);
  const lastVerification = readLastVerificationFromState(stateText);
  const sessionDigest = readSessionDigest(root, { limit: 3 });
  const activeTaskRow = tasks.find((task) => task.id === board.activeTask) || null;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const queuedCount = tasks.filter((task) => task.status === "queued").length;
  const activeCount = tasks.filter((task) => task.status === "active").length;
  const progressPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return {
    generatedAt: new Date().toISOString(),
    repo,
    source: {
      objectiveDir: root,
      statePath,
      stateMtimeMs: stateStat.mtimeMs,
      notesDir: join(root, "notes"),
    },
    objective: {
      title: board.title,
      slug: board.slug,
      kind: board.kind,
      status: board.status,
      tranche: board.tranche,
      activeTask: board.activeTask,
      success_criteria: document.objective?.success_criteria || null,
      intake: document.objective?.intake || null,
    },
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    completion: {
      ready: completion.ready,
      blockers: completion.blockers,
      success_criteria_ready: completion.success_criteria_ready,
      audit_ready: completion.audit_ready,
    },
    lastVerification: lastVerification || { result: null, task: null, commands: [] },
    activeTaskDetail: activeTaskRow
      ? {
          id: activeTaskRow.id,
          objective: activeTaskRow.objective,
          assignee: activeTaskRow.assignee,
          type: activeTaskRow.type,
          verify: activeTaskRow.verify || [],
        }
      : null,
    progress: {
      total: tasks.length,
      done: doneCount,
      blocked: blockedCount,
      queued: queuedCount,
      active: activeCount,
      pct: progressPct,
    },
    sessionPreview: sessionDigest.preview,
    usage,
    counts: {
      total: tasks.length,
      todo: columns.find((column) => column.id === "todo").tasks.length,
      inProgress: columns.find((column) => column.id === "in-progress").tasks.length,
      blocked: columns.find((column) => column.id === "blocked").tasks.length,
      completed: columns.find((column) => column.id === "completed").tasks.length,
    },
    columns,
    tasks,
    notes: Object.values(noteIndex).map(({ path, title, mtimeMs }) => ({ path, title, mtimeMs })),
    sessionLog: noteIndex["notes/SESSION.md"]?.content || noteIndex["notes/session.md"]?.content || null,
  };
}
export function writeBoardApp(objectiveDir) {
  const root = resolve(objectiveDir);
  const appDir = join(root, ".cursor-curator-board");
  mkdirSync(appDir, { recursive: true });
  const boardPayload = createBoardPayload(root);
  const repoLinks = readBoardRepoLinks();
  writeFileSync(join(appDir, "index.html"), `${boardHtml(boardPayload, repoLinks)}\n`);
  writeFileSync(join(appDir, "styles.css"), `${boardCss()}\n`);
  writeFileSync(join(appDir, "app.js"), `${boardJs(repoLinks)}\n`);
  writeFileSync(join(appDir, "board-snapshot.json"), `${JSON.stringify(boardPayload, null, 2)}\n`);
  copyFileSync(logoAssetPath, join(appDir, "curator-mark.png"));
  return appDir;
}
function attachTaskNote(task, noteIndex) {
  const notePath = task.receipt.note || "";
  if (!notePath) return task;
  const normalized = notePath.replaceAll("\\", "/").replace(/^\.?\//, "");
  return {
    ...task,
    note: noteIndex[normalized] || null,
  };
}

function attachTaskSubobjective(task, objectiveDir) {
  if (!task.subobjective) return task;
  const childRelative = task.subobjective.path;
  const childGoalDir = resolve(objectiveDir, dirname(childRelative));
  let childStatePath;
  try {
    childStatePath = resolveStatePath(childGoalDir);
  } catch {
    childStatePath = resolve(objectiveDir, childRelative);
  }
  validateChildSubobjectivePath(task, objectiveDir, childStatePath, childRelative);
  if (!existsSync(childStatePath)) {
    throw new ObjectiveBoardError(`Missing sub-objective state for ${task.id}: ${childRelative}`);
  }

  return {
    ...task,
    subobjective: {
      ...task.subobjective,
      path: relative(objectiveDir, childStatePath).replaceAll("\\", "/"),
      board: createBoardPayload(childGoalDir, { includeSubobjectives: false }),
    },
  };
}

function validateChildSubobjectivePath(task, objectiveDir, childStatePath, childRelative = task.subobjective.path) {
  if (task.subobjective.depth !== 1) {
    throw new ObjectiveBoardError(`Invalid sub-objective depth for ${task.id}: only depth 1 is supported.`);
  }
  const childRelativePath = relative(objectiveDir, childStatePath);
  if (!isInsideRoot(childRelativePath)) {
    throw new ObjectiveBoardError(`Invalid sub-objective path for ${task.id}: ${childRelative} must stay inside the objective root.`);
  }
  const parts = childRelativePath.split(/[\\/]+/);
  if (parts.length !== 3 || parts[0] !== "subobjectives" || !["state.yaml", "state.json"].includes(parts[2])) {
    throw new ObjectiveBoardError(`Invalid sub-objective path for ${task.id}: ${childRelative} must be subobjectives/<slug>/state.yaml or state.json.`);
  }
}

function isInsideRoot(relativePath) {
  return relativePath && relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function loadNotes(objectiveDir) {
  const notesDir = join(objectiveDir, "notes");
  if (!existsSync(notesDir)) return {};

  const notes = {};
  for (const entry of readdirSync(notesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = `notes/${entry.name}`;
    const absolute = join(notesDir, entry.name);
    const content = readFileSync(absolute, "utf8");
    notes[path] = {
      path,
      title: noteTitle(content, entry.name),
      content,
      mtimeMs: statSync(absolute).mtimeMs,
    };
  }
  return notes;
}

function noteTitle(content, filename) {
  const heading = content.split(/\r?\n/).find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : basename(filename, ".md");
}
