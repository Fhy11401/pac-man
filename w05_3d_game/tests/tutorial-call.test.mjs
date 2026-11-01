import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TutorialCall,TUTORIAL_LINES,TUTORIAL_AUDIO_CONFIG,narrationReady} from '../src/tutorial-call.js';

class FakeAudio{
  constructor(){this._src='';this.sourceWrites=[];this.playCalls=[];this.pauseCalls=0;this.loadCalls=0;this.queued=[];this.paused=true;this.muted=false;this.currentTime=0;this.duration=NaN;}
  set src(value){this._src=value;this.sourceWrites.push(value);this.currentTime=0;}get src(){return this._src;}
  play(){this.playCalls.push(this.src);this.paused=false;return this.queued.shift()??Promise.resolve();}
  pause(){this.pauseCalls++;this.paused=true;}removeAttribute(name){if(name==='src')this.src='';}load(){this.loadCalls++;}
}
const approvedAudio=()=>({audioReady:true,confirmedNaturalEnglish:true,language:'en-US',clips:TUTORIAL_LINES.map((line,index)=>({src:`../assets/audio/tutorial-en/lesson-${index+1}.ogg`,cues:line.sentences.map((_,i)=>i*6)}))});
function fixture(options={}){
  const nodes={},events={open:0,close:0,ring:0},doc={getElementById(id){return nodes[id]??={hidden:true,inert:true,dataset:{},attributes:{},textContent:'',setAttribute(name,value){this.attributes[name]=value;},focus(){doc.focused=id;},onclick:null};}};
  const audio=new FakeAudio();if(options.play)audio.queued.push(options.play);
  const call=new TutorialCall({doc,createAudio:()=>audio,sound:options.sound,audioConfig:options.useDefault?undefined:(options.audioConfig??{...TUTORIAL_AUDIO_CONFIG,audioReady:false}),onOpen:()=>events.open++,onClose:()=>events.close++,onRing:()=>events.ring++});
  return{call,audio,nodes,events,doc};
}
const drain=()=>new Promise(resolve=>setImmediate(resolve));

test('the call starts connected in an explicit captions mode and never requests legacy recordings',()=>{
  const {call,audio,nodes,events}=fixture();call.startConnected();call.update(1);
  assert.equal(call.state,'connected');assert.equal(nodes['tutorial-call'].dataset.state,'connected');assert.equal(nodes['call-media-state'].textContent,'字幕');
  assert.equal(nodes['call-duration'].textContent,'00:01');assert.equal(events.open,1);assert.equal(events.ring,0);assert.equal(audio.playCalls.length,0);assert.equal(audio.src,'');assert.equal(nodes['call-speaker'].disabled,true);
  assert.equal(nodes['call-caption'].textContent,TUTORIAL_LINES[0].sentences[0].text);call.close();assert.equal(events.close,1);
});

test('the short transcript advances one Chinese caption at a time in fallback mode, then ends once',()=>{
  const {call,audio,nodes,events}=fixture();call.start();let count=0;
  for(const [index,line] of TUTORIAL_LINES.entries())for(const [sentenceIndex,sentence] of line.sentences.entries()){
    assert.equal(call.index,index);assert.equal(call.sentenceIndex,sentenceIndex);assert.equal(nodes['call-caption'].textContent,sentence.text);assert(sentence.text.length<=42);assert(sentence.voice.length>10);count++;
    call.update(call.advance+.001);
  }
  assert.equal(count,15);assert.equal(call.open,false);assert.equal(events.close,1);assert.equal(events.ring,0);assert.equal(audio.playCalls.length,0);assert(nodes['tutorial-call'].hidden);
});

test('next skips exactly one sentence and hanging up prevents every later caption',()=>{
  const {call,nodes,events}=fixture();call.startConnected();nodes['call-next'].onclick();assert.equal(call.index,0);assert.equal(call.sentenceIndex,1);
  assert.equal(nodes['call-caption'].textContent,TUTORIAL_LINES[0].sentences[1].text);const text=nodes['call-caption'].textContent;
  nodes['call-hangup'].onclick();call.update(100);call.next();assert.equal(nodes['call-caption'].textContent,text);assert.equal(events.close,1);assert.equal(nodes.tablet.dataset.call,'false');
});

test('game pause freezes the call timer and captions; hold freezes captions while remaining connected',()=>{
  const {call,nodes}=fixture();call.startConnected();call.update(1);const remaining=call.advance;
  call.setActive(false);call.update(90);assert.equal(call.elapsed,1);assert.equal(call.advance,remaining);assert(nodes['tutorial-call'].hidden);assert(nodes['tutorial-call'].inert);
  call.setActive(true);assert.equal(nodes['tutorial-call'].hidden,false);nodes['call-hold'].onclick();call.update(12);
  assert.equal(call.advance,remaining);assert.equal(call.elapsed,13);assert.equal(nodes['call-hold-label'].textContent,'继续');assert.equal(nodes['call-media-state'].textContent,'已暂停');
  nodes['call-hold'].onclick();call.update(remaining+.01);assert.equal(call.sentenceIndex,1);
});

