import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Store, MAX_IMAGE_BYTES } from './lib/store.mjs';
import { installSkill, skillStatus, version as VERSION } from './tools/install-skill.mjs';
import { resolveDataDir } from './lib/config.mjs';
import { backupBeforeUpgrade, markVersion } from './lib/upgrade.mjs';

export const PROJECT_ROOT=dirname(fileURLToPath(import.meta.url));
export function startServer({port=Number(process.env.REFERENCE_PORT)||47831,dataDir=resolveDataDir()}={}) {
  backupBeforeUpgrade(dataDir);
  const store=new Store(dataDir); const keyFile=join(store.root,'.connection-key');
  markVersion(store.root);
  if(!existsSync(keyFile)) writeFileSync(keyFile,randomBytes(32).toString('hex'),{mode:0o600});
  const token=readFileSync(keyFile,'utf8').trim();
  const same=(s)=>{const b=Buffer.from(s||'');const t=Buffer.from(token);return b.length===t.length&&timingSafeEqual(b,t);};
  const server=http.createServer(async(req,res)=>{
    const actualPort=server.address()?.port||port;
    const hosts=[`127.0.0.1:${actualPort}`,`localhost:${actualPort}`];
    const origin=req.headers.origin||''; const localOrigin=hosts.some(h=>origin===`http://${h}`); const extensionOrigin=/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','X-Frame-Options':'DENY'};
    if(extensionOrigin||localOrigin) { headers['Access-Control-Allow-Origin']=origin;headers['Vary']='Origin';headers['Access-Control-Allow-Headers']='Content-Type, Authorization';headers['Access-Control-Allow-Methods']='GET, POST, PATCH, OPTIONS'; }
    const json=(v,status=200)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(v));};
    const u=new URL(req.url,`http://${hosts[0]}`); const route=u.pathname;
    // Public HTML entry pages contain no library data. A link from another site may
    // navigate here; API/bootstrap/media requests still require a trusted context.
    const pageEntry=req.method==='GET'&&['/','/demo','/guide/windows'].includes(route);
    if(!hosts.includes(req.headers.host)) return json({error:'无效的本机地址。'},403);
    if(origin&&!localOrigin&&!extensionOrigin) return json({error:'请求来源未授权。'},403);
    if(req.headers['sec-fetch-site']==='cross-site'&&!extensionOrigin&&!pageEntry) return json({error:`请在浏览器地址栏打开 http://127.0.0.1:${actualPort}/`},403);
    if(req.method==='OPTIONS') {res.writeHead(204,headers);return res.end();}
    const credential=req.headers.authorization?.replace(/^Bearer /,'');
    const cookie=String(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('reference_session='))?.slice(18);
    const authorized=same(credential)||same(cookie);
    const body=async()=>{let size=0;const chunks=[]; for await(const chunk of req) {size+=chunk.length;if(size>MAX_IMAGE_BYTES*1.5+64000) throw new Error('请求过大，单张图片需小于 16 MB。');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('无法读取请求内容。');}};
    try {
      if(route==='/api/health') return json({ok:true,version:VERSION});
      if(route==='/guide/windows'&&req.method==='GET') {
        const source=existsSync(join(PROJECT_ROOT,'distribution','Windows-使用说明.html'))?join(PROJECT_ROOT,'distribution','Windows-使用说明.html'):join(PROJECT_ROOT,'使用说明.html');
        res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'"});return res.end(readFileSync(source));
      }
      if(route==='/api/bootstrap'&&req.method==='GET') {
        if(extensionOrigin) return json({error:'请在本地图库里复制连接码。'},403);
        headers['Set-Cookie']=`reference_session=${token}; HttpOnly; SameSite=Strict; Path=/`;
        return json({token,root:store.root,version:VERSION,port:actualPort,mcp:{command:process.execPath,args:[join(PROJECT_ROOT,'mcp.mjs')],env:{REFERENCE_DATA_DIR:store.root,REFERENCE_PORT:String(actualPort)}}});
      }
      if((route.startsWith('/api/')||route.startsWith('/media/'))&&!authorized) return json({error:'请先连接本地图库。'},401);
      if(route==='/api/integrations/codex'&&req.method==='GET') {const info=skillStatus();info.installed=info.installed&&info.dataDir===store.root&&info.port===actualPort;return json(info);}
      if(route==='/api/integrations/codex/install'&&req.method==='POST') {
        if(extensionOrigin) return json({error:'请在本地图库的 Codex Skill 页面安装。'},403);
        return json(installSkill({dataDir:store.root,port:actualPort}));
      }
      if(route==='/api/shutdown'&&req.method==='POST'){json({stopping:true});setTimeout(()=>{if(server.listening)server.close();},100);return;}
      if(route==='/api/collections'&&req.method==='GET') return json(store.collections());
      if(route==='/api/collections'&&req.method==='POST') return json(store.createCollection((await body()).name),201);
      if(/^\/api\/collections\/[^/]+\/delete$/.test(route)&&req.method==='POST')return json(store.deleteCollection(route.split('/').at(-2)));
      if(route.startsWith('/api/collections/')&&req.method==='PATCH') return json(store.renameCollection(route.split('/').at(-1),(await body()).name));
      if(route==='/api/items'&&req.method==='GET') return json(store.list({collection_id:u.searchParams.get('collection_id')||'',q:u.searchParams.get('q')||'',offset:u.searchParams.get('offset'),limit:u.searchParams.get('limit'),sort:u.searchParams.get('sort'),trashed:u.searchParams.get('trashed')==='true'}));
      if(route==='/api/stats') return json(store.stats());
      if(route==='/api/tags'&&req.method==='GET')return json(store.tagCatalog());
      if(route==='/api/tags'&&req.method==='POST')return json(store.saveTagCatalog((await body()).tags));
      if(route==='/api/trash/purge'&&req.method==='POST')return json(store.purgeTrash(await body()));
      if(route==='/api/import'&&req.method==='POST') {
        const b=await body(); if(typeof b.data!=='string'||!b.data.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)) throw new Error('图片数据无效。');
        return json(store.importImage(Buffer.from(b.data,'base64'),b.meta),201);
      }
      if(route.startsWith('/api/items/')&&req.method==='PATCH') return json(store.updateItem(route.split('/').at(-1),await body()));
      if(route.startsWith('/media/')&&req.method==='GET') {
        const item=store.item(route.split('/').at(-1)); const b=readFileSync(item.file_path);
        res.writeHead(200,{...headers,'Content-Type':item.mime,'Content-Length':b.length});return res.end(b);
      }
      if(route==='/api/analyses'&&req.method==='GET') return json(store.analyses());
      if(route==='/api/analyses'&&req.method==='POST') {const b=await body();return json(store.beginAnalysis(b.collection_id,b.brief),201);}
      const m=route.match(/^\/api\/analyses\/([^/]+)(?:\/(image|observation|finalize|report))?$/);
      if(m) {
        const id=m[1],action=m[2];
        if(!action&&req.method==='GET') return json(store.analysis(id));
        if(action==='image'&&req.method==='POST') {const b=await body();return json(store.readAnalysisImage(id,b.item_id));}
        if(action==='observation'&&req.method==='POST') {const b=await body();return json(store.observe(id,b.item_id,b.observation,b.status));}
        if(action==='finalize'&&req.method==='POST') return json(store.finalize(id,(await body()).report));
        if(action==='report'&&req.method==='GET') {
          const a=store.analysis(id);if(!a.report) throw new Error('报告尚未完成。');
          const removed=a.items.filter(i=>i.deleted_at);
          const notice=removed.length?'\n\n## 原图状态更新\n\n'+removed.map(i=>`- 图片 ${i.ordinal}「${i.name}」已于 ${i.deleted_at} 永久删除，原分析文字保留。`).join('\n')+'\n':'';
          const b=Buffer.concat([readFileSync(join(store.reports,`${id}.md`)),Buffer.from(notice)]);res.writeHead(200,{...headers,'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="analysis-${id}.md"`});return res.end(b);
        }
      }
      if(route==='/api/backup'&&req.method==='POST') {
        const target=join(store.root,'backups',new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(target,{recursive:true});
        // The synchronous snapshot completes before another request can change membership or assets.
        store.db.prepare('VACUUM INTO ?').run(join(target,'library.sqlite'));
        cpSync(store.assets,join(target,'assets'),{recursive:true});cpSync(store.reports,join(target,'reports'),{recursive:true});
        cpSync(keyFile,join(target,'.connection-key'));
        return json({path:target,message:'已保存独立快照，包含图片、数据库和报告。'});
      }
      if(req.method!=='GET') return json({error:'没有这个操作。'},404);
      if(['/tag-picker.js','/tag-picker.css','/brand.svg','/wordmark.svg'].includes(route)){
        const path=join(PROJECT_ROOT,'extension',route.slice(1));const b=readFileSync(path);
        res.writeHead(200,{...headers,'Content-Type':route.endsWith('.js')?'text/javascript; charset=utf-8':route.endsWith('.css')?'text/css; charset=utf-8':'image/svg+xml'});return res.end(b);
      }
      const routes={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/demo':'demo.html','/demo.js':'demo.js'};
      const filename=routes[route];if(!filename) return json({error:'页面不存在。'},404);
      const b=readFileSync(join(PROJECT_ROOT,'public',filename));
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
      res.writeHead(200,{...headers,'Content-Type':types[extname(filename)],'Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(b);
    } catch(e) {json({error:e.message||'操作失败。'},400);}
  });
  server.requestTimeout=30000;
  server.on('close',()=>store.close());server.listen(port,'127.0.0.1');return {server,store,token};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server,store}=startServer();
  server.on('listening',()=>console.log(`Plka已启动：http://127.0.0.1:${server.address().port}\n数据目录：${store.root}\n关闭此窗口会停止本地服务。`));
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'本地端口已被占用。请检查图库是否已经启动。':e.message);process.exitCode=1;});
  for(const s of ['SIGINT','SIGTERM']) process.on(s,()=>server.close(()=>process.exit()));
}
