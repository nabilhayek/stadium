import { useCallback, useReducer } from "react";
import type { SeatMapDoc } from "@/lib/seatmap/schema";

const LIMIT = 100;
/** Edits to the same field within this window undo as one step (typing a number, nudging). */
const COALESCE_MS = 1200;

type State = { doc: SeatMapDoc; past: SeatMapDoc[]; future: SeatMapDoc[]; key: string | null; at: number };
type Action =
  | { type: "commit"; doc: SeatMapDoc; key: string | null; at: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; doc: SeatMapDoc };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "commit": {
      if (action.doc === state.doc) return state;
      const merge = action.key !== null && action.key === state.key && action.at - state.at < COALESCE_MS && state.past.length > 0;
      return {
        doc: action.doc,
        past: merge ? state.past : [...state.past.slice(-(LIMIT - 1)), state.doc],
        future: [],
        key: action.key,
        at: action.at,
      };
    }
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { doc: prev, past: state.past.slice(0, -1), future: [state.doc, ...state.future], key: null, at: 0 };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { doc: next, past: [...state.past, state.doc], future: rest, key: null, at: 0 };
    }
    case "reset":
      return { doc: action.doc, past: [], future: [], key: null, at: 0 };
  }
}

export function useHistory(initial: SeatMapDoc) {
  const [state, dispatch] = useReducer(reducer, { doc: initial, past: [], future: [], key: null, at: 0 });
  const commit = useCallback((doc: SeatMapDoc, key: string | null = null) => dispatch({ type: "commit", doc, key, at: Date.now() }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return { doc: state.doc, canUndo: state.past.length > 0, canRedo: state.future.length > 0, commit, undo, redo };
}
