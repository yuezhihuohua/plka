import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startServer} from '../server.mjs';
import {CaptureBridge} from '../lib/capture-bridge.mjs';
import {Store} from '../lib/store.mjs';
import {loginStart} from '../lib/login-start.mjs';
import {png} from './fixtures.mjs';
const item={url:'https://images.example.test/image.png',page_url:'https://www.pinterest.com/pin/test',page_title:'测试页面',name:'测试图片',width:400,height:600};

test('userscript capability cannot read a library or save without local user approval; retries retain successful images',async t=>{
 const root=mkdtempSync(join(tmpdir(),'plka-capture-'));const {server,token}=startServer({port:0,dataDir:root});await once(server,'listening');t.after(async()=>{await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`,extension='chrome-extension://'+'b'.repeat(32);
 const call=async(path,body,headers={})=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,ok:r.ok,value:await r.json()};};
 const local={Authorization:'Bearer '+token};
 assert.equal((await call('/capture-bridge',{items:[item]},{Origin:'https://untrusted.example'})).status,403);
 const made=await call('/capture-bridge',{items:[item,item]},{Origin:extension});assert.equal(made.status,201);const {id,capability}=made.value,bridge={'X-Plka-Capture':capability,Origin:extension};
 assert.equal(made.value.token,undefined);
 assert.equal((await call('/items',undefined,bridge)).status,401);
 assert.equal((await call('/captures/'+id,undefined,bridge)).status,401);
 assert.equal((await call('/bootstrap',undefined,{Origin:extension})).status,403);
 assert.equal((await call('/capture-bridge/'+id,undefined,{'X-Plka-Capture':'wrong'})).ok,false);
 assert.equal((await call('/capture-bridge/'+id+'/data',{index:0,data:png.toString('base64')},bridge)).ok,false);
 const folder=(await call('/collections',{name:'设计参考'},local)).value;
 assert.equal((await call('/captures/'+id+'/approve',{indexes:[0],collection_id:folder.id},{...local,Origin:extension})).status,403);
 assert.equal((await call('/captures/'+id+'/approve',{indexes:[0,1],collection_id:folder.id,note:'选图理由',tags:['排版']},local)).ok,true);
 const first=await call('/capture-bridge/'+id+'/data',{index:0,data:png.toString('base64')},bridge);assert.equal(first.ok,true);assert.equal(first.value.results[0].ok,true);
 assert.equal(JSON.stringify(first.value).includes(folder.id),false);assert.equal(JSON.stringify(first.value).includes('选图理由'),false);
 await call('/capture-bridge/'+id+'/data',{index:1,error:'下载失败'},bridge);
 assert.equal((await call('/stats',undefined,local)).value.active,1);
 assert.equal((await call('/captures/'+id+'/approve',{indexes:[0],collection_id:folder.id},local)).ok,false);
 await call('/captures/'+id+'/approve',{indexes:[1],collection_id:folder.id},local);
 const retry=await call('/capture-bridge/'+id+'/data',{index:1,data:png.toString('base64')},bridge);assert.equal(retry.value.results[1].duplicate,true);
 const saved=(await call('/items',undefined,local)).value.items[0];assert.equal(saved.note,'选图理由');assert.equal(saved.sources[0].image_url,item.url);
 await call('/captures/'+id+'/cancel',{},local);assert.equal((await call('/capture-bridge/'+id+'/data',{index:0,data:png.toString('base64')},bridge)).ok,false);
 assert.equal((await call('/integrations/startup',{enabled:true},{...local,Origin:extension})).status,403);
 const onboarding=await call('/onboarding',undefined,local);assert.equal(onboarding.value.hasImages,true);assert.equal(onboarding.value.dismissed,false);
 await call('/onboarding',{dismissed:true},local);assert.equal((await call('/onboarding',undefined,local)).value.dismissed,true);
 const script=await fetch(base+'/userscript/plka.user.js');assert.match(script.headers.get('content-type'),/userscript/);assert.ok((await script.text()).includes(base));
 assert.equal((await fetch(base+'/collect',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,200);
 assert.equal((await fetch(base+'/collect.js')).status,200);
});

test('capture requests expire, reject unexpected formats, limit pending sessions, and free completed sessions',()=>{
 const root=mkdtempSync(join(tmpdir(),'plka-cap-expiry-'));const store=new Store(root);try{
 let clock=0;const bridge=new CaptureBridge(store,{now:()=>clock,ttl:100,limit:1});
 assert.throws(()=>bridge.create({items:[{...item,url:'javascript:alert(1)'}]}));
 const one=bridge.create({items:[item]});assert.throws(()=>bridge.create({items:[item]}));
 const folder=store.createCollection('试收');bridge.approve(one.id,{indexes:[0],collection_id:folder.id});
 bridge.upload(one.id,one.capability,{index:0,data:png.toString('base64')});assert.doesNotThrow(()=>bridge.create({items:[item]}));
 clock=101;assert.throws(()=>bridge.get(one.id));
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});

test('login startup writes only owned opt-in entries, escapes paths, supports removal, and preserves unrelated files',()=>{
 const root=mkdtempSync(join(tmpdir(),'plka-login-'));try{
 const config=join(root,'config'),app=join(root,'A & B','Plka.app');mkdirSync(join(app,'Contents/MacOS'),{recursive:true});writeFileSync(join(app,'Contents/MacOS/Plka'),'test');mkdirSync(config);writeFileSync(join(config,'desktop-installation.json'),JSON.stringify({desktopApp:app}));
 const settings={platform:'darwin',home:root,env:{PIKA_CONFIG_DIR:config}};assert.equal(loginStart(settings).enabled,false);
 assert.equal(loginStart(settings,true).enabled,true);const path=join(root,'Library/LaunchAgents/com.plka.login.plist'),content=readFileSync(path,'utf8');assert.ok(content.includes('A &amp; B'));assert.ok(content.includes('--background'));assert.equal(loginStart(settings).enabled,true);
 loginStart(settings,false);assert.equal(existsSync(path),false);writeFileSync(path,'unrelated');assert.throws(()=>loginStart(settings,true));assert.throws(()=>loginStart(settings,false));
 const node=join(root,'node.exe'),appRoot=join(root,'Program "quoted"');writeFileSync(node,'test');writeFileSync(join(config,'desktop-installation.json'),JSON.stringify({nodePath:node,appRoot}));
 const windows={platform:'win32',home:root,env:{PIKA_CONFIG_DIR:config,APPDATA:join(root,'Roaming')}};assert.equal(loginStart(windows,true).enabled,true);const vbs=readFileSync(join(root,'Roaming/Microsoft/Windows/Start Menu/Programs/Startup/Plka-background.vbs'),'utf8');assert.ok(vbs.includes('""quoted""'));assert.equal(loginStart(windows,false).enabled,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
