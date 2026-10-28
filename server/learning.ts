import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import type { deckSettings } from "../shared/settings";

export function registerLearning(_server: PluginServerContext, _settings: PluginSettings<typeof deckSettings.schema>): () => void {
  return () => {};
}
