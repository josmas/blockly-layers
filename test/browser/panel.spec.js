/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Browser tests for the layers panel's floating and docked
 * modes, run against the `?fixture=1` page of the playground bundle (see
 * test/index.ts). Run with `npm run test:browser`.
 */
const {test, expect} = require("@playwright/test");

const KEY = "blockly-layers:panel";
const PANEL = ".blockly-layers-panel";
const HEADER = ".blockly-layers-panel-header";
const BACKPACK = "#stub-backpack";
const ZOOM = ".blocklyZoom";
const TRASH = ".blocklyTrash";

async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

/**
 * Opens the fixture. `state` is seeded into localStorage before the page
 * that the test sees (a reload after seeding); `blockStorage` makes every
 * localStorage access throw.
 */
async function open(page, {query = "", state = null, blockStorage = false} = {}) {
  if (blockStorage) {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("blocked");
        },
      });
    });
  }
  await page.goto(`/index.html?fixture=1${query}`);
  if (state) {
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
      [KEY, state],
    );
    await page.reload();
  }
  await page.waitForSelector(PANEL);
  await settle(page);
}

function rect(page, selector) {
  return page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  }, selector);
}

/**
 * The rectangle a positionable control reports to Blockly: the contract the
 * panel steps around. (An SVG group's DOM bounding box also includes hit
 * areas and clip paths, so it overstates what's visibly occupied.)
 */
function reported(page, componentId) {
  return page.evaluate((id) => {
    const component = window.fixture.workspace
      .getComponentManager()
      .getComponents("positionable", true)
      .find((c) => c.id === id);
    const r = component.getBoundingRectangle();
    return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
  }, componentId);
}

function svgWidth(page) {
  return page.evaluate(
    () => window.fixture.workspace.getParentSvg().getBoundingClientRect().width,
  );
}

function storedState(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
}

const intersects = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** A point on the header that is empty space, i.e. not on a button or the title. */
async function dragHandle(page) {
  const title = await rect(page, ".blockly-layers-panel-title");
  const actions = await rect(page, ".blockly-layers-panel-header-actions");
  const header = await rect(page, HEADER);
  return {
    x: (title.right + actions.left) / 2,
    y: header.top + header.height / 2,
  };
}

async function dragBy(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, {steps: 8});
  await page.mouse.up();
  await settle(page);
}

const dockButton = (page) =>
  page.locator(`${HEADER} button[title="Dock as a sidebar"], ${HEADER} button[title="Float over the workspace"]`);

test.describe("floating (default)", () => {
  test("starts under the backpack, clear of every control, displacing none", async ({
    page,
  }) => {
    await open(page);
    const host = await rect(page, "#fixture-host");
    const panel = await rect(page, PANEL);
    const backpack = await rect(page, BACKPACK);

    // The backpack keeps its own unbumped top corner spot.
    expect(backpack.top - host.top).toBeCloseTo(10, 0);
    expect(panel.top).toBeGreaterThanOrEqual(backpack.bottom);
    expect(intersects(panel, backpack)).toBe(false);
    for (const id of ["zoomControls", "trashcan"]) {
      expect(intersects(panel, await reported(page, id)), id).toBe(false);
    }
  });

  test("stays above the bottom controls even with hundreds of layers", async ({
    page,
  }) => {
    await open(page, {query: "&many=300"});
    await page.locator(".blockly-layers-panel-section-header", {hasText: /variables/i}).click();
    await settle(page);

    const panel = await rect(page, PANEL);
    const zoom = await reported(page, "zoomControls");
    const trash = await reported(page, "trashcan");
    expect(panel.bottom).toBeLessThanOrEqual(Math.min(zoom.top, trash.top));
    const scrolls = await page.evaluate(() => {
      const el = document.querySelector(".blockly-layers-panel");
      return el.scrollHeight > el.clientHeight;
    });
    expect(scrolls).toBe(true);
  });

  test("dragging the header moves it, clamped, without moving other controls", async ({
    page,
  }) => {
    await open(page);
    const before = {
      panel: await rect(page, PANEL),
      backpack: await rect(page, BACKPACK),
      zoom: await rect(page, ZOOM),
      trash: await rect(page, TRASH),
    };

    await dragBy(page, await dragHandle(page), -200, 120);
    const moved = await rect(page, PANEL);
    expect(moved.left).toBeCloseTo(before.panel.left - 200, 0);
    expect(moved.top).toBeCloseTo(before.panel.top + 120, 0);
    for (const [name, sel] of [["backpack", BACKPACK], ["zoom", ZOOM], ["trash", TRASH]]) {
      const now = await rect(page, sel);
      expect(now.left, name).toBeCloseTo(before[name].left, 0);
      expect(now.top, name).toBeCloseTo(before[name].top, 0);
    }

    // Past every edge: pinned inside the workspace.
    await dragBy(page, await dragHandle(page), -5000, -5000);
    const topLeft = await rect(page, PANEL);
    expect(topLeft.left).toBeCloseTo(0, 0);
    expect(topLeft.top).toBeCloseTo(0, 0);
    await dragBy(page, await dragHandle(page), 5000, 5000);
    const host = await rect(page, "#fixture-host");
    const bottomRight = await rect(page, PANEL);
    expect(bottomRight.right).toBeLessThanOrEqual(host.right + 0.5);
    expect(bottomRight.bottom).toBeLessThanOrEqual(host.bottom + 0.5);
  });

  test("a moved panel survives reload; double-click resets it", async ({page}) => {
    await open(page);
    const home = await rect(page, PANEL);
    await dragBy(page, await dragHandle(page), -150, 90);
    const moved = await rect(page, PANEL);

    await page.reload();
    await page.waitForSelector(PANEL);
    await settle(page);
    const restored = await rect(page, PANEL);
    expect(restored.left).toBeCloseTo(moved.left, 0);
    expect(restored.top).toBeCloseTo(moved.top, 0);

    const handle = await dragHandle(page);
    await page.mouse.dblclick(handle.x, handle.y);
    await settle(page);
    const reset = await rect(page, PANEL);
    expect(reset.left).toBeCloseTo(home.left, 0);
    expect(reset.top).toBeCloseTo(home.top, 0);
    expect((await storedState(page)).floatOffset).toBeNull();
  });

  test("pressing a header button never drags, and dragging never scrolls the workspace", async ({
    page,
  }) => {
    await open(page);
    const before = await rect(page, PANEL);
    const scrollBefore = await page.evaluate(() => [
      window.fixture.workspace.scrollX,
      window.fixture.workspace.scrollY,
    ]);

    const button = await rect(page, `${HEADER} button`);
    await dragBy(
      page,
      {x: button.left + button.width / 2, y: button.top + button.height / 2},
      -120,
      60,
    );
    const afterButton = await rect(page, PANEL);
    expect(afterButton.left).toBeCloseTo(before.left, 0);
    expect(afterButton.top).toBeCloseTo(before.top, 0);

    await dragBy(page, await dragHandle(page), -100, 100);
    const scrollAfter = await page.evaluate(() => [
      window.fixture.workspace.scrollX,
      window.fixture.workspace.scrollY,
    ]);
    expect(scrollAfter).toEqual(scrollBefore);
  });
});

