import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl } from "@getpaseo/plugin/client";
import { type Token, type Tokens, Lexer } from "marked";
import { type ReactNode, memo, useMemo } from "react";
import { ScrollView, Text, type TextStyle, View } from "react-native";
import { CodeView } from "./code-view";
import { DIAGRAM_LANGS, DiagramView } from "./diagram";
import { alpha, MONO } from "./ui-kit";

interface Ctx {
  theme: PluginTheme;
  /** Text is still streaming: the last code block may be unfinished. */
  streaming: boolean;
  size: number;
  dim?: boolean;
}

const LEX_OPTIONS = { gfm: true, breaks: false };

function lex(text: string): Token[] {
  try {
    // A Lexer instance appends to its own token list on every call, so a shared
    // one returns every message lexed before. Lexer.lex uses a fresh instance.
    return Lexer.lex(text, LEX_OPTIONS);
  } catch {
    return [{ type: "paragraph", raw: text, text, tokens: [{ type: "text", raw: text, text }] } as Token];
  }
}

function inline(tokens: Token[] | undefined, ctx: Ctx, keyBase: string): ReactNode[] {
  if (!tokens) return [];
  const c = ctx.theme.colors;
  return tokens.map((tok, i) => {
    const key = `${keyBase}.${i}`;
    switch (tok.type) {
      case "strong":
        return (
          <Text key={key} style={{ fontWeight: "700", color: c.foreground }}>
            {inline((tok as Tokens.Strong).tokens, ctx, key)}
          </Text>
        );
      case "em":
        return (
          <Text key={key} style={{ fontStyle: "italic" }}>
            {inline((tok as Tokens.Em).tokens, ctx, key)}
          </Text>
        );
      case "del":
        return (
          <Text key={key} style={{ textDecorationLine: "line-through", color: c.foregroundMuted }}>
            {inline((tok as Tokens.Del).tokens, ctx, key)}
          </Text>
        );
      case "codespan":
        return (
          <Text
            key={key}
            style={{
              fontFamily: MONO,
              fontSize: ctx.size - 1,
              color: c.accent,
              backgroundColor: alpha(c.surface2, 0.7),
            }}
          >
            {` ${decode((tok as Tokens.Codespan).text)} `}
          </Text>
        );
      case "link": {
        const link = tok as Tokens.Link;
        return (
          <Text
            key={key}
            accessibilityRole="link"
            onPress={() => void openExternalUrl(link.href)}
            style={{ color: c.accent, textDecorationLine: "underline" }}
          >
            {inline(link.tokens, ctx, key)}
          </Text>
        );
      }
      case "image":
        return (
          <Text key={key} style={{ color: c.foregroundMuted }}>
            [{(tok as Tokens.Image).text || "image"}]
          </Text>
        );
      case "br":
        return <Text key={key}>{"\n"}</Text>;
      case "text": {
        const t = tok as Tokens.Text;
        return t.tokens ? <Text key={key}>{inline(t.tokens, ctx, key)}</Text> : <Text key={key}>{decode(t.text)}</Text>;
      }
      case "escape":
        return <Text key={key}>{decode((tok as Tokens.Escape).text)}</Text>;
      default:
        return <Text key={key}>{decode((tok as { raw?: string }).raw ?? "")}</Text>;
    }
  });
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function block(tok: Token, ctx: Ctx, key: string, isLast: boolean): ReactNode {
  const c = ctx.theme.colors;
  const base: TextStyle = {
    color: ctx.dim ? c.foregroundMuted : c.foreground,
    fontSize: ctx.size,
    lineHeight: Math.round(ctx.size * 1.6),
  };
  switch (tok.type) {
    case "space":
      return null;
    case "heading": {
      const h = tok as Tokens.Heading;
      const size = h.depth === 1 ? ctx.size + 6 : h.depth === 2 ? ctx.size + 3 : ctx.size + 1;
      return (
        <View key={key} style={{ marginTop: 6, flexDirection: "row", gap: 8, alignItems: "baseline" }}>
          <Text style={{ fontFamily: MONO, color: c.accent, fontSize: size - 2, fontWeight: "700" }}>
            {"#".repeat(h.depth)}
          </Text>
          <Text selectable style={[base, { flex: 1, fontSize: size, lineHeight: Math.round(size * 1.4), fontWeight: "700" }]}>
            {inline(h.tokens, ctx, key)}
          </Text>
        </View>
      );
    }
    case "paragraph":
      return (
        <Text key={key} selectable style={base}>
          {inline((tok as Tokens.Paragraph).tokens, ctx, key)}
        </Text>
      );
    case "text": {
      const t = tok as Tokens.Text;
      return (
        <Text key={key} selectable style={base}>
          {t.tokens ? inline(t.tokens, ctx, key) : decode(t.text)}
        </Text>
      );
    }
    case "code": {
      const code = tok as Tokens.Code;
      const lang = (code.lang ?? "").trim().split(/\s+/)[0] ?? "";
      const unfinished = ctx.streaming && isLast;
      if (DIAGRAM_LANGS.has(lang.toLowerCase())) {
        return (
          <View key={key} style={{ marginVertical: 2 }}>
            <DiagramView theme={ctx.theme} code={code.text} streaming={unfinished} />
          </View>
        );
      }
      return (
        <View key={key} style={{ marginVertical: 2 }}>
          <CodeView
            theme={ctx.theme}
            code={code.text}
            lang={lang || undefined}
            label={lang || "text"}
            startLine={false}
            plain={unfinished}
          />
        </View>
      );
    }
    case "blockquote":
      return (
        <View
          key={key}
          style={{ borderLeftWidth: 2, borderColor: c.accent, paddingLeft: 12, paddingVertical: 2, gap: 8 }}
        >
          {blocks((tok as Tokens.Blockquote).tokens, { ...ctx, dim: true }, key)}
        </View>
      );
    case "list": {
      const list = tok as Tokens.List;
      const start = typeof list.start === "number" ? list.start : 1;
      return (
        <View key={key} style={{ gap: 4 }}>
          {list.items.map((item, i) => {
            const marker = item.task ? (item.checked ? "[x]" : "[ ]") : list.ordered ? `${start + i}.` : "▪";
            return (
              <View key={`${key}.${i}`} style={{ flexDirection: "row", gap: 8 }}>
                <Text
                  style={{
                    fontFamily: MONO,
                    color: item.task && item.checked ? c.statusSuccess : c.accent,
                    fontSize: list.ordered || item.task ? ctx.size - 1 : ctx.size - 3,
                    lineHeight: base.lineHeight,
                    minWidth: list.ordered ? 22 : 12,
                  }}
                >
                  {marker}
                </Text>
                <View style={{ flex: 1, gap: 4 }}>{blocks(item.tokens, ctx, `${key}.${i}`)}</View>
              </View>
            );
          })}
        </View>
      );
    }
    case "table":
      return <Table key={key} table={tok as Tokens.Table} ctx={ctx} />;
    case "hr":
      return <View key={key} style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />;
    case "html":
      return (
        <Text key={key} selectable style={[base, { fontFamily: MONO, fontSize: ctx.size - 1, color: c.foregroundMuted }]}>
          {(tok as Tokens.HTML).text}
        </Text>
      );
    default:
      return (
        <Text key={key} selectable style={base}>
          {(tok as { raw?: string }).raw ?? ""}
        </Text>
      );
  }
}

function blocks(tokens: Token[], ctx: Ctx, keyBase: string): ReactNode[] {
  const visible = tokens.filter((t) => t.type !== "space");
  return visible.map((t, i) => block(t, ctx, `${keyBase}/${i}`, i === visible.length - 1));
}

function plain(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens
    .map((t) => ("tokens" in t && Array.isArray(t.tokens) ? plain(t.tokens as Token[]) : "text" in t ? String(t.text) : ""))
    .join("");
}

function Table({ table, ctx }: { table: Tokens.Table; ctx: Ctx }) {
  const c = ctx.theme.colors;
  const charW = (ctx.size - 1) * 0.62;
  const widths = table.header.map((h, i) => {
    const longest = Math.max(
      plain(h.tokens).length,
      ...table.rows.map((row) => plain(row[i]?.tokens).length),
    );
    return Math.round(Math.min(360, Math.max(72, longest * charW + 24)));
  });
  const cell = (tokens: Token[], i: number, header: boolean, key: string) => (
    <View
      key={key}
      style={{
        width: widths[i],
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRightWidth: i === widths.length - 1 ? 0 : 1,
        borderColor: alpha(c.border, 0.7),
      }}
    >
      <Text
        selectable
        style={{
          color: header ? c.foregroundMuted : c.foreground,
          fontWeight: header ? "700" : "400",
          fontSize: header ? ctx.size - 2 : ctx.size - 1,
          lineHeight: Math.round((ctx.size - 1) * 1.5),
          textAlign: table.align[i] ?? "left",
          fontFamily: header ? MONO : undefined,
          textTransform: header ? "lowercase" : "none",
        }}
      >
        {inline(tokens, ctx, key)}
      </Text>
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={{ borderWidth: 1, borderColor: c.border }}>
        <View style={{ flexDirection: "row", backgroundColor: alpha(c.surface2, 0.6), borderBottomWidth: 1, borderColor: c.border }}>
          {table.header.map((h, i) => cell(h.tokens, i, true, `h${i}`))}
        </View>
        {table.rows.map((row, r) => (
          <View
            key={`r${r}`}
            style={{
              flexDirection: "row",
              borderBottomWidth: r === table.rows.length - 1 ? 0 : 1,
              borderColor: alpha(c.border, 0.5),
              backgroundColor: r % 2 === 1 ? alpha(c.surface2, 0.18) : "transparent",
            }}
          >
            {row.map((col, i) => cell(col.tokens, i, false, `r${r}c${i}`))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export const Markdown = memo(function Markdown({
  text,
  theme,
  streaming = false,
  size = 14,
  dim = false,
}: {
  text: string;
  theme: PluginTheme;
  streaming?: boolean;
  size?: number;
  dim?: boolean;
}) {
  const tokens = useMemo(() => lex(text), [text]);
  const ctx: Ctx = { theme, streaming, size, dim };
  return <View style={{ gap: 10 }}>{blocks(tokens, ctx, "md")}</View>;
});
