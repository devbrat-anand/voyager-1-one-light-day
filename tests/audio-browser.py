"""Render the real synthesizer to PCM and exercise actual in-game audio controls."""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("VOYAGER_URL", "http://127.0.0.1:8765")
ROOT = Path(__file__).resolve().parents[1]
ARGS = ["--use-angle=metal"] if sys.platform == "darwin" else []

MONITOR = """
(() => {
  const NativeAudioContext=window.AudioContext;
  window.audioContexts=[];
  window.AudioContext=class extends NativeAudioContext {
    constructor(...args) {
      super(...args);
      this.tones=[];
      this.loops=new Set();
      this.probe=this.createAnalyser();
      this.probe.fftSize=2048;
      window.audioContexts.push(this);
    }
    createDynamicsCompressor() {
      const compressor=super.createDynamicsCompressor();
      compressor.connect(this.probe);
      return compressor;
    }
    createOscillator() {
      const oscillator=super.createOscillator(),start=oscillator.start.bind(oscillator);
      const setFrequency=oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
      let frequency=oscillator.frequency.value;
      oscillator.frequency.setValueAtTime=(value,...args)=>{
        frequency=value;
        return setFrequency(value,...args);
      };
      oscillator.start=(...args)=>{
        this.tones.push({frequency,time:this.currentTime});
        return start(...args);
      };
      return oscillator;
    }
    createBufferSource() {
      const source=super.createBufferSource(),start=source.start.bind(source);
      source.start=(...args)=>{
        if(source.loop)this.loops.add(source);
        return start(...args);
      };
      source.addEventListener('ended',()=>this.loops.delete(source));
      return source;
    }
  };
  window.audioRMS=()=>{
    const data=new Float32Array(2048);
    window.audioContexts[0].probe.getFloatTimeDomainData(data);
    return Math.sqrt(data.reduce((sum,value)=>sum+value*value,0)/data.length);
  };
})();
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=ARGS)
    page = browser.new_page()
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    results = page.evaluate("""
      async () => {
        const {createGameAudio}=await import('./audio.mjs');
        async function render({event=null,combo=1,enabled=true,music=false,effects=true,
            flying=false,boosting=false,pause=false,dispose=false,seconds=1.6}={}) {
          const sampleRate=16000;
          const context=new OfflineAudioContext(2,Math.ceil(seconds*sampleRate),sampleRate);
          const audio=createGameAudio(context);
          audio.setMix({music,effects});
          audio.setState({active:true,flying,boosting});
          audio.setEnabled(enabled);
          if(event)audio.play(event,{combo,final:event==='finale'});
          if(pause)audio.setState({active:false,flying:false,boosting:false});
          if(dispose)audio.dispose();
          const buffer=await context.startRendering(),data=buffer.getChannelData(0);
          const rms=(start,end)=>{
            const slice=data.subarray(Math.floor(start*sampleRate),Math.min(data.length,Math.floor(end*sampleRate)));
            return Math.sqrt(slice.reduce((sum,value)=>sum+value*value,0)/slice.length);
          };
          const power=frequency=>{
            let re=0,im=0;
            for(let i=0;i<Math.min(4000,data.length);i++) {
              re+=data[i]*Math.cos(2*Math.PI*frequency*i/sampleRate);
              im+=data[i]*Math.sin(2*Math.PI*frequency*i/sampleRate);
            }
            return re*re+im*im;
          };
          let peak=0;
          for(const channel of [buffer.getChannelData(0),buffer.getChannelData(1)])
            for(const value of channel) {
              if(!Number.isFinite(value))throw new Error('Non-finite audio output');
              peak=Math.max(peak,Math.abs(value));
            }
          return {
            peak,rms:rms(0,seconds),foreground:rms(.03,.14),tail:rms(.8,seconds),afterPause:rms(.12,seconds),
            low:power(605),high:power(945),
            seam:seconds>16?Math.abs(data[16*sampleRate]-data[16*sampleRate-1]):null
          };
        }
        return {
          muted:await render({event:'record',enabled:false,music:true,flying:true}),
          music:await render({music:true,flying:true,seconds:17}),
          musicOff:await render({flying:true}),
          effectsOff:await render({event:'ufo',effects:false}),
          record:await render({event:'record'}),
          combo:await render({event:'record',combo:5}),
          ufo:await render({event:'ufo'}),
          pulse:await render({event:'pulse'}),
          warp:await render({boosting:true,flying:true}),
          encounter:await render({event:'encounter',music:true,effects:false}),
          complete:await render({event:'complete'}),
          finale:await render({event:'finale'}),
          paused:await render({event:'ufo',music:true,flying:true,boosting:true,pause:true}),
          disposed:await render({event:'ufo',music:true,flying:true,dispose:true})
        };
      }
    """)
    for key in ["muted", "musicOff", "effectsOff"]:
        assert results[key]["peak"] == 0, (key, results[key])
    for key in ["music", "record", "combo", "ufo", "pulse", "warp", "encounter", "complete", "finale"]:
        assert 0.00005 < results[key]["rms"] < .15, (key, results[key])
        assert results[key]["peak"] < .75, (key, results[key])
    assert results["record"]["low"] > results["record"]["high"] * 4
    assert results["combo"]["high"] > results["combo"]["low"] * 4
    assert results["music"]["seam"] < .003, results["music"]
    assert results["music"]["rms"] * 2 < results["record"]["foreground"], (results["music"], results["record"])
    assert results["finale"]["tail"] > results["complete"]["tail"] + .0001
    for key in ["paused", "disposed"]:
        assert results[key]["afterPause"] < .000001, (key, results[key])
    page.close()

    game = browser.new_page(viewport={"width": 1200, "height": 900})
    errors = []
    game.on("pageerror", lambda error: errors.append(str(error)))
    game.add_init_script(MONITOR)
    game.goto(BASE)
    game.wait_for_load_state("networkidle")
    expect(game.locator("#voyage-start")).to_be_enabled(timeout=30000)
    expect(game.locator("#sound")).to_have_attribute("aria-pressed", "false")
    assert game.evaluate("audioContexts.length") == 0
    game.locator("#chapter").select_option("36")
    game.locator("#sound").click()
    expect(game.locator("#sound")).to_have_text("Sound on")
    assert game.evaluate("audioContexts.length") == 1
    game.locator("#voyage-start").click()
    game.wait_for_function("audioRMS() > .0001")
    assert game.evaluate("audioContexts[0].loops.size") == 1
    game.locator("#voyage-look").click()
    game.wait_for_timeout(200)
    assert game.evaluate("audioRMS()") < .00001
    assert game.evaluate("audioContexts[0].loops.size") == 0
    game.locator("#voyage-look").click()
    game.locator("#voyage-start").click()
    game.wait_for_function("audioRMS() > .0001")
    game.keyboard.press("KeyP")
    game.wait_for_timeout(200)
    assert game.evaluate("audioRMS()") < .00001
    game.locator("#sound-settings summary").click()
    game.locator("#music").uncheck()
    game.locator("#sound-settings summary").click()
    game.locator("#voyage-start").click()
    game.wait_for_timeout(500)
    assert game.evaluate("audioRMS()") < .00001
    count = game.evaluate("audioContexts[0].tones.length")
    expect(game.locator("#voyage-coins")).not_to_have_text("0 / 45 records", timeout=6000)
    assert game.evaluate("audioContexts[0].tones.length") > count
    game.wait_for_timeout(500)
    before_warp = game.evaluate("audioContexts[0].tones.length")
    game.keyboard.down("Space")
    game.wait_for_timeout(400)
    assert game.evaluate("audioContexts[0].tones.length") > before_warp
    assert game.evaluate("audioRMS()") > .0001
    game.keyboard.up("Space")
    game.locator("#sources-open").click()
    game.wait_for_timeout(200)
    assert game.evaluate("audioRMS()") < .00001
    game.locator("#sources-close").click()
    game.locator("#voyage-start").click()
    expect(game.locator("#voyage-ufos")).to_have_text("1 / 6 UFOs", timeout=12000)
    game.locator("#sound").click()
    expect(game.locator("#sound")).to_have_text("Sound off")
    assert game.evaluate("audioContexts[0].state") == "suspended"
    game.locator("#sound").click()
    expect(game.locator("#sound")).to_have_text("Sound on")
    assert game.evaluate("audioContexts.length") == 1
    game.locator("#voyage-pause").click()
    for _ in range(3):
        game.locator("#voyage-start").click()
        game.locator("#voyage-pause").click()
    game.wait_for_timeout(200)
    assert game.evaluate("audioRMS()") < .00001
    game.close()

    timed = browser.new_page()
    timed.add_init_script(MONITOR)
    timed.clock.install()
    timed.goto(BASE)
    timed.wait_for_load_state("networkidle")
    expect(timed.locator("#voyage-start")).to_be_enabled(timeout=30000)
    timed.locator("#chapter").select_option("36")
    timed.locator("#sound").click()
    timed.locator("#voyage-start").click()
    timed.clock.run_for(45200)
    expect(timed.locator("#voyage-overlay-title")).to_have_text("2013 complete.")
    assert timed.evaluate("audioContexts[0].tones.filter(tone=>Math.abs(tone.frequency-523.25)<.01).length") == 1
    timed.clock.run_for(4200)
    expect(timed.locator("#chapter")).to_have_value("37")
    expect(timed.locator("#voyage-overlay")).not_to_be_visible()
    assert timed.evaluate("audioContexts[0].loops.size") >= 1
    timed.locator("#chapter").select_option("49")
    timed.locator("#sound-settings summary").click()
    timed.locator("#effects").uncheck()
    timed.locator("#sound-settings summary").click()
    timed.locator("#voyage-start").click()
    timed.clock.run_for(98000)
    assert timed.evaluate("audioContexts[0].tones.filter(tone=>Math.abs(tone.frequency-196)<.01).length") == 1
    timed.locator("#voyage-pause").click()
    timed.locator("#voyage-start").click()
    timed.locator("#sound-settings summary").click()
    timed.locator("#effects").check()
    timed.locator("#sound-settings summary").click()
    timed.locator("#voyage-start").click()
    timed.clock.run_for(2500)
    expect(timed.locator("#voyage-overlay-title")).to_have_text("One light-day. Still going.")
    assert timed.evaluate("audioContexts[0].tones.filter(tone=>Math.abs(tone.frequency-987.77)<.01).length") == 1
    assert timed.evaluate("audioContexts[0].tones.filter(tone=>Math.abs(tone.frequency-196)<.01).length") == 1
    timed.close()

    for width, height in [(320, 568), (390, 844), (844, 390)]:
        mobile = browser.new_page(viewport={"width": width, "height": height})
        mobile.goto(BASE)
        expect(mobile.locator("#voyage-start")).to_be_enabled(timeout=30000)
        mobile.locator("#sound-settings summary").click()
        for selector in ["#sound", "#music", "#effects", "#sources-open", "#fullscreen"]:
            box = mobile.locator(selector).bounding_box()
            assert box and 0 <= box["x"] and box["x"] + box["width"] <= width, (width, selector, box)
        assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth")
        mobile.close()

    unavailable = browser.new_page()
    unavailable.add_init_script("window.AudioContext=class {constructor(){throw new Error('Audio blocked for test')}}")
    unavailable.goto(BASE)
    expect(unavailable.locator("#voyage-start")).to_be_enabled(timeout=30000)
    unavailable.locator("#sound").click()
    expect(unavailable.locator("#app-status")).to_contain_text("Sound unavailable")
    expect(unavailable.locator("#sound")).to_have_text("Sound off")
    unavailable.locator("#voyage-start").click()
    expect(unavailable.locator("#voyage-overlay")).not_to_be_visible()
    unavailable.close()

    offline = browser.new_context(offline=True)
    local = offline.new_page()
    local.add_init_script(MONITOR)
    local.goto((ROOT / "dist" / "Voyager-1-One-Light-Day.html").as_uri())
    expect(local.locator("#voyage-start")).to_be_enabled(timeout=30000)
    local.locator("#sound").click()
    local.locator("#voyage-start").click()
    local.wait_for_function("audioRMS() > .0001")
    offline.close()
    assert not errors, errors
    browser.close()
    print("PASS: real PCM, seamless music, independent mix, combo pitch, UFO/pulse/warp, milestones, pause, controls, unavailable audio and offline playback")
