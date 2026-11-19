const LOOP_SECONDS=16;
const EVENTS=new Set(['launch','record','ufo','pulse','encounter','complete','finale']);
const frequency=midi=>440*2**((midi-69)/12);

function musicLoop(context) {
  const rate=context.sampleRate,length=rate*LOOP_SECONDS;
  const buffer=context.createBuffer(2,length,rate);
  const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  const add=(start,midi,duration,volume,pan,pad=false)=>{
    const hz=frequency(midi),offset=Math.round(start*rate);
    for(let i=0;i<Math.round(duration*rate);i++) {
      const t=i/rate,phase=2*Math.PI*hz*t;
      const envelope=pad?Math.min(1,t/.9,(duration-t)/1.2):
        (1-Math.exp(-t*100))*Math.exp(-t*3)*Math.min(1,(duration-t)/.15);
      const sample=(Math.sin(phase)+.15*Math.sin(phase*2))*envelope*volume;
      const index=(offset+i)%length;
      left[index]+=sample*Math.sqrt((1-pan)/2);
      right[index]+=sample*Math.sqrt((1+pan)/2);
    }
  };
  const chords=[[52,55,59,66],[48,55,60,64],[43,55,59,62],[50,57,62,66]];
  chords.forEach((chord,bar)=>{
    chord.forEach((midi,i)=>add(bar*4,midi,6,.006,[-.6,.6,-.25,.25][i],true));
    for(let beat=0;beat<4;beat++) {
      add(bar*4+beat,chord[[0,2,1,3][beat]]+12,1.8,.007,beat%2?.4:-.4);
    }
  });
  return buffer;
}

export function createGameAudio(context) {
  const score=musicLoop(context);
  const music=context.createGain(),effects=context.createGain(),limiter=context.createDynamicsCompressor();
  music.gain.value=0;effects.gain.value=0;
  limiter.threshold.value=-9;limiter.knee.value=12;limiter.ratio.value=4;
  limiter.attack.value=.008;limiter.release.value=.2;
  music.connect(limiter);effects.connect(limiter);limiter.connect(context.destination);
  let enabled=false,musicOn=true,effectsOn=true,disposed=false;
  let state={active:false,flying:false,boosting:false},ambient=null,warp=null,offset=0;
  const voices=new Set();
  const ramp=(parameter,value,seconds=.03)=>{
    const now=context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value,now);
    parameter.linearRampToValueAtTime(value,now+seconds);
  };
  function stopAmbient() {
    if(!ambient)return;
    const voice=ambient;ambient=null;
    offset=(offset+context.currentTime-voice.started)%LOOP_SECONDS;
    ramp(voice.gain.gain,0);
    voice.source.stop(context.currentTime+.035);
  }
  function stopWarp() {
    if(!warp)return;
    const voice=warp;warp=null;
    ramp(voice.gain.gain,0,.06);
    voice.oscillators.forEach(oscillator=>oscillator.stop(context.currentTime+.065));
  }
  function stopVoices() {
    for(const voice of voices) {
      ramp(voice.gain.gain,0,.02);
      voice.oscillator.stop(context.currentTime+.025);
    }
  }
  function update() {
    const audible=enabled&&state.active&&!disposed;
    ramp(music.gain,audible&&musicOn?.2:0);
    ramp(effects.gain,audible&&effectsOn?.8:0);
    if(audible&&musicOn&&state.flying) {
      if(!ambient) {
        const source=context.createBufferSource(),gain=context.createGain();
        source.buffer=score;source.loop=true;gain.gain.value=0;
        source.connect(gain);gain.connect(music);ramp(gain.gain,1,.15);
        source.onended=()=>{source.disconnect();gain.disconnect();};
        source.start(context.currentTime,offset);
        ambient={source,gain,started:context.currentTime};
      }
    } else stopAmbient();
    if(audible&&effectsOn&&state.flying&&state.boosting) {
      if(!warp) {
        const gain=context.createGain();gain.gain.value=0;gain.connect(effects);
        const oscillators=[58,116].map((hz,i)=>{
          const oscillator=context.createOscillator();
          oscillator.frequency.setValueAtTime(hz,context.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(hz*1.35,context.currentTime+.4);
          oscillator.detune.value=i?5:0;oscillator.connect(gain);oscillator.start();
          oscillator.onended=()=>{oscillator.disconnect();if(i===1)gain.disconnect();};
          return oscillator;
        });
        ramp(gain.gain,.035,.12);warp={gain,oscillators};
      }
    } else stopWarp();
    if(!audible)stopVoices();
  }
  function note(hz,delay,duration,volume,bus=effects,endHz=null) {
    const oscillator=context.createOscillator(),gain=context.createGain();
    const start=context.currentTime+delay,end=start+duration;
    oscillator.frequency.setValueAtTime(hz,start);
    if(endHz)oscillator.frequency.exponentialRampToValueAtTime(endHz,end);
    gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(volume,start+.012);
    gain.gain.exponentialRampToValueAtTime(.00001,end);
    oscillator.connect(gain);gain.connect(bus);
    const voice={oscillator,gain};voices.add(voice);
    oscillator.onended=()=>{voices.delete(voice);oscillator.disconnect();gain.disconnect();};
    oscillator.start(start);oscillator.stop(end+.015);
  }
  return {
    setEnabled(value) {
      enabled=value;update();
    },
    setMix({music:nextMusic,effects:nextEffects}) {
      musicOn=nextMusic;effectsOn=nextEffects;update();
    },
    setState(next) {
      if(state.active===next.active&&state.flying===next.flying&&state.boosting===next.boosting)return;
      state=next;update();
    },
    play(event,{combo=1,final=false}={}) {
      if(!EVENTS.has(event))throw new RangeError(`Unknown audio event: ${event}`);
      if(!enabled||!state.active||disposed||!(event==='encounter'?musicOn:effectsOn))return;
      if(event==='record') {
        const hz=520+Math.min(5,Math.max(1,combo))*85;
        note(hz,0,.17,.095);note(hz*2,0,.12,.012);
      } else if(event==='ufo') {
        [740,988,1318].forEach((hz,i)=>note(hz,i*.07,.23,.065));
      } else if(event==='pulse') {
        note(190,0,.48,.075,effects,650);
      } else if(event==='encounter') {
        (final?[196,293.66,392,493.88]:[164.81,246.94,329.63,369.99])
          .forEach((hz,i)=>note(hz,i*.1,1.1,.07,music));
      } else if(event==='complete') {
        [523.25,659.25,783.99].forEach((hz,i)=>note(hz,i*.08,.38,.07));
      } else if(event==='finale') {
        [659.25,783.99,987.77,1318.51].forEach((hz,i)=>note(hz,i*.12,.85,.07));
      } else {
        note(440,0,.15,.045);note(660,.1,.18,.045);
      }
    },
    dispose() {
      if(disposed)return;
      disposed=true;enabled=false;update();
      const delay=.08;
      // Disconnect after release envelopes, without owning or closing the caller's context.
      if(context.state!=='closed') {
        const cleanup=context.createConstantSource();
        cleanup.onended=()=>{music.disconnect();effects.disconnect();limiter.disconnect();cleanup.disconnect();};
        cleanup.start();cleanup.stop(context.currentTime+delay);
      } else {music.disconnect();effects.disconnect();limiter.disconnect();}
    },
  };
}
