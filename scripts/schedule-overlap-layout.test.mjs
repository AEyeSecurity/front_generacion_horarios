import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/schedule-overlap-layout.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { buildOverlapGroupMeta, getColumnOverlapCardLayout, getGroupedUnitCardLayout } = exports;
const row = (placementId, startSlot, endSlot, spanWeight = 1, visualOrder = null) =>
  ({ placementId, dayIndex: 0, startSlot, endSlot, spanWeight, visualOrder });
const layout = (rows, capacity = 1) => buildOverlapGroupMeta(new Map([[0, rows]]), capacity);

test("work shifts without categories occupy separate columns during temporal overlap", () => {
  const meta = layout([row("Morning", 7, 15), row("Mid", 10, 18), row("Evening", 15, 23)]);
  assert.equal(meta.Morning.layoutUnits, 2);
  assert.equal(meta.Morning.startUnit, 0);
  assert.equal(meta.Mid.startUnit, 1);
  assert.equal(meta.Evening.startUnit, 0);
  const morning = getColumnOverlapCardLayout(0, 100, [1], meta.Morning);
  const mid = getColumnOverlapCardLayout(0, 100, [1], meta.Mid);
  assert.equal(morning.width, "calc(0.5 * ((100% - 100px) / 1) - 0px)");
  assert.notEqual(morning.left, mid.left);
});

test("three concurrent activities fit inside the day without colliding", () => {
  const meta = layout([row("a", 0, 8), row("b", 1, 9), row("c", 2, 10)]);
  assert.deepEqual(Object.values(meta).map((value) => value.startUnit), [0, 1, 2]);
  for (const value of Object.values(meta)) {
    assert.equal(value.layoutUnits, 3);
    assert.ok(value.startUnit + value.spanUnits <= value.layoutUnits);
  }
});

test("touching and isolated shifts retain full day width", () => {
  const meta = layout([row("a", 0, 4), row("b", 4, 8)]);
  for (const value of Object.values(meta)) {
    assert.equal(value.layoutUnits, 1);
    assert.equal(value.startUnit, 0);
  }
});

test("visual order, not activity or unit identity, sets left-to-right preference", () => {
  const meta = layout([row("a", 0, 8, 1, 1), row("b", 0, 8, 1, 0)]);
  assert.equal(meta.b.startUnit, 0);
  assert.equal(meta.a.startUnit, 1);
});

test("six-unit school scope keeps proportional widths and centered partial groups", () => {
  const units = ["1", "2", "3", "4", "5", "6"];
  const meta = layout([row("a", 0, 8, 3), row("b", 0, 8, 2)], 6);
  assert.equal(meta.a.layoutUnits, 6);
  assert.equal(meta.a.startUnit, 0.5);
  assert.equal(meta.b.startUnit, 3.5);
  const card = getGroupedUnitCardLayout(0, 100, [6], units, ["1", "3", "5"], null, meta.a);
  assert.equal(card.width, "calc(3 * ((100% - 100px) / 6) - 0px)");
  assert.equal(card.left, "calc(100px + 0.5 * ((100% - 100px) / 6) + 0px)");
});

test("independent activities sharing units can exceed the unit capacity", () => {
  const meta = layout([row("a", 0, 8, 2), row("b", 0, 8, 2)], 2);
  assert.equal(meta.a.layoutUnits, 4);
  const a = getGroupedUnitCardLayout(0, 100, [2], ["1", "2"], ["1", "2"], null, meta.a);
  const b = getGroupedUnitCardLayout(0, 100, [2], ["1", "2"], ["1", "2"], null, meta.b);
  assert.equal(a.width, b.width);
  assert.notEqual(a.left, b.left);
});

test("drag preview uses the same columns as the eventual confirmed placement", () => {
  const preview = layout([row("a", 0, 8), row("__drag_preview__", 2, 6, 1, 1)]);
  const confirmed = layout([row("a", 0, 8), row("b", 2, 6, 1, 1)]);
  assert.deepEqual(
    getColumnOverlapCardLayout(0, 100, [1], preview.__drag_preview__),
    getColumnOverlapCardLayout(0, 100, [1], confirmed.b),
  );
});
