import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import type { z } from "zod";
import { notebookGraphRpc } from "../shared/notebook";
import type { deckSettings } from "../shared/settings";
import { countSections, listNotes, noteTitle, slugify, type VaultNote, vaultDir, wikiLinks } from "./vault";

export type NotebookGraph = z.output<typeof notebookGraphRpc.output>;

/**
 * Topics are nodes; `[[links]]` are edges. A link resolves by slug against both the file
 * name and the frontmatter title, so `[[Event Loop]]` finds `event-loop.md` and also an
 * Obsidian-style `Event Loop.md`. Links to topics without a file become ghost nodes.
 * Repeated links between the same pair add weight; self-links are dropped.
 */
export function buildGraph(notes: VaultNote[]): NotebookGraph {
  const nodes = new Map<string, NotebookGraph["nodes"][number]>();
  const resolve = new Map<string, string>();

  const sorted = [...notes].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const note of sorted) {
    nodes.set(note.slug, {
      slug: note.slug,
      title: noteTitle(note),
      exists: true,
      sections: countSections(note.body),
      tags: note.meta.tags,
    });
    resolve.set(note.slug, note.slug);
  }
  // Slugified names after exact file names, so an exact file name always wins.
  for (const note of sorted) {
    for (const key of [slugify(note.slug), slugify(noteTitle(note))]) {
      if (!resolve.has(key)) resolve.set(key, note.slug);
    }
  }

  const weights = new Map<string, number>();
  for (const note of sorted) {
    for (const target of wikiLinks(note.body)) {
      const key = slugify(target);
      let to = resolve.get(key);
      if (!to) {
        to = key;
        resolve.set(key, key);
        nodes.set(key, { slug: key, title: target, exists: false, sections: 0, tags: [] });
      }
      if (to === note.slug) continue;
      const edge = `${note.slug}\u0000${to}`;
      weights.set(edge, (weights.get(edge) ?? 0) + 1);
    }
  }

  const edges = [...weights].map(([key, weight]) => {
    const [from, to] = key.split("\u0000") as [string, string];
    return { from, to, weight };
  });
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { nodes: [...nodes.values()].sort((a, b) => a.slug.localeCompare(b.slug)), edges };
}

export function registerGraph(server: PluginServerContext, settings: PluginSettings<typeof deckSettings.schema>): () => void {
  server.handle(notebookGraphRpc, async () => {
    const state = await settings.read();
    const dir = vaultDir(state.status === "ready" ? state.values.notebookPath : undefined);
    return buildGraph(await listNotes(dir));
  });
  return () => {};
}
