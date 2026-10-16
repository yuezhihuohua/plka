import { existsSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { configDir,resolveDataDir,rememberDataDir,VERSION } from '../lib/config.mjs';
try{
  const i=process.argv.indexOf('--use-data');
  if(i>=0){const root=resolve(process.argv[i+1]||'');if(!existsSync(join(root,'library.sqlite')))throw new Error('请选择包含 library.sqlite 的原 data 文件夹。');rememberDataDir(root);}
  const dataDir=resolveDataDir();
  console.log(process.argv.includes('--data-path')?dataDir:JSON.stringify({version:VERSION,dataDir,configDir:configDir(),port:Number(process.env.REFERENCE_PORT)||47831}));
}catch(error){console.error(error.message);process.exitCode=1;}
