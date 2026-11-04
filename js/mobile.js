'use strict';

// Touch controls share the same game input as the keyboard.
const Mobile = (() => {
  const input = {};
  const media = matchMedia('(any-pointer: coarse)');
  let enabled = media.matches, active = false, stickPointer = null, lookPointer = null;
  let lastX = 0, lastY = 0;
  const held = new Map();
  const root = document.createElement('div');
  root.id = 'mobileControls';
  root.hidden = true;
  root.innerHTML = `
    <button class="touch-menu" data-open="touchmenu" aria-label="Открыть меню игры">☰ <span>Меню</span></button>
    <div id="touchStick" role="group" aria-label="Джойстик движения"><span id="touchKnob"></span></div>
    <button data-touch="sprint" class="touch-sprint" aria-pressed="false" aria-label="Включить ускорение">⚡ Быстрее</button>
    <div class="touch-actions">
      <button data-hold="up" aria-label="Всплывать">↑<small>Вверх</small></button>
      <button data-hold="down" aria-label="Погружаться">↓<small>Вниз</small></button>
      <button data-hold="e" class="touch-use">Взять / помочь</button>
    </div>`;
  document.body.append(root);
  const stick = root.querySelector('#touchStick'), knob = root.querySelector('#touchKnob');
  const canvas = document.getElementById('game');
  const canPlay = () => active && Game.mode === 'play' && !UI.isBlocking();

  function clear() {
    for (const key in input) input[key] = false;
    held.clear();
    stickPointer = lookPointer = null;
    knob.style.transform = 'translate(-50%, -50%)';
    root.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed'));
    root.querySelector('[data-touch="sprint"]').setAttribute('aria-pressed', 'false');
  }
  function moveStick(e) {
    const rect = stick.getBoundingClientRect(), radius = rect.width * 0.32;
    let x = e.clientX - rect.left - rect.width / 2;
    let y = e.clientY - rect.top - rect.height / 2;
    const scale = Math.min(1, radius / (Math.hypot(x, y) || 1));
    x *= scale; y *= scale;
    knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    input.f = y < -radius * 0.22; input.b = y > radius * 0.22;
    input.l = x < -radius * 0.22; input.r = x > radius * 0.22;
  }
  stick.addEventListener('pointerdown', e => {
    if (!canPlay() || stickPointer !== null) return;
    e.preventDefault(); Sound.init();
    stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e);
  });
  stick.addEventListener('pointermove', e => {
    if (e.pointerId === stickPointer && canPlay()) { e.preventDefault(); moveStick(e); }
  });
  function releaseStick(e) {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    input.f = input.b = input.l = input.r = false;
    knob.style.transform = 'translate(-50%, -50%)';
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, releaseStick);

  root.querySelectorAll('[data-hold]').forEach(button => {
    const key = button.dataset.hold;
    button.addEventListener('pointerdown', e => {
      if (!canPlay()) return;
      e.preventDefault(); Sound.init(); button.setPointerCapture(e.pointerId);
      held.set(e.pointerId, key); button.classList.add('pressed');
      if (key === 'e' && !input.e) input.ePressed = true;
      input[key] = true;
    });
    function release(e) {
      if (held.get(e.pointerId) !== key) return;
      held.delete(e.pointerId);
      input[key] = [...held.values()].includes(key);
      button.classList.toggle('pressed', input[key]);
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
  });
  root.querySelectorAll('[data-touch]').forEach(button => button.addEventListener('click', () => {
    if (!canPlay()) return;
    Sound.init();
    if (button.dataset.touch === 'sprint') {
      input.boost = !input.boost;
      button.classList.toggle('pressed', input.boost);
      button.setAttribute('aria-pressed', String(input.boost));
    }
  }));
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !canPlay() || lookPointer !== null) return;
    e.preventDefault(); Sound.init();
    lookPointer = e.pointerId; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== lookPointer || !canPlay()) return;
    e.preventDefault(); Player.look(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, e => {
    if (e.pointerId === lookPointer) lookPointer = null;
  });
  function update(playing) {
    const next = enabled && playing;
    if (next !== active) { clear(); active = next; root.hidden = !next; }
  }
  function setEnabled(value) {
    enabled = value;
    document.body.classList.toggle('touch-device', enabled);
    clear();
  }
  media.addEventListener('change', e => setEnabled(e.matches));
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !enabled) setEnabled(true); }, true);
  window.addEventListener('resize', clear);
  setEnabled(enabled);
  return { input, clear, update, get enabled() { return enabled; } };
})();
