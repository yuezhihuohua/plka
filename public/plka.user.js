// ==UserScript==
// @name         Plka · 网页收藏
// @namespace    https://plka.local/userscripts
// @version      0.6.0
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
  const request=(url,{method='GET',data,capability,responseType='json'}={})=>new Promise((resolve,reject)=>{
    let handle;
    handle=GM_xmlhttpRequest({method,url,responseType,timeout:25000,headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(capability?{'X-Plka-Capture':capability}:{})},data:data===undefined?undefined:JSON.stringify(data),
      onprogress:e=>{if(responseType==='arraybuffer'&&(e.loaded>MAX||e.total>MAX)){handle?.abort();reject(new Error('图片超过 16 MB'));}},
      onload:r=>{if(r.status<200||r.status>=300){reject(new Error(r.response?.error||'请求失败（'+r.status+'）'));return;}resolve(r.response);},
      onerror:()=>reject(new Error('无法连接。请确认 Plka 已打开，并允许油猴访问所需网站。')),
      ontimeout:()=>reject(new Error('请求超时，请保持原网页打开后重试。')),onabort:()=>reject(new Error('图片下载已取消或超过 16 MB'))});
  });
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const local=(path,options)=>request(BASE+path,options);
  if(location.origin===BASE){
    local('/api/userscript/seen',{method:'POST',data:{}}).catch(()=>{});
    document.documentElement.dataset.plkaUserscript='0.6.0';
    if(location.pathname!=='/demo')return;
  }
  // Prefer the native extension when both collectors are installed.
  if(document.getElementById('plka-library-dock'))return;
  let sending=false,target=null,hideTimer,frame;
  const host=document.createElement('div');host.id='plka-userscript';
  host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483645!important;';
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent='*{box-sizing:border-box}button,a{font:600 13px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}button{cursor:pointer;border:0;border-radius:24px;background:#252831;color:#fffefa;padding:12px 17px;box-shadow:0 4px 24px #0003}button:focus-visible,a:focus-visible{outline:3px solid #91a8e2;outline-offset:3px}button:disabled{opacity:.6;cursor:wait}.save{position:fixed;background:#f4dc87;color:#252831}.dock{position:fixed;right:20px;bottom:54px;display:flex;gap:6px;align-items:center;background:#252831;border-radius:24px;padding:4px}.dock button{box-shadow:none;padding:9px 12px}.dock .scan{background:#f4dc87;color:#252831}.notice{position:fixed;right:20px;bottom:116px;width:min(340px,calc(100vw - 40px));padding:18px;border-radius:18px;background:#fffefa;box-shadow:0 8px 40px #0003;color:#252831;font:13px/1.8 -apple-system,"PingFang SC",sans-serif}.notice p{margin:0 0 12px}.notice button{box-shadow:none;margin:3px;padding:8px 12px}.notice a{display:inline-block;margin:8px;color:#526cb0}[hidden]{display:none!important}';
  const save=document.createElement('button');save.className='save';save.textContent='＋ 收藏到 Plka';save.hidden=true;
  const dock=document.createElement('div');dock.className='dock';
  const open=document.createElement('button');open.textContent='P · 打开图库';open.title='打开本机 Plka 图库';
  const scan=document.createElement('button');scan.className='scan';scan.textContent='收集本页';scan.title='选择本页已加载图片，最多 30 张';
  const notice=document.createElement('div');notice.className='notice';notice.hidden=true;notice.setAttribute('role','status');
  const tell=(message,actions=[])=>{notice.replaceChildren();const p=document.createElement('p');p.textContent=message;notice.append(p);for(const [label,fn] of actions){const b=document.createElement('button');b.textContent=label;b.onclick=fn;notice.append(b);}const close=document.createElement('button');close.textContent='关闭提示';close.onclick=()=>{notice.hidden=true;};notice.append(close);notice.hidden=false;};
  dock.append(open,scan);shadow.append(style,save,dock,notice);document.documentElement.append(host);
  const imageInfo=image=>({url:image.currentSrc||image.src,page_url:location.href,page_title:document.title,name:image.alt||document.title,width:image.naturalWidth,height:image.naturalHeight});
  function candidates(){const seen=new Set();return [...document.images].filter(i=>{const u=i.currentSrc||i.src,r=i.getBoundingClientRect();if(!u||seen.has(u)||/\.svg(?:[?#]|$)/i.test(u)||i.naturalWidth<120||i.naturalHeight<100||r.width<90||r.height<80)return false;seen.add(u);return true;}).slice(0,30).map(imageInfo);}
  async function bytes(url){
    let array;
    if(url.startsWith('data:')){if(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(url))throw new Error('此图片格式暂不支持');const raw=atob(url.split(',')[1]);array=Uint8Array.from(raw,c=>c.charCodeAt(0));}
    else array=new Uint8Array(await request(url,{responseType:'arraybuffer'}));
    if(!array.length||array.length>MAX)throw new Error('图片为空或超过 16 MB');
    let raw='';for(let i=0;i<array.length;i+=8192)raw+=String.fromCharCode(...array.subarray(i,i+8192));return btoa(raw);
  }
  async function collect(items){
    if(sending)return;if(!items.length)return tell('没有找到已加载的图片。请打开图片详情页，或先滚动网页。');
    sending=true;save.disabled=true;scan.disabled=true;
    try{
      const job=await local('/api/capture-bridge',{method:'POST',data:{items}});
      GM_openInTab(BASE+'/collect#'+job.id,{active:true,insert:true});
      tell('已打开本地收藏窗口。请选择收藏夹并确认；请保留这个原网页，图片将从这里下载。');
      const deadline=Date.now()+14*60*1000;
      while(Date.now()<deadline){
        await sleep(900);const state=await local('/api/capture-bridge/'+job.id,{capability:job.capability});if(state.cancelled)break;
        for(const index of state.requested){let payload;try{payload={index,data:await bytes(items[index].url)};}catch(e){payload={index,error:e.message};}await local('/api/capture-bridge/'+job.id+'/data',{method:'POST',data:payload,capability:job.capability});}
        if(state.results.length&&state.results.every(r=>r.ok)){tell('收藏已完成，可以继续浏览。');break;}
      }
    }catch(e){tell(e.message,[['重试收藏',()=>collect(items)],['检查安装',()=>GM_openInTab(BASE+'/setup',{active:true})]]);}
    finally{sending=false;save.disabled=false;scan.disabled=false;}
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
