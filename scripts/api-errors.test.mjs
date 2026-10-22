import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (specifier) => load(specifier.startsWith("@/") ? `${specifier.slice(2)}.ts` : path.relative(root, path.resolve(path.dirname(file), `${specifier}.ts`)));
  vm.runInNewContext(source, { exports, require, Error, TypeError, Object, JSON, Set, console }, { filename: file });
  return exports;
}
const { normalizeApiError, getApiError, ApiError, LocalizedApiError } = load("lib/api-errors.ts");
const { apiErrorPayload } = load("lib/api-error-contract.ts");
const { ERROR_EN, ERROR_ES } = load("lib/api-error-translations.ts");
const json = (value) => JSON.parse(JSON.stringify(value));

test("known codes take priority over English detail in both locales", () => {
  const payload = { code: "PLACEMENT_OVERLAPS_BLOCKED_RANGE", detail: "Backend text must never appear" };
  assert.equal(normalizeApiError(payload, "", { locale: "en-US" }), "Placement overlaps a blocked range.");
  assert.equal(normalizeApiError(payload, "", { locale: "es-AR" }), "La asignación se superpone con un rango bloqueado.");
});

test("parameters and JSON-encoded BFF errors interpolate using the selected locale", () => {
  const payload = { code: "CELL_DURATION_NOT_MULTIPLE_OF_SLOT", detail: "English", params: { slot_minutes: 30 } };
  assert.equal(normalizeApiError(JSON.stringify(payload), "", { locale: "es-AR" }), "La duración de la celda debe ser múltiplo de 30 minutos.");
  assert.equal(normalizeApiError({ error: JSON.stringify(payload) }, "", { locale: "en-US" }), "Cell duration must be a multiple of 30 minutes.");
});

test("native and nested validation preserve field associations", () => {
  const result = getApiError({ code: "VALIDATION_ERROR", fields: {
    duration_min: [{ code: "MIN_VALUE", params: { min_value: 1 }, detail: "English" }],
    staff_options: { members: [{ code: "REQUIRED" }] },
  } }, { locale: "es-AR" });
  assert.deepEqual(json(result.fields), {
    duration_min: ["El valor debe ser mayor o igual que 1."],
    "staff_options.members": ["Este campo es obligatorio."],
  });
  assert.ok(!result.message.includes("English"));
});

test("unknown, legacy, HTML and malformed errors have safe translated fallbacks", () => {
  for (const payload of ["<html>Internal server secrets</html>", "{invalid", { code: "FUTURE_ERROR", detail: "Raw backend text" }, { detail: "Raw backend text" }, { error: "Raw backend text" }, { message: "Raw backend text" }]) {
    assert.equal(normalizeApiError(payload, "", { locale: "es-AR" }), "Ocurrió un error. Volvé a intentarlo.");
  }
  const legacy = getApiError({ email: ["Raw legacy field error"], non_field_errors: ["Raw legacy error"] }, { locale: "es-AR" });
  assert.deepEqual(json(legacy.fields), { email: ["Ingresá un valor válido."], non_field_errors: ["Ingresá un valor válido."] });
});

test("unexpected server errors preserve Spanish Unicode", () => {
  assert.equal(
    normalizeApiError({ code: "UNEXPECTED_ERROR" }, "", { locale: "es-AR", status: 500 }),
    "Ocurrió un error inesperado en el servidor. Volvé a intentarlo.",
  );
});

test("HTTP, network and repeated normalization preserve useful errors", () => {
  assert.equal(normalizeApiError(null, "", { locale: "es-AR", status: 401 }), "Iniciá sesión para continuar.");
  assert.equal(normalizeApiError(new TypeError("Failed to fetch"), "", { locale: "es-AR" }), "No se pudo conectar. Revisá tu conexión y volvé a intentarlo.");
  const error = new ApiError(404, { code: "NO_PUBLISHED_SCHEDULE", detail: "English diagnostic" });
  assert.equal(normalizeApiError(error, "", { locale: "es-AR" }), "Todavía no hay un horario publicado para esta grilla.");
  assert.equal(normalizeApiError(new LocalizedApiError("Mensaje ya traducido")), "Mensaje ya traducido");
  assert.ok(!normalizeApiError({ code: "MIN_VALUE" }, "", { locale: "es-AR" }).includes("{min_value}"));
});

