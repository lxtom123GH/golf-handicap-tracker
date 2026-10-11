#!/usr/bin/env node
// P030 — per-run emulator port isolation.
//
// Wraps `firebase emulators:exec` so every test run gets its OWN ports instead
// of hardcoding defaults that collide across concurrent sessions/repos.
//
// Usage (from repo root):
//   node scripts/run-emulator-tests.mjs [--config firebase.json] \
//        [--project <pid>] --only firestore[,auth,...] -- <test command...>
//
// Port policy, per service in --only:
//   1. env override  EMU_<SVC>_PORT  (e.g. EMU_FIRESTORE_PORT=8091)
//   2. otherwise a freshly-picked free ephemeral port
// Chosen ports are preflight-checked; if one is held, this exits LOUDLY
// (banner + exit code 42) rather than letting the emulator fail opaquely and
// the test suite report meaningless failures.
//
// Exports to the test process: EMU_<SVC>_PORT for each service,
// FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST when applicable, so
// tests read ports from env (see tests reading EMU_FIRESTORE_PORT).
//
// A generated config (.firebase.emu-run.json, deleted afterwards) carries the
// chosen ports; the base config file is never modified.

import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const GEN_CFG = resolve(REPO, '.firebase.emu-run.json');
const SERVICES = ['firestore', 'auth', 'functions', 'storage', 'hosting', 'database', 'ui'];
const EXIT_PORT_HELD = 42;

const log = (...m) => console.log(`[P030 ${RUN_ID}]`, ...m);

function parseArgs(argv) {
  const o = { config: resolve(REPO, 'firebase.json'), project: null, only: null, cmd: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o.cmd = argv.slice(i + 1); break; }
    else if (a === '--config') o.config = resolve(REPO, argv[++i]);
    else if (a === '--project') o.project = argv[++i];
    else if (a === '--only') o.only = argv[++i];
    else throw new Error(`unknown arg "${a}"`);
  }
  if (!o.only) throw new Error('--only required, e.g. --only firestore,auth');
  if (!o.cmd.length) throw new Error('test command required after "--"');
  for (const s of o.only.split(',')) {
    if (!SERVICES.includes(s.trim())) throw new Error(`unknown service "${s}"`);
  }
  return o;
}

function tryListen(port) {
  return new Promise((res) => {
    const srv = createServer();
    srv.once('error', () => res(false));
    srv.listen({ host: '127.0.0.1', port }, () => srv.close(() => res(true)));
  });
}

function pickFreePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen({ host: '127.0.0.1', port: 0 }, () => {
      const p = srv.address().port;
      srv.close(() => res(p));
    });
  });
}

function pidListeningOn(port) {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    for (const line of out.split('\n')) {
      if (line.includes(`:${port} `) && /LISTENING/i.test(line)) {
        const parts = line.trim().split(/\s+/);
        return parts[parts.length - 1];
      }
    }
  } catch { /* best effort */ }
  return null;
}

async function allocatePorts(onlyList, cfg) {
  const ports = {};
  for (const svc of onlyList) {
    const envName = `EMU_${svc.toUpperCase()}_PORT`;
    if (process.env[envName]) {
      ports[svc] = Number(process.env[envName]);
    } else {
      ports[svc] = await pickFreePort();
    }
  }
  // Preflight everything BEFORE starting anything. Loud failure beats a
  // confusing test failure (P030's whole point).
  const held = [];
  for (const [svc, port] of Object.entries(ports)) {
    if (!(await tryListen(port))) {
      held.push({ svc, port, pid: pidListeningOn(port) });
    }
  }
  if (held.length) {
    console.error('');
    console.error('======================================================================');
    console.error(`[P030 ${RUN_ID}] PORT-IN-USE — refusing to start (exit ${EXIT_PORT_HELD})`);
    for (const h of held) {
      console.error(`  ${h.svc.toUpperCase()} port ${h.port} is ALREADY HELD` +
        (h.pid ? ` by PID ${h.pid} (see: netstat -ano | findstr ${h.port})` : '') +
        `. Another emulator/dev server is probably running.`);
    }
    console.error(`  Fix: stop the other process, or pin different ports via env:`);
    for (const h of held) console.error(`       EMU_${h.svc.toUpperCase()}_PORT=<free port>`);
    console.error('  A pinned port must be free; auto-picked ports are re-checked.');
    console.error('  NOT starting the test suite — its failures would be meaningless.');
    console.error('======================================================================');
    console.error('');
    process.exit(EXIT_PORT_HELD);
  }
  return ports;
}

function generateConfig(basePath, onlyList, ports) {
  if (!existsSync(basePath)) throw new Error(`base config not found: ${basePath}`);
  const cfg = JSON.parse(readFileSync(basePath, 'utf8'));
  cfg.emulators = cfg.emulators || {};
  for (const svc of onlyList) {
    cfg.emulators[svc] = typeof cfg.emulators[svc] === 'object' && cfg.emulators[svc] !== null
      ? { ...cfg.emulators[svc], port: ports[svc] }
      : { port: ports[svc] };
  }
  // Never leave a stale hardcoded UI port in a generated run config.
  if (cfg.emulators.ui && typeof cfg.emulators.ui === 'object' && cfg.emulators.ui.enabled !== false) {
    cfg.emulators.ui.enabled = false; // UI off for CI-style runs; free ports stay free.
  }
  writeFileSync(GEN_CFG, JSON.stringify(cfg, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const onlyList = opts.only.split(',').map((s) => s.trim());
  const ports = await allocatePorts(onlyList, opts.config);
  generateConfig(opts.config, onlyList, ports);

  const portSummary = onlyList.map((s) => `${s}=${ports[s]}`).join(' ');
  log(`run ports: ${portSummary}  (base config: ${opts.config}${opts.project ? `, project ${opts.project}` : ''})`);

  const childEnv = { ...process.env };
  for (const [svc, port] of Object.entries(ports)) {
    childEnv[`EMU_${svc.toUpperCase()}_PORT`] = String(port);
  }
  if (ports.firestore) childEnv.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore}`;
  if (ports.auth) childEnv.FIREBASE_AUTH_EMULATOR_HOST = `http://127.0.0.1:${ports.auth}`;

  const innerCmd = opts.cmd.join(' ');
  const fbArgs = [
    'firebase', 'emulators:exec',
    '--config', GEN_CFG,
    ...(opts.project ? ['--project', opts.project] : []),
    '--only', opts.only,
    `"${innerCmd}"`,
  ];

  let code = 1;
  try {
    const child = spawn('npx', fbArgs, { cwd: REPO, stdio: 'inherit', shell: true, env: childEnv });
    code = await new Promise((res) => child.on('exit', res));
  } finally {
    try { unlinkSync(GEN_CFG); } catch { /* already gone */ }
  }
  log(`done, exit ${code}`);
  process.exit(code ?? 1);
}

main().catch((err) => {
  console.error(`[P030] runner error: ${err.message}`);
  process.exit(1);
});
