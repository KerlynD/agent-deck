/** Markdown link scheme for `[[Topic]]` links inside the reader. */
export const TOPIC_SCHEME = "deck-topic:";

const FENCE = /^\s{0,3}(```|~~~)/;

/** Calls `visit` for every line outside code fences; fenced lines pass through. */
function mapProse(markdown: string, visit: (line: string) => string): string {
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const f = FENCE.exec(line);
      if (f) {
        if (fence === null) fence = f[1]!;
        else if (f[1] === fence) fence = null;
        return line;
      }
      return fence === null ? visit(line) : line;
    })
    .join("\n");
}

/** `[[Title]]` and `[[Title|label]]` become markdown links the reader can intercept. Code is left alone. */
export function linkTopics(markdown: string): string {
  return mapProse(markdown, (line) =>
    line
      .split(/(`+[^`]*`+)/)
      .map((part, i) =>
        i % 2 === 1
          ? part
          : part.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_m, target: string, label?: string) => {
              const text = (label ?? "").trim() || target.trim();
              return `[${text}](${TOPIC_SCHEME}${encodeURIComponent(target.trim())})`;
            }),
      )
      .join(""),
  );
}

/** The `[[target]]` of a reader link, or null for an ordinary link. */
export function topicTarget(href: string): string | null {
  if (!href.startsWith(TOPIC_SCHEME)) return null;
  try {
    return decodeURIComponent(href.slice(TOPIC_SCHEME.length));
  } catch {
    return href.slice(TOPIC_SCHEME.length);
  }
}

export interface PinMeta {
  at: string;
  kind: string;
  agent?: string;
}

export interface Section {
  /** Heading plus body, pin marker removed. Empty heading for text before the first `##`. */
  markdown: string;
  meta: PinMeta | null;
}

const MARKER = /^<!--\s*pinned\s+(\S+)\s+kind=(\S+)(?:\s+agent=(\S+))?\s*-->\s*$/;

/** Splits a topic body at its `## ` headings and lifts each pin marker into `meta`. */
export function splitSections(body: string): Section[] {
  const groups: string[][] = [[]];
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const f = FENCE.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (f[1] === fence) fence = null;
    } else if (fence === null && line.startsWith("## ")) {
      groups.push([]);
    }
    groups[groups.length - 1]!.push(line);
  }
  const out: Section[] = [];
  groups.forEach((lines, index) => {
    let meta: PinMeta | null = null;
    if (index > 0) {
      const at = lines.findIndex((l, i) => i > 0 && l.trim() !== "");
      const m = at > 0 ? MARKER.exec(lines[at]!.trim()) : null;
      if (m) {
        meta = { at: m[1]!, kind: m[2]!, agent: m[3] };
        lines.splice(at, 1);
      }
    }
    const markdown = lines.join("\n").trim();
    if (markdown || meta) out.push({ markdown, meta });
  });
  return out;
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
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
  return { title: clip(plain) || "Note", body: text.trim() };
}

function clip(s: string, max = 80): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}
