// @ts-nocheck
import { themeFontLinksHtml } from "./board-theme.mjs";
import { DEFAULT_REPO_LINKS } from "./port-metadata.mjs";

export function embedBoardSnapshot(snapshot) {
  const json = JSON.stringify(snapshot).replace(/</g, "\\u003c");
  return `  <script id="board-snapshot" type="application/json">${json}</script>`;
}

export function boardProvenanceHtml(repoLinks = DEFAULT_REPO_LINKS) {
  const portVersion = repoLinks.cursorPortVersion ? ` · Cursor port ${repoLinks.cursorPortVersion}` : "";
  const upstreamVersion = repoLinks.upstreamVersion ? ` (${repoLinks.upstreamVersion})` : "";
  return `  <footer class="board-provenance" aria-label="Cursor Curator port provenance">
    <p>
      Board UI from
      <a href="${repoLinks.portUrl}" target="_blank" rel="noreferrer">${repoLinks.portLabel}</a>${portVersion}
      · ported from upstream
      <a href="${repoLinks.upstreamUrl}" target="_blank" rel="noreferrer">${repoLinks.upstreamLabel}</a>${upstreamVersion}
    </p>
  </footer>`;
}

export function boardHtml(snapshot, repoLinks = DEFAULT_REPO_LINKS) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cursor Curator Board</title>
  ${themeFontLinksHtml()}
  <link rel="stylesheet" href="./styles.css">
</head>
<body class="theme-board">
  <header class="topbar">
    <div class="topbar-primary">
      <div class="brand" aria-label="Cursor Curator">
        <img class="brand-mark" src="./curator-mark.png" alt="Cursor Curator">
        <span class="brand-name">Cursor Curator</span>
        <span class="live-dot" id="live-dot" aria-hidden="true"></span>
      </div>
      <nav class="board-switcher is-empty" aria-label="Local Cursor Curator boards">
        <label for="board-switcher">Board</label>
        <select id="board-switcher" aria-label="Switch local board"></select>
      </nav>
    </div>
    <div class="header-tools">
      <div class="repo-links">
        <a class="github-stars" href="${repoLinks.portUrl}" target="_blank" rel="noreferrer" aria-label="Open ${repoLinks.portLabel} on GitHub">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.84 5.76 6.36.92-4.6 4.48 1.08 6.34L12 17.32 6.32 20.3l1.08-6.34-4.6-4.48 6.36-.92L12 2.8Z"></path></svg>
          <span id="github-stars">${repoLinks.portLabel}</span>
        </a>
        <a class="github-upstream" href="${repoLinks.upstreamUrl}" target="_blank" rel="noreferrer" aria-label="Open upstream Cursor Curator on GitHub">Upstream: ${repoLinks.upstreamLabel}${repoLinks.upstreamVersion ? ` @ ${repoLinks.upstreamVersion}` : ""}</a>
      </div>
      <div class="settings-wrap">
        <button class="settings-button" id="settings-button" type="button" aria-expanded="false" aria-controls="settings-popover">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12.2 2.75h-.4a1.6 1.6 0 0 0-1.58 1.36l-.18 1.18c-.46.16-.9.34-1.31.56l-1.02-.64a1.6 1.6 0 0 0-2.08.31l-.28.28a1.6 1.6 0 0 0-.31 2.08l.64 1.02c-.22.42-.4.86-.56 1.31l-1.18.18A1.6 1.6 0 0 0 2.58 12v.4A1.6 1.6 0 0 0 3.94 14l1.18.18c.16.46.34.9.56 1.31l-.64 1.02a1.6 1.6 0 0 0 .31 2.08l.28.28a1.6 1.6 0 0 0 2.08.31l1.02-.64c.42.22.86.4 1.31.56l.18 1.18a1.6 1.6 0 0 0 1.58 1.36h.4a1.6 1.6 0 0 0 1.58-1.36l.18-1.18c.46-.16.9-.34 1.31-.56l1.02.64a1.6 1.6 0 0 0 2.08-.31l.28-.28a1.6 1.6 0 0 0 .31-2.08l-.64-1.02c.22-.42.4-.86.56-1.31l1.18-.18a1.6 1.6 0 0 0 1.36-1.58V12a1.6 1.6 0 0 0-1.36-1.58l-1.18-.18a7.2 7.2 0 0 0-.56-1.31l.64-1.02a1.6 1.6 0 0 0-.31-2.08l-.28-.28a1.6 1.6 0 0 0-2.08-.31l-1.02.64c-.42-.22-.86-.4-1.31-.56l-.18-1.18a1.6 1.6 0 0 0-1.58-1.39Z"></path>
            <circle cx="12" cy="12.2" r="3.15"></circle>
          </svg>
          <span class="visually-hidden" id="live-state" aria-live="polite">Connecting</span>
        </button>
        <section class="settings-popover" id="settings-popover" aria-label="Local board settings" hidden>
          <div class="settings-heading">
            <p class="eyebrow">Board settings</p>
            <h2>Local preferences</h2>
          </div>
          <div class="setting-row">
            <label for="setting-density">Density</label>
            <select id="setting-density" data-setting="density">
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="setting-completed">Completed</label>
            <select id="setting-completed" data-setting="completedVisibility">
              <option value="show">Show</option>
              <option value="collapse">Collapse</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="setting-board-open">Open boards</label>
            <select id="setting-board-open" data-setting="boardOpenBehavior">
              <option value="last">Last viewed</option>
              <option value="newest">Newest active</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="setting-motion">Motion</label>
            <select id="setting-motion" data-setting="motion">
              <option value="system">System</option>
              <option value="reduce">Reduce</option>
              <option value="allow">Allow</option>
            </select>
          </div>
        </section>
      </div>
    </div>
  </header>
  <main class="shell">
    <section class="goal-header" aria-labelledby="goal-title">
      <div>
        <p class="eyebrow" id="objective-eyebrow">Objective</p>
        <h1 id="goal-title">Cursor Curator Board</h1>
        <p id="goal-tranche" class="goal-tranche"></p>
      </div>
      <dl class="goal-meta">
        <div><dt>Status</dt><dd id="goal-status">Unknown</dd></div>
        <div><dt>Active</dt><dd id="goal-active">None</dd></div>
        <div><dt>Updated</dt><dd id="goal-updated">Waiting</dd></div>
        <div><dt>Agent time</dt><dd id="goal-agent-time">—</dd></div>
        <div><dt>Tokens</dt><dd id="goal-tokens">—</dd></div>
      </dl>
    </section>
    <section class="validation-banner" id="validation-banner" hidden aria-live="polite">
      <div>
        <p class="eyebrow" id="validation-eyebrow">Validation</p>
        <ul id="validation-list" class="validation-list"></ul>
      </div>
    </section>
    <section class="usage-warning" id="usage-warning" hidden aria-live="polite"></section>
    <section class="now-hero" id="now-hero" aria-label="Current focus">
      <div>
        <p class="eyebrow" id="now-eyebrow">Now</p>
        <p id="now-interpreted" class="now-interpreted"></p>
        <p id="now-active-objective" class="now-active-objective"></p>
      </div>
    </section>
    <section class="intake-strip" id="intake-strip" aria-label="Intake">
      <div class="intake-grid">
        <div><p class="eyebrow" id="intake-eyebrow">Original request</p><p id="intake-original" class="intake-value"></p></div>
        <div><p class="eyebrow">Completion proof</p><p id="intake-completion-proof" class="intake-value"></p></div>
        <div><p class="eyebrow">Likely misfire</p><p id="intake-misfire" class="intake-value"></p></div>
      </div>
    </section>
    <section class="progress-rail" id="progress-rail" aria-label="Progress">
      <div class="progress-counts" id="progress-counts"></div>
      <div class="progress-meta">
        <span id="progress-usage" class="progress-usage"></span>
        <span id="progress-verification" class="progress-verification"></span>
        <span id="progress-criteria" class="progress-criteria"></span>
        <button type="button" class="session-drawer-trigger" id="session-drawer-trigger" hidden aria-controls="session-drawer" aria-expanded="false">Session log</button>
      </div>
    </section>
    <section class="success-criteria-strip" id="success-criteria-strip" aria-label="Success criteria">
      <div>
        <p class="eyebrow" id="success-criteria-eyebrow">Signal</p>
        <p id="success-criteria-signal" class="success-criteria-signal">Waiting for board data…</p>
        <p id="success-criteria-final-proof" class="success-criteria-meta"></p>
      </div>
      <div class="success-criteria-status-wrap">
        <span class="badge" id="success-criteria-health">unknown</span>
        <p id="success-criteria-audit" class="success-criteria-meta"></p>
      </div>
    </section>
    <div class="board-frame">
      <section class="board" id="board" aria-label="Objective task board"></section>
    </div>
  </main>
