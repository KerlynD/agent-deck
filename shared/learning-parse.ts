/*
 * Parsers for learning blocks. Line-based and forgiving: agents write these by hand,
 * so unknown lines are kept as text where that makes sense and dropped otherwise.
 * Every parser returns null when the block has nothing to draw; the caller then
 * shows the source instead. Grammar: docs/learning-blocks.md.
 */

export type LearningKind = "callout" | "quiz" | "flashcards" | "steps" | "compare";

export const CALLOUT_VARIANTS = ["insight", "tip", "warning", "definition", "analogy", "example"] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

/** Fence language to block kind, aliases included. */
export const KIND_BY_LANG: Record<string, LearningKind> = {
  callout: "callout",
  quiz: "quiz",
  flashcards: "flashcards",
  flashcard: "flashcards",
  steps: "steps",
  compare: "compare",
};

export interface Meta {
  topic?: string;
  title?: string;
}

export interface Callout {
  kind: "callout";
  variant: CalloutVariant;
  body: string;
}

export interface QuizOption {
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  prompt: string;
  options: QuizOption[];
  explanation?: string;
}

export interface Quiz {
  kind: "quiz";
  questions: QuizQuestion[];
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface Flashcards {
  kind: "flashcards";
  cards: Flashcard[];
}

export interface Step {
  title: string;
  detail: string;
}

export interface Steps {
  kind: "steps";
  steps: Step[];
}

export interface CompareColumn {
  heading: string;
  body: string;
}

export interface Compare {
  kind: "compare";
  columns: CompareColumn[];
}

export type LearningBody = Callout | Quiz | Flashcards | Steps | Compare;
export type Parsed = LearningBody & { meta: Meta };

const META = /^(topic|title)\s*:\s*(.*)$/i;

/** Splits leading `topic:` / `title:` lines (blank lines between them allowed) off the body. */
export function splitMeta(code: string): { meta: Meta; lines: string[] } {
  const lines = code.replace(/\r\n?/g, "\n").split("\n");
  const meta: Meta = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const m = META.exec(line);
    if (!m) break;
    const value = m[2]!.trim();
    if (value) meta[m[1]!.toLowerCase() as keyof Meta] = value;
  }
  return { meta, lines: lines.slice(i) };
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start]!.trim()) start++;
  while (end > start && !lines[end - 1]!.trim()) end--;
  return lines.slice(start, end);
}

/** Removes the common leading indentation, so indented detail reads as markdown, not code. */
function dedent(lines: string[]): string {
  const body = trimBlank(lines);
  const indents = body.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return body.map((l) => l.slice(Math.min(cut, /^\s*/.exec(l)![0].length))).join("\n");
}

/* ------------------------------------------------------------- callout */

function parseCallout(info: string, lines: string[]): Callout | null {
  const word = info.split(/\s+/)[1]?.toLowerCase() ?? "";
  // Forgiving about plurals and near misses: "tips", "warn", "note".
  const variant =
    CALLOUT_VARIANTS.find((v) => v === word || v === word.replace(/s$/, "") || (word.length >= 4 && v.startsWith(word))) ??
    (word === "note" || word === "info" ? "insight" : word === "caution" || word === "danger" ? "warning" : "insight");
  const body = dedent(lines);
  return body ? { kind: "callout", variant, body } : null;
}

/* ---------------------------------------------------------------- quiz */

const QUESTION = /^(?:q(?:uestion)?\s*\d*\s*[:.)])\s*(.*)$/i;
const OPTION = /^(?:[-*+]\s*)?\[([ xX✓✔]?)\]\s*(.*)$/;
const EXPLANATION = /^>\s?(.*)$/;

function parseQuiz(lines: string[]): Quiz | null {
  const questions: QuizQuestion[] = [];
  let current: QuizQuestion | null = null;
  const explain: string[] = [];
  const finish = () => {
    if (!current) return;
    if (explain.length) current.explanation = explain.join("\n").trim() || undefined;
    explain.length = 0;
    current.prompt = current.prompt.trim();
    if (current.options.length >= 2 && current.options.some((o) => o.correct)) questions.push(current);
    current = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const q = QUESTION.exec(line);
    if (q) {
      finish();
      current = { prompt: q[1] ?? "", options: [] };
      continue;
    }
    const o = OPTION.exec(line);
    if (o) {
      // An option with no question line before it starts an untitled question.
      if (!current) current = { prompt: "", options: [] };
      current.options.push({ text: o[2]!.trim(), correct: o[1] !== "" && o[1] !== " " });
      continue;
    }
    const e = EXPLANATION.exec(line);
    if (e && current) {
      explain.push(e[1] ?? "");
      continue;
    }
    if (!current) current = { prompt: line, options: [] };
    else if (!current.options.length) current.prompt += `\n${line}`;
    else explain.push(line);
  }
  finish();
  return questions.length ? { kind: "quiz", questions } : null;
}

