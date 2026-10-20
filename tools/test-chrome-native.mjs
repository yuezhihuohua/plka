// Real Chrome-for-Testing integration; no Playwright, mocks or user browser profile.
// PLKA_CHROME_BIN must point to an official, locally verified test browser binary.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {installLocal} from './install-local.mjs';
import {extensionId} from '../lib/native-config.mjs';
import {png} from '../test/fixtures.mjs';
import {VERSION} from '../lib/config.mjs';
const root=process.env.PLKA_APP_ROOT||dirname(dirname(fileURLToPath(import.meta.url)));
const binary=process.env.PLKA_CHROME_BIN;if(!binary)throw new Error('Set PLKA_CHROME_BIN to an official Chrome for Testing binary');
const scratch=mkdtempSync(join(tmpdir(),'plka-real-chrome-')),profile=join(scratch,'browser-profile'),stage=join(scratch,'extension');mkdirSync(profile);
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const base=`http://127.0.0.1:${port}`,data=join(scratch,'library');
const env={...process.env,PIKA_CONFIG_DIR:join(scratch,'config'),REFERENCE_DATA_DIR:data,REFERENCE_PORT:String(port),CODEX_HOME:join(scratch,'codex'),PLKA_NATIVE_HOST_DIR:join(profile,'NativeMessagingHosts')};
let child,cdp,key,chromeLog='',browserVersion;
const checks=[];
async function waitFor(fn,label,timeout=30000){const until=Date.now()+timeout;while(Date.now()<until){const value=await fn();if(value)return value;await delay(100);}throw new Error('Timeout: '+label);}
async function api(path,method='GET',body){key=readFileSync(join(data,'.connection-key'),'utf8').trim();const r=await fetch(base+'/api'+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(3000)});const value=await r.json();assert.ok(r.ok,value.error);return value;}
async function running(){try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)});return r.ok;}catch{return false;}}
async function stopLibrary(){if(!existsSync(join(data,'.connection-key')))return;try{await api('/shutdown','POST',{});await waitFor(async()=>!await running(),'library stopped',10000);}catch{}}
async function startChrome(){
  const debug=join(profile,'DevToolsActivePort');if(existsSync(debug))rmSync(debug);
  child=spawn(binary,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-mode','--remote-debugging-port=0','--user-data-dir='+profile,'--load-extension='+stage,'--disable-extensions-except='+stage,'--enable-logging=stderr','about:blank'],{env,stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',d=>{chromeLog=(chromeLog+d.toString()).slice(-16000);});
  const content=await waitFor(()=>existsSync(debug)&&readFileSync(debug,'utf8').trim(),'Chrome debugging endpoint');
  const [debugPort,path]=content.split('\n');const ws=new WebSocket('ws://127.0.0.1:'+debugPort+path);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let serial=0;const pending=new Map();
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);if(!p)return;pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(new Error(message.error.message)):p.resolve(message.result);}});
  cdp={ws,call:(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));})};
  browserVersion=await cdp.call('Browser.getVersion');
}
async function closeChrome(){if(cdp){try{await cdp.call('Browser.close');}catch{}cdp.ws.close();cdp=undefined;}if(child&&child.exitCode===null){await Promise.race([once(child,'close'),delay(5000)]);if(child.exitCode===null)child.kill('SIGTERM');}}
async function context(url){const target=await cdp.call('Target.createTarget',{url});const attached=await cdp.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});return attached.sessionId;}
async function evaluate(session,expression){const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},session);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value;}
try{
  await installLocal({appRoot:root,env,sourceMode:true});
  cpSync(join(root,'extension'),stage,{recursive:true});
  // Only the isolated copy uses a random port, leaving the real library untouched.
  for(const file of ['connection.js','collector.js','library-link.js'])writeFileSync(join(stage,file),readFileSync(join(stage,file),'utf8').replaceAll('127.0.0.1:47831','127.0.0.1:'+port));
  const manifest=JSON.parse(readFileSync(join(stage,'manifest.json'),'utf8'));manifest.host_permissions.push(base+'/*');writeFileSync(join(stage,'manifest.json'),JSON.stringify(manifest));
  writeFileSync(join(stage,'native-qa.html'),'<!doctype html><meta charset="utf-8"><title>Plka native integration test</title>');
  await startChrome();
  await waitFor(running,'browser startup automatically wakes library');checks.push('real-browser-startup-starts-library');
  const folder=await api('/collections','POST',{name:'浏览器自动连接验收'});
  const id=extensionId(),session=await context(`chrome-extension://${id}/native-qa.html`);
  await waitFor(()=>evaluate(session,'Boolean(globalThis.chrome?.runtime?.id)'),'extension page ready');
  const item={url:'data:image/png;base64,'+png.toString('base64'),name:'自动连接测试图片',page_url:'https://example.test/plka-qa',page_title:'Plka 隔离测试',width:1,height:1};
  await evaluate(session,`chrome.storage.session.set({'native-qa-item':${JSON.stringify(item)}})`);
  await cdp.call('Page.navigate',{url:`chrome-extension://${id}/collector.html?item=native-qa-item`},session);
  await waitFor(()=>evaluate(session,"Boolean(document.querySelector('#collector')&&!document.querySelector('#collector').hidden&&document.querySelector('#images input'))"),'collector automatically ready');
  assert.equal(await evaluate(session,"Boolean(document.querySelector('#token'))"),false);checks.push('real-collector-ready-without-connection-code');
  await evaluate(session,`document.querySelector('#folder').value=${JSON.stringify(folder.id)};document.querySelector('#note').value='真实 Chrome 自动连接测试';document.querySelector('#save').click();`);
  await waitFor(async()=>{const stats=await api('/stats');return stats.active===1;},'real collector saved image');checks.push('real-collector-imports-image-through-native-credential');
  await stopLibrary();
  const reopen=await context(`chrome-extension://${id}/native-qa.html`);
  await waitFor(()=>evaluate(reopen,'Boolean(globalThis.chrome?.runtime?.id)'),'reopen context');
  const opened=await evaluate(reopen,"chrome.runtime.sendMessage({type:'open-library'})");assert.equal(opened.online,true);assert.equal((await api('/stats')).active,1);checks.push('floating-open-message-recovers-stopped-library');
  await closeChrome();await stopLibrary();await startChrome();
  await waitFor(running,'reopened browser automatically wakes existing library');assert.equal((await api('/stats')).active,1);checks.push('browser-restart-preserves-images-with-no-manual-start');
  const result={passed:true,productVersion:VERSION,platform:process.platform,architecture:process.arch,browser:browserVersion.product,realChromeTested:true,checks};
  if(process.env.PLKA_TEST_REPORT){mkdirSync(dirname(process.env.PLKA_TEST_REPORT),{recursive:true});writeFileSync(process.env.PLKA_TEST_REPORT,JSON.stringify(result,null,2));}
  console.log(JSON.stringify(result));
}catch(error){
  // Runtime diagnostics never print connection credentials, even from Chrome logs.
  const secret=existsSync(join(data,'.connection-key'))?readFileSync(join(data,'.connection-key'),'utf8').trim():'';
  console.error(error.stack);console.error(secret?chromeLog.replaceAll(secret,'[redacted]'):chromeLog);process.exitCode=1;
}finally{await closeChrome();await stopLibrary();rmSync(scratch,{recursive:true,force:true});}
