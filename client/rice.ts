import type { DeckSettings } from "../shared/settings";
import { setStyle } from "./web";

const STYLE_ID = "agent-deck-rice";

const MONO_STACK =
  "'JetBrains Mono', 'Berkeley Mono', 'Iosevka Term', 'Iosevka', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/*
 * Selectors target Paseo's test ids (React Native Web renders `testID` as
 * `data-testid`). They are the most stable hooks the app exposes, but they are
 * not a public API: if Paseo renames one, that rule simply stops matching.
 */

const SQUARE = `
#root *, #root *::before, #root *::after { border-radius: 0 !important; }
`;

const MONO = `
#root, #root *:not(svg):not(path) { font-family: ${MONO_STACK} !important; letter-spacing: 0 !important; }
`;

const VIVID_ICONS = `
[data-testid^="file-explorer-row-"] svg,
[data-testid="workspace-file-pane"] svg,
[data-testid^="changed-file"] svg { filter: saturate(1.55); }
`;

const BORDERS = `
[data-testid="workspace-explorer-sidebar"] { border-left: 1px solid var(--deck-border) !important; }
[data-testid="explorer-header"] { border-bottom: 1px solid var(--deck-border) !important; }
`;

/*
 * Composer anatomy (Paseo 0.12):
 *   message-input-root … SURFACE (bordered card)
 *     > div            input row (textarea + focus hint)
 *     > div  TOOLBAR   [left: attach + model/mode/features] [right: voice/send]
 * The surface and toolbar have no ids, so they are found through the attach
 * button that always sits in the toolbar's left group.
 */
const TOOLBAR = `[data-testid="message-input-root"] div:has(> div > [data-testid="message-input-attach-button"])`;
const SURFACE = `[data-testid="message-input-root"] div:has(> div > div > [data-testid="message-input-attach-button"])`;

const COMPOSER = `
${SURFACE} {
  border: 1px solid var(--deck-border) !important;
  background: var(--deck-raised) !important;
  padding: 10px 12px 0 12px !important;
  gap: 8px !important;
  box-shadow: none !important;
  transition: border-color 120ms ease;
}
${SURFACE}:focus-within { border-color: var(--deck-accent) !important; }
${SURFACE} > div:first-child { position: relative; padding-left: 20px !important; }
${SURFACE} > div:first-child::before {
  content: "❯";
  position: absolute; left: 1px; top: 0;
  color: var(--deck-accent); font-weight: 800;
  font-family: var(--deck-mono); font-size: 14px; line-height: 22px;
}
${SURFACE} textarea { font-family: var(--deck-mono) !important; }
${TOOLBAR} {
  margin: 0 -12px !important;
  width: auto !important;
  min-height: 30px;
  padding: 0 6px 0 0 !important;
  border-top: 1px solid var(--deck-border);
  background: var(--deck-control);
  align-items: stretch !important;
}
${TOOLBAR}::before {
  content: "NORMAL";
  display: flex; align-items: center;
  padding: 0 10px; margin-right: 6px;
  background: var(--deck-border); color: var(--deck-fg);
  font: 700 11px/1 var(--deck-mono); letter-spacing: 0.06em;
}
${SURFACE}:focus-within > div:has(> div > [data-testid="message-input-attach-button"])::before {
  content: "INSERT";
  background: var(--deck-accent); color: var(--deck-accent-fg);
}
${TOOLBAR} > div { align-items: center !important; }
${TOOLBAR} > div:last-child::before {
  content: "/ cmds   @ files   ↵ send";
  white-space: pre;
  margin-right: 10px;
  color: var(--deck-muted);
  font: 400 11px/1 var(--deck-mono);
}
${TOOLBAR} button { min-height: 26px; }
[data-testid="combined-model-selector"], [data-testid="mode-control"] {
  border-left: 1px solid var(--deck-border) !important;
  padding-left: 8px !important;
}
`;

export function buildRiceCss(values: DeckSettings): string {
  const parts = [`:root { --deck-mono: ${MONO_STACK}; }`];
  if (values.riceSquare) parts.push(SQUARE);
  if (values.riceMono) parts.push(MONO);
  if (values.riceVividIcons) parts.push(VIVID_ICONS);
  if (values.riceBorders) parts.push(BORDERS);
  if (values.riceComposer) parts.push(COMPOSER);
  return parts.join("\n");
}

export function applyRice(values: DeckSettings): void {
  setStyle(STYLE_ID, buildRiceCss(values));
}

export function removeRice(): void {
  setStyle(STYLE_ID, "")();
}
