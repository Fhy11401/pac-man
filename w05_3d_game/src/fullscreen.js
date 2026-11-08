// Request directly from the start interaction. Never postpone a denied request
// until an unrelated interaction or interfere with the browser Escape shortcut.
export class GameFullscreen{
  constructor(doc=globalThis.document){this.doc=doc;this.pending=null;}
  ensure(){
    const doc=this.doc;
    if(doc.fullscreenElement)return Promise.resolve(true);
    if(this.pending)return this.pending;
    if(doc.fullscreenEnabled===false||!doc.documentElement?.requestFullscreen)return Promise.resolve(false);
    try{
      this.pending=Promise.resolve(doc.documentElement.requestFullscreen({navigationUI:'hide'})).then(()=>Boolean(doc.fullscreenElement)).catch(()=>false).finally(()=>{this.pending=null;});
      return this.pending;
    }catch{return Promise.resolve(false);}
  }
}
