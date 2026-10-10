/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require("chai");
const assert = chai.assert;
const Blockly = require("blockly");
const {
  findRootMatches,
  getActiveBlockTypes,
} = require("../src/block_matcher");

suite("block_matcher", function () {
  setup(function () {
    Blockly.Blocks["test_stack_a"] = {
      init: function () {
        this.appendStatementInput("DO");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
      },
    };
    Blockly.Blocks["test_stack_b"] = {
      init: function () {
        this.appendStatementInput("DO");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
      },
    };
    Blockly.Blocks["test_leaf"] = {
      init: function () {
        this.setPreviousStatement(true);
        this.setNextStatement(true);
      },
    };
    this.workspace = new Blockly.Workspace();
  });

  teardown(function () {
    this.workspace.dispose();
    delete Blockly.Blocks["test_stack_a"];
    delete Blockly.Blocks["test_stack_b"];
    delete Blockly.Blocks["test_leaf"];
  });

  suite("getActiveBlockTypes", function () {
    test("unions block types from active layers only", function () {
      const layers = [
        { id: "a", name: "A", blockTypes: ["test_stack_a"] },
        { id: "b", name: "B", blockTypes: ["test_stack_b", "test_leaf"] },
      ];
      const types = getActiveBlockTypes(layers, new Set(["b"]));
      assert.sameMembers([...types], ["test_stack_b", "test_leaf"]);
    });

    test("returns an empty set when no layers are active", function () {
      const layers = [{ id: "a", name: "A", blockTypes: ["test_stack_a"] }];
      const types = getActiveBlockTypes(layers, new Set());
      assert.isEmpty([...types]);
    });
  });

  suite("findRootMatches", function () {
    test("returns an empty list when no types are active", function () {
      this.workspace.newBlock("test_stack_a");
      const matches = findRootMatches(this.workspace, new Set());
      assert.isEmpty(matches);
    });

    test("returns a matching top-level block", function () {
      const block = this.workspace.newBlock("test_stack_a");
      const matches = findRootMatches(
        this.workspace,
        new Set(["test_stack_a"]),
      );
      assert.deepEqual(matches, [block]);
    });

    test("finds a match nested inside a non-matching container", function () {
      const outer = this.workspace.newBlock("test_stack_a");
      const inner = this.workspace.newBlock("test_stack_b");
      outer.getInput("DO").connection.connect(inner.previousConnection);

      const matches = findRootMatches(
        this.workspace,
        new Set(["test_stack_b"]),
      );
      assert.deepEqual(matches, [inner]);
    });

    test("finds a match later in a statement chain", function () {
      const first = this.workspace.newBlock("test_stack_a");
      const second = this.workspace.newBlock("test_stack_b");
      first.nextConnection.connect(second.previousConnection);

      const matches = findRootMatches(
        this.workspace,
        new Set(["test_stack_b"]),
      );
      assert.deepEqual(matches, [second]);
    });

    test("does not separately report a block already covered by a matching ancestor", function () {
      const outer = this.workspace.newBlock("test_stack_a");
      const inner = this.workspace.newBlock("test_stack_b");
      outer.getInput("DO").connection.connect(inner.previousConnection);

      const matches = findRootMatches(
        this.workspace,
        new Set(["test_stack_a", "test_stack_b"]),
      );
      assert.deepEqual(matches, [outer]);
    });
  });
});
