import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const textTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
};

export async function readJsonRequest(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large.");
  }
  return JSON.parse(body || "{}") as Record<string, unknown>;
}

export function sendJson(response: ServerResponse, payload: unknown): void {
  if (response.headersSent) return;
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

export function sendError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) return;
  response.writeHead(400, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(error instanceof Error ? error.message : "Request failed");
}

export function sendMethodNotAllowed(response: ServerResponse, allow: string): void {
  if (response.headersSent) return;
  response.writeHead(405, { Allow: allow });
  response.end("Method not allowed");
}

export function redirect(response: ServerResponse, location: string): void {
  if (response.headersSent) return;
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
  });
  response.end();
}

export function sendEvent(response: ServerResponse, payload: unknown): void {
  response.write(`event: board\ndata: ${JSON.stringify(payload)}\n\n`);
}

export function serveStatic(appDir: string, pathname: string, response: ServerResponse): void {
  if (response.headersSent) return;
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  if (!/^\/[A-Za-z0-9_.-]+$/.test(cleanPath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const file = join(appDir, cleanPath.slice(1));
  if (!existsSync(file)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const fileExtension = cleanPath.match(/\.[^.]+$/)?.[0] || "";
  response.writeHead(200, {
    "Content-Type": textTypes[fileExtension] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(readFileSync(file));
}
