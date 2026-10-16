// Maintainer-only builder. Explicit allowlist: never ship a personal library/config.
import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync, rmSync, readdirSync, chmodSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {makeMacApp} from './build-mac-app.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const selected = process.argv[2] || 'all';
if (!['all', 'arm64', 'x64'].includes(selected)) throw new Error('Use all, arm64 or x64');
const cache = join(tmpdir(), 'reference-library-build-cache');
mkdirSync(cache, { recursive: true });
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`${basename(executable)} failed: ${result.error?.message || result.status}`);
}
const releases = JSON.parse((await get('https://nodejs.org/dist/index.json')).toString());
const release = releases.find(r => r.version.startsWith('v22.') && r.lts && ['arm64', 'x64'].every(a => r.files.includes('osx-' + a + '-tar')));
if (!release) throw new Error('No supported official Node 22 LTS Mac build');
const sums = (await get(`https://nodejs.org/dist/${release.version}/SHASUMS256.txt`)).toString();
command(process.execPath, [join(root, 'tools', 'render-macos-guide.mjs')]);
for (const arch of selected === 'all' ? ['arm64', 'x64'] : [selected]) {
  const archive = `node-${release.version}-darwin-${arch}.tar.gz`;
  const url = `https://nodejs.org/dist/${release.version}/${archive}`;
  const entry = sums.split('\n').find(line => line.trim().endsWith(' ' + archive));
  if (!entry) throw new Error('Missing official checksum for ' + archive);
  const expected = entry.trim().split(/\s+/)[0], cached = join(cache, archive);
  if (!existsSync(cached)) writeFileSync(cached, await get(url));
  if (sha(readFileSync(cached)) !== expected) { rmSync(cached); throw new Error('Node archive checksum mismatch'); }
  const extracted = join(cache, `node-${release.version}-darwin-${arch}`);
  // Re-extract the verified archive rather than trusting an old extraction.
  rmSync(extracted, { recursive: true, force: true });
  command('/usr/bin/tar', ['-xzf', cached, '-C', cache]);
  const dest = join(root, 'release', `Plka-Mac-${arch}-v${version}`);
  rmSync(dest, { recursive: true, force: true }); mkdirSync(dest, { recursive: true });
  for (const file of ['package.json', 'server.mjs', 'launcher.mjs', 'mcp.mjs', 'lib', 'public', 'extension', 'skills']) cpSync(join(root, file), join(dest, file), { recursive: true });
  mkdirSync(join(dest, 'tools')); mkdirSync(join(dest, 'runtime', 'bin'), { recursive: true });
  for (const file of ['install-skill.mjs', 'stop-service.mjs', 'runtime-info.mjs', 'start-background.mjs','install-local.mjs','desktop-entry.mjs','native-host.mjs']) cpSync(join(root, 'tools', file), join(dest, 'tools', file));
  const node = join(dest, 'runtime', 'bin', 'node');
  cpSync(join(extracted, 'bin', 'node'), node); chmodSync(node, 0o755);
  cpSync(join(extracted, 'LICENSE'), join(dest, 'runtime', 'LICENSE-Node.txt'));
  const exe = readFileSync(node);
  if (exe.readUInt32LE(0) !== 0xfeedfacf || exe.readUInt32LE(4) !== (arch === 'arm64' ? 0x0100000c : 0x01000007)) throw new Error('Invalid Mach-O or architecture mismatch');
  let officialRuntimeSignatureVerified = false;
  if (process.platform === 'darwin') {
    command('/usr/bin/codesign', ['--verify', '--verbose=1', node]);
    officialRuntimeSignatureVerified = true;
  }
  const script = (name, body) => {
    const path = join(dest, name);
    writeFileSync(path, '#!/bin/zsh\ncd -- "${0:A:h}" || exit 1\n' + body);
    chmodSync(path, 0o755);
    command('/bin/zsh', ['-n', path]);
  };
  script('1-Start.command', '"./runtime/bin/node" tools/start-background.mjs "$@"\nplka_status=$?\nif [[ $plka_status -ne 0 && -t 0 ]]; then print "启动失败。按回车关闭。"; read; fi\nexit $plka_status\n');
  script('2-Install-Codex-Skill.command', '"./runtime/bin/node" tools/install-skill.mjs\nplka_status=$?\nif [[ $plka_status -eq 0 ]]; then print \'Skill 已安装。在 Codex 输入 $reference-library；未出现时重启 Codex。\'; fi\nif [[ -t 0 ]]; then print "按回车关闭。"; read; fi\nexit $plka_status\n');
  script('3-Stop.command', '"./runtime/bin/node" tools/stop-service.mjs\nif [[ -t 0 ]]; then print "按回车关闭。"; read; fi\n');
  script('4-Open-Extension-Folder.command', '/usr/bin/open "./extension"\n');
  script('5-Open-Library-Data.command', 'plka_data_path="$("./runtime/bin/node" tools/runtime-info.mjs --data-path)" || exit 1\nif [[ -d "$plka_data_path" ]]; then /usr/bin/open "$plka_data_path"; else print "请先启动一次 Plka 创建图库。"; if [[ -t 0 ]]; then read; fi; fi\n');
  script('6-Connect-Existing-Library.command', 'print "请将包含 library.sqlite 的原 data 文件夹拖入此窗口，按回车确认："\nIFS= read -r plka_input\nif [[ -z "$plka_input" ]]; then exit 0; fi\nplka_paths=( ${(z)plka_input} )\nif [[ ${#plka_paths[@]} -ne 1 ]]; then print "请只选择一个图库文件夹。"; exit 1; fi\nplka_data_path=${(Q)plka_paths[1]}\n"./runtime/bin/node" tools/runtime-info.mjs --use-data "$plka_data_path"\nplka_status=$?\nif [[ $plka_status -eq 0 ]]; then print "已记录图库路径。请先停止旧服务，再运行 1-Start.command；随后重新安装 Skill。"; fi\nif [[ -t 0 ]]; then print "按回车关闭。"; read; fi\nexit $plka_status\n');
  cpSync(join(root, 'distribution', 'Mac-使用说明.md'), join(dest, '使用说明.md'));
  cpSync(join(root, 'distribution', 'Mac-使用说明.html'), join(dest, '使用说明.html'));
  writeFileSync(join(dest, '先看这里.txt'), 'Plka ' + version + ' · ' + (arch === 'arm64' ? 'Apple 芯片（M 系列）' : 'Intel 芯片') + '\n\n首次：双击 Plka.app，安装一次本机助手。\n按使用说明，将打开的 ChromeExtension 文件夹添加到 Chrome。\n以后：直接打开 Chrome 收藏或点击悬浮按钮，无需启动脚本和连接码。\n旧版升级：保留原图库，替换旧扩展为新版，避免同时启用两份。\n其余 .command 文件仅为维护入口。\n\n包内不含分享者的图库、账号或连接信息。\n');
  let nativeTest;
  if (process.platform === 'darwin' && process.arch === arch) {
    const result = spawnSync(process.execPath, [join(root, 'tools', 'test-macos-package.mjs'), dest], { encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0 || result.error) throw new Error('Native Mac package test failed:\n' + result.stdout + result.stderr + (result.error?.message || ''));
    nativeTest = JSON.parse(result.stdout); console.log(result.stdout.trim());
  }
  const app = makeMacApp(dest);
  if(process.platform==='darwin'&&process.arch===arch){
    const result=spawnSync(process.execPath,[join(root,'tools','test-desktop-install.mjs'),dest],{encoding:'utf8',timeout:120000});
    if(result.status!==0||result.error)throw new Error('Desktop install test failed:\n'+result.stdout+result.stderr+(result.error?.message||''));
    console.log(result.stdout.trim());nativeTest.desktop=JSON.parse(result.stdout);
  }
  writeFileSync(join(dest, '运行环境校验.json'), JSON.stringify({ productVersion: version, architecture: arch, nodeVersion: release.version, source: url, archiveSHA256: expected, verifiedAgainst: 'Official nodejs.org SHASUMS256.txt', nodeExecutableSHA256: sha(exe), officialRuntimeSignatureVerified, builtAt: new Date().toISOString(), nativeMacTested: Boolean(nativeTest), nativeTest: nativeTest || null, limitations: 'Plka 应用尚未采用 Apple 开发者证书签名与公证；收件人电脑的首次安全提示、扩展安装和 Codex 模型分析需实际验收。' }, null, 2));
  function walk(dir, prefix = '') { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name), prefix + e.name + '/') : [prefix + e.name]); }
  const files = walk(dest);
  for (const file of files) {
    if (/(^|\/)(data|backups)(\/|$)|\.connection-key|library-config\.json|integrity\.json|\.sqlite|\.log$/.test(file)) throw new Error('Private file in package: ' + file);
    if (/\.(?:mjs|js|html|md|json|yaml|txt|command|svg|css)$/.test(file) && /\/Users\/[A-Za-z0-9_.-]+\//.test(readFileSync(join(dest, file), 'utf8'))) throw new Error('Personal path in package: ' + file);
  }
  const target = dest + '.zip'; rmSync(target, { force: true });
  command('python3', [join(root, 'tools', 'zip-portable.py'), dest, target]);
  command('/usr/bin/unzip', ['-tq', target]);
  const digest = sha(readFileSync(target));
  writeFileSync(target + '.sha256', digest + '  ' + basename(target) + '\n');
  console.log(JSON.stringify({ package: target, architecture: arch, nodeVersion: release.version, files: files.length, nativeMacTested: Boolean(nativeTest), bytes: readFileSync(target).length, SHA256: digest }, null, 2));
}
