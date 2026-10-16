import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../lib/store.mjs';
import { png } from './fixtures.mjs';
function fixture(t) { const root=mkdtempSync(join(tmpdir(),'reference-delete-'));const s=new Store(root);t.after(()=>{s.close();rmSync(root,{recursive:true,force:true});});return s; }
test('delete collection trashes exclusively-owned images and preserves other collections',t=>{
 const s=fixture(t),a=s.createCollection('待删收藏夹'),b=s.createCollection('保留收藏夹');
 const exclusive=s.importImage(png,{collections:[a.id]}).item;
 const shared=s.importImage(Buffer.concat([png,Buffer.from('shared')]),{collections:[a.id,b.id]}).item;
 const result=s.deleteCollection(a.id);
 assert.equal(result.moved_to_trash,1);assert.equal(result.shared_kept,1);assert.equal(s.collections().length,1);
 assert.equal(s.item(exclusive.id).trashed,1);assert.equal(s.item(shared.id).trashed,0);assert.deepEqual(s.item(shared.id).collections,[b.id]);assert.equal(existsSync(exclusive.file_path),true);
 assert.equal(s.createCollection('待删收藏夹').name,'待删收藏夹');s.updateItem(exclusive.id,{trashed:false});assert.equal(s.item(exclusive.id).trashed,0);
});
test('purge enforces trash-only selection and count confirmation, deletes files, preserves analysis history',t=>{
 const s=fixture(t),c=s.createCollection('分析记录');const a=s.importImage(png,{name:'原图',collections:[c.id]}).item;
 const active=s.importImage(Buffer.concat([png,Buffer.from('active')]),{collections:[c.id]}).item;
 const run=s.beginAnalysis(c.id,'测试删除历史');s.updateItem(a.id,{trashed:true});
 assert.throws(()=>s.purgeTrash({ids:[a.id,active.id]}),/只能永久删除/);assert.equal(existsSync(a.file_path),true);
 assert.throws(()=>s.purgeTrash({all:true,expected_count:2}),/数量已变化/);
 assert.deepEqual(s.purgeTrash({ids:[a.id]}),{deleted:1});assert.equal(existsSync(a.file_path),false);assert.throws(()=>s.item(a.id));
 const snapshot=s.analysis(run.id),removed=snapshot.items.find(item=>item.item_id===a.id);assert.equal(snapshot.counts.total,2);assert.equal(removed.name,'原图');assert.equal(removed.status,'unreadable');assert.ok(removed.deleted_at);
 s.readAnalysisImage(run.id,active.id);s.observe(run.id,active.id,'测试观察','analyzed');const report=s.finalize(run.id,'一张已删除，不能分析其内容。');assert.equal(report.status,'partial');assert.equal(report.counts.total,2);
 s.updateItem(active.id,{trashed:true});assert.equal(s.purgeTrash({all:true,expected_count:1}).deleted,1);assert.equal(s.stats().trash,0);assert.equal(s.analysis(run.id).counts.total,2);
 const again=s.importImage(png,{collections:[c.id]}).item;assert.notEqual(again.id,a.id);assert.equal(existsSync(again.file_path),true);
});
test('legacy database migration retains observations and permits permanent deletion',t=>{
 const root=mkdtempSync(join(tmpdir(),'reference-migrate-'));const d=new DatabaseSync(join(root,'library.sqlite'));
 d.exec(`CREATE TABLE collections(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
 CREATE TABLE items(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,ext TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,name TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '[]',width INTEGER,height INTEGER,created_at TEXT NOT NULL,trashed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE analyses(id TEXT PRIMARY KEY,collection_id TEXT REFERENCES collections(id),collection_name TEXT NOT NULL,brief TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,finished_at TEXT,report TEXT);
 CREATE TABLE analysis_items(run_id TEXT REFERENCES analyses(id),item_id TEXT REFERENCES items(id),ordinal INTEGER NOT NULL,read_at TEXT,observation TEXT,status TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(run_id,item_id));
 INSERT INTO collections VALUES('old-folder','旧收藏夹','2026-01-01');
 INSERT INTO items(id,hash,ext,mime,size,name,created_at,trashed) VALUES('old-image','old-hash','png','image/png',10,'旧图片','2026-01-01',1);
 INSERT INTO analyses(id,collection_id,collection_name,brief,created_at) VALUES('old-run','old-folder','旧收藏夹','保留进度','2026-01-01');
 INSERT INTO analysis_items VALUES('old-run','old-image',1,NULL,NULL,'pending');`);d.close();
 const s=new Store(root);t.after(()=>{s.close();rmSync(root,{recursive:true,force:true});});assert.equal(s.analysis('old-run').counts.total,1);s.purgeTrash({ids:['old-image']});assert.equal(s.analysis('old-run').items[0].name,'旧图片');assert.equal(s.analysis('old-run').counts.unreadable,1);
});
