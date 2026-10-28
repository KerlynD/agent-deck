import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import {
  LEARNING_PROMPT,
  LEARNING_PROMPT_MARKER,
  VAULT_PROMPT_MARKER,
  VAULT_PROMPT_SECTIONS,
  vaultPrompt,
} from "../shared/learning";
import type { deckSettings } from "../shared/settings";
import { vaultDir } from "./vault";

let cached: { path: string; mtime: number; sections: string[] } | null = null;

/** The `## ` sections of the vault's CLAUDE.md named in VAULT_PROMPT_SECTIONS, verbatim. Missing file: null. */
async function vaultSections(vault: string): Promise<string[] | null> {
  const path = join(vault, "CLAUDE.md");
  let mtime: number;
  try {
    mtime = (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
  if (cached?.path === path && cached.mtime === mtime) return cached.sections;
  const text = await readFile(path, "utf8");
  const sections = VAULT_PROMPT_SECTIONS.map((name) => section(text, name)).filter((s): s is string => s !== null);
  cached = { path, mtime, sections };
  return sections;
}

/** From `## name` to the next `## ` heading outside a code fence. Template headings inside fences stay. */
function section(text: string, name: string): string | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return null;
  let fence: string | null = null;
  let end = start + 1;
  for (; end < lines.length; end++) {
    const line = lines[end]!;
    const marker = /^(`{3,}|~{3,})/.exec(line.trim());
    if (marker) fence = fence === null ? marker[1]! : line.trim().startsWith(fence) ? null : fence;
    else if (fence === null && /^##\s/.test(line)) break;
  }
  return lines.slice(start, end).join("\n").trim();
}

/** Teaches new agents the learning block formats and the vault's rules by extending their system prompt. */
export function registerLearning(server: PluginServerContext, settings: PluginSettings<typeof deckSettings.schema>): () => void {
  return server.before("agent.create", async ({ request }) => {
    const state = await settings.read();
    if (state.status !== "ready") return;
    const { learningPrompt, vaultInstructions, notebookPath } = state.values;
    let systemPrompt = request.config.systemPrompt?.trim() ?? "";
    const parts: string[] = [];
    if (learningPrompt && !systemPrompt.includes(LEARNING_PROMPT_MARKER)) parts.push(LEARNING_PROMPT);
    if (vaultInstructions && !systemPrompt.includes(VAULT_PROMPT_MARKER)) {
      const vault = vaultDir(notebookPath);
      const sections = await vaultSections(vault).catch(() => null);
      if (sections) parts.push(vaultPrompt(vault, sections));
    }
    if (!parts.length) return;
    systemPrompt = [systemPrompt, ...parts].filter(Boolean).join("\n\n");
    return { ...request, config: { ...request.config, systemPrompt } };
  });
}
