import { type CalloutVariant, parseLearning } from "../shared/learning-parse";
import type { NoteKind } from "../shared/notebook";

/** Section a pinned block lands in. Quizzes and flashcards become review prompts. */
export function sectionFor(kind: NoteKind): "Review" | "Reference" {
  return kind === "quiz" || kind === "flashcards" ? "Review" : "Reference";
}

const CALLOUT_TYPE: Record<CalloutVariant, string> = {
  insight: "info",
  tip: "tip",
  warning: "warning",
  definition: "abstract",
  analogy: "quote",
  example: "example",
};

/** `> ` before every line, `>` alone on blank ones. */
function quote(text: string): string[] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((l) => (l.trim() ? `> ${l}` : ">"));
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** A collapsed `> [!question]-` callout: the first line of `prompt` is the title, the rest goes in the body. */
function questionCallout(prompt: string, answer: string[]): string {
  const [first = "", ...rest] = prompt.trim().split(/\r?\n/);
  const lines = [`> [!question]- ${oneLine(first) || "Question"}`];
  if (rest.join("").trim()) lines.push(...quote(rest.join("\n")), ">");
  lines.push(...answer);
  return lines.join("\n");
}

/** The fence's info string and contents, or null when `body` is not one fenced block. */
export function unfence(body: string): { info: string; code: string } | null {
  const m = /^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n?\1[^\S\n]*$/.exec(body.trim());
  return m ? { info: m[2]!.trim(), code: m[3]! } : null;
}

/**
 * A pinned block as Obsidian markdown, marker first. Learning blocks become callouts, lists
 * and subsections; a block that doesn't parse is kept as its raw fence.
 */
export function toObsidian(kind: NoteKind, title: string, body: string, at: string): string {
  const marker = `<!-- pinned ${at} from Paseo -->`;
  const heading = oneLine(title).replace(/^#+\s*/, "");
  const raw = body.trim();
  const titled = (content: string) => [marker, heading ? `### ${heading}` : null, "", content].filter((l) => l !== null).join("\n");

  if (kind === "note" || kind === "diagram") return titled(raw);

  const fence = unfence(raw);
  const parsed = fence ? parseLearning(fence.info, fence.code) : parseLearning(kind, raw);
  if (!parsed) return titled(raw);

  switch (parsed.kind) {
    case "callout": {
      const label = oneLine(parsed.meta.title ?? title);
      return [marker, `> [!${CALLOUT_TYPE[parsed.variant]}]${label ? ` ${label}` : ""}`, ...quote(parsed.body)].join("\n");
    }
    case "quiz":
      return [
        marker,
        ...parsed.questions.map((q) => {
          const correct = q.options.filter((o) => o.correct).map((o) => oneLine(o.text));
          const answer = [`> **Answer:** ${correct.join("; ")}`];
          if (q.explanation) answer.push(">", ...quote(q.explanation));
          return questionCallout(q.prompt || "Which is correct?", answer);
        }),
      ].join("\n\n");
    case "flashcards":
      return [marker, ...parsed.cards.map((card) => questionCallout(card.front, quote(card.back)))].join("\n\n");
    case "steps":
      return titled(
        parsed.steps
          .map((step, i) => {
            const detail = step.detail.trim() ? `\n${step.detail.trim().split("\n").map((l) => (l ? `   ${l}` : "")).join("\n")}` : "";
            return `${i + 1}. **${step.title}**${detail}`;
          })
          .join("\n"),
      );
    case "compare":
      return [marker, ...parsed.columns.map((col) => `### ${oneLine(col.heading)}\n\n${col.body.trim()}`)].join("\n\n");
  }
}
