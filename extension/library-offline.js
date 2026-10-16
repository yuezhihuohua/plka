async function open(){
  const b=document.querySelector('#retry');b.disabled=true;document.querySelector('#status').textContent='正在唤醒本机图库…';
  try{const result=await chrome.runtime.sendMessage({type:'open-library'});if(result?.error)throw new Error(result.error);if(!result?.online){document.querySelector('#title').textContent='首次启用一次，以后直接使用';document.querySelector('#status').textContent='本机助手尚未就绪。安装完成后点“继续打开”。';document.querySelector('#setup').hidden=false;}}
  catch(e){document.querySelector('#status').textContent=e.message||'请重新加载 Plka 扩展后重试。';document.querySelector('#setup').hidden=false;}
  finally{b.disabled=false;}
}
document.querySelector('#retry').onclick=open;
open();
