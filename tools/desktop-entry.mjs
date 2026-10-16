import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { installLocal } from './install-local.mjs';
import { startBackground } from './start-background.mjs';
import { configDir } from '../lib/config.mjs';
try {
  const installed=process.argv.includes('--installed');
  const info=installed?JSON.parse(readFileSync(join(configDir(),'desktop-installation.json'),'utf8')):await installLocal();
  if(!installed){
    const child=spawnSync(info.nodePath,[join(info.appRoot,'tools','desktop-entry.mjs'),'--installed',...(process.argv.includes('--no-open')?['--no-open']:[])],{env:{...process.env,REFERENCE_DATA_DIR:info.dataDir},encoding:'utf8',windowsHide:true});
    if(child.error||child.status!==0)throw new Error(child.error?.message||child.stderr||'Plka 启动失败');
  }else{
    await startBackground({noOpen:process.argv.includes('--no-open'),upgradeOwned:true});
    if(!process.argv.includes('--no-open')){
      if(process.platform==='darwin')spawnSync('/usr/bin/open',[info.extensionFolder]);
      else if(process.platform==='win32')spawnSync('explorer.exe',[info.extensionFolder],{windowsHide:true});
    }
  }
}catch(error){
  console.error(error.message);
  if(process.platform==='darwin'&&!process.argv.includes('--no-open'))spawnSync('/usr/bin/osascript',['-e','on run argv\n display alert "Plka 暂未启用" message (item 1 of argv)\nend run','--',error.message]);
  process.exitCode=1;
}
