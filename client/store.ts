import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useSyncExternalStore } from "react";

export type PaseoApi = PluginClientContext["paseo"];
type ListResult = Awaited<ReturnType<PaseoApi["agents"]["list"]>>;
export type AgentSnapshot = ListResult["entries"][number]["agent"];
export type UsageResult = Awaited<ReturnType<PaseoApi["providers"]["listUsage"]>>;

const PARENT_LABEL = "paseo.parent-agent-id";

export function parentOf(agent: AgentSnapshot): string | null {
  return agent.labels?.[PARENT_LABEL] ?? null;
}

/** Small observable value with React binding. */
class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}
  get = (): T => this.value;
  set(next: T) {
    this.value = next;
    for (const listener of this.listeners) listener();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export interface AgentsState {
  status: "loading" | "ready" | "error";
  error?: string;
  agents: ReadonlyMap<string, AgentSnapshot>;
}

export interface UsageState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  result?: UsageResult;
  fetchedAt?: number;
}

const agentsStore = new Store<AgentsState>({ status: "loading", agents: new Map() });
const usageStore = new Store<UsageState>({ status: "idle" });
let api: PaseoApi | null = null;

export function getPaseo(): PaseoApi {
  if (!api) throw new Error("Agent Deck is not running");
  return api;
}

/** Non-React listener for agent changes. Returns an unsubscribe. */
export function onAgents(listener: (state: AgentsState) => void): () => void {
  return agentsStore.subscribe(() => listener(agentsStore.get()));
}

export function useAgents(): AgentsState {
  return useSyncExternalStore(agentsStore.subscribe, agentsStore.get, agentsStore.get);
}

export function useUsage(): UsageState {
  return useSyncExternalStore(usageStore.subscribe, usageStore.get, usageStore.get);
}

export async function refreshUsage(): Promise<void> {
  if (!api) return;
  const previous = usageStore.get();
  usageStore.set({ ...previous, status: previous.result ? "ready" : "loading" });
  try {
    const result = await api.providers.listUsage();
    usageStore.set({ status: "ready", result, fetchedAt: Date.now() });
  } catch (error) {
    usageStore.set({
      ...usageStore.get(),
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const USAGE_INTERVAL_MS = 5 * 60 * 1000;

/** Starts the shared agent subscription and usage polling. Returns cleanup. */
export function startStores(client: PluginClientContext): () => void {
  api = client.paseo;
  const lifetime = new AbortController();
  let stopped = false;
  const agents = new Map<string, AgentSnapshot>();
  const publish = () => agentsStore.set({ status: "ready", agents: new Map(agents) });

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal, page: { limit: 200 } })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          agents.clear();
          for (const { agent } of entries) agents.set(agent.id, agent);
          publish();
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") agents.delete(update.agentId);
          else if (update.agent.archivedAt) agents.delete(update.agent.id);
          else agents.set(update.agent.id, update.agent);
          publish();
        },
      });
      return undefined;
    })
    .catch((error: unknown) => {
      if (stopped) return;
      agentsStore.set({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        agents: new Map(),
      });
    });

  void refreshUsage();
  const timer = setInterval(() => void refreshUsage(), USAGE_INTERVAL_MS);

  return () => {
    stopped = true;
    lifetime.abort();
    clearInterval(timer);
    api = null;
  };
}
