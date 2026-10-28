import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import { LEARNING_PROMPT, LEARNING_PROMPT_MARKER } from "../shared/learning";
import type { deckSettings } from "../shared/settings";

/** Teaches new agents the learning block formats by extending their system prompt. */
export function registerLearning(server: PluginServerContext, settings: PluginSettings<typeof deckSettings.schema>): () => void {
  return server.before("agent.create", async ({ request }) => {
    const state = await settings.read();
    if (state.status !== "ready" || !state.values.learningPrompt) return;
    const existing = request.config.systemPrompt?.trim() ?? "";
    if (existing.includes(LEARNING_PROMPT_MARKER)) return;
    const systemPrompt = existing ? `${existing}\n\n${LEARNING_PROMPT}` : LEARNING_PROMPT;
    return { ...request, config: { ...request.config, systemPrompt } };
  });
}
