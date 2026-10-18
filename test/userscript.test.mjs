import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/plka.user.js',import.meta.url),'utf8');
// Real shipped code, with controllable script-manager I/O and user input.
function harness(respond,{imageCount=1}={}){
 const eventBrand=new WeakSet();class UserEvent{composedPath(){if(!eventBrand.has(this))throw new Error('Not an event');return [];}constructor(trusted=true){eventBrand.add(this);this.isTrusted=trusted;}preventDefault(){}stopPropagation(){}}
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.style={};this.dataset={};this.hidden=false;this.disabled=false;this.text='';this.value='';this.className='';this.classList={toggle:(c,value)=>{const all=new Set(this.className.split(' ').filter(Boolean));if(value===undefined)value=!all.has(c);value?all.add(c):all.delete(c);this.className=[...all].join(' ');}};}
  append(...n){this.children.push(...n);}
  replaceChildren(...n){this.text='';this.children=[...n];}
  set textContent(s){this.text=String(s);this.children=[];}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ');}
  setAttribute(k,v){this.attrs[k]=v;}
  attachShadow(){return this.shadowRoot=new Element('shadow');}
  focus(){}
  click(trusted=true){if(!this.disabled)return this.onclick?.(new UserEvent(trusted));}
  querySelectorAll(selector){const all=this.children.flatMap(c=>[c,...c.querySelectorAll('*')]);return all.filter(n=>selector==='*'||selector.split(',').some(s=>{const leaf=s.trim().split(' ').at(-1);return leaf.startsWith('.')?n.className.split(' ').includes(leaf.slice(1)):n.tagName===leaf;}));}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
 }
 let now=0,next=1;const timers=new Map(),calls=[],tabs=[];const root=new Element('html');
 const images=Array.from({length:imageCount},(_,i)=>Object.assign(new Element('img'),{src:'https://i.pinimg.com/test'+i+'.png',naturalWidth:400,naturalHeight:600,alt:'测试图片',getBoundingClientRect:()=>({width:200,height:300})}));
 runInNewContext(source,{Event:UserEvent,document:{documentElement:root,images,title:'测试网页',getElementById:()=>null,createElement:t=>new Element(t),addEventListener(){}},location:{origin:'https://www.xiaohongshu.com',href:'https://www.xiaohongshu.com/explore/test'},Date:{now:()=>now},Uint8Array,URL,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout:(f,ms)=>{const id=next++;timers.set(id,{f,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),GM_registerMenuCommand(){},GM_openInTab:url=>{tabs.push(url);return {};},GM_xmlhttpRequest:o=>{calls.push(o);respond(o);return {abort(){}};}});
 const shadow=root.children[0].shadowRoot,scan=shadow.querySelector('.scan'),panel=shadow.querySelector('.panel');
 const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
 const tick=async ms=>{await flush();const end=now+ms;for(;;){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].f();await flush();}now=end;await flush();};
 return {scan,panel,calls,tabs,flush,tick,shadow,spoof:n=>n.onclick(Object.assign(Object.create(UserEvent.prototype),{isTrusted:true}))};
}
const json=(o,value)=>o.onload({status:200,response:value});
const idle={active:false,cancelled:false,requested:[],results:[]};
const context={collections:[{id:'folder',name:'设计参考'}],tags:['配色'],preferred_collection_id:'folder'};
function respond(o){if(o.url.endsWith('/context'))json(o,context);else if(o.url.endsWith('/api/capture-bridge'))json(o,{id:'job',capability:'upload',chooser_capability:'chooser'});else json(o,idle);}

