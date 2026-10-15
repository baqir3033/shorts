import { EDIT_HISTORY_MAX } from "@/lib/constants";
import type { EditSpec, EditorHistory } from "./types";

export function createHistory(present: EditSpec): EditorHistory {
  return { past: [], present, future: [] };
}

export function pushSpec(history: EditorHistory, next: EditSpec): EditorHistory {
  const past = [...history.past, history.present].slice(-EDIT_HISTORY_MAX);
  return { past, present: next, future: [] };
}

export function undo(history: EditorHistory): EditorHistory {
  if (history.past.length === 0) return history;
  const past = [...history.past];
  const previous = past.pop()!;
  return {
    past,
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: EditorHistory): EditorHistory {
  if (history.future.length === 0) return history;
  const [next, ...rest] = history.future;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}

export function canUndo(history: EditorHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: EditorHistory): boolean {
  return history.future.length > 0;
}
