import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/*
 * Notebook vault format (shared by the notebook panel and the concept map).
 *
 * The vault is a folder of markdown files, one per topic, compatible with Obsidian:
 *
 *   <vault>/<topic-slug>.md
 *
 *   ---
 *   title: Event loop
 *   created: 2026-10-28T12:00:00.000Z
 *   updated: 2026-10-28T12:30:00.000Z
 *   tags: [javascript, runtime]
 *   ---
 *
 *   ## Microtasks run before the next macrotask
 *   <!-- pinned 2026-10-28T12:30:00.000Z kind=callout agent=abc123 -->
 *   Body markdown. Learning blocks are kept as fenced blocks (```quiz …```).
 *   Links to other topics use [[Topic title]].
 *
 * Each pin appends one `##` section. Topic links are `[[Title]]` or `[[Title|label]]`,
 * resolved by slug, so `[[Event Loop]]` and `[[event loop]]` point at the same topic.
 */

export const NOTE_KINDS = ["note", "callout", "quiz", "flashcards", "steps", "compare", "diagram"] as const;
export const noteKind = z.enum(NOTE_KINDS);
export type NoteKind = z.infer<typeof noteKind>;

export const topicSummary = z.object({
  slug: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  sections: z.number().int(),
  updated: z.string(),
});
export type TopicSummary = z.infer<typeof topicSummary>;

export const notebookPinRpc = defineRpc({
  name: "deck.notebook.pin",
  input: z.object({
    /** Topic title. Omitted: the notebook picks one from the agent's title or "Inbox". */
    topic: z.string().max(200).optional(),
    /** Section heading. */
    title: z.string().max(300),
    kind: noteKind,
    /** Markdown body, fenced block included for learning blocks. */
    body: z.string().max(60_000),
    tags: z.array(z.string().max(60)).max(20).optional(),
    agentId: z.string().optional(),
  }),
  output: z.object({ slug: z.string(), title: z.string(), path: z.string() }),
});

export const notebookListRpc = defineRpc({
  name: "deck.notebook.list",
  input: z.object({}),
  output: z.object({ vault: z.string(), topics: z.array(topicSummary) }),
});

export const notebookReadRpc = defineRpc({
  name: "deck.notebook.read",
  input: z.object({ slug: z.string() }),
  output: z.object({
    topic: topicSummary,
    /** File contents without frontmatter. */
    markdown: z.string(),
    /** Slugs of topics that link here. */
    backlinks: z.array(z.object({ slug: z.string(), title: z.string() })),
  }),
});

export const notebookGraphRpc = defineRpc({
  name: "deck.notebook.graph",
  input: z.object({}),
  output: z.object({
    nodes: z.array(
      z.object({
        slug: z.string(),
        title: z.string(),
        /** False for a `[[link]]` whose topic file does not exist yet. */
        exists: z.boolean(),
        sections: z.number().int(),
        tags: z.array(z.string()),
      }),
    ),
    edges: z.array(z.object({ from: z.string(), to: z.string(), weight: z.number().int() })),
  }),
});