test('click immediately shows progress; absent manager callbacks time out and allow retry',async()=>{
 const h=harness(()=>{});h.scan.click();assert.match(h.panel.textContent,/正在准备收藏夹/);assert.equal(h.panel.hidden,false);await h.tick(8001);assert.equal(h.scan.disabled,false);assert.match(h.panel.textContent,/8 秒/);h.panel.querySelector('.confirm').click();assert.equal(h.calls.length,2);
});
test('single image opens an inline folder chooser with no selection checkbox or new browser tab',async()=>{
 const h=harness(respond);h.scan.click();await h.flush();assert.equal(h.scan.disabled,false);assert.equal(h.panel.querySelectorAll('img').length,1);assert.equal(h.panel.querySelectorAll('input').filter(n=>n.type==='checkbox').length,0);assert.equal(h.panel.querySelector('select').value,'folder');assert.equal(h.panel.querySelector('.confirm').textContent,'收藏');assert.equal(h.panel.querySelector('.confirm').disabled,false);assert.equal(h.tabs.length,0);assert.equal(h.calls.some(o=>o.url.endsWith('/approve')||o.url.endsWith('/data')),false);
});
test('untrusted synthetic clicks cannot start collection or confirm a save',async()=>{
 const h=harness(respond);h.scan.click(false);h.spoof(h.scan);await h.flush();assert.equal(h.calls.length,0);h.scan.click();await h.flush();h.panel.querySelector('.confirm').click(false);h.spoof(h.panel.querySelector('.confirm'));await h.flush();assert.equal(h.calls.some(o=>o.url.endsWith('/approve')),false);
});
test('confirm saves directly, emits success, and automatically dismisses without opening a tab',async()=>{
 const h=harness(o=>{if(o.url.includes('i.pinimg.com'))o.onload({status:200,response:Uint8Array.from([1,2,3]).buffer});else if(o.url.endsWith('/approve'))json(o,{...idle,active:true,requested:[0]});else if(o.url.endsWith('/data'))json(o,{...idle,results:[{index:0,ok:true}]});else respond(o);});h.scan.click();await h.flush();h.panel.querySelector('.confirm').click();await h.flush();assert.match(h.panel.textContent,/已收藏/);assert.match(h.panel.textContent,/设计参考/);assert.equal(h.tabs.length,0);const approve=h.calls.find(o=>o.url.endsWith('/approve'));assert.equal(approve.headers['X-Plka-Chooser'],'chooser');assert.equal(approve.headers.Authorization,undefined);await h.tick(1401);assert.equal(h.panel.hidden,true);
});
test('cancel while context is loading never resurrects the chooser',async()=>{
 let pending;const h=harness(o=>{if(o.url.endsWith('/context'))pending=o;else respond(o);});h.scan.click();await h.flush();h.panel.querySelector('.close').click();await h.flush();assert.equal(h.panel.hidden,true);json(pending,context);await h.flush();assert.equal(h.panel.hidden,true);assert.equal(h.scan.disabled,false);assert.ok(h.calls.some(o=>o.url.endsWith('/cancel')));
});
test('repeated clicks reuse the current chooser; batch collection stays on the page',async()=>{
 const h=harness(respond,{imageCount:2});h.scan.click();await h.flush();h.scan.click();await h.flush();assert.equal(h.calls.filter(o=>o.url.endsWith('/api/capture-bridge')).length,1);assert.equal(h.panel.querySelectorAll('input').filter(n=>n.type==='checkbox').length,2);assert.equal(h.panel.querySelector('.confirm').disabled,true);h.panel.querySelector('.batchbar').querySelector('button').click();assert.equal(h.panel.querySelector('.confirm').disabled,false);assert.match(h.panel.querySelector('.confirm').textContent,/2 张/);assert.equal(h.tabs.length,0);
});
test('retry after a lost upload reply reconciles saved results rather than downloading again',async()=>{
 let uploaded=0;const h=harness(o=>{if(o.url.includes('i.pinimg.com'))o.onload({status:200,response:Uint8Array.from([1,2,3]).buffer});else if(o.url.endsWith('/approve'))json(o,{...idle,active:true,requested:[0]});else if(o.url.endsWith('/data')){uploaded++;o.onerror();}else if(o.url.endsWith('/job')&&uploaded)json(o,{...idle,results:[{index:0,ok:true}]});else respond(o);});h.scan.click();await h.flush();h.panel.querySelector('.confirm').click();await h.flush();assert.match(h.panel.textContent,/重试保存/);h.panel.querySelector('.confirm').click();await h.flush();assert.match(h.panel.textContent,/已收藏/);assert.equal(uploaded,1);
});
