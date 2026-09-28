import { useSyncExternalStore } from 'react';
import type { ColorToken, ShapeKind, Tool } from '../engine/types';

export interface ToolStyle {
  color: ColorToken;
  size: number;
}

export type AppearancePref = 'system' | 'light' | 'dark';

/**
 * Chosen at first launch. 'mobile' = touch-first (tablets & phones):
 * finger/Pencil drawing, pinch to zoom, no hover-only controls.
 * 'desktop' = mouse, trackpad & keyboard: zoom bar, shortcut hints.
 */
export type DevicePref = 'mobile' | 'desktop';

export type EraserMode = 'object' | 'segment';

/** Tools that can appear in the dock, in their default order. */
export const DOCK_TOOLS = ['select', 'hand', 'pen', 'highlighter', 'eraser', 'laser', 'shape', 'dot', 'text', 'image'] as const;
export type DockTool = (typeof DOCK_TOOLS)[number];

export interface UIState {
  tool: Tool;
  shapeKind: ShapeKind;
  pen: ToolStyle;
  highlighter: ToolStyle;
  shape: ToolStyle & { fill: boolean };
  text: ToolStyle;
  noteTint: ColorToken;
  /** Dot tool: color and diameter in screen px. */
  dot: ToolStyle;
  /** Dots dropped near a circle land exactly on it (Bohr model orbits). */
  snapDots: boolean;
  /** Which kind the Text tool places: a free text box or a sticky note. */
  textKind: 'text' | 'note';
  eraserSize: number;
  /** Whole objects, or only the part of a stroke the eraser touches. */
  eraserMode: EraserMode;
  /** Ink smoothing 0–1 for new pen strokes. */
  penSmoothing: number;
  /** Use stylus pressure (and simulated pressure for touch/mouse); off = constant width. */
  penPressure: boolean;
  /** Moves, shapes and new objects snap to the page's grid. */
  snapGrid: boolean;
  /** Dock layout: visible tools in order (customizable in Settings). */
  dockTools: DockTool[];
  /** Keyboard shortcuts sheet. */
  shortcutsOpen: boolean;
  /** Customize Toolbar sheet. */
  customizeOpen: boolean;
  /** Hold the pen still at the end of a stroke to snap it into a shape. */
  snapShapes: boolean;
  appearance: AppearancePref;
  /** null until the first-run question is answered. */
  device: DevicePref | null;
  /** First name for the Home welcome; null until asked, '' if skipped. */
  name: string | null;
  /** WebGL Liquid Glass on toolbars (falls back to CSS blur when off). */
  liquidGlass: boolean;
  selection: ReadonlySet<string>;
  pagesOpen: boolean;
  timerOpen: boolean;
  curtain: { on: boolean; y: number };
  /** LaTeX equation sheet; `editId` re-edits an existing equation. */
  equation: { open: boolean; editId: string | null };
  /** Elements app (science presets such as the Bohr model). */
  elementsOpen: boolean;
  /** Transient HUD message (e.g. "Shape snapped"). */
  toast: string | null;
}

/** In-app credits line. */
export const CREDITS = 'Flow by Workable using Claude © 2026';

const PREFS_KEY = 'flow:prefs:v1';
const PERSISTED: (keyof UIState)[] = [
  'pen', 'highlighter', 'shape', 'text', 'noteTint', 'dot', 'snapDots', 'textKind', 'eraserSize', 'eraserMode', 'penSmoothing', 'penPressure',
  'snapGrid', 'dockTools', 'snapShapes', 'appearance', 'liquidGlass', 'shapeKind', 'device', 'name',
];

const initial: UIState = {
  tool: 'pen',
  shapeKind: 'rect',
  pen: { color: 'label', size: 4 },
  highlighter: { color: 'yellow', size: 22 },
  shape: { color: 'blue', size: 4, fill: false },
  text: { color: 'label', size: 28 },
  noteTint: 'yellow',
  dot: { color: 'label', size: 12 },
  snapDots: true,
  textKind: 'text',
  eraserSize: 16,
  eraserMode: 'object',
  penSmoothing: 0.5,
  penPressure: true,
  snapGrid: false,
  dockTools: [...DOCK_TOOLS],
  shortcutsOpen: false,
  customizeOpen: false,
  snapShapes: true,
  appearance: 'system',
  device: null,
  name: null,
  liquidGlass: true,
  selection: new Set(),
  pagesOpen: false,
  timerOpen: false,
  curtain: { on: false, y: 0.45 },
  equation: { open: false, editId: null },
  elementsOpen: false,
  toast: null,
};

function loadPrefs(): Partial<UIState> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function sanitizePrefs(p: Partial<UIState>): Partial<UIState> {
  if (p.dockTools && (!Array.isArray(p.dockTools) || !p.dockTools.every((t) => (DOCK_TOOLS as readonly string[]).includes(t)))) delete p.dockTools;
  return p;
}

let state: UIState = { ...initial, ...(typeof localStorage !== 'undefined' ? sanitizePrefs(loadPrefs()) : {}) };
const listeners = new Set<() => void>();
let saveTimer = 0;

export const ui = {
  get: () => state,
  set(patch: Partial<UIState> | ((s: UIState) => Partial<UIState>)) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
    listeners.forEach((fn) => fn());
    if (PERSISTED.some((k) => k in next)) {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, state[k]]))));
        } catch { /* storage unavailable */ }
      }, 300);
    }
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useUI<T>(selector: (s: UIState) => T): T {
  return useSyncExternalStore(ui.subscribe, () => selector(state), () => selector(initial));
}

/**
 * Mobile favors performance: decorative motion (Home ⇄ Board reveal, canvas
 * page transitions, Home glitter) and WebGL glass are skipped. Toolbars stay.
 */
export const lightweight = () => state.device === 'mobile';

let toastTimer = 0;
export function toast(message: string) {
  ui.set({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.set({ toast: null }), 1600);
}

export const setTool = (tool: Tool) =>
  ui.set({
    tool,
    selection: tool === 'select' ? state.selection : new Set(),
    ...(tool === 'text' || tool === 'note' ? { textKind: tool } : {}),
  });

// The two app sheets share a spot at the top right, so opening one closes the other.
export const openEquation = (editId: string | null = null) => ui.set({ equation: { open: true, editId }, elementsOpen: false });
export const openElements = () => ui.set({ elementsOpen: true, equation: { open: false, editId: null } });

/** Forget the user profile so the first-launch welcome runs again. Lessons are kept. */
export const resetProfile = () => ui.set({ name: null, device: null });
