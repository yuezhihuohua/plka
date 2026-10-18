import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Run the shipped script with a small DOM and a controllable GM boundary.
// These checks exercise what the user sees when the script manager stalls.
const source=readFileSync(new URL('../public/plka.user.js',import.meta.url),'utf8');
function harness(respond,{openThrows=false}={}){
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.style={};this.dataset={};this.hidden=false;this.disabled=false;this.text='';}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.text='';this.children=[...nodes];}
    set textContent(s){this.text=String(s);this.children=[];}
    get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ');}
    setAttribute(k,v){this.attrs[k]=v;}
    attachShadow(){return this.shadowRoot=new Element('shadow');}
    click(){if(!this.disabled)return this.onclick?.({preventDefault(){},stopPropagation(){}});}
  }
  let now=0,next=1;const timers=new Map(),calls=[],tabs=[];
  const image=new Element('img');Object.assign(image,{src:'https://i.pinimg.com/test.png',naturalWidth:400,naturalHeight:600,alt:'测试图片',getBoundingClientRect:()=>({width:200,height:300})});
  const root=new Element('html');
  runInNewContext(source,{
    document:{documentElement:root,images:[image],title:'测试网页',getElementById:()=>null,createElement:t=>new Element(t),addEventListener(){}},
    location:{origin:'https://ph.pinterest.com',href:'https://ph.pinterest.com/pin/test'},
    Date:{now:()=>now},Uint8Array,URL,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
    setTimeout:(f,ms)=>{const id=next++;timers.set(id,{f,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
    GM_registerMenuCommand(){},GM_openInTab:(url)=>{if(openThrows)throw new Error('blocked');tabs.push(url);return {};},
    GM_xmlhttpRequest:options=>{calls.push(options);respond(options);return {abort(){}};}
  });
  const shadow=root.children[0].shadowRoot,scan=shadow.children.find(x=>x.className==='dock').children[1],notice=shadow.children.find(x=>x.className==='notice');
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
  const tick=async ms=>{await flush();const end=now+ms;for(;;){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].f();await flush();}now=end;await flush();};
  const action=label=>notice.children[2].children.find(x=>x.textContent===label);
  return {scan,notice,calls,tabs,flush,tick,action};
}
const json=(options,value)=>options.onload({status:200,response:value});
const state={active:false,cancelled:false,opened:false,requested:[],results:[]};
function waitingResponse(options){json(options,options.method==='POST'?{id:'job-1',capability:'one-job-only'}:state);}

test('click shows immediate feedback; absent GM callbacks time out and enable retry',async()=>{
  const h=harness(()=>{});h.scan.click();
  assert.equal(h.notice.hidden,false);assert.match(h.notice.textContent,/正在连接/);assert.equal(h.scan.disabled,true);
  await h.tick(8001);
  assert.equal(h.scan.disabled,false);assert.match(h.notice.textContent,/8 秒/);assert.equal(h.action('重试连接').tagName,'button');
  h.action('重试连接').click();assert.equal(h.calls.length,2);assert.equal(h.scan.disabled,true);
});

test('waiting for selection never locks the collector; blocked automatic tabs retain a real link',async()=>{
  const h=harness(waitingResponse,{openThrows:true});h.scan.click();await h.flush();
  assert.equal(h.scan.disabled,false);assert.equal(h.scan.attrs['aria-busy'],'false');assert.match(h.notice.textContent,/尚未保存/);
  const link=h.action('打开图片选择页 →');assert.equal(link.tagName,'a');assert.equal(link.href,'http://127.0.0.1:47831/collect#job-1');assert.equal(link.target,'_blank');
  h.scan.click();await h.flush();assert.equal(h.calls.filter(o=>o.method==='POST').length,1);
});

test('collector acknowledgement updates the next step; cancel releases this session',async()=>{
  const h=harness(o=>json(o,o.method==='POST'?{id:'job-1',capability:'one-job-only'}:{...state,opened:true}));h.scan.click();await h.tick(901);
  assert.match(h.notice.textContent,/等待你选图并确认/);assert.ok(h.action('继续选择图片 →'));
  h.action('取消本次收藏').click();await h.flush();
  assert.equal(h.scan.textContent,'收集本页');assert.match(h.notice.textContent,/收藏已取消/);
  const cancel=h.calls.find(o=>o.url.endsWith('/cancel'));assert.equal(cancel.headers['X-Plka-Capture'],'one-job-only');
});

test('old cancellation responses cannot cover a newly opened selection session',async()=>{
  let pendingCancel,n=0;const h=harness(o=>{if(o.url.endsWith('/cancel'))pendingCancel=o;else json(o,o.method==='POST'?{id:'job-'+(++n),capability:'cap'}:state);});
  h.scan.click();await h.flush();h.action('取消本次收藏').click();h.scan.click();await h.flush();
  json(pendingCancel,{ok:true});await h.flush();
  assert.match(h.action('打开图片选择页 →').href,/#job-2$/);assert.doesNotMatch(h.notice.textContent,/收藏已取消/);
});

test('a lost polling callback recovers instead of leaving a permanent busy state',async()=>{
  const h=harness(o=>{if(o.method==='POST')json(o,{id:'job-1',capability:'cap'});});h.scan.click();await h.tick(9001);
  assert.equal(h.scan.disabled,false);assert.equal(h.scan.textContent,'收集本页');assert.match(h.notice.textContent,/收藏连接中断/);
});

test('approved images download and complete while retaining a usable cancel action',async()=>{
  let uploaded=false;const h=harness(o=>{
    if(o.url.includes('i.pinimg.com'))o.onload({status:200,response:Uint8Array.from([1,2,3]).buffer});
    else if(o.url.endsWith('/data')){uploaded=true;json(o,{...state,opened:true,results:[{index:0,ok:true}]});}
    else if(o.method==='POST')json(o,{id:'job-1',capability:'cap'});
    else json(o,{...state,active:true,opened:true,requested:[0]});
  });h.scan.click();await h.tick(901);
  assert.equal(uploaded,true);assert.match(h.notice.textContent,/收藏成功/);assert.equal(h.scan.disabled,false);assert.equal(h.scan.textContent,'收集本页');
});
