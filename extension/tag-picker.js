export const tagTone=tag=>[...tag].reduce((n,c)=>n+c.codePointAt(0),0)%6;
export class TagPicker {
  constructor(container,{catalog=[],selected=[],saveCatalog=async tags=>tags,onError=()=>{},onChange=()=>{}}={}){
    this.container=container;this.catalog=[...catalog];this.selected=new Set(selected);this.saveCatalog=saveCatalog;this.onError=onError;this.onChange=onChange;this.managing=false;this.busy=false;this.render();
  }
  values(){return [...this.selected];}
  async updateCatalog(next){if(this.busy)return;this.busy=true;try{this.catalog=await this.saveCatalog(next);this.render();}catch(e){this.onError(e.message);}finally{this.busy=false;}}
  render(){
    const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text!==undefined)e.textContent=text;return e;};
    this.container.replaceChildren();this.container.classList.add('tag-picker');
    const list=node('div','tag-options');
    for(const tag of new Set([...this.catalog,...this.selected])){
      const wrap=node('span','tag-option'),b=node('button','tag-chip tag-tone-'+tagTone(tag),tag);b.type='button';b.setAttribute('aria-pressed',String(this.selected.has(tag)));
      b.onclick=()=>{if(this.selected.has(tag))this.selected.delete(tag);else this.selected.add(tag);this.render();this.onChange(this.values());};wrap.append(b);
      if(this.managing&&this.catalog.includes(tag)){const remove=node('button','tag-remove','×');remove.type='button';remove.setAttribute('aria-label','从可选标签移除 '+tag);remove.onclick=()=>this.updateCatalog(this.catalog.filter(t=>t!==tag));wrap.append(remove);}list.append(wrap);
    }
    const tools=node('div','tag-tools'),input=node('input');input.placeholder='添加标签';input.maxLength=30;input.setAttribute('aria-label','新增标签名称');
    const add=node('button','tag-add','＋ 添加');add.type='button';const submit=async()=>{const tag=input.value.trim();if(!tag)return;if(this.catalog.includes(tag)){this.selected.add(tag);this.render();this.onChange(this.values());return;}await this.updateCatalog([...this.catalog,tag]);if(this.catalog.includes(tag)){this.selected.add(tag);this.render();this.onChange(this.values());}};add.onclick=submit;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit();}};
    const manage=node('button','tag-manage',this.managing?'完成':'管理');manage.type='button';manage.onclick=()=>{this.managing=!this.managing;this.render();};tools.append(input,add,manage);this.container.append(list,tools);
    if(this.managing)this.container.append(node('small','tag-help','移除可选标签不改变已收藏图片；点亮或取消标签后保存图片即可更新归属。'));
  }
}
