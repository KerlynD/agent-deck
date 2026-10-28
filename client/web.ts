import { Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses,
// and only touch these globals on web (desktop is web inside Electron).
interface StyleElement {
  id: string;
  textContent: string | null;
  remove(): void;
}
interface DocumentLike {
  getElementById(id: string): StyleElement | null;
  createElement(tag: "style"): StyleElement;
  head: { appendChild(node: StyleElement): void };
  documentElement: { style: { setProperty(name: string, value: string): void } };
}
declare const document: DocumentLike | undefined;
declare const navigator: { clipboard?: { writeText(text: string): Promise<void> } } | undefined;

export const isWeb = Platform.OS === "web";

/** Installs or replaces a <style> element by id. Returns a remover. No-op off web. */
export function setStyle(id: string, css: string): () => void {
  if (!isWeb || typeof document === "undefined") return () => {};
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
  return () => {
    document?.getElementById(id)?.remove();
  };
}

/** Writes CSS custom properties on :root so injected CSS can use the active theme. */
export function setRootVars(vars: Record<string, string>): void {
  if (!isWeb || typeof document === "undefined") return;
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value);
  }
}

export function canCopy(): boolean {
  return isWeb && typeof navigator !== "undefined" && !!navigator.clipboard;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (!canCopy() || !navigator?.clipboard) throw new Error("Copy is not available here");
  await navigator.clipboard.writeText(text);
}
