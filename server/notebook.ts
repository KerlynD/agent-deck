import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext, PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import { randomBytes } from "node:crypto";
import { readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, posix, resolve, sep } from "node:path";
import {
  notebookAssetRpc,
  notebookListRpc,
  notebookPinRpc,
  notebookReadRpc,
  type NoteSummary,
} from "../shared/notebook";
import type { deckSettings } from "../shared/settings";
import { sectionFor, toObsidian } from "./obsidian";
import {
  appendToSection,
  ensureDir,
  fileNameFor,
  isAssetTarget,
  isMapTitle,
  LinkResolver,
  listNotes,
  noteLinks,
  PIN_FOLDER,
  readNote,
  readNoteAt,
  safeJoin,
  sectionHeadings,
  type VaultNote,
  vaultDir,
} from "./vault";

type Settings = PluginSettings<typeof deckSettings.schema>;

export function registerNotebook(server: PluginServerContext, settings: Settings): () => void {
  // Read per request so a changed vault path applies without a reload.
  const dir = async () => {
    const state = await settings.read();
    return vaultDir(state.status === "ready" ? state.values.notebookPath : "");
  };
  server.handle(notebookPinRpc, async (input, ctx) => pin(await dir(), input, ctx));
  server.handle(notebookListRpc, async () => {
    const vault = await dir();
    return { vault, notes: await listSummaries(vault) };
  });
  server.handle(notebookReadRpc, async ({ id }) => readById(await dir(), id));
  server.handle(notebookAssetRpc, async ({ from, target }) => readAsset(await dir(), from, target));
  return () => {};
}

// ── Writes ───────────────────────────────────────────────────────────────────

const queues = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier task on the same file has settled. */
function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(task, task);
  const tail = next.catch(() => undefined);
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return next;
}

