/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Pure helpers behind the layer panel's per-user view state
 * (mode, position, dock width, collapsed/expanded) and its geometry. Kept free
 * of DOM and Blockly so it can be unit-tested headlessly; callers pass in the
 * `Storage` to use.
 */

export type PanelMode = 'floating' | 'docked';

export interface PanelOffset {
  dx: number;
  dy: number;
}

export interface PanelState {
  mode: PanelMode;
  /** Offset from the unbumped top-right (top-left in RTL) corner; null = never moved. */
  floatOffset: PanelOffset | null;
  dockWidth: number;
  collapsed: boolean;
  expandedSections: string[];
}

export const DEFAULT_STORAGE_KEY = 'blockly-layers:panel';
export const MIN_DOCK_WIDTH = 160;
export const MAX_DOCK_WIDTH = 600;
export const DEFAULT_DOCK_WIDTH = 240;

export const DEFAULT_PANEL_STATE: PanelState = {
  mode: 'floating',
  floatOffset: null,
  dockWidth: DEFAULT_DOCK_WIDTH,
  collapsed: false,
  expandedSections: [],
};

/** The slice of the DOM `Storage` interface this module needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function clampDockWidth(width: number): number {
  return Math.min(MAX_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, width));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Reads the saved state, falling back field by field to `defaults` (then to
 * the built-in defaults) for anything missing, ill-typed, or unreadable. Never
 * throws: storage may be absent, blocked, or hold garbage.
 */
export function loadState(
  storage: StorageLike | null,
  key: string,
  defaults: Partial<PanelState> = {},
): PanelState {
  const base: PanelState = {...DEFAULT_PANEL_STATE, expandedSections: []};
  // An option the host left unset arrives as `undefined`; spreading it would
  // clobber the built-in default.
  for (const [field, value] of Object.entries(defaults)) {
    if (value !== undefined) (base as unknown as Record<string, unknown>)[field] = value;
  }
  base.expandedSections = [...base.expandedSections];
  let raw: unknown;
  try {
    const text = storage?.getItem(key);
    if (!text) return base;
    raw = JSON.parse(text);
  } catch {
    return base;
  }
  if (!raw || typeof raw !== 'object') return base;
  const saved = raw as Record<string, unknown>;

  if (saved.mode === 'floating' || saved.mode === 'docked') {
    base.mode = saved.mode;
  }
  if (saved.floatOffset === null) {
    base.floatOffset = null;
  } else if (saved.floatOffset && typeof saved.floatOffset === 'object') {
    const {dx, dy} = saved.floatOffset as Record<string, unknown>;
    if (isFiniteNumber(dx) && isFiniteNumber(dy)) {
      base.floatOffset = {dx, dy};
    }
  }
  if (isFiniteNumber(saved.dockWidth)) {
    base.dockWidth = clampDockWidth(saved.dockWidth);
  }
  if (typeof saved.collapsed === 'boolean') {
    base.collapsed = saved.collapsed;
  }
  if (
    Array.isArray(saved.expandedSections) &&
    saved.expandedSections.every((s) => typeof s === 'string')
  ) {
    base.expandedSections = [...(saved.expandedSections as string[])];
  }
  return base;
}

/** Writes the state; silently does nothing if storage is unavailable or throws. */
export function saveState(
  storage: StorageLike | null,
  key: string,
  state: PanelState,
): void {
  try {
    storage?.setItem(key, JSON.stringify(state));
  } catch {
    // Quota exceeded, blocked, or private mode: the panel works without it.
  }
}

/**
 * Returns the `localStorage` of the current page, or null when the accessor
 * itself throws (blocked site data, sandboxed frames).
 */
export function getBrowserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Clamps `offset` so a panel of `size` anchored at `anchor` stays inside
 * `bounds` (a box of `width` x `height` at the origin). A panel larger than
 * the bounds is pinned to the top-left edge.
 */
export function clampOffset(
  offset: PanelOffset,
  anchor: {left: number; top: number},
  size: {width: number; height: number},
  bounds: {width: number; height: number},
): PanelOffset {
  const maxLeft = Math.max(0, bounds.width - size.width);
  const maxTop = Math.max(0, bounds.height - size.height);
  const left = Math.min(maxLeft, Math.max(0, anchor.left + offset.dx));
  const top = Math.min(maxTop, Math.max(0, anchor.top + offset.dy));
  return {dx: left - anchor.left, dy: top - anchor.top};
}

/**
 * The tallest a panel placed at `top`, spanning `left..right`, may be without
 * reaching the nearest already-placed box below it that overlaps its column
 * (e.g. zoom controls and trash can at the bottom right). With nothing below,
 * the limit is the bottom of the workspace. Never less than `minHeight`.
 */
export function capHeight(
  top: number,
  left: number,
  right: number,
  placed: Box[],
  margin: number,
  boundsHeight: number,
  minHeight: number,
): number {
  let limit = boundsHeight - margin;
  for (const box of placed) {
    const overlapsColumn = box.left < right && box.right > left;
    if (overlapsColumn && box.top >= top && box.top - margin < limit) {
      limit = box.top - margin;
    }
  }
  return Math.max(minHeight, limit - top);
}