/* ---------------------------------------------------------- flashcards */

const FRONT = /^(?:q|front)\s*:\s*(.*)$/i;
const BACK = /^(?:a|back)\s*:\s*(.*)$/i;

function parseFlashcards(lines: string[]): Flashcards | null {
  const cards: Flashcard[] = [];
  let pending: { front: string; back: string | null } | null = null;
  const finish = () => {
    if (pending && pending.back !== null && pending.front.trim() && pending.back.trim()) {
      cards.push({ front: pending.front.trim(), back: pending.back.trim() });
    }
    pending = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const split = line.indexOf("::");
    if (split > 0) {
      finish();
      const front = line.slice(0, split).replace(/^[-*+]\s+/, "").trim();
      const back = line.slice(split + 2).trim();
      if (front && back) cards.push({ front, back });
      continue;
    }
    const f = FRONT.exec(line);
    if (f) {
      finish();
      pending = { front: f[1] ?? "", back: null };
      continue;
    }
    const b = BACK.exec(line);
    if (b && pending) {
      pending.back = b[1] ?? "";
      continue;
    }
    // Continuation of whichever side is open.
    if (pending) {
      if (pending.back === null) pending.front += `\n${line}`;
      else pending.back += `\n${line}`;
    }
  }
  finish();
  return cards.length ? { kind: "flashcards", cards } : null;
}

/* --------------------------------------------------------------- steps */

const STEP = /^(\d+)[.)]\s+(.*)$/;

function parseSteps(lines: string[]): Steps | null {
  const steps: { title: string; detail: string[] }[] = [];
  for (const raw of lines) {
    // Only unindented numbers start a step, so a numbered list inside a detail stays put.
    const m = /^\s{0,1}\S/.test(raw) ? STEP.exec(raw.trim()) : null;
    if (m) {
      steps.push({ title: m[2]!.trim(), detail: [] });
      continue;
    }
    const last = steps[steps.length - 1];
    if (last) last.detail.push(raw);
  }
  const out = steps.filter((s) => s.title).map((s) => ({ title: s.title, detail: dedent(s.detail) }));
  return out.length ? { kind: "steps", steps: out } : null;
}

/* ------------------------------------------------------------- compare */

const COLUMN = /^#{1,4}\s+(.*)$/;

function parseCompare(lines: string[]): Compare | null {
  const columns: { heading: string; body: string[] }[] = [];
  for (const raw of lines) {
    const m = COLUMN.exec(raw.trim());
    if (m) {
      columns.push({ heading: m[1]!.trim(), body: [] });
      continue;
    }
    columns[columns.length - 1]?.body.push(raw);
  }
  const out = columns.filter((c) => c.heading).map((c) => ({ heading: c.heading, body: dedent(c.body) }));
  return out.length >= 2 ? { kind: "compare", columns: out } : null;
}

/* ---------------------------------------------------------------- api */

/** Parses a learning block. `info` is the full fence info string, e.g. "callout tip". */
export function parseLearning(info: string, code: string): Parsed | null {
  const lang = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const kind = KIND_BY_LANG[lang];
  if (!kind) return null;
  const { meta, lines } = splitMeta(code);
  const body =
    kind === "callout"
      ? parseCallout(info.trim(), lines)
      : kind === "quiz"
        ? parseQuiz(lines)
        : kind === "flashcards"
          ? parseFlashcards(lines)
          : kind === "steps"
            ? parseSteps(lines)
            : parseCompare(lines);
  return body ? { ...body, meta } : null;
}

/** Strips markdown decoration for one-line labels. */
export function plainLine(s: string, max = 120): string {
  const line = s
    .split("\n")
    .find((l) => l.trim())
    ?.replace(/[*_`#>]/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a: string, b?: string) => b ?? a)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A short heading for the notebook section. */
export function titleFor(block: Parsed): string {
  if (block.meta.title) return plainLine(block.meta.title, 300);
  switch (block.kind) {
    case "callout":
      return plainLine(block.body) || block.variant;
    case "quiz":
      return `Quiz: ${plainLine(block.questions[0]!.prompt) || `${block.questions.length} questions`}`;
    case "flashcards":
      return `Flashcards: ${plainLine(block.cards[0]!.front)}${block.cards.length > 1 ? ` and ${block.cards.length - 1} more` : ""}`;
    case "steps":
      return `Steps: ${plainLine(block.steps[0]!.title)}`;
    case "compare":
      return block.columns.map((c) => plainLine(c.heading, 60)).join(" vs ");
  }
}

/** The block as fenced markdown, with a fence longer than any backtick run inside it. */
export function fenced(info: string, code: string): string {
  const longest = Math.max(2, ...(code.match(/`{3,}/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${info.trim()}\n${code.replace(/\n+$/, "")}\n${fence}`;
}
