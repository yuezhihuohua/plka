// ==UserScript==
// @name         Plka · 网页收藏
// @namespace    https://plka.local/userscripts
// @version      0.6.2
// @description  将网页图片收藏到自己的 Plka，本地选择收藏夹、笔记和标签。
// @match        https://*.pinterest.com/*
// @match        https://*.xiaohongshu.com/*
// @match        https://*.huaban.com/*
// @match        http://127.0.0.1:47831/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @connect      127.0.0.1
// @connect      pinimg.com
// @connect      xhscdn.com
// @connect      xiaohongshu.com
// @connect      huabanimg.com
// @connect      huaban.com
// @connect      *
// ==/UserScript==

(() => {
  'use strict';
  const BASE='http://127.0.0.1:47831',MAX=16*1024*1024;
  const request=(url,{method='GET',data,capability,responseType='json',timeoutMs=url.startsWith(BASE)?8000:25000}={})=>new Promise((resolve,reject)=>{
    let handle,settled=false;
    const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(watchdog);error?reject(error):resolve(value);};
    // GM callbacks can remain pending while permissions are being requested.
    // An independent deadline also covers that case, not only network timeout.
    const expired=()=>{done(new Error(url.startsWith(BASE)?Math.ceil(timeoutMs/1000)+' 秒内未收到本机图库响应。请先打开 Plka，并检查油猴是否允许访问 127.0.0.1。':'图片下载超时，可返回选图页重试。'));try{handle?.abort();}catch{}};
    const watchdog=setTimeout(expired,timeoutMs);
    try{handle=GM_xmlhttpRequest({method,url,responseType,timeout:timeoutMs,headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(capability?{'X-Plka-Capture':capability}:{})},data:data===undefined?undefined:JSON.stringify(data),
      onprogress:e=>{if(responseType==='arraybuffer'&&(e.loaded>MAX||e.total>MAX)){done(new Error('图片超过 16 MB'));try{handle?.abort();}catch{}}},
      onload:r=>{let value=r.response;try{if(responseType==='json'&&typeof value==='string')value=JSON.parse(value);}catch{done(new Error('图库返回了无法识别的内容，请更新 Plka 后重试。'));return;}if(r.status<200||r.status>=300){done(new Error(value?.error||'请求失败（'+r.status+'）'));return;}done(null,value);},
      onerror:()=>done(new Error('无法连接。请确认 Plka 已打开，并允许油猴访问所需网站。')),
      ontimeout:expired,onabort:()=>done(new Error('图片下载或连接已取消'))});}catch(e){done(e);}
  });
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const local=(path,options)=>request(BASE+path,options);
  if(location.origin===BASE){
    local('/api/userscript/seen',{method:'POST',data:{}}).catch(()=>{});
    document.documentElement.dataset.plkaUserscript='0.6.2';
    if(location.pathname!=='/demo')return;
  }
  // Prefer the native extension when both collectors are installed.
  if(document.getElementById('plka-library-dock'))return;
  let sending=false,current=null,target=null,hideTimer,frame;
  const host=document.createElement('div');host.id='plka-userscript';
  host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483645!important;';
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent='*{box-sizing:border-box}button,a{font:600 13px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}button{cursor:pointer;border:0;border-radius:24px;background:#252831;color:#fffefa;padding:12px 17px;box-shadow:0 4px 24px #0003}button:focus-visible,a:focus-visible{outline:3px solid #91a8e2;outline-offset:3px}button:disabled{opacity:.65;cursor:progress}.save{position:fixed;background:#f4dc87;color:#252831}.dock{position:fixed;right:20px;bottom:54px;display:flex;gap:6px;align-items:center;background:#252831;border-radius:24px;padding:4px}.dock button{box-shadow:none;padding:9px 12px}.dock .scan{background:#f4dc87;color:#252831}.notice{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:25px;border:1px solid #e3dcc7;border-radius:22px;z-index:2;background:#fffefa;box-shadow:0 8px 40px #0003;color:#252831;font:13px/1.8 -apple-system,"PingFang SC",sans-serif}.notice h2{font-size:20px;margin:0 0 10px}.notice p{margin:0 0 16px;white-space:pre-line}.notice .primary{background:#f4dc87;color:#252831;border-radius:22px;padding:11px 16px;font-weight:700;text-decoration:none}.notice .secondary{background:#eeece5;color:#52596a}.notice small{display:block;margin-bottom:12px;color:#7a8190}.notice .notice-actions{display:flex;gap:7px;flex-wrap:wrap}.notice button{box-shadow:none;margin:3px;padding:8px 12px}.notice a{display:inline-block;margin:8px;color:#526cb0}[hidden]{display:none!important}';
  const save=document.createElement('button');save.className='save';save.textContent='＋ 收藏到 Plka';save.hidden=true;
  const dock=document.createElement('div');dock.className='dock';
  const open=document.createElement('button');open.textContent='P · 打开图库';open.title='打开本机 Plka 图库';
  const scan=document.createElement('button');scan.className='scan';scan.textContent='收集本页';scan.title='选择本页已加载图片，最多 30 张';
  const notice=document.createElement('div');notice.className='notice';notice.hidden=true;notice.setAttribute('role','region');notice.setAttribute('aria-label','Plka 收藏状态');notice.setAttribute('aria-live','polite');
  const tell=(message,actions=[],title='Plka 网页收藏')=>{
    notice.replaceChildren();const heading=document.createElement('h2');heading.textContent=title;const p=document.createElement('p');p.textContent=message;notice.append(heading,p);
    const row=document.createElement('div');row.className='notice-actions';
    for(const [label,action,primary=false] of actions){const b=document.createElement(typeof action==='string'?'a':'button');b.className=primary?'primary':'secondary';b.textContent=label;if(typeof action==='string'){b.href=action;b.target='_blank';b.rel='noopener noreferrer';}else b.onclick=action;row.append(b);}
    const close=document.createElement('button');close.className='secondary';close.textContent='收起提示';close.onclick=()=>{notice.hidden=true;};row.append(close);notice.append(row);notice.hidden=false;
  };
  function controls(phase='idle'){
    const opening=phase==='opening';scan.disabled=save.disabled=opening;scan.setAttribute('aria-busy',String(opening));save.setAttribute('aria-busy',String(opening));
    scan.textContent=opening?'正在连接…':current?'继续选图':'收集本页';save.textContent=opening?'正在连接…':current?'继续当前收藏':'＋ 收藏到 Plka';
  }
  async function cancelJob(job){
    if(current!==job)return;current=null;controls();
    try{await local('/api/capture-bridge/'+job.id+'/cancel',{method:'POST',data:{},capability:job.capability});if(current||sending)return;tell('已取消本次收藏。已经保存成功的图片会保留。',[],'收藏已取消');}
    catch{if(current||sending)return;tell('已停止继续下载。若收藏页仍然打开，可在收藏页点击“取消收藏”。',[],'已停止本次操作');}
  }
  function waiting(job,opened=false){
    const url=BASE+'/collect#'+job.id;
    tell('已找到 '+job.items.length+' 张图片，尚未保存。\n下一步：打开图片选择页 → 选择图片和收藏夹 → 点击“确认收藏”。\n下载期间请保留这个原网页。',[
      [opened?'继续选择图片 →':'打开图片选择页 →',url,true],['取消本次收藏',()=>cancelJob(job)]
    ],opened?'等待你选图并确认':'请打开图片选择页');
  }
  // Constructed sheets keep the shadow UI styled on sites that block inline <style>.
  try{const sheet=new CSSStyleSheet();sheet.replaceSync(style.textContent);shadow.adoptedStyleSheets=[sheet];}
  catch{shadow.append(style);}
  dock.append(open,scan);shadow.append(save,dock,notice);document.documentElement.append(host);
  const imageInfo=image=>({url:image.currentSrc||image.src,page_url:location.href,page_title:document.title,name:image.alt||document.title,width:image.naturalWidth,height:image.naturalHeight});
  function candidates(){const seen=new Set();return [...document.images].filter(i=>{const u=i.currentSrc||i.src,r=i.getBoundingClientRect();if(!u||seen.has(u)||/\.svg(?:[?#]|$)/i.test(u)||i.naturalWidth<120||i.naturalHeight<100||r.width<90||r.height<80)return false;seen.add(u);return true;}).slice(0,30).map(imageInfo);}
  async function bytes(url){
    let array;
    if(url.startsWith('data:')){if(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(url))throw new Error('此图片格式暂不支持');const raw=atob(url.split(',')[1]);array=Uint8Array.from(raw,c=>c.charCodeAt(0));}
    else array=new Uint8Array(await request(url,{responseType:'arraybuffer'}));
    if(!array.length||array.length>MAX)throw new Error('图片为空或超过 16 MB');
    let raw='';for(let i=0;i<array.length;i+=8192)raw+=String.fromCharCode(...array.subarray(i,i+8192));return btoa(raw);
  }
  async function monitor(job){
    let previous='';
    try{
      const deadline=Date.now()+14*60*1000;
      while(current===job&&Date.now()<deadline){
        await sleep(900);if(current!==job)return;
        let state=await local('/api/capture-bridge/'+job.id,{capability:job.capability});if(current!==job)return;
        if(state.cancelled){current=null;controls();tell('没有继续保存图片，可以重新发起收藏。',[],'本次收藏已取消');return;}
        const phase=state.active?'saving':state.results.some(r=>!r.ok)?'partial':state.results.length?'complete':state.opened?'choosing':'unopened';
        if(phase!==previous){
          if(phase==='choosing'||phase==='unopened')waiting(job,Boolean(state.opened));
          if(phase==='partial')tell('已经保存 '+state.results.filter(r=>r.ok).length+' 张，部分图片失败。请回到选图页查看原因并重试。',[['返回选图页重试 →',BASE+'/collect#'+job.id,true],['停止本次收藏',()=>cancelJob(job)]],'部分图片尚未收藏');
          previous=phase;
        }
        for(const index of state.requested){
          if(current!==job)return;
          scan.textContent='正在保存…';
          tell('已保存 '+state.results.filter(r=>r.ok).length+' 张，正在下载下一张。请保持原网页打开。',[['查看收藏页',BASE+'/collect#'+job.id],['停止本次收藏',()=>cancelJob(job)]],'正在保存图片');
          let payload;try{payload={index,data:await bytes(job.items[index].url)};}catch(e){payload={index,error:e.message};}
          if(current!==job)return;
          state=await local('/api/capture-bridge/'+job.id+'/data',{method:'POST',data:payload,capability:job.capability,timeoutMs:30000});
        }
        if(current!==job)return;
        if(!state.active&&state.results.length&&state.results.every(r=>r.ok)){
          current=null;controls();tell('已收藏 '+state.results.length+' 张图片。现在可以继续浏览或打开图库。',[['打开 Plka 图库 →',BASE+'/',true]],'收藏成功');return;
        }
        if(!state.active)controls();
      }
      if(current===job){current=null;controls();tell('这次选图已超时，尚未保存的图片需要重新选择。',[['重新收集本页',()=>collect(job.items),true]],'请重新发起收藏');}
    }catch(e){if(current===job){current=null;controls();tell(e.message,[['重新发起收藏',()=>collect(job.items),true],['检查安装',BASE+'/setup']],'收藏连接中断');}}
  }
  async function collect(items){
    if(sending)return;
    if(current){waiting(current);try{GM_openInTab(BASE+'/collect#'+current.id,{active:true,insert:true,setParent:true});}catch{}return;}
    if(!items.length)return tell('没有找到已加载的图片。请打开图片详情页，或先滚动网页。');
    sending=true;controls('opening');tell('正在连接本机图库，最多等待 8 秒。请保持 Plka 应用打开。',[],'正在准备选图页');
    try{
      const made=await local('/api/capture-bridge',{method:'POST',data:{items}});
      const job={...made,items};current=job;controls();waiting(job);
      try{GM_openInTab(BASE+'/collect#'+job.id,{active:true,insert:true,setParent:true});}catch{/* The prominent ordinary link remains usable if automatic opening fails. */}
      monitor(job);
    }catch(e){current=null;controls();tell(e.message,[['重试连接',()=>collect(items),true],['打开安装检查',BASE+'/setup']],'没有连上本机图库');}
    finally{sending=false;if(!current)controls();}
  }
  save.onclick=e=>{e.preventDefault();e.stopPropagation();if(target)collect([imageInfo(target)]);};
  scan.onclick=()=>collect(candidates());
  open.onclick=async()=>{try{await local('/api/health');GM_openInTab(BASE+'/',{active:true});}catch{tell('本地图库还没有运行。请从“应用程序”打开 Plka；可在新手引导中开启登录后后台运行。',[['我已打开，重试',()=>open.click()]]);}};
  document.addEventListener('pointermove',event=>{
    if(event.composedPath().includes(host)){clearTimeout(hideTimer);return;}cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      const layers=document.elementsFromPoint(event.clientX,event.clientY);let found;
      for(const n of layers.slice(0,6)){let parent=n;for(let d=0;parent&&d<6;d++,parent=parent.parentElement){if(parent===document.body||parent===document.documentElement)break;const imgs=parent instanceof HTMLImageElement?[parent]:parent.querySelectorAll('img');if(imgs.length>30)break;found=[...imgs].find(i=>{const r=i.getBoundingClientRect();return i.naturalWidth>=120&&i.naturalHeight>=100&&r.width>=90&&r.height>=80&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;});if(found)break;}if(found)break;}
      clearTimeout(hideTimer);if(found){target=found;const r=found.getBoundingClientRect();save.style.left=Math.max(8,Math.min(innerWidth-160,r.left+10))+'px';save.style.top=Math.max(8,Math.min(innerHeight-50,r.bottom-48))+'px';save.hidden=false;}else hideTimer=setTimeout(()=>{save.hidden=true;},180);
    });
  },true);
  document.addEventListener('scroll',()=>{save.hidden=true;},true);
  GM_registerMenuCommand('打开 Plka 图库',()=>open.click());
  GM_registerMenuCommand('收藏本页图片（最多 30 张）',()=>collect(candidates()));
})();
