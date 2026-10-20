// Maintainer build script. Downloads only the official Node.js runtime, verifies SHA-256,
// and copies an explicit allowlist so no personal library or connection config is shipped.
import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const arch=process.argv[2]||'x64';if(!['x64','arm64'].includes(arch))throw new Error('Unsupported architecture');
const cache=join(tmpdir(),'reference-library-build-cache');mkdirSync(cache,{recursive:true});
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error(`Download failed ${r.status}: ${url}`);return Buffer.from(await r.arrayBuffer());}
const releases=JSON.parse((await get('https://nodejs.org/dist/index.json')).toString());
const release=releases.find(r=>r.version.startsWith('v22.')&&r.lts&&r.files.includes('win-'+arch+'-zip'));
if(!release)throw new Error('No supported official Node 22 LTS Windows build');
const archive=`node-${release.version}-win-${arch}.zip`,url=`https://nodejs.org/dist/${release.version}/${archive}`;
const sums=(await get(`https://nodejs.org/dist/${release.version}/SHASUMS256.txt`)).toString();
const entry=sums.split('\n').find(line=>line.trim().endsWith(' '+archive));if(!entry)throw new Error('Missing official checksum');
const expected=entry.trim().split(/\s+/)[0],zip=join(cache,archive);
if(!existsSync(zip))writeFileSync(zip,await get(url));
const hash=createHash('sha256').update(readFileSync(zip)).digest('hex');if(hash!==expected){rmSync(zip,{force:true});throw new Error('Node archive checksum mismatch');}
const extracted=join(cache,`node-${release.version}-win-${arch}`);
if(!existsSync(join(extracted,'node.exe'))){const result=spawnSync('/usr/bin/unzip',['-q','-o',zip,'-d',cache],{stdio:'inherit'});if(result.status!==0)throw new Error('Runtime extraction failed');}
const dest=join(root,'release',`Plka-Windows-${arch}-v${version}`);rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});
for(const file of ['package.json','server.mjs','launcher.mjs','mcp.mjs','lib','public','extension','skills'])cpSync(join(root,file),join(dest,file),{recursive:true});
mkdirSync(join(dest,'tools'),{recursive:true});for(const file of ['install-skill.mjs','stop-service.mjs','runtime-info.mjs','start-background.ps1','start-background.mjs','autostart.ps1','select-library.ps1','install-local.mjs','desktop-entry.mjs','native-host.mjs'])cpSync(join(root,'tools',file),join(dest,'tools',file));
mkdirSync(join(dest,'runtime'));cpSync(join(extracted,'node.exe'),join(dest,'runtime','node.exe'));cpSync(join(extracted,'LICENSE'),join(dest,'runtime','LICENSE-Node.txt'));
const exe=readFileSync(join(dest,'runtime','node.exe'));if(exe.toString('ascii',0,2)!=='MZ')throw new Error('Invalid Windows executable');
const pe=exe.readUInt32LE(0x3c),machine=exe.readUInt16LE(pe+4);if(machine!==(arch==='x64'?0x8664:0xaa64))throw new Error('Runtime architecture mismatch');
const cmd=(name,body)=>writeFileSync(join(dest,name),'@echo off\r\nchcp 65001 >nul\r\nsetlocal\r\ncd /d "%~dp0"\r\n'+body.replace(/\n/g,'\r\n'),'utf8');
cmd('1-Install-Plka.cmd','title Enable Plka\n"%~dp0runtime\\node.exe" "%~dp0tools\\desktop-entry.mjs"\nif errorlevel 1 (echo Plka 安装未完成，请查看上方提示。& pause) else (echo Plka 已启用。以后直接打开 Chrome，无需连接码。& pause)\n');
cmd('1-Start.cmd','title Plka\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\\start-background.ps1"\nif errorlevel 1 (echo Plka 启动失败，请查看日志或使用旧版停止入口后重试。& pause)\n');
cmd('2-Install-Codex-Skill.cmd','title Install Reference Library Skill\n"%~dp0runtime\\node.exe" "%~dp0tools\\install-skill.mjs"\nif errorlevel 1 (echo 安装失败，请查看上方信息。) else (echo Skill 已安装。请在 Codex 输入 $reference-library；未出现时重启 Codex。)\npause\n');
cmd('3-Stop.cmd','title Stop Reference Library\n"%~dp0runtime\\node.exe" "%~dp0tools\\stop-service.mjs"\npause\n');
cmd('4-Open-Extension-Folder.cmd','explorer "%~dp0extension"\n');
cmd('5-Enable-Autostart.cmd','powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\\autostart.ps1"\npause\n');
cmd('6-Disable-Autostart.cmd','powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\\autostart.ps1" -Remove\npause\n');
cmd('7-Connect-Existing-Library.cmd','powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0tools\\select-library.ps1"\npause\n');
cpSync(join(root,'distribution','Windows-使用说明.md'),join(dest,'使用说明.md'));
cpSync(join(root,'distribution','Windows-使用说明.html'),join(dest,'使用说明.html'));
writeFileSync(join(dest,'运行环境校验.json'),JSON.stringify({productVersion:version,architecture:arch,nodeVersion:release.version,source:url,archiveSHA256:hash,verifiedAgainst:'Official nodejs.org SHASUMS256.txt',nodeExecutableSHA256:createHash('sha256').update(exe).digest('hex'),builtAt:new Date().toISOString(),nativeWindowsTested:false},null,2));
function walk(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]);}
const files=walk(dest);if(files.some(f=>/(^|\/)(data|backups)(\/|$)|\.connection-key|library-config\.json|integrity\.json|\.sqlite|\.log$/.test(f)))throw new Error('Private data found in distribution');
const target=dest+'.zip';rmSync(target,{force:true});const result=spawnSync(process.env.PLKA_BUILD_PYTHON||'python3',[join(root,'tools','zip-portable.py'),dest,target],{stdio:'inherit'});if(result.status!==0)throw new Error('Packaging failed');
const packageHash=createHash('sha256').update(readFileSync(target)).digest('hex');writeFileSync(target+'.sha256',packageHash+'  '+target.split('/').at(-1)+'\n');
console.log(JSON.stringify({package:target,architecture:arch,nodeVersion:release.version,nodeChecksumVerified:true,files:files.length,bytes:readFileSync(target).length,SHA256:packageHash},null,2));
