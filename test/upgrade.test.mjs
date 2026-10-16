import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {resolveDataDir,rememberDataDir} from '../lib/config.mjs';
import {backupBeforeUpgrade,markVersion} from '../lib/upgrade.mjs';
import {Store} from '../lib/store.mjs';
import {png} from './fixtures.mjs';
test('upgrades reuse the original library across application folders and refuse a missing library',t=>{
 const root=mkdtempSync(join(tmpdir(),'plka-path-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const old=join(root,'old','data'),options={appRoot:join(root,'old'),home:root,platform:'win32',env:{PIKA_CONFIG_DIR:join(root,'settings')}};
 mkdirSync(old,{recursive:true});writeFileSync(join(old,'library.sqlite'),'fixture');
 assert.equal(resolveDataDir(options),old);rememberDataDir(old,options);
 assert.equal(resolveDataDir({...options,appRoot:join(root,'new')}),old);
 assert.equal(resolveDataDir({...options,env:{...options.env,REFERENCE_DATA_DIR:join(root,'explicit')}}),join(root,'explicit'));
 rmSync(old,{recursive:true});assert.throws(()=>resolveDataDir(options),/不会创建空图库/);
});
test('pre-upgrade backup retains originals, connection key and item relationships',t=>{
 const root=mkdtempSync(join(tmpdir(),'plka-backup-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const store=new Store(root),folder=store.createCollection('旧收藏夹'),item=store.importImage(png,{collections:[folder.id],tags:['旧标签']}).item;
 writeFileSync(join(root,'.connection-key'),'existing-local-key');store.close();
 const backup=backupBeforeUpgrade(root);assert.ok(backup);assert.equal(readFileSync(join(backup,'.connection-key'),'utf8'),'existing-local-key');
 const restored=new Store(backup);assert.equal(restored.collections()[0].name,'旧收藏夹');assert.deepEqual(restored.item(item.id).tags,['旧标签']);assert.deepEqual(readFileSync(restored.item(item.id).file_path),png);restored.close();
 markVersion(root);assert.equal(backupBeforeUpgrade(root),null);assert.ok(existsSync(join(root,'assets',item.hash+'.png')));
});
test('tag palette persists additions and deletions without rewriting existing image tags',t=>{
 const root=mkdtempSync(join(tmpdir(),'plka-tags-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let store=new Store(root);
 const item=store.importImage(png,{tags:['日系']}).item;assert.ok(store.tagCatalog().includes('日系'));store.saveTagCatalog(['自定义','排版']);store.close();
 store=new Store(root);assert.deepEqual(store.tagCatalog(),['自定义','排版']);assert.deepEqual(store.item(item.id).tags,['日系']);assert.throws(()=>store.saveTagCatalog(['a'.repeat(31)]));store.close();
});
