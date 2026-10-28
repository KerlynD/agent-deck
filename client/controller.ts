import type { PluginTheme } from "@getpaseo/plugin";
import { useSettings } from "@getpaseo/plugin/client";
import { useEffect } from "react";
import { type DeckSettings, deckSettings } from "../shared/settings";
import type { ChatToggles } from "./chat";
import { applyRice } from "./rice";
import { alpha } from "./ui-kit";
import { setRootVars } from "./web";

let chatApply: ((t: ChatToggles) => void) | null = null;
let lastRice = "";
let lastTheme = "";

export function bindChat(apply: (t: ChatToggles) => void) {
  chatApply = apply;
}

export function unbindChat() {
  chatApply = null;
  lastRice = "";
  lastTheme = "";
}

function sync(values: DeckSettings) {
  chatApply?.({
    chatAssistant: values.chatAssistant,
    chatTools: values.chatTools,
    chatReasoning: values.chatReasoning,
    chatTodos: values.chatTodos,
  });
  const rice = JSON.stringify([values.riceSquare, values.riceMono, values.riceBorders, values.riceVividIcons, values.riceComposer]);
  if (rice !== lastRice) {
    lastRice = rice;
    applyRice(values);
  }
}

function syncTheme(theme: PluginTheme) {
  const c = theme.colors;
  const key = JSON.stringify(c);
  if (key === lastTheme) return;
  lastTheme = key;
  setRootVars({
    "--deck-bg": c.surface0,
    "--deck-raised": c.surface1,
    "--deck-control": c.surface2,
    "--deck-border": c.border,
    "--deck-fg": c.foreground,
    "--deck-muted": c.foregroundMuted,
    "--deck-accent": c.accent,
    "--deck-accent-fg": c.accentForeground,
    "--deck-accent-soft": alpha(c.accent, 0.18),
    "--deck-success": c.statusSuccess,
    "--deck-warning": c.statusWarning,
    "--deck-danger": c.statusDanger,
  });
}

/**
 * Mounted by always-visible plugin surfaces (sidebar rows, panels). Pushes the
 * saved settings into the chat transformers and the injected CSS, and mirrors
 * the active theme into CSS variables the injected CSS reads.
 */
export function useDeckSync(theme: PluginTheme) {
  const settings = useSettings(deckSettings);
  const values = settings.status === "ready" ? settings.values : null;
  useEffect(() => {
    syncTheme(theme);
  }, [theme]);
  useEffect(() => {
    if (values) sync(values);
  }, [values]);
}
