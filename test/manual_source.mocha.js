/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require("chai");
const assert = chai.assert;
const {ManualSource} = require("../src/layer_sources/manual_source");

suite("ManualSource", function () {
  setup(function () {
    this.source = new ManualSource();
  });

  test("createLayer returns a namespaced id and lists it", function () {
    const layerId = this.source.createLayer("Inventory");
    assert.match(layerId, /^manual:/);
    const layers = this.source.getLayers();
    assert.lengthOf(layers, 1);
    assert.equal(layers[0].id, layerId);
    assert.equal(layers[0].name, "Inventory");
  });

  test("assign/unassign tracks membership", function () {
    const layerId = this.source.createLayer("Inventory");
    this.source.assign("block1", layerId);
    assert.isTrue(this.source.isAssigned("block1", layerId));
    assert.sameMembers([...this.source.getMembers(null, layerId)], ["block1"]);

    this.source.unassign("block1", layerId);
    assert.isFalse(this.source.isAssigned("block1", layerId));
    assert.isEmpty([...this.source.getMembers(null, layerId)]);
  });

  test("assign is a no-op for an unknown layer id", function () {
    this.source.assign("block1", "manual:doesnotexist");
    assert.isEmpty([...this.source.getMembers(null, "manual:doesnotexist")]);
  });

  test("removeLayer clears membership and listing", function () {
    const layerId = this.source.createLayer("Inventory");
    this.source.assign("block1", layerId);
    this.source.removeLayer(layerId);
    assert.isEmpty(this.source.getLayers());
    assert.isFalse(this.source.isAssigned("block1", layerId));
  });

  test("onChange fires on create/assign/unassign/remove", function () {
    let calls = 0;
    this.source.onChange(() => calls++);
    const layerId = this.source.createLayer("Inventory");
    this.source.assign("block1", layerId);
    this.source.unassign("block1", layerId);
    this.source.removeLayer(layerId);
    assert.equal(calls, 4);
  });

  test("exportState/importState round-trips layers and membership", function () {
    const layerId = this.source.createLayer("Inventory", {color: "#f00"});
    this.source.assign("block1", layerId);
    this.source.assign("block2", layerId);

    const state = this.source.exportState();
    const restored = new ManualSource();
    restored.importState(state);

    assert.deepEqual(restored.getLayers(), this.source.getLayers());
    assert.sameMembers(
      [...restored.getMembers(null, layerId)],
      ["block1", "block2"],
    );
  });

  test("clear empties layers and membership", function () {
    const layerId = this.source.createLayer("Inventory");
    this.source.assign("block1", layerId);
    this.source.clear();
    assert.isEmpty(this.source.getLayers());
    assert.isEmpty([...this.source.getMembers(null, layerId)]);
  });
});
