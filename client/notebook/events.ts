import { useSyncExternalStore } from "react";

/**
 * Notebook signals shared by the screen, the panel and anything that pins.
 * `notePinned` refreshes open notebooks; `focusNote` asks them to show a note,
 * including one that mounts right after (a panel the pin just opened).
 */

interface State {
  /** Bumped on every pin. */
  pins: number;
  focus: { id: string; at: number } | null;
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

export function focusNote(id: string): void {
  set({ ...state, focus: { id, at: Date.now() } });
}

/** A focus request older than this is ignored by a notebook that mounts later. */
export const FOCUS_FRESH_MS = 5_000;

export function useNotebookEvents(): State {
  return useSyncExternalStore(subscribe, get, get);
}
