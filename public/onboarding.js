const $=s=>document.querySelector(s);
export function setupGuide({api,post,toast,newFolder,importFiles,codexSkill,refresh}){
  let info,checking;
  const dialog=$('#setup-guide'),body=$('#setup-content');
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn,cls='')=>{const b=node('button',cls,text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){toast(e.message);}finally{b.disabled=false;}};return b;};
  const close=()=>{clearInterval(checking);dialog.close();};
  function browser(path){if(window.plkaDesktop)window.webkit.messageHandlers.plka.postMessage({type:'open-browser',path});else window.open(path,'_blank','noopener');}
  async function getInfo(){info=await api('/onboarding');$('#setup-banner').classList.toggle('hidden',info.dismissed||info.hasImages);}
  function card(number,title,description,done=false){const row=node('section','setup-step'+(done?' done':'')),num=node('span','step-number',done?'✓':String(number)),content=node('div','step-content');content.append(node('h3','',title),node('p','',description));row.append(num,content);body.append(row);return content;}
  async function render(){
    await getInfo();body.replaceChildren();
    card(1,'你的本地图库已准备好','图片保存在自己的电脑上。无需注册 Plka 账号，也不用填写连接码。',true);
    const step=card(2,'选择一种网页收藏入口','油猴版适合先试用；已有 Plka Chrome 扩展的用户可继续使用。两种入口任选一个。');
    const options=node('div','setup-options'),oil=node('article','setup-option preferred');oil.append(node('span','option-badge','油猴试用版'),node('h4','','通过 Tampermonkey 收藏'),node('p','','先装油猴，再点链接安装 Plka 脚本，不用手动选择扩展文件夹。'));
    const ordered=node('ol','setup-instructions');
    const one=node('li');const link=node('a','','安装 Tampermonkey ↗');link.href='https://www.tampermonkey.net/';link.target='_blank';link.rel='noopener noreferrer';one.append(link,'；已有油猴可跳过。');
    const two=node('li','','在 Chrome 的油猴扩展详情中开启“允许用户脚本”。首次下载图片时，按油猴提示允许访问图片域名和本机图库。');
    const three=node('li');three.append(button('安装 Plka 油猴脚本 ↗',()=>browser('/userscript/plka.user.js'),'primary setup-install'));
    ordered.append(one,two,three);oil.append(ordered,node('p','setup-note','安装与权限由浏览器确认。本脚本仅在 Pinterest、小红书、花瓣及 Plka 测试页运行。'));
    const ext=node('article','setup-option');ext.append(node('span','option-badge secondary','Chrome 扩展版'),node('h4','','继续使用独立扩展'),node('p','','首次仍需在 chrome://extensions 开启开发者模式，加载 Plka 提供的文件夹。'));
    if(window.plkaDesktop)ext.append(button('打开扩展文件夹',()=>window.webkit.messageHandlers.plka.postMessage({type:'open-extension-folder'})));
    else ext.append(button('打开扩展文件夹',async()=>{const r=await post('/integrations/extension-folder',{});if(r.folder)toast('扩展位置：'+r.folder);}),button('复制 Chrome 扩展管理地址',async()=>{await navigator.clipboard.writeText('chrome://extensions');toast('已复制，粘贴到 Chrome 地址栏打开。');}),node('p','setup-note','扩展文件夹由 Plka 首次安装入口提供。'));
    options.append(oil,ext);step.append(options);
    const startup=node('div','setup-startup');startup.append(node('strong','','让油猴随时能连接图库'),node('p','','油猴版需要 Plka 正在运行。建议开启登录后后台运行，以后不用每天手动打开；也可先保持 Plka 打开再试用。'));
    if(info.startup.supported)startup.append(button(info.startup.enabled?'已开启 · 关闭登录启动':'开启登录后后台运行',async()=>{await post('/integrations/startup',{enabled:!info.startup.enabled});toast(info.startup.enabled?'已关闭登录启动':'已开启，下次登录电脑时后台运行。');await render();},info.startup.enabled?'':'primary'));
    else startup.append(node('p','setup-note','安装正式 Plka 应用后，这里可设置登录启动。'));
    step.append(startup);
    const test=card(3,'试收一张图片','打开测试页，把鼠标放到图片上，点击“收藏到 Plka”，选择或新建收藏夹，再确认收藏。',info.hasImages);
    test.append(button('打开收藏测试页 ↗',()=>browser('/demo'),'primary'),button('检查脚本是否生效',async()=>{await getInfo();$('#script-check').textContent=info.userscriptSeen?'✓ 检测到油猴脚本。现在可以在测试页收藏。':'还没检测到。请安装脚本、允许用户脚本，并打开或刷新测试页。';}));
    const detected=node('p','setup-detection',info.userscriptSeen?'✓ 已检测到油猴脚本。':'检查会检测最近打开的 Plka 页面中的油猴脚本；Chrome 扩展版不在此项检测范围。');detected.id='script-check';test.append(detected);
    const local=node('div','setup-local');local.append(node('p','','也可以先从电脑导入一张图片，熟悉图库。'),button(info.hasCollections?'导入电脑里的图片':'先创建收藏夹',()=>{close();if(info.hasCollections)importFiles();else newFolder();}));test.append(local);
    const ai=card(4,'需要时，再让 Codex 分析','这是可选功能。安装一次配套 Skill，之后选择收藏夹、复制分析指令，到自己的 Codex 发送。报告会保存回 Plka。');
    ai.append(button('设置 Codex 分析',()=>{close();codexSkill();}));
    $('#setup-complete').textContent=info.hasImages?'完成引导，开始使用':'稍后设置，先逛逛图库';
  }
  async function open(){await render();if(!dialog.open)dialog.showModal();clearInterval(checking);checking=setInterval(async()=>{try{const next=await api('/onboarding');if(next.hasImages&&!info.hasImages){info=next;await render();await refresh();toast('已收到图片，第一张收藏成功！');}else if(next.userscriptSeen&&!info.userscriptSeen){info=next;$('#script-check').textContent='✓ 已检测到油猴脚本，可以试收图片。';}}catch{}},4000);}
  $('#setup-close').onclick=close;dialog.addEventListener('close',()=>clearInterval(checking));
  $('#setup-complete').onclick=async()=>{try{await post('/onboarding',{dismissed:true});close();await getInfo();}catch(e){toast(e.message);}};
  $('#setup-open').onclick=()=>open().catch(e=>toast(e.message));$('#browser-setup').onclick=()=>open().catch(e=>toast(e.message));$('#setup-banner-open').onclick=()=>open().catch(e=>toast(e.message));
  window.addEventListener('plka-open-setup',()=>open().catch(e=>toast(e.message)));
  return {async initialize(){await getInfo();if(location.pathname==='/setup'||(!info.hasImages&&!info.hasCollections&&!info.dismissed))await open();},refresh:getInfo,open};
}