test.describe("docked", () => {
  test("shrinks the workspace, collapses to a rail, resizes, and persists", async ({
    page,
  }) => {
    await open(page);
    const full = await svgWidth(page);
    await dockButton(page).click();
    await settle(page);

    await expect(page.locator(PANEL)).toHaveClass(/blockly-layers-panel-docked/);
    const panel = await rect(page, PANEL);
    expect(panel.width).toBeCloseTo(240, 0);
    // injection div | 6px splitter | panel
    expect(await svgWidth(page)).toBeCloseTo(full - 240 - 6, 0);

    // Blocks still render and the workspace still scrolls inside the smaller area.
    const ok = await page.evaluate(() => {
      const ws = window.fixture.workspace;
      ws.scroll(ws.scrollX - 30, ws.scrollY);
      return ws.getTopBlocks(false).every((b) => b.rendered);
    });
    expect(ok).toBe(true);

    await page.locator(`${HEADER} button[title="Collapse or expand the panel"]`).click();
    await settle(page);
    expect((await rect(page, PANEL)).width).toBeCloseTo(32, 0);
    expect(await svgWidth(page)).toBeCloseTo(full - 32, 0);
    await page.locator(`${HEADER} button[title="Collapse or expand the panel"]`).click();
    await settle(page);

    const splitter = await rect(page, ".blockly-layers-splitter");
    const cx = splitter.left + splitter.width / 2;
    const cy = splitter.top + splitter.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 60, cy, {steps: 6});
    await page.mouse.up();
    await settle(page);
    expect((await rect(page, PANEL)).width).toBeCloseTo(300, 0);
    expect((await storedState(page)).dockWidth).toBe(300);

    await page.reload();
    await page.waitForSelector(PANEL);
    await settle(page);
    await expect(page.locator(PANEL)).toHaveClass(/blockly-layers-panel-docked/);
    expect((await rect(page, PANEL)).width).toBeCloseTo(300, 0);
  });

  test("leaving dock mode, or disposing, restores the host's elements exactly", async ({
    page,
  }) => {
    await open(page);
    const snapshot = () =>
      page.evaluate(() => ({
        host: document.getElementById("fixture-host").getAttribute("style"),
        injection: document.querySelector(".injectionDiv").getAttribute("style"),
        hostChildren: document.getElementById("fixture-host").children.length,
      }));
    const original = await snapshot();

    await dockButton(page).click();
    await settle(page);
    expect(await snapshot()).not.toEqual(original);
    await dockButton(page).click();
    await settle(page);
    expect(await snapshot()).toEqual(original);

    await dockButton(page).click();
    await settle(page);
    await page.evaluate(() => window.fixture.plugin.dispose());
    await settle(page);
    expect(await snapshot()).toEqual(original);
    expect(await page.locator(PANEL).count()).toBe(0);
    expect(await page.locator(".blockly-layers-splitter").count()).toBe(0);
  });
});

