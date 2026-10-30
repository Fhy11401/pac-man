// Original score, composed for Echo Archive. No samples or melodies from another game.
export const SCORE_RATE=22050;
export const SCORE_SECONDS=16;
export const STEMS=['exploration','tension','chase','escape'];
const TAU=Math.PI*2;
const hz=midi=>440*2**((midi-69)/12);

export function composeScore(rate=SCORE_RATE){
  const length=Math.round(rate*SCORE_SECONDS),tracks=Object.fromEntries(STEMS.map(k=>[k,new Float32Array(length)]));
  let seed=0xEC4019;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  // Notes wrap their tails across the loop seam, so every layer shares the same clock.
  function note(stem,start,duration,midi,level,kind='bow'){
    const track=tracks[stem],f=hz(midi),offset=Math.round(start*rate),count=Math.ceil(duration*rate);
    let low=0;
    for(let i=0;i<count;i++){
      const t=i/rate,u=t/duration,attack=Math.min(1,t/(kind==='bow'?.09:.007)),tail=Math.min(1,(duration-t)/.04);
      const phase=TAU*f*t;let wave;
      if(kind==='drum'){low=low*.78+noise()*.22;wave=Math.sin(TAU*(46*t+4*(1-Math.exp(-t*25))))*.7+low*.5;}
      else if(kind==='metal')wave=Math.sin(phase)*.52+Math.sin(phase*1.414)*.26+Math.sin(phase*2.71)*.15;
      else if(kind==='bow')wave=Math.sin(phase+Math.sin(TAU*4.2*t)*.06)*.58+Math.sin(phase*2.002)*.19+Math.sin(phase*3.001)*.09;
      else wave=Math.sin(phase)*.7+Math.sin(phase*2)*.2;
      const decay=kind==='bow'?Math.sin(Math.PI*u)**.65:Math.exp(-u*(kind==='drum'?8:5));
      track[(offset+i)%length]+=wave*attack*tail*decay*level;
    }
  }
  // Long low strings, distant struck metal, and a restrained, uneven four-bar phrase.
  for(let bar=0;bar<8;bar++){
    const root=[38,38,37,41,38,34,37,38][bar],at=bar*2;
    note('exploration',at,3.8,root,.18);note('exploration',at+.18,3.5,root+19,.055);
    if(bar%2===0)note('exploration',at+.75,2.5,root+36,.10,'metal');
    note('tension',at,2.7,root+12,.16);note('tension',at+.06,2.6,root+13,.10);
    for(let beat=0;beat<4;beat++){
      const time=at+beat*.5;
      note('tension',time,.32,root,.20,'pulse');
      note('chase',time,.37,26,.48,'drum');
      if(beat===1||beat===3)note('chase',time,.19,root+31,.17,'metal');
      note('escape',time+.25,.21,26,.30,'drum');
      for(let sub=0;sub<2;sub++){
        const step=beat*2+sub,interval=[0,7,1,12,0,6,1,7][(step+bar*3)%8];
        note('chase',time+sub*.25,.20,root+12+interval,.22,'bow');
        note('escape',time+sub*.25,.18,root+24+interval,.16,'bow');
      }
    }
    if(bar===3||bar===7)note('escape',at+1.5,1.7,root+37,.17,'metal');
  }
  // Bound each stem independently; the director controls the final mix headroom.
  for(const track of Object.values(tracks)){let peak=0;for(const v of track)peak=Math.max(peak,Math.abs(v));const gain=peak>.65?.65/peak:1;for(let i=0;i<track.length;i++)track[i]*=gain;}
  return {rate,tracks};
}
