import assert from "node:assert/strict";
import { test } from "node:test";
import { injectBoardFragment, readBoardFragment } from "./board-fragments.mjs";

test("readBoardFragment loads theme token CSS", () => {
  const css = readBoardFragment("board-theme-tokens.css");
  assert.match(css, /--canvas: #141c26/);
});

test("injectBoardFragment replaces known placeholders", () => {
  const js = injectBoardFragment("board-client-core.js", {
    __BOARD_COPY_JSON__: '{"label":"Test"}',
    __PORT_REPO_API_URL__: '"https://example.test/repo"',
    __PORT_LABEL__: '"Example"',
  });
  assert.match(js, /const boardCopy = \{"label":"Test"\};/);
  assert.doesNotMatch(js, /__BOARD_COPY_JSON__/);
});

test("injectBoardFragment fails when placeholder is missing", () => {
  assert.throws(
    () => injectBoardFragment("board-client-boot.js", { __MISSING_TOKEN__: "x" }),
    /missing placeholder __MISSING_TOKEN__/,
  );
});
