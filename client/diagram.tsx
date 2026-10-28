import type { PluginTheme } from "@getpaseo/plugin";
import { useSettings } from "@getpaseo/plugin/client";
import { renderMermaidASCII, renderMermaidSVG } from "beautiful-mermaid";
import { memo, type ReactNode, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { deckSettings } from "../shared/settings";
import { CodeView } from "./code-view";
import { alpha, MONO } from "./ui-kit";
import { canCopy, copyToClipboard, isWeb } from "./web";

/** Fence languages drawn as diagrams. */
export const DIAGRAM_LANGS = new Set(["mermaid", "mmd"]);

export interface DiagramViewProps {
  theme: PluginTheme;
  code: string;
  /** Still streaming: show the source until the block closes. */
  streaming?: boolean;
}

type Mode = "diagram" | "source";
type Rendered =
  | { kind: "svg"; uri: string; width: number; height: number }
  | { kind: "ascii"; text: string }
  | { kind: "error"; message: string };

const FONT = 12.5;
const LINE = 19;
const MAX_HEIGHT = 560;

const cache = new Map<string, Rendered>();
const MAX_CACHE = 100;

function remember(key: string, value: Rendered): Rendered {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
  return value;
}

/**
 * The SVG is shown through <img>, which cannot fetch the renderer's Google Fonts
 * @imports and cannot see the page's CSS. Drop the imports and use the deck's
 * monospace stack, which resolves to installed fonts.
 */
function finishSvg(svg: string): string {
  return svg
    .replace(/@import url\([^)]*\);?/g, "")
    .replace(/font-family:\s*'[^']*',\s*system-ui,\s*sans-serif/g, `font-family: ${MONO}`);
}

function render(code: string, ascii: boolean, theme: PluginTheme): Rendered {
  const c = theme.colors;
  const key = `${ascii ? "a" : "s"}\u0000${c.surface0}\u0000${c.foreground}\u0000${c.accent}\u0000${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    if (ascii) {
      return remember(key, { kind: "ascii", text: renderMermaidASCII(code, { colorMode: "none" }).replace(/\s+$/, "") });
    }
    const svg = finishSvg(
      renderMermaidSVG(code, {
        bg: c.surface0,
        fg: c.foreground,
        accent: c.accent,
        muted: c.foregroundMuted,
        border: c.border,
        transparent: true,
        padding: 16,
      }),
    );
    const m = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(svg);
    return remember(key, {
      kind: "svg",
      uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      width: m ? Number(m[1]) : 600,
      height: m ? Number(m[2]) : 300,
    });
  } catch (err) {
    return remember(key, { kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

/* --------------------------------------------------------------- ascii */

const ARROW_HEAD = /[►◄▲▼]/;
const BOX_DRAWING = /[─-╿]/;

/** Box lines in muted, arrow heads in accent, labels in foreground. */
function AsciiLine({ line, theme }: { line: string; theme: PluginTheme }) {
  const c = theme.colors;
  const runs: { text: string; color: string }[] = [];
  for (const ch of line) {
    const color = ARROW_HEAD.test(ch) ? c.accent : BOX_DRAWING.test(ch) ? c.foregroundMuted : c.foreground;
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.text += ch;
    else runs.push({ text: ch, color });
  }
  return (
    <Text selectable style={{ fontFamily: MONO, fontSize: FONT, lineHeight: LINE, color: c.foreground }}>
      {runs.length ? runs.map((r, i) => <Text key={i} style={{ color: r.color }}>{r.text}</Text>) : " "}
    </Text>
  );
}

/* ---------------------------------------------------------------- view */

export const DiagramView = memo(function DiagramView({ theme, code, streaming }: DiagramViewProps) {
  const c = theme.colors;
  const settings = useSettings(deckSettings);
  const enabled = settings.status !== "ready" || settings.values.chatDiagrams;
  const style = settings.status === "ready" ? settings.values.diagramStyle : "svg";
  // React Native's Image cannot draw SVG, so native clients always get the text rendering.
  const ascii = !isWeb || style === "ascii";
  const [mode, setMode] = useState<Mode>("diagram");
  const [copied, setCopied] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);

  const rendered = useMemo(
    () => (streaming || !enabled ? null : render(code, ascii, theme)),
    [code, ascii, theme, streaming, enabled],
  );

  if (!enabled) return <CodeView theme={theme} code={code} lang="mermaid" label="mermaid" startLine={false} />;

  // Unfinished or unparseable: the source is the best view, with the parse error on top.
  if (!rendered || (rendered.kind === "error" && mode === "diagram")) {
    return (
      <View style={{ gap: 4 }}>
        {rendered?.kind === "error" ? (
          <Text style={{ fontFamily: MONO, fontSize: 11.5, color: c.statusDanger }} numberOfLines={2}>
            ✗ mermaid {rendered.message}
          </Text>
        ) : null}
        <CodeView theme={theme} code={code} label="mermaid" startLine={false} plain={!rendered} />
      </View>
    );
  }

  const headerButton = (label: string, onPress: () => void, active = false, a11y = label) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={8}>
      <Text style={{ fontFamily: MONO, fontSize: 11.5, color: active ? c.foreground : c.foregroundMuted }}>{label}</Text>
    </Pressable>
  );

  let body: ReactNode;
  if (mode === "source") {
    body = <CodeView theme={theme} code={code} lang="mermaid" startLine={false} />;
  } else if (rendered.kind === "svg") {
    // Fit to the block's width; never upscale past the diagram's natural size.
    const scale = boxWidth > 0 ? Math.min(1, (boxWidth - 24) / rendered.width) : 1;
    const width = Math.round(rendered.width * scale);
    const height = Math.round(rendered.height * scale);
    body = (
      <ScrollView style={{ maxHeight: MAX_HEIGHT }} nestedScrollEnabled contentContainerStyle={{ alignItems: "center", padding: 12 }}>
        <Image
          accessibilityLabel="Mermaid diagram"
          source={{ uri: rendered.uri, width: rendered.width, height: rendered.height }}
          style={{ width, height }}
          resizeMode="contain"
        />
      </ScrollView>
    );
  } else if (rendered.kind === "ascii") {
    body = (
      <ScrollView style={{ maxHeight: MAX_HEIGHT }} nestedScrollEnabled>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
          <View style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
            {rendered.text.split("\n").map((line, i) => (
              <AsciiLine key={i} line={line} theme={theme} />
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    );
  }

  return (
    <View
      style={{ borderWidth: 1, borderColor: c.border, backgroundColor: alpha(c.surface2, 0.35) }}
      onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          height: 26,
          paddingHorizontal: 10,
          borderBottomWidth: 1,
          borderColor: c.border,
          backgroundColor: alpha(c.surface2, 0.5),
        }}
      >
        <Text style={{ flex: 1, fontFamily: MONO, fontSize: 11.5, color: c.foregroundMuted }} numberOfLines={1}>
          mermaid
        </Text>
        {headerButton("diagram", () => setMode("diagram"), mode === "diagram", "Show diagram")}
        {headerButton("src", () => setMode("source"), mode === "source", "Show source")}
        {canCopy()
          ? headerButton(
              copied ? "copied" : "copy",
              () => {
                void copyToClipboard(code).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              },
              false,
              "Copy diagram source",
            )
          : null}
      </View>
      {/* CodeView brings its own border; overlap it with ours. */}
      {mode === "source" ? <View style={{ margin: -1 }}>{body}</View> : body}
    </View>
  );
});
