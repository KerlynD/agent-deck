import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, type TextStyle, View } from "react-native";
import { notebookPinRpc } from "../../shared/notebook";
import { deckSettings } from "../../shared/settings";
import { CodeView } from "../code-view";
import { alpha, type Colors, MONO } from "../ui-kit";
import {
  type Callout,
  type CalloutVariant,
  type Compare,
  type Flashcards,
  fenced,
  KIND_BY_LANG,
  type Parsed,
  parseLearning,
  type Quiz,
  type Steps,
  titleFor,
} from "../../shared/learning-parse";

/** Fence languages drawn as learning cards. */
export const LEARNING_LANGS = new Set<string>(Object.keys(KIND_BY_LANG));

/** Renders markdown inside a card. Passed in by markdown.tsx so this file does not import it back. */
export type RenderMarkdown = (text: string, opts?: { dim?: boolean }) => ReactNode;

export interface LearningBlockProps {
  theme: PluginTheme;
  /** Lowercased fence language, one of LEARNING_LANGS. */
  lang: string;
  /** Full fence info string, e.g. "callout tip". Defaults to `lang`. */
  info?: string;
  code: string;
  /** Still streaming: the block may be unfinished. */
  streaming: boolean;
  /** Agent whose reply holds the block, for pinning. */
  agentId?: string;
  /** Plain source view, for unparsable blocks and the `src` toggle. */
  fallback: ReactNode;
  renderMarkdown: RenderMarkdown;
}

const LABEL = 11.5;

interface Env {
  theme: PluginTheme;
  md: RenderMarkdown;
}

/* -------------------------------------------------------------- pieces */

