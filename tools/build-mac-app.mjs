import { mkdirSync, readFileSync, writeFileSync, renameSync, cpSync, rmSync, chmodSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {buildDesktop} from './build-mac-desktop.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
export function makeMacApp(destination){
  const app=join(destination,'Plka.app');
  const macos=join(app,'Contents','MacOS'),resources=join(app,'Contents','Resources');mkdirSync(macos,{recursive:true});mkdirSync(resources,{recursive:true});
  const version=JSON.parse(readFileSync(join(destination,'package.json'),'utf8')).version;
  writeFileSync(join(app,'Contents','Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Plka</string><key>CFBundleIdentifier</key><string>com.plka.desktop</string><key>CFBundleName</key><string>Plka</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>${version}</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleIconFile</key><string>Plka.icns</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>LSApplicationCategoryType</key><string>public.app-category.graphics-design</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);
  buildDesktop(join(macos,'Plka'),join(destination,'.launcher-build'));
  const payload=join(app,'Contents','Resources','plka');mkdirSync(payload,{recursive:true});
  for(const name of ['package.json','server.mjs','launcher.mjs','mcp.mjs','lib','public','extension','skills','tools','runtime']){
    if(name==='extension')cpSync(join(destination,name),join(payload,name),{recursive:true});
    else renameSync(join(destination,name),join(payload,name));
  }
  cpSync(join(destination,'使用说明.html'),join(resources,'使用说明.html'));
  // Ordinary users see an application, not an unpacked runtime and scripts.
  for(const name of ['extension','1-Start.command','2-Install-Codex-Skill.command','3-Stop.command','4-Open-Extension-Folder.command','5-Open-Library-Data.command','6-Connect-Existing-Library.command'])rmSync(join(destination,name),{recursive:true,force:true});
  const iconset=join(destination,'.plka-icon.iconset');mkdirSync(iconset);
  const images=spawnSync(process.env.PLKA_BUILD_PYTHON||'python3',[join(root,'tools','render-mac-icons.py'),join(root,'extension','icons','128.png'),iconset,resources],{encoding:'utf8'});
  if(images.status!==0)throw new Error('App icon rendering failed: '+images.stderr);
  const icon=join(resources,'Plka.icns');
  const converted=spawnSync('/usr/bin/iconutil',['-c','icns','-o',icon,iconset],{encoding:'utf8'});
  if(converted.status!==0)throw new Error('App icon conversion failed: '+converted.stderr);
  rmSync(iconset,{recursive:true,force:true});
  // Re-sign the assembled native app ad hoc. This is integrity signing, not notarization.
  const signed=spawnSync('/usr/bin/codesign',['--force','--sign','-',app],{encoding:'utf8'});
  if(signed.status!==0)throw new Error('App integrity signing failed: '+signed.stderr);
  return app;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(makeMacApp(resolve(process.argv[2])));
