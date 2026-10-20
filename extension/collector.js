import {TagPicker} from './tag-picker.js';
import './quick-access.js';
const BASE='http://127.0.0.1:47831';
const $=s=>document.querySelector(s);let token='',items=[],busy=false,tagPicker,closeTimer;const completed=new Set();
const status=s=>{$('#status').textContent=s;};
async function api(path,method='GET',data){
  const send=()=>fetch(BASE+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
  let r;try{r=await send();}catch{const result=await chrome.runtime.sendMessage({type:'ensure-library',force:true});if(!result?.ok)throw new Error(result?.error||'Plka 暂未就绪，请稍后重试。');token=result.token;r=await send();}
  if(r.status===401){const result=await chrome.runtime.sendMessage({type:'ensure-library',force:true});if(!result?.ok)throw new Error(result?.error||'Plka 暂未就绪。');token=result.token;r=await send();}
  const body=await r.json();if(!r.ok)throw new Error(body.error||'操作失败。');return body;
}
function scanPage(){const seen=new Set(),out=[];const add=(url,name,width,height)=>{if(!url||seen.has(url)||out.length>=300)return;try{const u=new URL(url,location.href);if(!['http:','https:','data:'].includes(u.protocol))return;if(u.protocol==='data:'&&!/^data:image\/(png|jpeg|webp|gif);base64,/.test(u.href))return;seen.add(u.href);out.push({url:u.href,name:name||document.title,page_url:location.href,page_title:document.title,width,height});}catch{}};for(const i of document.images){const r=i.getBoundingClientRect();if((i.naturalWidth||r.width)<120||(i.naturalHeight||r.height)<100)continue;add(i.currentSrc||i.src||i.dataset.src,i.alt,i.naturalWidth,i.naturalHeight);}for(const n of document.querySelectorAll('main [style],article [style],[style*="background-image"]')){const r=n.getBoundingClientRect();if(r.width<120||r.height<100)continue;const s=getComputedStyle(n).backgroundImage;const match=s.match(/^url\(["']?(.*?)["']?\)$/);if(match)add(match[1],document.title,0,0);}return {title:document.title,items:out,capped:out.length>=300};}
async function loadItems(){const key=new URLSearchParams(location.search).get('item');if(key){const saved=await chrome.storage.session.get(key);if(saved[key]){items=[saved[key]];await chrome.storage.session.remove(key);}else throw new Error('这次收藏窗口已过期，请重新选择图片。');}else{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:/.test(tab.url||''))throw new Error('请在普通网页上打开扩展，浏览器设置页不支持采集。');await chrome.scripting.executeScript({target:{tabId:tab.id},files:['hover.js']});const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:scanPage});items=r.result.items;$('#limit-note').textContent=r.result.capped?'最多显示 300 张':'';$('#page-title').textContent=r.result.title;}
  if(items.length===1)$('#page-title').textContent=items[0].page_title||'网页图片';const grid=$('#images');grid.replaceChildren();items.forEach((item,index)=>{const label=document.createElement('label');label.className='image-option';const image=document.createElement('img');image.src=item.url;image.alt=item.name;image.referrerPolicy='no-referrer';const input=document.createElement('input');input.type='checkbox';input.value=index;input.checked=items.length===1;const meta=document.createElement('span');meta.className='dimensions';meta.textContent=item.width&&item.height?`${item.width} × ${item.height}`:'页面可获取图片';label.append(image,input,meta);grid.append(label);});$('#image-count').textContent='找到 '+items.length+' 张图片';if(!items.length)status('当前页面没有识别到可收藏的图片。请打开详情页或滚动加载后重试，也可以右键目标图片收藏。');}
async function folders(){const all=await api('/collections');const selected=$('#folder').value;$('#folder').replaceChildren(new Option('请选择收藏夹',''));const local=await chrome.storage.local.get('lastFolder');for(const f of all)$('#folder').append(new Option(f.name,f.id,false,f.id===(selected||local.lastFolder)));}
async function ready(){await folders();tagPicker=new TagPicker($('#tags'),{catalog:await api('/tags'),saveCatalog:tags=>api('/tags','POST',{tags}),onError:status});$('#setup').hidden=true;$('#collector').hidden=false;if(!items.length)try{await loadItems();}catch(e){status(e.message);}}
async function initialize(){
  $('#setup').hidden=false;$('#setup-title').textContent='正在准备 Plka…';$('#setup-message').textContent='正在自动识别这台电脑的图库。';$('#setup-retry').disabled=true;
  try{const result=await chrome.runtime.sendMessage({type:'ensure-library'});if(!result?.ok)throw new Error(result?.error||'本机 Plka 助手暂未就绪。');token=result.token;status('');await ready();}
  catch(e){$('#setup-title').textContent='启用一次，以后直接收藏';$('#setup-message').textContent=e.message;}
  finally{$('#setup-retry').disabled=false;}
}
$('#setup-retry').onclick=initialize;
$('#create-folder').onclick=async()=>{try{const c=await api('/collections','POST',{name:$('#folder-name').value});await folders();$('#folder').value=c.id;$('#folder-name').value='';status('收藏夹已创建');}catch(e){status(e.message);}};
$('#select-all').onchange=e=>{for(const i of $('#images').querySelectorAll('input'))if(!i.disabled)i.checked=e.target.checked;};
async function getBytes(url){let b;if(url.startsWith('data:')){b=await(await fetch(url)).arrayBuffer();}else{const r=await fetch(url,{credentials:'include',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('网站返回 '+r.status);const length=Number(r.headers.get('content-length'));if(length>16*1024*1024)throw new Error('超过 16 MB');const reader=r.body.getReader(),chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>16*1024*1024){await reader.cancel();throw new Error('超过 16 MB');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(total);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}b=bytes.buffer;}if(b.byteLength>16*1024*1024)throw new Error('超过 16 MB');let raw='';const bytes=new Uint8Array(b);for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);}
$('#save').onclick=async()=>{if(busy)return;const selected=[...$('#images').querySelectorAll('input:checked')].map(i=>items[Number(i.value)]);const folder=$('#folder').value;if(!folder)return status('请选择或新建一个收藏夹。');if(!selected.length)return status('请先选择要收藏的图片。');busy=true;$('#save').disabled=true;let ok=0,duplicate=0;const failed=[];const selectedTags=tagPicker.values(),selectedNote=$('#note').value;const folderName=$('#folder').selectedOptions[0].textContent;status('正在准备收藏…');
  try{const origins=[...new Set(selected.filter(i=>!i.url.startsWith('data:')).map(i=>new URL(i.url).origin+'/*'))];
    // Invoke the permission request before any await so Chrome retains the Save gesture.
    if(origins.length&&!await chrome.permissions.request({origins}))throw new Error('需要允许访问所选图片的域名，才能下载到本地。');
    for(let n=0;n<selected.length;n++){const item=selected[n];status(`正在收藏 ${n+1}/${selected.length}，请保持窗口打开…`);try{const data=await getBytes(item.url);const r=await api('/import','POST',{data,meta:{name:item.name||item.page_title||'网页参考图',page_url:item.page_url,page_title:item.page_title,image_url:item.url.startsWith('data:')?'':item.url,width:item.width,height:item.height,collections:[folder],note:selectedNote,tags:selectedTags}});ok++;if(r.duplicate)duplicate++;completed.add(items.indexOf(item));}catch(e){failed.push(`${n+1}. ${e.message}`);}}
    await chrome.storage.local.set({lastFolder:folder});
    for(const input of $('#images').querySelectorAll('input'))if(completed.has(Number(input.value))){input.checked=false;input.disabled=true;}
    status(failed.length?'部分图片未收藏，请处理后重试。':'');
    showResult({ok,total:selected.length,duplicate,failed,folderName});
  }catch(e){status(e.message);}finally{busy=false;$('#save').disabled=completed.size===items.length;}
};
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
initialize();

function showResult({ok,total,duplicate,failed,folderName}){
  const modal=$('#result-modal'),success=failed.length===0&&ok===total;
  clearTimeout(closeTimer);modal.classList.toggle('partial',!success);
  modal.querySelector('.result-symbol').textContent=success?'✓':'!';
  $('#result-title').textContent=success?'收藏成功':ok?'部分收藏成功':'未能收藏';
  $('#result-message').textContent=success?'已将 '+ok+' 张图片收藏到「'+folderName+'」'+(duplicate?'，其中 '+duplicate+' 张已合并去重。':'。'):'已收藏 '+ok+'/'+total+' 张；失败图片仍被选中，可重试。';
  $('#result-errors').textContent=failed.join('\n');
  $('#result-close-note').textContent=success?'即将自动关闭收藏窗口':'窗口会保留，方便检查和重试。';
  $('#result-dismiss').textContent=success?'完成并关闭':'返回处理';
  $('#result-dismiss').onclick=()=>{modal.close();if(success)window.close();};
  modal.oncancel=()=>{clearTimeout(closeTimer);};
  modal.showModal();
  if(success)closeTimer=setTimeout(()=>{window.close();$('#result-close-note').textContent='收藏完成，可以关闭此窗口。';},1800);
}
