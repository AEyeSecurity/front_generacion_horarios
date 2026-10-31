import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();

function load(relativePath) {
  const file = path.resolve(root, relativePath);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (specifier) => {
    const target = specifier.startsWith("@/")
      ? `${specifier.slice(2)}.ts`
      : path.relative(root, path.resolve(path.dirname(file), `${specifier}.ts`));
    return load(target);
  };
  vm.runInNewContext(source, { exports, require: localRequire, Object, String }, { filename: file });
  return exports;
}

const { selectPluralKey, t } = load("lib/i18n.ts");

function cells(locale, count) {
  const key = selectPluralKey(
    count,
    "create_cell.split_preview_compact_one",
    "create_cell.split_preview_compact",
  );
  return t(locale, key, { cells: count, minutes: 15 });
}

test("cell counts use singular and plural in Spanish", () => {
  assert.equal(cells("es-AR", 1), "1 celda (15 min)");
  assert.equal(cells("es-AR", 2), "2 celdas (15 min)");
});

test("cell counts use singular and plural in English", () => {
  assert.equal(cells("en-US", 1), "1 cell (15 min)");
  assert.equal(cells("en-US", 2), "2 cells (15 min)");
});

test("reported Spanish labels preserve accents", () => {
  assert.equal(t("es-AR", "create_cell.duration_cells_required"), "Duración (en celdas) *");
  assert.equal(t("es-AR", "create_cell.more_than_day"), "Más de un día");
  assert.equal(t("es-AR", "create_cell.description"), "Descripción");
  assert.equal(t("es-AR", "create_cell.split_distribution"), "Distribución");
  assert.equal(t("es-AR", "create_cell.days_count"), "Cantidad de días");
  assert.equal(t("es-AR", "category_panel.title"), "Categorías");
  assert.equal(t("es-AR", "side_dock.categories"), "Categorías");
});
