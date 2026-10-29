'use strict';
// ============================================================
//  Звук: синтез через WebAudio (без внешних файлов)
// ============================================================

const Sound = (() => {
  let ctx = null, master = null, ambGain = null, ambFilter = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.connect(ctx.destination);
      startAmbient();
      applySettings();
    } catch (e) { ctx = null; }
  }

  // Подводный гул: коричневый шум через фильтр низких частот
  function startAmbient() {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    ambFilter = ctx.createBiquadFilter();
    ambFilter.type = 'lowpass'; ambFilter.frequency.value = 420;
    ambGain = ctx.createGain();
    src.connect(ambFilter); ambFilter.connect(ambGain); ambGain.connect(master);
    src.start();
  }

  function applySettings() {
    if (!ctx) return;
    master.gain.value = SETTINGS.volume;
    ambGain.gain.value = 0.35 * SETTINGS.ambient;
  }

  // Глубже — глуше
  function setDepth(depth) {
    if (!ambFilter) return;
    ambFilter.frequency.value = Math.max(120, 420 - depth * 0.25);
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const sfx = {
    click: () => tone(660, 0.06, 'triangle', 0.12),
    coin: () => { tone(988, 0.08, 'square', 0.08); tone(1319, 0.18, 'square', 0.08, null, 0.07); },
    bubble: () => tone(300 + Math.random() * 300, 0.12, 'sine', 0.06, 900),
    pickup: () => { tone(523, 0.1, 'triangle', 0.15); tone(784, 0.15, 'triangle', 0.15, null, 0.08); },
    warn: () => tone(440, 0.25, 'square', 0.07, 330),
    hurt: () => tone(180, 0.3, 'sawtooth', 0.12, 80),
    level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, null, i * 0.1)),
    quest: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'sine', 0.15, null, i * 0.09)),
    photo: () => { tone(2000, 0.05, 'square', 0.1); tone(800, 0.1, 'square', 0.06, 200, 0.05); },
    error: () => tone(200, 0.2, 'square', 0.1, 150),
    ping: (k) => tone(800 + k * 900, 0.08, 'sine', 0.08),
    rescue: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.35, 'sine', 0.14, null, i * 0.12)),
  };

  function play(name, arg) { try { if (ctx && sfx[name]) sfx[name](arg); } catch (e) { /* звук не критичен */ } }

  return { init, play, applySettings, setDepth };
})();
