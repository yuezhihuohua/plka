document.querySelector('#retry').onclick=async()=>{
  const b=document.querySelector('#retry');b.disabled=true;
  try{const result=await chrome.runtime.sendMessage({type:'open-library'});if(result?.error)throw new Error(result.error);if(!result?.online)document.querySelector('#status').textContent='Plka 还未启动。启动后，再点一次打开图库。';}
  catch{document.querySelector('#status').textContent='请重新加载 Plka 扩展后重试。';}
  finally{b.disabled=false;}
};
