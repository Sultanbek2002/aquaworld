'use strict';
// ============================================================
//  Интерфейс: экраны, HUD, компас, карта, уведомления
// ============================================================

const UI = (() => {
  const $ = id => document.getElementById(id);
  const stack = [];
  const thumbs = { species: {}, items: {} };
  const dialogQueue = [];
  let dialogCb = null, confirmCb = null;
  let qTab = 'active', qCategory = 'all', encyZone = 'all', encySel = null;
  let hudT = 0, fpsN = 0, fpsT = 0;
  const bannerQueue = [];
  let bannerBusy = false;
  const zoneName = id => (ZONES.find(z => z.id === id) || {}).name || '';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Стек экранов ----------
  function show(id, on) { const el = $('scr-' + id); if (el) el.classList.toggle('hidden', !on); }
  function render(id) {
    try { if (R[id]) R[id](); } catch (e) { console.error('Ошибка экрана ' + id, e); }
    document.querySelectorAll('.cCoins').forEach(e => { e.textContent = S.coins; });
  }
  function open(id) {
    const top = stack[stack.length - 1];
    if (top === id) { render(id); return; }
    if (top) show(top, false);
    stack.push(id);
    render(id);
    show(id, true);
    if (document.pointerLockElement) document.exitPointerLock();
    $('prompt').classList.add('hidden');
    Sound.play('click');
  }
  function back() {
    if (!stack.length) return;
    const top = stack[stack.length - 1];
    if (top === 'main' || top === 'fail') return;
    if (top === 'base' && Game.mode === 'play') return;   // с базы уходят через «Погрузиться»
    stack.pop();
    show(top, false);
    if (top === 'dialog') {
      const cb = dialogCb; dialogCb = null;
      if (cb) cb();
      if (dialogQueue.length) { showDialog(dialogQueue.shift()); return; }
    }
    if (stack.length) { const t = stack[stack.length - 1]; render(t); show(t, true); }
    else if (Game.mode === 'play') resume();
  }
  function closeAll() { while (stack.length) show(stack.pop(), false); }
  const isBlocking = () => stack.length > 0;
  const top = () => stack[stack.length - 1];
  function toggle(id) { if (top() === id) back(); else open(id); }

  function resume() {
    closeAll();
    if (Game.mode !== 'play') return;
    lockPointer();
  }

  // Захват мыши; без жеста пользователя браузер откажет — это не ошибка
  function lockPointer() {
    try {
      const c = $('game');
      const p = c.requestPointerLock && c.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* игрок кликнет по экрану сам */ }
  }

  // ---------- Диалоги, подтверждения, уведомления ----------
  function showDialog(d) {
    $('dlgTitle').textContent = d.title;
    $('dlgSpeaker').textContent = d.speaker || DR;
    $('dlgText').innerHTML = esc(d.text).replace(/\n/g, '<br>');
    dialogCb = d.cb || null;
    open('dialog');
  }
  function dialog(title, text, cb, speaker) {
    const d = { title, text, cb, speaker };
    if (top() === 'dialog') dialogQueue.push(d); else showDialog(d);
  }
  function confirm(text, yes) { $('cfText').textContent = text; confirmCb = yes; open('confirm'); }

  function toast(html, type = 'info') {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
  }
  function banner(title, text) {
    bannerQueue.push([title, text]);
    if (!bannerBusy) nextBanner();
  }
  function nextBanner() {
    const b = bannerQueue.shift();
    if (!b) { bannerBusy = false; return; }
    bannerBusy = true;
    $('bannerTitle').textContent = b[0];
    $('bannerText').textContent = b[1] || '';
    const el = $('banner');
    el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('show'); nextBanner(); }, 3300);
  }
  function pulse(id) { const el = $(id); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  const flash = () => pulse('flash');
  const hurt = () => pulse('hurt');
  function coinPop() { const el = $('hCoins'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  function showHud(on) { $('hud').classList.toggle('hidden', !on); }
  function showFail(reason, lost) {
    $('failText').innerHTML = `${esc(reason)}<br><br>Спасатели доставили вас на станцию.<br>Потеряно монет экспедиции: <b>${lost} 🪙</b>.<br>Купленное снаряжение, открытые зоны и выполненные задания сохранены.`;
    closeAll();
    open('fail');
  }

  // ---------- Рендер экранов ----------
  const R = {};
  R.main = () => {
    $('btnPlay').textContent = S.started ? '▶ Продолжить' : '▶ Играть';
    $('mainInfo').innerHTML = S.started
      ? `Сохранение: уровень <b>${S.level}</b> · 🪙 <b>${S.coins}</b> · видов открыто: <b>${Game.discoveredCount()}/${SPECIES.length}</b>`
      : 'Исследуйте океан, спасайте животных и раскройте тайну сигнала из бездны.';
  };

  R.base = () => {
    const next = QUESTS.find(q => q.story && !Quests.isDone(q.id));
    let story;
    if (!next) story = '🏆 Сюжет пройден! Продолжайте исследовать океан, ищите редких существ и помогайте животным.';
    else if (Quests.isActive(next.id)) story = `Сюжет — «${next.title}»: ${Quests.stage(next.id).text}`;
    else if (Quests.available(next.id)) story = `Новая глава «${next.title}» ждёт на доске заданий!`;
    else story = `Следующая глава «${next.title}»: ${Quests.lockReason(next.id)}`;
    if (next && next.hint) story += `<br><span class="muted">${next.hint}</span>`;
    const z = Game.nextLockedZone();
    const zoneTxt = z ? `🔒 Зона «${z.name}» (${z.min}–${z.max === Infinity ? '∞' : z.max} м): ${Game.zoneMissing(z).join(', ')}` : '🌊 Все зоны океана открыты!';
    const avail = QUESTS.filter(q => Quests.available(q.id)).length;
    $('baseOverview').innerHTML = `
      <p>Добро пожаловать на базу! Кислород и здоровье восстановлены.</p>
      <div class="info-box">📡 ${story}</div>
      <div class="info-box">${zoneTxt}</div>
      ${avail ? `<div class="info-box good">📜 Доступно новых заданий: <b>${avail}</b></div>` : ''}
      <div class="stat-row"><span>Уровень <b>${S.level}</b></span><span>Видов <b>${Game.discoveredCount()}/${SPECIES.length}</b></span><span>Спасено <b>${S.stats.rescued}</b></span><span>Рекорд <b>${S.stats.maxDepth} м</b></span></div>`;
    $('divePoints').innerHTML = DIVE_POINTS.map(dp => {
      const zz = ZONES.find(x => x.id === dp.zone), ok = Game.zoneUnlocked(zz);
      return `<button class="dive ${ok ? '' : 'locked'}" data-dive="${dp.id}" ${ok ? '' : 'disabled'}>
        <b>${ok ? '🌊' : '🔒'} ${dp.name}</b><span>${zz.name} · ${zz.min}–${zz.max === Infinity ? '∞' : zz.max} м</span></button>`;
    }).join('');
  };

  const renderBase = R.base;
  R.base = () => {
    renderBase();
    $('modeList').innerHTML = MODES.map(m=>{
      const reason=Expansion.modeReason(m.id);
      return `<button class="btn mode-choice ${S.mode===m.id?'active':''}" data-mode="${m.id}" ${reason?'disabled':''}><b>${m.name}</b><span>${m.desc}</span><span>${reason || 'Награда: '+m.coins+' 🪙 · '+m.xp+' XP'}</span></button>`;
    }).join('') + (S.run ? `<p class="small">Последняя цель: ${S.run.progress}/${S.run.target} · ${S.run.completed?'выполнена':S.run.failed?'время истекло':'погружение завершено'}</p>` : '');
  };

  R.shop = () => {
    $('shopList').innerHTML = ITEMS.map(it => {
      const err = Game.canBuy(it), owned = Game.hasItem(it.id);
      const offer = Expansion.gearOffer(it.id), rarity = RARITY[offer.rarity];
      return `<div class="card ${owned ? 'owned' : ''}">
        <img src="${thumbs.items[it.id] || ''}" alt="">
        <div class="card-body">
          <h4>${it.name}</h4><span class="badge" style="color:${rarity.color}">${rarity.name} · улучшение ${offer.level}/3</span><p>${it.desc}</p><p class="effect">✦ ${it.effect}</p>
          <div class="card-foot"><span class="price">🪙 ${it.price}</span><span class="small muted">ур. ${it.level}+</span>
          <button class="btn small ${owned ? 'ok' : err ? '' : 'primary'}" data-buy="${it.id}" ${err ? 'disabled' : ''}>${owned ? 'Куплено ✓' : err || 'Купить'}</button></div>
          ${owned ? `<div class="gear-upgrade"><p>${offer.now}</p><p>После улучшения: ${offer.next}</p><button class="btn small primary" data-gear="${it.id}" ${offer.reason?'disabled':''}>${offer.reason || 'Улучшить · '+offer.price+' 🪙'}</button></div>` : ''}
        </div></div>`;
    }).join('');
  };

  R.upgrades = () => {
    $('upList').innerHTML = UPGRADES.map(u => {
      const err = Game.canBuyUp(u), owned = Game.hasUp(u.id);
      return `<div class="card ${owned ? 'owned' : ''}">
        <div class="card-icon">${u.icon}</div>
        <div class="card-body">
          <h4>${u.name}</h4><p class="effect">✦ ${u.effect}</p>
          <div class="card-foot"><span class="price">🪙 ${u.price}</span><span class="small muted">ур. ${u.level}+</span>
          <button class="btn small ${owned ? 'ok' : err ? '' : 'primary'}" data-up="${u.id}" ${err ? 'disabled' : ''}>${owned ? 'Построено ✓' : err || 'Построить'}</button></div>
        </div></div>`;
    }).join('');
  };

  R.inventory = () => {
    const toggles = { fins: 'fins', drone: 'drone', sub: 'sub' };
    $('invGear').innerHTML = ITEMS.map(it => {
      const own = Game.hasItem(it.id);
      let ctrl = '';
      if (own && toggles[it.id]) ctrl = `<button class="btn small ${S.equip[it.id] ? 'ok' : ''}" data-equip="${it.id}">${S.equip[it.id] ? 'Используется' : 'Снято'}</button>`;
      else if (own && it.id === 'flashlight') ctrl = '<span class="small">Клавиша F</span>';
      else if (own) ctrl = '<span class="small ok-text">Активно</span>';
      return `<div class="gear ${own ? '' : 'missing'}"><img src="${thumbs.items[it.id] || ''}" alt=""><b>${it.name}</b>${own ? ctrl : '<span class="small muted">не куплено</span>'}</div>`;
    }).join('');
    const r = S.res;
    $('invRes').innerHTML = [
      ['🌿 Образцы растений', r.sample], ['🍄 Светящиеся грибы', r.glow], ['🏺 Артефакты', r.artifact],
      ['🗑️ Мусор', r.trash], ['🦪 Найдено жемчужин', r.pearl], ['🗺️ Фрагменты карты', r.fragment + ' / 3'],
    ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('') + '<p class="small muted">Образцы, грибы и артефакты можно изучить в лаборатории на базе.</p>';
    const st = Game.stats(), md = Game.maxDepth();
    $('invStats').innerHTML = [
      ['Запас кислорода', st.o2Max], ['Здоровье', st.hpMax], ['Скорость', st.speed.toFixed(1) + ' м/с'],
      ['Допустимая глубина', md === Infinity ? 'без ограничений' : md + ' м'], ['Радиус сканирования', st.discoverR + ' м'],
      ['Защита', Math.round((1 - st.armor) * 100) + '%'], ['Спасено животных', S.stats.rescued], ['Снимков', S.stats.photos],
      ['Погружений', S.stats.dives], ['Рекорд глубины', S.stats.maxDepth + ' м'],
    ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  };

  const renderInventory = R.inventory;
  R.inventory = () => { renderInventory(); $('invRes').innerHTML += collectionHTML(); };

  R.quests = () => {
    document.querySelectorAll('#qTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === qTab));
    const canAccept = Game.mode === 'play' && Game.atBase;
    let list = [];
    if (qTab === 'active') list = QUESTS.filter(q => Quests.isActive(q.id));
    else if (qTab === 'done') list = QUESTS.filter(q => Quests.isDone(q.id));
    else list = QUESTS.filter(q => !S.quests[q.id]).sort((a, b) => (Quests.available(b.id) - Quests.available(a.id)) || a.level - b.level);
    list = list.filter(q=>qCategory==='all' || Expansion.category(q)===qCategory);
    if (!list.length) {
      $('qList').innerHTML = `<p class="muted center">${qTab === 'active' ? 'Нет активных заданий. Возьмите задание на доске заданий базы.' : qTab === 'done' ? 'Пока ничего не выполнено.' : 'Новых заданий нет — повышайте уровень и проходите сюжет.'}</p>`;
      return;
    }
    $('qList').innerHTML = list.map(q => {
      const st = S.quests[q.id];
      const badge = q.story ? '<span class="badge story">СЮЖЕТ</span>' : q.rescue ? '<span class="badge rescue">СПАСЕНИЕ</span>' : '<span class="badge">ДОП.</span>';
      let body = '', foot = '';
      if (qTab === 'active') {
        const pr = Quests.progress(q.id);
        body = '<ol class="stages">' + q.stages.map((s, i) => {
          const cls = i < st.stage ? 'done' : i === st.stage ? 'cur' : '';
          const p = i === st.stage && pr && pr.need > 1 ? ` <b>(${pr.cur}/${pr.need})</b>` : '';
          return `<li class="${cls}">${s.text}${p}</li>`;
        }).join('') + '</ol>';
        foot = S.tracked === q.id ? '<span class="small ok-text">◆ Отслеживается</span>' : `<button class="btn small" data-track="${q.id}">Отслеживать</button>`;
      } else if (qTab === 'available') {
        const lr = Quests.lockReason(q.id);
        if (lr) foot = `<span class="small muted">🔒 ${lr}</span>`;
        else foot = canAccept ? `<button class="btn small primary" data-accept="${q.id}">Принять</button>` : '<span class="small muted">Принять можно на базе (или найти под водой)</span>';
        if (q.hint) body = `<p class="small muted">${q.hint}</p>`;
      } else foot = '<span class="small ok-text">✓ Выполнено</span>';
      return `<div class="quest ${Quests.lockReason(q.id) && qTab === 'available' ? 'locked' : ''}">
        <div class="q-top">${badge}<h4>${q.title}</h4><span class="small muted">ур. ${q.level}</span></div>
        <p>${q.desc}</p><p class="small muted">${CATEGORIES[Expansion.category(q)]} · Сложность: ${q.level<=2?'лёгкая':q.level<=4?'средняя':'высокая'} · Инструменты: ${Expansion.tools(q).map(id=>ITEMS.find(i=>i.id===id).name).join(', ') || 'базовый комплект'}</p>${body}
        <div class="q-foot"><span class="reward">🪙 ${q.reward.coins} · ⭐ ${q.reward.xp} XP</span>${foot}</div></div>`;
    }).join('');
  };

  function collectionHTML() {
    return '<h3>Коллекции и груз</h3>' + COLLECTIONS.map(c=>`<div class="collection-card"><b style="color:${RARITY[c.rarity].color}">${c.icon} ${c.name}</b><p class="small">Найдено: ${S.collection[c.id]} · В грузе: ${S.cargo[c.id]} · Цена ${c.price} 🪙</p><button class="btn small" data-sell="${c.id}" ${!Game.atBase || !S.cargo[c.id]?'disabled':''}>Продать груз</button></div>`).join('') + '<p class="small muted">Продажа сохраняет коллекцию. Линза открывает секретную цепочку заданий.</p>';
  }

  R.ency = () => {
    const n = Game.discoveredCount();
    $('encyCount').textContent = `Открыто: ${n} / ${SPECIES.length}`;
    $('encyFilter').innerHTML = [['all', 'Все']].concat(ZONES.map(z => [z.id, z.name]))
      .map(([id, name]) => `<button data-ezone="${id}" class="${encyZone === id ? 'active' : ''}">${name}</button>`).join('');
    const list = SPECIES.filter(s => encyZone === 'all' || s.zone === encyZone);
    $('encyGrid').innerHTML = list.map(sp => {
      const rec = S.species[sp.id], r = RARITY[sp.rarity];
      return `<div class="sp-card ${rec ? '' : 'unknown'} ${encySel === sp.id ? 'sel' : ''}" data-sp="${sp.id}" style="--rc:${r.color}">
        <img src="${thumbs.species[sp.id] || ''}" alt=""><b>${rec ? sp.name : '???'}</b>
        <span class="small" style="color:${r.color}">${r.name}${rec && rec.photo ? ' · 📸' : ''}</span></div>`;
    }).join('');
    const sp = SPECIES.find(s => s.id === encySel) || list[0];
    if (!sp) { $('encyDetail').innerHTML = ''; return; }
    const rec = S.species[sp.id], r = RARITY[sp.rarity];
    $('encyDetail').innerHTML = rec ? `
      <img src="${thumbs.species[sp.id] || ''}" alt="">
      <h3>${sp.name}</h3>
      <div class="badge" style="background:${r.color}">${r.name}</div>
      <p>${sp.desc}</p>
      <div class="res-list"><div><span>Зона</span><b>${zoneName(sp.zone)}</b></div><div><span>Глубина обитания</span><b>${sp.depth}</b></div>
      <div><span>Фотография</span><b>${rec.photo ? '📸 есть' : 'нет'}</b></div></div>` : `
      <img src="${thumbs.species[sp.id] || ''}" class="unknown" alt="">
      <h3>???</h3><div class="badge" style="background:${r.color}">${r.name}</div>
      <p class="muted">Вид ещё не обнаружен. Обитает в зоне «${zoneName(sp.zone)}» (${sp.depth}).${sp.rarity === 'epic' || sp.rarity === 'legendary' ? ' Для распознавания нужен сканер.' : ''}</p>`;
  };

  R.lab = () => {
    const rows = Object.keys(Game.STUDY).map(k => {
      const [c, x, name] = Game.STUDY[k], n = S.res[k];
      return `<div class="lab-row"><span>${name}</span><b>×${n}</b><span class="small muted">+${c} 🪙 / +${x} XP за шт.</span>
        <button class="btn small ${n ? 'primary' : ''}" data-study="${k}" ${n ? '' : 'disabled'}>Изучить</button></div>`;
    }).join('');
    const frags = [0, 1, 2].map(i => `<div class="frag ${S.res.fragment > i ? 'have' : ''}">${S.res.fragment > i ? '🗺️' : '?'}</div>`).join('');
    const journal = QUESTS.filter(q => q.story && Quests.isDone(q.id)).map(q => `<div class="journal"><b>${q.title}</b><p>${q.doneText}</p></div>`).join('');
    $('labContent').innerHTML = `
      <div class="lab-grid">
        <div><h3>Изучение находок</h3>${rows}
          <button class="btn primary" data-study="all">Изучить всё</button>
          <h3>Древняя карта</h3><div class="frags">${frags}</div>
          <p class="small muted">${S.res.fragment >= 3 ? 'Карта собрана! Она указывает на сооружение в Бездне.' : 'Фрагменты карты находятся по сюжету.'}</p></div>
        <div><h3>📔 Журнал исследований</h3>${journal || '<p class="muted">Записей пока нет. Выполняйте сюжетные задания.</p>'}</div>
      </div>`;
  };

  const renderLab = R.lab;
  R.lab = () => { renderLab(); $('labContent').innerHTML += collectionHTML(); };

  R.settings = () => {
    $('setVolume').value = SETTINGS.volume;
    $('setAmbient').value = SETTINGS.ambient;
    $('setSens').value = SETTINGS.sensitivity;
    $('setInvert').checked = SETTINGS.invertY;
    $('setFirst').checked = SETTINGS.firstPerson;
    $('setFps').checked = SETTINGS.showFps;
    $('setQuality').value = SETTINGS.quality;
    $('setCharacter').value = SETTINGS.character;
    $('setCharacterDesc').textContent = Characters.get(SETTINGS.character).desc;
  };
  R.ending = () => { $('endText').innerHTML = esc(STORY_ENDING).replace(/\n/g, '<br>'); };
  R.map = () => drawMap();

  // ---------- Карта ----------
  const D0 = -60, D1 = 1010, X0 = -120, X1 = 120;
  let mapImg = null;
  function buildMapImage(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), L = Math.log(1301);
    for (let py = 0; py < h; py++) {
      const x = X0 + py / h * (X1 - X0);
      for (let px = 0; px < w; px++) {
        const z = -(D0 + px / w * (D1 - D0));
        const y = World.floorY(x, z), sh = (World.floorY(x - 1, z + 1) - y) * 6;
        const i = (py * w + px) * 4;
        if (y > 0) { img.data[i] = 190 + sh; img.data[i + 1] = 180 + sh; img.data[i + 2] = 140 + sh; }
        else {
          const t = Math.log(1 + toDepth(y)) / L;
          img.data[i] = (110 * (1 - t) + 4 * t) + sh;
          img.data[i + 1] = (225 * (1 - t) + 10 * t) + sh;
          img.data[i + 2] = (255 * (1 - t) + 35 * t) + sh;
        }
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function drawMap() {
    const cv = $('mapCanvas'), ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    if (!mapImg) mapImg = buildMapImage(w, h);
    ctx.drawImage(mapImg, 0, 0);
    const P = (x, z) => [(-z - D0) / (D1 - D0) * w, (x - X0) / (X1 - X0) * h];
    ctx.font = '600 13px "Exo 2", sans-serif';
    ctx.textBaseline = 'middle';
    ZONES.forEach(z => {
      const [x0] = P(0, z.z[0]), [x1] = P(0, z.z[1]);
      const ok = Game.zoneUnlocked(z);
      ctx.fillStyle = ok ? 'rgba(0,0,0,0)' : 'rgba(0,10,25,0.45)';
      ctx.fillRect(x0, 0, x1 - x0, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, h); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = z.color;
      ctx.fillText((ok ? '' : '🔒 ') + z.name, x0 + 6, 12);
    });
    const icon = (txt, x, z, size = 16) => { const [px, py] = P(x, z); ctx.font = size + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(txt, px, py); ctx.textAlign = 'left'; };
    icon('🏠', 0, 20, 18);
    // Unvisited cells remain hidden even inside an unlocked zone.
    ctx.fillStyle='rgba(2,9,20,0.93)';
    for(let x=-120;x<120;x+=20) for(let z=55;z>-1025;z-=20) if(!Expansion.isExplored(x+10,z-10)) {
      const [a,b]=P(x,z), [c,d]=P(x+20,z-20); ctx.fillRect(a,b,c-a+1,d-b+1);
    }
    icon('🏠', 0, 20, 18);
    DIVE_POINTS.slice(1).filter(d=>S.zones.includes(d.zone)).forEach(d => icon('⚓', d.pos[0], d.pos[2], 13));
    World.W.o2vents.filter(v=>Expansion.isExplored(v.x,v.z)).forEach(v => icon('🫧', v.x, v.z, 13));
    for(const [id,pos] of [['cave',World.W.poi.secretCave],['archive',World.W.poi.secretArchive],['anna',World.W.poi.annaWreck]]) if(S.locations.includes(id)) icon(id==='anna'?'⚓':'◈',pos.x,pos.z,18);
    for(const id of S.locations.filter(id=>id.startsWith('cave@'))) {const [x,z]=id.slice(5).split(',').map(Number);if(Number.isFinite(x)&&Number.isFinite(z)) icon('◈',x,z,16);}
    for(const c of Object.values(Creatures.special)) if(c && c.pos && c.state==='trapped' && Expansion.isExplored(c.pos.x,c.pos.z)) icon('🐾',c.pos.x,c.pos.z,15);
    if (Game.hasUp('sonar')) {
      Game.objects.forEach(o => {
        if (!Game.isObjActive(o) || !Expansion.isExplored(o.pos.x,o.pos.z)) return;
        if (o.group === 'treasure') icon('💰', o.pos.x, o.pos.z, 13);
        else if (o.group === 'o2') icon('·', o.pos.x, o.pos.z, 20);
      });
    }
    Quests.activeList().forEach(id => {
      const t = Quests.target(id);
      if (t) { ctx.fillStyle = id === S.tracked ? '#5fffe0' : '#ffd23a'; icon(id === S.tracked ? '★' : '◆', t.x, t.z, id === S.tracked ? 20 : 14); }
    });
    if (S.waypoint) {
      const point = S.waypoint.pos;
      ctx.fillStyle = '#ffc83a';
      icon('📍', point[0], point[2], 22);
      $('mapRouteInfo').textContent = (S.waypoint.kind === 'base' ? 'База «Аква-1»' : 'Ваша метка') + ' · глубина ' + Math.round(toDepth(point[1])) + ' м';
    } else $('mapRouteInfo').textContent = 'Компас показывает отслеживаемое задание. Выберите свою точку на карте.';
    $('clearRoute').disabled = !S.waypoint;
    $('mapEventRoute').disabled = !Expansion.eventTarget();
    $('followRoute').disabled = !S.waypoint || Game.mode !== 'play' || Game.atBase;
    document.querySelector('[data-act="routebase"]').disabled = Game.mode !== 'play';
    if (Game.mode === 'play') {
      const pp = Player.obj.position, [px, py] = P(pp.x, pp.z);
      ctx.save(); ctx.translate(px, py); ctx.rotate(-Player.yaw);
      ctx.fillStyle = '#ff5f7a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // Профиль глубины
    const pc = $('profileCanvas'), p = pc.getContext('2d'), pw = pc.width, ph = pc.height, MAXD = 1350;
    p.fillStyle = '#04101f'; p.fillRect(0, 0, pw, ph);
    const DY = d => d / MAXD * (ph - 10) + 5;
    ZONES.forEach(z => {
      p.fillStyle = z.color + '22';
      p.fillRect(0, DY(z.min), pw, DY(Math.min(MAXD, z.max)) - DY(z.min));
      p.fillStyle = z.color; p.font = '11px "Exo 2", sans-serif';
      p.fillText(z.name + ' ' + z.min + ' м', 4, DY(z.min) + 10);
    });
    p.beginPath(); p.moveTo(0, ph);
    for (let px = 0; px <= pw; px += 4) p.lineTo(px, DY(toDepth(World.floorY(0, -(D0 + px / pw * (D1 - D0))))));
    p.lineTo(pw, ph); p.closePath(); p.fillStyle = '#5a4a3a'; p.fill();
    const md = Game.maxDepth();
    if (md !== Infinity) {
      p.strokeStyle = '#ff5f7a'; p.setLineDash([6, 4]); p.beginPath(); p.moveTo(0, DY(md)); p.lineTo(pw, DY(md)); p.stroke(); p.setLineDash([]);
      p.fillStyle = '#ff5f7a'; p.fillText('Предел снаряжения: ' + md + ' м', pw - 190, DY(md) - 6);
    }
    if (Game.mode === 'play') {
      const pp = Player.obj.position;
      p.fillStyle = '#5fffe0'; p.beginPath(); p.arc((-pp.z - D0) / (D1 - D0) * pw, DY(toDepth(pp.y)), 5, 0, Math.PI * 2); p.fill();
    }
    $('mapLegend').innerHTML = '🏠 база · ⚓ буй погружения · 🫧 кислородная станция · ★ отслеживаемая цель · ◆ другие задания' + (Game.hasUp('sonar') ? ' · 💰 сокровища (сонар)' : ' · 📡 постройте сонарную рубку, чтобы видеть сокровища');
    $('mapLegend').innerHTML += ' · ◈ открытая пещера · 🐾 спасение · тёмные участки ещё не исследованы';
    $('mapDivePoints').innerHTML = Game.atBase ? DIVE_POINTS.map(d=>`<button class="btn small" data-dive="${d.id}" ${Game.zoneUnlocked(ZONES.find(z=>z.id===d.zone))?'':'disabled'}>${d.name}</button>`).join('') : '<p class="small muted">Выбирать точки погружения можно на базе.</p>';
  }

  // ---------- HUD ----------
  const compassMarks = [];
  function buildCompass() {
    const box = $('compassMarks');
    const names = { 0: 'С', 45: 'СВ', 90: 'В', 135: 'ЮВ', 180: 'Ю', 225: 'ЮЗ', 270: 'З', 315: 'СЗ' };
    for (let a = 0; a < 360; a += 15) {
      const el = document.createElement('div');
      el.className = names[a] !== undefined ? 'cm label' : 'cm';
      el.textContent = names[a] !== undefined ? names[a] : '';
      box.appendChild(el);
      compassMarks.push([a, el]);
    }
  }
  const norm = a => { a %= 360; if (a > 180) a -= 360; if (a < -180) a += 360; return a; };

  function hud(dt) {
    // Компас — каждый кадр
    const heading = -Player.yaw * 180 / Math.PI;
    compassMarks.forEach(([a, el]) => {
      const d = norm(a - heading);
      el.style.display = Math.abs(d) <= 90 ? '' : 'none';
      el.style.left = (50 + d / 90 * 50) + '%';
    });
    const pp = Player.obj.position, tg = Game.target, ct = $('compassTarget');
    if (tg) {
      const b = Math.atan2(tg.x - pp.x, -(tg.z - pp.z)) * 180 / Math.PI;
      const d = Math.max(-90, Math.min(90, norm(b - heading)));
      ct.style.display = ''; ct.style.left = (50 + d / 90 * 50) + '%';
    } else ct.style.display = 'none';

    fpsN++; fpsT += dt;
    hudT -= dt;
    if (hudT > 0) return;
    hudT = 0.1;
    const st = Game.stats();
    $('hCoins').textContent = S.coins;
    $('hExp').textContent = Game.expedition > 0 ? ` +${Game.expedition}` : '';
    $('hLevel').textContent = S.level;
    const need = xpForLevel(S.level);
    $('hXp').style.width = (S.xp / need * 100) + '%';
    $('hXpText').textContent = `${S.xp} / ${need} XP`;
    $('hDepth').textContent = Math.round(Game.depth);
    const z = Game.zone;
    $('hZone').textContent = z.name;
    $('hZone').style.color = z.color;
    const md = Game.maxDepth();
    $('hMaxDepth').textContent = md === Infinity ? '∞' : md;
    $('hMaxDepth').parentElement.classList.toggle('danger-text', Game.overDepth);
    const o2k = Math.max(0, Game.o2 / st.o2Max), hpk = Math.max(0, Game.hp / st.hpMax);
    $('hO2').style.width = (o2k * 100) + '%';
    $('hO2').parentElement.classList.toggle('low', o2k < 0.3);
    $('hO2t').textContent = Math.ceil(Game.o2);
    $('hHp').style.width = (hpk * 100) + '%';
    $('hHp').parentElement.classList.toggle('low', hpk < 0.3);
    $('hHpt').textContent = Math.ceil(Game.hp);
    const status = [Player.flashOn ? '🔦 Фонарь: вкл' : '🔦 Фонарь: выкл (F)'];
    if (st.drone) status.push('🤖 Дрон');
    if (Game.subActive()) status.push('🚤 Субмарина');
    if (Player.atSurface) status.push('🌤 Поверхность: дыхание');
    $('hStatus').textContent = status.join(' · ');
    const run=S.run, mode=MODES.find(m=>m.id===S.mode);
    $('expeditionHud').innerHTML = `<b>${mode.name}</b><br>${run ? 'Цель: '+run.progress+'/'+run.target+(run.completed?' ✓':run.failed?' · время истекло': ['expedition','treasure','abyss'].includes(run.id)?' · '+Math.ceil(run.remaining)+' с':'') : 'Выберите режим на базе'}` + (S.event ? `<br>📡 Событие · ${Math.ceil(S.event.remaining)} с ${Expansion.eventTarget()?'<button class="btn small" data-act="eventroute">К событию</button>':''}` : '');
    $('hDetector').classList.toggle('hidden', Game.detector < 0 && !Game.hasItem('detector'));
    $('hDetBar').style.width = (Math.max(0, Game.detector) * 100) + '%';

    // Задание
    const tq = Quests.tracked();
    if (tq) {
      const q = Quests.def(tq), s = Quests.stage(tq), pr = Quests.progress(tq);
      $('hQTitle').textContent = q.title;
      $('hQStage').textContent = s ? s.text : '';
      $('hQBar').style.width = pr ? (pr.cur / pr.need * 100) + '%' : '0%';
      $('hQProg').textContent = pr && pr.need > 1 ? `${pr.cur} / ${pr.need}` : `Этап ${S.quests[tq].stage + 1} из ${q.stages.length}`;
    } else {
      $('hQTitle').textContent = 'Нет отслеживаемого задания';
      $('hQStage').textContent = 'Возьмите задание на доске заданий базы (Q — журнал)';
      $('hQBar').style.width = '0%';
      $('hQProg').textContent = '';
    }
    if (tg) {
      const dist = Math.round(tg.distanceTo(pp)), dy = Math.round((tg.y - pp.y) * DEPTH_SCALE);
      $('targetInfo').textContent = `${S.waypoint ? '📍' : '◆'} ${Game.targetLabel || 'Цель'} · ${dist} м` + (Math.abs(dy) > 10 ? (dy > 0 ? ` · ↑ выше на ${dy} м` : ` · ↓ глубже на ${-dy} м`) : '');
    } else $('targetInfo').textContent = '';

    // Подсказка
    const pr = Game.prompt, pe = $('prompt');
    if (pr && !isBlocking()) {
      pe.classList.remove('hidden');
      pe.classList.toggle('blocked', !!pr.blocked);
      $('promptText').textContent = pr.blocked ? `${pr.label} — ${pr.blocked}` : (pr.hold > 0 ? 'Удерживайте: ' : '') + pr.label;
      $('holdBar').style.display = pr.hold > 0 && !pr.blocked ? '' : 'none';
      $('holdFill').style.width = (pr.hold > 0 ? Game.hold / pr.hold * 100 : 0) + '%';
    } else pe.classList.add('hidden');
    $('lockHint').classList.toggle('hidden', !!document.pointerLockElement || isBlocking());

    // Затемнение / тревога
    const v = $('vignette');
    v.style.opacity = Math.min(0.85, 0.25 + Game.depth / 1500);
    v.classList.toggle('alarm', o2k < 0.15 || hpk < 0.25 || Game.overDepth);

    if (SETTINGS.showFps && fpsT > 0.5) { $('fps').textContent = Math.round(fpsN / fpsT) + ' FPS'; fpsN = 0; fpsT = 0; }
    $('fps').classList.toggle('hidden', !SETTINGS.showFps);
  }

  // ---------- Кнопки ----------
  function onClick(e) {
    const t = e.target.closest('[data-open],[data-back],[data-act],[data-buy],[data-up],[data-equip],[data-tab],[data-accept],[data-track],[data-ezone],[data-sp],[data-study],[data-dive],[data-gear],[data-mode],[data-sell]');
    if (!t || t.disabled) return;
    Sound.init();
    const d = t.dataset;
    if(d.gear) { const r=Expansion.upgradeGear(d.gear); toast(r.msg,r.ok?'good':'bad'); render('shop'); return; }
    if(d.mode) { Expansion.selectMode(d.mode); render('base'); return; }
    if(d.sell) { const r=Expansion.sell(d.sell); toast(r.msg,r.ok?'good':'bad'); render(top()); return; }
    if (d.open) { open(d.open); return; }
    if (d.back !== undefined) { Sound.play('click'); back(); return; }
    if (d.buy) { const r = Game.buyItem(d.buy); toast(r.msg, r.ok ? 'good' : 'bad'); render('shop'); return; }
    if (d.up) { const r = Game.buyUpgrade(d.up); toast(r.msg, r.ok ? 'good' : 'bad'); render('upgrades'); return; }
    if (d.equip) { Game.toggleEquip(d.equip); render('inventory'); return; }
    if (d.tab) { qTab = d.tab; render('quests'); Sound.play('click'); return; }
    if (d.accept) { Quests.accept(d.accept); if (top() === 'quests') render('quests'); return; }
    if (d.track) { S.tracked = d.track; Game.clearWaypoint(false); render('quests'); Sound.play('click'); return; }
    if (d.ezone) { encyZone = d.ezone; encySel = null; render('ency'); return; }
    if (d.sp) { encySel = d.sp; render('ency'); Sound.play('click'); return; }
    if (d.study) {
      const kinds = d.study === 'all' ? Object.keys(Game.STUDY) : [d.study];
      let any = false;
      kinds.forEach(k => { const r = Game.study(k); if (r.ok) { any = true; toast(r.msg, 'good'); } });
      if (!any) toast('Нечего изучать — соберите образцы под водой', 'info');
      render('lab'); return;
    }
    if (d.dive) { Game.dive(d.dive); return; }
    switch (d.act) {
      case 'play': Game.startGame(S.started ? false : 'first'); break;
      case 'newgame':
        if (S.started) confirm('Начать новую игру? Весь текущий прогресс будет удалён.', () => Game.startGame(true));
        else Game.startGame(true);
        break;
      case 'resume': resume(); break;
      case 'save': toast(Save.save() ? '💾 Игра сохранена' : 'Не удалось сохранить', 'good'); break;
      case 'tomenu': Game.toMenu(); break;
      case 'reset': confirm('Удалить весь прогресс без возможности восстановления?', () => { Save.reset(); location.reload(); }); break;
      case 'dlgok': back(); break;
      case 'cfyes': { const cb = confirmCb; confirmCb = null; back(); if (cb) cb(); break; }
      case 'failok': Game.enterBase(); break;
      case 'endok': resume(); break;
      case 'routebase': Game.setWaypoint(0, 0, 'base'); render('map'); break;
      case 'clearroute': Game.clearWaypoint(); render('map'); break;
      case 'followroute': if (S.waypoint && !Game.atBase) resume(); break;
      case 'eventroute': { const point=Expansion.eventTarget(); if(point) { S.waypoint={pos:point.toArray(),kind:'custom'}; Game.refreshTarget(); Save.save(); toast('Направление события на компасе','good'); if(top()==='map') render('map'); } break; }
    }
  }

  function bindSettings() {
    const on = (id, ev, fn) => $(id).addEventListener(ev, e => { fn(e.target); Save.saveSettings(); });
    on('setVolume', 'input', el => { SETTINGS.volume = +el.value; Sound.applySettings(); });
    on('setAmbient', 'input', el => { SETTINGS.ambient = +el.value; Sound.applySettings(); });
    on('setSens', 'input', el => { SETTINGS.sensitivity = +el.value; });
    on('setInvert', 'change', el => { SETTINGS.invertY = el.checked; });
    on('setFirst', 'change', el => { SETTINGS.firstPerson = el.checked; Game.applyGear(); });
    on('setFps', 'change', el => { SETTINGS.showFps = el.checked; });
    on('setQuality', 'change', el => { SETTINGS.quality = el.value; if (window.applyQuality) window.applyQuality(); });
    $('setCharacter').innerHTML = CHARACTERS.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    on('setCharacter', 'change', el => {
      SETTINGS.character = el.value;
      $('setCharacterDesc').textContent = Characters.get(el.value).desc;
      Game.applyGear();
    });
  }

  function init() {
    SPECIES.forEach(sp => { thumbs.species[sp.id] = Models.thumbnail(Models.creature(sp.model)); });
    ITEMS.forEach(it => { thumbs.items[it.id] = Models.thumbnail(Models.item(it.id), it.id === 'sub' ? new THREE.Vector3(1, 0.5, 1) : null); });
    buildCompass();
    bindSettings();
    $('questCategory').innerHTML = '<option value="all">Все задания</option>' + Object.entries(CATEGORIES).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
    $('questCategory').addEventListener('change',e=>{qCategory=e.target.value; render('quests');});
    $('mapCanvas').addEventListener('click', e => {
      const rect = e.currentTarget.getBoundingClientRect();
      const z = -(D0 + (e.clientX - rect.left) / rect.width * (D1 - D0));
      const x = X0 + (e.clientY - rect.top) / rect.height * (X1 - X0);
      Game.setWaypoint(x, z);
      render('map');
    });
    document.addEventListener('click', onClick);
  }

  return { init, lockPointer, open, back, closeAll, isBlocking, top, toggle, resume, dialog, confirm, toast, banner, flash, hurt, coinPop, showHud, showFail, hud, render };
})();
