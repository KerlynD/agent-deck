import type {
  PluginPopoverProps,
  PluginScreenProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useDeckSync } from "./controller";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { agentName, agentState, formatAge, mono, useNow } from "./format";
import { type AgentSnapshot, getPaseo, useAgents } from "./store";

type PermissionRequest = AgentSnapshot["pendingPermissions"][number];

export interface InboxItem {
  key: string;
  kind: "permission" | "error" | "finished";
  agent: AgentSnapshot;
  request?: PermissionRequest;
  at: string | null;
}

const KIND_ORDER = { permission: 0, error: 1, finished: 2 } as const;

export function useInbox(): InboxItem[] {
  const { agents } = useAgents();
  return useMemo(() => {
    const items: InboxItem[] = [];
    for (const agent of agents.values()) {
      const at = agent.attentionTimestamp ?? agent.updatedAt;
      if (agent.pendingPermissions.length > 0) {
        for (const request of agent.pendingPermissions) {
          items.push({ key: `${agent.id}:${request.id}`, kind: "permission", agent, request, at });
        }
      } else if (agentState(agent) === "err") {
        items.push({ key: `${agent.id}:error`, kind: "error", agent, at });
      } else if (agent.requiresAttention && agent.attentionReason === "finished") {
        items.push({ key: `${agent.id}:finished`, kind: "finished", agent, at });
      }
    }
    return items.sort((a, b) => {
      const diff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      return diff !== 0 ? diff : Date.parse(b.at ?? "") - Date.parse(a.at ?? "");
    });
  }, [agents]);
}

function describe(item: InboxItem): string {
  if (item.kind === "permission" && item.request) {
    const r = item.request;
    return r.title?.trim() || r.description?.trim() || r.name;
  }
  if (item.kind === "error") return item.agent.lastError?.split("\n")[0] ?? "Agent errored";
  return "Finished — ready for review";
}

/** Tool approvals can be answered in place; questions and plans need the full agent view. */
function canQuickAnswer(item: InboxItem): boolean {
  return item.kind === "permission" && item.request?.kind === "tool";
}

function InboxList({
  theme,
  items,
  onOpen,
  limit,
}: {
  theme: PluginTheme;
  items: InboxItem[];
  onOpen?: (agentId: string) => void;
  limit?: number;
}) {
  const c = theme.colors;
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  const answer = async (item: InboxItem, behavior: "allow" | "deny") => {
    if (!item.request) return;
    setBusy(item.key);
    setFailure(null);
    try {
      await getPaseo()
        .agents.ref(item.agent.id)
        .respondToPermission({
          requestId: item.request.id,
          response: behavior === "allow" ? { behavior: "allow" } : { behavior: "deny" },
        });
    } catch (error) {
      setFailure({
        key: item.key,
        message: error instanceof Error ? error.message : "Couldn't answer the request",
      });
    } finally {
      setBusy(null);
    }
  };

  const markColor = { permission: c.statusWarning, error: c.statusDanger, finished: c.statusSuccess };
  const mark = { permission: "?", error: "×", finished: "✓" };
  const shown = limit ? items.slice(0, limit) : items;

  const button = (filled: boolean) => ({
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: filled ? c.accent : c.border,
    backgroundColor: filled ? c.accent : "transparent",
  });
  const buttonText = (filled: boolean) => ({
    color: filled ? c.accentForeground : c.foreground,
    fontFamily: mono,
    fontSize: 12,
  });

  if (items.length === 0) {
    return (
      <Text style={{ color: c.foregroundMuted, fontFamily: mono, fontSize: 12, padding: 12 }}>
        Nothing needs you right now.
      </Text>
    );
  }

  return (
    <View>
      {shown.map((item) => (
        <View
          key={item.key}
          style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderColor: c.border }}
        >
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <Text style={{ width: 12, color: markColor[item.kind], fontFamily: mono, fontWeight: "800" }}>
              {mark[item.kind]}
            </Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.foreground, fontFamily: mono, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>
                {agentName(item.agent)}
              </Text>
              <Text style={{ color: c.foregroundMuted, fontFamily: mono, fontSize: 12 }} numberOfLines={2}>
                {describe(item)}
              </Text>
            </View>
            <Text style={{ color: c.foregroundMuted, fontFamily: mono, fontSize: 12 }}>
              {formatAge(item.at, now)}
            </Text>
          </View>
          {canQuickAnswer(item) || onOpen ? (
            <View style={{ flexDirection: "row", gap: 6, paddingLeft: 20 }}>
              {canQuickAnswer(item) ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Allow ${describe(item)}`}
                    disabled={busy === item.key}
                    onPress={() => void answer(item, "allow")}
                    style={button(true)}
                  >
                    <Text style={buttonText(true)}>allow</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Deny ${describe(item)}`}
                    disabled={busy === item.key}
                    onPress={() => void answer(item, "deny")}
                    style={button(false)}
                  >
                    <Text style={buttonText(false)}>deny</Text>
                  </Pressable>
                </>
              ) : null}
              {onOpen ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${agentName(item.agent)}`}
                  onPress={() => onOpen(item.agent.id)}
                  style={button(false)}
                >
                  <Text style={buttonText(false)}>open</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {failure?.key === item.key ? (
            <Text style={{ color: c.statusDanger, fontFamily: mono, fontSize: 12, paddingLeft: 20 }}>
              {failure.message}
            </Text>
          ) : null}
        </View>
      ))}
      {limit && items.length > limit ? (
        <Text style={{ color: c.foregroundMuted, fontFamily: mono, fontSize: 12, padding: 12 }}>
          +{items.length - limit} more
        </Text>
      ) : null}
    </View>
  );
}

function InboxPopover({ theme, openScreen }: PluginPopoverProps) {
  const items = useInbox();
  const c = theme.colors;
  return (
    <View style={{ width: 340, maxWidth: "100%", backgroundColor: c.surface1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderColor: c.border }}>
        <Text style={{ flex: 1, color: c.foreground, fontFamily: mono, fontWeight: "700" }}>inbox</Text>
        <Pressable accessibilityRole="button" onPress={() => openScreen({ screenId: "inbox" })}>
          <Text style={{ color: c.accent, fontFamily: mono, fontSize: 12 }}>open all →</Text>
        </Pressable>
      </View>
      <InboxList theme={theme} items={items} limit={6} />
    </View>
  );
}

export function InboxSidebarItem({ theme, openPopover }: PluginSidebarItemProps) {
  useDeckSync(theme);
  const items = useInbox();
  const asks = items.filter((i) => i.kind === "permission").length;
  const c = theme.colors;
  const badgeColor = asks > 0 ? c.statusWarning : items.length > 0 ? c.accent : c.border;
  return (
    <SidebarRow
      icon="Inbox"
      label="Inbox"
      onPress={() => openPopover(InboxPopover)}
      trailing={
        items.length > 0 ? (
          <View style={{ minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: badgeColor }}>
            <Text style={{ color: c.surface0, fontFamily: mono, fontSize: 11, fontWeight: "800", textAlign: "center" }}>
              {items.length}
            </Text>
          </View>
        ) : null
      }
    />
  );
}

export function InboxScreen({ theme, navigation }: PluginScreenProps) {
  const items = useInbox();
  const c = theme.colors;
  const open = navigation?.openAgent;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface0 }}>
      <View style={{ maxWidth: 760, width: "100%", alignSelf: "center", borderWidth: 1, borderColor: c.border, marginVertical: 16 }}>
        <InboxList theme={theme} items={items} onOpen={open ? (agentId) => open({ agentId }) : undefined} />
      </View>
    </ScrollView>
  );
}