test.describe("persistence", () => {
  test("mode, collapsed state and expanded sections survive reload", async ({page}) => {
    await open(page);
    await page.locator(".blockly-layers-panel-section-header", {hasText: /variables/i}).click();
    await dockButton(page).click();
    await page.locator(`${HEADER} button[title="Collapse or expand the panel"]`).click();
    await settle(page);

    await page.reload();
    await page.waitForSelector(PANEL);
    await settle(page);
    await expect(page.locator(PANEL)).toHaveClass(/blockly-layers-panel-docked/);
    await expect(page.locator(PANEL)).toHaveClass(/blockly-layers-panel-collapsed/);

    await page.locator(`${HEADER} button[title="Collapse or expand the panel"]`).click();
    await settle(page);
    await expect(
      page.locator(".blockly-layers-panel-row", {hasText: "score"}),
    ).toBeVisible();
  });

  test("works, without errors, when localStorage throws", async ({page}) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page, {blockStorage: true});

    await expect(page.locator(PANEL)).toBeVisible();
    await dockButton(page).click();
    await settle(page);
    await expect(page.locator(PANEL)).toHaveClass(/blockly-layers-panel-docked/);
    await dockButton(page).click();
    await settle(page);
    await expect(page.locator(PANEL)).not.toHaveClass(/blockly-layers-panel-docked/);
    expect(errors).toEqual([]);
  });

  test("the panelMode option sets the first-run mode but a saved choice wins", async ({
    page,
  }) => {
    await open(page, {state: {mode: "floating"}});
    await expect(page.locator(PANEL)).not.toHaveClass(/blockly-layers-panel-docked/);
    await open(page, {state: {mode: "docked"}});
    await expect(page.locator(PANEL)).toHaveClass(/blockly-layers-panel-docked/);
  });
});

test.describe("regressions", () => {
  for (const mode of ["floating", "docked"]) {
    test(`search keeps focus and filtering works while ${mode}`, async ({page}) => {
      await open(page, {state: {mode}});
      const dimmed = () =>
        page.evaluate(
          () =>
            window.fixture.workspace
              .getTopBlocks(false)
              .filter((b) => b.getSvgRoot().style.opacity !== "").length,
        );

      await page.locator(".blockly-layers-panel-search input").click();
      await page.keyboard.type("Demo");
      expect(
        await page.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.value),
      ).toBe("INPUT:Demo");

      expect(await dimmed()).toBe(0);
      await page.locator(".blockly-layers-panel-row", {hasText: "Demo layer"}).click();
      await settle(page);
      expect(await dimmed()).toBeGreaterThan(0);
      await page.locator(`${HEADER} button`, {hasText: "Clear"}).click();
      await settle(page);
      expect(await dimmed()).toBe(0);
    });
  }

  test("RTL: the panel docks on the left and floats from the left, clear of the backpack", async ({
    page,
  }) => {
    await open(page, {query: "&rtl=1"});
    const host = await rect(page, "#fixture-host");
    const floating = await rect(page, PANEL);
    const backpack = await rect(page, BACKPACK);
    expect(floating.left - host.left).toBeLessThan(100);
    expect(intersects(floating, backpack)).toBe(false);

    await dockButton(page).click();
    await settle(page);
    const docked = await rect(page, PANEL);
    expect(docked.left - host.left).toBeCloseTo(0, 0);
    expect(await svgWidth(page)).toBeCloseTo(host.width - 240 - 6, 0);
  });
});

test.describe("view save and restore", () => {
  const view = (page) =>
    page.evaluate(() => {
      const ws = window.fixture.workspace;
      return {scale: ws.getScale(), x: ws.scrollX, y: ws.scrollY};
    });
  const search = (page) => page.locator(".blockly-layers-panel-search input");
  // Dynamic sections start collapsed, so find a row through the search box.
  const toggle = async (page, text) => {
    await search(page).fill(text);
    await page.locator(".blockly-layers-panel-row", {hasText: text}).first().click();
    await search(page).fill("");
    await settle(page);
  };
  const clear = (page) => page.locator(`${HEADER} button`, {hasText: "Clear"});

  // Parks the stack for variable `name` far from the others (and the view).
  const moveFar = (page, name, dx = 6000, dy = 4000) =>
    page.evaluate(
      ([n, x, y]) => {
        const ws = window.fixture.workspace;
        const id = ws.getVariableMap().getVariable(n).getId();
        ws.getTopBlocks(false)
          .find((b) => b.type === "variables_set" && b.getFieldValue("VAR") === id)
          .moveBy(x, y);
      },
      [name, dx, dy],
    );

  async function setUserView(page) {
    await page.evaluate(() => {
      const ws = window.fixture.workspace;
      ws.setScale(0.8);
      ws.scroll(-123, -77);
    });
    await settle(page);
    return view(page);
  }

  const expectSame = (actual, expected) => {
    expect(actual.scale).toBeCloseTo(expected.scale, 5);
    expect(actual.x).toBeCloseTo(expected.x, 1);
    expect(actual.y).toBeCloseTo(expected.y, 1);
  };

  test("clearing the layers puts back the zoom and scroll from before filtering", async ({
    page,
  }) => {
    await open(page, {query: "&many=30"});
    await moveFar(page, "v29");
    const before = await setUserView(page);

    await toggle(page, "v29");
    await settle(page);
    const fitted = await view(page);
    expect(fitted.x !== before.x || fitted.y !== before.y).toBe(true);

    await clear(page).click();
    await settle(page);
    expectSame(await view(page), before);
  });

  test("the saved view is the one from before the first layer, not a later one", async ({
    page,
  }) => {
    await open(page, {query: "&many=30"});
    await moveFar(page, "v29");
    const before = await setUserView(page);

    await toggle(page, "v29");
    await settle(page);
    await toggle(page, "Demo layer");
    await settle(page);
    // Deactivating one of two layers keeps filtering, so nothing is restored yet.
    await toggle(page, "v29");
    await settle(page);
    expect(await page.evaluate(() => window.fixture.plugin.getActiveLayerIds().length)).toBe(1);

    await clear(page).click();
    await settle(page);
    expectSame(await view(page), before);
  });

  test("each filtering session saves afresh, and clearing twice is harmless", async ({
    page,
  }) => {
    await open(page, {query: "&many=30"});
    await moveFar(page, "v29");
    await setUserView(page);
    await toggle(page, "v29");
    await settle(page);
    await clear(page).click();
    await settle(page);

    await page.evaluate(() => {
      const ws = window.fixture.workspace;
      ws.setScale(1.2);
      ws.scroll(-40, -10);
    });
    await settle(page);
    const second = await view(page);

    await toggle(page, "v29");
    await settle(page);
    await page.evaluate(() => window.fixture.plugin.clearActiveLayers());
    await settle(page);
    expectSame(await view(page), second);

    await page.evaluate(() => window.fixture.plugin.clearActiveLayers());
    await settle(page);
    expectSame(await view(page), second);
  });
});

