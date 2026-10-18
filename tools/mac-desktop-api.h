/* Declaration-only compatibility surface for maintenance Macs with pre-ARM SDKs.
 * These public Cocoa/WebKit selectors are implemented by macOS, not bundled here.
 * Modern SDKs use Apple's headers instead. All supported targets have 64-bit ABI. */
typedef signed char BOOL;
typedef long NSInteger;
typedef unsigned long NSUInteger;
typedef double CGFloat;
typedef struct { CGFloat x,y; } NSPoint;
typedef struct { CGFloat width,height; } NSSize;
typedef struct { NSPoint origin; NSSize size; } NSRect;
#define YES ((BOOL)1)
#define NO ((BOOL)0)
#define nil ((id)0)
#define NSMakeRect(x,y,w,h) ((NSRect){{x,y},{w,h}})
@class NSString, NSArray, NSDictionary, NSURL, NSError, NSData, NSNotification, NSMenu, NSView, NSWindow, NSApplication, WKWebView, WKWebViewConfiguration, WKNavigation, WKNavigationAction, WKWindowFeatures, WKOpenPanelParameters, WKFrameInfo, WKScriptMessage, NSURLRequest, NSURLSessionDataTask;
@protocol NSApplicationDelegate @end
@protocol NSWindowDelegate @end
@protocol WKNavigationDelegate @end
@protocol WKUIDelegate @end
@protocol WKScriptMessageHandler @end
__attribute__((objc_root_class)) @interface NSObject { Class isa; }
+(id)alloc; +(id)new; +(Class)class; -(id)init; -(BOOL)isKindOfClass:(Class)c; -(BOOL)isEqual:(id)value;
@end
@interface NSString : NSObject
+(id)stringWithUTF8String:(const char*)s; +(id)stringWithFormat:(NSString*)format,...;
-(const char*)UTF8String; -(BOOL)isEqualToString:(NSString*)s; -(BOOL)hasPrefix:(NSString*)s; -(BOOL)hasSuffix:(NSString*)s;
-(NSString*)stringByAppendingPathComponent:(NSString*)s;
-(NSString*)substringFromIndex:(NSUInteger)index;
@property(readonly) NSUInteger length;
@end
@interface NSArray : NSObject
+(id)arrayWithObjects:(const id[])objects count:(NSUInteger)count;
-(id)objectAtIndexedSubscript:(NSUInteger)n;
@property(readonly) NSUInteger count;
@end
@interface NSDictionary : NSObject
+(id)dictionaryWithObjects:(const id[])objects forKeys:(const id[])keys count:(NSUInteger)count;
-(id)objectForKeyedSubscript:(id)key;
@end
@interface NSNumber : NSObject
+(id)numberWithBool:(BOOL)b; +(id)numberWithInteger:(NSInteger)n; +(id)numberWithInt:(int)n;
@property(readonly) BOOL boolValue;
@end
@interface NSProcessInfo : NSObject
+(NSProcessInfo*)processInfo; @property(readonly) NSDictionary *environment;
@end
@interface NSTimer : NSObject
+(NSTimer*)scheduledTimerWithTimeInterval:(double)interval target:(id)target selector:(SEL)selector userInfo:(id)info repeats:(BOOL)repeats;
@end
@interface NSBundle : NSObject
+(id)mainBundle; @property(readonly) NSString *resourcePath; @property(readonly) NSString *bundlePath;
@end
@interface NSUserDefaults : NSObject
+(NSUserDefaults*)standardUserDefaults; -(void)setBool:(BOOL)value forKey:(NSString*)key;
@end
@interface NSData : NSObject
-(BOOL)writeToFile:(NSString*)path atomically:(BOOL)atomic;
@end
@interface NSError : NSObject
@property(readonly) NSString *localizedDescription;
@property(readonly) NSInteger code;
@end
@interface NSJSONSerialization : NSObject
+(id)JSONObjectWithData:(NSData*)data options:(NSUInteger)options error:(NSError**)error;
+(NSData*)dataWithJSONObject:(id)object options:(NSUInteger)options error:(NSError**)error;
@end
@interface NSFileHandle : NSObject
-(NSData*)readDataToEndOfFile;
@end
@interface NSPipe : NSObject
+(id)pipe; @property(readonly) NSFileHandle *fileHandleForReading;
@end
@interface NSTask : NSObject
@property(copy) NSString *launchPath; @property(copy) NSArray *arguments;
@property(strong) id standardOutput; @property(strong) id standardError;
@property(readonly) int terminationStatus;
-(void)launch; -(void)waitUntilExit;
@end
@interface NSOperationQueue : NSObject
+(id)mainQueue; -(void)addOperationWithBlock:(void(^)(void))block;
@end
@interface NSURL : NSObject
+(id)URLWithString:(NSString*)s;
@property(readonly) NSString *scheme,*host,*path,*absoluteString;
@property(readonly) NSNumber *port;
@end
@interface NSURLRequest : NSObject
+(id)requestWithURL:(NSURL*)url; @property(readonly) NSURL *URL;
@end
@interface NSMutableURLRequest : NSURLRequest
+(id)requestWithURL:(NSURL*)url; -(void)setValue:(NSString*)value forHTTPHeaderField:(NSString*)field;
@end
@interface NSURLSession : NSObject
+(id)sharedSession;
-(NSURLSessionDataTask*)dataTaskWithRequest:(NSURLRequest*)request completionHandler:(void(^)(NSData*,id,NSError*))handler;
@end
@interface NSURLSessionDataTask : NSObject
-(void)resume;
@end
@interface NSHTTPURLResponse : NSObject
@property(readonly) NSInteger statusCode;
@end
@interface NSHTTPCookie : NSObject
+(NSDictionary*)requestHeaderFieldsWithCookies:(NSArray*)cookies;
@end
@interface NSApplication : NSObject
+(NSApplication*)sharedApplication; @property(weak) id delegate; @property(strong) NSMenu *mainMenu;
-(void)setActivationPolicy:(NSInteger)policy; -(void)activateIgnoringOtherApps:(BOOL)b;
-(void)run; -(void)terminate:(id)sender;
@end
@interface NSImage : NSObject
+(NSImage*)imageWithSystemSymbolName:(NSString*)name accessibilityDescription:(NSString*)description;
-(instancetype)initWithContentsOfFile:(NSString*)path;
@property NSSize size; @property(getter=isTemplate) BOOL template;
@end
@interface NSStatusBarButton : NSObject
@property(strong) NSImage *image; @property(copy) NSString *toolTip;
@end
@interface NSStatusItem : NSObject
@property(readonly) NSStatusBarButton *button; @property(strong) NSMenu *menu;
@end
@interface NSStatusBar : NSObject
+(NSStatusBar*)systemStatusBar; -(NSStatusItem*)statusItemWithLength:(CGFloat)length;
@end
#define NSApp [NSApplication sharedApplication]
@interface NSView : NSObject
@property NSUInteger autoresizingMask; @property(readonly) NSRect bounds;
@end
@interface NSWindow : NSObject
-(id)initWithContentRect:(NSRect)r styleMask:(NSUInteger)style backing:(NSUInteger)b defer:(BOOL)d;
@property(copy) NSString *title; @property NSSize minSize;
@property(strong) NSView *contentView; @property(weak) id delegate;
@property BOOL releasedWhenClosed; @property(readonly,getter=isVisible) BOOL visible;
@property BOOL restorable;
-(void)center; -(BOOL)setFrameAutosaveName:(NSString*)name; -(void)makeKeyAndOrderFront:(id)sender;
-(void)close;
@end
@interface NSMenu : NSObject
-(id)initWithTitle:(NSString*)title; -(void)addItem:(id)item;
@end
@interface NSMenuItem : NSObject
-(id)initWithTitle:(NSString*)title action:(SEL)action keyEquivalent:(NSString*)key;
@property(strong) NSMenu *submenu; @property(weak) id target;
@property NSUInteger keyEquivalentModifierMask;
@end
@interface NSWorkspace : NSObject
+(id)sharedWorkspace; -(BOOL)openURL:(NSURL*)url; -(BOOL)openFile:(NSString*)path;
@end
@interface NSAlert : NSObject
@property(copy) NSString *messageText,*informativeText;
-(id)addButtonWithTitle:(NSString*)title; -(NSInteger)runModal;
@end
@interface NSSavePanel : NSObject
+(id)savePanel; @property(copy) NSString *nameFieldStringValue;
@property(readonly) NSURL *URL;
-(void)beginSheetModalForWindow:(NSWindow*)window completionHandler:(void(^)(NSInteger))handler;
@end
@interface NSOpenPanel : NSSavePanel
+(id)openPanel; @property BOOL allowsMultipleSelection,canChooseDirectories,canChooseFiles;
@property(copy) NSArray *allowedFileTypes; @property(readonly) NSArray *URLs;
@end
@interface NSPasteboard : NSObject
+(id)generalPasteboard; -(NSInteger)clearContents; -(BOOL)setString:(NSString*)s forType:(NSString*)type;
@end
extern NSString * const NSPasteboardTypeString;
extern SEL NSSelectorFromString(NSString *name);
@interface WKUserScript : NSObject
-(id)initWithSource:(NSString*)source injectionTime:(NSInteger)time forMainFrameOnly:(BOOL)main;
@end
@interface WKUserContentController : NSObject
-(void)addUserScript:(WKUserScript*)script; -(void)addScriptMessageHandler:(id)handler name:(NSString*)name;
@end
@interface WKHTTPCookieStore : NSObject
-(void)getAllCookies:(void(^)(NSArray*))handler;
@end
@interface WKWebsiteDataStore : NSObject
@property(readonly) WKHTTPCookieStore *httpCookieStore;
@end
@interface WKWebViewConfiguration : NSObject
@property(strong) WKUserContentController *userContentController;
@end
@interface WKWebView : NSView
-(id)initWithFrame:(NSRect)r configuration:(WKWebViewConfiguration*)c;
@property(weak) id navigationDelegate,UIDelegate; @property(readonly) NSURL *URL;
@property(readonly) WKWebViewConfiguration *configuration;
-(WKNavigation*)loadRequest:(NSURLRequest*)request;
-(WKNavigation*)loadHTMLString:(NSString*)html baseURL:(NSURL*)base;
-(void)evaluateJavaScript:(NSString*)script completionHandler:(void(^)(id,NSError*))handler;
@end
@interface WKWebViewConfiguration (Store)
@property(readonly) WKWebsiteDataStore *websiteDataStore;
@end
@interface WKNavigationAction : NSObject
@property(readonly) NSURLRequest *request;
@end
@interface WKFrameInfo : NSObject
@property(readonly,getter=isMainFrame) BOOL mainFrame; @property(readonly) NSURLRequest *request;
@end
@interface WKScriptMessage : NSObject
@property(readonly) id body; @property(readonly) WKFrameInfo *frameInfo;
@end
@interface WKOpenPanelParameters : NSObject
@property(readonly) BOOL allowsMultipleSelection;
@end