test('narration requires explicit approval, English metadata, and a complete nonlegacy asset list',()=>{
  const ready=approvedAudio();assert.equal(narrationReady(ready),true);assert.equal(narrationReady(TUTORIAL_AUDIO_CONFIG),true);
  for(const config of [{...ready,audioReady:false},{...ready,confirmedNaturalEnglish:false},{...ready,language:'zh-CN'},{...ready,clips:[]},{...ready,clips:ready.clips.map((_,i)=>({src:`../assets/audio/tutorial/manager-${String(i+1).padStart(2,'0')}.wav`}))}]){
    const {call,audio}=fixture({audioConfig:config});call.startConnected();assert.equal(call.audioReady,false);assert.equal(audio.playCalls.length,0);assert.equal(audio.src,'');
  }
});

test('approved English audio follows sentence cues, supports seeking, and ends each configured clip',()=>{
  const {call,audio,nodes,events}=fixture({audioConfig:approvedAudio()});call.startConnected();assert.equal(nodes['call-media-state'].textContent,'英语 · 中文字幕');
  audio.currentTime=6.1;call.update(.01);assert.equal(call.sentenceIndex,1);assert.equal(nodes['call-caption'].textContent,TUTORIAL_LINES[0].sentences[1].text);
  call.next();assert.equal(audio.currentTime,12);assert.equal(call.sentenceIndex,2);
  for(let index=0;index<TUTORIAL_LINES.length;index++){assert.equal(call.index,index);assert(audio.src.endsWith(`lesson-${index+1}.ogg`));audio.onended();call.update(.71);}
  assert.equal(events.close,1);assert.equal(call.open,false);assert.equal(audio.src,'');
});

test('an aborted approved playback from before pause cannot replace resumed audio with captions',async()=>{
  let reject;const pending=new Promise((_,fail)=>reject=fail);const {call,audio}=fixture({audioConfig:approvedAudio(),play:pending});
  call.startConnected();call.setActive(false);call.setActive(true);reject(Object.assign(new Error('paused'),{name:'AbortError'}));await drain();
  assert.equal(call.audioMode,'voice');assert.equal(call.index,0);assert.equal(audio.playCalls.length,2);assert.equal(audio.paused,false);
});

test('restarting invalidates previous playback rejection, end, and error callbacks',async()=>{
  let reject;const pending=new Promise((_,fail)=>reject=fail);const {call,audio,events}=fixture({audioConfig:approvedAudio(),play:pending});call.startConnected();const oldEnd=audio.onended,oldError=audio.onerror;
  call.startConnected();oldEnd();oldError();reject(new Error('old request'));await drain();
  assert.equal(call.index,0);assert.equal(call.sentenceIndex,0);assert.equal(call.audioMode,'voice');assert.equal(call.ended,false);assert.equal(events.open,2);assert.equal(events.close,0);assert.equal(audio.playCalls.length,2);
});

test('a failed approved recording falls back truthfully to paused, readable sentence captions',async()=>{
  const {call,audio,nodes}=fixture({audioConfig:approvedAudio(),play:Promise.reject(new Error('not supported'))});call.startConnected();await drain();
  assert.equal(call.audioMode,'captions');assert.equal(nodes['call-media-state'].textContent,'字幕');assert.equal(nodes['call-speaker'].disabled,true);assert(audio.paused);const wait=call.advance;
  call.setActive(false);call.update(wait+1);assert.equal(call.sentenceIndex,0);call.setActive(true);call.update(wait+.01);assert.equal(call.sentenceIndex,1);assert.equal(audio.playCalls.length,1);
});

test('only approved audio creates shared filters, follows mute, and disposes once',()=>{
  const created=[],effects={},make=()=>{const node={frequency:{value:0},targets:[],disconnections:0,connect(target){this.targets.push(target);return target;},disconnect(){this.disconnections++;}};created.push(node);return node;};
  const sound={muted:false,effects,ctx:{createMediaElementSource:make,createBiquadFilter:make}};
  const silent=fixture({sound});silent.call.startConnected();assert.equal(created.length,0);silent.call.destroy();
  const {call,audio,nodes}=fixture({sound,audioConfig:approvedAudio()});call.startConnected();assert.equal(created.length,3);assert.equal(created[1].frequency.value,220);assert.equal(created[2].frequency.value,3400);assert.equal(created[2].targets[0],effects);
  nodes['call-speaker'].onclick();assert(audio.muted);nodes['call-speaker'].onclick();assert.equal(audio.muted,false);sound.muted=true;call.update(.01);assert(audio.muted);
  call.stop();call.startConnected();assert.equal(created.length,3);call.destroy();call.destroy();assert(created.every(node=>node.disconnections===1));assert.equal(nodes['call-hangup'].onclick,null);assert.equal(nodes['call-hold'].onclick,null);assert.equal(audio.onended,null);
});

