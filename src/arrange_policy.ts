/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Pure placement math behind "Arrange visible": wrap a list of
 * stacks into columns, then find the free spot nearest the view for the
 * resulting block. Free of DOM and Blockly so it can be unit-tested headlessly.
 */
import type {Box} from './view_policy';

export interface Size {
  width: number;
  height: number;
}

export interface Packed {
  /** Top-left of each input, relative to the block's own top-left, in input order. */
  offsets: Array<{x: number; y: number}>;
  width: number;
  height: number;
}

/**
 * Lays `sizes` out top to bottom, starting a new column to the right whenever
 * the next one would push the column past `maxHeight` (a column always holds
 * at least one, so a stack taller than `maxHeight` just gets its own).
 */
export function packColumns(sizes: Size[], maxHeight: number, gap: number): Packed {
  const offsets: Array<{x: number; y: number}> = [];
  let x = 0;
  let y = 0;
  let columnWidth = 0;
  let height = 0;
  sizes.forEach((size, i) => {
    if (y > 0 && y + size.height > maxHeight) {
      x += columnWidth + gap;
      y = 0;
      columnWidth = 0;
    }
    offsets[i] = {x, y};
    columnWidth = Math.max(columnWidth, size.width);
    y += size.height + gap;
    height = Math.max(height, y - gap);
  });
  return {offsets, width: sizes.length ? x + columnWidth : 0, height};
}

/** How many of the nearest obstacles contribute candidate positions. */
const CANDIDATE_OBSTACLES = 60;

const overlaps = (a: Box, b: Box, pad: number) =>
  a.left < b.right + pad &&
  a.right > b.left - pad &&
  a.top < b.bottom + pad &&
  a.bottom > b.top - pad;

/**
 * Top-left for a `width` x `height` block that overlaps no obstacle (each
 * kept `padding` away) and sits as close as possible to `near`.
 *
 * Candidates come from `near` and from the edges of the obstacles closest to
 * it, so a gap further out than those is not found; when nothing fits, the
 * block goes just outside every obstacle (past the right edge, or the left
 * in RTL), level with the topmost one.
 */
export function findFreeSpot(
  width: number,
  height: number,
  obstacles: Box[],
  near: {x: number; y: number},
  padding: number,
  rtl = false,
): {left: number; top: number} {
  const wantLeft = near.x - width / 2;
  const wantTop = near.y - height / 2;
  const free = (left: number, top: number) => {
    const block = {left, top, right: left + width, bottom: top + height};
    return !obstacles.some((o) => overlaps(block, o, padding));
  };
  if (free(wantLeft, wantTop)) return {left: wantLeft, top: wantTop};

  const distance = (o: Box) =>
    Math.hypot((o.left + o.right) / 2 - near.x, (o.top + o.bottom) / 2 - near.y);
  const closest = [...obstacles]
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, CANDIDATE_OBSTACLES);
  const xs = new Set<number>([wantLeft]);
  const ys = new Set<number>([wantTop]);
  for (const o of closest) {
    xs.add(o.right + padding);
    xs.add(o.left - padding - width);
    xs.add(o.left);
    ys.add(o.bottom + padding);
    ys.add(o.top - padding - height);
    ys.add(o.top);
  }
  let best: {left: number; top: number} | null = null;
  let bestDistance = Infinity;
  for (const left of xs) {
    for (const top of ys) {
      const d = Math.hypot(left + width / 2 - near.x, top + height / 2 - near.y);
      if (d >= bestDistance || !free(left, top)) continue;
      best = {left, top};
      bestDistance = d;
    }
  }
  if (best) return best;

  if (!obstacles.length) return {left: wantLeft, top: wantTop};
  const top = Math.min(...obstacles.map((o) => o.top));
  return rtl
    ? {left: Math.min(...obstacles.map((o) => o.left)) - padding - width, top}
    : {left: Math.max(...obstacles.map((o) => o.right)) + padding, top};
}
