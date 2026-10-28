import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { HighlightToken } from "../shared/highlight";
import { useHighlight, useSyntaxTheme } from "./highlight";
import { alpha, MONO } from "./ui-kit";
import { canCopy, copyToClipboard } from "./web";

export type LineKind = "add" | "del" | "ctx" | "hunk" | "meta";

export interface CodeViewProps {
  theme: PluginTheme;
  code: string;
  lang?: string;
  filename?: string;
  /** First line number, or false to hide the gutter. */
  startLine?: number | false;
  /** Per-line diff kinds, same length as the code's lines. Turns on the +/- gutter. */
  kinds?: readonly LineKind[];
  /** Explicit line numbers (diffs), overriding startLine. null hides the number on that line. */
  numbers?: readonly (number | null)[];
  maxHeight?: number;
  /** Label in the header bar. Omit for no header. */
  label?: string;
  /** Skip highlighting (for example while a block is still streaming). */
  plain?: boolean;
  wrap?: boolean;
}

const FONT = 12.5;
const LINE = 19;

/** React Native has no tab-size; show tabs as four spaces. */
function detab(s: string): string {
  return s.includes("\t") ? s.replace(/\t/g, "    ") : s;
}

function TokenLine({ tokens, fallback, fg }: { tokens: HighlightToken[] | undefined; fallback: string; fg: string }) {
  if (!tokens) return <Text style={{ color: fg }}>{fallback.length ? fallback : " "}</Text>;
  if (tokens.length === 0) return <Text style={{ color: fg }}> </Text>;
  return (
    <>
      {tokens.map((tok, i) => (
        <Text
          key={i}
          style={{
            color: tok.c ?? fg,
            fontStyle: tok.s && tok.s & 1 ? "italic" : "normal",
            fontWeight: tok.s && tok.s & 2 ? "700" : "400",
          }}
        >
          {detab(tok.t)}
        </Text>
      ))}
    </>
  );
}

