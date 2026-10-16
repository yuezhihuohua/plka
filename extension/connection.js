const HOST='com.plka.library',BASE='http://127.0.0.1:47831';
export function createConnection(api=chrome,fetcher=fetch){
  let inFlight,port,request,failActive;
  function native(){
    if(request)return request;
    let done,receive;
    const pending=new Promise((resolve,reject)=>{done=(error,value)=>error?reject(error):resolve(value);});
    request=pending;
    let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);port?.onMessage.removeListener(receive);request=undefined;failActive=undefined;done(error,value);};
    const timer=setTimeout(()=>finish(new Error('Plka 正在准备图库，请稍后重试。')),180000);
    failActive=finish;
    try{
      if(!port){port=api.runtime.connectNative(HOST);port.onDisconnect.addListener(()=>{const error=api.runtime.lastError;port=undefined;failActive?.(new Error(error?.message||'本机 Plka 助手已断开。'));});}
      receive=value=>{if(value?.ok&&typeof value.token==='string'&&value.token.length>=32)finish(null,value);else finish(new Error(value?.error||'Plka 未能启动。'));};
      port.onMessage.addListener(receive);port.postMessage({command:'ensure-ready'});
    }catch(error){port=undefined;finish(error);}
    return pending;
  }
  async function valid(token){
    if(!token)return false;
    try{const response=await fetcher(BASE+'/api/stats',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(1800)});return response.ok;}catch{return false;}
  }
  async function ensure({force=false}={}){
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      const stored=await api.storage.local.get('connectionToken');
      if(!force&&await valid(stored.connectionToken))return {ok:true,token:stored.connectionToken};
      try{const result=await native();await api.storage.local.set({connectionToken:result.token});return result;}
      catch(error){
        const absent=/not found|not registered|forbidden|specified native|不存在|未注册/i.test(error.message);
        return {ok:false,code:absent?'HELPER_MISSING':'START_FAILED',error:absent?'只需安装一次 Plka 本机助手，之后浏览器会自动启动图库。':error.message};
      }
    })();try{return await inFlight;}finally{inFlight=undefined;}
  }
  return {ensure};
}
