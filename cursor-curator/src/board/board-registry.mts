import { basename } from "node:path";
import type { ServerResponse } from "node:http";
import type { BoardPayload } from "./board-payload-types.mjs";
import type { BoardSettings } from "./board-settings.mjs";

export interface BoardWatcher {
  close(): void;
  refresh(cachedPayload?: unknown): void;
}

export interface BoardRecord {
  root: string;
  appDir: string;
  boardPath: string;
  clients: Set<ServerResponse>;
  lastPayload: BoardPayload;
  watcher: BoardWatcher;
  startedAt: string;
}

export interface BoardSummary {
  objectiveDir: string;
  appDir: string;
  title: string;
  slug: string;
  url: string;
  hubUrl: string;
  indexUrl: string;
  apiUrl: string;
  startedAt: string;
}

export interface BoardRouteMatch {
  board: BoardRecord | null;
  pathname: string;
}

export function slugifyPathSegment(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function boardPathFor(objectiveDir: string, payload: BoardPayload): string {
  const slug = slugifyPathSegment(payload.objective.slug || basename(objectiveDir));
  return `/${slug || "objective"}/`;
}

export function nextBoardPath(
  objectiveDir: string,
  payload: BoardPayload,
  boards: Map<string, BoardRecord>,
): string {
  const existing = [...boards.values()].find((board) => board.root === objectiveDir);
  if (existing) return existing.boardPath;

  const basePath = boardPathFor(objectiveDir, payload);
  if (!boards.has(basePath)) return basePath;

  const prefix = basePath.slice(0, -1);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${prefix}-${index}/`;
    if (!boards.has(candidate)) return candidate;
  }
  throw new Error(`Could not allocate a board path for ${objectiveDir}`);
}

export function boardSummary(board: BoardRecord, baseUrl: string): BoardSummary {
  const slug = slugifyPathSegment(board.lastPayload.objective.slug || basename(board.root)) || "objective";
  return {
    objectiveDir: board.root,
    appDir: board.appDir,
    title: board.lastPayload.objective.title || basename(board.root),
    slug,
    url: `${baseUrl}${board.boardPath}`,
    hubUrl: `${baseUrl}/`,
    indexUrl: `${baseUrl}/`,
    apiUrl: `${baseUrl}/api/boards`,
    startedAt: board.startedAt,
  };
}

export function preferredBoard(
  boards: Map<string, BoardRecord>,
  settings: BoardSettings,
): BoardRecord | null {
  const allBoards = [...boards.values()];
  if (allBoards.length === 0) return null;
  if (settings.boardOpenBehavior === "last" && settings.lastBoardPath) {
    const remembered = allBoards.find((board) => board.boardPath === settings.lastBoardPath);
    if (remembered) return remembered;
  }
  if (settings.boardOpenBehavior === "newest") {
    return allBoards.slice().sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  }
  return allBoards[0];
}

export function boardTrailingSlashUrl(
  pathname: string,
  boards: Map<string, BoardRecord>,
  baseUrl: string,
): string {
  for (const board of boards.values()) {
    const prefix = board.boardPath.endsWith("/") ? board.boardPath.slice(0, -1) : board.boardPath;
    if (pathname === prefix) return `${baseUrl}${board.boardPath}`;
  }
  return "";
}

export function routeBoardRequest(
  pathname: string,
  boards: Map<string, BoardRecord>,
  initialBoard: BoardRecord | null,
): BoardRouteMatch {
  if (initialBoard && (pathname === "/api/board" || pathname === "/events")) {
    return { board: initialBoard, pathname };
  }

  let bestMatch: BoardRouteMatch | null = null;
  let bestPrefixLength = -1;

  for (const board of boards.values()) {
    const prefix = board.boardPath.endsWith("/") ? board.boardPath.slice(0, -1) : board.boardPath;
    let scopedPathname: string | null = null;

    if (pathname === prefix) {
      scopedPathname = "/";
    } else if (pathname.startsWith(`${prefix}/`)) {
      scopedPathname = pathname.slice(prefix.length) || "/";
    }

    if (scopedPathname !== null && prefix.length > bestPrefixLength) {
      bestPrefixLength = prefix.length;
      bestMatch = { board, pathname: scopedPathname };
    }
  }

  return bestMatch ?? { board: null, pathname };
}

export function sendUnregisteredBoardPath(
  response: ServerResponse,
  pathname: string,
  boards: Map<string, BoardRecord>,
  baseUrl: string,
): void {
  if (response.headersSent) return;
  response.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  const registeredBoards = [...boards.values()].map((board) => {
    const summary = boardSummary(board, baseUrl);
    return `- ${summary.title}: ${summary.url}`;
  });
  response.end([
    `Cursor Curator board path is not registered in this local hub: ${pathname}`,
    "",
    "This server is the Cursor Curator multi-board hub. Do not stop it just because a /<slug>/ board URL returned 404.",
    "Start or rerun `bun cursor-curator/dist/cli/curator.mjs board <objective-dir>` to register that objective on this same port, then open the printed /<slug>/ URL.",
    "",
    "Registered boards:",
    registeredBoards.length ? registeredBoards.join("\n") : "- none",
    "",
    `Hub API: ${baseUrl}/api/boards`,
  ].join("\n"));
}
