import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useDeckSync } from "./controller";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  agentName,
  buildTree,
  contextPct,
  formatAge,
  formatTokens,
  mono,
  stateColor,
  totalTokens,
  useNow,
} from "./format";
import { useAgents } from "./store";

type Scope = "workspace" | "all";

export function AgentsPanel({ theme, layout, workspaceId, navigation }: PluginWorkspacePanelProps) {
  useDeckSync(theme);
  const { status, error, agents } = useAgents();
  const [scope, setScope] = useState<Scope>("workspace");
  const now = useNow();
  const c = theme.colors;
  const compact = layout.compact;

  const rows = useMemo(() => {
    const list = [...agents.values()].filter(
      (a) => scope === "all" || a.workspaceId === workspaceId,
    );
    return buildTree(list);
  }, [agents, scope, workspaceId]);

  const counts = useMemo(() => {
    let run = 0;
    let ask = 0;
    for (const row of rows) {
      if (row.state === "run") run += 1;
      if (row.state === "ask") ask += 1;
    }
    return { run, ask };
  }, [rows]);

  const s = useMemo(
    () => ({
      root: { flex: 1, backgroundColor: c.surface0 },
      bar: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderColor: c.border,
      },
      title: { color: c.foreground, fontFamily: mono, fontWeight: "700" as const, fontSize: 13 },
      meta: { color: c.foregroundMuted, fontFamily: mono, fontSize: 12 },
      tab: (on: boolean) => ({
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: on ? c.accent : c.border,
        backgroundColor: on ? c.accent : "transparent",
      }),
      tabText: (on: boolean) => ({
        color: on ? c.accentForeground : c.foregroundMuted,
        fontFamily: mono,
        fontSize: 12,
      }),
      head: {
        flexDirection: "row" as const,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderColor: c.border,
      },
      headText: { color: c.foregroundMuted, fontFamily: mono, fontSize: 12, fontWeight: "700" as const },
      row: (pressed: boolean) => ({
        flexDirection: "row" as const,
        alignItems: "center" as const,
        paddingHorizontal: 12,
        minHeight: 30,
        backgroundColor: pressed ? c.surface2 : "transparent",
      }),
      cell: { color: c.foreground, fontFamily: mono, fontSize: 12 },
      muted: { color: c.foregroundMuted, fontFamily: mono, fontSize: 12 },
      empty: { color: c.foregroundMuted, fontFamily: mono, fontSize: 12, padding: 16 },
      error: { color: c.statusDanger, fontFamily: mono, fontSize: 12, padding: 16 },
    }),
    [c],
  );

  const W = { id: 64, model: 120, ctx: 52, tok: 64, age: 56, state: 52 };

  if (status === "loading") {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.bar}>
        <Text style={s.title}>agents</Text>
        <Text style={s.meta}>
          {rows.length} · <Text style={{ color: c.accent }}>{counts.run} run</Text>
          {counts.ask > 0 ? <Text style={{ color: c.statusWarning }}> · {counts.ask} ask</Text> : null}
        </Text>
        <View style={{ flex: 1 }} />
        {(["workspace", "all"] as const).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: scope === key }}
            onPress={() => setScope(key)}
            style={s.tab(scope === key)}
          >
            <Text style={s.tabText(scope === key)}>{key === "workspace" ? "this workspace" : "all"}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.head}>
        {!compact ? <Text style={[s.headText, { width: W.id }]}>id</Text> : null}
        <Text style={[s.headText, { flex: 1 }]}>agent</Text>
        {!compact ? <Text style={[s.headText, { width: W.model }]}>model</Text> : null}
        {!compact ? <Text style={[s.headText, { width: W.ctx, textAlign: "right" }]}>ctx</Text> : null}
        <Text style={[s.headText, { width: W.tok, textAlign: "right" }]}>tokens</Text>
        <Text style={[s.headText, { width: W.age, textAlign: "right" }]}>age</Text>
        <Text style={[s.headText, { width: W.state, textAlign: "right" }]}>state</Text>
      </View>

      {status === "error" ? <Text style={s.error}>Couldn't load agents: {error}</Text> : null}
      {status === "ready" && rows.length === 0 ? (
        <Text style={s.empty}>
          {scope === "workspace" ? "No agents in this workspace." : "No agents on this host."}
        </Text>
      ) : null}

      <ScrollView style={{ flex: 1 }}>
        {rows.map(({ agent, prefix, state }) => {
          const color = stateColor(state, theme);
          const ctx = contextPct(agent);
          const open = navigation?.openAgent;
          return (
            <Pressable
              key={agent.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${agentName(agent)}, ${state}`}
              disabled={!open}
              onPress={() => open?.({ agentId: agent.id })}
              style={({ pressed }) => s.row(pressed)}
            >
              {!compact ? <Text style={[s.muted, { width: W.id }]}>{agent.id.slice(0, 6)}</Text> : null}
              <Text style={[s.cell, { flex: 1 }]} numberOfLines={1}>
                <Text style={s.muted}>{prefix}</Text>
                {agentName(agent)}
              </Text>
              {!compact ? (
                <Text style={[s.muted, { width: W.model }]} numberOfLines={1}>
                  {agent.model ?? agent.provider}
                </Text>
              ) : null}
              {!compact ? (
                <Text
                  style={[
                    s.muted,
                    { width: W.ctx, textAlign: "right" },
                    ctx != null && ctx >= 80 ? { color: c.statusWarning } : null,
                  ]}
                >
                  {ctx == null ? "—" : `${ctx}%`}
                </Text>
              ) : null}
              <Text style={[s.cell, { width: W.tok, textAlign: "right" }]}>
                {formatTokens(totalTokens(agent))}
              </Text>
              <Text style={[s.muted, { width: W.age, textAlign: "right" }]}>
                {formatAge(agent.createdAt, now)}
              </Text>
              <Text style={[s.cell, { width: W.state, textAlign: "right", color, fontWeight: "700" }]}>
                {state}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
