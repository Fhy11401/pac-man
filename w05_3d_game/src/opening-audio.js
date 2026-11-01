// Local procedural effects: no remote loading or additional audio permissions.
import {OPENING_CUT_AT} from './opening-timing.js';
export function openingSamples(kind,sampleRate){
  const duration=kind==='monitor-watch'?OPENING_CUT_AT:kind==='lens-strike'?.48:kind==='mains-fail'?2.5:5.8,data=new Float32Array(Math.ceil(duration*sampleRate));
  let phase=0,noise=0,seed=731;
  for(let i=0;i<data.length;i++){
    const t=i/sampleRate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    noise=noise*.6+((seed/4294967296)*2-1)*.4;
    if(kind==='monitor-watch'){
      const stare=Math.max(0,Math.min(1,(t-4.2)/1.2)),near=Math.max(0,Math.min(1,(t-7)/5.6)),fade=Math.min(1,t,(13.2-t)*18);
      let steps=0;for(const at of [1.8,2.45,3.1,3.75,4.25,6.9,8.8,10.5]){const age=t-at;if(age>=0&&age<.23)steps+=(1+near*1.3)*Math.exp(-age*22)*(.11*Math.sin(age*360)+.055*noise);}
      const electrical=Math.exp(-(((t-5.35)/.16)**2))*.035+Math.exp(-(((t-13.02)/.075)**2))*.12;
      const breath=near**2*(.035+.07*Math.max(0,Math.sin((t-7)*3.7)))*noise;
      const silence=1-.985*Math.max(0,Math.min(1,(t-11.65)/.35));
      data[i]=fade*silence*((.018+.032*stare+.025*near)*Math.sin(t*Math.PI*2*47)+stare*.014*Math.sin(t*Math.PI*2*49.1)+steps+breath+noise*electrical);
    }else if(kind==='lens-strike'){
      phase+=2*Math.PI*(95+240*Math.exp(-t*15))/sampleRate;
      const envelope=Math.min(1,t/.004,(duration-t)/.035);
      data[i]=envelope*(.32*noise*Math.exp(-t*12)+.23*Math.sin(phase)*Math.exp(-t*9)+.075*Math.sin(phase*2.71)*Math.exp(-t*17));
    }else if(kind==='mains-fail'){
      phase+=2*Math.PI*(28+100*Math.exp(-t*2))/sampleRate;
      data[i]=.45*noise*Math.exp(-t*28)+.22*Math.sin(phase)*Math.exp(-t*1.8)+.08*noise*Math.exp(-t*3);
    }else{
      const running=Math.min(1,Math.max(0,(t-1.5)/1.7)),rpm=27+running*38;
      phase+=2*Math.PI*rpm/sampleRate;
      const crank=.45+.55*Math.max(0,Math.sin(t*24)),fade=Math.min(1,t*15,(duration-t)*2);
      data[i]=fade*((.14*Math.sin(phase)+.045*Math.sin(phase*2.03))*(running+(1-running)*crank)+noise*(.12-.065*running)*crank);
    }
  }
  return data;
}

// Pause keeps the sound cursor aligned with the opening's simulation clock.
export class OpeningAudio{
  constructor(ctx,bus){this.ctx=ctx;this.bus=bus;this.buffers=new Map();this.offset=0;this.paused=false;}
  play(kind){this.stop();let buffer=this.buffers.get(kind);if(!buffer){const samples=openingSamples(kind,this.ctx.sampleRate);buffer=this.ctx.createBuffer(1,samples.length,this.ctx.sampleRate);buffer.copyToChannel(samples,0);this.buffers.set(kind,buffer);}this.buffer=buffer;this.resume();}
  resume(){if(!this.buffer||this.source||this.offset>=this.buffer.duration||this.paused)return;const source=this.ctx.createBufferSource();source.buffer=this.buffer;source.connect(this.bus);this.source=source;this.started=this.ctx.currentTime;source.onended=()=>{source.disconnect();if(this.source===source){this.source=null;this.offset=this.buffer.duration;}};source.start(0,this.offset);}
  setPaused(value){this.paused=Boolean(value);if(this.paused&&this.source){this.offset+=this.ctx.currentTime-this.started;const source=this.source;this.source=null;source.stop();}else if(!this.paused)this.resume();}
  stop(){if(this.source){const source=this.source;this.source=null;source.stop();}this.buffer=null;this.offset=0;}
}