test.describe("view follows the layers", () => {
  const view = (page) =>
    page.evaluate(() => {
      const ws = window.fixture.workspace;
      return {scale: ws.getScale(), x: ws.scrollX, y: ws.scrollY};
    });
  const search = (page) => page.locator(".blockly-layers-panel-search input");
  const toggle = async (page, text) => {
    await search(page).fill(text);
    await page.locator(".blockly-layers-panel-row", {hasText: text}).first().click();
    await search(page).fill("");
    await settle(page);
  };
  const moveTo = (page, name, x, y) =>
    page.evaluate(
      ([n, px, py]) => {
        const ws = window.fixture.workspace;
        const id = ws.getVariableMap().getVariable(n).getId();
        const block = ws
          .getTopBlocks(false)
          .find((b) => b.type === "variables_set" && b.getFieldValue("VAR") === id);
        const xy = block.getRelativeToSurfaceXY();
        block.moveBy(px - xy.x, py - xy.y);
      },
      [name, x, y],
    );
  // Is the stack for `name` inside the visible part of the workspace?
  const inView = (page, name) =>
    page.evaluate((n) => {
      const ws = window.fixture.workspace;
      const id = ws.getVariableMap().getVariable(n).getId();
      const block = ws
        .getTopBlocks(false)
        .find((b) => b.type === "variables_set" && b.getFieldValue("VAR") === id);
      const r = block.getBoundingRectangle();
      const v = ws.getMetricsManager().getViewMetrics(true);
      return (
        r.left >= v.left && r.right <= v.left + v.width &&
        r.top >= v.top && r.bottom <= v.top + v.height
      );
    }, name);
  // Names of the variable stacks drawn as selected (highlighted); should be one.
  const selectedVars = (page) =>
    page.evaluate(() => {
      const ws = window.fixture.workspace;
      return ws
        .getTopBlocks(false)
        .filter((b) => b.getSvgRoot().classList.contains("blocklySelected"))
        .map((b) =>
          b.type === "variables_set"
            ? ws.getVariableMap().getVariableById(b.getFieldValue("VAR")).getName()
            : b.type,
        );
    });
  const label = (page) => page.locator(".blockly-layers-panel-nav-label").innerText();
  const press = async (page, title) => {
    await page.locator(`${PANEL} button[title="${title}"]`).click();
    await settle(page);
  };
  const FIT = "Zoom out to fit the visible stacks (never below a readable size)";

  async function centre(page, x, y) {
    await page.evaluate(
      ([cx, cy]) => {
        const ws = window.fixture.workspace;
        ws.setScale(1);
        const m = ws.getMetrics();
        ws.scroll(-cx + m.viewWidth / 2, -cy + m.viewHeight / 2);
      },
      [x, y],
    );
    await settle(page);
  }

  test("checking a layer fits it, at no more than actual size", async ({page}) => {
    await open(page, {query: "&many=30"});
    await moveTo(page, "v1", 9000, 9000);
    await centre(page, 0, 0);
    expect(await inView(page, "v1")).toBe(false);
    await toggle(page, "v1");
    expect(await inView(page, "v1")).toBe(true);
    expect((await view(page)).scale).toBeLessThanOrEqual(1);
  });

  test("checking a layer never zooms below a readable scale", async ({page}) => {
    await open(page, {query: "&many=30"});
    await moveTo(page, "v1", 0, 0);
    await moveTo(page, "v2", 60000, 40000);
    await toggle(page, "v1");
    await toggle(page, "v2");
    expect((await view(page)).scale).toBeGreaterThanOrEqual(0.5);
    expect(await inView(page, "v1")).toBe(true);
    expect(await label(page)).toBe("2 stacks");
  });

  test("Next/Previous visit each visible stack in reading order and wrap", async ({page}) => {
    await open(page, {query: "&many=30"});
    await moveTo(page, "v1", 3000, 0);
    await moveTo(page, "v2", 0, 3000);
    await moveTo(page, "v3", 6000, 6000);
    await centre(page, 0, 0);
    for (const n of ["v1", "v2", "v3"]) await toggle(page, n);
    // They can't all fit at a readable scale, so the first is already shown.
    expect(await label(page)).toBe("3 stacks");
    expect(await inView(page, "v1")).toBe(true);
    const scale = (await view(page)).scale;

    await press(page, "Next visible stack");
    expect(await label(page)).toBe("1 of 3");
    expect(await selectedVars(page)).toEqual(["v1"]);
    await press(page, "Next visible stack");
    expect(await label(page)).toBe("2 of 3");
    expect(await inView(page, "v2")).toBe(true);
    expect(await selectedVars(page)).toEqual(["v2"]);
    await press(page, "Next visible stack");
    expect(await label(page)).toBe("3 of 3");
    expect(await inView(page, "v3")).toBe(true);
    expect(await selectedVars(page)).toEqual(["v3"]);
    await press(page, "Next visible stack");
    expect(await label(page)).toBe("1 of 3");
    expect(await selectedVars(page)).toEqual(["v1"]);
    await press(page, "Previous visible stack");
    expect(await label(page)).toBe("3 of 3");
    expect(await inView(page, "v3")).toBe(true);
    expect((await view(page)).scale).toBe(scale);
  });

  test("the controls are hidden with no layer active and the count restarts on a new selection", async ({page}) => {
    await open(page, {query: "&many=30"});
    await expect(page.locator(".blockly-layers-panel-nav")).toHaveCSS("visibility", "hidden");
    await toggle(page, "v1");
    await expect(page.locator(".blockly-layers-panel-nav")).toHaveCSS("visibility", "visible");
    await press(page, "Next visible stack");
    expect(await label(page)).toBe("1 of 1");
    await toggle(page, "v2");
    expect(await label(page)).toBe("2 stacks");
  });

  test("Fit shows everything when it can, without going unreadably small", async ({page}) => {
    await open(page, {query: "&many=30"});
    await moveTo(page, "v1", 0, 0);
    await moveTo(page, "v2", 800, 300);
    await toggle(page, "v1");
    await toggle(page, "v2");
    await press(page, FIT);
    expect(await inView(page, "v1")).toBe(true);
    expect(await inView(page, "v2")).toBe(true);
  });

  test("Fit stops at a readable scale and shows the first stack when they cannot all fit", async ({page}) => {
    await open(page, {query: "&many=30"});
    await moveTo(page, "v1", 0, 0);
    await moveTo(page, "v2", 40000, 30000);
    await toggle(page, "v1");
    await toggle(page, "v2");
    await press(page, FIT);
    const {scale} = await view(page);
    expect(scale).toBeGreaterThanOrEqual(0.5);
    expect(await inView(page, "v1")).toBe(true);
    expect(await inView(page, "v2")).toBe(false);
    expect(await label(page)).toBe("2 stacks");
    await press(page, "Next visible stack");
    await press(page, "Next visible stack");
    expect(await label(page)).toBe("2 of 2");
    expect(await inView(page, "v2")).toBe(true);
  });

  test("fitting marks every visible stack as selected; a click or a step clears the marks", async ({page}) => {
    await open(page, {query: "&many=30"});
    await toggle(page, "v1");
    await toggle(page, "v2");
    await toggle(page, "v3");
    expect((await selectedVars(page)).sort()).toEqual(["v1", "v2", "v3"]);

    // Fit again after the marks are gone.
    // Any bare spot of the workspace background (not a block, flyout or control).
    const spot = await page.evaluate(() => {
      const r = window.fixture.workspace.getParentSvg().getBoundingClientRect();
      for (let y = r.top + 40; y < r.bottom - 40; y += 25) {
        for (let x = r.left + 40; x < r.right - 40; x += 25) {
          const el = document.elementFromPoint(x, y);
          if (el && el.classList.contains("blocklyMainBackground")) return {x, y};
        }
      }
      return null;
    });
    await page.mouse.click(spot.x, spot.y);
    await settle(page);
    expect(await selectedVars(page)).toEqual([]);
    await press(page, FIT);
    expect((await selectedVars(page)).sort()).toEqual(["v1", "v2", "v3"]);

    await press(page, "Next visible stack");
    expect(await selectedVars(page)).toHaveLength(1);

    await page.locator(`${HEADER} button`, {hasText: "Clear"}).click();
    await settle(page);
    // Only the stepped-to stack may stay selected; no stray marks remain.
    expect((await selectedVars(page)).length).toBeLessThanOrEqual(1);
  });

  test("N and B enter the visible stacks, then Blockly's own navigation skips filtered ones", async ({page}) => {
    await open(page, {query: "&many=30"});
    await moveTo(page, "v1", 3000, 0);
    await moveTo(page, "v2", 0, 3000);
    await moveTo(page, "v3", 6000, 6000);
    const spot = await page.evaluate(() => {
      const r = window.fixture.workspace.getParentSvg().getBoundingClientRect();
      for (let y = r.top + 40; y < r.bottom - 40; y += 25) {
        for (let x = r.left + 40; x < r.right - 40; x += 25) {
          const el = document.elementFromPoint(x, y);
          if (el && el.classList.contains("blocklyMainBackground")) return {x, y};
        }
      }
      return null;
    });
    const click = async () => {
      await page.mouse.click(spot.x, spot.y);
      await settle(page);
    };
    await click();
    // No layer active: Blockly's own shortcut handles it; ours must not step.
    await page.keyboard.press("n");
    await settle(page);
    expect(await page.locator(".blockly-layers-panel-nav-label").innerText()).not.toMatch(/ of /);

    await toggle(page, "v1");
    await toggle(page, "v3");
    await click();
    // Nothing selected: ours takes N and enters the first visible stack.
    await page.keyboard.press("n");
    await settle(page);
    expect(await label(page)).toBe("1 of 2");
    expect(await selectedVars(page)).toEqual(["v1"]);
    // Now something is focused: Blockly's N moves on, skipping the hidden v2.
    await page.keyboard.press("n");
    await settle(page);
    expect(await selectedVars(page)).toEqual(["v3"]);
    expect(await label(page)).toBe("2 of 2");
    await page.keyboard.press("b");
    await settle(page);
    expect(await selectedVars(page)).toEqual(["v1"]);
    expect(await label(page)).toBe("1 of 2");

    // With no filter, Blockly reaches v2 again.
    await page.locator(`${HEADER} button`, {hasText: "Clear"}).click();
    await settle(page);
    // Click a real block (the first demo stack) to give it keyboard focus.
    const onBlock = await page.evaluate(() => {
      const r = window.fixture.workspace
        .getTopBlocks(true)[0]
        .getSvgRoot()
        .getBoundingClientRect();
      return {x: r.left + 6, y: r.top + 6};
    });
    await page.mouse.click(onBlock.x, onBlock.y);
    await settle(page);
    const names = [];
    for (let i = 0; i < 40 && !names.includes("v2"); i++) {
      await page.keyboard.press("n");
      await settle(page);
      names.push(...(await selectedVars(page)));
    }
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain("v2");
  });

  test("the minReadableScale option raises the floor a fit will not go below", async ({page}) => {
    await open(page, {query: "&many=30&minReadable=0.8"});
    await moveTo(page, "v1", 0, 0);
    await moveTo(page, "v2", 40000, 30000);
    await toggle(page, "v1");
    await toggle(page, "v2");
    const {scale} = await view(page);
    expect(scale).toBeGreaterThanOrEqual(0.8);
    expect(scale).toBeLessThanOrEqual(1);
    expect(await label(page)).toBe("2 stacks");
  });

  test("stepping flashes the stack it lands on, then stops", async ({page}) => {
    await open(page, {query: "&many=30"});
    await moveTo(page, "v1", 3000, 0);
    await moveTo(page, "v2", 0, 3000);
    await toggle(page, "v1");
    await toggle(page, "v2");
    const flashing = () =>
      page.evaluate(
        () => document.querySelectorAll(".blockly-layers-arrived").length,
      );
    expect(await flashing()).toBe(0);
    await press(page, "Next visible stack");
    expect(await flashing()).toBe(1);
    await page.waitForTimeout(1700);
    expect(await flashing()).toBe(0);
  });

  test("marks are skipped when very many stacks are active", async ({page}) => {
    await open(page, {query: "&many=60&renderer=zelos"});
    await page.evaluate(() => {
      const ws = window.fixture.workspace;
      const p = window.fixture.plugin;
      const id = p.createManualLayer("Everything");
      for (const b of ws.getTopBlocks(false)) p.assignToLayer(b.id, id);
      p.setLayerActive(id, true);
    });
    await settle(page);
    expect(await page.evaluate(() => document.querySelectorAll(".blocklySelected").length)).toBe(0);
  });

  test("stepping does not disturb the view restored on clear", async ({page}) => {
    await open(page, {query: "&many=30"});
    await moveTo(page, "v1", 9000, 9000);
    await centre(page, 0, 0);
    const before = await view(page);
    await toggle(page, "v1");
    await press(page, "Next visible stack");
    await page.locator(`${HEADER} button`, {hasText: "Clear"}).click();
    await settle(page);
    const after = await view(page);
    expect(after.scale).toBeCloseTo(before.scale, 5);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });
});

