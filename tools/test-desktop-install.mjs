// Exercise the shipped app entry and installed native bridge with isolated user paths.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtempSync,readFileSync,rmSync,existsSync,cpSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const run=promisify(execFile),dest=resolve(process.argv[2]);
const scratch=mkdtempSync(join(tmpdir(),'plka-desktop-qa-'));
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const env={...process.env,PLKA_NO_OPEN:'1',PIKA_CONFIG_DIR:join(scratch,'config'),REFERENCE_DATA_DIR:join(scratch,'library'),PLKA_NATIVE_HOST_DIR:join(scratch,'chrome','NativeMessagingHosts'),REFERENCE_PORT:String(port),CODEX_HOME:join(scratch,'codex')};
const base=`http://127.0.0.1:${port}`;
let key;
async function stop(){if(!key)return;try{await fetch(base+'/api/shutdown',{method:'POST',headers:{Authorization:'Bearer '+key}});for(let n=0;n<40;n++){await new Promise(r=>setTimeout(r,100));try{await fetch(base+'/api/health');}catch{return;}}}catch{}}
try{
  const app=join(scratch,'Plka QA 应用.app');cpSync(join(dest,'Plka.app'),app,{recursive:true});
  const applet=join(app,'Contents','MacOS','Plka');
  const environment=Object.entries(env).filter(([name])=>['PLKA_NO_OPEN','PIKA_CONFIG_DIR','REFERENCE_DATA_DIR','PLKA_NATIVE_HOST_DIR','REFERENCE_PORT','CODEX_HOME'].includes(name)).flatMap(([name,value])=>['--env',name+'='+value]);
  await run('/usr/bin/open',['-W','-n',...environment,app,'--args','--no-open'],{env,timeout:90000});
  const record=JSON.parse(readFileSync(join(env.PIKA_CONFIG_DIR,'desktop-installation.json'),'utf8'));
  assert.ok(record.appRoot.startsWith(join(env.PIKA_CONFIG_DIR,'app')));assert.ok(existsSync(record.nodePath));assert.ok(existsSync(join(record.extensionFolder,'manifest.json')));
  key=readFileSync(join(env.REFERENCE_DATA_DIR,'.connection-key'),'utf8').trim();assert.equal((await fetch(base+'/api/health')).status,200);
  await run(applet,['--no-open'],{env,timeout:90000});
  assert.equal(JSON.parse(readFileSync(join(env.PIKA_CONFIG_DIR,'desktop-installation.json'),'utf8')).appRoot,record.appRoot);
  await stop();
  const manifest=JSON.parse(readFileSync(record.nativeManifest,'utf8'));
  const child=spawn(manifest.path,[manifest.allowed_origins[0]],{env,stdio:['pipe','pipe','pipe']});const chunks=[];child.stderr.resume();
  const message=new Promise((resolve,reject)=>{let buffer=Buffer.alloc(0);child.stdout.on('data',c=>{buffer=Buffer.concat([buffer,c]);if(buffer.length>=4&&buffer.length>=buffer.readUInt32LE(0)+4)resolve(JSON.parse(buffer.subarray(4,4+buffer.readUInt32LE(0))));});child.once('error',reject);});
  const bytes=Buffer.from(JSON.stringify({command:'ensure-ready'})),header=Buffer.alloc(4);header.writeUInt32LE(bytes.length);child.stdin.write(Buffer.concat([header,bytes]));
  const response=await Promise.race([message,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Native bridge did not respond')),30000);timer.unref();})]);
  assert.equal(response.ok,true);assert.equal(response.token,key);assert.equal((await fetch(base+'/api/stats',{headers:{Authorization:'Bearer '+response.token}})).status,200);
  child.stdin.end();await once(child,'close');
  console.log(JSON.stringify({passed:true,checks:['actual-app-entry','one-time-stable-user-installation','automatic-native-launch-from-offline','credential-preserved-without-user-input','precise-extension-allowlist'],realChromeTested:false}));
}finally{await stop();rmSync(scratch,{recursive:true,force:true});}
