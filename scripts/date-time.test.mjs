import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const file = path.resolve(import.meta.dirname, "../lib/date-time.ts");
const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(source, { exports, Date, Intl, Number, String }, { filename: file });

const { formatArgentineDate, formatArgentineDateTime } = exports;
const sample = new Date(2026, 9, 15, 16, 16);

test("Spanish date-time uses Argentine date order and 24-hour time", () => {
  assert.equal(formatArgentineDateTime(sample, "es-AR"), "15/10/2026, 16:16");
});

test("English date-time keeps Argentine date order", () => {
  const formatted = formatArgentineDateTime(sample, "en-US");
  assert.equal(formatted, "15/10/2026, 4:16 PM");
  assert.ok(!formatted.includes("10/15/2026"));
});

test("date-only output never depends on the selected language", () => {
  assert.equal(formatArgentineDate(sample), "15/10/2026");
});
