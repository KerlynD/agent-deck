import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** Where the vault lives when the notebookPath setting is empty. */
export const DEFAULT_VAULT = join(homedir(), "Documents", "Paseo Notebook");

export function vaultDir(setting: string | undefined): string {
  const raw = (setting ?? "").trim();
  if (!raw) return DEFAULT_VAULT;
  const expanded = raw.startsWith("~") ? join(homedir(), raw.slice(1)) : raw;
  return isAbsolute(expanded) ? expanded : resolve(homedir(), expanded);
}

export async function ensureVault(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** `Event Loop` and `event-loop` share the slug `event-loop`. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "untitled";
}

export interface Frontmatter {
  title?: string;
  created?: string;
  updated?: string;
  tags: string[];
}

export interface VaultNote {
  slug: string;
  path: string;
  meta: Frontmatter;
  /** Contents without frontmatter. */
  body: string;
  mtime: Date;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Parses the small frontmatter subset the notebook writes: scalars and inline `[a, b]` lists. */
export function parseNote(text: string): { meta: Frontmatter; body: string } {
  const match = FRONTMATTER.exec(text);
  const meta: Frontmatter = { tags: [] };
  if (!match) return { meta, body: text };
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!;
    const value = kv[2]!.trim();
    if (key === "tags") {
      meta.tags = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((t) => unquote(t.trim()))
        .filter(Boolean);
    } else if (key === "title" || key === "created" || key === "updated") {
      meta[key] = unquote(value);
    }
  }
  return { meta, body: text.slice(match[0].length) };
}

export function formatFrontmatter(meta: Frontmatter): string {
  const lines = ["---"];
  if (meta.title) lines.push(`title: ${quote(meta.title)}`);
  if (meta.created) lines.push(`created: ${meta.created}`);
  if (meta.updated) lines.push(`updated: ${meta.updated}`);
  lines.push(`tags: [${meta.tags.map(quote).join(", ")}]`);
  lines.push("---", "");
  return lines.join("\n");
}

function unquote(s: string): string {
  return /^(["']).*\1$/.test(s) ? s.slice(1, -1) : s;
}

function quote(s: string): string {
  return /[:#\[\]{},"']|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
}

/** `[[Title]]` and `[[Title|label]]` targets, in order of appearance. */
export function wikiLinks(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g)) out.push(m[1]!.trim());
  return out;
}

/** Number of `## ` sections. */
export function countSections(body: string): number {
  return body.split(/\r?\n/).filter((l) => l.startsWith("## ")).length;
}

export async function readNote(dir: string, slug: string): Promise<VaultNote | null> {
  const path = join(dir, `${slug}.md`);
  try {
    const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const { meta, body } = parseNote(text);
    return { slug, path, meta, body, mtime: info.mtime };
  } catch {
    return null;
  }
}

/** Every top-level `.md` file in the vault. Missing vault: empty. */
export async function listNotes(dir: string): Promise<VaultNote[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const notes = await Promise.all(
    names.filter((n) => n.endsWith(".md") && !n.startsWith(".")).map((n) => readNote(dir, n.slice(0, -3))),
  );
  return notes.filter((n): n is VaultNote => n !== null);
}

/** Display title: frontmatter title, else the file name. */
export function noteTitle(note: VaultNote): string {
  return note.meta.title || note.slug;
}