${boardProvenanceHtml(repoLinks)}
  <div class="modal" id="task-modal" hidden>
    <button class="modal-scrim" type="button" data-close-modal aria-label="Close task detail"></button>
    <article class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-header">
        <div>
          <p class="eyebrow" id="modal-kicker">Task</p>
          <h2 id="modal-title">Task detail</h2>
        </div>
        <button class="icon-button" type="button" data-close-modal aria-label="Close task detail">x</button>
      </header>
      <div class="modal-body" id="modal-body"></div>
    </article>
  </div>
  <div class="session-drawer" id="session-drawer" hidden>
    <button class="session-drawer-scrim" type="button" data-close-session-drawer aria-label="Close session log"></button>
    <aside class="session-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="session-drawer-title">
      <header class="session-drawer-header">
        <div>
          <p class="eyebrow" id="session-eyebrow">Session log</p>
          <h2 id="session-drawer-title">Session log</h2>
          <div class="session-drawer-preview" id="session-drawer-preview" hidden>
            <p class="eyebrow" id="session-pin-eyebrow">Last session</p>
            <p id="session-pin-text" class="session-pin-text"></p>
          </div>
        </div>
        <button class="icon-button" type="button" data-close-session-drawer aria-label="Close session log">x</button>
      </header>
      <div class="session-drawer-body">
        <pre id="session-log" class="session-log"></pre>
      </div>
    </aside>
  </div>
${embedBoardSnapshot(snapshot)}
  <script src="./app.js" defer></script>
</body>
</html>`;
}
