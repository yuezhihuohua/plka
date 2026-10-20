#ifdef PLKA_MINIMAL_SDK
#import "mac-desktop-api.h"
#else
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#endif

static BOOL backgroundLaunch=NO;

static NSDictionary *prepareLibrary(void) {
  NSString *root=[[[NSBundle mainBundle] resourcePath] stringByAppendingPathComponent:@"plka"];
  NSTask *task=[NSTask new]; task.launchPath=[root stringByAppendingPathComponent:@"runtime/bin/node"];
  task.arguments=@[[root stringByAppendingPathComponent:@"tools/desktop-entry.mjs"],@"--prepare-desktop"];
  NSPipe *output=[NSPipe pipe];task.standardOutput=output;
  [task launch];NSData *data=[output.fileHandleForReading readDataToEndOfFile];[task waitUntilExit];
  if(task.terminationStatus!=0)return nil;
  return [NSJSONSerialization JSONObjectWithData:data options:0 error:0];
}

@interface PlkaDelegate : NSObject <NSApplicationDelegate,NSWindowDelegate,WKNavigationDelegate,WKUIDelegate,WKScriptMessageHandler>
@property(strong) NSWindow *window;
@property(strong) WKWebView *web;
@property(strong) NSDictionary *info;
@property(strong) NSOperationQueue *workQueue;
@property(strong) NSStatusItem *statusItem;
@property(strong) NSTimer *healthTimer;
@property NSUInteger preparing;
@end
@implementation PlkaDelegate
-(void)qaStage:(NSString*)stage {
  NSDictionary *env=[NSProcessInfo processInfo].environment;
  if([env[@"PLKA_DESKTOP_QA"]isEqualToString:@"1"]&&[env[@"PLKA_QA_RESULT"]length])[[NSJSONSerialization dataWithJSONObject:@{@"stage":stage} options:2 error:0]writeToFile:[NSString stringWithFormat:@"%@.stage",env[@"PLKA_QA_RESULT"]] atomically:YES];
}
-(void)applicationDidFinishLaunching:(NSNotification*)notice {
  [NSApp setActivationPolicy:0];
  self.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,1240,820) styleMask:15 backing:2 defer:NO];
  self.window.title=@"Plka";self.window.minSize=(NSSize){880,600};self.window.delegate=self;self.window.releasedWhenClosed=NO;self.window.restorable=NO;
  [self.window center];[self.window setFrameAutosaveName:@"PlkaLibraryWindow"];
  WKWebViewConfiguration *configuration=[WKWebViewConfiguration new];
  [configuration.userContentController addScriptMessageHandler:self name:@"plka"];
  NSString *script=@"if(location.hostname==='127.0.0.1'){Object.defineProperty(window,'plkaDesktop',{value:true});if(navigator.clipboard)Object.defineProperty(navigator.clipboard,'writeText',{value:async text=>{window.webkit.messageHandlers.plka.postMessage({type:'copy',text:String(text)});}});}";
  [configuration.userContentController addUserScript:[[WKUserScript alloc] initWithSource:script injectionTime:0 forMainFrameOnly:YES]];
  self.web=[[WKWebView alloc] initWithFrame:NSMakeRect(0,0,1240,820) configuration:configuration];
  self.web.navigationDelegate=self;self.web.UIDelegate=self;self.web.autoresizingMask=18;self.window.contentView=self.web;
  [self.web loadHTMLString:@"<!doctype html><meta charset='utf-8'><style>body{margin:0;background:#fffdf8;color:#252831;display:grid;place-content:center;height:100vh;font:15px -apple-system;text-align:center}h1{font-size:48px;letter-spacing:-3px;margin:0 0 18px}p{color:#858792}</style><h1>Plka</h1><p>正在打开你的图库…</p>" baseURL:nil];
  [self buildMenu];
  if(!backgroundLaunch&&![[NSProcessInfo processInfo].environment[@"PLKA_QA_HIDDEN"]isEqualToString:@"1"]){[self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];}else if(backgroundLaunch)[NSApp setActivationPolicy:1];
  self.preparing=0;[self qaStage:@"window-created"];[self prepare];
  self.statusItem=[[NSStatusBar systemStatusBar]statusItemWithLength:-1];
  NSString *statusPath=[[[NSBundle mainBundle]resourcePath]stringByAppendingPathComponent:@"PlkaStatus@2x.png"];
  NSImage *statusImage=[[NSImage alloc]initWithContentsOfFile:statusPath];
  statusImage.template=YES;statusImage.size=(NSSize){18,18};self.statusItem.button.image=statusImage;self.statusItem.button.toolTip=@"Plka · 本地图库";
  NSMenu *statusMenu=[[NSMenu alloc]initWithTitle:@"Plka"];
  NSArray *statusTitles=@[@"打开 Plka",@"导入图片…",@"安装网页收藏…",@"退出 Plka"],*statusActions=@[@"showLibrary:",@"importImages:",@"showExtension:",@"quitPlka:"];
  for(NSUInteger i=0;i<statusTitles.count;i++){NSMenuItem *item=[[NSMenuItem alloc]initWithTitle:statusTitles[i] action:NSSelectorFromString(statusActions[i]) keyEquivalent:@""];item.target=self;[statusMenu addItem:item];}
  self.statusItem.menu=statusMenu;
  self.healthTimer=[NSTimer scheduledTimerWithTimeInterval:10 target:self selector:@selector(checkHealth:) userInfo:nil repeats:YES];
}
-(void)buildMenu {
  NSMenu *main=[[NSMenu alloc]initWithTitle:@"Plka"];
  NSArray *names=@[@"Plka",@"文件",@"编辑",@"显示",@"窗口",@"帮助"];
  NSArray *titles=@[@[@"关于 Plka",@"图库与备份…",@"退出 Plka"],@[@"导入图片…",@"新建收藏夹…",@"关闭窗口"],@[@"撤销",@"重做",@"剪切",@"复制",@"粘贴",@"全选"],@[@"刷新图库"],@[@"最小化",@"显示图库"],@[@"安装网页收藏…",@"打开使用说明"]];
  NSArray *selectors=@[@[@"about:",@"settings:",@"quitPlka:"],@[@"importImages:",@"newCollection:",@"performClose:"],@[@"undo:",@"redo:",@"cut:",@"copy:",@"paste:",@"selectAll:"],@[@"reloadLibrary:"],@[@"performMiniaturize:",@"showLibrary:"],@[@"showExtension:",@"showGuide:"]];
  NSArray *keys=@[@[@"",@",",@"q"],@[@"o",@"N",@"w"],@[@"z",@"Z",@"x",@"c",@"v",@"a"],@[@"r"],@[@"m",@"1"],@[@"",@""]];
  for(NSUInteger i=0;i<names.count;i++){
    NSMenuItem *root=[[NSMenuItem alloc]initWithTitle:names[i] action:0 keyEquivalent:@""];
    NSMenu *menu=[[NSMenu alloc]initWithTitle:names[i]];
    NSArray *row=titles[i],*actions=selectors[i],*shortcuts=keys[i];
    for(NSUInteger j=0;j<row.count;j++){
      SEL action=NSSelectorFromString(actions[j]);NSMenuItem *item=[[NSMenuItem alloc]initWithTitle:row[j] action:action keyEquivalent:shortcuts[j]];
      if([actions[j] isEqualToString:@"terminate:"])item.target=NSApp;
      else if(i!=2&&![actions[j] hasPrefix:@"perform"])item.target=self;
      [menu addItem:item];
    }
    root.submenu=menu;[main addItem:root];
  }
  NSApp.mainMenu=main;
}
-(BOOL)isLocal:(NSURL*)url {
  NSURL *base=[NSURL URLWithString:self.info[@"url"]];
  return [url.scheme isEqualToString:@"http"]&&[url.host isEqualToString:@"127.0.0.1"]&&[url.port isEqual:base.port];
}
-(void)prepare {
  [self qaStage:self.preparing?@"prepare-already-running":@"prepare-requested"];
  if(self.preparing)return;self.preparing=1;
  self.workQueue=[NSOperationQueue new];
  [self.workQueue addOperationWithBlock:^{
    [self qaStage:@"preparing-library"];
    NSDictionary *result=prepareLibrary();[self qaStage:result?@"library-prepared":@"library-preparation-failed"];
    [[NSOperationQueue mainQueue]addOperationWithBlock:^{
      self.preparing=0;
      if(![result[@"ok"]boolValue]){NSAlert *alert=[NSAlert new];alert.messageText=@"Plka 暂未就绪";alert.informativeText=@"请重新打开 Plka。若原图库位于外接磁盘，请先连接磁盘。图库文件不会被替换。";[alert runModal];return;}
      BOOL first=self.info==nil;self.info=result;
      if(first){[self qaStage:@"loading-gallery"];[self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:result[@"url"]]]];}
      else [self.web evaluateJavaScript:@"dispatchEvent(new Event('focus'))" completionHandler:nil];
      self.statusItem.button.toolTip=@"Plka · 图库运行中";
    }];
  }];
}
-(BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication*)app {return NO;}
-(BOOL)applicationShouldHandleReopen:(NSApplication*)app hasVisibleWindows:(BOOL)visible {[self showLibrary:nil];return YES;}
-(void)windowWillClose:(NSNotification*)notice {[NSApp setActivationPolicy:1];self.statusItem.button.toolTip=@"Plka · 后台收藏中";}
-(void)showLibrary:(id)sender {[NSApp setActivationPolicy:0];[self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];[self prepare];}
-(void)reloadLibrary:(id)sender {self.info=nil;[self prepare];}
-(void)settings:(id)sender {[self.web evaluateJavaScript:@"document.getElementById('settings').click()" completionHandler:nil];}
-(void)importImages:(id)sender {[self showLibrary:nil];[self.web evaluateJavaScript:@"document.getElementById('file-input').click()" completionHandler:nil];}
-(void)newCollection:(id)sender {[self.web evaluateJavaScript:@"document.getElementById('add-folder').click()" completionHandler:nil];}
-(void)about:(id)sender {NSAlert *a=[NSAlert new];a.messageText=@"Plka";a.informativeText=@"你的设计参考图库\n本地收藏 · 原比例浏览 · Codex 分析";[a runModal];}
-(void)checkHealth:(id)sender {
  if(self.preparing||!self.info)return;
  NSURL *url=[NSURL URLWithString:[NSString stringWithFormat:@"%@api/health",self.info[@"url"]]];
  [[[NSURLSession sharedSession]dataTaskWithRequest:[NSURLRequest requestWithURL:url] completionHandler:^(NSData *data,id response,NSError *error){
    NSDictionary *health=data?[NSJSONSerialization JSONObjectWithData:data options:0 error:0]:nil;
    if(error||![health[@"ok"]boolValue])[[NSOperationQueue mainQueue]addOperationWithBlock:^{self.statusItem.button.toolTip=@"Plka · 正在恢复图库…";[self prepare];}];
  }]resume];
}
-(NSInteger)applicationShouldTerminate:(NSApplication*)app {
  NSString *root=[[[NSBundle mainBundle]resourcePath]stringByAppendingPathComponent:@"plka"];
  NSTask *task=[NSTask new];task.launchPath=[root stringByAppendingPathComponent:@"runtime/bin/node"];task.arguments=@[[root stringByAppendingPathComponent:@"tools/stop-service.mjs"]];[task launch];[task waitUntilExit];return 1;
}
-(void)quitPlka:(id)sender {[NSApp terminate:nil];}
-(void)showExtension:(id)sender {[self showLibrary:nil];[self.web evaluateJavaScript:@"window.dispatchEvent(new Event('plka-open-setup'))" completionHandler:nil];}
-(void)showGuide:(id)sender {[[NSWorkspace sharedWorkspace]openFile:[[[NSBundle mainBundle]resourcePath]stringByAppendingPathComponent:@"使用说明.html"]];}
-(void)userContentController:(WKUserContentController*)controller didReceiveScriptMessage:(WKScriptMessage*)message {
  if(!message.frameInfo.mainFrame||![self isLocal:message.frameInfo.request.URL]||![message.body isKindOfClass:[NSDictionary class]])return;
  NSDictionary *body=message.body;NSString *text=body[@"text"];
  NSDictionary *env=[NSProcessInfo processInfo].environment;
  if([body[@"type"]isEqualToString:@"qa"]&&[env[@"PLKA_DESKTOP_QA"]isEqualToString:@"1"]&&[env[@"PLKA_QA_RESULT"]length]){
    NSDictionary *record=@{@"web":body[@"data"]?:@{},@"visible":@(self.window.visible),@"independentWindow":@YES,@"menuBar":self.statusItem?@YES:@NO,@"menuBarIcon":self.statusItem.button.image?@YES:@NO,@"backgroundLaunch":@(backgroundLaunch)};
    [[NSJSONSerialization dataWithJSONObject:record options:2 error:0]writeToFile:env[@"PLKA_QA_RESULT"] atomically:YES];return;
  }
  if([body[@"type"]isEqualToString:@"open-extension-folder"]&&self.info[@"extensionFolder"])[[NSWorkspace sharedWorkspace]openFile:self.info[@"extensionFolder"]];
  if([body[@"type"]isEqualToString:@"open-browser"]){
    NSString *path=body[@"path"];
    if([path isKindOfClass:[NSString class]]&&([path isEqualToString:@"/setup"]||[path isEqualToString:@"/demo"]||[path isEqualToString:@"/userscript/plka.user.js"])){
      NSString *url=[NSString stringWithFormat:@"%@%@",self.info[@"url"],[path substringFromIndex:1]];
      NSTask *task=[NSTask new];task.launchPath=@"/usr/bin/open";task.arguments=@[@"-a",@"Google Chrome",url];[task launch];[task waitUntilExit];if(task.terminationStatus!=0)[[NSWorkspace sharedWorkspace]openURL:[NSURL URLWithString:url]];
    }
  }
  if([body[@"type"]isEqualToString:@"copy"]&&[text isKindOfClass:[NSString class]]&&text.length<=1048576){NSPasteboard *board=[NSPasteboard generalPasteboard];[board clearContents];[board setString:text forType:NSPasteboardTypeString];}
}
-(void)webView:(WKWebView*)web decidePolicyForNavigationAction:(WKNavigationAction*)action decisionHandler:(void(^)(NSInteger))decide {
  NSURL *url=action.request.URL;
  if(!self.info&&[url.absoluteString isEqualToString:@"about:blank"]){decide(1);return;}
  if([self isLocal:url]){
    if([url.path hasPrefix:@"/api/analyses/"]&&[url.path hasSuffix:@"/report"]){decide(0);[self saveReport:url];return;}
    decide(1);return;
  }
  decide(0);if([url.scheme isEqualToString:@"https"]||[url.scheme isEqualToString:@"http"])[[NSWorkspace sharedWorkspace]openURL:url];
}
-(WKWebView*)webView:(WKWebView*)web createWebViewWithConfiguration:(WKWebViewConfiguration*)config forNavigationAction:(WKNavigationAction*)action windowFeatures:(WKWindowFeatures*)features {
  NSURL *url=action.request.URL;if([self isLocal:url])[web loadRequest:action.request];else if([url.scheme isEqualToString:@"https"]||[url.scheme isEqualToString:@"http"])[[NSWorkspace sharedWorkspace]openURL:url];return nil;
}
-(void)webView:(WKWebView*)web runOpenPanelWithParameters:(WKOpenPanelParameters*)parameters initiatedByFrame:(WKFrameInfo*)frame completionHandler:(void(^)(NSArray*))done {
  if(!frame.mainFrame||![self isLocal:frame.request.URL]){done(nil);return;}
  NSOpenPanel *panel=[NSOpenPanel openPanel];panel.allowsMultipleSelection=parameters.allowsMultipleSelection;panel.canChooseDirectories=NO;panel.canChooseFiles=YES;panel.allowedFileTypes=@[@"png",@"jpg",@"jpeg",@"webp",@"gif"];
  [panel beginSheetModalForWindow:self.window completionHandler:^(NSInteger result){done(result==1?panel.URLs:nil);}];
}
-(void)saveReport:(NSURL*)url {
  [self.web.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray *cookies){
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:url];[request setValue:[NSHTTPCookie requestHeaderFieldsWithCookies:cookies][@"Cookie"] forHTTPHeaderField:@"Cookie"];
    [[[NSURLSession sharedSession]dataTaskWithRequest:request completionHandler:^(NSData *data,id response,NSError *error){
      [[NSOperationQueue mainQueue]addOperationWithBlock:^{
        if(error||!data||((NSHTTPURLResponse*)response).statusCode!=200){NSAlert *a=[NSAlert new];a.messageText=@"报告未能下载";a.informativeText=@"请刷新图库后重试。";[a runModal];return;}
        NSSavePanel *panel=[NSSavePanel savePanel];panel.nameFieldStringValue=@"Plka-分析报告.md";
        [panel beginSheetModalForWindow:self.window completionHandler:^(NSInteger result){if(result==1&&![data writeToFile:panel.URL.path atomically:YES]){NSAlert *a=[NSAlert new];a.messageText=@"报告未能保存";a.informativeText=@"请选择可写入的位置后重试。";[a runModal];}}];
      }];
    }]resume];
  }];
}
-(void)webViewWebContentProcessDidTerminate:(WKWebView*)web {[self reloadLibrary:nil];}
-(void)webView:(WKWebView*)web didFailProvisionalNavigation:(WKNavigation*)navigation withError:(NSError*)error {
  NSDictionary *env=[NSProcessInfo processInfo].environment;
  if([env[@"PLKA_DESKTOP_QA"]isEqualToString:@"1"]&&[env[@"PLKA_QA_RESULT"]length])[[NSJSONSerialization dataWithJSONObject:@{@"navigationError":error.localizedDescription?:@"unknown"} options:2 error:0]writeToFile:env[@"PLKA_QA_RESULT"] atomically:YES];
  if(error.code!=-999&&![env[@"PLKA_DESKTOP_QA"]isEqualToString:@"1"]){NSAlert *a=[NSAlert new];a.messageText=@"图库暂时未能打开";a.informativeText=@"图片仍保存在本机。请重新加载图库；如果使用外接磁盘，请先确认磁盘已连接。";[a addButtonWithTitle:@"重新加载"];[a addButtonWithTitle:@"稍后"];if([a runModal]==1000)[self reloadLibrary:nil];}
}
-(void)webView:(WKWebView*)web didFinishNavigation:(WKNavigation*)navigation {
  if(![self isLocal:web.URL])return;
  [self qaStage:@"navigation-finished"];
  NSDictionary *env=[NSProcessInfo processInfo].environment;
  if([env[@"PLKA_DESKTOP_QA"]isEqualToString:@"1"]&&[env[@"PLKA_QA_RESULT"]length]){
    [web evaluateJavaScript:@"{const timer=setInterval(()=>{if(document.querySelector('#result-count')?.textContent.includes('张图片')&&document.querySelector('#collections')?.children.length){clearInterval(timer);window.webkit.messageHandlers.plka.postMessage({type:'qa',data:{title:document.title,desktop:window.plkaDesktop===true,count:document.querySelector('#result-count').textContent,collections:document.querySelector('#collections').children.length,windowOrigin:location.origin}});}},100);setTimeout(()=>{clearInterval(timer);window.webkit.messageHandlers.plka.postMessage({type:'qa',data:{timeout:true,title:document.title,body:document.body?.innerText.slice(0,800)}});},20000);}" completionHandler:nil];
  }
}
@end
int main(int argc,const char **argv) {
  @autoreleasepool {
    [[NSUserDefaults standardUserDefaults]setBool:NO forKey:@"NSQuitAlwaysKeepsWindows"];
    for(int i=1;i<argc;i++){NSString *arg=[NSString stringWithUTF8String:argv[i]];if([arg isEqualToString:@"--no-open"])return [prepareLibrary()[@"ok"]boolValue]?0:1;if([arg isEqualToString:@"--background"])backgroundLaunch=YES;}
    __attribute__((objc_precise_lifetime)) PlkaDelegate *delegate=[PlkaDelegate new];NSApp.delegate=delegate;[NSApp run];
  }
  return 0;
}
