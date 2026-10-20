// Builds a native AppKit/WKWebView executable. No bundled browser or UI framework.
import {mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
export function buildDesktop(output,build){
  mkdirSync(build,{recursive:true});
  const stub=(name,install,symbols)=>writeFileSync(join(build,(name.startsWith('lib')?name:'lib'+name)+'.tbd'),`--- !tapi-tbd-v3\narchs: [ x86_64, arm64 ]\nplatform: macosx\ninstall-name: '${install}'\ncurrent-version: 1.0.0\ncompatibility-version: 1.0.0\nexports:\n  - archs: [ x86_64, arm64 ]\n    symbols: [ ${symbols.join(', ')} ]\n...\n`);
  stub('libSystem','/usr/lib/libSystem.B.dylib',['__Block_object_assign','__Block_object_dispose','__NSConcreteStackBlock','___stack_chk_fail','___stack_chk_guard','___chkstk_darwin','____chkstk_darwin','dyld_stub_binder']);
  stub('libobjc','/usr/lib/libobjc.A.dylib',['__objc_empty_cache',...['alloc','autoreleasePoolPop','autoreleasePoolPush','autoreleaseReturnValue','getProperty','msgSend','opt_class','opt_new','opt_isKindOfClass','release','retain','retainAutoreleasedReturnValue','setProperty_atomic','storeStrong','unsafeClaimAutoreleasedReturnValue','destroyWeak','initWeak','loadWeakRetained','copyWeak'].map(s=>'_objc_'+s)]);
  const classSymbols=(names)=>names.flatMap(name=>['_OBJC_CLASS_$_'+name,'_OBJC_METACLASS_$_'+name]);
  stub('Foundation','/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation',['_NSSelectorFromString',...classSymbols(['NSArray','NSBundle','NSDictionary','NSHTTPCookie','NSJSONSerialization','NSMutableURLRequest','NSNumber','NSObject','NSOperationQueue','NSPipe','NSProcessInfo','NSString','NSTask','NSTimer','NSURL','NSURLRequest','NSURLSession','NSUserDefaults'])]);
  stub('CoreFoundation','/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation',['___CFConstantStringClassReference','___NSDictionary0__']);
  stub('AppKit','/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit',['_NSPasteboardTypeString',...classSymbols(['NSAlert','NSApplication','NSImage','NSMenu','NSMenuItem','NSOpenPanel','NSPasteboard','NSSavePanel','NSStatusBar','NSWindow','NSWorkspace'])]);
  stub('WebKit','/System/Library/Frameworks/WebKit.framework/Versions/A/WebKit',classSymbols(['WKUserScript','WKWebView','WKWebViewConfiguration']));
  const cc=spawnSync('/usr/bin/clang',['--version'],{encoding:'utf8'}).status===0?['/usr/bin/clang']:['/usr/bin/arch','-x86_64','/usr/bin/clang'];
  const slices=[];
  for(const arch of ['x86_64','arm64']){
    const path=join(build,arch);let result;
    for(const minimum of ['13.0','10.15']){
      result=spawnSync(cc[0],[...cc.slice(1),'-target',arch+'-apple-macosx'+minimum,'-DPLKA_MINIMAL_SDK','-fobjc-arc','-fblocks','-nostdlib','-Wl,-e,_main','-Wl,-pie','-L'+build,'-lSystem','-lobjc','-lFoundation','-lCoreFoundation','-lAppKit','-lWebKit',join(root,'tools','mac-desktop.m'),'-o',path],{encoding:'utf8'});
      if(result.status===0)break;
    }
    if(result.status!==0)throw new Error('Native desktop compilation failed: '+result.stderr);
    slices.push(readFileSync(path));
  }
  const align=16384,offsets=[align,Math.ceil((align+slices[0].length)/align)*align],binary=Buffer.alloc(offsets[1]+slices[1].length);
  binary.writeUInt32BE(0xcafebabe,0);binary.writeUInt32BE(2,4);
  for(let i=0;i<2;i++){const p=8+i*20;binary.writeUInt32BE(slices[i].readUInt32LE(4),p);binary.writeUInt32BE(slices[i].readUInt32LE(8),p+4);binary.writeUInt32BE(offsets[i],p+8);binary.writeUInt32BE(slices[i].length,p+12);binary.writeUInt32BE(14,p+16);slices[i].copy(binary,offsets[i]);}
  writeFileSync(output,binary);chmodSync(output,0o755);rmSync(build,{recursive:true,force:true});
}
