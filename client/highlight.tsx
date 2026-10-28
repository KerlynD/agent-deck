import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { type HighlightResult, highlightRpc } from "../shared/highlight";
import { PALETTES, SHIKI_THEMES, type ShikiThemeName } from "../shared/palettes";
import { deckSettings } from "../shared/settings";
import { isDark } from "./ui-kit";

export function useSyntaxTheme(theme: PluginTheme): ShikiThemeName {
  const settings = useSettings(deckSettings);
  const chosen = settings.status === "ready" ? settings.values.syntaxTheme : "auto";
  if (chosen !== "auto" && (SHIKI_THEMES as readonly string[]).includes(chosen)) {
    return chosen as ShikiThemeName;
  }
  const bg = theme.colors.surface0.toLowerCase();
  const palette = PALETTES.find((p) => p.colors.background.toLowerCase() === bg);
  if (palette) return palette.shiki as ShikiThemeName;
  return isDark(theme.colors.surface0) ? "github-dark-default" : "github-light-default";
}

const cache = new Map<string, HighlightResult>();
const inflight = new Map<string, Promise<HighlightResult>>();
const MAX_CACHE = 400;

function remember(key: string, value: HighlightResult) {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
}

/**
 * Tokenises code on the daemon (where the grammars live) and caches by content.
 * Returns null until tokens arrive, and stays null when `enabled` is false, so
 * callers render plain text in the meantime.
 */
export function useHighlight(
  code: string,
  opts: { lang?: string; filename?: string; theme: ShikiThemeName; enabled?: boolean },
): HighlightResult | null {
  const call = useRpc(highlightRpc);
  const enabled = opts.enabled !== false && code.length > 0;
  const key = `${opts.theme}\u0000${opts.lang ?? ""}\u0000${opts.filename ?? ""}\u0000${code}`;
  const [result, setResult] = useState<HighlightResult | null>(() => cache.get(key) ?? null);

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      return;
    }
    const hit = cache.get(key);
    if (hit) {
      setResult(hit);
      return;
    }
    let cancelled = false;
    let pending = inflight.get(key);
    if (!pending) {
      pending = call({ code, lang: opts.lang, filename: opts.filename, theme: opts.theme });
      inflight.set(key, pending);
    }
    pending
      .then((value) => {
        remember(key, value);
        if (!cancelled) setResult(value);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => inflight.delete(key));
    return () => {
      cancelled = true;
    };
    // `key` covers code, lang, filename, and theme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return enabled ? result : null;
}
