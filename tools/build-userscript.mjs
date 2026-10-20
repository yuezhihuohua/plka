import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=dirname(dirname(fileURLToPath(import.meta.url))),version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const source=readFileSync(join(root,'public/plka.user.js'),'utf8');
if(!source.includes('// @version      '+version))throw new Error('Userscript version does not match application');
mkdirSync(join(root,'release'),{recursive:true});const target=join(root,'release',`Plka-v${version}.user.js`);
writeFileSync(target,source);writeFileSync(target+'.sha256',createHash('sha256').update(source).digest('hex')+'  '+basename(target)+'\n');console.log('Userscript package created: '+basename(target));
