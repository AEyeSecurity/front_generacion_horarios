// Read-only contract inventory. Executes BFF handlers with mocked transport, then
// checks their URLs/methods against the sibling backend's real Django resolver.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const root = process.cwd();
const backend = path.resolve(root, '../Shift-Backend');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = ['app', 'components', 'lib'].flatMap(d => walk(path.join(root, d))).filter(f => /\.tsx?$/.test(f));
const relative = f => path.relative(root, f).replaceAll('\\', '/');
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const calls = [], routes = [], errors = [];
let transportCalls = [], scenario = 'success';
class MockResponse extends Response {
  cookies = { set() {}, delete() {} };
  static json(value, init) { return new MockResponse(JSON.stringify(value), { ...init, headers: { 'content-type': 'application/json' } }); }
  static redirect(url) { return new MockResponse(null, { status: 307, headers: { location: String(url) } }); }
}
const mockFetch = async (url, init = {}) => {
  const u = new URL(url);
  transportCalls.push({ method: init.method || 'GET', path: u.pathname, query: u.search });
  const refresh = u.pathname.includes('/auth/refresh/');
  const status = refresh ? 200 : scenario === 'not-found' ? 404 : scenario === 'unauthorized' && transportCalls.length === 1 ? 401 : 200;
  return MockResponse.json({ id: 123, grid: 123, access: 'audit-access', refresh: 'audit-refresh', results: [], candidates: [], schedule: [], options: [] }, { status });
};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const require = name => {
    if (name === 'next/server') return { NextResponse: MockResponse };
    if (name === 'server-only') return {};
    if (name === 'next/headers') return { cookies: async () => ({ get: () => ({ value: 'audit-token' }), set() {}, delete() {} }) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const target = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(target + '.ts');
    }
    throw new Error(`Unmocked import ${name}`);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require, fetch: mockFetch, Request, Response, Headers, URL, URLSearchParams, console, process: { env: { NEXT_PUBLIC_API_URL: 'http://backend.test', AUTH_ACCESS_COOKIE: 'shift_access', AUTH_REFRESH_COOKIE: 'shift_refresh' } } }, { filename: file });
  return module.exports;
}
for (const file of files.filter(f => /[\\/]api[\\/].*[\\/]route\.ts$/.test(f))) {
  const route = '/' + relative(file).replace(/\/route\.ts$/, '').replace(/^app\//, '');
  const exports = load(file);
  for (const method of methods.filter(m => typeof exports[m] === 'function')) {
    const record = { method, path: route, file: relative(file), upstream: [] };
    for (scenario of ['success', 'unauthorized', 'not-found', 'split-placement']) {
      transportCalls = [];
      const params = Object.fromEntries([...route.matchAll(/\[([^\]]+)\]/g)].map(m => [m[1], ({ code: 'AUDITCODE', cell_id: '456', run_id: '789' })[m[1]] || '123']));
      const url = 'http://frontend.test' + route.replace(/\[([^\]]+)\]/g, (_, key) => params[key]) + '?grid=123&token=audit-token';
      const req = new Request(url, { method, headers: { cookie: 'shift_access=audit-token', 'content-type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify({ token: 'audit-token', email: 'audit@example.invalid', password: 'audit-password', day_index: 0, start_slot: 0, schedule_id: 123, ...(scenario === 'split-placement' ? { mode: 'PLACE_UNASSIGNED_CELL', split_segment: true, duration_slots: 1 } : {}) }) } : {}) });
      req.nextUrl = new URL(url);
      try {
        const response = await exports[method](req, { params: Promise.resolve(params) });
        if (scenario === 'not-found' && /\/(form-bootstrap|form-options)$/.test(route) && response.status !== 404) {
          throw new Error('Specialized endpoint must preserve upstream domain 404');
        }
      }
      catch (e) { errors.push({ file: record.file, method, scenario, error: e.message }); }
      for (const c of transportCalls) if (!record.upstream.some(x => x.path === c.path && x.method === c.method)) record.upstream.push(c);
    }
    routes.push(record);
  }
}

// Symbolic source inventory: resolve lexical variables, arrays, conditionals,
// local wrapper arguments and shared path helpers. Keep unresolved expressions
// visible instead of silently assuming that a dynamic URL is valid.
const asts = files.map(f => ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true));
const nodes = [], functionMap = new Map();
function visit(node) { nodes.push(node); if (ts.isFunctionDeclaration(node) && node.name) functionMap.set(node.name.text, node); ts.forEachChild(node, visit); }
asts.forEach(visit);
const union = values => [...new Set(values.flat())];
function enclosingFunction(node) { while (node && !ts.isFunctionLike(node)) node = node.parent; return node; }
function resolve(node, seen = new Set()) {
  if (!node || seen.has(node)) return ['{dynamic}'];
  seen = new Set(seen).add(node);
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    let values = [node.head.text];
    for (const span of node.templateSpans) values = values.flatMap(a => resolve(span.expression, seen).map(b => a + b + span.literal.text)).slice(0, 100);
    return values;
  }
  if (ts.isConditionalExpression(node)) return union([resolve(node.whenTrue, seen), resolve(node.whenFalse, seen)]);
  if (ts.isArrayLiteralExpression(node)) return union(node.elements.map(n => resolve(n, seen)));
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isAwaitExpression(node)) return resolve(node.expression, seen);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return resolve(node.left, seen).flatMap(a => resolve(node.right, seen).map(b => a + b));
  if (ts.isIdentifier(node)) {
    let scope = node.parent;
    while (scope) {
      const decls = [];
      const collect = n => { if (n !== scope && ts.isFunctionLike(n)) return; if (ts.isVariableDeclaration(n) && n.name.getText() === node.text) decls.push(n); ts.forEachChild(n, collect); };
      collect(scope);
      const decl = decls.find(d => d.initializer && !seen.has(d.initializer));
      if (decl) return resolve(decl.initializer, seen);
      if (ts.isForOfStatement(scope) && scope.initializer.getText().includes(node.text)) return resolve(scope.expression, seen);
      if (ts.isFunctionLike(scope)) {
        const index = scope.parameters.findIndex(p => p.name.getText() === node.text);
        if (index >= 0) {
          const name = scope.name?.getText() || (ts.isVariableDeclaration(scope.parent) ? scope.parent.name.getText() : ts.isCallExpression(scope.parent) && ts.isVariableDeclaration(scope.parent.parent) ? scope.parent.parent.name.getText() : null);
          const sites = name ? nodes.filter(n => ts.isCallExpression(n) && n.expression.getText() === name && n.getSourceFile() === node.getSourceFile()) : [];
          if (sites.length) return union(sites.map(n => resolve(n.arguments[index], seen)));
        }
      }
      scope = scope.parent;
    }
  }
  if (ts.isCallExpression(node)) {
    const name = node.expression.getText();
    if (['encodeURIComponent', 'String', 'requireApiId'].includes(name)) return ['{id}'];
    const fn = functionMap.get(name);
    if (fn && /Path$/.test(name)) {
      const returns = [];
      const collect = n => { if (ts.isReturnStatement(n)) returns.push(resolve(n.expression, seen)); else ts.forEachChild(n, collect); };
      collect(fn.body); return union(returns);
    }
  }
  return ['{dynamic}'];
}
for (const node of nodes.filter(n => ts.isCallExpression(n) && /^(fetch|backendFetchJSON|apiFetch|authFetch|networkFetch)$/.test(n.expression.getText()))) {
  const sf = node.getSourceFile(), file = relative(sf.fileName);
  if (file.startsWith('app/api/')) continue; // Executed above, including helper delegation.
  const opts = node.arguments[1];
  const prop = opts && ts.isObjectLiteralExpression(opts) ? opts.properties.find(p => p.name?.getText() === 'method') : null;
  const methodValues = prop ? resolve(prop.initializer) : ['GET'];
  const urls = resolve(node.arguments[0]);
  const transport = node.expression.getText() === 'backendFetchJSON' || file === 'lib/backend.ts' || file === 'lib/cell-legacy-bootstrap.ts' ? 'django' : 'bff';
  calls.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, expression: node.arguments[0]?.getText(), methods: methodValues, urls, transport });
}
for (const node of nodes.filter(n => (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText() === 'form')) {
  const attr = name => node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === name)?.initializer;
  const urls = resolve(attr('action'));
  if (urls.some(u => u.startsWith('/api/'))) {
    const sf = node.getSourceFile();
    calls.push({ file: relative(sf.fileName), line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, expression: attr('action').getText(), methods: resolve(attr('method')).map(m => m.toUpperCase()), urls, transport: 'bff' });
  }
}
const python = String.raw`
import os, sys, json, io, contextlib
os.environ['DJANGO_SETTINGS_MODULE']='config.settings'
os.environ['PYTHON_DOTENV_DISABLED']='1'
os.environ['DATABASE_URL']=''
with contextlib.redirect_stdout(io.StringIO()):
 import django
 django.setup()
from django.urls import resolve, Resolver404, get_resolver, URLResolver
def check(c):
 try:
  m=resolve(c['path'])
  actions=getattr(m.func,'actions',None)
  cls=getattr(m.func,'cls',None) or getattr(m.func,'view_class',None)
  allowed=list(actions) if actions is not None else [x for x in getattr(cls,'http_method_names',[]) if hasattr(cls,x)] if cls else ['get']
  return dict(c, valid=c['method'].lower() in allowed, allowed=allowed, view=m.view_name, action=(actions or {}).get(c['method'].lower()))
 except Resolver404:
  return dict(c,valid=False,allowed=[],view=None)
def inventory(patterns,prefix=''):
 result=[]
 for p in patterns:
  if isinstance(p,URLResolver): result.extend(inventory(p.url_patterns,prefix+str(p.pattern)))
  elif (prefix+str(p.pattern)).startswith('api/'):
   actions=getattr(p.callback,'actions',None)
   cls=getattr(p.callback,'cls',None) or getattr(p.callback,'view_class',None)
   allowed=list(actions) if actions is not None else [x for x in getattr(cls,'http_method_names',[]) if hasattr(cls,x)] if cls else ['get']
   result.append(dict(pattern=prefix+str(p.pattern),methods=allowed,name=p.name))
 return result
print(json.dumps(dict(checks=[check(c) for c in json.load(sys.stdin)], endpoints=inventory(get_resolver().url_patterns))))
`;
const sourceChecks = calls.filter(c => c.transport === 'django').flatMap(c => c.urls.filter(u => u.includes('/api/')).flatMap(u => c.methods.map(method => ({ method, path: u.slice(u.indexOf('/api/')).split('?')[0].replace(/\{[^}]+\}/g, '123'), file: c.file }))));
const checks = [...routes.flatMap(r => r.upstream.map(u => ({ ...u, file: r.file, frontendMethod: r.method }))), ...sourceChecks];
const proc = spawnSync(path.join(backend, '.venv/Scripts/python.exe'), ['-c', python], { cwd: backend, input: JSON.stringify(checks), encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
if (proc.status !== 0) throw new Error(proc.stderr || proc.stdout);
const django = JSON.parse(proc.stdout);
const missing = [];
for (const call of calls.filter(c => c.transport === 'bff')) for (const url of call.urls.filter(u => u.startsWith('/api/'))) for (const method of call.methods) {
  const pathname = url.split('?')[0].replace(/\/$/, '').replace(/\{[^}]+\}/g, '123');
  const route = routes.find(r => r.method === method && new RegExp('^' + r.path.replace(/\[[^\]]+\]/g, '[^/]+') + '$').test(pathname));
  if (!route) missing.push({ ...call, url, method });
}
const genericForwarders = new Set(['lib/backend.ts', 'lib/client-auth.ts', 'lib/network-auth.ts']);
const unresolved = calls.filter(c => c.urls.every(u => !u.includes('/api/')));
for (const call of unresolved.filter(c => !genericForwarders.has(c.file))) errors.push({ file: call.file, error: `Unresolved request: ${call.expression}` });
const manifestPath = '.next/server/app-paths-manifest.json';
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const route of routes) if (!manifest[route.path + '/route']) errors.push({ file: route.file, error: 'Missing from built Next route manifest. Rebuild first.' });
}
const result = { routes, calls, django, missing, errors };
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/api-contract-inventory.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ bffContracts: routes.length, requestSites: calls.length, backendEndpoints: django.endpoints.length, invalidUpstreams: django.checks.filter(c => !c.valid), missing, genericForwarders: unresolved, harnessErrors: errors }, null, 2));
if (process.argv.includes('--check') && (missing.length || django.checks.some(c => !c.valid) || errors.length)) process.exitCode = 1;
