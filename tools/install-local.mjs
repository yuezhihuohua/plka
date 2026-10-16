// One-time per-user installation. No admin rights or copied connection codes.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { APP_ROOT, VERSION, configDir, resolveDataDir, rememberDataDir } from '../lib/config.mjs';
import { HOST_NAME, extensionOrigin, extensionId } from '../lib/native-config.mjs';
const contents=['package.json','server.mjs','launcher.mjs','mcp.mjs','lib','public','extension','skills'];
const toolFiles=['install-local.mjs','desktop-entry.mjs','native-host.mjs','start-background.mjs','runtime-info.mjs','install-skill.mjs','stop-service.mjs'];
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
export function hostManifestPath({platform=process.platform,home=homedir(),env=process.env}={}) {
  if(env.PLKA_NATIVE_HOST_DIR)return join(env.PLKA_NATIVE_HOST_DIR,HOST_NAME+'.json');
  if(platform==='darwin')return join(home,'Library','Application Support','Google','Chrome','NativeMessagingHosts',HOST_NAME+'.json');
  if(platform==='win32')return join(configDir({platform,home,env}),'native',HOST_NAME+'.json');
  return join(env.XDG_CONFIG_HOME||join(home,'.config'),'google-chrome','NativeMessagingHosts',HOST_NAME+'.json');
}
export async function installLocal({appRoot=APP_ROOT,platform=process.platform,home=homedir(),env=process.env,register=true,sourceMode=false}={}) {
  const settings={platform,home,env},folder=configDir(settings);let dataDir=resolveDataDir({appRoot,...settings});
  // Older portable versions may not have a location record. Discover their running
  // library through the local app and verify its on-disk credential before reuse.
  if(!env.REFERENCE_DATA_DIR&&!existsSync(join(dataDir,'library.sqlite'))){
    try{
      const base='http://127.0.0.1:'+(Number(env.REFERENCE_PORT)||47831);
      const health=await(await fetch(base+'/api/health',{signal:AbortSignal.timeout(1200)})).json();
      if(health.ok===true){const boot=await(await fetch(base+'/api/bootstrap',{signal:AbortSignal.timeout(1200)})).json();
        if(typeof boot.root==='string'&&existsSync(join(boot.root,'library.sqlite'))&&readFileSync(join(boot.root,'.connection-key'),'utf8').trim()===boot.token)dataDir=resolve(boot.root);
      }
    }catch{}
  }
  mkdirSync(folder,{recursive:true,mode:0o700});
  if(existsSync(join(dataDir,'library.sqlite')))rememberDataDir(dataDir,settings);
  let installedRoot=appRoot,node=process.execPath,reused=false,sourceDigest,runtimeDigest;
  if(!sourceMode){
    const hash=createHash('sha256');
    function digest(path){const fs=readFileSync(path);hash.update(path.slice(appRoot.length));hash.update(fs);}
    // Runtime version plus source content identifies a repair/update; no redundant
    // 100 MB runtime copy each time the user opens the app.
    const {readdirSync,statSync}=await import('node:fs');
    function visit(path){if(statSync(path).isDirectory())for(const name of readdirSync(path).sort())visit(join(path,name));else digest(path);}
    for(const name of contents)visit(join(appRoot,name));for(const name of toolFiles)digest(join(appRoot,'tools',name));
    runtimeDigest=createHash('sha256').update(readFileSync(process.execPath)).digest('hex');hash.update(runtimeDigest);sourceDigest=hash.digest('hex');
    try{const previous=JSON.parse(readFileSync(join(folder,'desktop-installation.json'),'utf8'));
      if(previous.product==='reference-library'&&previous.sourceDigest===sourceDigest&&existsSync(previous.nodePath)&&existsSync(join(previous.appRoot,'server.mjs'))&&createHash('sha256').update(readFileSync(previous.nodePath)).digest('hex')===runtimeDigest){installedRoot=previous.appRoot;node=previous.nodePath;reused=true;}
    }catch{}
  }
  if(!sourceMode&&!reused){
    installedRoot=join(folder,'app',VERSION+'-'+Date.now());mkdirSync(installedRoot,{recursive:true});
    for(const name of contents)cpSync(join(appRoot,name),join(installedRoot,name),{recursive:true});
    mkdirSync(join(installedRoot,'tools'));for(const name of toolFiles)cpSync(join(appRoot,'tools',name),join(installedRoot,'tools',name));
    const runtime=join(installedRoot,'runtime');mkdirSync(runtime);
    node=join(runtime,platform==='win32'?'node.exe':'node');cpSync(process.execPath,node);chmodSync(node,0o755);
    for(const path of [join(appRoot,'runtime','LICENSE-Node.txt'),join(appRoot,'runtime','LICENSE')])if(existsSync(path)){cpSync(path,join(runtime,'LICENSE-Node.txt'));break;}
    writeFileSync(join(installedRoot,'installation.json'),JSON.stringify({product:'reference-library',version:VERSION,installedAt:new Date().toISOString()},null,2));
  }
  const extensionFolder=join(folder,'ChromeExtension');
  if(existsSync(extensionFolder)){
    const prior=JSON.parse(readFileSync(join(extensionFolder,'manifest.json'),'utf8'));
    if(prior.key!==JSON.parse(readFileSync(join(appRoot,'extension','manifest.json'),'utf8')).key)throw new Error('扩展目录已被其他内容占用，未覆盖。');
  }
  cpSync(join(appRoot,'extension'),extensionFolder,{recursive:true});
  const launcher=join(sourceMode?join(folder,'native'):join(installedRoot,'tools'),platform==='win32'?'native-launcher.cmd':'native-launcher.sh');
  mkdirSync(dirname(launcher),{recursive:true});
  if(platform==='win32')writeFileSync(launcher,'@echo off\r\nsetlocal DisableDelayedExpansion\r\n"'+node.replaceAll('%','%%')+'" "'+join(installedRoot,'tools','native-host.mjs').replaceAll('%','%%')+'" %*\r\n');
  else{writeFileSync(launcher,'#!/bin/sh\nexec '+quote(node)+' '+quote(join(installedRoot,'tools','native-host.mjs'))+' "$@"\n');chmodSync(launcher,0o755);}
  const target=hostManifestPath(settings),manifest={name:HOST_NAME,description:'Plka automatic local library',path:launcher,type:'stdio',allowed_origins:[extensionOrigin(appRoot)]};
  mkdirSync(dirname(target),{recursive:true});
  if(existsSync(target)){
    const prior=JSON.parse(readFileSync(target,'utf8'));
    if(prior.name!==HOST_NAME||prior.description!=='Plka automatic local library')throw new Error('已有其他本机助手配置，未覆盖。');
  }
  writeFileSync(target+'.tmp',JSON.stringify(manifest,null,2),{mode:0o600});renameSync(target+'.tmp',target);
  if(platform==='win32'&&register){
    const result=spawnSync('reg.exe',['ADD','HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\'+HOST_NAME,'/ve','/t','REG_SZ','/d',target,'/f'],{encoding:'utf8',windowsHide:true});
    if(result.error||result.status!==0)throw new Error('未能注册本机助手：'+(result.error?.message||result.stderr));
  }
  const record={product:'reference-library',version:VERSION,appRoot:installedRoot,nodePath:node,extensionFolder,extensionId:extensionId(appRoot),nativeManifest:target,sourceDigest,runtimeDigest};
  writeFileSync(join(folder,'desktop-installation.json'),JSON.stringify(record,null,2),{mode:0o600});
  return {...record,dataDir,reused};
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
  try{
    const info=await installLocal({sourceMode:process.argv.includes('--source')});
    // Run from the installed copy so the detached server and Skill bind stable paths.
    const env={...process.env,REFERENCE_DATA_DIR:info.dataDir};
    const child=spawnSync(info.nodePath,[join(info.appRoot,'tools','desktop-entry.mjs'),'--installed',...(process.argv.includes('--no-open')?['--no-open']:[])],{env,encoding:'utf8',windowsHide:true});
    if(child.error||child.status!==0)throw new Error(child.error?.message||child.stderr||'Plka 未能启动。');
    console.log('Plka 已启用。之后打开 Chrome 即可使用，无需连接码。');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