test('connected-call controls all exist and the phone has no incoming-call choices',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  const {nodes}=fixture();for(const id of Object.keys(nodes))assert(ids.has(id),`missing ${id}`);assert(!ids.has('call-answer'));assert(!ids.has('call-decline'));assert(!ids.has('phone-nightvision'));
});

test('the default recording is the supplied complete MP3 with a single 54-second timeline',()=>{
  const {call,audio,nodes}=fixture({useDefault:true});call.startConnected();
  assert.equal(call.audioMode,'voice');assert.equal(TUTORIAL_AUDIO_CONFIG.clips.length,1);
  assert.equal(TUTORIAL_AUDIO_CONFIG.clips[0].duration,54.06);assert.equal(TUTORIAL_LINES.length,1);
  assert.equal(audio.playbackRate,1);assert.equal(audio.defaultPlaybackRate,1);
  assert.equal(nodes['call-media-state'].textContent,'英语 · 中文字幕');
  const file=readFileSync(new URL('../assets/audio/tutorial/night-manager-en.mp3',import.meta.url));
  assert.equal(file.length,595952);
  assert.equal(createHash('sha256').update(file).digest('hex'),'923c3acd6da5669cf9b26a61f15b604274cc90f4c9572e6ef6d8374f5aa22e54');
  const cue=TUTORIAL_AUDIO_CONFIG.clips[0].cues;
  assert.equal(cue.length,15);assert(cue.every((value,index)=>value>=0&&value<54.06&&(!index||value>cue[index-1])));
  call.destroy();
});

test('recorded caption boundaries and manual next seek the same file without restarting its source',()=>{
  const {call,audio,nodes,events}=fixture({useDefault:true});call.startConnected();
  const {cues}=TUTORIAL_AUDIO_CONFIG.clips[0],sentences=TUTORIAL_LINES[0].sentences;
  for(let i=1;i<cues.length;i++){
    audio.currentTime=cues[i]-.001;call.update(.01);assert.equal(call.sentenceIndex,i-1);
    audio.currentTime=cues[i]+.001;call.update(.01);assert.equal(nodes['call-caption'].textContent,sentences[i].text);
  }
  audio.currentTime=26.3;call.update(.01);assert.equal(call.sentenceIndex,8);
  call.next();assert.equal(audio.currentTime,32.888085);assert.equal(call.sentenceIndex,9);
  assert.equal(audio.sourceWrites.filter(Boolean).length,1,'a next-sentence seek must not reload the recording');
  audio.currentTime=54.06;audio.onended();call.update(.71);
  assert.equal(events.close,1);assert.equal(call.open,false);assert(audio.paused);
  call.update(100);assert.equal(events.close,1);
});

test('a retained recording may seek while held but cannot resume until hold and game pause are released',()=>{
  const {call,audio,nodes}=fixture({useDefault:true});call.startConnected();audio.currentTime=26.3;call.update(.01);
  nodes['call-hold'].onclick();assert(audio.paused);const playCalls=audio.playCalls.length;
  nodes['call-next'].onclick();assert.equal(audio.currentTime,32.888085);assert.equal(audio.playCalls.length,playCalls);
  call.setActive(false);call.update(30);assert(audio.paused);assert.equal(call.sentenceIndex,9);
  call.setActive(true);assert(audio.paused,'game resume must respect an explicitly held call');
  nodes['call-hold'].onclick();assert.equal(audio.paused,false);assert.equal(audio.currentTime,32.888085);
  call.destroy();assert(audio.paused);assert.equal(audio.src,'');
});

test('a mid-recording load error keeps the current short caption and finishes without requesting another clip',()=>{
  const {call,audio,nodes,events}=fixture({useDefault:true});call.startConnected();audio.currentTime=39.7;call.update(.01);
  const caption=nodes['call-caption'].textContent;assert.equal(call.sentenceIndex,11);audio.onerror();
  assert.equal(call.audioMode,'captions');assert.equal(nodes['call-caption'].textContent,caption);assert(audio.paused);
  call.update(100);assert.equal(events.close,1);assert.equal(audio.sourceWrites.filter(Boolean).length,1);
});