test.describe("naming a new layer", () => {
  const NAME = ".blockly-layers-panel-name";
  const nameInput = (page) => page.locator(`${NAME} input`);
  const plus = (page) => page.locator(`${HEADER} button[title="New layer"]`);
  const layerNames = (page) =>
    page.evaluate(() =>
      window.fixture.plugin.exportManualLayers().layers.map((l) => l.name),
    );

  test("+ opens an inline input; Enter creates the layer and closes it", async ({page}) => {
    await open(page);
    await expect(page.locator(NAME)).toBeHidden();
    await plus(page).click();
    await expect(page.locator(NAME)).toBeVisible();
    await expect(nameInput(page)).toBeFocused();

    await page.keyboard.type("Checkout flow");
    await page.keyboard.press("Enter");
    await settle(page);
    await expect(page.locator(NAME)).toBeHidden();
    expect(await layerNames(page)).toEqual(["Demo layer", "Checkout flow"]);
    await expect(
      page.locator(".blockly-layers-panel-row", {hasText: "Checkout flow"}),
    ).toBeVisible();
  });

  test("an empty or duplicate name is refused in place, without closing", async ({page}) => {
    await open(page);
    await plus(page).click();
    await page.keyboard.press("Enter");
    await expect(page.locator(`${NAME}-error`)).toHaveText("Enter a name.");
    await expect(page.locator(NAME)).toBeVisible();

    await page.keyboard.type("  demo LAYER ");
    await page.keyboard.press("Enter");
    await expect(page.locator(`${NAME}-error`)).toContainText("already exists");
    await expect(page.locator(NAME)).toBeVisible();
    expect(await layerNames(page)).toEqual(["Demo layer"]);

    await page.keyboard.type("x");
    await expect(page.locator(`${NAME}-error`)).toHaveText("");
  });

  test("Escape and clicking away cancel without creating anything", async ({page}) => {
    await open(page);
    await plus(page).click();
    await page.keyboard.type("Nope");
    await page.keyboard.press("Escape");
    await expect(page.locator(NAME)).toBeHidden();

    await plus(page).click();
    await page.keyboard.type("Nope");
    await page.locator(".blockly-layers-panel-search input").click();
    await expect(page.locator(NAME)).toBeHidden();
    expect(await layerNames(page)).toEqual(["Demo layer"]);
  });

  test("a collapsed panel expands to ask", async ({page}) => {
    await open(page, {state: {collapsed: true}});
    await expect(page.locator(NAME)).toBeHidden();
    await page.locator(`${HEADER} button[title="Collapse or expand the panel"]`).waitFor();
    await plus(page).click();
    await expect(page.locator(NAME)).toBeVisible();
    await expect(nameInput(page)).toBeFocused();
  });

  test("the block context menu's New layer asks inline, then assigns that stack", async ({page}) => {
    await open(page);
    const target = await page.evaluate(() => {
      const b = window.fixture.workspace.getTopBlocks(true)[1];
      const r = b.getSvgRoot().getBoundingClientRect();
      return {id: b.id, x: r.left + 6, y: r.top + 6};
    });
    await page.mouse.click(target.x, target.y, {button: "right"});
    await page.locator(".blocklyMenuItem, .blocklyContextMenu [role=menuitem]", {hasText: "New layer"}).first().click();
    await expect(page.locator(NAME)).toBeVisible();
    await page.keyboard.type("From menu");
    await page.keyboard.press("Enter");
    await settle(page);

    const state = await page.evaluate(() => window.fixture.plugin.exportManualLayers());
    const created = state.layers.find((l) => l.name === "From menu");
    expect(created).toBeTruthy();
    expect(state.membership[target.id]).toContain(created.id);
  });
});

