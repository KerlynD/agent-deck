import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSidebarItemProps,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { createElement } from "react";
import { pinLastReply } from "./pin";
import { NotebookView } from "./view";

export { focusNote, notePinned } from "./events";

/**
 * The notebook: a screen (`id: "notebook"`, params `{ id?: note id }`), the same view as a
 * workspace panel, a sidebar footer row, Command Center items and the `/pin` command.
 */
export function installNotebook(client: PluginClientContext): () => void {
  const openMap = (id: string) => client.openScreen({ screenId: "concept-map", params: { focus: id } });

  function NotebookScreen({ theme, layout, params }: PluginScreenProps) {
    return createElement(NotebookView, { theme, compact: layout.compact, id: params.id, openMap });
  }

  function NotebookPanel({ theme, layout }: PluginWorkspacePanelProps) {
    return createElement(NotebookView, { theme, compact: layout.compact, openMap });
  }

  function NotebookSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
    return createElement(SidebarRow, {
      icon: "BookOpen",
      label: "Notebook",
      active: currentScreen?.screenId === "notebook",
      onPress: () => openScreen({ screenId: "notebook" }),
    });
  }

  const removers = [
    client.addScreen({ id: "notebook", title: "Notebook", Component: NotebookScreen }),
    client.addSidebarFooterItem({ id: "notebook", title: "Notebook", Component: NotebookSidebarItem }),
    client.addWorkspacePanel({
      id: "notebook",
      title: "Notebook",
      icon: "BookOpen",
      context: "workspace",
      Component: NotebookPanel,
    }),
    client.addCommandCenterItem({
      id: "open-notebook",
      title: "Open notebook",
      icon: "BookOpen",
      keywords: ["vault", "obsidian", "notes", "learning", "pinned"],
      context: "global",
      onSelect({ openScreen }) {
        openScreen({ screenId: "notebook" });
      },
    }),
    client.addCommandCenterItem({
      id: "open-notebook-panel",
      title: "Open notebook beside agents",
      icon: "BookOpen",
      keywords: ["vault", "obsidian", "notes", "panel"],
      context: "workspace",
      onSelect({ openPanel }) {
        openPanel("notebook");
      },
    }),
    client.addSlashCommand({
      name: "pin",
      description: "Pin the agent's latest reply to a notebook note",
      argumentHint: "[note]",
      context: "agent",
      onSubmit: pinLastReply,
    }),
  ];
  return () => {
    for (const remove of removers) remove();
  };
}
