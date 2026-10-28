import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Where the vault lives when the notebookPath setting is empty. */
export const DEFAULT_VAULT = join(homedir(), "Documents", "Paseo Notebook");

/** Folder new notes go in when a pin has no matching note. */
export const PIN_FOLDER = "Paseo Inbox";

const SKIP_FILES = new Set(["claude.md", "agents.md"]);

export function vaultDir(setting: string | undefined): string {
  const raw = (setting ?? "").trim();
  if (!raw) return DEFAULT_VAULT;
  const expanded = raw.startsWith("~") ? join(homedir(), raw.slice(1)) : raw;
  return isAbsolute(expanded) ? expanded : resolve(homedir(), expanded);
}

export async function ensureDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Absolute path for a vault-relative path, or null when it escapes the vault. */
export function safeJoin(vault: string, rel: string): string | null {
  const root = resolve(vault);
  const full = resolve(root, rel);
  return full === root || full.startsWith(root + sep) ? full : null;
}

/** Note id → absolute `.md` path, or null when it escapes the vault. */
export function notePath(vault: string, id: string): string | null {
  return safeJoin(vault, `${id}.md`);
}

/** A title usable as a file name (Obsidian forbids these characters in link targets). */
export function fileNameFor(title: string): string {
  const name = title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  return name || "Untitled";
}

export interface VaultNote {
  /** Vault-relative path without `.md`, `/`-separated. */
  id: string;
  title: string;
  folder: string;
  path: string;
  tags: string[];
  /** Full file contents. */
  text: string;
  mtime: Date;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const TAG = /(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

/** Tags from YAML frontmatter `tags` and the leading `#tag #tag` block. */
export function parseTags(text: string): string[] {
  const tags = new Set<string>();
  let rest = text;
  const fm = FRONTMATTER.exec(text);
  if (fm) {
    rest = text.slice(fm[0].length);
    const inline = /^tags:\s*\[?(.*?)\]?\s*$/m.exec(fm[1]!);
    if (inline?.[1]) for (const t of inline[1].split(",")) addTag(tags, t);
    const block = /^tags:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m.exec(fm[1]!);
    if (block) for (const line of block[1]!.split(/\r?\n/)) addTag(tags, line.replace(/^\s*-\s*/, ""));
  }
  for (const line of rest.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!/^(#[^\s#]+\s*)+$/.test(trimmed)) break;
    for (const m of trimmed.matchAll(TAG)) tags.add(m[1]!);
  }
  return [...tags];
}

function addTag(tags: Set<string>, raw: string) {
  const t = raw.trim().replace(/^["']|["']$/g, "").replace(/^#/, "");
  if (t) tags.add(t);
}

export interface WikiLink {
  /** Target as written, without `|label`, `#heading` or `^block`. */
  target: string;
  embed: boolean;
}

/** Wikilinks in order of appearance, ignoring ones inside fenced or inline code. */
export function wikiLinks(markdown: string): WikiLink[] {
  const prose = markdown.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\S\n]*$/gm, "").replace(/`[^`\n]*`/g, "");
  const out: WikiLink[] = [];
  for (const m of prose.matchAll(/(!?)\[\[([^\]\n]+)\]\]/g)) {
    const target = m[2]!.split("|")[0]!.split("#")[0]!.split("^")[0]!.trim();
    if (target) out.push({ target, embed: m[1] === "!" });
  }
  return out;
}

/** True for a link target that names a file other than a note (`figure.png`, `paper.pdf`). */
export function isAssetTarget(target: string): boolean {
  const ext = extname(target).toLowerCase();
  return ext !== "" && ext !== ".md" && /^\.[a-z0-9]{1,5}$/.test(ext);
}

/** Links between notes: wikilinks minus assets (`[[paper.pdf]]`, `![[figure.png]]`). */
export function noteLinks(markdown: string): string[] {
  return wikiLinks(markdown)
    .filter((l) => !isAssetTarget(l.target))
    .map((l) => l.target);
}

/** `## ` headings in order. */
export function sectionHeadings(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.startsWith("## "))
    .map((l) => l.slice(3).trim());
}

/** Resolves wikilink targets the way Obsidian does: by path suffix, else by file name. */
export class LinkResolver {
  private byTitle = new Map<string, VaultNote[]>();
  private byId = new Map<string, VaultNote>();

  constructor(notes: VaultNote[]) {
    for (const note of notes) {
      this.byId.set(note.id.toLowerCase(), note);
      const key = note.title.toLowerCase();
      const list = this.byTitle.get(key) ?? [];
      list.push(note);
      this.byTitle.set(key, list);
    }
  }

  /** `from` breaks ties in favour of the note closest to the linking note. */
  resolve(target: string, from?: VaultNote): VaultNote | null {
    const clean = target.replace(/\.md$/i, "").replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
    if (!clean) return null;
    if (clean.includes("/")) {
      const exact = this.byId.get(clean);
      if (exact) return exact;
      const tail = `/${clean}`;
      for (const [id, note] of this.byId) if (id.endsWith(tail)) return note;
      return null;
    }
    const candidates = this.byTitle.get(clean);
    if (!candidates?.length) return null;
    if (candidates.length === 1 || !from) return candidates[0]!;
    return [...candidates].sort((a, b) => sharedPrefix(b.folder, from.folder) - sharedPrefix(a.folder, from.folder))[0]!;
  }
}

function sharedPrefix(a: string, b: string): number {
  const pa = a.split("/");
  const pb = b.split("/");
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  return i;
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(root, full, out);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md") && !SKIP_FILES.has(entry.name.toLowerCase())) {
        out.push(full);
      }
    }),
  );
}

