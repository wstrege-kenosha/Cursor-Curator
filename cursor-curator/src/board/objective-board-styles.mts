// @ts-nocheck
import {
  boardSkinCss,
  themeSurfaceCss,
  themeTokensCss,
  usageBoardCss,
} from "./board-theme.mjs";
import { boardKanbanModalCss } from "./objective-board-kanban-modal-styles.mjs";
import { boardLayoutCss } from "./objective-board-layout-styles.mjs";

export function boardCss() {
  return `${themeTokensCss()}
${themeSurfaceCss()}
${boardSkinCss()}
${usageBoardCss()}
${boardLayoutCss()}
${boardKanbanModalCss()}`;
}
