import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const deckSettings = defineSettings({
  id: "deck",
  scope: "host",
  version: 1,
  schema: z.object({
    // Chat view
    chatAssistant: z.boolean().default(true),
    chatTools: z.boolean().default(true),
    chatReasoning: z.boolean().default(true),
    chatTodos: z.boolean().default(true),
    chatDiagrams: z.boolean().default(true),
    /** Native clients always use "ascii": React Native's Image cannot draw SVG. */
    diagramStyle: z.enum(["svg", "ascii"]).default("svg"),
    /** "auto" follows an Agent Deck palette when one is active. */
    syntaxTheme: z.string().default("auto"),
    // Rice (desktop and web only)
    riceSquare: z.boolean().default(true),
    riceMono: z.boolean().default(true),
    riceBorders: z.boolean().default(true),
    riceVividIcons: z.boolean().default(true),
    riceComposer: z.boolean().default(true),
  }),
});

export type DeckSettings = z.output<typeof deckSettings.schema>;
