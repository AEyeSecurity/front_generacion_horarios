import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configureE2E } from './e2e-env.mjs';

if (process.env.E2E_BASE_URL) throw new Error('External mode must not start local E2E services.');
configureE2E();
const mode = process.argv[2];
const buildStamp = resolve('.next/shift-e2e.json');
if (mode === 'frontend') {
  const stamp = existsSync(buildStamp) ? JSON.parse(readFileSync(buildStamp, 'utf8')) : null;
  if (!stamp || stamp.api !== process.env.NEXT_PUBLIC_API_URL ||
      stamp.build !== readFileSync(resolve('.next/BUILD_ID'), 'utf8').trim()) {
    throw new Error('Run npm run e2e:build first. Refusing an unverified Next.js build.');
  }
}
let executable;
let args;
if (mode === 'backend') {
  const backend = resolve(process.env.E2E_BACKEND_DIR || '../Shift-Backend');
  const entry = resolve(backend, 'scripts/run_e2e.py');
  if (!existsSync(entry)) throw new Error(`Missing ${entry}. Checkout Shift-Backend with E2E support.`);
  const venv = resolve(backend, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  executable = process.env.E2E_PYTHON || (existsSync(venv) ? venv : 'python');
  args = ['-u', '-B', entry];
} else if (mode === 'build' || mode === 'frontend') {
  executable = process.execPath;
  // No shell quoting or npm.cmd is needed, including on Windows paths with spaces.
  args = [resolve('node_modules/next/dist/bin/next'), mode === 'build' ? 'build' : 'start'];
  if (mode === 'frontend') args.push('--port', '3000');
} else throw new Error(`Unknown E2E server mode: ${mode}`);

const child = spawn(executable, args, { stdio: 'inherit', env: process.env });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  if (mode === 'build' && code === 0) writeFileSync(buildStamp, JSON.stringify({
    api: process.env.NEXT_PUBLIC_API_URL, build: readFileSync(resolve('.next/BUILD_ID'), 'utf8').trim(),
  }));
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
