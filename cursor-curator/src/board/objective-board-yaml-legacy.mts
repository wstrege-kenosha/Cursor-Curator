// @ts-nocheck — legacy YAML v2 regex recovery only
import { ObjectiveBoardError } from "./objective-board-model.mjs";

function yamlCleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseObjectiveStateText(text: string) {
  if (!String(text || "").trim()) {
    throw new ObjectiveBoardError("Objective state is empty.");
  }
  const tasks = parseTaskSubsets(text);
  if (!tasks.length) {
    throw new ObjectiveBoardError("Missing non-empty tasks list.");
  }
  return {
    version: parseYamlScalar(findTopLevelScalar(text, "version") || "2"),
    objective: {
      title: parseYamlScalar(findNestedScalar(text, "objective", "title") || "Untitled objective"),
      slug: parseYamlScalar(findNestedScalar(text, "objective", "slug") || "untitled-objective"),
      kind: parseYamlScalar(findNestedScalar(text, "objective", "kind") || "open_ended"),
      tranche: parseYamlScalar(findNestedScalar(text, "objective", "tranche") || ""),
      status: parseYamlScalar(findNestedScalar(text, "objective", "status") || "active"),
    },
    active_task: parseYamlScalar(findTopLevelScalar(text, "active_task") || ""),
    tasks,
  };
}

function parseTaskSubsets(text: string) {
  const tasksText = findTopLevelSection(text, "tasks");
  if (!tasksText) return [];
  const taskBlocks: string[] = [];
  let current: string[] = [];
  for (const line of tasksText.split("\n")) {
    if (/^  - id:/.test(line)) {
      if (current.length) taskBlocks.push(current.join("\n"));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) taskBlocks.push(current.join("\n"));
  return taskBlocks.map((block) => ({
    id: parseYamlScalar(findTaskScalar(block, "id") || ""),
    type: parseYamlScalar(findTaskScalar(block, "type") || "pm"),
    assignee: parseYamlScalar(findTaskScalar(block, "assignee") || ""),
    status: parseYamlScalar(findTaskScalar(block, "status") || "queued"),
    title: parseYamlScalar(findTaskScalar(block, "title") || ""),
    objective: parseYamlScalar(findTaskScalar(block, "objective") || ""),
    inputs: findTaskList(block, "inputs"),
    constraints: findTaskList(block, "constraints"),
    expected_output: findTaskList(block, "expected_output"),
    allowed_files: findTaskList(block, "allowed_files"),
    verify: findTaskList(block, "verify"),
    stop_if: findTaskList(block, "stop_if"),
    subobjective: findTaskSubobjective(block),
    receipt: findTaskReceipt(block),
  }));
}

function findTopLevelScalar(text: string, key: string) {
  return findScalar(text, new RegExp(`^${escapeRegExp(key)}:\\s*(.*?)\\s*$`, "m"));
}

function findNestedScalar(text: string, section: string, key: string) {
  return findScalar(findTopLevelSection(text, section), new RegExp(`^  ${escapeRegExp(key)}:\\s*(.*?)\\s*$`, "m"));
}

function findTaskScalar(text: string, key: string) {
  if (key === "id") return findScalar(text, /^  - id:\s*(.*?)\s*$/m);
  return findScalar(text, new RegExp(`^    ${escapeRegExp(key)}:\\s*(.*?)\\s*$`, "m"));
}

function findScalar(text: string, pattern: RegExp) {
  const match = String(text || "").match(pattern);
  return match ? match[1] : "";
}

function findTopLevelSection(text: string, key: string) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return "";
  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line)) break;
    section.push(line);
  }
  return section.join("\n");
}

function findIndentedSection(text: string, key: string, indent: number) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const prefix = " ".repeat(indent);
  const start = lines.findIndex((line) => line.trim() === `${key}:` && line.startsWith(prefix));
  if (start === -1) return "";
  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && !line.startsWith(`${prefix}  `)) break;
    section.push(line);
  }
  return section.join("\n");
}

