import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

function loadScreenContext(authFetch) {
  const file = path.join(root, "lib/screen-context.ts");
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const require = (specifier) => {
    if (specifier.endsWith("/api-errors")) return { ApiError: class ApiError extends Error {} };
    if (specifier.endsWith("/client-auth")) return { authFetch };
    throw new Error(`Unexpected import: ${specifier}`);
  };
  vm.runInNewContext(source, { exports, require, Map, Promise, Date, Object, Array }, { filename: file });
  return exports;
}

test("focused resource misses bypass screen-context and remain deduplicated", async () => {
  let contextRequests = 0;
  let categoryRequests = 0;
  const screenContext = loadScreenContext(async () => {
    contextRequests += 1;
    throw new Error("screen-context should not be requested");
  });
  const fallback = async () => {
    categoryRequests += 1;
    await delay(5);
    return [{ id: 7, name: "Category" }];
  };

  const [first, second] = await Promise.all([
    screenContext.fetchGridResource(72, "categories", { preferFallback: true, fallback }),
    screenContext.fetchGridResource(72, "categories", { preferFallback: true, fallback }),
  ]);
  const cached = await screenContext.fetchGridResource(72, "categories", { preferFallback: true, fallback });

  assert.deepEqual(JSON.parse(JSON.stringify(first)), [{ id: 7, name: "Category" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(second)), [{ id: 7, name: "Category" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(cached)), [{ id: 7, name: "Category" }]);
  assert.equal(contextRequests, 0);
  assert.equal(categoryRequests, 1);
});
