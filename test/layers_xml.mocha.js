/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require("chai");
const Blockly = require("blockly");
const assert = chai.assert;
const {
  manualLayerStateToXml,
  manualLayerStateFromXml,
} = require("../src/layers_xml");

suite("layers_xml", function () {
  const state = {
    layers: [
      {id: "a", name: 'Inventory & "Items"', color: "#f00", icon: "🎒"},
      {id: "b", name: "UI"},
    ],
    membership: {block1: ["a", "b"], block2: ["a"]},
  };

  test("round-trips layers and membership", function () {
    const parsed = manualLayerStateFromXml(manualLayerStateToXml(state));
    assert.deepEqual(parsed.membership, state.membership);
    assert.equal(parsed.layers[0].name, state.layers[0].name);
    assert.equal(parsed.layers[0].color, "#f00");
    assert.equal(parsed.layers[0].icon, "🎒");
    assert.isUndefined(parsed.layers[1].color);
  });

  test("round-trips through serialized text", function () {
    const xml = manualLayerStateToXml(state);
    const reparsed = Blockly.utils.xml.textToDom(
      Blockly.Xml.domToText(xml),
    );
    assert.deepEqual(manualLayerStateFromXml(reparsed).membership, state.membership);
  });

  test("skips membership that refers to an unknown layer", function () {
    const xml = manualLayerStateToXml({
      layers: [{id: "a", name: "A"}],
      membership: {block1: ["a", "ghost"], block2: ["ghost"]},
    });
    const parsed = manualLayerStateFromXml(xml);
    assert.deepEqual(parsed.membership, {block1: ["a"]});
  });
});
