export const DOCK_SCRIPT_ID='plka-dock-everywhere';
export const ALL_WEB_ORIGINS=['http://*/*','https://*/*'];
const primary=url=>{try{const u=new URL(url);return u.protocol==='https:'&&['pinterest.com','xiaohongshu.com','huaban.com'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host));}catch{return false;}};
export async function syncDockRegistration(api=chrome){
  const settings=await api.storage.local.get('dockEverywhere');
  const enabled=Boolean(settings.dockEverywhere)&&await api.permissions.contains({origins:ALL_WEB_ORIGINS});
  const scripts=await api.scripting.getRegisteredContentScripts({ids:[DOCK_SCRIPT_ID]});
  if(enabled&&!scripts.length)await api.scripting.registerContentScripts([{id:DOCK_SCRIPT_ID,matches:ALL_WEB_ORIGINS,js:['dock.js'],runAt:'document_idle',persistAcrossSessions:true}]);
  if(!enabled&&scripts.length)await api.scripting.unregisterContentScripts({ids:[DOCK_SCRIPT_ID]});
  const tabs=await api.tabs.query({});
  for(const tab of tabs){
    if(!tab.id||!/^https?:/.test(tab.url||'')||primary(tab.url))continue;
    if(enabled)await api.scripting.executeScript({target:{tabId:tab.id},files:['dock.js']}).catch(()=>{});
    else if(scripts.length)await api.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.__plkaDockDispose?.()}).catch(()=>{});
  }
  return {enabled};
}
