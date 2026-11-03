/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require("chai");
const assert = chai.assert;
const {
  MIN_READABLE_SCALE,
  fitFits,
  fitScaleFor,
  readingOrder,
  stepIndex,
} = require("../src/view_policy");

const box = (left, top, right, bottom) => ({left, top, right, bottom});

suite("view_policy", () => {
  suite("readingOrder", () => {
    const items = [
      {n: "c", b: box(0, 200, 10, 210)},
      {n: "b", b: box(50, 0, 60, 10)},
      {n: "a", b: box(10, 0, 20, 10)},
    ];
    test("sorts by top, then left", () => {
      assert.deepEqual(readingOrder(items, (i) => i.b).map((i) => i.n), ["a", "b", "c"]);
    });
    test("sorts by top, then right-to-left in RTL", () => {
      assert.deepEqual(readingOrder(items, (i) => i.b, true).map((i) => i.n), ["b", "a", "c"]);
    });
    test("does not mutate its input", () => {
      const copy = [...items];
      readingOrder(items, (i) => i.b);
      assert.deepEqual(items, copy);
    });
  });

  suite("fitScaleFor", () => {
    test("fits a large spread but never below the readable floor", () => {
      const s = fitScaleFor(box(0, 0, 100000, 100000), 800, 600, 40);
      assert.equal(s, MIN_READABLE_SCALE);
    });
    test("uses the floor it is given", () => {
      assert.equal(fitScaleFor(box(0, 0, 100000, 100000), 800, 600, 40, 0.7), 0.7);
      assert.equal(fitScaleFor(box(0, 0, 100000, 100000), 800, 600, 40, 0.2), 0.2);
    });
    test("defaults the floor to the readable scale", () => {
      assert.equal(fitScaleFor(box(0, 0, 100000, 100000), 800, 600, 40), MIN_READABLE_SCALE);
    });
    test("never zooms in past 1", () => {
      assert.equal(fitScaleFor(box(0, 0, 10, 10), 800, 600, 40), 1);
    });
    test("picks the exact fit in between", () => {
      // 800x600 view, 1000x500 content (+80 padding): width-limited, 800/1080.
      const s = fitScaleFor(box(0, 0, 1000, 500), 800, 600, 40);
      assert.closeTo(s, 800 / 1080, 1e-9);
    });
  });

  suite("fitFits", () => {
    test("true when the scaled bounds fit, false when they do not", () => {
      const b = box(0, 0, 1000, 500);
      assert.isTrue(fitFits(b, 800, 600, 40, 800 / 1080));
      assert.isFalse(fitFits(b, 800, 600, 40, 0.5 + 0.3));
    });
  });

  suite("stepIndex", () => {
    test("starts at the first going forward and the last going back", () => {
      assert.equal(stepIndex(-1, 1, 5), 0);
      assert.equal(stepIndex(-1, -1, 5), 4);
    });
    test("wraps at both ends", () => {
      assert.equal(stepIndex(4, 1, 5), 0);
      assert.equal(stepIndex(0, -1, 5), 4);
    });
    test("moves one at a time", () => {
      assert.equal(stepIndex(2, 1, 5), 3);
      assert.equal(stepIndex(2, -1, 5), 1);
    });
    test("is -1 with nothing to step through", () => {
      assert.equal(stepIndex(-1, 1, 0), -1);
    });
  });
});
