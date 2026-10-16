import {ALL_WEB_ORIGINS} from './dock-settings.js';
const open=document.querySelector('#open-library'),all=document.querySelector('#all-sites-dock'),status=document.querySelector('#status');
open.onclick=async()=>{open.disabled=true;try{const r=await chrome.runtime.sendMessage({type:'open-library'});if(!r?.ok)throw new Error(r?.error||'无法打开 Plka');}catch(e){status.textContent=e.message;}finally{open.disabled=false;}};
all.onchange=async()=>{
  const requested=all.checked;
  try{
    if(requested&&!await chrome.permissions.request({origins:ALL_WEB_ORIGINS})){all.checked=false;return;}
    await chrome.storage.local.set({dockEverywhere:requested});
    const r=await chrome.runtime.sendMessage({type:'sync-dock'});if(r?.error)throw new Error(r.error);
    all.checked=Boolean(r?.enabled);
  }catch(e){all.checked=false;status.textContent=e.message;}
};
(async()=>{try{
  const settings=await chrome.storage.local.get('dockEverywhere');all.checked=Boolean(settings.dockEverywhere)&&await chrome.permissions.contains({origins:ALL_WEB_ORIGINS});
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id&&/^https?:/.test(tab.url||''))await chrome.scripting.executeScript({target:{tabId:tab.id},files:['dock.js']});
}catch{}})();
