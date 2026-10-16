import { mkdirSync, readFileSync, writeFileSync, renameSync, cpSync, rmSync, chmodSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
export function makeMacApp(destination){
  const app=join(destination,'Plka.app');
  const macos=join(app,'Contents','MacOS'),resources=join(app,'Contents','Resources');mkdirSync(macos,{recursive:true});mkdirSync(resources,{recursive:true});
  const version=JSON.parse(readFileSync(join(destination,'package.json'),'utf8')).version;
  writeFileSync(join(app,'Contents','Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Plka</string><key>CFBundleIdentifier</key><string>com.plka.desktop</string><key>CFBundleName</key><string>Plka</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>${version}</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleIconFile</key><string>Plka.icns</string><key>LSMinimumSystemVersion</key><string>11.0</string><key>LSUIElement</key><true/><key>NSHighResolutionCapable</key><true/></dict></plist>`);
  const build=join(destination,'.launcher-build');mkdirSync(build);cpSync(join(root,'tools','mac-libSystem.tbd'),join(build,'libSystem.tbd'));
  const cc=spawnSync('/usr/bin/clang',['--version'],{encoding:'utf8'}).status===0?['/usr/bin/clang']:['/usr/bin/arch','-x86_64','/usr/bin/clang'];
  const slices=[];
  for(const arch of ['x86_64','arm64']){
    const output=join(build,arch);let result;
    for(const minimum of ['11.0','10.15']){
      result=spawnSync(cc[0],[...cc.slice(1),'-target',arch+'-apple-macosx'+minimum,'-nostdlib','-Wl,-e,_main','-Wl,-pie','-L'+build,'-lSystem',join(root,'tools','mac-launcher.c'),'-o',output],{encoding:'utf8'});
      if(result.status===0)break;
    }
    if(result.status!==0)throw new Error('Cannot build compatible Mac launcher: '+result.stderr);
    slices.push(readFileSync(output));
  }
  // Build a universal Mach-O, without requiring lipo or a particular SDK version.
  const alignment=16384,offsets=[alignment,Math.ceil((alignment+slices[0].length)/alignment)*alignment];
  const executable=Buffer.alloc(offsets[1]+slices[1].length);executable.writeUInt32BE(0xcafebabe,0);executable.writeUInt32BE(2,4);
  for(let i=0;i<2;i++){const p=8+i*20;executable.writeUInt32BE(slices[i].readUInt32LE(4),p);executable.writeUInt32BE(slices[i].readUInt32LE(8),p+4);executable.writeUInt32BE(offsets[i],p+8);executable.writeUInt32BE(slices[i].length,p+12);executable.writeUInt32BE(14,p+16);slices[i].copy(executable,offsets[i]);}
  writeFileSync(join(macos,'Plka'),executable);chmodSync(join(macos,'Plka'),0o755);rmSync(build,{recursive:true,force:true});
  const payload=join(app,'Contents','Resources','plka');mkdirSync(payload,{recursive:true});
  for(const name of ['package.json','server.mjs','launcher.mjs','mcp.mjs','lib','public','extension','skills','tools','runtime']){
    if(name==='extension')cpSync(join(destination,name),join(payload,name),{recursive:true});
    else renameSync(join(destination,name),join(payload,name));
  }
  // Leave maintenance scripts functional; everyday entry is Plka.app.
  for(const name of ['1-Start.command','2-Install-Codex-Skill.command','3-Stop.command','5-Open-Library-Data.command','6-Connect-Existing-Library.command']){
    const path=join(destination,name);let text=readFileSync(path,'utf8');
    text=text.replaceAll('"./runtime/bin/node"','"./Plka.app/Contents/Resources/plka/runtime/bin/node"').replaceAll(' tools/',' "./Plka.app/Contents/Resources/plka/tools/');
    // Quoting a script pathname needs a matching quote before its arguments.
    text=text.replace(/(\.mjs)(?=\s|\))/g,'$1"');
    writeFileSync(path,text);
  }
  const iconset=join(destination,'.plka-icon.iconset');mkdirSync(iconset);
  const py=`from PIL import Image\nfrom pathlib import Path\ni=Image.open(${JSON.stringify(join(root,'extension','icons','128.png'))}).convert('RGBA')\np=Path(${JSON.stringify(iconset)})\nfor n in [16,32,128,256,512]:\n for scale in [1,2]:\n  i.resize((n*scale,n*scale),Image.Resampling.LANCZOS).save(p/('icon_'+str(n)+'x'+str(n)+('@2x' if scale==2 else '')+'.png'))\n`;
  const images=spawnSync('python3',['-c',py],{encoding:'utf8'});
  if(images.status===0){const icon=join(app,'Contents','Resources','Plka.icns');spawnSync('/usr/bin/iconutil',['-c','icns','-o',icon,iconset],{stdio:'ignore'});}
  rmSync(iconset,{recursive:true,force:true});
  // Re-sign the assembled native app ad hoc. This is integrity signing, not notarization.
  const signed=spawnSync('/usr/bin/codesign',['--force','--sign','-',app],{encoding:'utf8'});
  if(signed.status!==0)throw new Error('App integrity signing failed: '+signed.stderr);
  return app;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(makeMacApp(resolve(process.argv[2])));
