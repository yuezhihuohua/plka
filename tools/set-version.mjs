// Updates the current release number, never historical changelog/validation entries.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Usage: npm run version:set -- 0.3.3');
const file = path => join(root, path);
const packageFile = file('package.json');
const prior = JSON.parse(readFileSync(packageFile, 'utf8')).version;
const edits = new Map();
for (const path of ['package.json', 'extension/manifest.json']) {
  const value = JSON.parse(readFileSync(file(path), 'utf8')); value.version = version;
  edits.set(path, JSON.stringify(value, null, 2) + '\n');
}
const escaped = prior.replaceAll('.', '\\.');
for (const path of ['lib/config.mjs', 'public/index.html', 'public/plka.user.js', 'README.md', 'distribution/Mac-使用说明.md', 'distribution/Windows-使用说明.md']) {
  const source = readFileSync(file(path), 'utf8');
  if (!source.includes(prior)) throw new Error('Current version missing: ' + path);
  edits.set(path, source.replace(new RegExp('(?<![\\d.])' + escaped + '(?![\\d.])', 'g'), version));
}
// All inputs validate before any write.
for (const [path, content] of edits) writeFileSync(file(path), content);
for (const script of ['render-macos-guide.mjs', 'render-windows-guide.mjs', 'check-project.mjs']) {
  const result = spawnSync(process.execPath, [file('tools/' + script)], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0 || result.error) throw new Error('Version files updated, but follow-up failed: ' + script);
}
console.log(`Current version: ${prior} → ${version}. Update CHANGELOG and validation records manually.`);
