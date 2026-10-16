export const LIBRARY_URL='http://127.0.0.1:47831/';
export async function openLibrary(api=chrome,fetcher=fetch){
  let online=false;
  try{const r=await fetcher(LIBRARY_URL+'api/health',{signal:AbortSignal.timeout(2000)});const health=await r.json();online=r.ok&&health.ok===true&&typeof health.version==='string';}catch{}
  const offline=api.runtime.getURL('library-offline.html'),tabs=await api.tabs.query({});
  const library=tabs.find(tab=>{try{const u=new URL(tab.url);return u.origin==='http://127.0.0.1:47831'&&u.pathname==='/';}catch{return false;}});
  const fallback=tabs.find(tab=>tab.url===offline);
  let tab;
  if(online&&library)tab=await api.tabs.update(library.id,{active:true});
  else if(online&&fallback)tab=await api.tabs.update(fallback.id,{url:LIBRARY_URL,active:true});
  else if(!online&&fallback)tab=await api.tabs.update(fallback.id,{active:true});
  else tab=await api.tabs.create({url:online?LIBRARY_URL:offline,active:true});
  if(tab.windowId!==undefined)await api.windows.update(tab.windowId,{focused:true});
  return {ok:true,online,tabId:tab.id};
}
