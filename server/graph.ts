import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import type { z } from "zod";
import { notebookGraphRpc } from "../shared/notebook";
import type { deckSettings } from "../shared/settings";
import { isMapTitle, LinkResolver, listNotes, noteLinks, sectionHeadings, type VaultNote, vaultDir } from "./vault";

export type NotebookGraph = z.output<typeof notebookGraphRpc.output>;

/**
 * Notes are nodes; wikilinks between notes are edges, resolved like Obsidian does.
 * A link to a note that does not exist becomes a ghost node `ghost:<target lowercased>`.
 * Repeated links between the same pair add weight; self-links are dropped.
 */
export function buildGraph(notes: VaultNote[]): NotebookGraph {
  const resolver = new LinkResolver(notes);
  const nodes = new Map<string, NotebookGraph["nodes"][number]>();
  for (const note of notes) {
    nodes.set(note.id, {
      id: note.id,
      title: note.title,
      folder: note.folder,
      exists: true,
      isMap: isMapTitle(note.title),
      sections: sectionHeadings(note.text).length,
      tags: note.tags,
    });
  }

  const weights = new Map<string, number>();
  for (const note of notes) {
    for (const target of noteLinks(note.text)) {
      let to = resolver.resolve(target, note)?.id;
      if (!to) {
        to = `ghost:${target.toLowerCase()}`;
        if (!nodes.has(to)) {
          const title = target.split("/").pop()!.replace(/\.md$/i, "");
          nodes.set(to, { id: to, title, folder: "", exists: false, isMap: false, sections: 0, tags: [] });
        }
      }
      if (to === note.id) continue;
      const edge = `${note.id}\u0000${to}`;
      weights.set(edge, (weights.get(edge) ?? 0) + 1);
    }
  }

  const edges = [...weights].map(([key, weight]) => {
    const [from, to] = key.split("\u0000") as [string, string];
    return { from, to, weight };
  });
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), edges };
}

export function registerGraph(server: PluginServerContext, settings: PluginSettings<typeof deckSettings.schema>): () => void {
  server.handle(notebookGraphRpc, async () => {
    const state = await settings.read();
    const dir = vaultDir(state.status === "ready" ? state.values.notebookPath : undefined);
    return buildGraph(await listNotes(dir));
  });
  return () => {};
}