test.describe("removing a layer", () => {
  const CONFIRM = ".blockly-layers-panel-confirm";
  const layerNames = (page) =>
    page.evaluate(() =>
      window.fixture.plugin.exportManualLayers().layers.map((l) => l.name),
    );
  const minus = (page) => page.locator('button[title="Remove Demo layer"]');

  test("the − button asks inline, with Cancel focused, and Cancel keeps the layer", async ({page}) => {
    await open(page);
    page.on("dialog", () => {
      throw new Error("no browser dialog expected");
    });
    await expect(page.locator(CONFIRM)).toBeHidden();
    await minus(page).click();
    await expect(page.locator(CONFIRM)).toBeVisible();
    await expect(page.locator(`${CONFIRM}-text`)).toHaveText('Remove layer "Demo layer"?');
    await expect(page.locator(`${CONFIRM} button`, {hasText: "Cancel"})).toBeFocused();

    await page.locator(`${CONFIRM} button`, {hasText: "Cancel"}).click();
    await expect(page.locator(CONFIRM)).toBeHidden();
    expect(await layerNames(page)).toEqual(["Demo layer"]);
  });

  test("Escape, and pressing Enter on the focused Cancel, both keep the layer", async ({page}) => {
    await open(page);
    await minus(page).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(CONFIRM)).toBeHidden();

    await minus(page).click();
    await page.keyboard.press("Enter");
    await expect(page.locator(CONFIRM)).toBeHidden();
    expect(await layerNames(page)).toEqual(["Demo layer"]);
  });

  test("Remove deletes the layer, and an active one stops filtering", async ({page}) => {
    await open(page);
    await page.locator(".blockly-layers-panel-row", {hasText: "Demo layer"}).click();
    await settle(page);
    expect(
      await page.evaluate(
        () =>
          window.fixture.workspace
            .getTopBlocks(false)
            .filter((b) => b.getSvgRoot().style.opacity !== "").length,
      ),
    ).toBeGreaterThan(0);

    await minus(page).click();
    await page.locator(`${CONFIRM} button`, {hasText: "Remove"}).click();
    await settle(page);
    await expect(page.locator(CONFIRM)).toBeHidden();
    expect(await layerNames(page)).toEqual([]);
    await expect(
      page.locator(".blockly-layers-panel-row", {hasText: "Demo layer"}),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          window.fixture.workspace
            .getTopBlocks(false)
            .filter((b) => b.getSvgRoot().style.opacity !== "").length,
      ),
    ).toBe(0);
  });

  test("asking for a name and asking to remove cancel each other", async ({page}) => {
    await open(page);
    await page.locator(`${HEADER} button[title="New layer"]`).click();
    await expect(page.locator(".blockly-layers-panel-name")).toBeVisible();
    await minus(page).click();
    await expect(page.locator(CONFIRM)).toBeVisible();
    await expect(page.locator(".blockly-layers-panel-name")).toBeHidden();

    await page.locator(`${HEADER} button[title="New layer"]`).click();
    await expect(page.locator(".blockly-layers-panel-name")).toBeVisible();
    await expect(page.locator(CONFIRM)).toBeHidden();
    expect(await layerNames(page)).toEqual(["Demo layer"]);
  });
});