export async function readNoteAt(vault: string, path: string): Promise<VaultNote | null> {
  try {
    const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const id = relative(resolve(vault), path).split(sep).join("/").replace(/\.md$/i, "");
    const folder = dirname(id) === "." ? "" : dirname(id);
    return { id, title: basename(id), folder, path, tags: parseTags(text), text, mtime: info.mtime };
  } catch {
    return null;
  }
}

export async function readNote(vault: string, id: string): Promise<VaultNote | null> {
  const path = notePath(vault, id);
  return path ? readNoteAt(vault, path) : null;
}

/** Every note in the vault, sorted by id. Missing vault: empty. */
export async function listNotes(vault: string): Promise<VaultNote[]> {
  const paths: string[] = [];
  await walk(resolve(vault), resolve(vault), paths);
  const notes = await Promise.all(paths.map((p) => readNoteAt(vault, p)));
  return notes.filter((n): n is VaultNote => n !== null).sort((a, b) => a.id.localeCompare(b.id));
}

export function isMapTitle(title: string): boolean {
  return /\s[—–-]\s*map$/i.test(title);
}

/**
 * Appends `content` to the end of the `## heading` section. The vault's templates separate
 * sections with `---`, so the content goes before a trailing divider. A missing section is
 * added before `## Glossary`, else at the end of the note.
 */
export function appendToSection(text: string, heading: string, content: string): string {
  const lines = text.replace(/\s+$/, "").split(/\r?\n/);
  const isHeading = (l: string) => /^##\s/.test(l);
  const start = lines.findIndex((l) => isHeading(l) && l.slice(3).trim().toLowerCase() === heading.toLowerCase());
  const block = content.replace(/\s+$/, "").split("\n");
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && !isHeading(lines[end]!)) end++;
    let insert = end;
    while (insert > start + 1 && (lines[insert - 1]!.trim() === "" || /^-{3,}\s*$/.test(lines[insert - 1]!))) insert--;
    lines.splice(insert, 0, "", ...block);
    return `${lines.join("\n")}\n`;
  }
  const section = ["## " + heading, "", ...block, "", "---", ""];
  const glossary = lines.findIndex((l) => isHeading(l) && /^glossary$/i.test(l.slice(3).trim()));
  if (glossary >= 0) {
    lines.splice(glossary, 0, ...section);
    return `${lines.join("\n")}\n`;
  }
  const tail = /^-{3,}\s*$/.test(lines[lines.length - 1] ?? "") ? [] : ["", "---"];
  return `${[...lines, ...tail, "", ...section.slice(0, -2)].join("\n")}\n`;
}
