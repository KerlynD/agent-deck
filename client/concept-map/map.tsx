import type { PluginOpenScreenInput, PluginScreenProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { notebookGraphRpc } from "../../shared/notebook";
import { alpha, type Colors, MONO } from "../ui-kit";
import { type GraphLayout, layoutFor, type PlacedNode } from "./layout";

/** Prefix shared with the notebook, so invalidating ["deck", "notebook"] refreshes the map too. */
export const GRAPH_QUERY_KEY = ["deck", "notebook", "graph"] as const;

type OpenScreen = (input: PluginOpenScreenInput) => void;
type NodeState = "normal" | "selected" | "neighbor" | "dim";
type Mode = "graph" | "list";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function useGraph() {
  const call = useRpc(notebookGraphRpc);
  return useQuery({
    queryKey: GRAPH_QUERY_KEY,
    queryFn: () => call({}),
    staleTime: 10_000,
    refetchOnMount: "always",
  });
}

// ---------- canvas pieces ----------

const Edge = memo(function Edge(props: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  opacity: number;
  thickness: number;
}) {
  const { x1, y1, x2, y2, thickness } = props;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (x1 + x2) / 2 - len / 2,
        top: (y1 + y2) / 2 - thickness / 2,
        width: len,
        height: thickness,
        backgroundColor: props.color,
        opacity: props.opacity,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
});

