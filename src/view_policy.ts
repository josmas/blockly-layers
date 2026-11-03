/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Pure helpers behind how the workspace view follows the active
 * layers: the order stacks are stepped
 * through, and the zoom an explicit "Fit" is allowed to pick. Free of DOM and
 * Blockly so it can be unit-tested headlessly.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Default for the smallest scale a fit will pick. Below this, blocks are too
 * small to work on, so the fit shows the first stack at this scale instead
 * and the stepping controls reach the rest. A host's own zoom `minScale` is
 * about how far a user may zoom, not how small is still readable, so it can
 * be far lower than this.
 */
export const MIN_READABLE_SCALE = 0.5;

/** Top-to-bottom, then in the language's reading direction within a tie. */
export function readingOrder<T>(
  items: T[],
  boxOf: (item: T) => Box,
  rtl = false,
): T[] {
  return [...items].sort((a, b) => {
    const ba = boxOf(a);
    const bb = boxOf(b);
    if (ba.top !== bb.top) return ba.top - bb.top;
    return rtl ? bb.right - ba.right : ba.left - bb.left;
  });
}

/**
 * The scale that fits `bounds` (workspace units) in a view of the given pixel
 * size, kept between a readable floor and 1 (never zoom in past actual size).
 *
 * @param floor The smallest scale to return, even if that means `bounds`
 *     don't fit.
 */
export function fitScaleFor(
  bounds: Box,
  viewWidth: number,
  viewHeight: number,
  padding: number,
  floor = MIN_READABLE_SCALE,
): number {
  const fit = Math.min(
    viewWidth / (bounds.right - bounds.left + 2 * padding),
    viewHeight / (bounds.bottom - bounds.top + 2 * padding),
  );
  return Math.max(floor, Math.min(1, fit));
}

/** Whether `fitScaleFor` had to give up on showing everything. */
export function fitFits(
  bounds: Box,
  viewWidth: number,
  viewHeight: number,
  padding: number,
  scale: number,
): boolean {
  return (
    (bounds.right - bounds.left + 2 * padding) * scale <= viewWidth &&
    (bounds.bottom - bounds.top + 2 * padding) * scale <= viewHeight
  );
}

/**
 * Index to step to from `current` (-1 when nothing has been stepped to yet),
 * wrapping at both ends. Returns -1 when there is nothing to step through.
 */
export function stepIndex(current: number, delta: 1 | -1, total: number): number {
  if (total <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

/**
 * The most stacks a fit will mark with the "selected" styling. Measured with
 * the zelos renderer, whose selection is an SVG glow filter: frame time
 * while panning is unchanged up to about 30 marked stacks and roughly doubles
 * by 60 (geras, which only restyles the outline, shows no cost at any count).
 * Past this the marks are skipped; dimming already shows which stacks are
 * active.
 */
export const MAX_MARKED_STACKS = 30;
