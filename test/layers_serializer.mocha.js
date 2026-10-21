/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require("chai");
const assert = chai.assert;
const Blockly = require("blockly");
const {ManualSource} = require("../src/layer_sources/manual_source");
const {
  registerManualSource,
  unregisterManualSource,
} = require("../src/layers_serializer");

suite("layers_serializer", function () {
  setup(function () {
    this.workspace = new Blockly.Workspace();
    this.manualSource = new ManualSource();
    registerManualSource(this.workspace, this.manualSource);
  });

  teardown(function () {
    unregisterManualSource(this.workspace);
    this.workspace.dispose();
  });

  test("save includes manual layer state under the 'layers' key", function () {
    const layerId = this.manualSource.createLayer("Inventory");
    this.manualSource.assign("block1", layerId);

    const state = Blockly.serialization.workspaces.save(this.workspace);

    assert.deepEqual(state.layers, this.manualSource.exportState());
  });

  test("save omits the 'layers' key when there are no manual layers", function () {
    const state = Blockly.serialization.workspaces.save(this.workspace);
    assert.isUndefined(state.layers);
  });

  test("load restores manual layer state into a different workspace", function () {
    const layerId = this.manualSource.createLayer("Inventory", {
      color: "#f00",
    });
    this.manualSource.assign("block1", layerId);
    const state = Blockly.serialization.workspaces.save(this.workspace);

    const otherWorkspace = new Blockly.Workspace();
    const otherManualSource = new ManualSource();
    registerManualSource(otherWorkspace, otherManualSource);
    try {
      Blockly.serialization.workspaces.load(state, otherWorkspace);

      assert.deepEqual(
        otherManualSource.getLayers(),
        this.manualSource.getLayers(),
      );
      assert.sameMembers(
        [...otherManualSource.getMembers(otherWorkspace, layerId)],
        ["block1"],
      );
    } finally {
      unregisterManualSource(otherWorkspace);
      otherWorkspace.dispose();
    }
  });

  test("loading clears any previous manual layer state first", function () {
    this.manualSource.createLayer("Stale layer");
    Blockly.serialization.workspaces.load({}, this.workspace);
    assert.isEmpty(this.manualSource.getLayers());
  });
});
