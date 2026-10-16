// Maintainer-only native smoke test; never uses the real library or Codex home.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { png } from '../test/fixtures.mjs';
const execute = promisify(execFile), app = resolve(process.argv[2]);
const node = join(app, 'runtime', 'bin', 'node');
const scratch = mkdtempSync(join(tmpdir(), 'plka-mac-test-'));
const data = join(scratch, '测试图库 with spaces');
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(r => reservation.close(r));
const env = { ...process.env, PIKA_CONFIG_DIR: join(scratch, '配置 with spaces'), REFERENCE_DATA_DIR: data, REFERENCE_PORT: String(port), CODEX_HOME: join(scratch, 'codex home') };
const base = `http://127.0.0.1:${port}`, checks = [];
const shell = (file, args = [], options = {}) => execute('/bin/zsh', [join(app, file), ...args], { env, timeout: 30000, ...options });
const runNode = (args, options = {}) => execute(node, args, { env, timeout: 30000, ...options });
async function api(path, method = 'GET', body) {
  const token = readFileSync(join(data, '.connection-key'), 'utf8').trim();
  const response = await fetch(base + '/api' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(4000) });
  const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
}
async function waitStopped() {
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) }); }
    catch { return; }
    await delay(100);
  }
  throw new Error('Test service did not stop');
}
let report;
try {
  const runtime = JSON.parse((await runNode(['-p', 'JSON.stringify({arch:process.arch,platform:process.platform,version:process.version})'])).stdout);
  assert.equal(runtime.platform, 'darwin'); assert.equal(runtime.arch, process.arch);
  checks.push('bundled-runtime-native');
  await shell('1-Start.command', ['--no-open']);
  await delay(350); // The starter has exited; the detached child must remain alive.
  assert.equal((await api('/health')).ok, true); checks.push('background-survives-launcher-exit');
  assert.equal((await api('/stats')).active, 0);
  const location = JSON.parse(readFileSync(join(env.PIKA_CONFIG_DIR, 'library-location.json'), 'utf8'));
  assert.equal(location.dataDir, data); checks.push('isolated-path-with-spaces-and-chinese');
  const key = readFileSync(join(data, '.connection-key'), 'utf8');
  await shell('1-Start.command', ['--no-open']);
  assert.equal(readFileSync(join(data, '.connection-key'), 'utf8'), key); checks.push('repeat-start-reuses-service');
  await assert.rejects(shell('1-Start.command', ['--no-open'], { env: { ...env, REFERENCE_DATA_DIR: join(scratch, 'other-library') } }), /属于另一份图库/);
  assert.equal((await api('/stats')).active, 0); checks.push('wrong-library-service-untouched');
  const folder = await api('/collections', 'POST', { name: 'Mac 便携包验收' });
  const { item } = await api('/import', 'POST', { data: png.toString('base64'), meta: { name: '测试图片', collections: [folder.id], tags: ['测试'] } });
  assert.equal((await api('/stats')).active, 1); checks.push('collection-and-image-import');
  await shell('2-Install-Codex-Skill.command');
  const skill = join(env.CODEX_HOME, 'skills', 'reference-library');
  const binding = JSON.parse(readFileSync(join(skill, 'library-config.json'), 'utf8'));
  assert.equal(binding.nodePath, node); assert.equal(binding.appRoot, app); assert.equal(binding.dataDir, data);
  const cli = async (...args) => JSON.parse((await runNode([join(skill, 'scripts', 'library.mjs'), ...args])).stdout);
  assert.equal((await cli('status')).running, true); checks.push('codex-skill-installs-and-connects');
  const analysis = await cli('begin', '--collection', folder.id, '--brief', '打包接口测试，不是模型视觉分析');
  const read = await cli('image', '--run', analysis.id, '--item', item.id, '--out', join(scratch, 'images'));
  assert.deepEqual(readFileSync(read.image_path), png);
  const note = join(scratch, 'note.txt'), md = join(scratch, 'report.md');
  writeFileSync(note, '仅接口测试：不代表真实图像观察。'); writeFileSync(md, '# Mac 打包接口测试\n\n仅验证报告回写。');
  await cli('observe', '--run', analysis.id, '--item', item.id, '--status', 'analyzed', '--file', note);
  const finished = await cli('finish', '--run', analysis.id, '--file', md);
  assert.equal(finished.status, 'complete'); assert.ok(existsSync(finished.report_path)); checks.push('skill-image-read-and-report-roundtrip');
  const backup = await api('/backup', 'POST', {}); assert.ok(existsSync(join(backup.path, 'library.sqlite')));
  checks.push('complete-local-backup');
  await shell('3-Stop.command'); await waitStopped();
  await shell('1-Start.command', ['--no-open']);
  assert.equal((await api('/stats')).active, 1);
  assert.equal(readFileSync(join(data, '.connection-key'), 'utf8'), key);
  assert.equal((await api('/analyses'))[0].status, 'complete'); checks.push('stop-restart-preserves-image-key-report');
  const dataPath = (await runNode([join(app, 'tools', 'runtime-info.mjs'), '--data-path'])).stdout.trim();
  assert.equal(dataPath, data);
  report = { passed: true, architecture: runtime.arch, nodeVersion: runtime.version, checks, modelAnalysisTested: false, finderFirstRunTested: false };
} finally {
  if (existsSync(join(data, '.connection-key'))) {
    try { await api('/shutdown', 'POST', {}); await waitStopped(); } catch {}
  }
  rmSync(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify(report));
