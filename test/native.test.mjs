import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,existsSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {createConnection} from '../extension/connection.js';
import {extensionId,extensionOrigin} from '../lib/native-config.mjs';
import {installLocal,hostManifestPath} from '../tools/install-local.mjs';
import {startServer} from '../server.mjs';
import {backupBeforeUpgrade} from '../lib/upgrade.mjs';
const event=()=>{const listeners=new Set();return {addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:(...v)=>{for(const f of [...listeners])f(...v);}};};
function browser({stored='',reply={ok:true,token:'a'.repeat(64)},error}={}){
  const storage={connectionToken:stored},calls=[];const port={onMessage:event(),onDisconnect:event(),postMessage:value=>{calls.push(value);queueMicrotask(()=>{if(error){api.runtime.lastError={message:error};port.onDisconnect.emit();delete api.runtime.lastError;}else port.onMessage.emit(reply);});}};
  const api={runtime:{connectNative:name=>{calls.push(name);return port;}},storage:{local:{get:async()=>storage,set:async value=>Object.assign(storage,value)}}};return {api,storage,calls,port};
}
test('auto connection reuses a valid private credential without exposing an input field',async()=>{
  const b=browser({stored:'old'}),c=createConnection(b.api,async()=>({ok:true}));assert.equal((await c.ensure()).token,'old');assert.equal(b.calls.length,0);
});
test('automatic startup refuses a newer library without modifying its database',t=>{
  const folder=mkdtempSync(join(tmpdir(),'plka-no-downgrade-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
  writeFileSync(join(folder,'library.sqlite'),'do-not-open-or-modify');writeFileSync(join(folder,'.plka-version'),'99.0.0');
  assert.throws(()=>backupBeforeUpgrade(folder),/不会自动降级/);assert.equal(readFileSync(join(folder,'library.sqlite'),'utf8'),'do-not-open-or-modify');assert.equal(existsSync(join(folder,'backups')),false);
});
test('cold browser automatically starts native helper once and stores its credential',async()=>{
  const b=browser(),c=createConnection(b.api,async()=>{throw new Error('offline');});
  const results=await Promise.all([c.ensure(),c.ensure(),c.ensure()]);assert.ok(results.every(r=>r.ok));assert.equal(b.calls.filter(x=>typeof x==='string').length,1);assert.equal(b.storage.connectionToken,'a'.repeat(64));
});
test('missing helper is a one-time install state, and a later attempt reconnects',async()=>{
  const b=browser({error:'Specified native messaging host not found.'}),c=createConnection(b.api,async()=>({ok:false}));assert.equal((await c.ensure()).code,'HELPER_MISSING');assert.equal((await c.ensure()).code,'HELPER_MISSING');assert.equal(b.calls.filter(x=>typeof x==='string').length,2);
});
test('background never returns native credentials to a website content script',async()=>{
  const b=browser(),oldChrome=globalThis.chrome,oldFetch=globalThis.fetch;let handler;
  Object.assign(b.api.runtime,{id:extensionId(),getURL:file=>extensionOrigin()+file,onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener:f=>{handler=f;}}});
  b.api.permissions={onRemoved:{addListener(){}}};b.api.contextMenus={onClicked:{addListener(){}}};
  b.api.tabs={query:async()=>[],create:async options=>({id:7,windowId:2,...options})};b.api.windows={update:async()=>{}};
  globalThis.chrome=b.api;globalThis.fetch=async()=>{throw new Error('offline test');};
  try{
    await import('../extension/background.js?native-security-test');
    const send=(message,sender)=>new Promise(resolve=>handler(message,sender,resolve));
    const denied=await send({type:'ensure-library'},{id:extensionId(),url:'https://ph.pinterest.com/pin/1'});assert.equal(denied.ok,false);assert.equal(denied.token,undefined);assert.equal(b.calls.length,0);
    const opened=await send({type:'open-library'},{id:extensionId(),url:'https://ph.pinterest.com/pin/1'});assert.equal(opened.online,true);assert.equal(opened.token,undefined);
    const allowed=await send({type:'ensure-library'},{id:extensionId(),url:extensionOrigin()+'collector.html'});assert.equal(allowed.token,'a'.repeat(64));
  }finally{globalThis.chrome=oldChrome;globalThis.fetch=oldFetch;}
});
test('first upgrade discovers a running legacy library without a saved path or copied code',async t=>{
  const folder=mkdtempSync(join(tmpdir(),'plka-discovery-')),data=join(folder,'legacy-data');
  const {server,store}=startServer({port:0,dataDir:data});await once(server,'listening');
  t.after(async()=>{await new Promise(r=>server.close(r));rmSync(folder,{recursive:true,force:true});});
  store.createCollection('原有收藏夹');const token=readFileSync(join(data,'.connection-key'),'utf8');
  const appRoot=join(folder,'new-app');mkdirSync(appRoot);cpSync(new URL('../extension',import.meta.url),join(appRoot,'extension'),{recursive:true});
  const env={...process.env,REFERENCE_DATA_DIR:undefined,CODEX_HOME:join(folder,'clean-codex'),PIKA_CONFIG_DIR:join(folder,'new-config'),REFERENCE_PORT:String(server.address().port),PLKA_NATIVE_HOST_DIR:join(folder,'native')};
  const result=await installLocal({appRoot,env,register:false,sourceMode:true});assert.equal(result.dataDir,data);assert.equal(store.collections()[0].name,'原有收藏夹');assert.equal(readFileSync(join(data,'.connection-key'),'utf8'),token);
});
test('installer allowlists exactly the stable extension and preserves existing library',async t=>{
  const folder=mkdtempSync(join(tmpdir(),'plka-install-test-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const data=join(folder,'existing data'),config=join(folder,'config');mkdirSync(data);writeFileSync(join(data,'library.sqlite'),'unchanged-database');writeFileSync(join(data,'.connection-key'),'never-ship');
  const env={...process.env,PIKA_CONFIG_DIR:config,REFERENCE_DATA_DIR:data,PLKA_NATIVE_HOST_DIR:join(folder,'native')};
  const result=await installLocal({env,register:false,sourceMode:true});const manifest=JSON.parse(readFileSync(result.nativeManifest,'utf8'));
  assert.deepEqual(manifest.allowed_origins,[extensionOrigin()]);assert.match(extensionId(),/^[a-p]{32}$/);assert.equal(readFileSync(join(data,'library.sqlite'),'utf8'),'unchanged-database');assert.equal(readFileSync(join(data,'.connection-key'),'utf8'),'never-ship');assert.ok(existsSync(join(result.extensionFolder,'manifest.json')));
  assert.equal(JSON.parse(readFileSync(join(config,'library-location.json'),'utf8')).dataDir,data);
  const win=await installLocal({env:{...env,PLKA_NATIVE_HOST_DIR:join(folder,'win-native')},platform:'win32',register:false,sourceMode:true});assert.ok(readFileSync(JSON.parse(readFileSync(win.nativeManifest,'utf8')).path,'utf8').startsWith('@echo off'));
  assert.match(hostManifestPath({platform:'win32',env:{LOCALAPPDATA:folder},home:folder}),/Plka/);
});
test('native framing boots offline library, returns credential only to allowed origin, survives host exit',async t=>{
  const scratch=mkdtempSync(join(tmpdir(),'plka-native-http-')),data=join(scratch,'data with 中文');
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const env={...process.env,PIKA_CONFIG_DIR:join(scratch,'config'),REFERENCE_DATA_DIR:data,REFERENCE_PORT:String(port),CODEX_HOME:join(scratch,'codex')};
  t.after(async()=>{try{await fetch(`http://127.0.0.1:${port}/api/shutdown`,{method:'POST',headers:{Authorization:'Bearer '+readFileSync(join(data,'.connection-key'),'utf8').trim()}});await new Promise(r=>setTimeout(r,200));}catch{}rmSync(scratch,{recursive:true,force:true});});
  async function call(origin,body){const child=spawn(process.execPath,['tools/native-host.mjs',origin],{cwd:process.cwd(),env,stdio:['pipe','pipe','pipe']});const output=[];child.stdout.on('data',c=>output.push(c));child.stderr.resume();const closed=once(child,'close');const bytes=Buffer.from(JSON.stringify(body)),header=Buffer.alloc(4);header.writeUInt32LE(bytes.length);child.stdin.write(header.subarray(0,2));child.stdin.write(Buffer.concat([header.subarray(2),bytes]));child.stdin.end();const [code]=await closed;return {code,bytes:Buffer.concat(output)};}
  const denied=await call('chrome-extension://'+'a'.repeat(32)+'/',{command:'ensure-ready'});assert.equal(denied.code,1);assert.equal(denied.bytes.length,0);assert.equal(existsSync(join(data,'library.sqlite')),false);
  const invalid=await call(extensionOrigin(),{command:'execute',path:'/anything'});assert.equal(JSON.parse(invalid.bytes.subarray(4)).code,'INVALID_COMMAND');assert.equal(existsSync(join(data,'library.sqlite')),false);
  const results=await Promise.all([call(extensionOrigin(),{command:'ensure-ready'}),call(extensionOrigin(),{command:'ensure-ready'}),call(extensionOrigin(),{command:'ensure-ready'})]);
  const result=results[0];assert.ok(results.every(r=>r.code===0));assert.equal(result.bytes.readUInt32LE(0),result.bytes.length-4);
  const message=JSON.parse(result.bytes.subarray(4));assert.equal(message.ok,true);assert.equal(message.token,readFileSync(join(data,'.connection-key'),'utf8').trim());
  assert.ok(results.every(r=>JSON.parse(r.bytes.subarray(4)).token===message.token));
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/stats`,{headers:{Authorization:'Bearer '+message.token}})).status,200);
});
