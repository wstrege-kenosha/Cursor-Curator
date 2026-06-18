import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "goalbuddy";
const VENDORED_SERVER_REL = "goalbuddy/mcp/server.mjs";

function toPosixPath(path) {
  return path.replace(/\\/g, "/");
}

function resolveServerPath(skillRoot) {
  return join(resolve(skillRoot), "mcp", "server.mjs");
}

export function buildMcpServerEntry(skillRoot) {
  return {
    command: process.execPath,
    args: [resolveServerPath(skillRoot)],
  };
}

export function buildMcpServerEntryForProject(projectRoot, skillRoot) {
  const resolvedProject = resolve(projectRoot);
  const vendoredServer = join(resolvedProject, ...VENDORED_SERVER_REL.split("/"));

  const serverArg = existsSync(vendoredServer)
    ? VENDORED_SERVER_REL
    : toPosixPath(relative(resolvedProject, resolveServerPath(skillRoot)));

  return {
    command: "node",
    args: [serverArg],
  };
}

export function projectRootFromMcpConfigPath(configPath) {
  return resolve(dirname(configPath), "..");
}

export function mergeMcpConfig(existing, entry) {
  const base = existing && typeof existing === "object" ? existing : {};
  const servers = { ...(base.mcpServers || {}) };
  servers[SERVER_NAME] = entry;
  return {
    ...base,
    mcpServers: servers,
  };
}

export function readMcpConfig(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function writeMergedMcpConfig(configPath, skillRoot, { projectRoot } = {}) {
  const entry = projectRoot
    ? buildMcpServerEntryForProject(projectRoot, skillRoot)
    : buildMcpServerEntry(skillRoot);
  const merged = mergeMcpConfig(readMcpConfig(configPath), entry);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { configPath, entry, merged };
}

export function removeMcpServerEntry(configPath, serverName = SERVER_NAME) {
  const config = readMcpConfig(configPath);
  if (!config?.mcpServers?.[serverName]) {
    return { removed: false, configPath };
  }

  const { [serverName]: _removed, ...restServers } = config.mcpServers;
  const merged = { ...config, mcpServers: restServers };
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { removed: true, configPath, merged };
}

export function installMcpConfig({ skillRoot, projectRoots = [], cursorHome }) {
  const installed = [];
  const removed = [];
  const errors = [];
  const roots = [...new Set(projectRoots.map((root) => resolve(root)).filter(Boolean))];

  for (const projectRoot of roots) {
    try {
      const result = writeMergedMcpConfig(join(projectRoot, ".cursor", "mcp.json"), skillRoot, {
        projectRoot,
      });
      installed.push(result);
    } catch (error) {
      errors.push(`${projectRoot}: ${error.message}`);
    }
  }

  if (cursorHome) {
    const userConfigPath = join(resolve(cursorHome), "mcp.json");
    if (installed.length > 0) {
      try {
        const result = removeMcpServerEntry(userConfigPath);
        if (result.removed) removed.push(result);
      } catch (error) {
        errors.push(`cursorHome cleanup: ${error.message}`);
      }
    } else {
      try {
        const result = writeMergedMcpConfig(userConfigPath, skillRoot);
        installed.push(result);
      } catch (error) {
        errors.push(`cursorHome: ${error.message}`);
      }
    }
  }

  return { installed, removed, errors, server_name: SERVER_NAME };
}

export function checkMcpConfig(configPath, skillRoot) {
  const config = readMcpConfig(configPath);
  if (!config?.mcpServers?.[SERVER_NAME]) {
    return {
      ok: false,
      name: `mcp:${SERVER_NAME}`,
      detail: `missing ${SERVER_NAME} entry in ${configPath}`,
    };
  }

  const entry = config.mcpServers[SERVER_NAME];
  const expectedServer = resolveServerPath(skillRoot);
  const projectRoot = projectRootFromMcpConfigPath(configPath);
  const args = Array.isArray(entry.args) ? entry.args : [];
  const resolvedArgs = args.map((arg) => resolve(projectRoot, String(arg)));
  const pointsAtSkill = resolvedArgs.some((arg) => resolve(arg) === resolve(expectedServer));
  const pointsAtVendored = resolvedArgs.some((arg) => resolve(arg) === resolve(projectRoot, ...VENDORED_SERVER_REL.split("/")));
  const serverExists = existsSync(expectedServer) || existsSync(resolve(projectRoot, ...VENDORED_SERVER_REL.split("/")));

  return {
    ok: serverExists && (pointsAtSkill || pointsAtVendored || args.some((arg) => String(arg).includes(VENDORED_SERVER_REL))),
    name: `mcp:${SERVER_NAME}`,
    detail: pointsAtSkill || pointsAtVendored ? expectedServer : args.join(" "),
    config_path: configPath,
    server_path: existsSync(resolve(projectRoot, ...VENDORED_SERVER_REL.split("/")))
      ? resolve(projectRoot, ...VENDORED_SERVER_REL.split("/"))
      : expectedServer,
  };
}

export function defaultProjectRootsFromSkill(skillRoot) {
  const repoRoot = resolve(skillRoot, "..");
  const roots = [];
  if (existsSync(join(repoRoot, "docs", "goals"))) roots.push(repoRoot);
  if (existsSync(join(process.cwd(), "docs", "goals"))) roots.push(process.cwd());
  return roots;
}

export function repoMcpConfigPathFromSkill(skillRoot) {
  return join(resolve(skillRoot, ".."), ".cursor", "mcp.json");
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { homedir } = await import("node:os");
  const result = installMcpConfig({
    skillRoot,
    projectRoots: defaultProjectRootsFromSkill(skillRoot),
    cursorHome: join(homedir(), ".cursor"),
  });
  console.log(JSON.stringify(result, null, 2));
}
