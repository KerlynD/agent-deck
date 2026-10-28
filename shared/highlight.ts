import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { SHIKI_THEMES } from "./palettes";

const token = z.object({
  /** Text of this run. */
  t: z.string(),
  /** `#rrggbb` (or with alpha), null when the theme leaves it at the default foreground. */
  c: z.string().nullable(),
  /** Font style bit flags from Shiki: 1 italic, 2 bold, 4 underline. */
  s: z.number().int().optional(),
});

export const highlightRpc = defineRpc({
  name: "deck.highlight",
  input: z.object({
    code: z.string().max(200_000),
    /** Fence language or alias (`ts`, `bash`, `go`…). */
    lang: z.string().optional(),
    /** Used to guess the language when no fence language is given. */
    filename: z.string().optional(),
    theme: z.enum(SHIKI_THEMES),
  }),
  output: z.object({
    lines: z.array(z.array(token)),
    lang: z.string().nullable(),
    fg: z.string(),
    bg: z.string(),
  }),
});

export type HighlightToken = z.infer<typeof token>;
export type HighlightResult = z.output<typeof highlightRpc.output>;
