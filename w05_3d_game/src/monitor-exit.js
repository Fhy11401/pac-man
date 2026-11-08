// Browser Escape may emit keydown, pointerlockchange and fullscreenchange in
// different orders. One press closes an overlay; it must not also pause play.
export class MonitorExitGuard {
  constructor(){this.held=false;this.until=-Infinity;this.browserHeldUntil=null;}
  press(repeat=false,now=performance.now()){
    if(this.browserHeldUntil!==null&&now>=this.browserHeldUntil){this.held=false;this.browserHeldUntil=null;}
    if(repeat||this.held)return false;this.held=true;return true;
  }
  release(){this.held=false;this.browserHeldUntil=null;}
  mark(now,browser=false){this.until=now+650;if(browser){this.held=true;this.browserHeldUntil=this.until;}}
  recent(now){return now<this.until;}
  browserExit(open,now){if(open){this.mark(now,true);return 'close';}return this.recent(now)?'ignore':'pause';}
}
