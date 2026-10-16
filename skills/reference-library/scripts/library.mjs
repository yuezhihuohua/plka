#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, openSync, closeSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
function config() {
  let stored = {};
  try { stored = JSON.parse(readFileSync(join(skillRoot, 'library-config.json'), 'utf8')); } catch {}
  const appRoot = process.env.REFERENCE_APP_ROOT || stored.appRoot;
  const dataDir = process.env.REFERENCE_DATA_DIR || stored.dataDir || (appRoot && join(appRoot, 'data'));
  const port = Number(process.env.REFERENCE_PORT || stored.port || 47831);
  if (!dataDir || !appRoot) throw new Error('Skill 尚未绑定图库。请在图库的“Codex Skill”入口安装配套 Skill。');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('图库端口配置无效。');
  return { appRoot: resolve(appRoot), dataDir: resolve(dataDir), port };
}
const c = config();
const base = `http://127.0.0.1:${c.port}`;
async function request(path, method = 'GET', body) {
  let token;
  try { token = readFileSync(join(c.dataDir, '.connection-key'), 'utf8').trim(); }
  catch { throw new Error('尚未找到图库连接凭据。请先运行 start 或启动本地图库。'); }
  let r;
  try { r = await fetch(base + '/api' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) }); }
  catch (e) { throw new Error(['EPERM','EACCES'].includes(e.cause?.code||e.code)?'当前执行环境限制了本机连接，请申请本机网络访问后重试。':'本地图库未运行。可执行此脚本的 start 命令启动。'); }
  const value = await r.json(); if (!r.ok) throw new Error(value.error || '图库请求失败。'); return value;
}
async function status() {
  try { const health = await (await fetch(base + '/api/health', { signal: AbortSignal.timeout(1500) })).json(); if (!health.ok) throw new Error();
    const collections = await request('/collections'); return { running: true, version: health.version, dataDir: c.dataDir, collections: collections.length, url: base };
  } catch (e) { const blocked=['EPERM','EACCES'].includes(e.cause?.code||e.code)||e.message.includes('执行环境限制');return { running: false, access_blocked: blocked, url: base, reason: blocked?'当前执行环境限制了本机连接，需要本机网络访问权限。':e.message || '图库未运行或配置不匹配。' }; }
}
async function start() {
  const current = await status(); if (current.running) return current;
  if(current.access_blocked)throw new Error(current.reason);
  let occupied = false;
  try { await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
  if (occupied) throw new Error('该端口已有服务，且与 Skill 的图库配置不匹配。请检查数据目录；不会覆盖现有服务。');
  const entry = join(c.appRoot, 'server.mjs'); if (!existsSync(entry)) throw new Error('图库项目已移动，请从新位置重新安装 Skill。');
  mkdirSync(c.dataDir, { recursive: true }); const log = openSync(join(c.dataDir, 'service.log'), 'a');
  const child = spawn(process.execPath, ['--experimental-sqlite', entry], { cwd: c.appRoot, env: { ...process.env, REFERENCE_DATA_DIR: c.dataDir, REFERENCE_PORT: String(c.port) }, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  const failure = new Promise((_, reject) => child.once('error', reject)); child.unref(); closeSync(log);
  return Promise.race([failure, (async () => { for (let n = 0; n < 30; n++) { await new Promise(r => setTimeout(r, 200)); const next = await status(); if (next.running) return next; } throw new Error('图库启动失败，请查看数据目录中的 service.log。'); })()]);
}
function parse(argv) {
  const [command = 'status', ...args] = argv, options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || args[i + 1] === undefined) throw new Error('参数应为 --名称 值。');
    options[args[i].slice(2)] = args[i + 1];
  }
  return { command, options };
}
const required = (o, k) => { if (!o[k]) throw new Error('缺少参数 --' + k); return o[k]; };
export async function run(argv) {
  const { command, options: o } = parse(argv);
  if (command === 'status') return status();
  if (command === 'start') return start();
  if (command === 'collections') return request('/collections');
  if (command === 'images') return request('/items?' + new URLSearchParams({ collection_id: required(o, 'collection'), offset: o.offset || 0, limit: o.limit || 100 }));
  if (command === 'runs') return request('/analyses');
  if (command === 'begin') return request('/analyses', 'POST', { collection_id: required(o, 'collection'), brief: required(o, 'brief') });
  const id = encodeURIComponent(required(o, 'run'));
  if (command === 'run') return request('/analyses/' + id);
  if (command === 'image') {
    const data = await request(`/analyses/${id}/image`, 'POST', { item_id: required(o, 'item') });
    const folder = o.out ? resolve(o.out) : mkdtempSync(join(tmpdir(), 'reference-analysis-'));
    mkdirSync(folder, { recursive: true }); const imagePath = join(folder, `${data.item.id}.${data.item.ext}`);
    writeFileSync(imagePath, Buffer.from(data.data, 'base64'), { mode: 0o600 });
    return { image_path: imagePath, item: data.item, next: '必须用图像查看工具打开 image_path，实际看图后再提交观察；读取失败需记为 unreadable。' };
  }
  if (command === 'observe') return request(`/analyses/${id}/observation`, 'POST', { item_id: required(o, 'item'), observation: readFileSync(resolve(required(o, 'file')), 'utf8'), status: required(o, 'status') });
  if (command === 'finish') return request(`/analyses/${id}/finalize`, 'POST', { report: readFileSync(resolve(required(o, 'file')), 'utf8') });
  throw new Error('未知命令：' + command);
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { console.log(JSON.stringify(await run(process.argv.slice(2)), null, 2)); }
  catch (e) { console.error(JSON.stringify({ error: e.message })); process.exitCode = 1; }
}
