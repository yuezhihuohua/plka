// Mac portable entry: detach the service before the Terminal launcher exits.
import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { configDir, resolveDataDir, rememberDataDir, VERSION } from '../lib/config.mjs';
import {acquireStartLock} from '../lib/start-lock.mjs';
import {isNewerVersion} from '../lib/version.mjs';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export async function startBackground(options={}){
  const release=await acquireStartLock(options.timeoutMs||180000);
  try{return await startUnlocked(options);}finally{release();}
}
async function startUnlocked({ noOpen = false, timeoutMs = 180000, upgradeOwned = false } = {}) {
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
  async function verify(service, allowOld = false) {
    if (service?.ok !== true || typeof service.version !== 'string') throw new Error('本机端口已有其他服务，未接管它。');
    const key = join(dataDir, '.connection-key');
    if (!existsSync(key)) throw new Error('端口中的服务属于另一份图库，未修改它。请先停止原服务。');
    const response = await fetch(base + '/api/stats', {
      headers: { Authorization: 'Bearer ' + readFileSync(key, 'utf8').trim() },
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) throw new Error('端口中的服务属于另一份图库，未修改它。请先停止原服务。');
    if (!allowOld && service.version !== VERSION) throw new Error('已有其他版本运行，请更新本机 Plka 助手。');
  }
  let service = await health();
  if (service && service.version !== VERSION && upgradeOwned) {
    if(isNewerVersion(service.version,VERSION))throw new Error('这台电脑正在运行更新版本的 Plka，请使用新版助手；不会自动降级图库。');
    await verify(service, true);
    const response = await fetch(base + '/api/shutdown', {method:'POST',headers:{Authorization:'Bearer '+readFileSync(join(dataDir,'.connection-key'),'utf8').trim()},signal:AbortSignal.timeout(3000)});
    if (!response.ok) throw new Error('旧版 Plka 尚未退出，未覆盖图库。');
    for (let n=0;n<100;n++) { await delay(100); service=await health(); if (!service) break; }
    if (service) throw new Error('旧版 Plka 正在退出，请稍后再试。');
  }
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
        cwd: appRoot, detached: true, windowsHide:true, stdio: ['ignore', fd, fd],
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
  } else if(!noOpen && process.platform==='win32') {
    const candidates=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(path=>join(path,'Google','Chrome','Application','chrome.exe'));
    const chrome=candidates.find(path=>existsSync(path));
    const browser=spawn(chrome||'rundll32.exe',chrome?[base]:['url.dll,FileProtocolHandler',base],{stdio:'ignore',detached:true,windowsHide:true});browser.on('error',()=>{});browser.unref();
  }
  return { ok: true, reused, version: VERSION, url: base + '/', dataDir, logPath };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await startBackground({ noOpen: process.argv.includes('--no-open') });
    console.log(`Plka 已就绪：${result.url}\n图库位置：${result.dataDir}\n可以关闭此终端窗口，图库继续在后台运行。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
