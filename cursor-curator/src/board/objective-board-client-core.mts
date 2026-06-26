// @ts-nocheck
import { BOARD_COPY } from "./board-theme.mjs";
import { injectBoardFragment } from "./board-fragments.mjs";
import { DEFAULT_REPO_LINKS, githubSlugFromUrl } from "./port-metadata.mjs";

export function boardClientCoreJs(
  repoLinks = DEFAULT_REPO_LINKS,
  boardCopyJson = JSON.stringify(BOARD_COPY),
) {
  const portRepoApiUrl = `https://api.github.com/repos/${repoLinks.portApiSlug || githubSlugFromUrl(repoLinks.portUrl)}`;
  return injectBoardFragment("board-client-core.js", {
    __BOARD_COPY_JSON__: boardCopyJson,
    __PORT_REPO_API_URL__: JSON.stringify(portRepoApiUrl),
    __PORT_LABEL__: JSON.stringify(repoLinks.portLabel),
  });
}
