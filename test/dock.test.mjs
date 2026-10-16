import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openLibrary,LIBRARY_URL} from '../extension/library-link.js';
import {syncDockRegistration,DOCK_SCRIPT_ID} from '../extension/dock-settings.js';
const online=async()=>({ok:true,json:async()=>({ok:true,version:'0.3.2'})});
function browser(tabs=[]){const calls=[];return {calls,runtime:{getURL:file=>'chrome-extension://test/'+file},tabs:{query:async()=>tabs,update:async(id,options)=>{calls.push(['update',id,options]);return {id,windowId:2};},create:async options=>{calls.push(['create',options]);return {id:10,windowId:2};}},windows:{update:async(...args)=>calls.push(['focus',...args])}};}
test('floating shortcut focuses an existing library without reloading it',async()=>{
 const api=browser([{id:5,url:LIBRARY_URL,windowId:2}]);const result=await openLibrary(api,online);
 assert.equal(result.online,true);assert.deepEqual(api.calls[0],['update',5,{active:true}]);assert.ok(!api.calls.some(c=>c[0]==='create'));
});
test('offline shortcut opens a useful guide and reuses it on the next attempt',async()=>{
 const api=browser();const offline=async()=>{throw new Error('offline');};assert.equal((await openLibrary(api,offline)).online,false);assert.match(api.calls[0][1].url,/library-offline.html$/);
 const reused=browser([{id:4,url:'chrome-extension://test/library-offline.html'}]);await openLibrary(reused,online);assert.deepEqual(reused.calls[0],['update',4,{url:LIBRARY_URL,active:true}]);
});
function settings({enabled=true,granted=true,registered=[]}={}){const calls=[];return {calls,storage:{local:{get:async()=>({dockEverywhere:enabled})}},permissions:{contains:async()=>granted},tabs:{query:async()=>[{id:1,url:'https://example.com/'},{id:2,url:'https://ph.pinterest.com/pin/1'},{id:3,url:'chrome://settings'}]},scripting:{getRegisteredContentScripts:async()=>registered,registerContentScripts:async entries=>calls.push(['register',entries]),unregisterContentScripts:async filter=>calls.push(['unregister',filter]),executeScript:async input=>calls.push(['inject',input])}};}
test('all-webpage shortcut registration requires opt-in and permission',async()=>{
 const denied=settings({granted:false});assert.equal((await syncDockRegistration(denied)).enabled,false);assert.equal(denied.calls.length,0);
 const api=settings();assert.equal((await syncDockRegistration(api)).enabled,true);assert.equal(api.calls[0][1][0].id,DOCK_SCRIPT_ID);assert.deepEqual(api.calls[1][1].files,['dock.js']);assert.equal(api.calls.filter(c=>c[0]==='inject').length,1);
});
test('disabling all-webpage shortcut removes only its registration and ordinary-page dock',async()=>{
 const api=settings({enabled:false,registered:[{id:DOCK_SCRIPT_ID}]});assert.equal((await syncDockRegistration(api)).enabled,false);assert.deepEqual(api.calls[0],['unregister',{ids:[DOCK_SCRIPT_ID]}]);assert.equal(api.calls.filter(c=>c[0]==='inject').length,1);assert.equal(api.calls[1][1].target.tabId,1);
});