test.describe("arrange visible", () => {
  const ARRANGE = 'button[title="Gather the visible stacks into columns in free space (undoable)"]';

  // Makes a manual layer of `count` variable stacks, scattered, and returns
  // the layer id and those stacks' ids.
  const scatter = (page, count) =>
    page.evaluate((n) => {
      const ws = window.fixture.workspace;
      const plugin = window.fixture.plugin;
      const vars = ws
        .getTopBlocks(false)
        .filter((b) => b.type === "variables_set")
        .slice(0, n);
      vars.forEach((b, i) => {
        const xy = b.getRelativeToSurfaceXY();
        b.moveBy(((i * 977) % 1800) - xy.x, ((i * 613) % 1400) - xy.y);
      });
      const id = plugin.createManualLayer("Mine");
      for (const b of vars) plugin.assignToLayer(b.id, id);
      return {id, ids: vars.map((b) => b.id)};
    }, count);

  const rects = (page) =>
    page.evaluate(() => {
      const ws = window.fixture.workspace;
      return ws.getTopBlocks(false).map((b) => {
        const r = b.getBoundingRectangle();
        return {id: b.id, left: r.left, top: r.top, right: r.right, bottom: r.bottom};
      });
    });

  const overlapping = (all, ids) => {
    const mine = all.filter((r) => ids.includes(r.id));
    const others = all.filter((r) => !ids.includes(r.id));
    return mine.filter((m) =>
      others.some(
        (o) => m.left < o.right && m.right > o.left && m.top < o.bottom && m.bottom > o.top,
      ),
    );
  };

  test("the arranged stacks overlap nothing once the layers are cleared", async ({page}) => {
    await open(page, {query: "&many=40"});
    const {id, ids} = await scatter(page, 12);
    await page.evaluate((layer) => window.fixture.plugin.setLayerActive(layer, true), id);
    await settle(page);
    await page.locator(`${PANEL} ${ARRANGE}`).click();
    await settle(page);
    await page.evaluate(() => window.fixture.plugin.clearActiveLayers());
    await settle(page);
    expect(overlapping(await rects(page), ids)).toEqual([]);
  });

  test("they wrap into several columns instead of one tall strip", async ({page}) => {
    await open(page, {query: "&many=60"});
    const {id, ids} = await scatter(page, 50);
    await page.evaluate((layer) => window.fixture.plugin.setLayerActive(layer, true), id);
    await settle(page);
    await page.locator(`${PANEL} ${ARRANGE}`).click();
    await settle(page);
    const mine = (await rects(page)).filter((r) => ids.includes(r.id));
    const columns = new Set(mine.map((r) => Math.round(r.left)));
    expect(columns.size).toBeGreaterThan(1);
    const tallest = Math.max(...mine.map((r) => r.bottom)) - Math.min(...mine.map((r) => r.top));
    const view = await page.evaluate(
      () => window.fixture.workspace.getMetrics().viewHeight / window.fixture.workspace.getScale(),
    );
    // Roughly a screen tall at the zoom the fit settled on, not 50 stacks tall.
    expect(tallest).toBeLessThan(view * 2);
  });

  test("one undo puts every stack back where it was", async ({page}) => {
    await open(page, {query: "&many=40"});
    const {id, ids} = await scatter(page, 8);
    const before = (await rects(page)).filter((r) => ids.includes(r.id));
    await page.evaluate((layer) => window.fixture.plugin.setLayerActive(layer, true), id);
    await settle(page);
    await page.locator(`${PANEL} ${ARRANGE}`).click();
    await settle(page);
    const moved = (await rects(page)).filter((r) => ids.includes(r.id));
    expect(moved).not.toEqual(before);
    await page.evaluate(() => window.fixture.workspace.undo(false));
    await settle(page);
    const after = (await rects(page)).filter((r) => ids.includes(r.id));
    for (const b of before) {
      const a = after.find((r) => r.id === b.id);
      expect(a.left).toBeCloseTo(b.left, 0);
      expect(a.top).toBeCloseTo(b.top, 0);
    }
  });
});
