// ==UserScript==
// @name         Plka · 网页收藏
// @namespace    https://plka.local/userscripts
// @version      0.7.0
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
  const request=(url,{method='GET',data,capability,chooser,responseType='json',timeoutMs=url.startsWith(BASE)?8000:25000}={})=>new Promise((resolve,reject)=>{
    let handle,settled=false;
    const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(watchdog);error?reject(error):resolve(value);};
    // GM callbacks can remain pending while permissions are being requested.
    // An independent deadline also covers that case, not only network timeout.
    const expired=()=>{done(new Error(url.startsWith(BASE)?Math.ceil(timeoutMs/1000)+' 秒内未收到本机图库响应。请先打开 Plka，并检查油猴是否允许访问 127.0.0.1。':'图片下载超时，可返回选图页重试。'));try{handle?.abort();}catch{}};
    const watchdog=setTimeout(expired,timeoutMs);
    try{handle=GM_xmlhttpRequest({method,url,responseType,timeout:timeoutMs,headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(capability?{'X-Plka-Capture':capability}:{}),...(chooser?{'X-Plka-Chooser':chooser}:{})},data:data===undefined?undefined:JSON.stringify(data),
      onprogress:e=>{if(responseType==='arraybuffer'&&(e.loaded>MAX||e.total>MAX)){done(new Error('图片超过 16 MB'));try{handle?.abort();}catch{}}},
      onload:r=>{let value=r.response;try{if(responseType==='json'&&typeof value==='string')value=JSON.parse(value);}catch{done(new Error('图库返回了无法识别的内容，请更新 Plka 后重试。'));return;}if(r.status<200||r.status>=300){done(new Error(value?.error||'请求失败（'+r.status+'）'));return;}done(null,value);},
      onerror:()=>done(new Error('无法连接。请确认 Plka 已打开，并允许油猴访问所需网站。')),
      ontimeout:expired,onabort:()=>done(new Error('图片下载或连接已取消'))});}catch(e){done(e);}
  });
  const local=(path,options)=>request(BASE+path,options);
  if(location.origin===BASE){
    local('/api/userscript/seen',{method:'POST',data:{}}).catch(()=>{});
    document.documentElement.dataset.plkaUserscript='0.7.0';
    if(location.pathname!=='/demo')return;
  }
  if(document.getElementById('plka-library-dock')||document.getElementById('plka-userscript'))return;
  let current=null,opening=false,target=null,hideTimer,frame,closeTimer,generation=0;
  const host=document.createElement('div');host.id='plka-userscript';
  host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483645!important;';
  const shadow=host.attachShadow({mode:'open'});
  const make=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
  const style=make('style',`
    *{box-sizing:border-box}button,input,select,textarea,summary{font:500 13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#252831}button,a,summary{touch-action:manipulation}button{cursor:pointer;border:0;border-radius:18px;background:#eeece5;padding:10px 15px;font-weight:650}button:disabled{opacity:.55;cursor:progress}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #91a8e2;outline-offset:2px}[hidden]{display:none!important}.save{position:fixed;background:#f4dc87;box-shadow:0 4px 20px #0003}.dock{position:fixed;right:20px;bottom:54px;display:flex;gap:5px;background:#252831;border-radius:24px;padding:4px}.dock button{border-radius:22px;background:#252831;color:#fffefa;padding:9px 12px}.dock .scan{background:#f4dc87;color:#252831}.backdrop{position:fixed;inset:0;background:#25283125;z-index:2}.panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(410px,calc(100vw - 28px));max-height:calc(100dvh - 36px);overflow:auto;background:#fffefa;border:1px solid #e3dcc7;border-radius:24px;padding:24px;z-index:3;box-shadow:0 18px 70px #0003;color:#252831;font:13px/1.7 -apple-system,"PingFang SC",sans-serif}.panel.batch{width:min(610px,calc(100vw - 28px))}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.head h2{font-size:20px;margin:0;letter-spacing:-.4px}.close{padding:3px 9px;font-size:22px;background:transparent;color:#7a7f8b}.single{display:flex;gap:16px;align-items:center;margin:0 0 20px}.single img{width:92px;height:108px;object-fit:contain;border-radius:12px;background:#eeece5}.single p{font-size:13px;overflow-wrap:anywhere;margin:0;max-height:68px;overflow:hidden}.muted{color:#838895;font-size:12px}.field{display:block;margin:12px 0 7px;font-size:12px;color:#697080}.folder-row,.new-row{display:flex;gap:7px;align-items:center}.folder-row select{flex:1;min-width:0}.folder-row button{white-space:nowrap;background:transparent;color:#6579ae;padding:8px}.new-row{margin-top:8px}.new-row input{min-width:0;flex:1}select,input,textarea{background:#fff;border:1px solid #dedfd9;border-radius:12px;padding:10px 12px;width:100%}textarea{resize:vertical;min-height:65px}details{border-top:1px solid #e9e5da;margin-top:17px;padding-top:12px}summary{cursor:pointer;color:#858b98;font-size:12px}.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.chip{padding:6px 10px;border-radius:12px;color:#7b818d;font-size:12px;background:#eeeff1}.chip.selected{background:#e2e8ff;color:#566aa2}.new-tag{display:flex;gap:6px;margin-top:9px}.new-tag input{min-width:0}.new-tag button{white-space:nowrap}.status{font-size:12px;white-space:pre-line;color:#7b8190;min-height:8px;margin:10px 0}.status.error{color:#ad5a58}.confirm{width:100%;padding:12px 18px;margin-top:4px;background:#f4dc87;font-size:14px;border-radius:15px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:9px;max-height:260px;overflow:auto;margin:10px 0}.tile{position:relative;border:2px solid transparent;border-radius:12px;overflow:hidden;background:#eeece5;cursor:pointer}.tile.selected{border-color:#8b9fda}.tile img{width:100%;height:130px;object-fit:contain;display:block}.tile input{position:absolute;top:7px;right:7px;width:17px;height:17px;accent-color:#6f83bd}.batchbar{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#777e8d}.batchbar button{padding:4px 9px;font-size:12px}.success{text-align:center;padding:10px 0 8px}.success .tick{display:block;width:56px;height:56px;line-height:56px;margin:0 auto 12px;background:#e5ecdb;border-radius:50%;font-size:26px;color:#657a46}.success h2{font-size:20px;margin:0}.success p{margin:7px 0 0;color:#777e8d}a{color:#6579ae;text-decoration:none}.actions{display:flex;gap:7px;align-items:center;margin-top:15px}
  `);
  try{const sheet=new CSSStyleSheet();sheet.replaceSync(style.textContent);shadow.adoptedStyleSheets=[sheet];}catch{shadow.append(style);}
  const save=make('button','＋ 收藏到 Plka','save');save.hidden=true;
  const dock=make('div','','dock'),open=make('button','P · 打开图库'),scan=make('button','收集本页','scan');
  scan.title='选择本页已加载图片，最多 30 张';dock.append(open,scan);
  const backdrop=make('div','','backdrop'),panel=make('section','','panel');backdrop.hidden=panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','收藏到 Plka');
  shadow.append(save,dock,backdrop,panel);document.documentElement.append(host);
  const trusted=e=>{try{return e instanceof Event&&e.isTrusted===true&&Array.isArray(Event.prototype.composedPath.call(e));}catch{return false;}};
  function controls(){scan.disabled=save.disabled=opening;scan.textContent=opening?'正在准备…':current?'继续收藏':'收集本页';save.textContent=opening?'正在准备…':current?'继续收藏':'＋ 收藏到 Plka';}
  function reveal(){clearTimeout(closeTimer);backdrop.hidden=panel.hidden=false;save.hidden=true;}
  function header(title){panel.replaceChildren();const h=make('div','','head'),heading=make('h2',title),close=make('button','×','close');close.setAttribute('aria-label','取消收藏');close.onclick=e=>{if(trusted(e))dismiss();};h.append(heading,close);panel.append(h);return heading;}
  function dismiss(){const job=current;generation++;current=null;opening=false;controls();backdrop.hidden=panel.hidden=true;clearTimeout(closeTimer);if(job)local('/api/capture-bridge/'+job.id+'/cancel',{method:'POST',data:{},capability:job.capability}).catch(()=>{});}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&trusted(e)&&!panel.hidden){e.preventDefault();e.stopPropagation();dismiss();}},true);
  function message(title,text,retry){reveal();header(title);panel.append(make('p',text,'status'));if(retry){const b=make('button','重试','confirm');b.onclick=e=>{if(trusted(e))retry();};panel.append(b);}}
  const imageInfo=image=>({url:image.currentSrc||image.src,page_url:location.href,page_title:document.title,name:image.alt||document.title,width:image.naturalWidth,height:image.naturalHeight});
  function candidates(){const seen=new Set();return [...document.images].filter(i=>{const u=i.currentSrc||i.src,r=i.getBoundingClientRect();if(!u||seen.has(u)||/\.svg(?:[?#]|$)/i.test(u)||i.naturalWidth<120||i.naturalHeight<100||r.width<90||r.height<80)return false;seen.add(u);return true;}).slice(0,30).map(imageInfo);}
  async function bytes(url){let array;if(url.startsWith('data:')){if(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(url))throw new Error('此图片格式暂不支持');array=Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));}else array=new Uint8Array(await request(url,{responseType:'arraybuffer'}));if(!array.length||array.length>MAX)throw new Error('图片为空或超过 16 MB');let raw='';for(let i=0;i<array.length;i+=8192)raw+=String.fromCharCode(...array.subarray(i,i+8192));return btoa(raw);}
  const chooser=(job,path,options={})=>local('/api/capture-bridge/'+job.id+path,{...options,chooser:job.chooser_capability});
  function render(job){
    reveal();panel.className='panel'+(job.items.length>1?' batch':'');header(job.items.length===1?'收藏到 Plka':'选择要收藏的图片');
    const form={folder:job.folder||'',selected:job.selected||new Set(job.items.length===1?[0]:[]),tags:job.tags||new Set(),note:job.note||''};job.form=form;
    const status=make('p','','status');status.setAttribute('role','status');const pending=()=>[...form.selected].filter(i=>!job.results?.some(r=>r.index===i&&r.ok));
    const submit=make('button','','confirm');const update=()=>{const n=pending().length;submit.textContent=job.items.length===1?'收藏':'收藏选中的 '+n+' 张图片';submit.disabled=job.busy||!form.folder||n===0;};
    if(job.items.length===1){const preview=make('div','','single'),img=make('img');img.src=job.items[0].url;img.referrerPolicy='no-referrer';img.alt='本次收藏的图片';const caption=make('div');caption.append(make('p',job.items[0].name),make('span','原图比例 · 保存到本机','muted'));preview.append(img,caption);panel.append(preview);}
    else{const bar=make('div','','batchbar'),all=make('button','全选');bar.append(make('span','找到 '+job.items.length+' 张已加载图片'),all);const grid=make('div','','grid'),boxes=[];job.items.forEach((item,index)=>{const tile=make('label','','tile'),img=make('img'),box=make('input');img.src=item.url;img.referrerPolicy='no-referrer';img.alt=item.name;box.type='checkbox';box.checked=form.selected.has(index);box.disabled=Boolean(job.results?.some(r=>r.index===index&&r.ok));box.setAttribute('aria-label','选择图片 '+(index+1));tile.classList.toggle('selected',box.checked);box.onchange=e=>{if(!trusted(e))return;box.checked?form.selected.add(index):form.selected.delete(index);tile.classList.toggle('selected',box.checked);update();};tile.append(img,box);grid.append(tile);boxes.push([box,tile,index]);});all.onclick=e=>{if(!trusted(e)||job.busy)return;const select=boxes.some(([b])=>!b.disabled&&!b.checked);for(const [b,t,i]of boxes)if(!b.disabled){b.checked=select;t.classList.toggle('selected',select);select?form.selected.add(i):form.selected.delete(i);}all.textContent=select?'取消全选':'全选';update();};panel.append(bar,grid);}
    panel.append(make('label','放入收藏夹','field'));const row=make('div','','folder-row'),folder=make('select'),create=make('button','＋ 新建');folder.setAttribute('aria-label','放入收藏夹');
    const fillFolders=()=>{folder.replaceChildren();const placeholder=make('option','请选择收藏夹');placeholder.value='';folder.append(placeholder);for(const c of job.context.collections){const o=make('option',c.name);o.value=c.id;folder.append(o);}folder.value=form.folder;};fillFolders();folder.onchange=e=>{if(trusted(e)){form.folder=folder.value;update();}};row.append(folder,create);panel.append(row);
    const newRow=make('div','','new-row'),name=make('input'),add=make('button','创建');newRow.hidden=true;name.maxLength=80;name.placeholder='收藏夹名称';name.setAttribute('aria-label','新收藏夹名称');newRow.append(name,add);panel.append(newRow);
    create.onclick=e=>{if(!trusted(e)||job.busy)return;newRow.hidden=!newRow.hidden;if(!newRow.hidden)name.focus();};
    add.onclick=async e=>{if(!trusted(e)||job.busy||add.disabled)return;add.disabled=true;status.textContent='';try{const c=await chooser(job,'/collection',{method:'POST',data:{name:name.value}});if(current!==job)return;job.context.collections.push(c);form.folder=c.id;fillFolders();newRow.hidden=true;name.value='';update();}catch(error){if(current===job)status.textContent=error.message;}finally{add.disabled=false;}};
    const more=make('details'),summary=make('summary','添加标签 / 备注（可选）'),chips=make('div','','chips');more.append(summary);const tags=[...new Set([...job.context.tags,...form.tags])].slice(0,100);
    const addChip=tag=>{const b=make('button',tag,'chip');b.classList.toggle('selected',form.tags.has(tag));b.setAttribute('aria-pressed',String(form.tags.has(tag)));b.onclick=e=>{if(!trusted(e)||job.busy)return;form.tags.has(tag)?form.tags.delete(tag):form.tags.add(tag);b.classList.toggle('selected',form.tags.has(tag));b.setAttribute('aria-pressed',String(form.tags.has(tag)));};chips.append(b);};tags.forEach(addChip);more.append(chips);
    const tagRow=make('div','','new-tag'),tagInput=make('input'),tagAdd=make('button','添加');tagInput.maxLength=30;tagInput.placeholder='新增标签';tagInput.setAttribute('aria-label','新增标签');tagAdd.onclick=e=>{if(!trusted(e)||job.busy)return;const value=tagInput.value.trim();if(value&&!tags.includes(value)&&tags.length<100){tags.push(value);form.tags.add(value);addChip(value);}tagInput.value='';};tagRow.append(tagInput,tagAdd);more.append(tagRow,make('label','收藏备注','field'));
    const note=make('textarea');note.maxLength=4000;note.placeholder='喜欢这张参考的什么？';note.setAttribute('aria-label','收藏备注');note.value=form.note;note.oninput=e=>{if(trusted(e))form.note=note.value;};more.append(note);panel.append(more,status,submit);
    const busy=value=>{job.busy=value;for(const n of panel.querySelectorAll('button,input,select,textarea'))n.disabled=value;const close=panel.querySelector('.close');close.disabled=false;if(!value){for(const [index] of job.items.entries()){const box=panel.querySelectorAll('.grid input')[index];if(box&&job.results?.some(r=>r.index===index&&r.ok))box.disabled=true;}update();}};
    submit.onclick=async e=>{
      if(!trusted(e)||job.busy||!form.folder||!pending().length)return;
      let indexes=pending();busy(true);status.className='status';status.textContent='正在保存…';
      try{
        let state=await local('/api/capture-bridge/'+job.id,{capability:job.capability});if(current!==job)return;job.results=state.results;indexes=pending();if(!state.active&&indexes.length)state=await chooser(job,'/approve',{method:'POST',data:{indexes,collection_id:form.folder,tags:[...form.tags],note:form.note}});if(current!==job)return;
        for(const index of state.requested){if(current!==job)return;status.textContent='正在保存 '+(state.results.filter(r=>r.ok&&indexes.includes(r.index)).length+1)+' / '+indexes.length+'…';let payload;try{payload={index,data:await bytes(job.items[index].url)};}catch(error){payload={index,error:error.message};}if(current!==job)return;state=await local('/api/capture-bridge/'+job.id+'/data',{method:'POST',data:payload,capability:job.capability,timeoutMs:30000});}
        if(current!==job)return;job.results=state.results;const failures=state.results.filter(r=>indexes.includes(r.index)&&!r.ok);
        if(failures.length){status.className='status error';status.textContent=failures.map(r=>r.error).join('\n')+'\n已保存的图片会保留，可点击下方重试。';busy(false);submit.textContent='重试未保存的图片';return;}
        const destination=job.context.collections.find(c=>c.id===form.folder)?.name||'所选收藏夹';current=null;controls();panel.className='panel';panel.replaceChildren();const result=make('div','','success');result.setAttribute('role','status');result.append(make('span','✓','tick'),make('h2','已收藏'),make('p','已保存到「'+destination+'」'));panel.append(result);closeTimer=setTimeout(()=>{panel.hidden=backdrop.hidden=true;},1400);
      }catch(error){if(current!==job)return;status.className='status error';status.textContent=error.message+'\n可重试继续保存，或关闭取消。';busy(false);for(const n of panel.querySelectorAll('input,select,textarea,.new-row button,.folder-row button,.chips button,.new-tag button,.batchbar button'))n.disabled=true;submit.textContent='重试保存';submit.disabled=false;}
    };
    update();
  }
  async function collect(items){
    if(opening)return;if(current){reveal();return;}if(!items.length){message('没有找到图片','请打开图片详情，或先滚动加载图片。');return;}
    const operation=++generation;opening=true;controls();panel.className='panel';message('收藏到 Plka','正在准备收藏夹…');
    let job;
    try{const made=await local('/api/capture-bridge',{method:'POST',data:{items}});job={...made,items};if(operation!==generation){local('/api/capture-bridge/'+job.id+'/cancel',{method:'POST',data:{},capability:job.capability}).catch(()=>{});return;}current=job;job.context=await chooser(job,'/context');if(current!==job)return;job.folder=job.context.preferred_collection_id||(job.context.collections.length===1?job.context.collections[0].id:'');render(job);}
    catch(error){if(operation===generation){current=null;if(job)local('/api/capture-bridge/'+job.id+'/cancel',{method:'POST',data:{},capability:job.capability}).catch(()=>{});message('暂时无法收藏',error.message+'\n请确认 Plka 已打开。',()=>collect(items));}}
    finally{if(operation===generation){opening=false;controls();}}
  }
  save.onclick=e=>{e.preventDefault();e.stopPropagation();if(trusted(e)&&target)collect([imageInfo(target)]);};scan.onclick=e=>{if(trusted(e))collect(candidates());};
  open.onclick=async e=>{if(e&&!trusted(e))return;try{await local('/api/health');GM_openInTab(BASE+'/',{active:true});}catch{message('请先打开 Plka','从“应用程序”打开 Plka 后，即可在当前网页收藏。');}};
  document.addEventListener('pointermove',event=>{if(event.composedPath().includes(host)){clearTimeout(hideTimer);return;}cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const layers=document.elementsFromPoint(event.clientX,event.clientY);let found;for(const n of layers.slice(0,6)){let parent=n;for(let d=0;parent&&d<6;d++,parent=parent.parentElement){if(parent===document.body||parent===document.documentElement)break;const imgs=parent instanceof HTMLImageElement?[parent]:parent.querySelectorAll('img');if(imgs.length>30)break;found=[...imgs].find(i=>{const r=i.getBoundingClientRect();return i.naturalWidth>=120&&i.naturalHeight>=100&&r.width>=90&&r.height>=80&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;});if(found)break;}if(found)break;}clearTimeout(hideTimer);if(found&&panel.hidden){target=found;const r=found.getBoundingClientRect();save.style.left=Math.max(8,Math.min(innerWidth-160,r.left+10))+'px';save.style.top=Math.max(8,Math.min(innerHeight-50,r.bottom-48))+'px';save.hidden=false;}else hideTimer=setTimeout(()=>{save.hidden=true;},180);});},true);
  document.addEventListener('scroll',()=>{save.hidden=true;},true);
  GM_registerMenuCommand('打开 Plka 图库',()=>open.onclick());GM_registerMenuCommand('收藏本页图片（最多 30 张）',()=>collect(candidates()));
})();
