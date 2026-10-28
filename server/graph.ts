import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import type { deckSettings } from "../shared/settings";

export function registerGraph(_server: PluginServerContext, _settings: PluginSettings<typeof deckSettings.schema>): () => void {
  return () => {};
}
