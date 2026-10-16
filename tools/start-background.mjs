// Mac portable entry: detach the service before the Terminal launcher exits.
import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { configDir, resolveDataDir, rememberDataDir, VERSION } from '../lib/config.mjs';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export async function startBackground({ noOpen = false, timeoutMs = 180000 } = {}) {
  const dataDir = resolveDataDir(), port = Number(process.env.REFERENCE_PORT) || 47831;
  const base = `http://127.0.0.1:${port}`;
  async function health() {
    try {
      const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1500) });
      if (!response.ok) return { occupied: true };
      return await response.json();
    } catch (error) {
      if (error.cause?.code === 'ECONNREFUSED') return null;
      throw new Error('本机端口无法确认，请先检查已有服务后重试。');
    }
  }
  async function verify(service) {
    if (service?.ok !== true || service.version !== VERSION) throw new Error('已有其他版本或服务占用端口。请先用旧版停止入口关闭，再启动新版。');
    const key = join(dataDir, '.connection-key');
    if (!existsSync(key)) throw new Error('端口中的服务属于另一份图库，未修改它。请先停止原服务。');
    const response = await fetch(base + '/api/stats', {
      headers: { Authorization: 'Bearer ' + readFileSync(key, 'utf8').trim() },
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) throw new Error('端口中的服务属于另一份图库，未修改它。请先停止原服务。');
  }
  let service = await health();
  let reused = Boolean(service), logPath;
  if (service) await verify(service);
  else {
    const logs = join(configDir(), 'logs');
    mkdirSync(logs, { recursive: true, mode: 0o700 });
    logPath = join(logs, `start-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.log`);
    const fd = openSync(logPath, 'a', 0o600);
    let child, spawnError, exited = false;
    try {
      child = spawn(process.execPath, ['--experimental-sqlite', join(appRoot, 'launcher.mjs'), '--no-open'], {
        cwd: appRoot, detached: true, stdio: ['ignore', fd, fd],
        env: { ...process.env, REFERENCE_DATA_DIR: dataDir, REFERENCE_PORT: String(port) }
      });
      child.on('error', error => { spawnError = error; });
      child.on('exit', () => { exited = true; });
      child.unref();
    } finally { closeSync(fd); }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`启动失败：${spawnError.message}。日志：${logPath}`);
      service = await health();
      if (service) { await verify(service); break; }
      if (exited) throw new Error(`服务未能启动，请查看日志：${logPath}`);
      await delay(250);
    }
    if (!service) throw new Error(`服务仍在准备，暂未确认启动完成。请稍后重试或查看日志：${logPath}`);
  }
  rememberDataDir(dataDir);
  if (!noOpen && process.platform === 'darwin') {
    // Prefer Chrome, since the companion extension is installed there.
    const chrome = spawnSync('/usr/bin/open', ['-a', 'Google Chrome', base], { stdio: 'ignore' });
    if (chrome.status !== 0) spawnSync('/usr/bin/open', [base], { stdio: 'ignore' });
  }
  return { ok: true, reused, version: VERSION, url: base + '/', dataDir, logPath };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await startBackground({ noOpen: process.argv.includes('--no-open') });
    console.log(`Plka 已就绪：${result.url}\n图库位置：${result.dataDir}\n可以关闭此终端窗口，图库继续在后台运行。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