/** Short inline text: `code`, **bold** and [[wikilinks]], for options, titles and headings. */
function Inline({ text, c, style }: { text: string; c: Colors; style?: TextStyle }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g).filter(Boolean);
  return (
    <Text style={[{ color: c.foreground, fontSize: 13.5, lineHeight: 20 }, style]}>
      {parts.map((p, i) => {
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
          return (
            <Text key={i} style={{ fontFamily: MONO, fontSize: 12.5, color: c.accent, backgroundColor: alpha(c.surface2, 0.7) }}>
              {` ${p.slice(1, -1)} `}
            </Text>
          );
        }
        if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
          return (
            <Text key={i} style={{ fontWeight: "700" }}>
              {p.slice(2, -2)}
            </Text>
          );
        }
        if (p.startsWith("[[") && p.endsWith("]]")) {
          const [target, label] = p.slice(2, -2).split("|");
          return (
            <Text key={i} style={{ color: c.accent }}>
              {label ?? target}
            </Text>
          );
        }
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}

function Button({
  c,
  label,
  onPress,
  disabled,
  color,
  a11y = label,
}: {
  c: Colors;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  a11y?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        height: 24,
        paddingHorizontal: 8,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: disabled ? alpha(c.border, 0.5) : (color ?? c.border),
        backgroundColor: pressed ? alpha(c.surface2, 0.8) : "transparent",
      })}
    >
      <Text style={{ fontFamily: MONO, fontSize: LABEL, color: disabled ? alpha(c.foregroundMuted, 0.5) : (color ?? c.foreground) }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Counter({ c, text }: { c: Colors; text: string }) {
  return <Text style={{ fontFamily: MONO, fontSize: LABEL, color: c.foregroundMuted }}>{text}</Text>;
}

function Progress({ c, value, color }: { c: Colors; value: number; color?: string }) {
  return (
    <View style={{ height: 3, backgroundColor: alpha(c.border, 0.7) }}>
      <View style={{ height: 3, width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, backgroundColor: color ?? c.accent }} />
    </View>
  );
}

/* ------------------------------------------------------------- callout */

const CALLOUT_STYLE: Record<CalloutVariant, { icon: string; color: (c: Colors) => string }> = {
  insight: { icon: "✦", color: (c) => c.accent },
  tip: { icon: "➜", color: (c) => c.statusSuccess },
  warning: { icon: "▲", color: (c) => c.statusWarning },
  definition: { icon: "≡", color: (c) => c.accent },
  analogy: { icon: "≈", color: (c) => c.foregroundMuted },
  example: { icon: "▸", color: (c) => c.statusSuccess },
};

function CalloutBody({ block, env }: { block: Callout; env: Env }) {
  return <View style={{ padding: 12 }}>{env.md(block.body)}</View>;
}

/* ---------------------------------------------------------------- quiz */

function QuizBody({ block, env }: { block: Quiz; env: Env }) {
  const c = env.theme.colors;
  const [answers, setAnswers] = useState<(number | null)[]>(() => block.questions.map(() => null));
  // A re-parse with a different number of questions resets the answers.
  useEffect(() => setAnswers(block.questions.map(() => null)), [block]);

  const answered = answers.filter((a) => a !== null).length;
  const score = answers.filter((a, q) => a !== null && block.questions[q]?.options[a]?.correct).length;
  const done = answered === block.questions.length;
  const multi = block.questions.length > 1;

  return (
    <View style={{ padding: 12, gap: 16 }}>
      {block.questions.map((question, q) => {
        const chosen = answers[q] ?? null;
        const right = chosen !== null && question.options[chosen]?.correct;
        return (
          <View key={q} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {multi ? <Text style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 20, color: c.accent }}>{`Q${q + 1}`}</Text> : null}
              <View style={{ flex: 1 }}>{question.prompt ? env.md(question.prompt) : null}</View>
            </View>
            <View style={{ gap: 6 }}>
              {question.options.map((option, o) => {
                const picked = chosen === o;
                const reveal = chosen !== null && option.correct;
                const tone = picked ? (option.correct ? c.statusSuccess : c.statusDanger) : reveal ? c.statusSuccess : null;
                const mark = picked ? (option.correct ? "[✓]" : "[✗]") : reveal ? "[✓]" : "[ ]";
                return (
                  <Pressable
                    key={o}
                    accessibilityRole="button"
                    accessibilityLabel={`Answer: ${option.text}`}
                    accessibilityState={{ disabled: chosen !== null, selected: picked }}
                    disabled={chosen !== null}
                    onPress={() => setAnswers((prev) => prev.map((a, i) => (i === q ? o : a)))}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      gap: 8,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderWidth: 1,
                      borderColor: tone ?? c.border,
                      backgroundColor: tone ? alpha(tone, 0.12) : pressed ? alpha(c.surface2, 0.8) : "transparent",
                      opacity: chosen !== null && !tone ? 0.6 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 20, color: tone ?? c.foregroundMuted }}>{mark}</Text>
                    <Inline text={option.text} c={c} style={{ flex: 1 }} />
                  </Pressable>
                );
              })}
            </View>
            {chosen !== null ? (
              <View style={{ gap: 4, borderLeftWidth: 2, borderColor: right ? c.statusSuccess : c.statusDanger, paddingLeft: 10 }}>
                <Text style={{ fontFamily: MONO, fontSize: LABEL, color: right ? c.statusSuccess : c.statusDanger }}>
                  {right ? "✓ correct" : "✗ not quite"}
                </Text>
                {question.explanation ? env.md(question.explanation, { dim: true }) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Counter c={c} text={done ? `score ${score} / ${block.questions.length}` : `answered ${answered} / ${block.questions.length}`} />
          <Progress c={c} value={answered / block.questions.length} color={done ? (score === block.questions.length ? c.statusSuccess : c.accent) : c.accent} />
        </View>
        {answered > 0 ? <Button c={c} label="retry" onPress={() => setAnswers(block.questions.map(() => null))} a11y="Retry quiz" /> : null}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------- flashcards */

function FlashcardsBody({ block, env }: { block: Flashcards; env: Env }) {
  const c = env.theme.colors;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [all, setAll] = useState(false);
  const total = block.cards.length;
  const at = Math.min(index, total - 1);
  const card = block.cards[at]!;
  const go = (to: number) => {
    setIndex(Math.max(0, Math.min(total - 1, to)));
    setFlipped(false);
  };

  if (all) {
    return (
      <View style={{ padding: 12, gap: 10 }}>
        {block.cards.map((item, i) => (
          <View key={i} style={{ borderWidth: 1, borderColor: c.border }}>
            <View style={{ padding: 10, backgroundColor: alpha(c.surface2, 0.4) }}>{env.md(item.front)}</View>
            <View style={{ padding: 10, borderTopWidth: 1, borderColor: alpha(c.border, 0.7) }}>{env.md(item.back, { dim: true })}</View>
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Button c={c} label="one at a time" onPress={() => setAll(false)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ padding: 12, gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={flipped ? "Show front" : "Show back"}
        onPress={() => setFlipped((f) => !f)}
        style={{
          minHeight: 120,
          padding: 16,
          gap: 8,
          justifyContent: "center",
          borderWidth: 1,
          borderColor: flipped ? c.accent : c.border,
          backgroundColor: flipped ? alpha(c.accent, 0.08) : alpha(c.surface2, 0.4),
        }}
      >
        <Text style={{ position: "absolute", top: 6, left: 10, fontFamily: MONO, fontSize: 10.5, color: flipped ? c.accent : c.foregroundMuted }}>
          {flipped ? "back" : "front"}
        </Text>
        <View style={{ alignItems: "center" }}>{env.md(flipped ? card.back : card.front)}</View>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button c={c} label="‹ prev" onPress={() => go(at - 1)} disabled={at === 0} a11y="Previous card" />
        <Button c={c} label="flip" onPress={() => setFlipped((f) => !f)} a11y="Flip card" />
        <Button c={c} label="next ›" onPress={() => go(at + 1)} disabled={at === total - 1} a11y="Next card" />
        <View style={{ flex: 1 }} />
        <Counter c={c} text={`${at + 1} / ${total}`} />
        {total > 1 ? <Button c={c} label="show all" onPress={() => setAll(true)} a11y="Show all cards" /> : null}
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- steps */

function StepsBody({ block, env }: { block: Steps; env: Env }) {
  const c = env.theme.colors;
  const total = block.steps.length;
  const [shown, setShown] = useState(1);
  const count = Math.min(shown, total);
  const width = String(total).length;

  return (
    <View style={{ padding: 12, gap: 12 }}>
      <Progress c={c} value={count / total} color={count === total ? c.statusSuccess : c.accent} />
      {block.steps.slice(0, count).map((step, i) => {
        const current = i === count - 1 && count < total;
        return (
          <View key={i} style={{ flexDirection: "row", gap: 10 }}>
            <Text style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 20, color: current ? c.accent : c.statusSuccess, minWidth: 8 * width + 14 }}>
              {`${String(i + 1).padStart(width, "0")}.`}
            </Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Inline text={step.title} c={c} style={{ fontWeight: "700" }} />
              {step.detail ? env.md(step.detail, { dim: !current && count < total }) : null}
            </View>
          </View>
        );
      })}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Counter c={c} text={`step ${count} / ${total}`} />
        <View style={{ flex: 1 }} />
        {count < total ? (
          <>
            <Button c={c} label="next ›" onPress={() => setShown(count + 1)} a11y="Next step" />
            <Button c={c} label="show all" onPress={() => setShown(total)} a11y="Show all steps" />
          </>
        ) : total > 1 ? (
          <Button c={c} label="reset" onPress={() => setShown(1)} a11y="Start steps over" />
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- compare */

const COLUMN_MIN = 200;

function CompareBody({ block, env }: { block: Compare; env: Env }) {
  const c = env.theme.colors;
  const [width, setWidth] = useState(0);
  const wide = width >= block.columns.length * COLUMN_MIN;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: wide ? "row" : "column" }}>
      {block.columns.map((col, i) => {
        const last = i === block.columns.length - 1;
        return (
          <View
            key={i}
            style={{
              flex: wide ? 1 : undefined,
              borderColor: c.border,
              borderRightWidth: wide && !last ? 1 : 0,
              borderBottomWidth: !wide && !last ? 1 : 0,
            }}
          >
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderColor: alpha(c.border, 0.7), backgroundColor: alpha(c.surface2, 0.4) }}>
              <Inline text={col.heading} c={c} style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: "700", color: c.accent }} />
            </View>
            <View style={{ padding: 12 }}>{col.body ? env.md(col.body) : null}</View>
          </View>
        );
      })}
    </View>
  );
}

/* ---------------------------------------------------------------- card */

type PinState = { status: "idle" | "busy" | "done" } | { status: "error"; message: string };

function usePin(block: Parsed, info: string, code: string, agentId: string | undefined) {
  const call = useRpc(notebookPinRpc);
  const [state, setState] = useState<PinState>({ status: "idle" });
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const pin = () => {
    if (state.status === "busy") return;
    setState({ status: "busy" });
    let request: Promise<unknown>;
    try {
      request = call({
        kind: block.kind,
        title: titleFor(block).slice(0, 300),
        body: fenced(info, code).slice(0, 60_000),
        topic: block.meta.topic?.slice(0, 200),
        agentId,
      });
    } catch (err) {
      request = Promise.reject(err);
    }
    request.then(
      () => alive.current && setState({ status: "done" }),
      (err: unknown) => alive.current && setState({ status: "error", message: err instanceof Error ? err.message : String(err) }),
    );
  };
  return { state, pin };
}

function Card({
  block,
  info,
  code,
  agentId,
  env,
}: {
  block: Parsed;
  info: string;
  code: string;
  agentId?: string;
  env: Env;
}) {
  const c = env.theme.colors;
  const [source, setSource] = useState(false);
  const { state, pin } = usePin(block, info, code, agentId);
  const callout = block.kind === "callout" ? CALLOUT_STYLE[block.variant] : null;
  const tone = callout ? callout.color(c) : null;
  const kindLabel = block.kind === "callout" ? `${CALLOUT_STYLE[block.variant].icon} ${block.variant}` : block.kind;

  const headerButton = (label: string, onPress: () => void, color: string, a11y: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={8}>
      <Text style={{ fontFamily: MONO, fontSize: LABEL, color }}>{label}</Text>
    </Pressable>
  );

  const pinLabel =
    state.status === "busy" ? "pinning…" : state.status === "done" ? "📌 pinned" : state.status === "error" ? "📌 retry" : "📌 pin";
  const pinColor =
    state.status === "done" ? c.statusSuccess : state.status === "error" ? c.statusDanger : c.foregroundMuted;

  let body: ReactNode;
  switch (block.kind) {
    case "callout":
      body = <CalloutBody block={block} env={env} />;
      break;
    case "quiz":
      body = <QuizBody block={block} env={env} />;
      break;
    case "flashcards":
      body = <FlashcardsBody block={block} env={env} />;
      break;
    case "steps":
      body = <StepsBody block={block} env={env} />;
      break;
    case "compare":
      body = <CompareBody block={block} env={env} />;
      break;
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        borderLeftWidth: tone ? 3 : 1,
        borderLeftColor: tone ?? c.border,
        backgroundColor: tone ? alpha(tone, 0.05) : alpha(c.surface2, 0.35),
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 26,
          paddingHorizontal: 10,
          borderBottomWidth: 1,
          borderColor: c.border,
          backgroundColor: alpha(c.surface2, 0.5),
        }}
      >
        <Text style={{ flex: 1, fontFamily: MONO, fontSize: LABEL, color: c.foregroundMuted }} numberOfLines={1}>
          <Text style={{ color: tone ?? c.accent }}>{kindLabel}</Text>
          {block.meta.title ? <Text style={{ color: c.foreground }}>{`  ${block.meta.title}`}</Text> : null}
          {block.meta.topic ? <Text>{`  · ${block.meta.topic}`}</Text> : null}
        </Text>
        {headerButton("src", () => setSource((s) => !s), source ? c.foreground : c.foregroundMuted, source ? "Show card" : "Show source")}
        {headerButton(pinLabel, pin, pinColor, "Pin to notebook")}
      </View>
      {state.status === "error" ? (
        <Text style={{ paddingHorizontal: 10, paddingTop: 6, fontFamily: MONO, fontSize: 11, color: c.statusDanger }} numberOfLines={2}>
          ✗ pin failed: {state.message}
        </Text>
      ) : null}
      {/* CodeView brings its own border; overlap it with ours. */}
      {source ? (
        <View style={{ margin: -1 }}>
          <CodeView theme={env.theme} code={code} startLine={false} plain />
        </View>
      ) : (
        body
      )}
    </View>
  );
}

/* ---------------------------------------------------------------- view */

export const LearningBlock = memo(function LearningBlock({
  theme,
  lang,
  info,
  code,
  streaming,
  agentId,
  fallback,
  renderMarkdown,
}: LearningBlockProps) {
  const settings = useSettings(deckSettings);
  const enabled = settings.status !== "ready" || settings.values.chatLearning;
  const fullInfo = info?.trim() || lang;
  const parsed = useMemo(
    () => (streaming || !enabled ? null : parseLearning(fullInfo, code)),
    [fullInfo, code, streaming, enabled],
  );
  const env = useMemo<Env>(() => ({ theme, md: renderMarkdown }), [theme, renderMarkdown]);

  // Disabled, still streaming, or nothing to draw: the source is the best view.
  if (!parsed) return <>{fallback}</>;
  return <Card block={parsed} info={fullInfo} code={code} agentId={agentId} env={env} />;
});
