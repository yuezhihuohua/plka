import { readFileSync, mkdirSync, rmSync, cpSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (JSON.parse(readFileSync(join(root, 'extension', 'manifest.json'), 'utf8')).version !== version) throw new Error('Extension version mismatch');
const release = join(root, 'release'); mkdirSync(release, { recursive: true });
const staging = mkdtempSync(join(tmpdir(), 'plka-chrome-build-'));
try {
  const source = join(staging, 'extension'); cpSync(join(root, 'extension'), source, { recursive: true });
  const target = join(release, `Plka-Chrome-v${version}.zip`);
  const result = spawnSync('python3', [join(root, 'tools', 'zip-portable.py'), source, target], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Chrome archive failed: ' + (result.error?.message || result.status));
  const bytes = readFileSync(target), hash = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(target + '.sha256', hash + '  ' + basename(target) + '\n');
  console.log(JSON.stringify({ package: target, version, bytes: bytes.length, SHA256: hash }, null, 2));
} finally { rmSync(staging, { recursive: true, force: true }); }
