import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { notebookAssetRpc, notebookListRpc, notebookReadRpc, type NoteSummary } from "../../shared/notebook";
import { formatAge, useNow } from "../format";
import { Markdown } from "../markdown";
import { alpha, MONO } from "../ui-kit";
import { FOCUS_FRESH_MS, useNotebookEvents } from "./events";
import { linkify, noteHref, type Segment, segments, stripPreamble } from "./obsidian";

const KEY = "deck-notebook";
const POLL_MS = 20_000;
/** Below this width the notebook shows the list or the reader, not both. */
const NARROW = 640;

export interface NotebookViewProps {
  theme: PluginTheme;
  compact: boolean;
  /** Note to show first, such as a screen param. */
  id?: string;
  openMap(id: string): void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useStyles(theme: PluginTheme) {
  const c = theme.colors;
  return useMemo(
    () => ({
      c,
      text: { color: c.foreground, fontFamily: MONO, fontSize: 12 },
      muted: { color: c.foregroundMuted, fontFamily: MONO, fontSize: 12 },
      bar: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderColor: c.border,
      },
      title: { color: c.foreground, fontFamily: MONO, fontWeight: "700" as const, fontSize: 13 },
      button: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: c.border,
      },
      buttonText: { color: c.foregroundMuted, fontFamily: MONO, fontSize: 12 },
      chip: (on: boolean) => ({
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderWidth: 1,
        borderColor: on ? c.accent : alpha(c.border, 0.9),
        backgroundColor: on ? alpha(c.accent, 0.18) : "transparent",
      }),
      chipText: (on: boolean) => ({ color: on ? c.accent : c.foregroundMuted, fontFamily: MONO, fontSize: 11 }),
    }),
    [c],
  );
}

type Styles = ReturnType<typeof useStyles>;

export function NotebookView({ theme, compact, id: requested, openMap }: NotebookViewProps) {
  const s = useStyles(theme);
  const c = s.c;
  const queryClient = useQueryClient();
  const listRpc = useRpc(notebookListRpc);
  const list = useQuery({
    queryKey: [KEY, "list"],
    queryFn: () => listRpc({}),
    refetchOnWindowFocus: true,
    refetchInterval: POLL_MS,
  });

  const [width, setWidth] = useState(0);
  const narrow = compact || (width > 0 && width < NARROW);
  const [selected, setSelected] = useState<string | null>(requested ?? null);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    if (requested) setSelected(requested);
  }, [requested]);

  const mountedAt = useRef(Date.now());
  const events = useNotebookEvents();
  useEffect(() => {
    if (events.pins > 0) void queryClient.invalidateQueries({ queryKey: [KEY] });
  }, [events.pins, queryClient]);
  useEffect(() => {
    if (events.focus && events.focus.at > mountedAt.current - FOCUS_FRESH_MS) setSelected(events.focus.id);
  }, [events.focus]);

  const notes = list.data?.notes ?? [];
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) for (const g of n.tags) counts.set(g, (counts.get(g) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
  }, [notes]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter(
      (n) =>
        (!tag || n.tags.includes(tag)) &&
        (!q || n.id.toLowerCase().includes(q) || n.tags.some((g) => g.toLowerCase().includes(q))),
    );
  }, [notes, search, tag]);

  /** Wide layouts open the newest note; narrow ones start at the list. */
  const active = selected ?? (narrow ? null : (notes[0]?.id ?? null));

  const listPane = (
    <NoteList
      s={s}
      notes={shown}
      total={notes.length}
      tags={tags}
      tag={tag}
      onTag={(g) => setTag((cur) => (cur === g ? null : g))}
      search={search}
      onSearch={setSearch}
      active={active}
      onOpen={setSelected}
      vault={list.data?.vault}
      loading={list.isPending}
      error={list.isError ? errorText(list.error) : null}
      onRefresh={() => void queryClient.invalidateQueries({ queryKey: [KEY] })}
    />
  );
  const reader = active ? (
    <Reader
      s={s}
      theme={theme}
      id={active}
      onBack={narrow ? () => setSelected(null) : undefined}
      onOpen={setSelected}
      openMap={openMap}
    />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface0 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {narrow ? (
        (reader ?? listPane)
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ width: 320, borderRightWidth: 1, borderColor: c.border }}>{listPane}</View>
          <View style={{ flex: 1 }}>{reader}</View>
        </View>
      )}
    </View>
  );
}

// ── Note list ────────────────────────────────────────────────────────────────

interface Group {
  folder: string;
  notes: NoteSummary[];
}

