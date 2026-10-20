// Real AppKit + WKWebView smoke test, entirely in an isolated library/profile.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,existsSync,cpSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {png} from '../test/fixtures.mjs';
const run=promisify(execFile),dest=resolve(process.argv[2]),scratch=mkdtempSync(join(tmpdir(),'plka-window-qa-'));
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const app=join(scratch,'Applications','Plka.app');mkdirSync(join(scratch,'Applications'));cpSync(join(dest,'Plka.app'),app,{recursive:true});
const binary=join(app,'Contents','MacOS','Plka'),report=join(scratch,'webview.json'),base=`http://127.0.0.1:${port}`;
const env={...process.env,PIKA_CONFIG_DIR:join(scratch,'config'),REFERENCE_DATA_DIR:join(scratch,'library'),REFERENCE_PORT:String(port),PLKA_NATIVE_HOST_DIR:join(scratch,'native'),CODEX_HOME:join(scratch,'codex'),PLKA_DESKTOP_QA:'1',PLKA_QA_RESULT:report};
let child,key;
async function api(path,method='GET',body){const r=await fetch(base+'/api'+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,value.error);return value;}
try{
  await run(binary,['--no-open'],{env,timeout:90000});key=readFileSync(join(env.REFERENCE_DATA_DIR,'.connection-key'),'utf8').trim();
  const collection=await api('/collections','POST',{name:'独立窗口验收'});
  await api('/import','POST',{data:png.toString('base64'),meta:{name:'窗口测试图',collections:[collection.id]}});
  child=spawn(binary,['-ApplePersistenceIgnoreState','YES'],{env,stdio:['ignore','ignore','pipe']});let errors='';child.stderr.on('data',bytes=>{errors=(errors+bytes).slice(-6000);});
  for(let n=0;n<400&&!existsSync(report)&&child.exitCode===null&&child.signalCode===null;n++)await delay(100);
  assert.ok(existsSync(report),'Real WKWebView did not report ready: '+errors);
  const result=JSON.parse(readFileSync(report,'utf8'));assert.equal(result.visible,env.PLKA_QA_HIDDEN!=='1');assert.equal(result.independentWindow,true);assert.equal(result.menuBar,true);assert.equal(result.menuBarIcon,true);assert.equal(result.web.desktop,true);assert.equal(result.web.count,'1 张图片');assert.equal(result.web.collections,1);assert.equal(result.web.windowOrigin,base);
  await delay(5000);assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);
  await api('/shutdown','POST',{});await delay(500);
  let recovered=false;
  for(let n=0;n<180;n++){await delay(100);try{if((await api('/stats')).active===1){recovered=true;break;}}catch{}}
  assert.ok(recovered,'The menu-bar app should recover its stopped local service');
  child.kill('SIGTERM');await once(child,'close');child=undefined;
  assert.equal((await api('/stats')).active,1);
  rmSync(report,{force:true});
  child=spawn(binary,['--background'],{env:{...env,PLKA_QA_HIDDEN:'0'},stdio:'ignore'});
  for(let n=0;n<300&&!existsSync(report)&&child.exitCode===null;n++)await delay(100);
  assert.ok(existsSync(report),'Login background launch did not render');
  const background=JSON.parse(readFileSync(report,'utf8'));assert.equal(background.visible,false);assert.equal(background.backgroundLaunch,true);assert.equal(background.menuBarIcon,true);
  child.kill('SIGTERM');await once(child,'close');child=undefined;
  const record=JSON.parse(readFileSync(join(env.PIKA_CONFIG_DIR,'desktop-installation.json'),'utf8'));assert.equal(realpathSync(record.desktopApp),realpathSync(app));
  const checks=['actual-app-in-applications-folder',env.PLKA_QA_HIDDEN==='1'?'real-appkit-window-rendered-offscreen':'real-visible-appkit-window','real-webkit-gallery-renders-persistent-image','desktop-clipboard-bridge-loaded','menu-bar-status-item-created','sustained-window-does-not-crash','menu-bar-app-recovers-stopped-service','app-exit-keeps-chrome-library-service','desktop-app-binding-retained','login-background-launch-keeps-window-hidden'];
  console.log(JSON.stringify({passed:true,platform:process.platform,architecture:process.arch,independentWindowTested:true,checks}));
}finally{
  if(child&&child.exitCode===null&&child.signalCode===null){const closed=once(child,'close');child.kill('SIGTERM');await closed;}
  if(key)try{await api('/shutdown','POST',{});await delay(300);}catch{}
  if(process.env.PLKA_KEEP_QA==='1')console.error('Retained QA directory: '+scratch);else rmSync(scratch,{recursive:true,force:true});
}