async function writeAtomic(path: string, text: string): Promise<void> {
  // Dot-prefixed, so a half-written file never shows up as a note.
  const tmp = join(dirname(path), `.${basename(path)}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, path);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// ── Pin ──────────────────────────────────────────────────────────────────────

const FENCE = /^\s{0,3}(```|~~~)/;

/** Shifts headings so the shallowest is `min`: a pinned reply must not open new `##` sections. */
export function demoteHeadings(markdown: string, min = 4): string {
  const lines = markdown.split(/\r?\n/);
  let fence: string | null = null;
  let shallowest = 7;
  const depths = lines.map((line) => {
    const f = FENCE.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (f[1] === fence) fence = null;
      return 0;
    }
    if (fence !== null) return 0;
    const depth = /^(#{1,6})\s/.exec(line)?.[1]!.length ?? 0;
    if (depth) shallowest = Math.min(shallowest, depth);
    return depth;
  });
  const shift = Math.max(0, min - shallowest);
  if (!shift) return lines.join("\n");
  return lines
    .map((line, i) => (depths[i] ? "#".repeat(Math.min(6, depths[i]! + shift)) + line.slice(depths[i]) : line))
    .join("\n");
}

function tagify(tag: string): string {
  return tag.trim().replace(/^#/, "").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_/-]/gu, "");
}

async function agentTitle(ctx: PluginHandlerContext | null, agentId: string | undefined): Promise<string | null> {
  if (!ctx || !agentId) return null;
  try {
    const result = await ctx.paseo.agents.ref(agentId).refresh();
    return result?.agent.title?.replace(/\s+/g, " ").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Appends a block to the note `topic` resolves to, in `## Review` or `## Reference`.
 * No match: a new note in PIN_FOLDER. Only those two sections are ever written.
 */
export async function pin(vault: string, input: RpcInput<typeof notebookPinRpc>, ctx: PluginHandlerContext | null) {
  const topic = input.topic?.replace(/^\[\[|\]\]$/g, "").split("|")[0]!.trim() || null;
  const name = topic || (await agentTitle(ctx, input.agentId)) || "Pinned from Paseo";
  const section = sectionFor(input.kind);
  const body = input.kind === "note" ? demoteHeadings(input.body) : input.body;

  const target = new LinkResolver(await listNotes(vault)).resolve(name);
  const path = target?.path ?? safeJoin(vault, `${PIN_FOLDER}/${fileNameFor(name)}.md`);
  if (!path) throw new Error(`Can't pin to "${name}"`);

  return serialize(path, async () => {
    const chunk = toObsidian(input.kind, input.title, body, new Date().toISOString());
    let text = await readIfExists(path);
    const created = text === null;
    if (text === null) {
      await ensureDir(dirname(path));
      const tags = [...new Set(["paseo", ...(input.tags ?? [])].map(tagify).filter(Boolean))];
      text = `${tags.map((t) => `#${t}`).join(" ")}\n\n# ${basename(path, ".md")}\n`;
    }
    await writeAtomic(path, appendToSection(text, section, chunk));
    const note = await readNoteAt(vault, path);
    if (!note) throw new Error("The note was written but can't be read back");
    return { id: note.id, title: note.title, path, section, created };
  });
}

// ── List and read ────────────────────────────────────────────────────────────

function summary(note: VaultNote): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    folder: note.folder,
    tags: note.tags,
    isMap: isMapTitle(note.title),
    sections: sectionHeadings(note.text).length,
    updated: note.mtime.toISOString(),
  };
}

export async function listSummaries(vault: string): Promise<NoteSummary[]> {
  const notes = await listNotes(vault);
  return notes.map(summary).sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
}

export async function readById(vault: string, id: string) {
  const notes = await listNotes(vault);
  const resolver = new LinkResolver(notes);
  // An id, or a link target or title (deep links, the concept map's ghosts).
  const note = (await readNote(vault, id)) ?? resolver.resolve(id);
  if (!note) throw new Error(`No note "${id}" in the vault`);

  const links: Record<string, string | null> = {};
  for (const target of noteLinks(note.text)) {
    if (!(target in links)) links[target] = resolver.resolve(target, note)?.id ?? null;
  }
  const backlinks = notes
    .filter((n) => n.id !== note.id && noteLinks(n.text).some((t) => resolver.resolve(t, n)?.id === note.id))
    .map((n) => ({ id: n.id, title: n.title }))
    .sort((a, b) => a.title.localeCompare(b.title));
  return { note: summary(note), markdown: note.text, backlinks, links };
}

// ── Assets ───────────────────────────────────────────────────────────────────

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};
const MAX_ASSET_BYTES = 3 * 1024 * 1024;
const INDEX_TTL_MS = 30_000;

/** Lowercased file name → absolute paths, for embeds that name only a file. */
let assetIndex: { vault: string; at: number; files: Map<string, string[]> } | null = null;

async function indexAssets(vault: string): Promise<Map<string, string[]>> {
  if (assetIndex && assetIndex.vault === vault && Date.now() - assetIndex.at < INDEX_TTL_MS) return assetIndex.files;
  const files = new Map<string, string[]>();
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.name.startsWith(".")) return;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        if (entry.isFile() && IMAGE_MIME[extname(entry.name).toLowerCase()]) {
          const key = entry.name.toLowerCase();
          files.set(key, [...(files.get(key) ?? []), full]);
        }
      }),
    );
  };
  await walk(resolve(vault));
  assetIndex = { vault, at: Date.now(), files };
  return files;
}

async function loadImage(path: string): Promise<{ mime: string; base64: string } | null> {
  const mime = IMAGE_MIME[extname(path).toLowerCase()];
  if (!mime) return null;
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_ASSET_BYTES) return null;
    return { mime, base64: (await readFile(path)).toString("base64") };
  } catch {
    return null;
  }
}

/** An `![[embed]]` beside the note, then by vault path, then by file name anywhere in the vault. */
export async function readAsset(vault: string, from: string, target: string) {
  const clean = target.split("|")[0]!.split("#")[0]!.trim().replace(/\\/g, "/");
  if (!isAssetTarget(clean) || !IMAGE_MIME[extname(clean).toLowerCase()]) return null;
  const folder = posix.dirname(from.replace(/\\/g, "/"));
  const near = folder === "." ? "" : folder;
  for (const path of [safeJoin(vault, posix.join(near, clean)), safeJoin(vault, clean)]) {
    if (!path) continue;
    const image = await loadImage(path);
    if (image) return image;
  }
  const matches = (await indexAssets(vault)).get(basename(clean).toLowerCase()) ?? [];
  // Prefer the copy under the note's folder, like Obsidian.
  const root = (safeJoin(vault, near) ?? resolve(vault)) + sep;
  const sorted = [...matches].sort((a, b) => Number(b.startsWith(root)) - Number(a.startsWith(root)));
  for (const path of sorted) {
    const image = await loadImage(path);
    if (image) return image;
  }
  return null;
}
