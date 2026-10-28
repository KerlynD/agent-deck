import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { type AgentSnapshot, parentOf } from "./store";

export const mono = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});

export type AgentState = "ask" | "run" | "err" | "done" | "init" | "idle" | "closed";

export function agentState(agent: AgentSnapshot): AgentState {
  if (agent.pendingPermissions.length > 0) return "ask";
  if (agent.status === "running") return "run";
  if (agent.status === "error" || agent.lastError) return "err";
  if (agent.status === "initializing") return "init";
  if (agent.status === "closed") return "closed";
  if (agent.requiresAttention && agent.attentionReason === "finished") return "done";
  return "idle";
}

export function stateColor(state: AgentState, theme: PluginTheme): string {
  const c = theme.colors;
  switch (state) {
    case "ask":
      return c.statusWarning;
    case "run":
      return c.accent;
    case "err":
      return c.statusDanger;
    case "done":
      return c.statusSuccess;
    default:
      return c.foregroundMuted;
  }
}

/** Sort weight: things needing you first. */
const STATE_ORDER: Record<AgentState, number> = {
  ask: 0,
  err: 1,
  run: 2,
  init: 3,
  done: 4,
  idle: 5,
  closed: 6,
};

export function agentName(agent: AgentSnapshot): string {
  return agent.title?.trim() || `${agent.provider} agent`;
}

export function totalTokens(agent: AgentSnapshot): number | null {
  const u = agent.lastUsage;
  if (!u) return null;
  const total = (u.inputTokens ?? 0) + (u.cachedInputTokens ?? 0) + (u.outputTokens ?? 0);
  return total > 0 ? total : null;
}

export function contextPct(agent: AgentSnapshot): number | null {
  const u = agent.lastUsage;
  if (!u?.contextWindowMaxTokens || u.contextWindowUsedTokens == null) return null;
  return Math.round((u.contextWindowUsedTokens / u.contextWindowMaxTokens) * 100);
}

export function formatTokens(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatAge(fromIso: string | null | undefined, now: number): string {
  if (!fromIso) return "—";
  const seconds = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatUntil(toIso: string | null | undefined, now: number): string | null {
  if (!toIso) return null;
  const minutes = Math.round((Date.parse(toIso) - now) / 60000);
  if (Number.isNaN(minutes)) return null;
  if (minutes <= 0) return "resetting";
  if (minutes < 60) return `resets in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `resets in ${hours}h${String(minutes % 60).padStart(2, "0")}m`;
  return `resets in ${Math.round(hours / 24)}d`;
}

/** Re-renders every `ms` so relative times stay fresh. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

export interface TreeRow {
  agent: AgentSnapshot;
  /** Box-drawing prefix such as "│  ├─ ". Empty for roots. */
  prefix: string;
  state: AgentState;
}

/**
 * Orders agents as a tree using Paseo's parent label. Roots sort by urgency, then
 * newest; children keep creation order so a fan-out reads top to bottom.
 */
export function buildTree(agents: readonly AgentSnapshot[]): TreeRow[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const children = new Map<string, AgentSnapshot[]>();
  const roots: AgentSnapshot[] = [];
  for (const agent of agents) {
    const parent = parentOf(agent);
    if (parent && byId.has(parent) && parent !== agent.id) {
      const list = children.get(parent) ?? [];
      list.push(agent);
      children.set(parent, list);
    } else {
      roots.push(agent);
    }
  }
  const byCreated = (a: AgentSnapshot, b: AgentSnapshot) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt);
  roots.sort((a, b) => {
    const diff = STATE_ORDER[agentState(a)] - STATE_ORDER[agentState(b)];
    return diff !== 0 ? diff : Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });

  const rows: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (agent: AgentSnapshot, lead: string, branch: string) => {
    if (seen.has(agent.id)) return;
    seen.add(agent.id);
    rows.push({ agent, prefix: lead + branch, state: agentState(agent) });
    const kids = (children.get(agent.id) ?? []).slice().sort(byCreated);
    const nextLead = lead + (branch === "" ? "" : branch === "└─ " ? "   " : "│  ");
    kids.forEach((kid, i) => walk(kid, nextLead, i === kids.length - 1 ? "└─ " : "├─ "));
  };
  for (const root of roots) walk(root, "", "");
  return rows;
}
