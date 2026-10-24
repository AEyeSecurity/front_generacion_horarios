import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/participant-duplicates.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function fixture({ duplicate = true, proceed = false, ok = true } = {}) {
  const calls = [], warnings = [];
  const context = { exports: {}, URLSearchParams,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok, json: async () => ({ duplicate }) };
    },
    window: { confirm: message => { warnings.push(message); return proceed; } },
  };
  vm.runInNewContext(compiled, context);
  return { check: context.exports.confirmDuplicateParticipant, calls, warnings };
}

test('duplicate warning allows cancelling without authorizing save', async () => {
  const f = fixture();
  assert.equal(await f.check(7, 'Ana', 'Perez', undefined, 'es-AR'), false);
  assert.match(f.warnings[0], /ID distinto/);
});
test('duplicate warning allows proceeding and keeps edit identity', async () => {
  const f = fixture({ proceed: true });
  assert.equal(await f.check(7, 'Ana', 'Perez', 23, 'en-US'), true);
  const query = new URL(f.calls[0].url, 'http://test').searchParams;
  assert.equal(query.get('exclude_id'), '23');
  assert.equal(query.get('grid'), '7');
  assert.match(f.warnings[0], /distinct ID/);
});
test('unique names do not prompt', async () => {
  const f = fixture({ duplicate: false });
  assert.equal(await f.check(7, 'Ana', 'Perez', undefined, 'en-US'), true);
  assert.equal(f.warnings.length, 0);
  assert.equal(f.calls[0].options.cache, 'no-store');
});
test('failed lookup is not silently treated as a unique name', async () => {
  const f = fixture({ ok: false });
  await assert.rejects(f.check(7, 'Ana', 'Perez', undefined, 'en-US'), /Could not check/);
  assert.equal(f.warnings.length, 0);
});
