import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
export function imageType(b) {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['image/png','png'];
  if (b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return ['image/jpeg','jpg'];
  if (b.length > 12 && b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP') return ['image/webp','webp'];
  if (b.length > 6 && ['GIF87a','GIF89a'].includes(b.toString('ascii',0,6))) return ['image/gif','gif'];
  throw new Error('目前支持 PNG、JPEG、WebP、GIF 图片；不接受网页、SVG 或其他文件。');
}
const text = (v, max = 4000) => String(v ?? '').slice(0,max);
const url = v => { try { const u = new URL(v); return ['http:','https:'].includes(u.protocol) ? u.href.slice(0,12000) : ''; } catch { return ''; } };
const uid = () => randomUUID();

export class Store {
  constructor(root) {
    this.root = resolve(root); this.assets = join(this.root,'assets'); this.reports = join(this.root,'reports');
    mkdirSync(this.assets,{recursive:true}); mkdirSync(this.reports,{recursive:true});
    this.db = new DatabaseSync(join(this.root,'library.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,ext TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,name TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '[]',width INTEGER,height INTEGER,created_at TEXT NOT NULL,trashed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS memberships(item_id TEXT REFERENCES items(id) ON DELETE CASCADE,collection_id TEXT REFERENCES collections(id),PRIMARY KEY(item_id,collection_id));
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,item_id TEXT REFERENCES items(id),page_url TEXT NOT NULL,image_url TEXT NOT NULL,title TEXT NOT NULL,collected_at TEXT NOT NULL,UNIQUE(item_id,page_url,image_url));
      CREATE TABLE IF NOT EXISTS analyses(id TEXT PRIMARY KEY,collection_id TEXT REFERENCES collections(id),collection_name TEXT NOT NULL,brief TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,finished_at TEXT,report TEXT);
      CREATE TABLE IF NOT EXISTS analysis_items(run_id TEXT REFERENCES analyses(id),item_id TEXT REFERENCES items(id),ordinal INTEGER NOT NULL,read_at TEXT,observation TEXT,status TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(run_id,item_id));`);
    if (!this.db.prepare('PRAGMA table_info(collections)').all().some(c => c.name === 'deleted_at')) this.db.exec('ALTER TABLE collections ADD COLUMN deleted_at TEXT');
    if (!this.db.prepare('PRAGMA table_info(analysis_items)').all().some(c => c.name === 'snapshot_name')) {
      this.db.exec(`BEGIN;
        CREATE TABLE analysis_items_v2(run_id TEXT REFERENCES analyses(id),item_id TEXT NOT NULL,ordinal INTEGER NOT NULL,read_at TEXT,observation TEXT,status TEXT NOT NULL DEFAULT 'pending',snapshot_name TEXT NOT NULL,snapshot_mime TEXT NOT NULL,snapshot_size INTEGER NOT NULL,snapshot_sources TEXT NOT NULL DEFAULT '[]',deleted_at TEXT,PRIMARY KEY(run_id,item_id));
        INSERT INTO analysis_items_v2(run_id,item_id,ordinal,read_at,observation,status,snapshot_name,snapshot_mime,snapshot_size,snapshot_sources)
          SELECT a.run_id,a.item_id,a.ordinal,a.read_at,a.observation,a.status,COALESCE(i.name,'已永久删除'),COALESCE(i.mime,''),COALESCE(i.size,0),COALESCE((SELECT json_group_array(json_object('page_url',s.page_url,'title',s.title)) FROM sources s WHERE s.item_id=a.item_id),'[]') FROM analysis_items a LEFT JOIN items i ON i.id=a.item_id;
        DROP TABLE analysis_items;
        ALTER TABLE analysis_items_v2 RENAME TO analysis_items;
        COMMIT;`);
    }
  }
  close() { if(this.closedDB!==this.db){this.db.close();this.closedDB=this.db;} }
  tagCatalog(){
    const saved=this.db.prepare("SELECT value FROM preferences WHERE key='tag-catalog'").get();
    if(saved)return JSON.parse(saved.value);
    const defaults=['日系','极简','排版','配色','品牌','包装','空间','材质','插画','摄影'];
    const used=this.db.prepare('SELECT tags FROM items').all().flatMap(row=>JSON.parse(row.tags));
    return [...new Set([...defaults,...used])].slice(0,100);
  }
  saveTagCatalog(tags){
    if(!Array.isArray(tags)||tags.length>100||tags.some(t=>typeof t!=='string'||!t.trim()||t.trim().length>30))throw new Error('标签需为 1–30 个字，最多 100 个。');
    const result=[...new Set(tags.map(t=>t.trim()))];
    this.db.prepare("INSERT INTO preferences(key,value) VALUES('tag-catalog',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(result));return result;
  }
  collections() {
    return this.db.prepare(`SELECT c.*,COUNT(CASE WHEN i.trashed=0 THEN 1 END) AS count FROM collections c LEFT JOIN memberships m ON c.id=m.collection_id LEFT JOIN items i ON i.id=m.item_id WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.created_at`).all();
  }
  collection(id) { const c=this.db.prepare('SELECT * FROM collections WHERE id=? AND deleted_at IS NULL').get(id); if(!c) throw new Error('收藏夹不存在或已删除。'); return c; }
  createCollection(name) {
    name=text(name,80).trim(); if(!name) throw new Error('请填写收藏夹名称。');
    if(this.db.prepare('SELECT id FROM collections WHERE name=?').get(name)) throw new Error('已有同名收藏夹。');
    const c={id:uid(),name,created_at:new Date().toISOString()}; this.db.prepare('INSERT INTO collections(id,name,created_at) VALUES(?,?,?)').run(c.id,c.name,c.created_at); return c;
  }
  renameCollection(id,name) {
    this.collection(id); name=text(name,80).trim(); if(!name) throw new Error('名称不能为空。');
    if(this.db.prepare('SELECT id FROM collections WHERE name=? AND id<>?').get(name,id)) throw new Error('已有同名收藏夹。');
    this.db.prepare('UPDATE collections SET name=? WHERE id=?').run(name,id); return this.collection(id);
  }
  deleteCollection(id) {
    const c = this.collection(id);
    const rows = this.db.prepare('SELECT i.id,i.trashed FROM items i JOIN memberships m ON i.id=m.item_id WHERE m.collection_id=?').all(id);
    let moved = 0, shared = 0;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM memberships WHERE collection_id=?').run(id);
      for (const item of rows) {
        const other = this.db.prepare('SELECT COUNT(*) AS n FROM memberships m JOIN collections c ON c.id=m.collection_id WHERE m.item_id=? AND c.deleted_at IS NULL').get(item.id).n;
        if (other) { if (!item.trashed) shared++; }
        else if (!item.trashed) { this.db.prepare('UPDATE items SET trashed=1 WHERE id=?').run(item.id); moved++; }
      }
      this.db.prepare('UPDATE collections SET name=?,deleted_at=? WHERE id=?').run(c.name+' [已删除 '+id+']',new Date().toISOString(),id);
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
    return { deleted_collection: c.name, moved_to_trash: moved, shared_kept: shared };
  }
  purgeTrash({ ids = [], all = false, expected_count } = {}) {
    if(typeof all!=='boolean')throw new Error('清空参数无效。');
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || (!all && !ids.length)) throw new Error('请选择要永久删除的回收站图片。');
    if (all && ids.length) throw new Error('清空回收站不能同时指定图片。');
    const chosen = all ? this.db.prepare('SELECT id FROM items WHERE trashed=1').all().map(r=>r.id) : [...new Set(ids)];
    if (all && Number(expected_count) !== chosen.length) throw new Error('回收站数量已变化，请刷新后重新确认。');
    const rows = chosen.map(id => { const item=this.item(id);if(!item.trashed)throw new Error('只能永久删除回收站中的图片，未执行删除。');return item; });
    if (!rows.length) return { deleted: 0 };
    const staging = join(this.root,'.purge-staging',uid()); mkdirSync(staging,{recursive:true});
    const moved = []; let committed = false;
    try {
      for (const item of rows) if (existsSync(item.file_path)) {
        const path=join(staging,`${item.hash}.${item.ext}`);renameSync(item.file_path,path);moved.push({from:path,to:item.file_path});
      }
      this.db.exec('BEGIN');
      try {
        const now=new Date().toISOString();
        for (const item of rows) {
          this.db.prepare(`UPDATE analysis_items SET deleted_at=?,observation=CASE WHEN status='pending' THEN '图片已由用户永久删除，无法读取。' ELSE observation END,status=CASE WHEN status='pending' THEN 'unreadable' ELSE status END WHERE item_id=?`).run(now,item.id);
          this.db.prepare('DELETE FROM memberships WHERE item_id=?').run(item.id);
          this.db.prepare('DELETE FROM sources WHERE item_id=?').run(item.id);
          this.db.prepare('DELETE FROM items WHERE id=?').run(item.id);
        }
        this.db.exec('COMMIT'); committed=true;
      } catch(e) { this.db.exec('ROLLBACK'); throw e; }
      rmSync(staging,{recursive:true,force:true});
      return { deleted: rows.length };
    } catch(e) {
      if(!committed) { for (const file of moved) if(existsSync(file.from))renameSync(file.from,file.to);rmSync(staging,{recursive:true,force:true}); }
      throw new Error(committed?'索引已删除，但磁盘清理未完成：'+staging:e.message);
    }
  }
  item(id) {
    const row=this.db.prepare('SELECT * FROM items WHERE id=?').get(id); if(!row) throw new Error('图片不存在。');
    return {...row,tags:JSON.parse(row.tags),collections:this.db.prepare('SELECT collection_id FROM memberships WHERE item_id=?').all(id).map(r=>r.collection_id),sources:this.db.prepare('SELECT * FROM sources WHERE item_id=? ORDER BY collected_at').all(id),file_path:join(this.assets,`${row.hash}.${row.ext}`),image_url:`/media/${row.id}`};
  }
  list({collection_id='',q='',trashed=false,offset=0,limit=100,sort='newest'}={}) {
    const clauses=['i.trashed=?']; const args=[trashed ? 1 : 0];
    if(collection_id) { this.collection(collection_id); clauses.push('EXISTS(SELECT 1 FROM memberships m WHERE m.item_id=i.id AND m.collection_id=?)'); args.push(collection_id); }
    if(q) { clauses.push("(i.name LIKE ? ESCAPE '\\' OR i.note LIKE ? ESCAPE '\\' OR i.tags LIKE ? ESCAPE '\\')"); const s='%'+text(q,200).replace(/[\\%_]/g,'\\$&')+'%'; args.push(s,s,s); }
    offset=Math.max(0,Math.floor(Number(offset)||0)); limit=Math.min(200,Math.max(1,Math.floor(Number(limit)||100)));
    const where=clauses.join(' AND '); const total=this.db.prepare(`SELECT COUNT(*) AS n FROM items i WHERE ${where}`).get(...args).n;
    const order=sort==='oldest'?'i.created_at ASC':sort==='name'?'i.name COLLATE NOCASE ASC':'i.created_at DESC';
    const rows=this.db.prepare(`SELECT i.id FROM items i WHERE ${where} ORDER BY ${order},i.id LIMIT ? OFFSET ?`).all(...args,limit,offset);
    return {total,offset,limit,items:rows.map(r=>this.item(r.id))};
  }
  stats() { return this.db.prepare('SELECT COUNT(CASE WHEN trashed=0 THEN 1 END) AS active,COUNT(CASE WHEN trashed=1 THEN 1 END) AS trash,COALESCE(SUM(size),0) AS bytes FROM items').get(); }
  importImage(b,meta={}) {
    if(!b.length || b.length>MAX_IMAGE_BYTES) throw new Error('单张图片需小于 16 MB。');
    const [mime,ext]=imageType(b); const ids=[...new Set(Array.isArray(meta.collections)?meta.collections:[])]; ids.forEach(id=>this.collection(id));
    const hash=createHash('sha256').update(b).digest('hex'); const old=this.db.prepare('SELECT id FROM items WHERE hash=?').get(hash);
    const id=old?.id || uid(); const path=join(this.assets,`${hash}.${ext}`); const now=new Date().toISOString();
    if(!existsSync(path)) { const tmp=path+'.'+uid()+'.tmp'; writeFileSync(tmp,b); renameSync(tmp,path); }
    this.db.exec('BEGIN');
    try {
      if(!old) this.db.prepare('INSERT INTO items(id,hash,ext,mime,size,name,note,tags,width,height,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,hash,ext,mime,b.length,text(meta.name||'未命名图片',200),text(meta.note),JSON.stringify((Array.isArray(meta.tags)?meta.tags:[]).slice(0,30).map(t=>text(t,60))),Number(meta.width)||null,Number(meta.height)||null,now);
      else this.db.prepare('UPDATE items SET trashed=0 WHERE id=?').run(id);
      for(const c of ids) this.db.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?)').run(id,c);
      this.db.prepare('INSERT OR IGNORE INTO sources VALUES(?,?,?,?,?,?)').run(uid(),id,url(meta.page_url),url(meta.image_url),text(meta.page_title,500),now);
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
    return {item:this.item(id),duplicate:Boolean(old)};
  }
  updateItem(id,patch) {
    const old=this.item(id); const ids=patch.collections===undefined?old.collections:[...new Set(patch.collections)]; ids.forEach(c=>this.collection(c));
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE items SET name=?,note=?,tags=?,trashed=? WHERE id=?').run(text(patch.name??old.name,200),text(patch.note??old.note),JSON.stringify((patch.tags??old.tags).slice(0,30).map(t=>text(t,60))),patch.trashed===undefined?old.trashed:(patch.trashed?1:0),id);
      this.db.prepare('DELETE FROM memberships WHERE item_id=?').run(id); for(const c of ids) this.db.prepare('INSERT INTO memberships VALUES(?,?)').run(id,c);
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; } return this.item(id);
  }
  beginAnalysis(collection_id,brief) {
    const c=this.collection(collection_id); const items=this.db.prepare('SELECT i.id FROM items i JOIN memberships m ON m.item_id=i.id WHERE m.collection_id=? AND i.trashed=0 ORDER BY i.created_at,i.id').all(collection_id);
    if(!items.length) throw new Error('这个收藏夹还没有图片。');
    const id=uid(); this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO analyses(id,collection_id,collection_name,brief,created_at) VALUES(?,?,?,?,?)').run(id,c.id,c.name,text(brief,8000),new Date().toISOString());
      items.forEach((it,n)=>{const image=this.item(it.id);this.db.prepare('INSERT INTO analysis_items(run_id,item_id,ordinal,snapshot_name,snapshot_mime,snapshot_size,snapshot_sources) VALUES(?,?,?,?,?,?,?)').run(id,it.id,n+1,image.name,image.mime,image.size,JSON.stringify(image.sources));}); this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; } return this.analysis(id);
  }
  analysis(id) {
    const a=this.db.prepare('SELECT * FROM analyses WHERE id=?').get(id); if(!a) throw new Error('分析任务不存在。');
    const items=this.db.prepare('SELECT a.*,COALESCE(i.name,a.snapshot_name) AS name,COALESCE(i.mime,a.snapshot_mime) AS mime,COALESCE(i.size,a.snapshot_size) AS size FROM analysis_items a LEFT JOIN items i ON i.id=a.item_id WHERE a.run_id=? ORDER BY a.ordinal').all(id);
    const counts={total:items.length,analyzed:items.filter(i=>i.status==='analyzed').length,unreadable:items.filter(i=>i.status==='unreadable').length,pending:items.filter(i=>i.status==='pending').length};
    return {...a,counts,items};
  }
  analyses() { return this.db.prepare('SELECT id FROM analyses ORDER BY created_at DESC').all().map(a=>this.analysis(a.id)); }
  readAnalysisImage(run_id,item_id) {
    const a=this.analysis(run_id); if(a.status!=='pending') throw new Error('此任务已结束。');
    if(!a.items.some(i=>i.item_id===item_id)) throw new Error('图片不在本次分析清单中。');
    if(a.items.find(i=>i.item_id===item_id).deleted_at)throw new Error('图片已被永久删除，请使用已记录的失败说明。');
    const item=this.item(item_id); const b=readFileSync(item.file_path); imageType(b);
    this.db.prepare('UPDATE analysis_items SET read_at=? WHERE run_id=? AND item_id=?').run(new Date().toISOString(),run_id,item_id);
    return {item,data:b.toString('base64'),mimeType:item.mime};
  }
  observe(run_id,item_id,observation,status='analyzed') {
    const a=this.analysis(run_id); if(a.status!=='pending') throw new Error('此任务已结束。');
    const it=a.items.find(i=>i.item_id===item_id); if(!it) throw new Error('图片不在本次分析清单中。');
    if(!['analyzed','unreadable'].includes(status)) throw new Error('无效的图片状态。');
    if(status==='analyzed'&&!it.read_at) throw new Error('请先读取图片，再记录分析。');
    if(status==='analyzed'&&it.deleted_at)throw new Error('图片已永久删除，不能重新标记为已分析。');
    if(!text(observation).trim()) throw new Error('请填写观察内容或失败原因。');
    this.db.prepare('UPDATE analysis_items SET observation=?,status=? WHERE run_id=? AND item_id=?').run(text(observation,16000),status,run_id,item_id); return this.analysis(run_id);
  }
  finalize(run_id,report) {
    const a=this.analysis(run_id); if(a.status!=='pending') throw new Error('此任务已结束。');
    if(a.counts.pending) throw new Error(`还有 ${a.counts.pending} 张图片未记录分析结果。`);
    if(!text(report).trim()) throw new Error('综合报告不能为空。');
    const status=a.counts.unreadable?'partial':'complete'; const body=text(report,150000);
    const path=join(this.reports,`${a.id}.md`);
    const content=`# ${a.collection_name} · 设计参考分析\n\n分析目标：${a.brief}\n\n覆盖：${a.counts.total} 张；已分析 ${a.counts.analyzed} 张；无法读取 ${a.counts.unreadable} 张。\n\n${body}\n\n## 逐图记录\n\n`+a.items.map(it=>{const sources=JSON.parse(it.snapshot_sources);return `### ${it.ordinal}. ${it.name}\n\n- 图片 ID：${it.item_id}\n- 状态：${it.status}${it.deleted_at?'（原图已永久删除）':''}\n- 来源：${sources.map(s=>s.page_url).filter(Boolean).join('；')||'本地导入或未提供'}\n\n${it.observation}\n`;}).join('\n');
    writeFileSync(path+'.tmp',content); renameSync(path+'.tmp',path);
    this.db.prepare('UPDATE analyses SET status=?,report=?,finished_at=? WHERE id=?').run(status,body,new Date().toISOString(),run_id);
    return {...this.analysis(run_id),report_path:path};
  }
}
