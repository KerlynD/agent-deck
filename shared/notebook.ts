import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/*
 * The notebook is an existing Obsidian vault folder (setting `notebookPath`), read as-is.
 *
 * - Every `.md` file under the vault is a note, recursively. Folders starting with `.` or `_`
 *   and agent instruction files (CLAUDE.md, AGENTS.md) are skipped.
 * - A note's id is its vault-relative path without `.md`: `Learning/Diffusion Models/Learning to Denoise`.
 *   Its title is the file name. Folders group notes by topic.
 * - Tags come from the leading tag block (`#learning #diffusion`) and, if present, YAML frontmatter `tags`.
 * - Links are Obsidian wikilinks: `[[Title]]`, `[[Title|label]]`, `[[Title#Heading]]`, `[[Folder/Title]]`.
 *   They resolve by file name, case-insensitively, like Obsidian. `![[figure.png]]` embeds are assets, not links.
 * - A map note is a hub whose title ends with "— Map" (the vault's learning workflow names them so).
 *
 * Pinning never rewrites the user's own writing. It converts a learning block to Obsidian markdown
 * and appends it to a section of the target note:
 *   quiz, flashcards → `## Review` as collapsible `> [!question]- prompt` callouts
 *   everything else  → `## Reference`
 * A missing section is added at the end of the note (before `## Glossary` when there is one).
 * `## In My Own Words` is never written to. Without a matching target note, the pin creates
 * `<pinFolder>/<topic or "Pinned from Paseo">.md` with a `#paseo` tag block and an `# H1`.
 */

export const NOTE_KINDS = ["note", "callout", "quiz", "flashcards", "steps", "compare", "diagram"] as const;
export const noteKind = z.enum(NOTE_KINDS);
export type NoteKind = z.infer<typeof noteKind>;

export const noteSummary = z.object({
  id: z.string(),
  title: z.string(),
  /** Vault-relative folder, "" for the vault root. */
  folder: z.string(),
  tags: z.array(z.string()),
  isMap: z.boolean(),
  /** `## ` headings in the note. */
  sections: z.number().int(),
  /** File modification time, ISO. */
  updated: z.string(),
});
export type NoteSummary = z.infer<typeof noteSummary>;

export const notebookPinRpc = defineRpc({
  name: "deck.notebook.pin",
  input: z.object({
    /** Note id or title to append to (resolved like a wikilink). Unresolved: a new note with this title. */
    topic: z.string().max(200).optional(),
    /** Short heading for the pinned block. */
    title: z.string().max(300),
    kind: noteKind,
    /** Raw fenced learning block (```quiz …```) or plain markdown for kind "note". */
    body: z.string().max(60_000),
    tags: z.array(z.string().max(60)).max(20).optional(),
    agentId: z.string().optional(),
  }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    path: z.string(),
    /** Section the block landed in. */
    section: z.string(),
    created: z.boolean(),
  }),
});

export const notebookListRpc = defineRpc({
  name: "deck.notebook.list",
  input: z.object({}),
  output: z.object({ vault: z.string(), notes: z.array(noteSummary) }),
});

export const notebookReadRpc = defineRpc({
  name: "deck.notebook.read",
  input: z.object({ id: z.string() }),
  output: z.object({
    note: noteSummary,
    /** Full file contents. */
    markdown: z.string(),
    /** Notes that link here. */
    backlinks: z.array(z.object({ id: z.string(), title: z.string() })),
    /** Resolved outgoing links, by target text as written (before `|` and `#`). Null: unresolved. */
    links: z.record(z.string(), z.string().nullable()),
  }),
});

/** Image embeds (`![[figure.png]]`), read relative to the note, then by file name anywhere in the vault. */
export const notebookAssetRpc = defineRpc({
  name: "deck.notebook.asset",
  input: z.object({ from: z.string(), target: z.string().max(500) }),
  output: z.object({ mime: z.string(), base64: z.string() }).nullable(),
});

export const notebookGraphRpc = defineRpc({
  name: "deck.notebook.graph",
  input: z.object({}),
  output: z.object({
    nodes: z.array(
      z.object({
        /** Note id, or `ghost:<target>` for a link to a note that does not exist yet. */
        id: z.string(),
        title: z.string(),
        folder: z.string(),
        exists: z.boolean(),
        isMap: z.boolean(),
        sections: z.number().int(),
        tags: z.array(z.string()),
      }),
    ),
    edges: z.array(z.object({ from: z.string(), to: z.string(), weight: z.number().int() })),
  }),
});
