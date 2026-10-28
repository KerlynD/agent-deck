import type { PluginAgentCommandContext } from "@getpaseo/plugin/client";
import { notebookPinRpc } from "../../shared/notebook";
import { focusNote, notePinned } from "./events";
import { pinTitle } from "./obsidian";

const PAGE = 200;
const MAX_PAGES = 5;

/**
 * The agent's latest assistant reply. Reads the projected timeline from the tail, paging back
 * when the last page has none, and joins consecutive assistant entries of the same turn
 * (a reply split across chunks).
 */
export async function lastReply(ctx: PluginAgentCommandContext): Promise<string | null> {
  const timeline = ctx.paseo.agents.ref(ctx.agent.id).timeline;
  let page = await timeline.refetch({ direction: "tail", limit: PAGE, projection: "projected" });
  for (let n = 0; n < MAX_PAGES; n++) {
    const entries = page.entries;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!;
      if (entry.item.type !== "assistant_message" || !entry.item.text.trim()) continue;
      const parts = [entry.item.text];
      for (let j = i - 1; j >= 0; j--) {
        const prev = entries[j]!;
        if (prev.item.type !== "assistant_message" || prev.turnId !== entry.turnId) break;
        parts.unshift(prev.item.text);
      }
      return parts.join("");
    }
    if (!page.hasOlder || !page.startCursor) break;
    page = await timeline.refetch({ direction: "before", cursor: page.startCursor, limit: PAGE, projection: "projected" });
  }
  return null;
}

/** `/pin [note]`: saves the latest reply to the note's Reference section and shows it beside the agent. */
export async function pinLastReply(ctx: PluginAgentCommandContext & { args: string }): Promise<void> {
  const text = await lastReply(ctx);
  if (!text) throw new Error("No reply from this agent to pin yet");
  const { title, body } = pinTitle(text);
  const result = await ctx.rpc(notebookPinRpc, {
    topic: ctx.args.trim().slice(0, 200) || undefined,
    title: title.slice(0, 300),
    kind: "note",
    body: body.length > 60_000 ? `${body.slice(0, 59_900)}\n\n*(truncated)*` : body,
    agentId: ctx.agent.id,
  });
  notePinned();
  focusNote(result.id);
  ctx.openPanel("notebook");
}
