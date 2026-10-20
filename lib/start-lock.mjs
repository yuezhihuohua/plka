import {mkdirSync,openSync,writeFileSync,closeSync,readFileSync,unlinkSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {configDir} from './config.mjs';
export async function acquireStartLock(timeoutMs=180000){
  const folder=configDir();mkdirSync(folder,{recursive:true});
  const file=join(folder,'start-'+(Number(process.env.REFERENCE_PORT)||47831)+'.lock'),nonce=randomUUID(),deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    try{const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,JSON.stringify({pid:process.pid,nonce}));}finally{closeSync(fd);}
      return ()=>{try{if(JSON.parse(readFileSync(file,'utf8')).nonce===nonce)unlinkSync(file);}catch{}};
    }catch(error){
      if(error.code!=='EEXIST')throw error;
      try{const owner=JSON.parse(readFileSync(file,'utf8'));try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH'){unlinkSync(file);continue;}}}
      catch{try{if(Date.now()-statSync(file).mtimeMs>5000){unlinkSync(file);continue;}}catch{}}
      await delay(100);
    }
  }
  throw new Error('Plka 仍在完成另一次启动或升级，请稍后重试。');
}
