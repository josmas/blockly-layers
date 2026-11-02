/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require("chai");
const assert = chai.assert;
const {
  DEFAULT_PANEL_STATE,
  MAX_DOCK_WIDTH,
  MIN_DOCK_WIDTH,
  capHeight,
  clampDockWidth,
  clampOffset,
  loadState,
  saveState,
} = require("../src/panel_state");

function fakeStorage(initial = {}) {
  const data = {...initial};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

suite("panel_state: load/save", function () {
  test("missing key and null storage give the defaults", function () {
    assert.deepEqual(loadState(fakeStorage(), "k"), DEFAULT_PANEL_STATE);
    assert.deepEqual(loadState(null, "k"), DEFAULT_PANEL_STATE);
  });

  test("round trips every field", function () {
    const storage = fakeStorage();
    const state = {
      mode: "docked",
      floatOffset: {dx: -30, dy: 12},
      dockWidth: 300,
      collapsed: true,
      expandedSections: ["Variables", "Procedures"],
    };
    saveState(storage, "k", state);
    assert.deepEqual(loadState(storage, "k"), state);
  });

  test("a stored value wins over the option default", function () {
    const storage = fakeStorage({k: JSON.stringify({mode: "floating"})});
    assert.equal(loadState(storage, "k", {mode: "docked"}).mode, "floating");
  });

  test("the option default applies when nothing is stored for that field", function () {
    const storage = fakeStorage({k: JSON.stringify({collapsed: true})});
    const state = loadState(storage, "k", {mode: "docked"});
    assert.equal(state.mode, "docked");
    assert.isTrue(state.collapsed);
  });

  test("an unset (undefined) option default does not clobber the built-in default", function () {
    assert.equal(loadState(null, "k", {mode: undefined}).mode, "floating");
  });

  test("corrupt JSON falls back to defaults", function () {
    assert.deepEqual(
      loadState(fakeStorage({k: "{not json"}), "k"),
      DEFAULT_PANEL_STATE,
    );
  });

  test("non-object JSON falls back to defaults", function () {
    for (const text of ["null", "42", '"x"', "[]"]) {
      assert.deepEqual(
        loadState(fakeStorage({k: text}), "k"),
        DEFAULT_PANEL_STATE,
        text,
      );
    }
  });

  test("ill-typed fields are ignored individually", function () {
    const storage = fakeStorage({
      k: JSON.stringify({
        mode: "sideways",
        floatOffset: {dx: "a", dy: 1},
        dockWidth: "wide",
        collapsed: "yes",
        expandedSections: ["ok", 3],
      }),
    });
    assert.deepEqual(loadState(storage, "k"), DEFAULT_PANEL_STATE);
  });

  test("explicit null floatOffset is kept", function () {
    const storage = fakeStorage({k: JSON.stringify({floatOffset: null})});
    assert.isNull(loadState(storage, "k").floatOffset);
  });

  test("a stored dock width is clamped into range", function () {
    const small = fakeStorage({k: JSON.stringify({dockWidth: 1})});
    const big = fakeStorage({k: JSON.stringify({dockWidth: 99999})});
    assert.equal(loadState(small, "k").dockWidth, MIN_DOCK_WIDTH);
    assert.equal(loadState(big, "k").dockWidth, MAX_DOCK_WIDTH);
  });

  test("storage that throws on get or set never throws out", function () {
    const throwing = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("quota");
      },
    };
    assert.deepEqual(loadState(throwing, "k"), DEFAULT_PANEL_STATE);
    assert.doesNotThrow(() => saveState(throwing, "k", DEFAULT_PANEL_STATE));
  });

  test("loadState does not alias the defaults' expandedSections array", function () {
    const state = loadState(null, "k");
    state.expandedSections.push("x");
    assert.deepEqual(DEFAULT_PANEL_STATE.expandedSections, []);
  });

  test("clampDockWidth bounds both ends", function () {
    assert.equal(clampDockWidth(0), MIN_DOCK_WIDTH);
    assert.equal(clampDockWidth(250), 250);
    assert.equal(clampDockWidth(10000), MAX_DOCK_WIDTH);
  });
});

suite("panel_state: clampOffset", function () {
  const anchor = {left: 700, top: 10};
  const size = {width: 220, height: 300};
  const bounds = {width: 930, height: 600};

  test("an offset that stays inside is unchanged", function () {
    assert.deepEqual(clampOffset({dx: -100, dy: 50}, anchor, size, bounds), {
      dx: -100,
      dy: 50,
    });
  });

  test("clamps past each edge", function () {
    assert.deepEqual(clampOffset({dx: -2000, dy: 0}, anchor, size, bounds), {
      dx: -700,
      dy: 0,
    });
    assert.deepEqual(clampOffset({dx: 500, dy: 0}, anchor, size, bounds), {
      dx: 10,
      dy: 0,
    });
    assert.deepEqual(clampOffset({dx: 0, dy: -50}, anchor, size, bounds), {
      dx: 0,
      dy: -10,
    });
    assert.deepEqual(clampOffset({dx: 0, dy: 9999}, anchor, size, bounds), {
      dx: 0,
      dy: 290,
    });
  });

  test("a panel larger than the workspace is pinned to the top-left", function () {
    const result = clampOffset(
      {dx: 50, dy: 50},
      anchor,
      {width: 1000, height: 1000},
      bounds,
    );
    assert.equal(anchor.left + result.dx, 0);
    assert.equal(anchor.top + result.dy, 0);
  });
});

suite("panel_state: capHeight", function () {
  const margin = 10;
  const minHeight = 120;

  test("with nothing placed, the limit is the workspace bottom", function () {
    assert.equal(capHeight(20, 700, 920, [], margin, 600, minHeight), 570);
  });

  test("stops above a box below that overlaps the column", function () {
    const zoom = {top: 500, bottom: 560, left: 880, right: 920};
    assert.equal(capHeight(20, 700, 920, [zoom], margin, 600, minHeight), 470);
  });

  test("ignores a box below that does not overlap the column", function () {
    const farLeft = {top: 500, bottom: 560, left: 10, right: 50};
    assert.equal(
      capHeight(20, 700, 920, [farLeft], margin, 600, minHeight),
      570,
    );
  });

  test("ignores boxes above, such as the backpack we already sit under", function () {
    const backpack = {top: 10, bottom: 70, left: 880, right: 920};
    assert.equal(
      capHeight(80, 700, 920, [backpack], margin, 600, minHeight),
      510,
    );
  });

  test("uses the nearest of several boxes below", function () {
    const trash = {top: 540, bottom: 590, left: 880, right: 920};
    const zoom = {top: 440, bottom: 530, left: 880, right: 920};
    assert.equal(
      capHeight(20, 700, 920, [trash, zoom], margin, 600, minHeight),
      410,
    );
  });

  test("never goes below the minimum height", function () {
    const zoom = {top: 60, bottom: 100, left: 880, right: 920};
    assert.equal(
      capHeight(20, 700, 920, [zoom], margin, 600, minHeight),
      minHeight,
    );
  });
});
