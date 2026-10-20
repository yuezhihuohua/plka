// Chrome stdio bridge. Credentials only travel to the exact allowed extension.
import { readFileSync,existsSync } from 'node:fs';
import {spawnSync} from 'node:child_process';
import { join } from 'node:path';
import { extensionOrigin } from '../lib/native-config.mjs';
import { startBackground } from './start-background.mjs';
import {configDir} from '../lib/config.mjs';
const origin = process.argv.find(arg => arg.startsWith('chrome-extension://'));
if (origin !== extensionOrigin()) { process.stderr.write('Unauthorized Plka extension origin\n'); process.exit(1); }
let input = Buffer.alloc(0), queue = Promise.resolve();
function reply(value) {
  const body = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([header, body]));
}
async function handle(message) {
  if (!message || !['ensure-ready','open-desktop'].includes(message.command) || Object.keys(message).some(k => k !== 'command')) return reply({ok:false,code:'INVALID_COMMAND',error:'不支持的 Plka 操作。'});
  try {
    const result = await startBackground({noOpen:true,upgradeOwned:true});
    const token = readFileSync(join(result.dataDir,'.connection-key'),'utf8').trim();
    let desktop=false;
    if(message.command==='open-desktop'&&process.platform==='darwin'){
      try{const record=JSON.parse(readFileSync(join(configDir(),'desktop-installation.json'),'utf8'));
        const path=record.desktopApp;
        if(typeof path==='string'&&path.endsWith('.app')&&existsSync(join(path,'Contents','MacOS','Plka'))&&readFileSync(join(path,'Contents','Info.plist'),'utf8').includes('<string>com.plka.desktop</string>')){
          const environment=['PIKA_CONFIG_DIR','REFERENCE_DATA_DIR','REFERENCE_PORT','CODEX_HOME','PLKA_NATIVE_HOST_DIR'].filter(name=>process.env[name]).flatMap(name=>['--env',name+'='+process.env[name]]);
          const opened=spawnSync('/usr/bin/open',[...environment,path],{stdio:'ignore',env:process.env});desktop=!opened.error&&opened.status===0;
        }
      }catch{}
    }
    reply({ok:true,token,version:result.version,url:result.url,desktop});
  } catch(error) { reply({ok:false,code:'START_FAILED',error:error.message}); }
}
process.stdin.on('data', chunk => {
  input = Buffer.concat([input,chunk]);
  while (input.length >= 4) {
    const length = input.readUInt32LE(0);
    if (length < 2 || length > 65536) { process.stderr.write('Invalid Plka message length\n'); process.exit(1); }
    if (input.length < length + 4) break;
    const body = input.subarray(4,length+4); input = input.subarray(length+4);
    queue = queue.then(async()=>{let value;try{value=JSON.parse(body.toString('utf8'));}catch{return reply({ok:false,code:'INVALID_JSON',error:'无法读取请求。'});}await handle(value);}).catch(()=>process.exit(1));
  }
});
process.stdin.on('end',()=>{queue.finally(()=>process.exit(input.length?1:0));});
process.stdout.on('error',()=>process.exit(0));