export const CodeView = memo(function CodeView({
  theme,
  code,
  lang,
  filename,
  startLine = 1,
  kinds,
  numbers,
  maxHeight = 420,
  label,
  plain,
  wrap,
}: CodeViewProps) {
  const c = theme.colors;
  const syntax = useSyntaxTheme(theme);
  const result = useHighlight(code, { lang, filename, theme: syntax, enabled: !plain });
  const lines = code.replace(/\n$/, "").split("\n").map(detab);
  const [copied, setCopied] = useState(false);

  const gutterNumbers: (number | null)[] | null =
    numbers ? [...numbers] : startLine === false ? null : lines.map((_, i) => startLine + i);
  const widest = gutterNumbers ? String(Math.max(0, ...gutterNumbers.map((n) => n ?? 0))).length : 0;

  const rowBg = (kind: LineKind | undefined) =>
    kind === "add"
      ? alpha(c.statusSuccess, 0.13)
      : kind === "del"
        ? alpha(c.statusDanger, 0.13)
        : kind === "hunk"
          ? alpha(c.accent, 0.08)
          : "transparent";
  const markColor = (kind: LineKind | undefined) =>
    kind === "add" ? c.statusSuccess : kind === "del" ? c.statusDanger : c.foregroundMuted;
  const mark = (kind: LineKind | undefined) => (kind === "add" ? "+" : kind === "del" ? "-" : " ");

  const body = (
    <View style={{ paddingVertical: 6, flexGrow: 1 }}>
      {lines.map((line, i) => {
        const kind = kinds?.[i];
        if (kind === "hunk" || kind === "meta") {
          return (
            <View key={i} style={{ flexDirection: "row", backgroundColor: rowBg(kind), paddingHorizontal: 10 }}>
              <Text selectable style={{ fontFamily: MONO, fontSize: FONT - 1, lineHeight: LINE, color: c.foregroundMuted }}>
                {line}
              </Text>
            </View>
          );
        }
        return (
          <View key={i} style={{ flexDirection: "row", backgroundColor: rowBg(kind) }}>
            {gutterNumbers ? (
              <Text
                style={{
                  width: widest * 8 + 18,
                  paddingRight: 10,
                  textAlign: "right",
                  fontFamily: MONO,
                  fontSize: FONT - 1,
                  lineHeight: LINE,
                  color: alpha(c.foregroundMuted, 0.7),
                }}
              >
                {gutterNumbers[i] ?? ""}
              </Text>
            ) : (
              <View style={{ width: 10 }} />
            )}
            {kinds ? (
              <Text style={{ width: 14, fontFamily: MONO, fontSize: FONT, lineHeight: LINE, color: markColor(kind), fontWeight: "700" }}>
                {mark(kind)}
              </Text>
            ) : null}
            <Text
              selectable
              style={{
                flexShrink: wrap ? 1 : 0,
                paddingRight: 12,
                fontFamily: MONO,
                fontSize: FONT,
                lineHeight: LINE,
                color: c.foreground,
              }}
            >
              <TokenLine tokens={result?.lines[i]} fallback={line} fg={c.foreground} />
            </Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: alpha(c.surface2, 0.35) }}>
      {label !== undefined ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: 26,
            paddingHorizontal: 10,
            borderBottomWidth: 1,
            borderColor: c.border,
            backgroundColor: alpha(c.surface2, 0.5),
          }}
        >
          <Text style={{ flex: 1, fontFamily: MONO, fontSize: 11.5, color: c.foregroundMuted }} numberOfLines={1}>
            {label}
          </Text>
          {canCopy() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy code"
              onPress={() => {
                void copyToClipboard(code).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              hitSlop={8}
            >
              <Text style={{ fontFamily: MONO, fontSize: 11.5, color: copied ? c.statusSuccess : c.foregroundMuted }}>
                {copied ? "copied" : "copy"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <ScrollView style={{ maxHeight }} nestedScrollEnabled>
        {wrap ? (
          body
        ) : (
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
            {body}
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
});

/** Parses a unified diff into display lines, kinds and new-file line numbers. */
export function parseUnifiedDiff(diff: string): {
  code: string;
  kinds: LineKind[];
  numbers: (number | null)[];
  added: number;
  removed: number;
} {
  const out: string[] = [];
  const kinds: LineKind[] = [];
  const numbers: (number | null)[] = [];
  let oldNo = 0;
  let newNo = 0;
  let added = 0;
  let removed = 0;
  for (const raw of diff.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n")) {
    if (raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("diff ") || raw.startsWith("index ")) continue;
    if (raw.startsWith("@@")) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(raw);
      if (m) {
        oldNo = Number(m[1]);
        newNo = Number(m[2]);
      }
      out.push(raw);
      kinds.push("hunk");
      numbers.push(null);
      continue;
    }
    if (raw.startsWith("\\")) {
      out.push(raw);
      kinds.push("meta");
      numbers.push(null);
      continue;
    }
    const sign = raw[0];
    const text = raw.slice(1);
    if (sign === "+") {
      out.push(text);
      kinds.push("add");
      numbers.push(newNo++);
      added++;
    } else if (sign === "-") {
      out.push(text);
      kinds.push("del");
      numbers.push(oldNo++);
      removed++;
    } else {
      out.push(text);
      kinds.push("ctx");
      numbers.push(newNo++);
      oldNo++;
    }
  }
  return { code: out.join("\n"), kinds, numbers, added, removed };
}

/** Builds a simple -/+ diff from an old and new string when no unified diff exists. */
export function diffFromStrings(oldString: string, newString: string) {
  const del = oldString.replace(/\n$/, "").split("\n");
  const add = newString.replace(/\n$/, "").split("\n");
  return {
    code: [...del, ...add].join("\n"),
    kinds: [...del.map(() => "del" as const), ...add.map(() => "add" as const)],
    numbers: [...del.map(() => null), ...add.map(() => null)],
    added: add.length,
    removed: del.length,
  };
}
