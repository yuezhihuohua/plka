import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataDir } from '../lib/config.mjs';
try {
  const root=resolveDataDir();
  const token=readFileSync(join(root,'.connection-key'),'utf8').trim();
  const r=await fetch(`http://127.0.0.1:${Number(process.env.REFERENCE_PORT)||47831}/api/shutdown`,{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(3000)});
  if(!r.ok)throw new Error('图库配置不匹配，未停止其他服务。');console.log('图库服务已停止。下次可双击启动，或让 Codex Skill 启动。');
} catch(e) {console.log(e.message.includes('不匹配')?e.message:'图库未运行，或尚未创建本地数据。');}
