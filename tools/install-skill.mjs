import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveDataDir, VERSION } from '../lib/config.mjs';

export const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const skillName = 'reference-library';
export const version = VERSION;
export const defaultDest = () => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'skills', skillName);
export function skillStatus(destination = defaultDest()) {
  const configFile = join(destination, 'library-config.json');
  try {
    const config = JSON.parse(readFileSync(configFile, 'utf8'));
    return { installed: existsSync(join(destination, 'SKILL.md')) && config.product === skillName && config.appRoot === appRoot, version: config.version, dataDir: config.dataDir, port: config.port, skillName, path: destination };
  } catch { return { installed: false, skillName, path: destination }; }
}
function files(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name), prefix + e.name + '/') : [prefix + e.name]);
}
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
export function installSkill({ destination = defaultDest(), dataDir = resolveDataDir(), port = Number(process.env.REFERENCE_PORT) || 47831 } = {}) {
  destination = resolve(destination); const source = join(appRoot, 'skills', skillName);
  if (existsSync(destination)) {
    let prior; try { prior = JSON.parse(readFileSync(join(destination, 'library-config.json'), 'utf8')); } catch {}
    if (prior?.product !== skillName) throw new Error('同名 Skill 已存在且不是本产品安装的版本，未覆盖。');
  }
  const parent = dirname(destination); mkdirSync(parent, { recursive: true });
  const staging = join(dirname(parent),'.reference-library-install-'+Date.now());
  const backup = join(dirname(parent),'skill-backups',skillName,String(Date.now()));
  let backedUp = false;
  try {
    cpSync(source, staging, { recursive: true });
    const manifest = Object.fromEntries(files(source).map(file => [file, digest(join(source, file))]));
    for (const [file, hash] of Object.entries(manifest)) if (digest(join(staging, file)) !== hash) throw new Error('Skill 文件校验失败：' + file);
    writeFileSync(join(staging, 'library-config.json'), JSON.stringify({ product: skillName, version, appRoot, dataDir: resolve(dataDir), port, nodePath: process.execPath, installedAt: new Date().toISOString() }, null, 2));
    writeFileSync(join(staging, 'integrity.json'), JSON.stringify(manifest, null, 2));
    if (existsSync(destination)) { mkdirSync(dirname(backup),{recursive:true});renameSync(destination, backup); backedUp = true; }
    renameSync(staging, destination);
    return { ...skillStatus(destination), verifiedFiles: Object.keys(manifest).length, backup: backedUp ? backup : undefined, invocation: '$reference-library 分析“收藏夹名称”' };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (backedUp && !existsSync(destination)) renameSync(backup, destination);
    throw error;
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { const index = process.argv.indexOf('--dest'); console.log(JSON.stringify(installSkill(index >= 0 ? { destination: process.argv[index + 1] } : {}), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
