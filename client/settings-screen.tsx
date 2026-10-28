import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsInput, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { SHIKI_THEMES } from "../shared/palettes";
import { type DeckSettings, deckSettings } from "../shared/settings";
import { useDeckSync } from "./controller";
import { isWeb } from "./web";

type BoolKey = {
  [K in keyof DeckSettings]: DeckSettings[K] extends boolean ? K : never;
}[keyof DeckSettings];

export function DeckSettingsScreen({ theme }: PluginSurfaceProps) {
  useDeckSync(theme);
  const settings = useSettings(deckSettings);
  if (settings.status !== "ready") {
    return (
      <Text style={{ color: settings.status === "loading" ? theme.colors.foregroundMuted : theme.colors.statusDanger }}>
        {settings.status === "loading" ? "Loading…" : `Couldn't load settings: ${String(settings.error)}`}
      </Text>
    );
  }
  const values = settings.values;
  const set = (patch: Partial<DeckSettings>) => void settings.save({ ...values, ...patch }, settings.revision);
  const toggle = (key: BoolKey, label: string, hint?: string) => (
    <SettingsSwitch
      label={label}
      hint={hint}
      value={values[key]}
      disabled={settings.saving}
      onValueChange={(v) => set({ [key]: v } as Partial<DeckSettings>)}
    />
  );

  return (
    <>
      <SettingsSection title="Chat view">
        <SettingsCard>
          {toggle("chatAssistant", "Replies", "Markdown with real syntax highlighting, tables and code blocks with copy")}
          {toggle("chatTools", "Tool calls", "Compact rows that expand into highlighted files, diffs and output")}
          {toggle("chatReasoning", "Reasoning", "Collapsed to a one-line preview")}
          {toggle("chatTodos", "Task lists", "Checklist with a progress bar")}
          {toggle("chatDiagrams", "Diagrams", "Mermaid code blocks render as diagrams, themed to your palette")}
          <SettingsSelect
            label="Diagram style"
            hint="Box-drawing text is always used on iOS and Android"
            value={values.diagramStyle}
            options={[
              { label: "Vector", value: "svg" },
              { label: "Box-drawing text", value: "ascii" },
            ]}
            onValueChange={(v) => set({ diagramStyle: v as DeckSettings["diagramStyle"] })}
          />
          <SettingsSelect
            label="Syntax theme"
            hint="Auto matches an Agent Deck palette when one is active in Appearance"
            value={values.syntaxTheme}
            options={[{ label: "Auto", value: "auto" }, ...SHIKI_THEMES.map((t) => ({ label: t, value: t }))]}
            onValueChange={(v) => set({ syntaxTheme: v })}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Learning">
        <SettingsCard>
          {toggle("chatLearning", "Learning blocks", "Callouts, quizzes, flashcards, steps and comparisons render as cards")}
          {toggle("learningPrompt", "Teach agents the formats", "Adds the learning block formats to new agents' system prompt")}
          {toggle("vaultInstructions", "Follow the vault's CLAUDE.md", "Tells new agents where the vault is and copies its formatting and learning rules into their system prompt")}
          <SettingsInput
            label="Notebook folder"
            hint="An Obsidian vault or a folder in one. Pins are saved into its notes. Empty uses ~/Documents/Paseo Notebook"
            initialValue={values.notebookPath}
            placeholder="~/Documents/Paseo Notebook"
            disabled={settings.saving}
            onChangeText={(v) => set({ notebookPath: v })}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={isWeb ? "Rice (desktop and web)" : "Rice (desktop and web only)"}>
        <SettingsCard>
          {toggle("riceSquare", "Square corners")}
          {toggle("riceMono", "Monospace interface font", "Uses JetBrains Mono, Iosevka or Berkeley Mono if installed")}
          {toggle("riceBorders", "Pane borders", "Hairline borders between sidebar, panels and chat")}
          {toggle("riceVividIcons", "Full-color file icons", "Undo Paseo's toned-down Material icons")}
          {toggle("riceComposer", "Command-line composer", "❯ prompt, mode statusline and key hints")}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
