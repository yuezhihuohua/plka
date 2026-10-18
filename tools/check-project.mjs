import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => readFileSync(join(root, path), 'utf8');
const { version } = JSON.parse(read('package.json'));
const errors = [];
if (JSON.parse(read('extension/manifest.json')).version !== version) errors.push('Manifest version differs from package.json');
if (!read('lib/config.mjs').includes(`VERSION='${version}'`)) errors.push('Runtime version differs from package.json');
if (!read('public/index.html').includes(`<span class="version">${version}</span>`)) errors.push('UI version differs from package.json');
for (const file of ['README.md', 'distribution/Mac-使用说明.md', 'distribution/Windows-使用说明.md', 'distribution/Mac-使用说明.html', 'distribution/Windows-使用说明.html']) {
  if (!read(file).includes('v' + version)) errors.push('Current version missing from ' + file);
}
function walk(dir, prefix = '') { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name), prefix + e.name + '/') : [prefix + e.name]); }
const tracked = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
const files = [...new Set(tracked.status === 0 ? tracked.stdout.split('\0').filter(Boolean) : walk(root).filter(f => !/^(data|release|\.git|node_modules)\//.test(f) && !['codex-mcp.toml', 'preview.png', 'pinterest-hover-fix.png', '.DS_Store'].includes(f)))];
const privateName = /(^|\/)(data|backups|release|runtime|node_modules)(\/|$)|(^|\/)(\.connection-key|library-config\.json|library-location\.json|integrity\.json|codex-mcp\.toml|\.env(?:\..*)?)$|\.(sqlite(?:-[^/]*)?|db(?:-[^/]*)?|log)$/;
let syntaxCount = 0, linkCount = 0;
for (const file of files) {
  if (privateName.test(file) && file !== '.env.example') errors.push('Private/generated path: ' + file);
  if (!existsSync(join(root, file))) { errors.push('Tracked file is missing: ' + file); continue; }
  if (/\.(mjs|js)$/.test(file)) {
    const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
    if (result.status !== 0) errors.push('Syntax: ' + file + '\n' + result.stderr);
    syntaxCount++;
  }
  if (!['.mjs', '.js', '.m', '.h', '.md', '.html', '.json', '.yaml', '.yml', '.toml', '.css', '.svg', '.command', '.ps1', '.py'].includes(extname(file))) continue;
  const text = read(file);
  if (/\/Users\/[A-Za-z0-9_.-]+\//.test(text) || /[A-Z]:\\Users\\[^\\\s]+\\/.test(text)) errors.push('Personal absolute path: ' + file);
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(text) || /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/.test(text)) errors.push('Credential-shaped content: ' + file);
  if (!file.endsWith('.md')) continue;
  // Ignore fenced examples; inspect local Markdown links and README HTML images.
  const prose = text.replace(/```[^\n]*\n[\s\S]*?```/g, '');
  const targets = [...prose.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map(m => m[1]);
  for (const m of prose.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) targets.push(m[1]);
  for (let target of targets) {
    if (/^[a-z][a-z\d+.-]*:|^#|^\/\//i.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0]); if (!target) continue;
    const destination = resolve(dirname(join(root, file)), target), local = relative(root, destination);
    if (local.startsWith('..') || isAbsolute(local) || !existsSync(destination)) errors.push(`Broken/escaping link: ${file} → ${target}`);
    linkCount++;
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Project checks passed: v${version}, ${syntaxCount} JavaScript files, ${linkCount} local documentation links, ${files.length} source files audited.`);
