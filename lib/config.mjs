import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const APP_ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
export const VERSION='0.6.1';
export function configDir({env=process.env,platform=process.platform,home=homedir()}={}) {
  return env.PIKA_CONFIG_DIR|| (platform==='win32'?join(env.LOCALAPPDATA||join(home,'AppData','Local'),'Plka'):platform==='darwin'?join(home,'Library','Application Support','Plka'):join(env.XDG_DATA_HOME||join(home,'.local','share'),'Plka'));
}
export function resolveDataDir({appRoot=APP_ROOT,env=process.env,platform=process.platform,home=homedir()}={}) {
  if(env.REFERENCE_DATA_DIR)return resolve(env.REFERENCE_DATA_DIR);
  const location=join(configDir({env,platform,home}),'library-location.json');
  if(existsSync(location)) {
    const saved=JSON.parse(readFileSync(location,'utf8'));
    if(saved.product!=='reference-library'||!saved.dataDir||!existsSync(join(saved.dataDir,'library.sqlite')))throw new Error('原图库路径不可用，请重新连接原图库；不会创建空图库替代。');
    return resolve(saved.dataDir);
  }
  if(existsSync(join(appRoot,'data','library.sqlite')))return join(appRoot,'data');
  const codexRoot=env.CODEX_HOME||join(home,'.codex');
  const binding=join(codexRoot,'skills','reference-library','library-config.json');
  if(existsSync(binding)){
    const saved=JSON.parse(readFileSync(binding,'utf8'));
    if(saved.product==='reference-library'&&saved.dataDir&&existsSync(join(saved.dataDir,'library.sqlite')))return resolve(saved.dataDir);
  }
  return join(configDir({env,platform,home}),'library');
}
export function rememberDataDir(dataDir,options={}) {
  const folder=configDir(options);mkdirSync(folder,{recursive:true});
  const target=join(folder,'library-location.json'),temp=target+'.'+process.pid+'.tmp';
  writeFileSync(temp,JSON.stringify({product:'reference-library',dataDir:resolve(dataDir),updatedAt:new Date().toISOString()},null,2),{mode:0o600});
  renameSync(temp,target);
}
