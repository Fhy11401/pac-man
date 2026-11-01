export const HEARTBEAT_URL=new URL('../assets/audio/heartbeat/inspectorj-heartbeat.mp3',import.meta.url);
export async function loadHeartbeatData(fetcher=globalThis.fetch){try{const response=await fetcher(HEARTBEAT_URL);return response.ok?await response.arrayBuffer():null;}catch{return null;}}

// Balance the recording's bass-heavy transients against the enemy footfall.
// Keep distance gain untouched; expose the pulse on small speakers without
// pushing its sub-bass harder into the shared output compressor.
export const HEARTBEAT_BALANCE=Object.freeze({gain:.75,bassFrequency:250,bassDb:-14,presenceFrequency:350,presenceDb:18});
export const heartbeatGap=interval=>Math.min(.19,Math.max(.11,interval*.38));

// Keep the recorded pulse timbre at original pitch. Move its two attacks closer
// together as the heartbeat accelerates, rather than speeding up the whole file.
export function playHeartbeatSample(sound,volume,interval){
  if(!sound.heartbeatClip||!sound.ready())return false;
  const ctx=sound.ctx,now=ctx.currentTime,gap=heartbeatGap(interval);
  for(const [offset,duration,delay,level] of [[0,.27,0,1],[.31,.32,gap,.86]]){
    const source=ctx.createBufferSource(),gain=ctx.createGain(),bass=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter(),at=now+delay,end=at+duration;
    source.buffer=sound.heartbeatClip;source.playbackRate.value=1;
    bass.type='lowshelf';bass.frequency.value=HEARTBEAT_BALANCE.bassFrequency;bass.gain.value=HEARTBEAT_BALANCE.bassDb;
    presence.type='highshelf';presence.frequency.value=HEARTBEAT_BALANCE.presenceFrequency;presence.gain.value=HEARTBEAT_BALANCE.presenceDb;
    const levelGain=volume*HEARTBEAT_BALANCE.gain*level;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(levelGain,at+.002);gain.gain.setValueAtTime(levelGain,end-.03);gain.gain.linearRampToValueAtTime(0,end);
    source.connect(bass).connect(presence).connect(gain).connect(sound.threat);source.start(at,offset,duration);sound.track(source,[bass,presence,gain],end+.01);
  }
  return true;
}
