import {openLibrary} from './library-link.js';
import {syncDockRegistration} from './dock-settings.js';
chrome.runtime.onInstalled.addListener(async()=>{
  chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:'save-image',title:'收藏到 Plka',contexts:['image']}));
  // Existing tabs do not receive newly installed declarative content scripts automatically.
  const matches=chrome.runtime.getManifest().content_scripts.flatMap(script=>script.matches);
  const tabs=await chrome.tabs.query({url:matches});
  for(const tab of tabs)if(tab.id)chrome.scripting.executeScript({target:{tabId:tab.id},files:['dock.js','hover.js']}).catch(()=>{});
  await syncDockRegistration();
});
chrome.runtime.onStartup.addListener(()=>syncDockRegistration().catch(()=>{}));
chrome.permissions.onRemoved.addListener(()=>syncDockRegistration().catch(()=>{}));
async function openCollector(item){const key=crypto.randomUUID();await chrome.storage.session.set({[key]:item});await chrome.windows.create({url:chrome.runtime.getURL('collector.html')+'?item='+key,type:'popup',width:500,height:820});}
chrome.contextMenus.onClicked.addListener((info,tab)=>{if(info.menuItemId==='save-image')openCollector({url:info.srcUrl,page_url:info.pageUrl||tab?.url,page_title:tab?.title||'',name:'网页参考图'}).catch(console.error);});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{if(sender.id!==chrome.runtime.id)return;
  if(message.type==='open-library'){openLibrary().then(respond,e=>respond({error:e.message}));return true;}
  if(message.type==='sync-dock'){syncDockRegistration().then(respond,e=>respond({error:e.message}));return true;}
  if(message.type==='open-collector'){openCollector(message.item).then(()=>respond({ok:true}),e=>respond({error:e.message}));return true;}
});
