(() => {
  if(!/^https?:$/.test(location.protocol)||window.top!==window)return;
  if(['127.0.0.1','localhost'].includes(location.hostname)&&location.port==='47831')return;
  const id='plka-library-dock';
  const previous=document.getElementById(id);
  if(previous){previous.hidden=false;return;}
  const host=document.createElement('div');host.id=id;
  host.style.cssText='all:initial!important;position:fixed!important;right:18px!important;top:74%!important;z-index:2147483646!important;display:block;';
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');
  style.textContent=`:host([hidden]){display:none!important}*{box-sizing:border-box}.dock{display:flex;align-items:center;gap:0;background:#252831;color:#fffefa;border:1px solid #ffffff35;border-radius:18px;box-shadow:0 5px 24px #11182735;padding:5px;isolation:isolate}button{all:unset;box-sizing:border-box;display:flex;align-items:center;cursor:pointer;font:500 12px/1.3 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:inherit}button:focus-visible{outline:2px solid #b7c8f6;outline-offset:3px;border-radius:10px}.open{gap:8px;min-height:36px;padding:1px 8px 1px 1px;touch-action:none;user-select:none}.open:hover{color:#f5df91}.open:disabled{opacity:.7;cursor:wait}.open svg{width:30px;height:30px;flex:none}.label{display:flex;flex-direction:column;gap:2px}.label strong{font-weight:600;letter-spacing:.3px;font-size:13px}.label small{font-size:9px;color:#bcc6df}.close{align-self:stretch;justify-content:center;width:23px;margin-left:3px;border-left:1px solid #ffffff20;color:#aeb7cd;font-size:17px;border-radius:0 12px 12px 0}.close:hover{color:#fff;background:#ffffff0d}.status{background:#fffefa;color:#707b94;padding:10px 12px;border:1px solid #e1e4ed;border-radius:12px;box-shadow:0 4px 18px #11182720;max-width:220px;font:11px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;margin-bottom:8px;overflow-wrap:anywhere}[hidden]{display:none!important}@media(prefers-reduced-motion:no-preference){.dock{transition:box-shadow .15s}.dock:hover{box-shadow:0 6px 28px #11182745}}`;
  const status=document.createElement('div');status.className='status';status.hidden=true;status.setAttribute('role','status');
  const row=document.createElement('div');row.className='dock';
  const open=document.createElement('button');open.className='open';open.type='button';open.setAttribute('aria-label','打开 Plka 图库');open.title='打开 Plka 图库；拖动可调整位置';
  open.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="19" width="31" height="36" rx="7" transform="rotate(-13 27.5 37)" fill="#acbfee"/><path d="M26 10h17l10 10v27a7 7 0 0 1-7 7H26a7 7 0 0 1-7-7V17a7 7 0 0 1 7-7Z" fill="#f4dc87"/><path d="M43 10v7a3 3 0 0 0 3 3h7Z" fill="#fff4c8"/><path d="M27 44V23h10a8 8 0 0 1 0 16h-4v5Z" fill="#252831"/><path d="M33 28v6h4a3 3 0 0 0 0-6Z" fill="#f4dc87"/><circle cx="48" cy="48" r="4" fill="#d99cba"/></svg><span class="label"><strong>Plka</strong><small>打开图库</small></span>';
  const close=document.createElement('button');close.className='close';close.type='button';close.textContent='×';close.setAttribute('aria-label','暂时隐藏本页 Plka 入口');close.title='本页暂时隐藏；刷新后恢复';
  row.append(open,close);shadow.append(style,status,row);document.documentElement.append(host);
  let fraction=.74,drag=null,suppressClick=false;
  const place=()=>{const room=Math.max(0,innerHeight-host.getBoundingClientRect().height-24);host.style.setProperty('top',Math.max(12,Math.round(room*fraction))+'px','important');};
  place();chrome.storage.local.get('dockY').then(data=>{if(Number.isFinite(data.dockY)){fraction=Math.max(0,Math.min(1,data.dockY));place();}}).catch(()=>{});
  window.addEventListener('resize',place);
  globalThis.__plkaDockDispose=()=>{window.removeEventListener('resize',place);host.remove();delete globalThis.__plkaDockDispose;};
  close.onclick=event=>{event.preventDefault();event.stopPropagation();host.hidden=true;};
  open.onpointerdown=event=>{if(event.button!==0)return;drag={id:event.pointerId,y:event.clientY,start:host.getBoundingClientRect().top,moved:false};open.setPointerCapture(event.pointerId);};
  open.onpointermove=event=>{if(!drag||drag.id!==event.pointerId)return;const delta=event.clientY-drag.y;if(Math.abs(delta)>6)drag.moved=true;if(!drag.moved)return;event.preventDefault();const room=Math.max(1,innerHeight-host.getBoundingClientRect().height-24);fraction=Math.max(0,Math.min(1,(drag.start+delta)/room));place();};
  open.onpointerup=event=>{if(!drag||drag.id!==event.pointerId)return;if(drag.moved){suppressClick=true;chrome.storage.local.set({dockY:fraction}).catch(()=>{});setTimeout(()=>{suppressClick=false;},0);}drag=null;};
  open.onpointercancel=()=>{drag=null;};
  open.onclick=async event=>{
    event.preventDefault();event.stopPropagation();if(suppressClick||open.disabled)return;
    open.disabled=true;status.hidden=true;
    try{const response=await chrome.runtime.sendMessage({type:'open-library'});if(!response?.ok)throw new Error(response?.error||'请重新加载扩展并刷新网页。');}
    catch(error){status.textContent=error.message.includes('Extension context')?'扩展已更新，请刷新网页后再试。':error.message;status.hidden=false;place();}
    finally{open.disabled=false;}
  };
})();
