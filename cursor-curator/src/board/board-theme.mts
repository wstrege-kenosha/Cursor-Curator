// @ts-nocheck
import { readBoardFragment } from "./board-fragments.mjs";

export const BOARD_COLUMN_LABELS = {
  todo: { title: "Queued", description: "Work ready to pull" },
  "in-progress": { title: "Running", description: "No agent running — pull next task from Queued" },
  blocked: { title: "Blocked", description: "Waiting on you or a dependency" },
  completed: { title: "Shipped", description: "Receipted work" },
};

export const BOARD_COPY = {
  label: "Control Room",
  objectiveEyebrow: "Objective",
  successCriteriaEyebrow: "Signal",
  nowEyebrow: "Now",
  intakeEyebrow: "Intake",
  progressEyebrow: "Progress",
  validationEyebrow: "Validation",
  misfireWarning: "Likely misfire needs concrete wording",
  sessionEyebrow: "Session log",
  modalKicker: "Record",
  emptyColumn: "Empty",
  receiptEmpty: "No receipt yet — run Worker and validate before marking done",
  liveOffline: "Offline — showing last snapshot",
  sections: {
    objective: "Objective",
    inputs: "Inputs",
    constraints: "Constraints",
    expectedOutput: "Expected output",
    allowedFiles: "Allowed files",
    verify: "Verify",
    stopIf: "Stop if",
    decision: "Decision",
    changedFiles: "Changed files",
    commands: "Commands",
    subobjective: "Subobjective board",
    rollupReceipt: "Roll-up receipt",
  },
};

export function boardColumnLabels(columnId: string) {
  return BOARD_COLUMN_LABELS[columnId as keyof typeof BOARD_COLUMN_LABELS]
    || { title: columnId, description: "" };
}

export function themeFontLinksHtml() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@450;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@450;500&display=swap" rel="stylesheet">`;
}

export function themeTokensCss() {
  return readBoardFragment("board-theme-tokens.css");
}

export function themeSurfaceCss() {
  return readBoardFragment("board-theme-surface.css");
}

export function boardSkinCss() {
  return readBoardFragment("board-theme-skin.css");
}

export function hubPageCss() {
  return readBoardFragment("board-hub.css");
}

export function usageBoardCss() {
  return readBoardFragment("board-theme-usage.css");
}
