import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../lib/store.mjs';
import {png} from './fixtures.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'reference-test-'));const s=new Store(root);t.after(()=>{s.close();rmSync(root,{recursive:true,force:true});});return s;}
test('collection membership, exact-byte deduplication and source history survive restart',t=>{
 const s=fixture(t),a=s.createCollection('入口'),b=s.createCollection('材质');
 const first=s.importImage(png,{name:'参考',collections:[a.id],page_url:'https://example.com/one',note:'收藏意图'});
 const second=s.importImage(png,{collections:[b.id],page_url:'https://example.com/two'});
 assert.equal(second.duplicate,true);assert.equal(first.item.id,second.item.id);assert.deepEqual(new Set(second.item.collections),new Set([a.id,b.id]));assert.equal(second.item.sources.length,2);assert.equal(second.item.note,'收藏意图');
 const root=s.root;s.close();s.db=new Store(root).db;
 assert.equal(s.list({collection_id:a.id}).total,1);assert.equal(s.item(first.item.id).sources.length,2);assert.equal(existsSync(first.item.file_path),true);
});
test('invalid imports do not create entries; trash is reversible',t=>{const s=fixture(t),c=s.createCollection('测试');assert.throws(()=>s.importImage(Buffer.from('<html>oops</html>'),{collections:[c.id]}));assert.throws(()=>s.importImage(png,{collections:['missing']}));assert.equal(s.list().total,0);const {item}=s.importImage(png,{collections:[c.id]});s.updateItem(item.id,{trashed:true});assert.equal(s.list().total,0);assert.equal(s.list({trashed:true}).total,1);s.updateItem(item.id,{trashed:false});assert.equal(s.collections()[0].count,1);});
test('analysis completion requires per-image read and observation, handles failures explicitly',t=>{const s=fixture(t),c=s.createCollection('设计研究');const a=s.importImage(png,{name:'A',collections:[c.id]}).item;const b=s.importImage(Buffer.concat([png,Buffer.from('extra')]),{name:'B',collections:[c.id]}).item;const run=s.beginAnalysis(c.id,'比较材质');assert.equal(run.counts.total,2);assert.throws(()=>s.observe(run.id,a.id,'观察','analyzed'),/先读取/);assert.throws(()=>s.finalize(run.id,'报告'),/未记录/);const image=s.readAnalysisImage(run.id,a.id);assert.equal(image.data,png.toString('base64'));s.observe(run.id,a.id,'观察：浅色。解释：轻盈。建议：结合项目验证。','analyzed');s.observe(run.id,b.id,'文件损坏，无法解码。','unreadable');const result=s.finalize(run.id,'部分完成，不能将无法读取图片作为结论依据。');assert.equal(result.status,'partial');assert.equal(result.counts.analyzed,1);assert.equal(existsSync(result.report_path),true);assert.throws(()=>s.observe(run.id,a.id,'不能改','analyzed'),/已结束/);});
test('analysis snapshot stays fixed after later imports',t=>{const s=fixture(t),c=s.createCollection('快照');s.importImage(png,{collections:[c.id]});const run=s.beginAnalysis(c.id,'观察');const newer=s.importImage(Buffer.concat([png,Buffer.from('new')]),{collections:[c.id]}).item;assert.equal(s.analysis(run.id).counts.total,1);assert.throws(()=>s.readAnalysisImage(run.id,newer.id),/不在本次/);});
