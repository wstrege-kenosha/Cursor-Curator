#!/usr/bin/env bun
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBoardPayload, writeBoardApp } from "./objective-board.mjs";
import {
  DEFAULT_BIND_HOST,
  DEFAULT_PORT,
  DEFAULT_PUBLIC_HOST,
  registerWithBoardHub,
  startBoardServer,
} from "./board-server.mjs";
import { resolveStatePath } from "../state/objective-state.mjs";

export { readBoardSettings, writeBoardSettings, normalizeSettings } from "./board-settings.mjs";
export {
  DEFAULT_BIND_HOST,
  DEFAULT_PORT,
  DEFAULT_PUBLIC_HOST,
  registerWithBoardHub,
  startBoardServer,
} from "./board-server.mjs";

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  const objectiveDir = resolve(options.objective || "");
  if (!options.objective) throw new Error("Missing --objective <path> (docs/objectives/<slug>)");
  resolveStatePath(objectiveDir);

  const appDir = writeBoardApp(objectiveDir);
  const board = createBoardPayload(objectiveDir);

  if (options.once) {
    if (options.json) {
      console.log(JSON.stringify({ objectiveDir, appDir, board }, null, 2));
    } else {
      console.log(`Generated Cursor Curator board app at ${appDir}`);
    }
    return { objectiveDir, appDir, board };
  }

  let server = null;
  try {
    server = await startBoardServer({
      objectiveDir,
      appDir,
      host: options.host,
      publicHost: options.publicHost,
      port: options.port,
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EADDRINUSE") throw error;
    server = await registerWithBoardHub({
      objectiveDir,
      host: options.host,
      port: options.port,
    });
  }

  if (options.json) {
    console.log(JSON.stringify({
      objectiveDir,
      appDir: server.appDir || appDir,
      url: server.url,
      hubUrl: server.hubUrl,
      apiUrl: server.apiUrl,
      registered: Boolean(server.registered),
    }, null, 2));
  } else {
    console.log(`Cursor Curator local board: ${server.url}`);
    console.log(`Cursor Curator local hub: ${server.hubUrl}`);
    if (server.registered) {
      console.log("Registered with the existing Cursor Curator local board hub.");
    } else {
      console.log(`Watching objective at ${objectiveDir}`);
      console.log("Press Ctrl-C to stop.");
    }
  }

  return server;
}

export function parseArgs(args: string[]) {
  const options = {
    objective: "",
    host: DEFAULT_BIND_HOST,
    publicHost: DEFAULT_PUBLIC_HOST,
    port: DEFAULT_PORT,
    once: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--objective") {
      options.objective = args[++index] || "";
    } else if (arg.startsWith("--objective=")) {
      options.objective = arg.slice("--objective=".length);
    } else if (arg === "--host") {
      options.host = args[++index] || options.host;
      options.publicHost = options.host;
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
      options.publicHost = options.host;
    } else if (arg === "--port") {
      options.port = Number(args[++index] || options.port);
    } else if (arg.startsWith("--port=")) {
      options.port = Number(arg.slice("--port=".length));
    } else if (arg === "--once") {
      options.once = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error(`Invalid --port: ${options.port}`);
  }

  return options;
}

function usage() {
  console.log(`Cursor Curator Local Objective Board

Usage:
  bun cursor-curator/dist/cli/curator.mjs board docs/objectives/<slug>
  bun cursor-curator/dist/cli/curator.mjs board docs/objectives/<slug> --once --json

Options:
  --objective <path>   Objective directory (board state loads from .cursor-curator/curator.db).
  --host <host>   Local server bind host. Default: 127.0.0.1, advertised as curator.localhost.
  --port <port>   Local server port. Default: 41737 shared board hub.
  --once          Generate .cursor-curator-board and exit.
  --json          Print structured output.
`);
}
