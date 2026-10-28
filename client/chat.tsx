import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { type ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { CodeView, diffFromStrings, parseUnifiedDiff } from "./code-view";
import { Markdown } from "./markdown";
import { alpha, basename, MONO } from "./ui-kit";

/* ---------------------------------------------------------------- schemas */

const phase = z.enum(["streaming", "complete"]);

const assistantSchema = z.object({ text: z.string(), phase });
const reasoningSchema = z.object({ text: z.string(), phase });
const toolSchema = z.object({
  name: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
  phase,
});
const todoSchema = z.object({
  items: z.array(
    z.object({
      text: z.string(),
      completed: z.boolean(),
      status: z.string().optional(),
      activeForm: z.string().optional(),
    }),
  ),
});

type ToolData = z.output<typeof toolSchema>;

/* ------------------------------------------------------------ assistant */

function AssistantRow({ item, theme, agentId }: PluginTimelineItemProps<z.output<typeof assistantSchema>>) {
  return (
    <View style={{ paddingVertical: 4 }}>
      <Markdown text={item.data.text} theme={theme} streaming={item.data.phase === "streaming"} agentId={agentId} />
    </View>
  );
}

/* ------------------------------------------------------------ reasoning */

function ReasoningRow({ item, theme }: PluginTimelineItemProps<z.output<typeof reasoningSchema>>) {
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  const live = item.data.phase === "streaming";
  const text = item.data.text.trim();
  const preview = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  return (
    <View style={{ borderLeftWidth: 2, borderColor: alpha(c.foregroundMuted, 0.5), paddingLeft: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? "Hide reasoning" : "Show reasoning"}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: "row", gap: 8, alignItems: "center", minHeight: 24 }}
      >
        <Text style={{ fontFamily: MONO, fontSize: 12, color: live ? c.accent : c.foregroundMuted, fontWeight: "700" }}>
          {live ? "thinking…" : "thought"}
        </Text>
        {!open ? (
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: c.foregroundMuted, fontStyle: "italic" }}>
            {preview}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Text style={{ fontFamily: MONO, fontSize: 12, color: c.foregroundMuted }}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? (
        <View style={{ paddingTop: 4, paddingBottom: 6 }}>
          <Markdown text={text} theme={theme} size={13} dim streaming={live} />
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------------- todo */

function TodoRow({ item, theme }: PluginTimelineItemProps<z.output<typeof todoSchema>>) {
  const c = theme.colors;
  const items = item.data.items;
  const done = items.filter((i) => i.completed).length;
  return (
    <View style={{ borderWidth: 1, borderColor: c.border }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 10,
          height: 28,
          borderBottomWidth: 1,
          borderColor: c.border,
        }}
      >
        <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: "700", color: c.foreground }}>tasks</Text>
        <View style={{ flex: 1, flexDirection: "row", gap: 2, height: 6 }}>
          {items.map((t, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                backgroundColor: t.completed
                  ? c.statusSuccess
                  : t.status === "in_progress"
                    ? c.accent
                    : alpha(c.foregroundMuted, 0.25),
              }}
            />
          ))}
        </View>
        <Text style={{ fontFamily: MONO, fontSize: 12, color: c.foregroundMuted }}>
          {done}/{items.length}
        </Text>
      </View>
      <View style={{ paddingVertical: 4 }}>
        {items.map((t, i) => {
          const active = !t.completed && t.status === "in_progress";
          return (
            <View key={i} style={{ flexDirection: "row", gap: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text
                style={{
                  fontFamily: MONO,
                  fontSize: 12.5,
                  color: t.completed ? c.statusSuccess : active ? c.accent : c.foregroundMuted,
                  fontWeight: "700",
                }}
              >
                {t.completed ? "[x]" : active ? "[~]" : "[ ]"}
              </Text>
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  lineHeight: 19,
                  color: t.completed ? c.foregroundMuted : c.foreground,
                  textDecorationLine: t.completed ? "line-through" : "none",
                  fontWeight: active ? "600" : "400",
                }}
              >
                {active && t.activeForm ? t.activeForm : t.text}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- tools */

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

interface ToolView {
  verb: string;
  arg: string;
  meta?: ReactNode;
  body?: ReactNode;
  /** Open by default. */
  open?: boolean;
}

function lineCount(s: string | undefined): number {
  return s ? s.replace(/\n$/, "").split("\n").length : 0;
}

function Mono({ children, color, size = 12 }: { children: ReactNode; color: string; size?: number }) {
  return <Text style={{ fontFamily: MONO, fontSize: size, color }}>{children}</Text>;
}

function OutputBlock({ theme, text, danger }: { theme: PluginTheme; text: string; danger?: boolean }) {
  const c = theme.colors;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: danger ? alpha(c.statusDanger, 0.5) : c.border,
        backgroundColor: alpha(c.surface2, 0.35),
        paddingHorizontal: 10,
        paddingVertical: 8,
        maxHeight: 320,
        overflow: "hidden",
      }}
    >
      <Text selectable style={{ fontFamily: MONO, fontSize: 12, lineHeight: 18, color: danger ? c.statusDanger : c.foreground }}>
        {stripAnsi(text).replace(/\n$/, "")}
      </Text>
    </View>
  );
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function describeTool(data: ToolData, theme: PluginTheme): ToolView | null {
  const c = theme.colors;
  const d = data.detail;
  const failed = data.status === "failed";
  switch (d.type) {
    case "shell": {
      const command = str(d.command) ?? "";
      const output = str(d.output);
      const exit = num(d.exitCode);
      return {
        verb: "bash",
        arg: command.split("\n")[0] ?? command,
        meta:
          exit != null ? (
            <Mono color={exit === 0 ? c.statusSuccess : c.statusDanger}>exit {exit}</Mono>
          ) : data.status === "running" ? (
            <Mono color={c.accent}>running</Mono>
          ) : null,
        open: failed || (exit != null && exit !== 0),
        body: (
          <View style={{ gap: 6 }}>
            <CodeView theme={theme} code={command} lang="bash" startLine={false} label={str(d.cwd) ?? "$"} />
            {output ? <OutputBlock theme={theme} text={output} danger={failed || (exit != null && exit !== 0)} /> : null}
          </View>
        ),
      };
    }
    case "read": {
      const path = str(d.filePath) ?? "";
      const content = str(d.content);
      const offset = num(d.offset) ?? 1;
      const n = lineCount(content);
      return {
        verb: "read",
        arg: path,
        meta: n ? <Mono color={c.foregroundMuted}>{n} lines</Mono> : null,
        body: content ? (
          <CodeView theme={theme} code={content} filename={path} startLine={Math.max(1, offset)} label={basename(path)} />
        ) : undefined,
      };
    }
    case "write": {
      const path = str(d.filePath) ?? "";
      const content = str(d.content);
      return {
        verb: "write",
        arg: path,
        meta: content ? <Mono color={c.statusSuccess}>+{lineCount(content)}</Mono> : null,
        body: content ? <CodeView theme={theme} code={content} filename={path} label={basename(path)} /> : undefined,
      };
    }
    case "edit": {
      const path = str(d.filePath) ?? "";
      const unified = str(d.unifiedDiff);
      const oldS = str(d.oldString);
      const newS = str(d.newString);
      const diff = unified
        ? parseUnifiedDiff(unified)
        : oldS != null || newS != null
          ? diffFromStrings(oldS ?? "", newS ?? "")
          : null;
      return {
        verb: "edit",
        arg: path,
        meta: diff ? (
          <Text>
            <Mono color={c.statusSuccess}>+{diff.added}</Mono>
            <Mono color={c.foregroundMuted}> </Mono>
            <Mono color={c.statusDanger}>−{diff.removed}</Mono>
          </Text>
        ) : null,
        open: true,
        body: diff ? (
          <CodeView
            theme={theme}
            code={diff.code}
            filename={path}
            kinds={diff.kinds}
            numbers={diff.numbers}
            label={basename(path)}
          />
        ) : undefined,
      };
    }
    case "search": {
      const query = str(d.query) ?? "";
      const tool = str(d.toolName) ?? "search";
      const files = Array.isArray(d.filePaths) ? (d.filePaths as unknown[]).filter((p): p is string => typeof p === "string") : [];
      const content = str(d.content);
      const matches = num(d.numMatches);
      const nFiles = num(d.numFiles) ?? (files.length || undefined);
      const web = Array.isArray(d.webResults) ? (d.webResults as { title?: string; url?: string }[]) : [];
      return {
        verb: tool === "web_search" ? "web" : tool,
        arg: query,
        meta: (
          <Mono color={c.foregroundMuted}>
            {[matches != null ? `${matches} hits` : null, nFiles != null ? `${nFiles} files` : null, web.length ? `${web.length} results` : null]
              .filter(Boolean)
              .join(" · ")}
          </Mono>
        ),
        body:
          content || files.length || web.length ? (
            <View style={{ gap: 6 }}>
              {content ? <GrepOutput theme={theme} text={content} /> : null}
              {!content && files.length ? (
                <View style={{ borderWidth: 1, borderColor: c.border, paddingVertical: 4 }}>
                  {files.slice(0, 40).map((f) => (
                    <Text key={f} style={{ fontFamily: MONO, fontSize: 12, lineHeight: 19, paddingHorizontal: 10, color: c.foreground }}>
                      {f}
                    </Text>
                  ))}
                </View>
              ) : null}
              {web.length ? (
                <View style={{ borderWidth: 1, borderColor: c.border, paddingVertical: 4 }}>
                  {web.slice(0, 10).map((r, i) => (
                    <Text key={i} numberOfLines={1} style={{ fontSize: 12.5, lineHeight: 20, paddingHorizontal: 10, color: c.foreground }}>
                      {r.title ?? r.url}
                      <Text style={{ color: c.foregroundMuted }}>  {r.url}</Text>
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : undefined,
      };
    }
    case "fetch": {
      const url = str(d.url) ?? "";
      const code = num(d.code);
      const result = str(d.result);
      return {
        verb: "fetch",
        arg: url,
        meta: code != null ? <Mono color={code < 400 ? c.statusSuccess : c.statusDanger}>{code}</Mono> : null,
        body: result ? (
          <View style={{ borderWidth: 1, borderColor: c.border, padding: 10, maxHeight: 360, overflow: "hidden" }}>
            <Markdown text={result.slice(0, 6000)} theme={theme} size={13} />
          </View>
        ) : undefined,
      };
    }
    case "sub_agent": {
      const desc = str(d.description) ?? "";
      const kind = str(d.subAgentType);
      const actions = Array.isArray(d.actions) ? (d.actions as { toolName?: string; summary?: string }[]) : [];
      return {
        verb: "agent",
        arg: [kind, desc].filter(Boolean).join(" · "),
        meta: actions.length ? <Mono color={c.foregroundMuted}>{actions.length} steps</Mono> : null,
        body: actions.length ? (
          <View style={{ borderWidth: 1, borderColor: c.border, paddingVertical: 4 }}>
            {actions.map((a, i) => (
              <Text key={i} numberOfLines={1} style={{ fontFamily: MONO, fontSize: 12, lineHeight: 19, paddingHorizontal: 10, color: c.foreground }}>
                <Text style={{ color: c.foregroundMuted }}>{i === actions.length - 1 ? "└─ " : "├─ "}</Text>
                <Text style={{ color: c.accent }}>{a.toolName}</Text>
                {a.summary ? <Text style={{ color: c.foregroundMuted }}>  {a.summary}</Text> : null}
              </Text>
            ))}
          </View>
        ) : undefined,
      };
    }
    case "plan": {
      const text = str(d.text) ?? "";
      return {
        verb: "plan",
        arg: text.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") ?? "",
        open: true,
        body: (
          <View style={{ borderWidth: 1, borderColor: c.border, padding: 12 }}>
            <Markdown text={text} theme={theme} size={13.5} />
          </View>
        ),
      };
    }
    case "plain_text": {
      const label = str(d.label) ?? data.name;
      const text = str(d.text);
      return {
        verb: data.name.toLowerCase().slice(0, 10),
        arg: label,
        body: text ? <OutputBlock theme={theme} text={text} /> : undefined,
      };
    }
    default:
      return null;
  }
}

function GrepOutput({ theme, text }: { theme: PluginTheme; text: string }) {
  const c = theme.colors;
  const lines = text.replace(/\n$/, "").split("\n").slice(0, 200);
  return (
    <View style={{ borderWidth: 1, borderColor: c.border, paddingVertical: 6, maxHeight: 320, overflow: "hidden" }}>
      {lines.map((line, i) => {
        const m = /^([^:\s][^:]*):(\d+):(.*)$/.exec(line);
        return (
          <Text key={i} selectable numberOfLines={1} style={{ fontFamily: MONO, fontSize: 12, lineHeight: 19, paddingHorizontal: 10 }}>
            {m ? (
              <>
                <Text style={{ color: c.accent }}>{m[1]}</Text>
                <Text style={{ color: c.foregroundMuted }}>:{m[2]}:</Text>
                <Text style={{ color: c.foreground }}>{m[3]}</Text>
              </>
            ) : (
              <Text style={{ color: c.foreground }}>{line}</Text>
            )}
          </Text>
        );
      })}
    </View>
  );
}

function ToolRow({ item, theme }: PluginTimelineItemProps<ToolData>) {
  const c = theme.colors;
  const data = item.data;
  const view = describeTool(data, theme);
  const [open, setOpen] = useState<boolean | null>(null);
  if (!view) return null;
  const isOpen = open ?? !!view.open;
  const status = data.status;
  const glyph = status === "completed" ? "✓" : status === "failed" ? "✗" : status === "canceled" ? "–" : "●";
  const glyphColor =
    status === "completed" ? c.statusSuccess : status === "failed" ? c.statusDanger : status === "canceled" ? c.foregroundMuted : c.accent;
  const expandable = !!view.body;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen, disabled: !expandable }}
        accessibilityLabel={`${view.verb} ${view.arg}, ${status}`}
        disabled={!expandable}
        onPress={() => setOpen(!isOpen)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          minHeight: 26,
          paddingHorizontal: 8,
          backgroundColor: pressed ? alpha(c.surface2, 0.6) : isOpen ? alpha(c.surface2, 0.3) : "transparent",
          borderLeftWidth: 2,
          borderColor: isOpen ? c.accent : "transparent",
        })}
      >
        <Text style={{ fontFamily: MONO, fontSize: 12, color: glyphColor, fontWeight: "700", width: 12 }}>{glyph}</Text>
        <Text style={{ fontFamily: MONO, fontSize: 12, color: c.foregroundMuted, width: 46 }}>{view.verb}</Text>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: MONO, fontSize: 12.5, color: c.foreground }}>
          {view.arg}
        </Text>
        {view.meta}
        {expandable ? (
          <Text style={{ fontFamily: MONO, fontSize: 12, color: c.foregroundMuted, width: 10 }}>{isOpen ? "▾" : "▸"}</Text>
        ) : (
          <View style={{ width: 10 }} />
        )}
      </Pressable>
      {data.error && status === "failed" && !isOpen ? (
        <Text style={{ fontFamily: MONO, fontSize: 12, color: c.statusDanger, paddingLeft: 32 }} numberOfLines={1}>
          {data.error}
        </Text>
      ) : null}
      {isOpen && view.body ? <View style={{ paddingLeft: 30, paddingTop: 4, paddingBottom: 8 }}>{view.body}</View> : null}
    </View>
  );
}

/* --------------------------------------------------------- registration */

export interface ChatToggles {
  chatAssistant: boolean;
  chatTools: boolean;
  chatReasoning: boolean;
  chatTodos: boolean;
}

const HANDLED_TOOL_DETAILS = new Set(["shell", "read", "write", "edit", "search", "fetch", "sub_agent", "plan", "plain_text"]);

const errorText = (e: unknown): string | null => {
  if (e == null) return null;
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
};

/** Registers renderers once and transformers per toggle. Returns an applier and a cleanup. */
export function createChat(client: PluginClientContext) {
  const removers: (() => void)[] = [
    client.addTimelineRenderer({ kind: "deck-assistant", version: 1, schema: assistantSchema, Component: AssistantRow }),
    client.addTimelineRenderer({ kind: "deck-reasoning", version: 1, schema: reasoningSchema, Component: ReasoningRow }),
    client.addTimelineRenderer({ kind: "deck-tool", version: 1, schema: toolSchema, Component: ToolRow }),
    client.addTimelineRenderer({ kind: "deck-todo", version: 1, schema: todoSchema, Component: TodoRow }),
  ];
  const active = new Map<keyof ChatToggles, () => void>();
  let current: ChatToggles | null = null;

  const register = (key: keyof ChatToggles): (() => void) => {
    switch (key) {
      case "chatAssistant":
        return client.addTimelineTransformer({
          id: "deck-assistant",
          query: { itemType: "assistant_message" },
          transform: ({ item, phase }) => ({
            items: [{ type: "plugin", kind: "deck-assistant", version: 1, data: { text: item.text, phase } }],
          }),
        });
      case "chatReasoning":
        return client.addTimelineTransformer({
          id: "deck-reasoning",
          query: { itemType: "reasoning" },
          transform: ({ item, phase }) => ({
            items: [{ type: "plugin", kind: "deck-reasoning", version: 1, data: { text: item.text, phase } }],
          }),
        });
      case "chatTodos":
        return client.addTimelineTransformer({
          id: "deck-todo",
          query: { itemType: "todo" },
          transform: ({ item }) => ({
            items: [
              {
                type: "plugin",
                kind: "deck-todo",
                version: 1,
                data: {
                  items: item.items.map((t) => ({
                    text: t.text,
                    completed: t.completed,
                    ...(t.status ? { status: t.status } : {}),
                    ...(t.activeForm ? { activeForm: t.activeForm } : {}),
                  })),
                },
              },
            ],
          }),
        });
      case "chatTools":
        return client.addTimelineTransformer({
          id: "deck-tool",
          query: { itemType: "tool_call" },
          transform: ({ item, phase }) => {
            if (!HANDLED_TOOL_DETAILS.has(item.detail.type)) return undefined;
            return {
              items: [
                {
                  type: "plugin",
                  kind: "deck-tool",
                  version: 1,
                  data: JSON.parse(
                    JSON.stringify({
                      name: item.name,
                      status: item.status,
                      error: errorText(item.error),
                      detail: item.detail,
                      phase,
                    }),
                  ),
                },
              ],
            };
          },
        });
    }
  };

  const apply = (next: ChatToggles) => {
    if (
      current &&
      current.chatAssistant === next.chatAssistant &&
      current.chatTools === next.chatTools &&
      current.chatReasoning === next.chatReasoning &&
      current.chatTodos === next.chatTodos
    ) {
      return;
    }
    current = { ...next };
    for (const key of Object.keys(next) as (keyof ChatToggles)[]) {
      const want = next[key];
      const has = active.has(key);
      if (want && !has) active.set(key, register(key));
      if (!want && has) {
        active.get(key)?.();
        active.delete(key);
      }
    }
  };

  const dispose = () => {
    for (const remove of active.values()) remove();
    active.clear();
    for (const remove of removers) remove();
  };

  return { apply, dispose };
}
