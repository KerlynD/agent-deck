import type { PluginPopoverProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useDeckSync } from "./controller";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import { formatUntil, mono, useNow } from "./format";
import { refreshUsage, type UsageResult, useUsage } from "./store";

type Provider = UsageResult["providers"][number];
type Window = Provider["windows"][number];

const CELLS = 20;

function usedPct(w: Window): number | null {
  if (w.usedPct != null) return Math.round(w.usedPct);
  if (w.remainingPct != null) return Math.round(100 - w.remainingPct);
  return null;
}

function windowColor(w: Window, theme: PluginTheme): string {
  const c = theme.colors;
  if (w.tone === "danger") return c.statusDanger;
  if (w.tone === "warning") return c.statusWarning;
  const pct = usedPct(w) ?? 0;
  if (w.tone == null && pct >= 80) return c.statusDanger;
  if (w.tone == null && pct >= 60) return c.statusWarning;
  return c.accent;
}

/** The most-used window across providers, for the sidebar summary. */
function worstWindow(providers: Provider[]): Window | null {
  let worst: Window | null = null;
  for (const p of providers) {
    if (p.status !== "available") continue;
    const pinned = p.windows.filter((w) => w.summary);
    for (const w of pinned.length > 0 ? pinned : p.windows) {
      const pct = usedPct(w);
      if (pct != null && (worst == null || pct > (usedPct(worst) ?? -1))) worst = w;
    }
  }
  return worst;
}

function Bar({ w, theme }: { w: Window; theme: PluginTheme }) {
  const pct = usedPct(w);
  const filled = pct == null ? 0 : Math.min(CELLS, Math.round((pct / 100) * CELLS));
  const color = windowColor(w, theme);
  return (
    <View
      style={{ flexDirection: "row", gap: 2, height: 8 }}
      accessibilityRole="progressbar"
      accessibilityLabel={`${w.label} ${pct ?? "unknown"} percent used`}
    >
      {Array.from({ length: CELLS }, (_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: i < filled ? color : theme.colors.surface2 }} />
      ))}
    </View>
  );
}

function UsagePopover({ theme }: PluginPopoverProps) {
  const { status, result, error, fetchedAt } = useUsage();
  const now = useNow(30_000);
  const c = theme.colors;
  const text = { color: c.foreground, fontFamily: mono, fontSize: 12 };
  const muted = { color: c.foregroundMuted, fontFamily: mono, fontSize: 12 };

  return (
    <View style={{ width: 320, maxWidth: "100%", backgroundColor: c.surface1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderColor: c.border }}>
        <Text style={[text, { flex: 1, fontWeight: "700", fontSize: 13 }]}>usage</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh usage" onPress={() => void refreshUsage()}>
          <Text style={{ color: c.accent, fontFamily: mono, fontSize: 12 }}>
            {status === "loading" ? "loading…" : "refresh"}
          </Text>
        </Pressable>
      </View>

      {status === "error" ? (
        <Text style={[muted, { color: c.statusDanger, padding: 12 }]}>{error}</Text>
      ) : null}
      {status === "ready" && result && result.providers.length === 0 ? (
        <Text style={[muted, { padding: 12 }]}>No providers report usage on this host.</Text>
      ) : null}

      {result?.providers.map((p) => (
        <View key={p.providerId} style={{ padding: 12, gap: 10, borderBottomWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text style={[text, { fontWeight: "700", color: c.accent }]}>{p.displayName}</Text>
            {p.planLabel ? <Text style={muted}>{p.planLabel}</Text> : null}
          </View>
          {p.status !== "available" ? (
            <Text style={[muted, { color: p.status === "error" ? c.statusDanger : c.foregroundMuted }]}>
              {p.error ?? "Usage unavailable"}
            </Text>
          ) : null}
          {p.windows.map((w) => {
            const pct = usedPct(w);
            const reset = formatUntil(w.resetsAt, now);
            return (
              <View key={w.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row" }}>
                  <Text style={[text, { flex: 1 }]} numberOfLines={1}>{w.label}</Text>
                  <Text style={[text, { fontWeight: "700", color: windowColor(w, theme) }]}>
                    {pct == null ? "—" : `${pct}%`}
                  </Text>
                </View>
                <Bar w={w} theme={theme} />
                {reset ? <Text style={[muted, { fontSize: 11 }]}>{reset}</Text> : null}
              </View>
            );
          })}
        </View>
      ))}

      {fetchedAt ? (
        <Text style={[muted, { fontSize: 11, padding: 12 }]}>
          updated {Math.max(0, Math.round((now - fetchedAt) / 60000))}m ago · refreshes every 5m
        </Text>
      ) : null}
    </View>
  );
}

export function UsageSidebarItem({ theme, openPopover }: PluginSidebarItemProps) {
  useDeckSync(theme);
  const { result } = useUsage();
  const worst = result ? worstWindow(result.providers) : null;
  const pct = worst ? usedPct(worst) : null;
  return (
    <SidebarRow
      icon="Gauge"
      label="Usage"
      onPress={() => openPopover(UsagePopover)}
      trailing={
        worst && pct != null ? (
          <Text style={{ color: windowColor(worst, theme), fontFamily: mono, fontSize: 11, fontWeight: "700" }}>
            {worst.shortLabel ? `${worst.shortLabel} ` : ""}
            {pct}%
          </Text>
        ) : null
      }
    />
  );
}
