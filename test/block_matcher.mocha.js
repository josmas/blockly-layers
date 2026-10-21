/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const chai = require("chai");
const assert = chai.assert;
const Blockly = require("blockly");
const {
  stackMatchesTypes,
  getMatchingTopBlocks,
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

  suite("stackMatchesTypes", function () {
    test("returns false when no types are active", function () {
      const block = this.workspace.newBlock("test_stack_a");
      assert.isFalse(stackMatchesTypes(block, new Set()));
    });

    test("returns true when the block itself matches", function () {
      const block = this.workspace.newBlock("test_stack_a");
      assert.isTrue(stackMatchesTypes(block, new Set(["test_stack_a"])));
    });

    test("returns true when a nested block matches", function () {
      const outer = this.workspace.newBlock("test_stack_a");
      const inner = this.workspace.newBlock("test_stack_b");
      outer.getInput("DO").connection.connect(inner.previousConnection);

      assert.isTrue(stackMatchesTypes(outer, new Set(["test_stack_b"])));
    });

    test("returns true when a chained next-block matches", function () {
      const first = this.workspace.newBlock("test_stack_a");
      const second = this.workspace.newBlock("test_leaf");
      first.nextConnection.connect(second.previousConnection);

      assert.isTrue(stackMatchesTypes(first, new Set(["test_leaf"])));
    });

    test("returns false when nothing in the stack matches", function () {
      const block = this.workspace.newBlock("test_leaf");
      assert.isFalse(stackMatchesTypes(block, new Set(["test_stack_a"])));
    });
  });

  suite("getMatchingTopBlocks", function () {
    test("returns an empty list when no types are active", function () {
      this.workspace.newBlock("test_stack_a");
      assert.isEmpty(getMatchingTopBlocks(this.workspace, new Set()));
    });

    test("returns the whole top-level stack, not just the matching nested block", function () {
      const outer = this.workspace.newBlock("test_stack_a");
      const inner = this.workspace.newBlock("test_stack_b");
      outer.getInput("DO").connection.connect(inner.previousConnection);

      const matches = getMatchingTopBlocks(
        this.workspace,
        new Set(["test_stack_b"]),
      );
      assert.deepEqual(matches, [outer]);
    });

    test("does not return unrelated top-level stacks", function () {
      const matching = this.workspace.newBlock("test_stack_a");
      this.workspace.newBlock("test_leaf");

      const matches = getMatchingTopBlocks(
        this.workspace,
        new Set(["test_stack_a"]),
      );
      assert.deepEqual(matches, [matching]);
    });
  });
});
