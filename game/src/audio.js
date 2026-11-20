// Sound for Solara Bay, synthesized live with WebAudio — no audio files, no network.
// Engine hum, two-tone sirens, gunshots, punches, pickups and a small bass loop.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let musicTimer = 0;
  let musicStep = 0;

  /** Lazily create the context on first user gesture (browsers block audio before one). */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq = 1200) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  // A lazy bass line: A minor groove, one note per beat, quiet under everything else.
  const BASS = [55, 0, 55, 65.4, 55, 0, 49, 55, 55, 0, 55, 65.4, 82.4, 0, 73.4, 65.4];

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    click() {
      if (ensure()) tone(660, 0.07, 'square', 0.12);
    },
    punch() {
      if (ensure()) noise(0.12, 0.35, 500);
    },
    shoot() {
      if (ensure()) {
        noise(0.14, 0.5, 2600);
        tone(160, 0.1, 'square', 0.2);
      }
    },
    pickup() {
      if (ensure()) {
        tone(880, 0.09, 'sine', 0.2);
        tone(1318, 0.14, 'sine', 0.2, 0.08);
      }
    },
    missionDone() {
      if (ensure()) {
        tone(523, 0.12, 'triangle', 0.25);
        tone(659, 0.12, 'triangle', 0.25, 0.11);
        tone(784, 0.22, 'triangle', 0.25, 0.22);
      }
    },
    busted() {
      if (ensure()) {
        tone(392, 0.2, 'sawtooth', 0.2);
        tone(311, 0.35, 'sawtooth', 0.2, 0.18);
      }
    },
    horn() {
      if (ensure()) tone(370, 0.28, 'square', 0.14);
    },
    /** Engine hum that follows speed; call every frame while driving, or with 0 to stop. */
    engine(speed01) {
      if (!ensure()) return;
      if (speed01 <= 0.02) {
        if (engineOsc) {
          engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        }
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(60 + speed01 * 130, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, ctx.currentTime, 0.08);
    },
    /** Two-tone siren while any police chase is on; call every frame with dt. */
    siren(dt, on) {
      if (!ensure()) return;
      if (!on) return;
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        tone(sirenHigh ? 880 : 660, 0.4, 'sine', 0.05);
      }
    },
    /** The bass loop; call every frame with dt. */
    music(dt) {
      if (!ensure()) return;
      musicTimer -= dt;
      if (musicTimer > 0) return;
      musicTimer = 0.24;
      const note = BASS[musicStep % BASS.length];
      musicStep += 1;
      if (note > 0) {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = note;
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(t);
        osc.stop(t + 0.24);
      }
    },
  };
}
