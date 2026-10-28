/*
 * Obsidian markdown the shared Markdown renderer doesn't know: the leading tag block,
 * `> [!type]- title` callouts, `![[image]]` embeds, `[[wikilinks]]` and pin markers.
 * The reader splits a note into segments and hands the plain parts to Markdown.
 */

/** Markdown link scheme for `[[wikilinks]]`; the reader intercepts it. */
export const NOTE_SCHEME = "deck-note:";

export type Segment =
  | { type: "markdown"; text: string }
  | { type: "callout"; kind: string; title: string; fold: "" | "+" | "-"; body: string }
  | { type: "embed"; target: string }
  | { type: "pinned"; at: string };

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const TAG_LINE = /^(#[^\s#]+\s*)+$/;
const CALLOUT = /^>\s*\[!([\w-]+)\]([+-]?)\s*(.*)$/;
const EMBED = /^!\[\[([^\]\n]+)\]\]\s*$/;
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const PINNED = /^<!--\s*pinned\s+(\S+).*-->\s*$/;
const COMMENT = /^<!--.*-->\s*$/;

/** Drops frontmatter, the leading `#tag` block and an `# H1` that repeats the title. */
export function stripPreamble(text: string, title: string): string {
  const lines = text.replace(FRONTMATTER, "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length && (!lines[i]!.trim() || TAG_LINE.test(lines[i]!.trim()))) i++;
  const h1 = /^#\s+(.+?)\s*$/.exec(lines[i] ?? "");
  if (h1 && h1[1]!.toLowerCase() === title.toLowerCase()) i++;
  return lines.slice(i).join("\n").replace(/^\s+/, "");
}

/** Splits a note into markdown runs, callouts, image embeds and pin markers. Code fences stay whole. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const lines = text.split(/\r?\n/);
  let run: string[] = [];
  const flush = () => {
    const md = run.join("\n").trim();
    if (md) out.push({ type: "markdown", text: md });
    run = [];
  };
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      run.push(line);
      continue;
    }
    if (fence !== null) {
      run.push(line);
      continue;
    }
    const callout = CALLOUT.exec(line);
    if (callout) {
      flush();
      const body: string[] = [];
      while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1]!)) {
        i++;
        body.push(lines[i]!.replace(/^\s*>\s?/, ""));
      }
      out.push({
        type: "callout",
        kind: callout[1]!.toLowerCase(),
        title: callout[3]!.trim(),
        fold: callout[2] as "" | "+" | "-",
        body: body.join("\n"),
      });
      continue;
    }
    const embed = EMBED.exec(line.trim());
    if (embed && IMAGE.test(linkTarget(embed[1]!))) {
      flush();
      out.push({ type: "embed", target: embed[1]!.trim() });
      continue;
    }
    const pinned = PINNED.exec(line.trim());
    if (pinned) {
      flush();
      out.push({ type: "pinned", at: pinned[1]! });
      continue;
    }
    if (COMMENT.test(line.trim())) continue;
    run.push(line);
  }
  flush();
  return out;
}

/** Target without `|label`, `#heading` or `^block`, as the server keys `links`. */
export function linkTarget(raw: string): string {
  return raw.split("|")[0]!.split("#")[0]!.split("^")[0]!.trim();
}

/**
 * `[[Target|label]]` becomes a markdown link when `links` resolves it, else muted italic text.
 * `![[Note]]` transclusions link to the note; other embeds show their name. Code spans are left alone.
 */
export function linkify(markdown: string, links: Record<string, string | null>): string {
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const f = FENCE.exec(line);
      if (f) {
        if (fence === null) fence = f[1]!;
        else if (f[1]![0] === fence[0]) fence = null;
        return line;
      }
      if (fence !== null) return line;
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) =>
          i % 2 === 1
            ? part
            : part.replace(/(!?)\[\[([^\]\n]+)\]\]/g, (_m, bang: string, inner: string) => {
                const target = linkTarget(inner);
                const pipe = inner.indexOf("|");
                const label = (pipe >= 0 ? inner.slice(pipe + 1) : inner.replace(/#\^?/, " › ")).trim() || target;
                const safe = label.replace(/([\\[\]*_`])/g, "\\$1");
                const id = links[target];
                const text = bang ? `↳ ${safe}` : safe;
                return id ? `[${text}](${NOTE_SCHEME}${encodeHref(id)})` : `*${text}*`;
              }),
        )
        .join("");
    })
    .join("\n");
}

/** Percent-encodes everything markdown link destinations care about, parentheses included. */
function encodeHref(id: string): string {
  return encodeURIComponent(id).replace(/[()'!*~]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** The note id behind a reader link, or null for an ordinary link. */
export function noteHref(href: string): string | null {
  if (!href.startsWith(NOTE_SCHEME)) return null;
  try {
    return decodeURIComponent(href.slice(NOTE_SCHEME.length));
  } catch {
    return null;
  }
}

/** A section title for a pinned reply: its first heading, else its first line. */
export function pinTitle(text: string): { title: string; body: string } {
  const lines = text.trim().split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  const head = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[first] ?? "");
  if (head) {
    return { title: clip(head[1]!), body: lines.slice(first + 1).join("\n").trim() || head[1]! };
  }
  const plain = (lines[first] ?? "")
    .replace(/^\s*(?:[-*+>]|\d+\.)\s+/, "")
    .replace(/[*_`~]/g, "")
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, a: string, b?: string) => b ?? a)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
  return { title: clip(plain) || "Note", body: text.trim() };
}

function clip(s: string, max = 80): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}
