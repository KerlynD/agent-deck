import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { notebookListRpc, notebookReadRpc, slugify, type TopicSummary } from "../../shared/notebook";
import { formatAge, useNow } from "../format";
import { Markdown } from "../markdown";
import { alpha, MONO } from "../ui-kit";
import { useNotebookEvents } from "./events";
import { linkTopics, splitSections, topicTarget } from "./text";

const KEY = "deck-notebook";
const POLL_MS = 20_000;
/** Below this width the notebook shows the list or the reader, not both. */
const NARROW = 640;

export interface NotebookViewProps {
  theme: PluginTheme;
  compact: boolean;
  /** Topic to show first, such as a screen param. */
  slug?: string;
  openMap(slug: string): void;
  openAgent?(agentId: string): void;
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
      button: (on = false) => ({
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: on ? c.accent : c.border,
        backgroundColor: on ? c.accent : "transparent",
      }),
      buttonText: (on = false) => ({
        color: on ? c.accentForeground : c.foregroundMuted,
        fontFamily: MONO,
        fontSize: 12,
      }),
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

export function NotebookView({ theme, compact, slug: requested, openMap, openAgent }: NotebookViewProps) {
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

  const events = useNotebookEvents();
  useEffect(() => {
    if (events.pins > 0) void queryClient.invalidateQueries({ queryKey: [KEY] });
  }, [events.pins, queryClient]);
  useEffect(() => {
    if (events.focus) setSelected(events.focus.slug);
  }, [events.focus]);

  const topics = list.data?.topics ?? [];
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of topics) for (const g of t.tags) counts.set(g, (counts.get(g) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
  }, [topics]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return topics.filter(
      (t) =>
        (!tag || t.tags.includes(tag)) &&
        (!q || t.title.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q))),
    );
  }, [topics, search, tag]);

  /** Wide layouts open the newest topic; narrow ones start at the list. */
  const active = selected ?? (narrow ? null : (topics[0]?.slug ?? null));

  const resolve = (target: string): string => {
    const want = slugify(target);
    return topics.find((t) => slugify(t.slug) === want || slugify(t.title) === want)?.slug ?? want;
  };

  const listPane = (
    <TopicList
      s={s}
      theme={theme}
      topics={shown}
      total={topics.length}
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
      slug={active}
      onBack={narrow ? () => setSelected(null) : undefined}
      onTopic={(target) => setSelected(resolve(target))}
      onSlug={setSelected}
      openMap={openMap}
      openAgent={openAgent}
    />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface0 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {narrow ? (
        (reader ?? listPane)
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ width: 300, borderRightWidth: 1, borderColor: c.border }}>{listPane}</View>
          <View style={{ flex: 1 }}>
            {reader ?? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
                <Text style={s.muted}>{topics.length > 0 ? "Pick a topic." : ""}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Topic list ───────────────────────────────────────────────────────────────

function TopicList({
  s,
  theme,
  topics,
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
  theme: PluginTheme;
  topics: TopicSummary[];
  total: number;
  tags: string[];
  tag: string | null;
  onTag(tag: string): void;
  search: string;
  onSearch(q: string): void;
  active: string | null;
  onOpen(slug: string): void;
  vault?: string;
  loading: boolean;
  error: string | null;
  onRefresh(): void;
}) {
  const c = s.c;
  const now = useNow();
  return (
    <View style={{ flex: 1 }}>
      <View style={s.bar}>
        <Text style={s.title}>notebook</Text>
        <Text style={s.muted}>{total}</Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh notebook" onPress={onRefresh} style={s.button()}>
          <Text style={s.buttonText()}>↻</Text>
        </Pressable>
      </View>
      {total > 0 ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: c.border, paddingHorizontal: 8 }}>
            <Text style={{ color: c.accent, fontFamily: MONO, fontSize: 12 }}>/</Text>
            <TextInput
              value={search}
              onChangeText={onSearch}
              placeholder="filter topics"
              placeholderTextColor={c.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Filter topics"
              style={{ flex: 1, color: c.foreground, fontFamily: MONO, fontSize: 12, paddingVertical: 5 }}
            />
          </View>
          {tags.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {tags.slice(0, 16).map((g) => (
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
        {error ? <Text style={[s.muted, { color: c.statusDanger, padding: 12 }]}>Couldn't read the notebook: {error}</Text> : null}
        {!loading && !error && total === 0 ? <EmptyState s={s} vault={vault} /> : null}
        {total > 0 && topics.length === 0 ? <Text style={[s.muted, { padding: 12 }]}>No topics match.</Text> : null}
        {topics.map((t) => {
          const on = t.slug === active;
          return (
            <Pressable
              key={t.slug}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Open ${t.title}`}
              onPress={() => onOpen(t.slug)}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 7,
                gap: 3,
                borderLeftWidth: 2,
                borderColor: on ? c.accent : "transparent",
                backgroundColor: on ? alpha(c.accent, 0.12) : pressed ? c.surface2 : "transparent",
              })}
            >
              <View style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
                <Text numberOfLines={1} style={[s.text, { flex: 1, fontWeight: on ? "700" : "400" }]}>
                  {t.title}
                </Text>
                <Text style={s.muted}>{t.sections}§</Text>
                <Text style={[s.muted, { minWidth: 36, textAlign: "right" }]}>{formatAge(t.updated, now)}</Text>
              </View>
              {t.tags.length > 0 ? (
                <Text numberOfLines={1} style={[s.muted, { fontSize: 11 }]}>
                  {t.tags.map((g) => `#${g}`).join(" ")}
                </Text>
              ) : null}
            </Pressable>
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
      {theme ? null : null}
    </View>
  );
}

function EmptyState({ s, vault }: { s: Styles; vault?: string }) {
  const c = s.c;
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Text style={[s.text, { fontWeight: "700" }]}>Nothing pinned yet.</Text>
      <Text style={[s.muted, { lineHeight: 18 }]}>
        Things you learn in chat land here, one markdown file per topic.
      </Text>
      <View style={{ gap: 4 }}>
        <Text style={[s.muted, { lineHeight: 18 }]}>
          <Text style={{ color: c.accent }}>/pin [topic]</Text> in an agent's composer saves its latest reply.
        </Text>
        <Text style={[s.muted, { lineHeight: 18 }]}>
          <Text style={{ color: c.accent }}>pin</Text> on a learning card in chat saves that card.
        </Text>
      </View>
      {vault ? (
        <Text selectable style={[s.muted, { lineHeight: 18 }]}>
          Files go to {vault}. Change the folder in Agent Deck settings. Obsidian can open it as a vault.
        </Text>
      ) : null}
    </View>
  );
}

// ── Reader ───────────────────────────────────────────────────────────────────

function Reader({
  s,
  theme,
  slug,
  onBack,
  onTopic,
  onSlug,
  openMap,
  openAgent,
}: {
  s: Styles;
  theme: PluginTheme;
  slug: string;
  onBack?: () => void;
  onTopic(target: string): void;
  onSlug(slug: string): void;
  openMap(slug: string): void;
  openAgent?(agentId: string): void;
}) {
  const c = s.c;
  const now = useNow();
  const readRpc = useRpc(notebookReadRpc);
  const read = useQuery({
    queryKey: [KEY, "read", slug],
    queryFn: () => readRpc({ slug }),
    refetchOnWindowFocus: true,
    refetchInterval: POLL_MS,
    retry: false,
  });
  const sections = useMemo(() => splitSections(read.data?.markdown ?? ""), [read.data?.markdown]);
  const onLink = (href: string) => {
    const target = topicTarget(href);
    if (target === null) return false;
    onTopic(target);
    return true;
  };
  const topic = read.data?.topic;

  return (
    <View style={{ flex: 1 }}>
      <View style={s.bar}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to topics" onPress={onBack} style={s.button()}>
            <Text style={s.buttonText()}>‹ topics</Text>
          </Pressable>
        ) : null}
        <Text numberOfLines={1} style={[s.title, { flex: 1 }]}>
          {topic?.title ?? slug}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show in concept map"
          onPress={() => openMap(topic?.slug ?? slug)}
          style={s.button()}
        >
          <Text style={s.buttonText()}>map ↗</Text>
        </Pressable>
      </View>

      {read.isPending ? (
        <ActivityIndicator color={c.accent} style={{ padding: 16 }} />
      ) : read.isError ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={[s.text, { fontWeight: "700" }]}>No topic "{slug}" yet.</Text>
          <Text style={[s.muted, { lineHeight: 18 }]}>
            Links can point at topics that don't exist yet. Pin to it with /pin {slug} to start it.
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>{errorText(read.error)}</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 18, maxWidth: 820, width: "100%" }}>
          {topic ? (
            <Text style={s.muted}>
              {topic.sections} section{topic.sections === 1 ? "" : "s"} · updated {formatAge(topic.updated, now)} ago
              {topic.tags.length > 0 ? ` · ${topic.tags.map((g) => `#${g}`).join(" ")}` : ""}
            </Text>
          ) : null}
          {sections.length === 0 ? <Text style={s.muted}>This topic is empty.</Text> : null}
          {sections.map((section, i) => (
            <View key={i} style={{ gap: 6 }}>
              {section.meta ? (
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Text style={[s.muted, { fontSize: 11, color: c.accent }]}>▪ {section.meta.kind}</Text>
                  <Text style={[s.muted, { fontSize: 11 }]}>{formatAge(section.meta.at, now)} ago</Text>
                  {section.meta.agent ? (
                    openAgent ? (
                      <Pressable
                        accessibilityRole="link"
                        accessibilityLabel="Open the agent this was pinned from"
                        onPress={() => openAgent(section.meta!.agent!)}
                      >
                        <Text style={[s.muted, { fontSize: 11, textDecorationLine: "underline" }]}>
                          agent {section.meta.agent.slice(0, 8)}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={[s.muted, { fontSize: 11 }]}>agent {section.meta.agent.slice(0, 8)}</Text>
                    )
                  ) : null}
                  <View style={{ flex: 1, height: 1, backgroundColor: alpha(c.border, 0.7) }} />
                </View>
              ) : null}
              {section.markdown ? <Markdown text={linkTopics(section.markdown)} theme={theme} onLink={onLink} /> : null}
            </View>
          ))}

          <View style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderColor: c.border }}>
            <Text style={[s.muted, { fontWeight: "700" }]}>linked from</Text>
            {(read.data?.backlinks.length ?? 0) === 0 ? (
              <Text style={s.muted}>No other topic links here. Write [[{topic?.title ?? slug}]] in a note to link it.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {read.data!.backlinks.map((b) => (
                  <Pressable
                    key={b.slug}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${b.title}`}
                    onPress={() => onSlug(b.slug)}
                    style={s.button()}
                  >
                    <Text style={[s.buttonText(), { color: c.accent }]}>← {b.title}</Text>
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
