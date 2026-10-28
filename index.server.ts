import type { PluginServerContext } from "@getpaseo/plugin/server";
import { highlight } from "./server/highlight";
import { highlightRpc } from "./shared/highlight";
import { deckSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(deckSettings);
  server.handle(highlightRpc, (input) => highlight(input));
  return () => {};
}
