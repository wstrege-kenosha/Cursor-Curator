import { createServer } from "node:http";
import { resolve } from "node:path";
import { writeBoardApp } from "./objective-board.mjs";
import { safeBoardPayload, watchObjective } from "./board-watchers.mjs";
import { resolveStatePath } from "../state/objective-state.mjs";
import {
  boardSummary,
  nextBoardPath,
  type BoardRecord,
  type BoardSummary,
} from "./board-registry.mjs";
import { dispatchBoardRequest } from "./board-routes.mjs";
import { sendError, sendEvent } from "./board-http.mjs";

export const DEFAULT_BIND_HOST = "127.0.0.1";
export const DEFAULT_PUBLIC_HOST = "curator.localhost";
export const DEFAULT_PORT = 41737;

export interface BoardServerOptions {
  objectiveDir: string;
  appDir?: string;
  host?: string;
  publicHost?: string;
  port?: number;
}

function refreshBoardFromWatch(board: BoardRecord): void {
  board.lastPayload = safeBoardPayload(board.root);
  board.watcher.refresh(board.lastPayload);
  for (const client of board.clients) {
    sendEvent(client, board.lastPayload);
  }
}

export async function startBoardServer(options: BoardServerOptions = { objectiveDir: "" }) {
  const {
    objectiveDir,
    appDir = "",
    host = DEFAULT_BIND_HOST,
    publicHost = Object.hasOwn(options, "host") ? host : DEFAULT_PUBLIC_HOST,
    port = DEFAULT_PORT,
  } = options;
  const boards = new Map<string, BoardRecord>();
  let baseUrl = "";
  let initialBoard: BoardRecord | null = null;

  const addBoard = (candidateObjectiveDir: string, candidateAppDir = ""): BoardSummary => {
    const root = resolve(candidateObjectiveDir);
    try {
      resolveStatePath(root);
    } catch {
      throw new Error(`Objective not in database for ${root} (run: bun cursor-curator/dist/cli/curator.mjs db import)`);
    }

    const existing = [...boards.values()].find((board) => board.root === root);
    if (existing) {
      existing.appDir = candidateAppDir || writeBoardApp(root);
      existing.lastPayload = safeBoardPayload(root);
      return boardSummary(existing, baseUrl);
    }

    const payload = safeBoardPayload(root);
    const board: BoardRecord = {
      root,
      appDir: candidateAppDir || writeBoardApp(root),
      boardPath: nextBoardPath(root, payload, boards),
      clients: new Set(),
      lastPayload: payload,
      watcher: watchObjective(root, () => refreshBoardFromWatch(board)),
      startedAt: new Date().toISOString(),
    };
    boards.set(board.boardPath, board);
    return boardSummary(board, baseUrl);
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      await dispatchBoardRequest({
        request,
        response,
        url,
        boards,
        baseUrl,
        initialBoard,
        addBoard: (dir) => addBoard(dir),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  baseUrl = `http://${publicHost || host}:${actualPort}`;
  const initialSummary = addBoard(objectiveDir, appDir);
  initialBoard = boards.get(new URL(initialSummary.url).pathname) ?? null;

  return {
    ...initialSummary,
    close: () => new Promise<void>((resolveClose, rejectClose) => {
      for (const board of boards.values()) {
        board.watcher.close();
        for (const client of board.clients) client.end();
      }
      server.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    }),
  };
}

export async function registerWithBoardHub({
  objectiveDir,
  host,
  port,
}: {
  objectiveDir: string;
  host: string;
  port: number;
}) {
  const response = await fetch(`http://${host}:${port}/api/boards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectiveDir }),
  });
  if (!response.ok) {
    const message = await response.text();
    if (response.status === 404) {
      throw new Error(`Port ${port} is already in use, but it is not the Cursor Curator multi-board hub. Stop the existing local board process on ${host}:${port}, then retry.`);
    }
    throw new Error(`Cursor Curator local board hub rejected ${objectiveDir}: ${message}`);
  }
  return { ...(await response.json()), registered: true };
}
