import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AgentsPanel } from "./client/agents-panel";
import { createChat } from "./client/chat";
import { bindChat, unbindChat } from "./client/controller";
import { InboxScreen, InboxSidebarItem } from "./client/inbox";
import { installContextPills } from "./client/pills";
import { removeRice } from "./client/rice";
import { DeckSettingsScreen } from "./client/settings-screen";
import { startStores } from "./client/store";
import { UsageSidebarItem } from "./client/usage";
import { PALETTES } from "./shared/palettes";

export default function contribute(client: PluginClientContext) {
  const stopStores = startStores(client);

  // Palettes show up in Settings → Appearance next to Paseo's own themes.
  for (const palette of PALETTES) {
    client.addTheme({ id: palette.id, name: palette.name, appearance: "dark", colors: palette.colors });
  }

  // Chat view: on by default; the settings screen can switch parts off.
  const chat = createChat(client);
  chat.apply({ chatAssistant: true, chatTools: true, chatReasoning: true, chatTodos: true });
  bindChat(chat.apply);

  const removePills = installContextPills(client);

  client.addSettingsScreen({ id: "deck", title: "Agent Deck", icon: "SquareTerminal", Component: DeckSettingsScreen });

  client.addWorkspacePanel({
    id: "agents",
    title: "Agents",
    icon: "ListTree",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: AgentsPanel,
  });
  client.addCommandCenterItem({
    id: "open-agents",
    title: "Open agents table",
    icon: "ListTree",
    keywords: ["btop", "subagents", "processes", "tree"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("agents");
    },
  });

  client.addScreen({ id: "inbox", title: "Inbox", Component: InboxScreen });
  client.addSidebarFooterItem({ id: "inbox", title: "Inbox", Component: InboxSidebarItem });
  client.addCommandCenterItem({
    id: "open-inbox",
    title: "Open inbox",
    icon: "Inbox",
    keywords: ["attention", "permissions", "approvals"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "inbox" });
    },
  });
  client.addSidebarFooterItem({ id: "usage", title: "Usage", Component: UsageSidebarItem });

  client.addCommandCenterItem({
    id: "open-settings",
    title: "Agent Deck settings",
    icon: "SquareTerminal",
    keywords: ["rice", "theme", "chat", "composer"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings("deck");
    },
  });

  return () => {
    unbindChat();
    chat.dispose();
    removePills();
    removeRice();
    stopStores();
  };
}
