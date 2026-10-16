import { existsSync, readFileSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { VERSION } from './config.mjs';

// Run before Store migrations. A failed backup prevents the upgrade from proceeding.
export function backupBeforeUpgrade(root){
  const dbFile=join(root,'library.sqlite'),marker=join(root,'.plka-version');
  if(!existsSync(dbFile)|| (existsSync(marker)&&readFileSync(marker,'utf8').trim()===VERSION))return null;
  const target=join(root,'backups','before-'+VERSION+'-'+new Date().toISOString().replace(/[:.]/g,'-'));
  mkdirSync(target,{recursive:true});let db;
  try{
    db=new DatabaseSync(dbFile);db.prepare('VACUUM INTO ?').run(join(target,'library.sqlite'));db.close();db=null;
    for(const file of ['assets','reports','.connection-key'])if(existsSync(join(root,file)))cpSync(join(root,file),join(target,file),{recursive:true});
    writeFileSync(join(target,'backup.json'),JSON.stringify({beforeVersion:VERSION,createdAt:new Date().toISOString(),originalRoot:root},null,2));
    return target;
  }catch(error){db?.close();rmSync(target,{recursive:true,force:true});throw new Error('升级前备份未完成，已停止启动：'+error.message);}
}
export function markVersion(root){writeFileSync(join(root,'.plka-version'),VERSION);}
