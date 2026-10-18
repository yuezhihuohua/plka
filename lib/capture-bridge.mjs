import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {MAX_IMAGE_BYTES} from './store.mjs';

// Userscripts hold only a short-lived, single-request upload capability. They
// never receive the library credential, folder list, reports or local paths.
export class CaptureBridge {
  constructor(store,{now=Date.now,ttl=15*60*1000,limit=12}={}){this.store=store;this.now=now;this.ttl=ttl;this.limit=limit;this.jobs=new Map();}
  clean(){for(const [id,job] of this.jobs)if(job.expires<=this.now())this.jobs.delete(id);}
  get(id){this.clean();const job=this.jobs.get(id);if(!job)throw new Error('收藏窗口已过期，请回原网页重新收藏。');return job;}
  create({items}={}){
    this.clean();if(this.jobs.size>=this.limit){for(const [id,job] of this.jobs){if(job.cancelled||(!job.active&&job.selected.length&&job.selected.every(i=>job.results[i]?.ok))){this.jobs.delete(id);break;}}}if(this.jobs.size>=this.limit)throw new Error('收藏窗口较多，请关闭并完成已有窗口后重试。');
    if(!Array.isArray(items)||!items.length||items.length>30)throw new Error('每次可选择 1–30 张已加载的图片。');
    const cleanURL=(value,image=false)=>{const s=String(value||'');if(image&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s)&&s.length<256000)return s;const u=new URL(s);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||s.length>12000)throw new Error('图片或来源地址无效。');return u.href;};
    const normalized=items.map(i=>({url:cleanURL(i.url,true),page_url:cleanURL(i.page_url),page_title:String(i.page_title||'').slice(0,500),name:String(i.name||'网页参考图').slice(0,200),width:Math.max(0,Math.min(100000,Number(i.width)||0)),height:Math.max(0,Math.min(100000,Number(i.height)||0))}));
    const id=randomUUID(),capability=randomBytes(32).toString('hex');
    this.jobs.set(id,{id,capability,items:normalized,expires:this.now()+this.ttl,selected:[],results:{},active:false,cancelled:false,opened:false});
    return {id,capability};
  }
  capability(id,value){const job=this.get(id),a=Buffer.from(String(value||'')),b=Buffer.from(job.capability);if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error('收藏请求未授权。');return job;}
  publicStatus(job){return {id:job.id,cancelled:job.cancelled,active:job.active,opened:job.opened,requested:job.active?job.selected.filter(i=>!job.results[i]):[],results:Object.entries(job.results).map(([index,result])=>({index:Number(index),...result}))};}
  view(id){const job=this.get(id);job.opened=true;return {...this.publicStatus(job),items:job.items,selected:job.selected};}
  approve(id,{indexes,collection_id,note='',tags=[]}={}){
    const job=this.get(id);if(job.cancelled)throw new Error('收藏已取消，请重新发起。');if(job.active)throw new Error('正在收藏，请等待完成。');
    if(!Array.isArray(indexes)||!indexes.length||indexes.some(i=>!Number.isInteger(i)||i<0||i>=job.items.length||job.results[i]?.ok))throw new Error('请选择尚未收藏的图片。');
    this.store.collection(collection_id);if(!Array.isArray(tags)||tags.length>30||tags.some(t=>typeof t!=='string'||t.length>60)||typeof note!=='string'||note.length>4000)throw new Error('标签或备注过长。');
    job.selected=[...new Set(indexes)];for(const i of job.selected)delete job.results[i];job.meta={collections:[collection_id],note,tags};job.active=true;return this.view(id);
  }
  upload(id,capability,{index,data,error}={}){
    const job=this.capability(id,capability);
    if(!job.active||job.cancelled||!job.selected.includes(index)||job.results[index])throw new Error('此图片尚未由用户确认收藏，或已经处理。');
    if(error)job.results[index]={ok:false,error:String(error).slice(0,200)};
    else {
      if(typeof data!=='string'||data.length>Math.ceil(MAX_IMAGE_BYTES/3)*4||!data.length||!(/^[A-Za-z0-9+/]*={0,2}$/).test(data))throw new Error('图片数据无效或超过 16 MB。');
      try{const item=job.items[index],r=this.store.importImage(Buffer.from(data,'base64'),{...item,...job.meta,image_url:item.url.startsWith('data:')?'':item.url});job.results[index]={ok:true,duplicate:r.duplicate};}
      catch(e){job.results[index]={ok:false,error:e.message.includes('不存在')?'收藏夹已删除，请重新选择。':'图片保存失败；请确认格式为 PNG、JPEG、WebP 或 GIF，且小于 16 MB。'};}
    }
    if(job.selected.every(i=>job.results[i]))job.active=false;
    return this.publicStatus(job);
  }
  cancel(id){const job=this.get(id);job.cancelled=true;job.active=false;return {ok:true};}
}
