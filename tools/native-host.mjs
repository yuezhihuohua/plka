// Chrome stdio bridge. Credentials only travel to the exact allowed extension.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extensionOrigin } from '../lib/native-config.mjs';
import { startBackground } from './start-background.mjs';
const origin = process.argv.find(arg => arg.startsWith('chrome-extension://'));
if (origin !== extensionOrigin()) { process.stderr.write('Unauthorized Plka extension origin\n'); process.exit(1); }
let input = Buffer.alloc(0), queue = Promise.resolve();
function reply(value) {
  const body = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([header, body]));
}
async function handle(message) {
  if (!message || message.command !== 'ensure-ready' || Object.keys(message).some(k => k !== 'command')) return reply({ok:false,code:'INVALID_COMMAND',error:'不支持的 Plka 操作。'});
  try {
    const result = await startBackground({noOpen:true,upgradeOwned:true});
    const token = readFileSync(join(result.dataDir,'.connection-key'),'utf8').trim();
    reply({ok:true,token,version:result.version,url:result.url});
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
