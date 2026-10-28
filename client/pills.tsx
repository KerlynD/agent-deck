import type { PluginButtonContentProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import { contextPct, formatTokens } from "./format";
import { type AgentSnapshot, onAgents, useAgents } from "./store";
import { alpha, MONO } from "./ui-kit";

function ContextDetails(props: PluginButtonContentProps) {
  const { theme } = props;
  const { agents } = useAgents();
  const agent = props.context === "agent" ? agents.get(props.agentId) : undefined;
  const c = theme.colors;
  if (!agent?.lastUsage) {
    return <Text style={{ padding: 12, color: c.foregroundMuted, fontFamily: MONO, fontSize: 12 }}>No usage reported yet.</Text>;
  }
  const u = agent.lastUsage;
  const pct = contextPct(agent);
  const rows: [string, string][] = [
    ["context", u.contextWindowMaxTokens ? `${formatTokens(u.contextWindowUsedTokens ?? 0)} / ${formatTokens(u.contextWindowMaxTokens)}` : "—"],
    ["input", formatTokens(u.inputTokens ?? null)],
    ["cached", formatTokens(u.cachedInputTokens ?? null)],
    ["output", formatTokens(u.outputTokens ?? null)],
    ["cost", u.totalCostUsd != null ? `$${u.totalCostUsd.toFixed(2)}` : "—"],
  ];
  const cells = 24;
  const filled = pct == null ? 0 : Math.round((pct / 100) * cells);
  const barColor = pct != null && pct >= 85 ? c.statusDanger : pct != null && pct >= 65 ? c.statusWarning : c.accent;
  return (
    <View style={{ padding: 12, gap: 10, minWidth: 240, backgroundColor: c.surface1 }}>
      <View style={{ flexDirection: "row" }}>
        <Text style={{ flex: 1, fontFamily: MONO, fontSize: 12, fontWeight: "700", color: c.foreground }}>context window</Text>
        <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: "700", color: barColor }}>{pct == null ? "—" : `${pct}%`}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 2, height: 8 }}>
        {Array.from({ length: cells }, (_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: i < filled ? barColor : alpha(c.foregroundMuted, 0.2) }} />
        ))}
      </View>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: "row" }}>
          <Text style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: c.foregroundMuted }}>{k}</Text>
          <Text style={{ fontFamily: MONO, fontSize: 12, color: c.foreground }}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function label(agent: AgentSnapshot): string | null {
  const pct = contextPct(agent);
  return pct == null ? null : `ctx ${pct}%`;
}

/** A context-window pill on every agent's composer, updated as usage arrives. */
export function installContextPills(client: PluginClientContext): () => void {
  const pills = new Map<string, { reg: PluginButtonRegistration; label: string | null }>();

  const sync = (agents: ReadonlyMap<string, AgentSnapshot>) => {
    for (const [id, pill] of pills) {
      if (!agents.has(id)) {
        pill.reg.remove();
        pills.delete(id);
      }
    }
    for (const agent of agents.values()) {
      if (!agent.workspaceId) continue;
      const text = label(agent);
      const existing = pills.get(agent.id);
      if (existing) {
        if (existing.label !== text) {
          existing.reg.update({ label: text ?? "ctx", visible: text != null });
          existing.label = text;
        }
        continue;
      }
      const reg = client.addComposerPill({
        id: "context",
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button: {
          title: "Context window",
          icon: "Gauge",
          label: text ?? "ctx",
          visible: text != null,
          behavior: { kind: "popover", Content: ContextDetails },
        },
      });
      pills.set(agent.id, { reg, label: text });
    }
  };

  const unsubscribe = onAgents((state) => sync(state.agents));
  return () => {
    unsubscribe();
    for (const pill of pills.values()) pill.reg.remove();
    pills.clear();
  };
}
