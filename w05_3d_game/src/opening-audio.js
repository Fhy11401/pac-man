// Local procedural effects: no remote loading or additional audio permissions.
export function openingSamples(kind,sampleRate){
  const duration=kind==='mains-fail'?2.5:5.8,data=new Float32Array(Math.ceil(duration*sampleRate));
  let phase=0,noise=0,seed=731;
  for(let i=0;i<data.length;i++){
    const t=i/sampleRate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    noise=noise*.6+((seed/4294967296)*2-1)*.4;
    if(kind==='mains-fail'){
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
