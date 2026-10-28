import { useSyncExternalStore } from "react";

/**
 * Notebook signals shared by the screen, the panel and anything that pins.
 * `notePinned` refreshes open notebooks; `focusTopic` asks them to show a topic.
 */

interface State {
  /** Bumped on every pin. */
  pins: number;
  focus: { slug: string; nonce: number } | null;
}

let state: State = { pins: 0, focus: null };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const get = () => state;

export function notePinned(): void {
  set({ ...state, pins: state.pins + 1 });
}

export function focusTopic(slug: string): void {
  set({ ...state, focus: { slug, nonce: (state.focus?.nonce ?? 0) + 1 } });
}

export function useNotebookEvents(): State {
  return useSyncExternalStore(subscribe, get, get);
}
