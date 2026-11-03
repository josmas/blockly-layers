/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require("chai");
const assert = chai.assert;
const {findFreeSpot, packColumns} = require("../src/arrange_policy");

const box = (left, top, right, bottom) => ({left, top, right, bottom});
const size = (width, height) => ({width, height});

const overlapsAny = (spot, w, h, obstacles, pad) =>
  obstacles.some(
    (o) =>
      spot.left < o.right + pad &&
      spot.left + w > o.left - pad &&
      spot.top < o.bottom + pad &&
      spot.top + h > o.top - pad,
  );

suite("arrange_policy", () => {
  suite("packColumns", () => {
    test("stacks in one column while it fits", () => {
      const p = packColumns([size(100, 30), size(80, 30), size(120, 30)], 200, 10);
      assert.deepEqual(p.offsets, [
        {x: 0, y: 0},
        {x: 0, y: 40},
        {x: 0, y: 80},
      ]);
      assert.equal(p.width, 120);
      assert.equal(p.height, 110);
    });

    test("wraps to a new column, spaced by the widest in the last", () => {
      const p = packColumns([size(100, 60), size(80, 60), size(50, 60), size(70, 60)], 130, 10);
      // 60 + 10 + 60 = 130 fits; the third would not.
      assert.deepEqual(p.offsets.map((o) => o.x), [0, 0, 110, 110]);
      assert.deepEqual(p.offsets.map((o) => o.y), [0, 70, 0, 70]);
      assert.equal(p.width, 110 + 70);
      assert.equal(p.height, 130);
    });

    test("a stack taller than the limit still gets a column of its own", () => {
      const p = packColumns([size(10, 500), size(10, 20), size(10, 20)], 100, 5);
      assert.deepEqual(p.offsets, [
        {x: 0, y: 0},
        {x: 15, y: 0},
        {x: 15, y: 25},
      ]);
      assert.equal(p.height, 500);
    });

    test("nothing in, nothing out", () => {
      assert.deepEqual(packColumns([], 100, 10), {offsets: [], width: 0, height: 0});
    });
  });

  suite("findFreeSpot", () => {
    test("centres on the view when that spot is already free", () => {
      const spot = findFreeSpot(100, 60, [box(1000, 1000, 1100, 1100)], {x: 200, y: 200}, 40);
      assert.deepEqual(spot, {left: 150, top: 170});
    });

    test("with no obstacles, centres on the view", () => {
      assert.deepEqual(findFreeSpot(100, 60, [], {x: 0, y: 0}, 40), {left: -50, top: -30});
    });

    test("moves to the nearest gap when the centre is taken", () => {
      const wall = box(100, 100, 300, 300);
      const spot = findFreeSpot(100, 60, [wall], {x: 200, y: 200}, 40);
      assert.isFalse(overlapsAny(spot, 100, 60, [wall], 40));
      // Nearest is just above/below/beside the wall, not far away.
      const cx = spot.left + 50;
      const cy = spot.top + 30;
      assert.isBelow(Math.hypot(cx - 200, cy - 200), 220);
    });

    test("keeps the padding clear of every obstacle", () => {
      const obstacles = [
        box(0, 0, 100, 100),
        box(140, 0, 240, 100),
        box(0, 140, 100, 240),
        box(140, 140, 240, 240),
      ];
      const spot = findFreeSpot(60, 60, obstacles, {x: 120, y: 120}, 40);
      assert.isFalse(overlapsAny(spot, 60, 60, obstacles, 40));
    });

    test("uses a real gap between obstacles when it is big enough", () => {
      const obstacles = [box(0, 0, 100, 400), box(300, 0, 400, 400)];
      // Gap is 200 wide; a 100-wide block plus 40 padding each side fits.
      const spot = findFreeSpot(100, 100, obstacles, {x: 200, y: 200}, 40);
      assert.isAtLeast(spot.left, 140);
      assert.isAtMost(spot.left + 100, 260);
    });

    // A dense field: many obstacles, so the nearest ones offer no gap and the
    // block has to go outside it.
    const dense = () => {
      const obstacles = [];
      for (let x = 0; x < 1500; x += 100) {
        for (let y = 0; y < 1500; y += 100) {
          obstacles.push(box(x, y, x + 95, y + 95));
        }
      }
      return obstacles;
    };

    test("goes outside every obstacle when no gap is near", () => {
      const obstacles = dense();
      const spot = findFreeSpot(300, 300, obstacles, {x: 700, y: 700}, 40);
      assert.isFalse(overlapsAny(spot, 300, 300, obstacles, 40));
      assert.equal(spot.left, 1495 + 40);
      assert.equal(spot.top, 0);
    });

    test("in RTL the fallback goes past the left edge instead", () => {
      const obstacles = dense();
      const spot = findFreeSpot(300, 300, obstacles, {x: 700, y: 700}, 40, true);
      assert.isFalse(overlapsAny(spot, 300, 300, obstacles, 40));
      assert.equal(spot.left + 300, 0 - 40);
    });

    test("finds a spot quickly among hundreds of obstacles", () => {
      const obstacles = dense();
      const t = Date.now();
      findFreeSpot(300, 300, obstacles, {x: 700, y: 700}, 40);
      assert.isBelow(Date.now() - t, 500);
    });
  });
});
