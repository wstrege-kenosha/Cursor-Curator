// @ts-nocheck
import { DEFAULT_REPO_LINKS } from "./port-metadata.mjs";
import { BOARD_COPY } from "./board-theme.mjs";
import { boardClientBootJs } from "./objective-board-client-boot.mjs";
import { boardClientCoreJs } from "./objective-board-client-core.mjs";
import { boardClientRenderJs } from "./objective-board-client-render.mjs";

export function boardJs(repoLinks = DEFAULT_REPO_LINKS) {
  const boardCopyJson = JSON.stringify(BOARD_COPY);
  return `${boardClientCoreJs(repoLinks, boardCopyJson)}
${boardClientRenderJs()}
${boardClientBootJs()}`;
}
