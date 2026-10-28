import type { PluginClientContext } from "@getpaseo/plugin/client";
import { makeConceptMapPanel, makeConceptMapScreen } from "./map";

export function installConceptMap(client: PluginClientContext): () => void {
  // Screens and panels get no openScreen prop; the client's is the one to use.
  const openScreen = (input: Parameters<PluginClientContext["openScreen"]>[0]) => client.openScreen(input);
  const cleanups = [
    client.addScreen({ id: "concept-map", title: "Concept map", Component: makeConceptMapScreen(openScreen) }),
    client.addWorkspacePanel({
      id: "concept-map",
      title: "Concept map",
      icon: "Network",
      context: "workspace",
      Component: makeConceptMapPanel(openScreen),
    }),
    client.addCommandCenterItem({
      id: "open-concept-map",
      title: "Open concept map",
      icon: "Network",
      keywords: ["notebook", "graph", "topics", "links", "wikilinks"],
      context: "global",
      onSelect({ openScreen }) {
        openScreen({ screenId: "concept-map" });
      },
    }),
  ];
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