/** Folders, most recently touched first; map notes lead their folder. */
function groupByFolder(notes: NoteSummary[]): Group[] {
  const groups = new Map<string, NoteSummary[]>();
  for (const n of notes) groups.set(n.folder, [...(groups.get(n.folder) ?? []), n]);
  return [...groups.entries()]
    .map(([folder, list]) => ({
      folder,
      notes: list.sort((a, b) => Number(b.isMap) - Number(a.isMap) || Date.parse(b.updated) - Date.parse(a.updated)),
    }))
    .sort((a, b) => Math.max(...b.notes.map((n) => Date.parse(n.updated))) - Math.max(...a.notes.map((n) => Date.parse(n.updated))));
}

function NoteList({
  s,
  notes,
  total,
  tags,
  tag,
  onTag,
  search,
  onSearch,
  active,
  onOpen,
  vault,
  loading,
  error,
  onRefresh,
}: {
  s: Styles;
  notes: NoteSummary[];
  total: number;
  tags: string[];
  tag: string | null;
  onTag(tag: string): void;
  search: string;
  onSearch(q: string): void;
  active: string | null;
  onOpen(id: string): void;
  vault?: string;
  loading: boolean;
  error: string | null;
  onRefresh(): void;
}) {
  const c = s.c;
  const now = useNow();
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const filtering = search.trim() !== "" || tag !== null;
  const groups = useMemo(() => groupByFolder(notes), [notes]);
  const toggle = (folder: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });

  return (
    <View style={{ flex: 1 }}>
      <View style={s.bar}>
        <Text style={s.title}>notebook</Text>
        <Text style={s.muted}>{total}</Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh notebook" onPress={onRefresh} style={s.button}>
          <Text style={s.buttonText}>↻</Text>
        </Pressable>
      </View>
      {total > 0 ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: c.border, paddingHorizontal: 8 }}>
            <Text style={{ color: c.accent, fontFamily: MONO, fontSize: 12 }}>/</Text>
            <TextInput
              value={search}
              onChangeText={onSearch}
              placeholder="filter notes"
              placeholderTextColor={c.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Filter notes"
              style={{ flex: 1, color: c.foreground, fontFamily: MONO, fontSize: 12, paddingVertical: 5 }}
            />
          </View>
          {tags.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {tags.slice(0, 14).map((g) => (
                <Pressable
                  key={g}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tag === g }}
                  accessibilityLabel={`Filter by tag ${g}`}
                  onPress={() => onTag(g)}
                  style={s.chip(tag === g)}
                >
                  <Text style={s.chipText(tag === g)}>#{g}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }}>
        {loading ? <ActivityIndicator color={c.accent} style={{ padding: 16 }} /> : null}
        {error ? <Text style={[s.muted, { color: c.statusDanger, padding: 12 }]}>Couldn't read the vault: {error}</Text> : null}
        {!loading && !error && total === 0 ? <EmptyState s={s} vault={vault} /> : null}
        {total > 0 && notes.length === 0 ? <Text style={[s.muted, { padding: 12 }]}>No notes match.</Text> : null}
        {groups.map((group) => {
          const open = filtering || !closed.has(group.folder);
          return (
            <View key={group.folder}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${open ? "Collapse" : "Expand"} ${group.folder || "vault root"}`}
                onPress={() => toggle(group.folder)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  backgroundColor: pressed ? c.surface2 : alpha(c.surface2, 0.35),
                })}
              >
                <Text style={[s.muted, { color: c.accent }]}>{open ? "▾" : "▸"}</Text>
                <Text numberOfLines={1} style={[s.muted, { flex: 1, fontWeight: "700" }]}>
                  {group.folder ? `${group.folder}/` : "/"}
                </Text>
                <Text style={s.muted}>{group.notes.length}</Text>
              </Pressable>
              {open
                ? group.notes.map((n) => {
                    const on = n.id === active;
                    return (
                      <Pressable
                        key={n.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`Open ${n.title}${n.isMap ? ", map note" : ""}`}
                        onPress={() => onOpen(n.id)}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          gap: 8,
                          alignItems: "baseline",
                          paddingLeft: 22,
                          paddingRight: 12,
                          paddingVertical: 6,
                          borderLeftWidth: 2,
                          borderColor: on ? c.accent : "transparent",
                          backgroundColor: on ? alpha(c.accent, 0.12) : pressed ? c.surface2 : "transparent",
                        })}
                      >
                        <Text style={[s.muted, { width: 10, color: n.isMap ? c.statusWarning : c.foregroundMuted }]}>
                          {n.isMap ? "◆" : "·"}
                        </Text>
                        <Text numberOfLines={1} style={[s.text, { flex: 1, fontWeight: on || n.isMap ? "700" : "400" }]}>
                          {n.title}
                        </Text>
                        <Text style={s.muted}>{n.sections}§</Text>
                        <Text style={[s.muted, { minWidth: 34, textAlign: "right" }]}>{formatAge(n.updated, now)}</Text>
                      </Pressable>
                    );
                  })
                : null}
            </View>
          );
        })}
      </ScrollView>
      {vault ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderColor: c.border }}>
          <Text selectable numberOfLines={2} style={[s.muted, { fontSize: 11 }]}>
            vault {vault}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function EmptyState({ s, vault }: { s: Styles; vault?: string }) {
  const c = s.c;
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Text style={[s.text, { fontWeight: "700" }]}>No notes yet.</Text>
      <Text style={[s.muted, { lineHeight: 18 }]}>
        The notebook reads a folder of markdown notes, such as an Obsidian vault. Pick the folder in Agent Deck settings.
      </Text>
      <View style={{ gap: 4 }}>
        <Text style={[s.muted, { lineHeight: 18 }]}>
          <Text style={{ color: c.accent }}>/pin [note]</Text> in an agent's composer saves its latest reply to that note.
        </Text>
        <Text style={[s.muted, { lineHeight: 18 }]}>
          <Text style={{ color: c.accent }}>pin</Text> on a learning card in chat saves the card. Quizzes and flashcards go to
          the note's Review section, everything else to Reference.
        </Text>
      </View>
      {vault ? (
        <Text selectable style={[s.muted, { lineHeight: 18 }]}>
          Looking in {vault}.
        </Text>
      ) : null}
    </View>
  );
}

// ── Reader ───────────────────────────────────────────────────────────────────

function Reader({
  s,
  theme,
  id,
  onBack,
  onOpen,
  openMap,
}: {
  s: Styles;
  theme: PluginTheme;
  id: string;
  onBack?: () => void;
  onOpen(id: string): void;
  openMap(id: string): void;
}) {
  const c = s.c;
  const now = useNow();
  const readRpc = useRpc(notebookReadRpc);
  const read = useQuery({
    queryKey: [KEY, "read", id],
    queryFn: () => readRpc({ id }),
    refetchOnWindowFocus: true,
    refetchInterval: POLL_MS,
    retry: false,
  });
  const note = read.data?.note;
  const body = useMemo(
    () => (read.data ? linkify(stripPreamble(read.data.markdown, read.data.note.title), read.data.links) : ""),
    [read.data],
  );
  const onLink = (href: string) => {
    const target = noteHref(href);
    if (target === null) return false;
    onOpen(target);
    return true;
  };
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [id]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.bar}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to notes" onPress={onBack} style={s.button}>
            <Text style={s.buttonText}>‹ notes</Text>
          </Pressable>
        ) : null}
        <Text numberOfLines={1} style={[s.title, { flex: 1 }]}>
          {note?.isMap ? <Text style={{ color: c.statusWarning }}>◆ </Text> : null}
          {note?.title ?? id}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show in concept map"
          onPress={() => openMap(note?.id ?? id)}
          style={s.button}
        >
          <Text style={s.buttonText}>map ↗</Text>
        </Pressable>
      </View>

      {read.isPending ? (
        <ActivityIndicator color={c.accent} style={{ padding: 16 }} />
      ) : read.isError ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={[s.text, { fontWeight: "700" }]}>Can't open "{id}".</Text>
          <Text style={[s.muted, { lineHeight: 18 }]}>{errorText(read.error)}</Text>
        </View>
      ) : (
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 860, width: "100%" }}>
          {note ? (
            <View style={{ gap: 6 }}>
              <Text style={s.muted}>
                {note.folder ? `${note.folder}/ · ` : ""}
                {note.sections} section{note.sections === 1 ? "" : "s"} · edited {formatAge(note.updated, now)} ago
              </Text>
              {note.tags.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {note.tags.map((g) => (
                    <View key={g} style={s.chip(false)}>
                      <Text style={s.chipText(false)}>#{g}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          <NoteBody theme={theme} from={note?.id ?? id} text={body} onLink={onLink} now={now} />

          <View style={{ gap: 6, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderColor: c.border }}>
            <Text style={[s.muted, { fontWeight: "700" }]}>linked from</Text>
            {(read.data?.backlinks.length ?? 0) === 0 ? (
              <Text style={s.muted}>No other note links here.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {read.data!.backlinks.map((b) => (
                  <Pressable
                    key={b.id}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${b.title}`}
                    onPress={() => onOpen(b.id)}
                    style={s.button}
                  >
                    <Text style={[s.buttonText, { color: c.accent }]}>← {b.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/** A note's body: markdown runs through Markdown, Obsidian callouts and embeds drawn here. */
function NoteBody({
  theme,
  from,
  text,
  onLink,
  now,
}: {
  theme: PluginTheme;
  from: string;
  text: string;
  onLink(href: string): boolean;
  now: number;
}) {
  const parts = useMemo(() => segments(text), [text]);
  return (
    <View style={{ gap: 12 }}>
      {parts.map((part, i) => (
        <SegmentView key={i} part={part} theme={theme} from={from} onLink={onLink} now={now} />
      ))}
    </View>
  );
}

function SegmentView({
  part,
  theme,
  from,
  onLink,
  now,
}: {
  part: Segment;
  theme: PluginTheme;
  from: string;
  onLink(href: string): boolean;
  now: number;
}) {
  const c = theme.colors;
  switch (part.type) {
    case "markdown":
      return <Markdown text={part.text} theme={theme} onLink={onLink} />;
    case "pinned":
      return (
        <Text style={{ color: c.foregroundMuted, fontFamily: MONO, fontSize: 11 }}>
          ▪ pinned from paseo · {formatAge(part.at, now)} ago
        </Text>
      );
    case "embed":
      return <Embed theme={theme} from={from} target={part.target} />;
    case "callout":
      return <Callout theme={theme} part={part} from={from} onLink={onLink} now={now} />;
  }
}

function calloutStyle(kind: string, c: PluginTheme["colors"]): { color: string; glyph: string } {
  if (["question", "help", "faq"].includes(kind)) return { color: c.statusWarning, glyph: "?" };
  if (["tip", "hint", "important", "success", "check", "done"].includes(kind)) return { color: c.statusSuccess, glyph: "✓" };
  if (["warning", "caution", "attention"].includes(kind)) return { color: c.statusWarning, glyph: "!" };
  if (["danger", "error", "failure", "fail", "missing", "bug"].includes(kind)) return { color: c.statusDanger, glyph: "×" };
  if (["quote", "cite", "example"].includes(kind)) return { color: c.foregroundMuted, glyph: kind === "example" ? "»" : "❝" };
  return { color: c.accent, glyph: "i" };
}

/** `> [!type]- title`: collapsed with `-`, open with `+` or no marker; only foldable ones toggle. */
function Callout({
  theme,
  part,
  from,
  onLink,
  now,
}: {
  theme: PluginTheme;
  part: Extract<Segment, { type: "callout" }>;
  from: string;
  onLink(href: string): boolean;
  now: number;
}) {
  const c = theme.colors;
  const foldable = part.fold !== "";
  const [open, setOpen] = useState(part.fold !== "-");
  const { color, glyph } = calloutStyle(part.kind, c);
  const title = part.title || part.kind.charAt(0).toUpperCase() + part.kind.slice(1);
  const header = (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
      <Text style={{ color, fontFamily: MONO, fontSize: 12, fontWeight: "800", width: 12 }}>{glyph}</Text>
      <View style={{ flex: 1 }}>
        <Markdown text={title} theme={theme} size={13} onLink={onLink} />
      </View>
      {foldable ? <Text style={{ color, fontFamily: MONO, fontSize: 12 }}>{open ? "▾" : "▸"}</Text> : null}
    </View>
  );
  return (
    <View style={{ borderLeftWidth: 2, borderColor: color, backgroundColor: alpha(color, 0.08), paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
      {foldable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${open ? "Hide" : "Show"} ${part.title || part.kind}`}
          onPress={() => setOpen((v) => !v)}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}
      {open && part.body.trim() ? (
        <View style={{ paddingLeft: 20 }}>
          <NoteBody theme={theme} from={from} text={part.body} onLink={onLink} now={now} />
        </View>
      ) : null}
    </View>
  );
}

/** `![[figure.png]]` through the asset RPC. */
function Embed({ theme, from, target }: { theme: PluginTheme; from: string; target: string }) {
  const c = theme.colors;
  const file = target.split("|")[0]!.trim();
  const assetRpc = useRpc(notebookAssetRpc);
  const asset = useQuery({
    queryKey: [KEY, "asset", from, file],
    queryFn: () => assetRpc({ from, target: file }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [ratio, setRatio] = useState(4 / 3);
  if (asset.isPending) return <ActivityIndicator color={c.accent} style={{ alignSelf: "flex-start" }} />;
  if (!asset.data) {
    return <Text style={{ color: c.foregroundMuted, fontFamily: MONO, fontSize: 12 }}>[image not found: {file}]</Text>;
  }
  return (
    <Image
      accessibilityLabel={file}
      source={{ uri: `data:${asset.data.mime};base64,${asset.data.base64}` }}
      onLoad={(e) => {
        const { width, height } = e.nativeEvent.source;
        if (width > 0 && height > 0) setRatio(width / height);
      }}
      resizeMode="contain"
      style={{ width: "100%", maxWidth: 760, aspectRatio: ratio, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1 }}
    />
  );
}
