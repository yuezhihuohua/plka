import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { resolveDataDir, rememberDataDir, VERSION } from './lib/config.mjs';
const dataDir=resolveDataDir(),port=Number(process.env.REFERENCE_PORT)||47831;
const noOpen=process.argv.includes('--no-open');
let existing;
try{existing=await(await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1500)})).json();}catch{}
if(existing){
  const token=existsSync(join(dataDir,'.connection-key'))?readFileSync(join(dataDir,'.connection-key'),'utf8').trim():'';
  const match=await fetch(`http://127.0.0.1:${port}/api/stats`,{headers:{Authorization:'Bearer '+token}});
  if(!match.ok||existing.version!==VERSION)throw new Error('请先用旧版的停止入口关闭已有服务，再启动新版 Plka。原图库不会删除。');
  rememberDataDir(dataDir);if(!noOpen)open(`http://127.0.0.1:${port}`);process.exit(0);
}
const {server,store}=startServer({dataDir,port});
function open(url){
  let command,args;
  if(process.platform==='darwin'){command='open';args=[url];}
  else if(process.platform==='win32'){
    const candidates=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(root=>join(root,'Google','Chrome','Application','chrome.exe'));
    const chrome=candidates.find(path=>existsSync(path));command=chrome||'rundll32.exe';args=chrome?[url]:['url.dll,FileProtocolHandler',url];
  }else return;
  const child=spawn(command,args,{stdio:'ignore',detached:true,windowsHide:true});child.on('error',()=>{});child.unref();
}
server.on('listening',()=>{rememberDataDir(store.root);const address=`http://127.0.0.1:${server.address().port}`;console.log(`Plka 已启动：${address}\n数据目录：${store.root}`);if(!noOpen)open(address);});
server.on('error',e=>{if(e.code==='EADDRINUSE'){console.error('图库可能已经启动，请检查已打开的图库窗口。');open(`http://127.0.0.1:${Number(process.env.REFERENCE_PORT)||47831}`);process.exitCode=0;}else{console.error(e.message);process.exitCode=1;}store.close();});
for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>server.close(()=>process.exit()));
