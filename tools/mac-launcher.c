/* Tiny native app entry. Uses only long-established libSystem APIs, without
 * inheriting a newer macOS requirement from the system AppleScript template. */
extern int _NSGetExecutablePath(char *, unsigned int *);
extern char *getenv(const char *);
extern char *strrchr(const char *, int);
extern int strcmp(const char *, const char *);
extern int snprintf(char *, unsigned long, const char *, ...);
extern int open(const char *, int, ...);
extern int mkstemp(char *);
extern int dup2(int, int);
extern int close(int);
extern int execv(const char *, char *const []);
int main(int argc, char **argv) {
  char self[4096], node[4096], entry[4096], log[4096];
  unsigned int size=sizeof(self);
  if(_NSGetExecutablePath(self,&size))return 1;
  char *last=strrchr(self,'/');if(!last)return 1;*last=0;
  int n=snprintf(node,sizeof(node),"%s/../Resources/plka/runtime/bin/node",self);
  int e=snprintf(entry,sizeof(entry),"%s/../Resources/plka/tools/desktop-entry.mjs",self);
  if(n<0||n>=(int)sizeof(node)||e<0||e>=(int)sizeof(entry))return 1;
  char *temporary=getenv("TMPDIR");if(!temporary)temporary="/tmp/";
  int l=snprintf(log,sizeof(log),"%s/plka-app-XXXXXX",temporary);
  if(l>0&&l<(int)sizeof(log)){int fd=mkstemp(log);if(fd>=0){dup2(fd,1);dup2(fd,2);close(fd);}}
  int input=open("/dev/null",0);if(input>=0){dup2(input,0);close(input);}
  char *arguments[4]={node,entry,0,0};
  char *quiet=getenv("PLKA_NO_OPEN");
  if((quiet&&strcmp(quiet,"1")==0)||(argc>1&&strcmp(argv[1],"--no-open")==0))arguments[2]="--no-open";
  return execv(node,arguments)==-1?1:0;
}
