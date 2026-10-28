import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerGraph } from "./server/graph";
import { highlight } from "./server/highlight";
import { registerLearning } from "./server/learning";
import { registerNotebook } from "./server/notebook";
import { highlightRpc } from "./shared/highlight";
import { deckSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(deckSettings);
  server.handle(highlightRpc, (input) => highlight(input));
  const cleanups = [
    registerLearning(server, settings),
    registerNotebook(server, settings),
    registerGraph(server, settings),
  ];
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
