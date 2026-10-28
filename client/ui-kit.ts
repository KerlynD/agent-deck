import type { PluginTheme } from "@getpaseo/plugin";
import { Platform } from "react-native";

/** Monospace stack. On web it prefers the fonts people rice with, if installed. */
export const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default:
    "'JetBrains Mono', 'Berkeley Mono', 'Iosevka Term', 'Iosevka', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});

export type Colors = PluginTheme["colors"];

/** Hex with alpha, for tints. Accepts #rgb or #rrggbb. */
export function alpha(hex: string, a: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return hex;
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${h}${v}`;
}

export function isDark(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

export function dirname(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}
