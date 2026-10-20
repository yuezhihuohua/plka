import {existsSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {configDir} from './config.mjs';
const marker='Plka managed login startup';
const xml=s=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function loginStart({platform=process.platform,home=homedir(),env=process.env}={},enabled){
  const config=configDir({platform,home,env});let record;
  try{record=JSON.parse(readFileSync(join(config,'desktop-installation.json'),'utf8'));}catch{}
  const mac=platform==='darwin',win=platform==='win32';
  const path=mac?join(home,'Library/LaunchAgents/com.plka.login.plist'):win?join(env.APPDATA||join(home,'AppData/Roaming'),'Microsoft/Windows/Start Menu/Programs/Startup/Plka-background.vbs'):'';
  const supported=Boolean((mac&&record?.desktopApp&&existsSync(join(record.desktopApp,'Contents/MacOS/Plka')))||(win&&record?.nodePath&&existsSync(record.nodePath)));
  const prior=path&&existsSync(path)?readFileSync(path,'utf8'):'';
  if(enabled!==undefined){
    if(typeof enabled!=='boolean'||!supported)throw new Error('请先安装 Plka 应用，再设置登录启动。');
    if(prior&&!prior.includes(marker))throw new Error('已有其他启动配置，未替换。');
    if(!enabled)rmSync(path,{force:true});
    else {
      mkdirSync(dirname(path),{recursive:true});let content;
      if(mac){content=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><!-- ${marker} --><key>Label</key><string>com.plka.login</string><key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-g</string><string>${xml(record.desktopApp)}</string><string>--args</string><string>--background</string></array><key>RunAtLoad</key><true/></dict></plist>`;}
      else {const quote=s=>'"'+s+'"',command=quote(record.nodePath)+' '+quote(join(record.appRoot,'tools/desktop-entry.mjs'))+' --installed --no-open';content="' "+marker+'\r\nCreateObject("WScript.Shell").Run "'+command.replaceAll('"','""')+'", 0, False\r\n';}
      writeFileSync(path,content,{mode:0o600});
    }
  }
  return {supported,enabled:enabled??Boolean(prior.includes(marker)),platform};
}