test("planning type diagnostics translate without changing successful response shapes", () => {
  const precheck = { type: "CELL_INSUFFICIENT_CANDIDATES", cell_id: 4, headcount: 3, candidate_count: 2, detail: "Raw English" };
  assert.equal(normalizeApiError(precheck, "", { locale: "es-AR" }), "La celda 4 necesita 3 participantes, pero solo hay 2 elegibles.");
  assert.equal(normalizeApiError({ type: "BLOCKED_RANGE", message: "Raw English" }, "", { locale: "es-AR" }), "La asignación se superpone con un rango bloqueado.");
});

test("BFF keeps canonical metadata and rejects non-JSON/internal errors", () => {
  const original = { code: "CELL_SERIES_REMOVAL_REQUIRES_CONFIRMATION", detail: "Confirm", params: {}, requires_confirmation: true, impact: { cells: [1] } };
  assert.deepEqual(json(apiErrorPayload(JSON.stringify(original), 409)), original);
  assert.deepEqual(json(apiErrorPayload({ error: JSON.stringify(original) }, 409)), original);
  assert.equal(apiErrorPayload("<html>secret</html>", 502).code, "UPSTREAM_UNAVAILABLE");
  assert.ok(!JSON.stringify(apiErrorPayload({ detail: "secret", traceback: "secret" }, 500)).includes("secret"));
});

test("every backend, BFF and planning code has explicit EN and ES translations", () => {
  assert.deepEqual(Object.keys(ERROR_EN).sort(), Object.keys(ERROR_ES).sort());
  for (const key of Object.keys(ERROR_EN)) {
    assert.ok(ERROR_EN[key].trim(), key);
    assert.ok(ERROR_ES[key].trim(), key);
    assert.deepEqual([...ERROR_EN[key].matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), [...ERROR_ES[key].matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), `${key} interpolation`);
  }
  const backend = path.resolve(root, "../Shift-Backend");
  const python = process.platform === "win32" ? path.join(backend, ".venv/Scripts/python.exe") : path.join(backend, ".venv/bin/python");
  const script = `import ast,json
from pathlib import Path
codes=set()
for folder in ['api','scheduler']:
 for file in Path(folder).rglob('*.py'):
  if file.name.startswith('test') or 'migrations' in file.parts:continue
  tree=ast.parse(file.read_text(encoding='utf-8-sig'))
  for n in ast.walk(tree):
   if isinstance(n,ast.Call):
    if isinstance(n.func,ast.Name) and n.func.id=='error_message' and len(n.args)>1 and isinstance(n.args[1],ast.Constant):codes.add(n.args[1].value)
    if isinstance(n.func,ast.Name) and n.func.id=='_reason' and n.args and isinstance(n.args[0],ast.Constant):codes.add(n.args[0].value)
    for k in n.keywords:
     if k.arg=='code' and isinstance(k.value,ast.Constant) and isinstance(k.value.value,str):codes.add(k.value.value)
   if isinstance(n,ast.Dict):
    for k,v in zip(n.keys,n.values):
     if isinstance(k,ast.Constant) and k.value in ['code','type'] and isinstance(v,ast.Constant) and isinstance(v.value,str) and (v.value.isupper() or k.value=='code'):codes.add(v.value)
print(json.dumps(sorted(codes)))`;
  const codes = JSON.parse(execFileSync(python, ["-B", "-c", script], { cwd: backend, encoding: "utf8" }));
  for (const code of codes) assert.ok(Object.hasOwn(ERROR_EN, `errors.${code}`), `Missing translation for backend code ${code}`);
});
