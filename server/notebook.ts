import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext, PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import { randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  notebookListRpc,
  notebookPinRpc,
  notebookReadRpc,
  type TopicSummary,
} from "../shared/notebook";
import type { deckSettings } from "../shared/settings";
import {
  countSections,
  ensureVault,
  type Frontmatter,
  formatFrontmatter,
  listNotes,
  noteTitle,
  parseNote,
  readNote,
  slugify,
  type VaultNote,
  vaultDir,
  wikiLinks,
} from "./vault";

type Settings = PluginSettings<typeof deckSettings.schema>;

export function registerNotebook(server: PluginServerContext, settings: Settings): () => void {
  const dir = async () => {
    const state = await settings.read();
    return vaultDir(state.status === "ready" ? state.values.notebookPath : "");
  };
  server.handle(notebookPinRpc, async (input, ctx) => pin(await dir(), input, ctx));
  server.handle(notebookListRpc, async () => {
    const vault = await dir();
    return { vault, topics: await listTopics(vault) };
  });
  server.handle(notebookReadRpc, async ({ slug }) => readTopic(await dir(), slug));
  return () => {};
}

// ── Path safety ──────────────────────────────────────────────────────────────

/**
 * The note file for `slug`, or null when the slug could escape the vault. Slugs
 * the notebook writes are slugified; files made elsewhere (Obsidian) keep their
 * own names, so any plain file name is allowed, never a path.
 */
export function notePath(dir: string, slug: string): string | null {
  if (!slug || slug.length > 200 || slug.startsWith(".") || /[/\\\0]/.test(slug)) return null;
  const root = resolve(dir);
  const path = resolve(root, `${slug}.md`);
  return dirname(path) === root ? path : null;
}

// ── Write queue ──────────────────────────────────────────────────────────────

const queues = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier task on the same file has settled. */
function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const tail = next.catch(() => undefined);
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return next;
}

async function writeAtomic(path: string, text: string): Promise<void> {
  // Dot-prefixed so a half-written file never shows up in the topic list.
  const tmp = join(dirname(path), `.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, path);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

// ── Pin ──────────────────────────────────────────────────────────────────────

const FENCE = /^\s{0,3}(```|~~~)/;

/** Shifts headings so the shallowest is `###`: a pinned body must not open new `##` sections. */
export function demoteHeadings(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let fence: string | null = null;
  let min = 7;
  const isHeading = lines.map((line) => {
    const f = FENCE.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (f[1] === fence) fence = null;
      return false;
    }
    if (fence !== null) return false;
    const h = /^(#{1,6})\s/.exec(line);
    if (h) min = Math.min(min, h[1]!.length);
    return Boolean(h);
  });
  const shift = min < 3 ? 3 - min : 0;
  if (shift === 0) return lines.join("\n");
  return lines
    .map((line, i) => {
      if (!isHeading[i]) return line;
      const depth = /^#+/.exec(line)![0].length;
      return "#".repeat(Math.min(6, depth + shift)) + line.slice(depth);
    })
    .join("\n");
}

function oneLine(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function mergeTags(a: string[], b: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...a, ...(b ?? [])]) {
    const tag = oneLine(raw, 60).replace(/^#/, "");
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

async function agentTitle(paseo: PluginHandlerContext["paseo"], agentId: string | undefined): Promise<string | null> {
  if (!agentId) return null;
  try {
    const result = await paseo.agents.ref(agentId).refresh();
    return oneLine(result?.agent.title ?? "", 200) || null;
  } catch {
    return null;
  }
}

export async function pin(
  dir: string,
  input: RpcInput<typeof notebookPinRpc>,
  ctx: PluginHandlerContext | null,
): Promise<{ slug: string; title: string; path: string }> {
  const topic =
    oneLine(input.topic ?? "", 200) || (ctx ? await agentTitle(ctx.paseo, input.agentId) : null) || "Inbox";
  const slug = slugify(topic);
  await ensureVault(dir);
  const path = notePath(dir, slug);
  if (!path) throw new Error(`Invalid topic: ${topic}`);

  return serialize(path, async () => {
    const now = new Date().toISOString();
    let existing: string | null = null;
    try {
      existing = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parsed = existing === null ? null : parseNote(existing);
    const meta: Frontmatter = {
      title: parsed?.meta.title || topic,
      created: parsed?.meta.created || now,
      updated: now,
      tags: mergeTags(parsed?.meta.tags ?? [], input.tags),
    };
    const agent = input.agentId ? ` agent=${input.agentId.replace(/\s|-->/g, "").slice(0, 120)}` : "";
    const section = [
      `## ${oneLine(input.title, 300) || "Note"}`,
      `<!-- pinned ${now} kind=${input.kind}${agent} -->`,
      demoteHeadings(input.body.trim()),
    ].join("\n");
    const previous = (parsed?.body ?? "").replace(/^(\s*\n)+/, "").replace(/\s+$/, "");
    const body = previous ? `${previous}\n\n${section}\n` : `${section}\n`;
    await writeAtomic(path, `${formatFrontmatter(meta)}\n${body}`);
    return { slug, title: meta.title!, path };
  });
}

// ── List and read ────────────────────────────────────────────────────────────

function summary(note: VaultNote): TopicSummary {
  return {
    slug: note.slug,
    title: noteTitle(note),
    tags: note.meta.tags,
    sections: countSections(note.body),
    updated: note.meta.updated || note.mtime.toISOString(),
  };
}

function time(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export async function listTopics(dir: string): Promise<TopicSummary[]> {
  const notes = await listNotes(dir);
  return notes.map(summary).sort((a, b) => time(b.updated) - time(a.updated));
}

/** Keys a `[[link]]` may resolve to for this note: its file name and its title, slugified. */
function keys(note: VaultNote): Set<string> {
  return new Set([slugify(note.slug), slugify(noteTitle(note))]);
}

export async function readTopic(dir: string, slug: string) {
  const all = await listNotes(dir);
  let note: VaultNote | null = null;
  if (notePath(dir, slug)) note = await readNote(dir, slug);
  if (!note) {
    // A link target or a file made outside the notebook: match by slug or title.
    const want = slugify(slug);
    note = all.find((n) => keys(n).has(want)) ?? null;
  }
  if (!note) throw new Error(`No topic "${slug}" in the notebook yet`);
  const found = note;
  const mine = keys(found);
  const backlinks = all
    .filter((n) => n.slug !== found.slug && wikiLinks(n.body).some((target) => mine.has(slugify(target))))
    .map((n) => ({ slug: n.slug, title: noteTitle(n) }))
    .sort((a, b) => a.title.localeCompare(b.title));
  return { topic: summary(found), markdown: found.body, backlinks };
}