const Node = memo(function Node(props: {
  node: PlacedNode;
  zoom: number;
  ox: number;
  oy: number;
  state: NodeState;
  c: Colors;
  onPress: (slug: string) => void;
}) {
  const { node, zoom, ox, oy, state, c } = props;
  const ghost = !node.exists;
  const selected = state === "selected";
  const neighbor = state === "neighbor";
  const w = node.w * zoom;
  const h = node.h * zoom;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={node.title}
      accessibilityState={{ selected }}
      onPress={() => props.onPress(node.slug)}
      style={({ pressed }) => ({
        position: "absolute",
        left: ox + node.x * zoom - w / 2,
        top: oy + node.y * zoom - h / 2,
        width: w,
        height: h,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderStyle: ghost && !selected ? "dashed" : "solid",
        borderRadius: h / 2,
        borderColor: selected || neighbor ? c.accent : ghost ? c.foregroundMuted : c.border,
        backgroundColor: selected
          ? c.accent
          : neighbor
            ? alpha(c.accent, 0.16)
            : pressed
              ? c.surface2
              : ghost
                ? c.surface0
                : c.surface1,
        opacity: state === "dim" ? 0.28 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        style={{
          color: selected ? c.accentForeground : ghost ? c.foregroundMuted : c.foreground,
          fontFamily: MONO,
          fontSize: Math.max(node.font * zoom, 1),
          fontWeight: selected || node.sections >= 4 ? "700" : "400",
        }}
      >
        {node.label}
      </Text>
    </Pressable>
  );
});

// ---------- main ----------

export function ConceptMap({
  theme,
  compact,
  focus,
  openScreen,
}: {
  theme: PluginTheme;
  compact: boolean;
  focus?: string;
  openScreen: OpenScreen;
}) {
  const c = theme.colors;
  const graph = useGraph();
  const [mode, setModeState] = useState<Mode>(compact ? "list" : "graph");
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  const vRef = useRef<ScrollView>(null);
  const hRef = useRef<ScrollView>(null);
  const offset = useRef({ x: 0, y: 0 });
  const pendingScroll = useRef<{ x: number; y: number } | null>(null);
  const placedOnce = useRef(false);

  const setMode = (next: Mode) => {
    if (next === mode) return;
    // The canvas remounts: forget its size and scroll, and place it again.
    placedOnce.current = false;
    offset.current = { x: 0, y: 0 };
    setViewport(null);
    setModeState(next);
  };

  const data = graph.data;
  const lay: GraphLayout | null = useMemo(() => (data ? layoutFor(data.nodes, data.edges) : null), [data]);

  useEffect(() => {
    if (focus) setSelected(focus);
  }, [focus]);

  const selIndex = selected && lay ? lay.index.get(selected) : undefined;
  const selNode = selIndex !== undefined && lay ? lay.nodes[selIndex]! : null;
  const neighborSet = useMemo(
    () => new Set(selIndex !== undefined && lay ? lay.neighbors[selIndex] : []),
    [lay, selIndex],
  );

  // Content is centered when it is smaller than the viewport.
  const vw = viewport?.w ?? 0;
  const vh = viewport?.h ?? 0;
  const contentW = lay ? Math.max(lay.width * zoom, vw) : vw;
  const contentH = lay ? Math.max(lay.height * zoom, vh) : vh;
  const ox = lay ? (contentW - lay.width * zoom) / 2 : 0;
  const oy = lay ? (contentH - lay.height * zoom) / 2 : 0;

  const scrollTo = useCallback((x: number, y: number) => {
    offset.current = { x: Math.max(0, x), y: Math.max(0, y) };
    hRef.current?.scrollTo({ x: offset.current.x, animated: false });
    vRef.current?.scrollTo({ y: offset.current.y, animated: false });
  }, []);

  /** Sets zoom, then scrolls once the resized canvas has rendered. */
  const applyView = useCallback((z: number, x: number, y: number) => {
    pendingScroll.current = { x, y };
    setZoom(z);
  }, []);

  useEffect(() => {
    const target = pendingScroll.current;
    if (!target) return;
    const id = setTimeout(() => {
      pendingScroll.current = null;
      scrollTo(target.x, target.y);
    }, 30);
    return () => clearTimeout(id);
  });

  const fitZoom = useCallback(() => {
    if (!lay || !viewport) return 1;
    return clamp(Math.min((viewport.w - 16) / lay.width, (viewport.h - 16) / lay.height), MIN_ZOOM, 1.5);
  }, [lay, viewport]);

  const centerOn = useCallback(
    (slug: string, z: number) => {
      if (!lay || !viewport) return;
      const i = lay.index.get(slug);
      if (i === undefined) return;
      const node = lay.nodes[i]!;
      const cw = Math.max(lay.width * z, viewport.w);
      const ch = Math.max(lay.height * z, viewport.h);
      const nx = (cw - lay.width * z) / 2 + node.x * z;
      const ny = (ch - lay.height * z) / 2 + node.y * z;
      applyView(z, nx - viewport.w / 2, ny - viewport.h / 2);
    },
    [lay, viewport, applyView],
  );

  // First placement: center the focused topic, else fit the whole map.
  useEffect(() => {
    if (placedOnce.current || !lay || !viewport || mode !== "graph") return;
    placedOnce.current = true;
    if (focus && lay.index.has(focus)) centerOn(focus, Math.max(fitZoom(), 1));
    else applyView(fitZoom(), 0, 0);
  }, [lay, viewport, mode, focus, centerOn, fitZoom, applyView]);

  // A new deep link while open recenters.
  const lastFocus = useRef(focus);
  useEffect(() => {
    if (focus === lastFocus.current) return;
    lastFocus.current = focus;
    if (focus && placedOnce.current) centerOn(focus, Math.max(zoom, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, centerOn]);

  const zoomBy = (factor: number) => {
    if (!viewport) return;
    const z = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const cx = (offset.current.x + viewport.w / 2 - ox) / zoom;
    const cy = (offset.current.y + viewport.h / 2 - oy) / zoom;
    const cw = lay ? Math.max(lay.width * z, viewport.w) : viewport.w;
    const ch = lay ? Math.max(lay.height * z, viewport.h) : viewport.h;
    const nox = lay ? (cw - lay.width * z) / 2 : 0;
    const noy = lay ? (ch - lay.height * z) / 2 : 0;
    applyView(z, nox + cx * z - viewport.w / 2, noy + cy * z - viewport.h / 2);
  };

  const select = useCallback(
    (slug: string | null, center = false) => {
      setSelected(slug);
      if (slug && center && mode === "graph") centerOn(slug, Math.max(zoom, 0.8));
    },
    [centerOn, mode, zoom],
  );
  const onNodePress = useCallback((slug: string) => setSelected((cur) => (cur === slug ? null : slug)), []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !lay) return [];
    return lay.nodes
      .filter((n) => n.title.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q))
      .sort((a, b) => {
        const as = a.title.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.title.toLowerCase().startsWith(q) ? 0 : 1;
        return as - bs || a.title.localeCompare(b.title);
      });
  }, [query, lay]);

  const s = useMemo(() => styles(c, compact), [c, compact]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport((cur) => (cur && cur.w === width && cur.h === height ? cur : { w: width, h: height }));
  };
  const onScrollX = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current.x = e.nativeEvent.contentOffset.x;
  };
  const onScrollY = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current.y = e.nativeEvent.contentOffset.y;
  };

  const counts = useMemo(() => {
    if (!data) return null;
    const ghosts = data.nodes.filter((n) => !n.exists).length;
    return { topics: data.nodes.length - ghosts, ghosts, links: lay?.edges.length ?? 0 };
  }, [data, lay]);

  const button = (label: string, onPress: () => void, a11y: string, on = false) => (
    <Pressable
      key={a11y}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => s.btn(on, pressed)}
    >
      <Text style={s.btnText(on)}>{label}</Text>
    </Pressable>
  );

  const bar = (
    <View style={s.bar}>
      <Text style={s.title}>concept map</Text>
      {counts ? (
        <Text style={s.meta}>
          {counts.topics} topics · {counts.links} links
          {counts.ghosts > 0 ? ` · ${counts.ghosts} unwritten` : ""}
        </Text>
      ) : null}
      <View style={{ flex: 1, minWidth: 8 }} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="find topic"
        placeholderTextColor={c.foregroundMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => {
          const first = matches[0];
          if (first) {
            select(first.slug, true);
            if (mode === "graph") setQuery("");
          }
        }}
        style={s.input}
      />
      <View style={s.group}>
        {mode === "graph" ? button("−", () => zoomBy(1 / 1.25), "Zoom out") : null}
        {mode === "graph" ? button("+", () => zoomBy(1.25), "Zoom in") : null}
        {mode === "graph" ? button("fit", () => applyView(fitZoom(), 0, 0), "Fit map") : null}
        {button(graph.isFetching ? "…" : "↻", () => void graph.refetch(), "Refresh")}
        {compact ? button("list", () => setMode("list"), "Show list", mode === "list") : null}
        {compact ? button("graph", () => setMode("graph"), "Show graph", mode === "graph") : null}
      </View>
    </View>
  );

  if (graph.status === "pending") {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (graph.status === "error") {
    return (
      <View style={s.root}>
        {bar}
        <Text style={s.error}>Couldn't read the notebook: {graph.error.message}</Text>
      </View>
    );
  }

  if (!lay || lay.nodes.length === 0) {
    return (
      <View style={s.root}>
        {bar}
        <View style={[s.center, { flex: 1, padding: 24, gap: 10 }]}>
          <Text style={s.emptyTitle}>No topics yet</Text>
          <Text style={s.emptyText}>
            Topics come from notes you pin to the notebook: each topic is one markdown file in the vault. Writing [[Another
            topic]] inside a note draws a link between the two. Links to topics that have no file yet show as dashed
            outlines.
          </Text>
        </View>
      </View>
    );
  }

  const detail = selNode ? (
    <Detail
      node={selNode}
      lay={lay}
      c={c}
      s={s}
      floating={mode === "graph"}
      compact={compact}
      onSelect={(slug) => select(slug, true)}
      onClose={() => setSelected(null)}
      onOpen={() => openScreen({ screenId: "notebook", params: { slug: selNode.slug } })}
    />
  ) : null;

  const suggestions =
    mode === "graph" && matches.length > 0 ? (
      <View style={s.suggest}>
        {matches.slice(0, 8).map((n) => (
          <Pressable
            key={n.slug}
            accessibilityRole="button"
            onPress={() => {
              select(n.slug, true);
              setQuery("");
            }}
            style={({ pressed }) => s.chip(false, pressed, !n.exists)}
          >
            <Text style={s.chipText(false, !n.exists)}>{n.label}</Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  if (mode === "list") {
    return (
      <View style={s.root}>
        {bar}
        <TopicList lay={lay} c={c} s={s} query={query} selected={selected} onSelect={setSelected} detail={detail} />
      </View>
    );
  }

  const hasSel = selIndex !== undefined;
  return (
    <View style={s.root}>
      {bar}
      {suggestions}
      <View style={{ flex: 1 }} onLayout={onLayout}>
        {viewport ? (
          <ScrollView
            ref={vRef}
            style={{ flex: 1 }}
            onScroll={onScrollY}
            scrollEventThrottle={32}
            nestedScrollEnabled
          >
            <ScrollView
              ref={hRef}
              horizontal
              onScroll={onScrollX}
              scrollEventThrottle={32}
              nestedScrollEnabled
            >
              <Pressable
                accessible={false}
                onPress={() => setSelected(null)}
                style={{ width: contentW, height: contentH }}
              >
                {lay.edges.map((e) => {
                  const a = lay.nodes[e.a]!;
                  const b = lay.nodes[e.b]!;
                  const lit = hasSel && (e.a === selIndex || e.b === selIndex);
                  return (
                    <Edge
                      key={`${e.a}:${e.b}`}
                      x1={ox + a.x * zoom}
                      y1={oy + a.y * zoom}
                      x2={ox + b.x * zoom}
                      y2={oy + b.y * zoom}
                      color={lit ? c.accent : c.foregroundMuted}
                      opacity={lit ? 0.9 : hasSel ? 0.08 : 0.2 + 0.15 * Math.min(e.weight, 4)}
                      thickness={lit || e.weight > 2 ? 2 : 1}
                    />
                  );
                })}
                {lay.nodes.map((n, i) => (
                  <Node
                    key={n.slug}
                    node={n}
                    zoom={zoom}
                    ox={ox}
                    oy={oy}
                    c={c}
                    onPress={onNodePress}
                    state={!hasSel ? "normal" : i === selIndex ? "selected" : neighborSet.has(i) ? "neighbor" : "dim"}
                  />
                ))}
              </Pressable>
            </ScrollView>
          </ScrollView>
        ) : null}
        {detail}
      </View>
    </View>
  );
}

// ---------- detail card ----------

function linksOf(lay: GraphLayout, i: number): PlacedNode[] {
  return lay.neighbors[i]!.map((j) => lay.nodes[j]!).sort((a, b) => a.title.localeCompare(b.title));
}

function Detail({
  node,
  lay,
  c,
  s,
  floating,
  compact,
  onSelect,
  onClose,
  onOpen,
}: {
  node: PlacedNode;
  lay: GraphLayout;
  c: Colors;
  s: Styles;
  floating: boolean;
  compact: boolean;
  onSelect: (slug: string) => void;
  onClose: () => void;
  onOpen: () => void;
}) {
  const links = linksOf(lay, lay.index.get(node.slug)!);
  const place = floating
    ? compact
      ? { position: "absolute" as const, left: 0, right: 0, bottom: 0, maxHeight: "50%" as const }
      : { position: "absolute" as const, top: 8, right: 8, width: 300, maxHeight: "70%" as const }
    : {};
  return (
    <View style={[s.card, place]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Text style={[s.cardTitle, { flex: 1 }]}>{node.title}</Text>
        {floating ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
            <Text style={s.meta}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={s.meta}>
        {node.exists ? `${node.sections} section${node.sections === 1 ? "" : "s"}` : "not written yet"} · {links.length}{" "}
        link{links.length === 1 ? "" : "s"}
      </Text>
      {node.tags.length > 0 ? (
        <Text style={[s.meta, { color: c.accent }]}>{node.tags.map((t) => `#${t}`).join(" ")}</Text>
      ) : null}
      {links.length > 0 ? (
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={s.chips}>
          {links.map((n) => (
            <Pressable
              key={n.slug}
              accessibilityRole="button"
              onPress={() => onSelect(n.slug)}
              style={({ pressed }) => s.chip(false, pressed, !n.exists)}
            >
              <Text style={s.chipText(false, !n.exists)}>{n.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {node.exists ? (
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [s.btn(true, pressed), { alignSelf: "flex-start" }]}
        >
          <Text style={s.btnText(true)}>open in notebook ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------- compact list ----------

function TopicList({
  lay,
  c,
  s,
  query,
  selected,
  onSelect,
  detail,
}: {
  lay: GraphLayout;
  c: Colors;
  s: Styles;
  query: string;
  selected: string | null;
  onSelect: (slug: string | null) => void;
  detail: React.ReactNode;
}) {
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    return lay.nodes
      .map((n, i) => ({ n, degree: lay.neighbors[i]!.length }))
      .filter(({ n }) => !q || n.title.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q))
      .sort((a, b) => Number(b.n.exists) - Number(a.n.exists) || b.degree - a.degree || a.n.title.localeCompare(b.n.title));
  }, [lay, q]);
  return (
    <ScrollView style={{ flex: 1 }}>
      {rows.length === 0 ? <Text style={[s.meta, { padding: 16 }]}>No topic matches "{query}".</Text> : null}
      {rows.map(({ n, degree }) => {
        const on = n.slug === selected;
        return (
          <View key={n.slug}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(on ? null : n.slug)}
              style={({ pressed }) => s.row(on, pressed)}
            >
              <Text style={{ color: on ? c.accent : c.foregroundMuted, fontFamily: MONO, fontSize: 12 }}>
                {n.exists ? (on ? "▾" : "▸") : "○"}
              </Text>
              <Text numberOfLines={1} style={[s.rowTitle(n.exists), { flex: 1 }]}>
                {n.title}
              </Text>
              <Text style={s.meta}>
                {n.exists ? `${n.sections}§ ` : ""}
                {degree}↔
              </Text>
            </Pressable>
            {on ? detail : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ---------- styles ----------

function styles(c: Colors, compact: boolean) {
  return {
    root: { flex: 1, backgroundColor: c.surface0 },
    center: { alignItems: "center" as const, justifyContent: "center" as const },
    bar: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    group: { flexDirection: "row" as const, gap: 4 },
    title: { color: c.foreground, fontFamily: MONO, fontWeight: "700" as const, fontSize: 13 },
    meta: { color: c.foregroundMuted, fontFamily: MONO, fontSize: 12 },
    input: {
      color: c.foreground,
      fontFamily: MONO,
      fontSize: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface1,
      paddingHorizontal: 8,
      paddingVertical: 4,
      width: compact ? 120 : 180,
    },
    btn: (on: boolean, pressed: boolean) => ({
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: on ? c.accent : c.border,
      backgroundColor: on ? c.accent : pressed ? c.surface2 : "transparent",
    }),
    btnText: (on: boolean) => ({
      color: on ? c.accentForeground : c.foreground,
      fontFamily: MONO,
      fontSize: 12,
    }),
    suggest: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface1,
    },
    chips: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
    chip: (on: boolean, pressed: boolean, ghost: boolean) => ({
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderWidth: 1,
      borderStyle: ghost ? ("dashed" as const) : ("solid" as const),
      borderColor: on ? c.accent : ghost ? c.foregroundMuted : c.border,
      backgroundColor: on ? c.accent : pressed ? c.surface2 : c.surface1,
    }),
    chipText: (on: boolean, ghost: boolean) => ({
      color: on ? c.accentForeground : ghost ? c.foregroundMuted : c.foreground,
      fontFamily: MONO,
      fontSize: 12,
    }),
    card: {
      gap: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: c.accent,
      backgroundColor: c.surface1,
    },
    cardTitle: { color: c.foreground, fontFamily: MONO, fontSize: 14, fontWeight: "700" as const },
    row: (on: boolean, pressed: boolean) => ({
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 12,
      minHeight: 34,
      borderBottomWidth: 1,
      borderColor: c.border,
      backgroundColor: on ? alpha(c.accent, 0.12) : pressed ? c.surface2 : "transparent",
    }),
    rowTitle: (exists: boolean) => ({
      color: exists ? c.foreground : c.foregroundMuted,
      fontFamily: MONO,
      fontSize: 13,
    }),
    emptyTitle: { color: c.foreground, fontFamily: MONO, fontSize: 14, fontWeight: "700" as const },
    emptyText: {
      color: c.foregroundMuted,
      fontFamily: MONO,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 460,
      textAlign: "center" as const,
    },
    error: { color: c.statusDanger, fontFamily: MONO, fontSize: 12, padding: 16 },
  };
}

type Styles = ReturnType<typeof styles>;

// ---------- contributions ----------

export function makeConceptMapScreen(openScreen: OpenScreen) {
  return function ConceptMapScreen({ theme, layout, params }: PluginScreenProps) {
    return <ConceptMap theme={theme} compact={layout.compact} focus={params.focus || undefined} openScreen={openScreen} />;
  };
}

export function makeConceptMapPanel(openScreen: OpenScreen) {
  return function ConceptMapPanel({ theme, layout }: PluginWorkspacePanelProps) {
    return <ConceptMap theme={theme} compact={layout.compact} openScreen={openScreen} />;
  };
}
