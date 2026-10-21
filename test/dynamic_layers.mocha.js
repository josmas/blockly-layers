/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require("chai");
const assert = chai.assert;
const Blockly = require("blockly");
const {
  byVariableProvider,
} = require("../src/layer_sources/dynamic/by_variable");
const {
  byProcedureProvider,
} = require("../src/layer_sources/dynamic/by_procedure");
const {
  DynamicSource,
} = require("../src/layer_sources/dynamic/dynamic_source");

suite("byVariableProvider", function () {
  setup(function () {
    this.workspace = new Blockly.Workspace();
  });

  teardown(function () {
    this.workspace.dispose();
  });

  test("extracts the variable name from a variables_get block", function () {
    const block = this.workspace.newBlock("variables_get");
    const variable = block.getField("VAR").getVariable();
    assert.equal(byVariableProvider.extractKey(block), variable.getName());
  });

  test("returns null for a block with no variable field", function () {
    const block = this.workspace.newBlock("math_number");
    assert.isNull(byVariableProvider.extractKey(block));
  });
});

suite("byProcedureProvider", function () {
  setup(function () {
    this.workspace = new Blockly.Workspace();
  });

  teardown(function () {
    this.workspace.dispose();
  });

  test("extracts the name from a procedure definition block", function () {
    const block = this.workspace.newBlock("procedures_defnoreturn");
    block.setFieldValue("moveForward", "NAME");
    assert.equal(byProcedureProvider.extractKey(block), "moveForward");
  });

  test("extracts the name from a procedure call block", function () {
    const call = this.workspace.newBlock("procedures_callnoreturn");
    call.setFieldValue("moveForward", "NAME");
    assert.equal(byProcedureProvider.extractKey(call), "moveForward");
  });

  test("returns null for unrelated blocks", function () {
    const block = this.workspace.newBlock("math_number");
    assert.isNull(byProcedureProvider.extractKey(block));
  });
});

suite("DynamicSource", function () {
  setup(function () {
    this.workspace = new Blockly.Workspace();
    Blockly.Blocks["test_component_block"] = {
      init: function () {
        this.appendDummyInput().appendField(
          new Blockly.FieldTextInput("Button1"),
          "KEY",
        );
        this.appendStatementInput("DO");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
      },
    };
    this.provider = {
      key: "component",
      sectionTitle: "Components",
      extractKey: (block) =>
        block.type === "test_component_block"
          ? block.getFieldValue("KEY")
          : null,
    };
    this.source = new DynamicSource(this.provider);
  });

  teardown(function () {
    this.workspace.dispose();
    delete Blockly.Blocks["test_component_block"];
  });

  test("kind and sectionTitle are namespaced/derived from the provider", function () {
    assert.equal(this.source.kind, "dynamic:component");
    assert.equal(this.source.sectionTitle, "Components");
  });

  test("getLayers returns one sorted layer per distinct key", function () {
    const a = this.workspace.newBlock("test_component_block");
    a.setFieldValue("Button2", "KEY");
    this.workspace.newBlock("test_component_block").setFieldValue(
      "Button1",
      "KEY",
    );

    const layers = this.source.getLayers(this.workspace);
    assert.deepEqual(
      layers.map((l) => l.name),
      ["Button1", "Button2"],
    );
    assert.equal(layers[0].id, "dynamic:component:Button1");
  });

  test("getMembers returns the owning top-level stack's id, not the nested block's", function () {
    const top = this.workspace.newBlock("test_component_block");
    top.setFieldValue("Button1", "KEY");
    const nested = this.workspace.newBlock("test_component_block");
    nested.setFieldValue("Button2", "KEY");
    top.getInput("DO").connection.connect(nested.previousConnection);

    const members = this.source.getMembers(
      this.workspace,
      "dynamic:component:Button2",
    );
    assert.sameMembers([...members], [top.id]);
  });
});
