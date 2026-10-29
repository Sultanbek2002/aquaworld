'use strict';
// ============================================================
//  Точка входа: рендерер, ввод, главный цикл
// ============================================================

(function () {
  const loadText = document.getElementById('loadText');
  function fatal(msg) { loadText.innerHTML = msg; loadText.classList.add('error'); }

  if (!window.THREE) {
    fatal('Не удалось загрузить Three.js.<br>Проверьте, что файл <b>lib/three.min.js</b> на месте, или подключитесь к интернету.');
    return;
  }

  const canvas = document.getElementById('game');
  Save.load();
  let renderer;
  try {
    // При постобработке сглаживание делает MSAA-буфер кадра, а не холст
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !Gfx.preset(SETTINGS.quality).post, powerPreference: 'high-performance' });
  } catch (e) {
    fatal('Ваш браузер не поддерживает WebGL. Попробуйте Chrome, Edge или Firefox последней версии.');
    return;
  }
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 450);
  Gfx.scene = scene;

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    Gfx.resize();
  }
  window.applyQuality = () => Gfx.setQuality(SETTINGS.quality);
  window.addEventListener('resize', resize);
  Gfx.init(renderer, SETTINGS.quality);
  resize();

  // ---------- Ввод ----------
  const keys = {};
  let ePressed = false, pauseAt = 0, drag = false;
  const inputState = () => ({
    f: keys.KeyW || keys.ArrowUp, b: keys.KeyS || keys.ArrowDown,
    l: keys.KeyA || keys.ArrowLeft, r: keys.KeyD || keys.ArrowRight,
    up: keys.Space, down: keys.ShiftLeft || keys.ShiftRight,
    e: keys.KeyE, ePressed, boost: keys.ControlLeft || keys.ControlRight,
  });

  window.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    if ((tag === 'INPUT' || tag === 'SELECT') && e.code !== 'Escape') return;
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    Sound.init();
    keys[e.code] = true;
    if (Game.mode !== 'play') { if (e.code === 'Escape') UI.back(); return; }
    const blocking = UI.isBlocking();
    switch (e.code) {
      case 'Escape':
        if (performance.now() - pauseAt < 350) break;
        if (blocking) UI.back(); else UI.open('pause');
        break;
      case 'Tab': UI.toggle('inventory'); break;
      case 'KeyM': UI.toggle('map'); break;
      case 'KeyJ': UI.toggle('ency'); break;
      case 'KeyQ': UI.toggle('quests'); break;
      case 'KeyE': if (!blocking && !e.repeat) ePressed = true; break;
      case 'KeyF': if (!blocking && !e.repeat) Game.toggleFlashlight(); break;
      case 'KeyV':
        if (!blocking && !e.repeat) {
          SETTINGS.firstPerson = !SETTINGS.firstPerson;
          Save.saveSettings();
          Game.applyGear();
          UI.toast(SETTINGS.firstPerson ? '👁 Вид от первого лица' : '🎥 Вид от третьего лица', 'info');
        }
        break;
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  function clearInput() { for (const k in keys) keys[k] = false; ePressed = false; drag = false; }
  window.addEventListener('blur', () => {
    clearInput();
    if (Game.mode === 'play' && !UI.isBlocking()) UI.open('pause');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInput();
      if (Game.mode === 'play') { Save.save(); if (!UI.isBlocking()) UI.open('pause'); }
    }
  });

  canvas.addEventListener('click', () => {
    Sound.init();
    if (Game.mode === 'play' && !UI.isBlocking() && document.pointerLockElement !== canvas) UI.lockPointer();
  });
  canvas.addEventListener('mousedown', () => { drag = true; });
  window.addEventListener('mouseup', () => { drag = false; });
  window.addEventListener('mousemove', e => {
    if (Game.mode !== 'play' || UI.isBlocking()) return;
    if (document.pointerLockElement === canvas || drag) Player.look(e.movementX || 0, e.movementY || 0);
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && Game.mode === 'play' && !UI.isBlocking()) {
      pauseAt = performance.now();
      UI.open('pause');
    }
  });
  // Колесо мыши — расстояние камеры от третьего лица
  canvas.addEventListener('wheel', e => {
    if (Game.mode !== 'play' || UI.isBlocking()) return;
    e.preventDefault();
    Player.camZoom = Math.max(0.45, Math.min(1.8, Player.camZoom * (1 + Math.sign(e.deltaY) * 0.1)));
  }, { passive: false });
  window.addEventListener('beforeunload', () => { if (Game.mode === 'play') Save.save(); });

  let lastErr = 0;
  window.addEventListener('error', e => {
    if (performance.now() - lastErr > 5000 && typeof UI !== 'undefined') {
      lastErr = performance.now();
      try { UI.toast('⚠ Ошибка: ' + e.message, 'bad'); } catch (x) { /* интерфейс ещё не готов */ }
    }
  });

  // ---------- Главный цикл ----------
  const clock = new THREE.Clock();
  let t = 0, menuA = 0, enhanceT = 0;
  const camFocus = new THREE.Vector3();

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    const playing = Game.mode === 'play' && !UI.isBlocking();
    try {
      if (playing) Game.update(dt, inputState());
      else if (Game.mode === 'menu') {
        menuA += dt * 0.04;
        camera.position.set(Math.sin(menuA) * 32, -4 + Math.sin(menuA * 3) * 1.5, -55 + Math.cos(menuA) * 32);
        camera.lookAt(0, -7, -60);
      }
      camFocus.copy(Game.mode === 'play' ? Player.obj.position : camera.position);
      if (playing || Game.mode === 'menu') Creatures.update(dt, t, camFocus, playing);
      World.update(dt, t, camFocus, toDepth(camFocus.y));
      if (Game.mode === 'play') UI.hud(dt);
    } catch (e) {
      console.error(e);
      if (performance.now() - lastErr > 5000) { lastErr = performance.now(); UI.toast('⚠ Ошибка: ' + e.message, 'bad'); }
    }
    ePressed = false;
    // Объекты, созданные во время игры (события, находки), тоже получают каустики
    enhanceT -= dt;
    if (enhanceT <= 0) { enhanceT = 2; Gfx.enhanceScene(scene); }
    Gfx.render(scene, camera, dt, t, toDepth(camera.position.y));
  }

  // ---------- Загрузка ----------
  setTimeout(() => {
    try {
      loadText.textContent = 'Строим подводный мир…';
      World.build(scene, SETTINGS.quality);
      Creatures.init(scene);
      Player.init(scene, camera);
      Game.init(scene);
      Expansion.init(scene);
      UI.init();
      Player.teleport(DIVE_POINTS[0].pos, 0);
      Creatures.syncWithSave();
      World.setUpgrades(S.upgrades);
      Game.applyGear();
      Game.refreshObjects();
      Sound.applySettings();
      Gfx.enhanceScene(scene);
      Gfx.Assets.start();
    } catch (e) {
      console.error(e);
      fatal('Ошибка запуска игры: ' + e.message);
      return;
    }
    document.getElementById('loading').classList.add('hidden');
    UI.open('main');
    requestAnimationFrame(loop);

  }, 60);
})();
