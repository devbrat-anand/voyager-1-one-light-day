import { createVoyage } from './voyage.mjs';
import { CHAPTERS, MILESTONE_UTC } from './arcade-core.mjs';
import { createGameAudio } from './audio.mjs';

const $=id=>document.getElementById(id);
$('chapter').replaceChildren(...CHAPTERS.map((chapter,index)=>{
  const option=document.createElement('option');
  option.value=index;option.textContent=`${chapter.year} · ${chapter.milestone?chapter.name:'Quiet year'} · ${chapter.duration}s`;
  return option;
}));
let voyage,audioContext,audio,soundOn=false,audioError='',resuming=false;
let flightAudio={active:false,flying:false,boosting:false};
function status(message,error=false) {
  $('app-status').textContent=message;$('app-status').classList.toggle('error',error);
}
function soundButton() {
  $('sound').textContent=soundOn?'Sound on':'Sound off';
  $('sound').setAttribute('aria-pressed',String(soundOn));
}
function soundFailure(error) {
  console.error('Voyager audio unavailable:',error);
  audio?.dispose();audio=null;soundOn=false;soundButton();
  const context=audioContext;audioContext=null;
  if(context&&context.state!=='closed')context.close().catch(error=>console.warn('Audio cleanup failed:',error));
  audioError=`Sound unavailable: ${error.message}. You can still play without audio.`;
  status(audioError);
}
function useAudio(operation) {
  if(!audio)return;
  try {operation(audio);}
  catch(error) {soundFailure(error);}
}
const sound={
  setState(state) {
    flightAudio=state;useAudio(audio=>audio.setState(state));
    if(soundOn&&state.active&&audioContext?.state==='suspended'&&!resuming) {
      resuming=true;
      audioContext.resume().catch(soundFailure).finally(()=>{resuming=false;});
    }
  },
  play(event,options) {useAudio(audio=>audio.play(event,options));},
};
const mix=()=>({music:$('music').checked,effects:$('effects').checked});
$('sound').addEventListener('click',async()=>{
  $('sound').disabled=true;
  try {
    if(soundOn) {
      audio.setEnabled(false);await audioContext.suspend();soundOn=false;
    } else {
      audioContext??=new AudioContext();audio??=createGameAudio(audioContext);
      await audioContext.resume();
      audio.setMix(mix());audio.setState(flightAudio);audio.setEnabled(true);soundOn=true;
    }
    soundButton();audioError='';
    if($('app-status').textContent.startsWith('Sound unavailable:'))status('');
  } catch(error) {soundFailure(error);}
  finally {$('sound').disabled=false;}
});
for(const id of ['music','effects'])$(id).addEventListener('change',()=>useAudio(audio=>audio.setMix(mix())));
$('sound-settings').addEventListener('toggle',()=>{if($('sound-settings').open)voyage?.pause();});
$('sources-open').addEventListener('click',()=>{voyage?.pause();$('sources-dialog').showModal();});
$('sources-close').addEventListener('click',()=>$('sources-dialog').close());
$('fullscreen').addEventListener('click',async()=>{
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch(error) {status(`Fullscreen is blocked by this browser or embed. Open the hosted game directly. ${error.message}`);}
});
document.querySelector('.brand').addEventListener('click',event=>{
  event.preventDefault();voyage?.pause();window.scrollTo({top:0,behavior:'instant'});
});
function anniversary() {
  const remaining=Date.parse(MILESTONE_UTC)-Date.now();
  if(remaining<=0){$('anniversary-countdown').textContent='One light-day';return;}
  const hours=Math.floor(remaining/3600000);
  $('anniversary-countdown').textContent=`${Math.floor(hours/24)}d ${hours%24}h ${Math.floor(remaining%3600000/60000)}m to go`;
}
anniversary();setInterval(anniversary,30000);
async function init() {
  let bundle;
  try {
    const embedded=$('bundled-ephemeris');
    if(embedded)bundle=JSON.parse(embedded.textContent);
    else {
      const response=await fetch('./data/ephemeris.json');
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      bundle=await response.json();
    }
    for(const key of ['earth','jupiter','saturn','uranus','neptune','voyager1']) {
      const states=bundle.bodies?.[key]?.states;
      if(!Array.isArray(states)||states.length<2||states.some((row,i)=>
        row.length!==7||row.some(value=>!Number.isFinite(value))||(i>0&&row[0]<=states[i-1][0]))) {
        throw new Error(`Invalid JPL state vectors for ${key}`);
      }
    }
    $('data-provenance').textContent='NASA/JPL Horizons baseline and detailed Voyager 1 chapters are bundled with the game. Source query URLs, retrieval dates, frame and units are stored inside the included data.';
  } catch(error) {
    console.error('Voyager 1 flight data failed:',error);
    status(`Flight data unavailable: ${error.message}. Reload the complete HTML file, or host the site with its data folder.`,true);
    $('voyage-overlay-title').textContent='Your flight data is missing.';
    $('voyage-overlay-story').textContent='Use the complete standalone HTML or include data/ephemeris.json when hosting. No fabricated route will be substituted.';
    return;
  }
  try {
    voyage=await createVoyage(bundle,sound);status(audioError);
  } catch(error) {
    console.error('Voyager 1 game initialization failed:',error);
    status(`The 3D game could not start: ${error.message}. Reload the complete release or try a current WebGL 2 browser.`,true);
    $('voyage-overlay-title').textContent='The flight could not start.';
    $('voyage-overlay-story').textContent='The initialization error is shown above. Reload the page to try again.';
  }
}
init();