function findTaskList(text: string, key: string) {
  const inline = findTaskScalar(text, key);
  if (inline) {
    const parsed = parseYamlScalar(inline);
    if (Array.isArray(parsed)) return parsed.map(yamlCleanText).filter(Boolean);
    return yamlCleanText(parsed) ? [yamlCleanText(parsed)] : [];
  }
  const section = findIndentedSection(text, key, 4);
  return section
    .split("\n")
    .map((line) => line.match(/^      -\s*(.*?)\s*$/)?.[1] || "")
    .map(parseYamlScalar)
    .map(yamlCleanText)
    .filter(Boolean);
}

function findTaskSubobjective(text: string) {
  const inline = findTaskScalar(text, "subobjective");
  if (inline && parseYamlScalar(inline) === null) return null;
  const section = findIndentedSection(text, "subobjective", 4);
  if (!section) return null;
  return {
    status: parseYamlScalar(findScalar(section, /^      status:\s*(.*?)\s*$/m) || "active"),
    path: parseYamlScalar(findScalar(section, /^      path:\s*(.*?)\s*$/m) || ""),
    owner: parseYamlScalar(findScalar(section, /^      owner:\s*(.*?)\s*$/m) || ""),
    created_from: parseYamlScalar(findScalar(section, /^      created_from:\s*(.*?)\s*$/m) || ""),
    depth: parseYamlScalar(findScalar(section, /^      depth:\s*(.*?)\s*$/m) || "1"),
    rollup_receipt: parseYamlScalar(findScalar(section, /^      rollup_receipt:\s*(.*?)\s*$/m) || "null"),
  };
}

function findTaskReceipt(text: string) {
  const inline = findTaskScalar(text, "receipt");
  if (inline && parseYamlScalar(inline) === null) return null;
  const section = findIndentedSection(text, "receipt", 4);
  if (!section) return null;
  return {
    result: parseYamlScalar(findScalar(section, /^      result:\s*(.*?)\s*$/m) || ""),
    summary: parseYamlScalar(findScalar(section, /^      summary:\s*(.*?)\s*$/m) || ""),
    decision: parseYamlScalar(findScalar(section, /^      decision:\s*(.*?)\s*$/m) || ""),
    note: parseYamlScalar(findScalar(section, /^      note:\s*(.*?)\s*$/m) || ""),
    changed_files: findReceiptList(section, "changed_files"),
    commands: findReceiptCommands(section),
    evidence: [],
  };
}

function findReceiptList(text: string, key: string) {
  const section = findIndentedSection(text, key, 6);
  return section
    .split("\n")
    .map((line) => line.match(/^        -\s*(.*?)\s*$/)?.[1] || "")
    .map(parseYamlScalar)
    .map(yamlCleanText)
    .filter(Boolean);
}

function findReceiptCommands(text: string) {
  const section = findIndentedSection(text, "commands", 6);
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of section.split("\n")) {
    if (/^        - cmd:/.test(line)) {
      if (current.length) blocks.push(current.join("\n"));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks.map((block) => ({
    cmd: parseYamlScalar(findScalar(block, /^        - cmd:\s*(.*?)\s*$/m) || ""),
    status: parseYamlScalar(findScalar(block, /^          status:\s*(.*?)\s*$/m) || ""),
    note: parseYamlScalar(findScalar(block, /^          note:\s*(.*?)\s*$/m) || ""),
  }));
}

function parseYamlScalar(value: unknown) {
  const text = stripComment(String(value ?? "")).trim();
  if (!text) return "";
  if (
    (text.startsWith("\"") && text.endsWith("\"")) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  if (text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return splitInlineArray(inner).map(parseYamlScalar);
  }
  return text;
}

function escapeRegExp(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripComment(line: string) {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];
    if ((char === "\"" || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }
    if (char === "#" && !quote && (index === 0 || /\s/.test(previous))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function splitInlineArray(text: string) {
  const values: string[] = [];
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    if ((char === "\"" || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }
    if (char === "," && !quote) {
      values.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(text.slice(start).trim());
  return values;
}
