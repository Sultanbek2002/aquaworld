'use strict';
// ============================================================
//  Игровая логика: экономика, кислород, здоровье, зоны,
//  взаимодействие с объектами, открытие видов, фото, база
// ============================================================

const Game = (() => {
  const V3 = THREE.Vector3;
  const G = {
    mode: 'menu',          // 'menu' | 'play'
    time: 0, o2: 120, hp: 100, depth: 0, zone: ZONES[0],
    expedition: 0,         // монеты, заработанные в текущем погружении
    objects: [], atBase: false,
    prompt: null, hold: 0, holdTarget: null,
    lastDamage: -10, warnT: 0, discoverT: 0, saveT: 0, pingT: 0, detector: -1,
  };
  let scene, marker;
  const tmp = new V3();
  const msgCooldown = {};
  const throttled = (key, sec, fn) => { if ((msgCooldown[key] || -99) + sec < G.time) { msgCooldown[key] = G.time; fn(); } };

  const hasItem = id => S.items.includes(id);
  const hasUp = id => S.upgrades.includes(id);
  const subActive = () => hasItem('sub') && S.equip.sub;

  function stats() {
    let o2Max = hasItem('sub') && subActive() ? 600 : hasItem('deepsuit') ? 320 : hasItem('scuba') ? 220 : 120;
    if (hasUp('compressor')) o2Max = Math.round(o2Max * 1.3);
    const hpMax = 100 + (hasItem('deepsuit') ? 50 : 0) + (hasUp('quarters') ? 25 : 0) + (subActive() ? 50 : 0);
    const fins = hasItem('fins') && S.equip.fins;
    const result = {
      o2Max, hpMax,
      speed: 6 * (subActive() ? 2.2 : fins ? 1.45 : 1),
      vspeed: 5 * (subActive() ? 1.6 : fins ? 1.2 : 1),
      discoverR: hasItem('scanner') ? 26 : 11,
      armor: subActive() ? 0.3 : hasItem('deepsuit') ? 0.5 : 1,
      drone: hasItem('drone') && S.equip.drone,
    };
    return typeof Expansion !== 'undefined' ? Expansion.applyStats(result) : result;
  }

  // ---------- Зоны и допустимая глубина ----------
  function zoneUnlocked(z) {
    const r = z.req;
    return (!r.item || hasItem(r.item)) && (r.item !== 'sub' || subActive()) && (!r.upgrade || hasUp(r.upgrade)) && (!r.quest || Quests.isDone(r.quest));
  }
  function maxDepth() {
    let m = 55;
    for (const z of ZONES) { if (zoneUnlocked(z)) m = z.max === Infinity ? Infinity : z.max + 5; else break; }
    return m;
  }
  function zoneMissing(z) {
    const r = z.req, out = [];
    if (r.item && !hasItem(r.item)) out.push('купить «' + ITEMS.find(i => i.id === r.item).name + '»');
    if (r.item === 'sub' && hasItem('sub') && !subActive()) out.push('включить мини-субмарину в инвентаре');
    if (r.upgrade && !hasUp(r.upgrade)) out.push('построить «' + UPGRADES.find(i => i.id === r.upgrade).name + '»');
    if (r.quest && !Quests.isDone(r.quest)) out.push('выполнить «' + Quests.def(r.quest).title + '»');
    return out;
  }
  const zoneByDepth = d => ZONES.find(z => d < z.max) || ZONES[ZONES.length - 1];
  const nextLockedZone = () => ZONES.find(z => !zoneUnlocked(z));

  // A personal waypoint temporarily takes priority over the tracked quest.
  function refreshTarget() {
    const tq = Quests.tracked();
    G.target = S.waypoint ? new V3(...S.waypoint.pos) : tq ? Quests.target(tq) : null;
    G.targetLabel = S.waypoint ? (S.waypoint.kind === 'base' ? 'База «Аква-1»' : 'Ваша метка') : 'Цель задания';
  }
  function setWaypoint(x, z, kind = 'custom') {
    if (G.mode !== 'play') { UI.toast('Начните игру, чтобы выбрать маршрут', 'info'); return false; }
    let p;
    if (kind === 'base') p = World.W.poi.base.clone();
    else {
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 108 || z < -1000 || z > 55) {
        UI.toast('Выберите точку внутри океана', 'bad'); return false;
      }
      const zone = ZONES.find(zone => z <= zone.z[0] && z >= zone.z[1]);
      if (zone && !zoneUnlocked(zone)) {
        UI.toast('Зона закрыта: ' + zoneMissing(zone).join(', '), 'bad'); return false;
      }
      p = new V3(x, Math.min(-0.6, World.floorY(x, z) + 2), z);
      if (toDepth(p.y) > maxDepth()) { UI.toast('Для этой точки нужно более мощное снаряжение', 'bad'); return false; }
    }
    S.waypoint = { pos: p.toArray(), kind: kind === 'base' ? 'base' : 'custom' };
    refreshTarget(); Save.save();
    UI.toast('📍 ' + G.targetLabel + ' — направление на компасе', 'good');
    return true;
  }
  function clearWaypoint(notify = true) {
    S.waypoint = null; refreshTarget(); Save.save();
    if (notify) UI.toast('Метка снята. Компас снова показывает цель задания', 'info');
  }

  // ---------- Монеты и опыт ----------
  function addCoins(n) {
    if (!n) return;
    S.coins += n;
    if (G.mode === 'play' && n > 0) G.expedition += n;
    Sound.play('coin');
    UI.coinPop(n);
  }
  function addXP(n) {
    S.xp += n;
    let need = xpForLevel(S.level);
    while (S.xp >= need) {
      S.xp -= need;
      S.level++;
      need = xpForLevel(S.level);
      Sound.play('level');
      const items = ITEMS.filter(i => i.level === S.level).map(i => i.name);
      const quests = QUESTS.filter(q => q.level === S.level).map(q => q.title);
      UI.banner(`Уровень ${S.level}!`, [items.length ? 'Снаряжение: ' + items.join(', ') : '', quests.length ? 'Задания: ' + quests.join(', ') : ''].filter(Boolean).join(' · ') || 'Вы стали опытнее');
    }
  }

  // ---------- Магазин ----------
  function canBuy(it) {
    if (hasItem(it.id)) return 'Куплено';
    if (S.level < it.level) return `Нужен уровень ${it.level}`;
    if (it.requires && !hasItem(it.requires)) return `Нужно: ${ITEMS.find(i => i.id === it.requires).name}`;
    if (S.coins < it.price) return 'Не хватает монет';
    return null;
  }
  function buyItem(id) {
    const it = ITEMS.find(i => i.id === id);
    if (!it) return { ok: false, msg: 'Предмет не найден' };
    const err = canBuy(it);
    if (err) { Sound.play('error'); return { ok: false, msg: err }; }
    S.coins -= it.price;
    S.items.push(id);
    applyGear();
    const st = stats();
    G.o2 = st.o2Max; G.hp = Math.min(G.hp + 50, st.hpMax);
    Sound.play('coin');
    Save.save();
    return { ok: true, msg: `Куплено: ${it.name}` };
  }
  function canBuyUp(u) {
    if (hasUp(u.id)) return 'Построено';
    if (S.level < u.level) return `Нужен уровень ${u.level}`;
    if (u.requiresItem && !hasItem(u.requiresItem)) return `Нужно: ${ITEMS.find(i => i.id === u.requiresItem).name}`;
    if (S.coins < u.price) return 'Не хватает монет';
    return null;
  }
  function buyUpgrade(id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return { ok: false, msg: 'Улучшение не найдено' };
    const err = canBuyUp(u);
    if (err) { Sound.play('error'); return { ok: false, msg: err }; }
    S.coins -= u.price;
    S.upgrades.push(id);
    World.setUpgrades(S.upgrades);
    applyGear();
    Sound.play('level');
    Save.save();
    return { ok: true, msg: `Построено: ${u.name}` };
  }
  function toggleEquip(key) {
    S.equip[key] = !S.equip[key];
    applyGear();
    Save.save();
  }
  function applyGear() {
    const st = stats();
    Player.setGear({ inSub: subActive(), deepsuit: hasItem('deepsuit'), flashlight: hasItem('flashlight') });
    G.o2 = Math.min(G.o2, st.o2Max);
    G.hp = Math.min(G.hp, st.hpMax);
  }

  // ---------- Лаборатория ----------
  const STUDY = { sample: [25, 12, 'Образцы растений'], glow: [60, 30, 'Светящиеся грибы'], artifact: [150, 60, 'Артефакты'], trash: [5, 2, 'Мусор (переработка)'] };
  function study(kind) {
    const v = STUDY[kind], n = S.res[kind];
    if (!v || n <= 0) return { ok: false, msg: 'Нечего изучать' };
    S.res[kind] = 0;
    S.stats.studied += n;
    addCoins(v[0] * n);
    addXP(v[1] * n);
    Save.save();
    return { ok: true, msg: `Изучено: ${v[2]} ×${n} · +${v[0] * n} 🪙 · +${v[1] * n} XP` };
  }

  // ---------- Энциклопедия ----------
  const discoveredCount = () => Object.keys(S.species).length;
  function discover(sp) {
    if (S.species[sp.id]) return;
    if (!hasItem('scanner') && !hasItem('camera')) return;
    S.species[sp.id] = { seen: true, photo: false };
    const r = RARITY[sp.rarity];
    addCoins(r.coins);
    addXP(r.xp);
    Expansion.onDiscover(sp);
    Sound.play('pickup');
    UI.toast(`📖 Новый вид: <b style="color:${r.color}">${sp.name}</b> (${r.name}) · +${r.coins} 🪙`, 'good');
    Save.save();
  }
  function photo(c) {
    const sp = c.sp, rec = S.species[sp.id];
    if (!rec || rec.photo) return;
    rec.photo = true;
    S.stats.photos++;
    const r = RARITY[sp.rarity];
    const photoReward = Math.round(r.photo * (1 + Expansion.gearLevel('camera') * 0.25));
    addCoins(photoReward);
    addXP(Math.round(r.xp / 2));
    Sound.play('photo');
    UI.flash();
    UI.toast(`📸 Снимок: ${sp.name} · +${photoReward} 🪙`, 'good');
    Save.save();
  }

  // ---------- Объекты мира ----------
  function objPos(d) {
    if (d.abs) return new V3(d.abs[0], d.abs[1], d.abs[2]);
    if (d.poi) return World.W.poi[d.poi].clone();
    return new V3(d.at[0], World.floorY(d.at[0], d.at[1]) + d.at[2], d.at[1]);
  }
  function addObject(d, variant) {
    const o = Object.assign({ kind: 'object', once: true, taken: false }, d);
    o.pos = objPos(d);
    o.radius = d.radius || (o.kind === 'pickup' ? 2.4 : 3.6);
    if (d.model) {
      o.mesh = Models.pickup(d.model, variant);
      o.mesh.position.copy(o.pos);
      o.baseY = o.pos.y;
      if (d.model === 'trash' || d.model === 'chest' || d.model === 'oyster' || d.model === 'jar') o.mesh.rotation.y = Math.random() * 6;
      if (d.needDetector) o.mesh.position.y -= 0.3;
      scene.add(o.mesh);
    }
    if (o.group === 'beacon') {
      o.placed = Models.pickup('beacon');
      o.placed.position.copy(o.pos);
      o.placed.visible = false;
      scene.add(o.placed);
    }
    G.objects.push(o);
    return o;
  }
  function buildObjects() {
    OBJECTS.forEach((d, i) => addObject(d, i % 3));
    // Повторяемые ресурсы (восстанавливаются после возвращения на базу)
    let resourceSeed = 7319;
    const rnd = (a, b) => {
      resourceSeed = (Math.imul(resourceSeed, 1664525) + 1013904223) >>> 0;
      return a + resourceSeed / 4294967296 * (b - a);
    };
    const spread = (zone, n, make) => {
      const r = REGIONS[zone];
      for (let i = 0; i < n; i++) {
        // Leave enough clearance for both a diver and a mini-submarine.
        for (let attempt = 0; attempt < 100; attempt++) {
          const x = rnd(-80, 80), z = rnd(r.z[0], r.z[1]);
          const p = new V3(x, World.floorY(x, z) + 0.25, z);
          if (World.W.colliders.some(c => p.distanceToSquared(c.c) < (c.r + 3.5) ** 2)) continue;
          if (World.W.hazards.some(h => Math.hypot(x - h.c.x, z - h.c.z) < h.r + 3)) continue;
          make(i, x, z);
          break;
        }
      }
    };
    let k = 0;
    const res = (kind, x, z, extra) => addObject(Object.assign({ id: 'r' + (k++), group: kind, at: [x, z, kind === 'o2' ? 2.5 : 0.25], model: kind, kind: 'pickup', once: false, repeat: true }, extra));
    [['reef', 14], ['kelp', 10], ['wreck', 8]].forEach(([z, n]) => spread(z, n, (i, x, zz) => res('oyster', x, zz, { coins: 20, res: 'pearl' })));
    [['reef', 4], ['kelp', 5], ['wreck', 5], ['caves', 6], ['abyss', 6]].forEach(([z, n]) => spread(z, n, (i, x, zz) => res('o2', x, zz, { o2: 40 })));
    [['reef', 6], ['kelp', 8]].forEach(([z, n]) => spread(z, n, (i, x, zz) => res('algae', x, zz, { res: 'sample' })));
    World.W.o2vents.forEach((p, i) => addObject({ id: 'vent' + i, group: 'vent', abs: [p.x, p.y, p.z], kind: 'vent', once: false, repeat: true, label: 'Пополнить кислород', hold: 1.2, radius: 4 }));
  }
  const groupObjects = g => G.objects.filter(o => o.group === g);
  const isCollected = o => o.once ? S.collected.includes(o.id) : o.taken;

  function isObjActive(o) {
    if (o.eventId && (!S.event || S.event.id !== o.eventId || S.event.done)) return false;
    if (o.modeObject && (!S.run || S.run.failed || S.run.completed)) return false;
    if (isCollected(o)) return false;
    if (o.kind === 'vent') return !(o.cool > G.time);
    if (o.quest && o.stageOnly) { const sg = Quests.stage(o.quest); return !!sg && sg.group === o.group; }
    if (o.needDetector && !hasItem('detector')) return false;
    if (o.id === 'calf' && Creatures.special.calf.state !== 'waiting') return false;
    return true;
  }

  function refreshObjects() {
    const pp = Player.obj.position;
    for (const o of G.objects) {
      const act = isObjActive(o);
      if (o.mesh) o.mesh.visible = act && (!o.needDetector || o.pos.distanceToSquared(pp) < 30 * 30);
      if (o.placed) o.placed.visible = isCollected(o);
    }
    World.setPillar(0, S.collected.includes('pillarLight'));
    World.setPillar(1, S.collected.includes('pillarGuard'));
    World.setPillar(2, ['orb0', 'orb1', 'orb2'].every(id => S.collected.includes(id)));
    World.setCoreDone(S.collected.includes('core'));
  }

  // Причина, по которой нельзя взаимодействовать
  function blockReason(o) {
    if (S.mode === 'expedition' && (o.o2 || o.kind === 'vent')) return 'Экспедиция: кислород пополняется только на базе';
    if (o.quest && !Quests.isActive(o.quest)) {
      const r = Quests.lockReason(o.quest);
      if (r && !Quests.isDone(o.quest)) return r;
    }
    if (o.tool && !hasItem(o.tool)) return 'Нужно: ' + ITEMS.find(i => i.id === o.tool).name;
    if (o.cond === 'light' && !Player.flashOn) return 'Включите фонарь (F)';
    return null;
  }

  function collect(o) {
    if (o.quest && !Quests.isActive(o.quest)) {
      if (Quests.available(o.quest)) Quests.accept(o.quest, true);
      else if (!Quests.isDone(o.quest)) return;
    }
    if (o.once) S.collected.push(o.id); else o.taken = true;
    if (o.kind === 'vent') {
      o.taken = false; o.cool = G.time + 40;
      G.o2 = stats().o2Max;
      Sound.play('bubble'); Player.emit(20, Player.obj.position, 1);
      UI.toast('🫧 Кислород пополнен', 'good');
      return;
    }
    if (o.mesh) o.mesh.visible = false;
    if (o.coins) addCoins(o.coins);
    if (o.res) S.res[o.res] = (S.res[o.res] || 0) + 1;
    if (o.o2) { G.o2 = Math.min(stats().o2Max, G.o2 + o.o2); UI.toast(`🫧 +${o.o2} кислорода`, 'good'); }
    Sound.play('pickup');
    const names = { trash: '🗑️ Мусор собран', oyster: '🦪 Жемчужина +20 🪙', algae: '🌿 Образец водоросли', crystal: '💎 Кристальная водоросль', glowshroom: '🍄 Светящийся гриб', orb: '✨ Сфера энергии', fragment: '🗺️ Фрагмент древней карты!', chest: '💰 Сундук открыт! Найдены артефакты', logbook: '📔 Записи прочитаны' };
    if (o.model && names[o.model] && o.model !== 'o2') UI.toast(names[o.model], o.model === 'fragment' ? 'quest' : 'good');
    if (o.res === 'fragment') UI.banner('Фрагмент карты найден!', `Собрано фрагментов: ${S.res.fragment} из 3`);
    if (o.group === 'treasure') S.res.artifact++;
    if (o.rescue) {
      const c = Creatures.special[o.rescue];
      if (c && c.rescueOf.every(id => S.collected.includes(id))) {
        Creatures.free(o.rescue);
        Sound.play('rescue');
        UI.banner('🐾 Животное спасено!', c.sp.name + ' свободна и уплывает в безопасное место');
      } else UI.toast('Отлично! Осталось: ' + c.rescueOf.filter(id => !S.collected.includes(id)).length, 'quest');
    }
    if (o.id === 'calf') { Creatures.startEscort(); UI.toast('🐬 Дельфинёнок плывёт за вами! Ведите его к стае', 'quest'); }
    if (o.group === 'beacon') UI.toast('📡 Маяк установлен', 'good');
    if (o.id === 'pillarGuard') Creatures.guardiansActive = false;
    Expansion.onCollect(o);
    refreshObjects();
    Quests.update();
    Save.save();
  }

  function onCalfArrived() { UI.toast('🐬 Дельфинёнок вернулся к стае!', 'good'); Quests.update(); }
  function onStageChanged() { refreshObjects(); }
  function onQuestDone(id) {
    Expansion.onQuestDone(Quests.def(id));
    refreshObjects();
    if (id === 'story5') {
      S.storyDone = true;
      Save.save();
      UI.closeAll();
      UI.open('ending');
    }
  }

  // ---------- Урон, провал, база ----------
  function damage(n, reason) {
    if (G.mode !== 'play' || UI.isBlocking()) return;
    G.hp -= n * stats().armor;
    G.lastDamage = G.time;
    throttled('hurtFx', 0.6, () => { Sound.play('hurt'); UI.hurt(); });
    if (reason) throttled('dmg' + reason, 2, () => UI.toast('⚠ ' + reason, 'bad'));
    if (G.hp <= 0) fail('Вы потеряли сознание от травм.');
  }

  function fail(reason) {
    if (G.mode !== 'play') return;
    G.hp = 1; G.o2 = 1;
    const lost = Math.min(S.coins, Math.floor(G.expedition * 0.5));
    S.coins -= lost;
    G.expedition = 0;
    Creatures.guardiansActive = false;
    Player.teleport(DIVE_POINTS[0].pos, 0);
    G.atBase = true;
    Expansion.onBase();
    Save.save();
    UI.showFail(reason, lost);
  }

  function enterBase() {
    Expansion.onBase();
    const st = stats();
    G.o2 = st.o2Max; G.hp = st.hpMax;
    G.expedition = 0;
    G.objects.forEach(o => { if (o.repeat && o.kind !== 'vent') o.taken = false; });
    // Незавершённое сопровождение дельфинёнка начинается заново
    if (Quests.isActive('side_dolphin') && !Creatures.calfArrived) {
      S.quests.side_dolphin.stage = 0;
      S.collected = S.collected.filter(id => id !== 'calf');
      Creatures.resetEscort();
    }
    Creatures.guardiansActive = false;
    Player.teleport(DIVE_POINTS[0].pos, 0);
    G.atBase = true;
    if (S.waypoint && S.waypoint.kind === 'base') S.waypoint = null;
    refreshTarget();
    refreshObjects();
    UI.closeAll();
    UI.open('base');
    Quests.update();
    UI.render('base');
    Save.save();
  }

  function dive(pointId) {
    const dp = DIVE_POINTS.find(d => d.id === pointId);
    if (!dp) { UI.toast('Точка погружения не найдена', 'bad'); return; }
    const z = ZONES.find(z => z.id === dp.zone);
    if (!zoneUnlocked(z)) { UI.toast('Зона закрыта: ' + zoneMissing(z).join(', '), 'bad'); Sound.play('error'); return; }
    const modeError = Expansion.modeReason(S.mode);
    if (modeError) { UI.toast(modeError, 'bad'); return; }
    if (S.mode === 'abyss' && dp.zone !== 'abyss') { UI.toast('Выберите буй «Бездна» для этого режима', 'bad'); return; }
    Player.teleport(dp.pos, 0);
    G.atBase = false;
    G.depth = toDepth(Player.obj.position.y);
    G.expedition = 0;
    S.stats.dives++;
    Expansion.onDive();
    Save.save();
    UI.closeAll();
    UI.resume();
  }

  // ---------- Запуск ----------
  function init(sc) {
    scene = sc;
    buildObjects();
    marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0x5fffe0, transparent: true, opacity: 0.85, depthTest: false }));
    marker.renderOrder = 999;
    marker.visible = false;
    scene.add(marker);
  }

  // isNew: true — новая игра со сбросом; 'first' — первый запуск (покупки из меню сохраняются)
  function startGame(isNew) {
    if (isNew === true) {
      Expansion.onBase();
      Save.reset();
      G.objects.forEach(o => { o.taken = false; o.cool = 0; });
    }
    G.hold = 0; G.prompt = null; G.target = null;
    Expansion.syncWorld();
    Creatures.guardiansActive = false;
    S.started = true;
    G.mode = 'play';
    Creatures.syncWithSave();
    World.setUpgrades(S.upgrades);
    applyGear();
    const st = stats();
    G.o2 = st.o2Max; G.hp = st.hpMax; G.expedition = S.expedition || 0;
    Player.flashOn = false;
    refreshObjects();
    UI.closeAll();
    UI.showHud(true);
    if (isNew || !S.pos || S.atBase) {
      enterBase();
      if (isNew) UI.dialog('Станция «Аква-1»', STORY_INTRO, null, DR);
    } else {
      const p = S.pos;
      const ok = Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) && p[1] < 0 && toDepth(p[1]) <= maxDepth();
      if (!ok) enterBase();
      else {
        const d = S.diveState;
        Player.teleport(p, d ? d.yaw : 0);
        if (d) {
          G.o2 = Math.min(st.o2Max, d.o2); G.hp = Math.min(st.hpMax, d.hp);
          Player.pitch = d.pitch; Player.flashOn = d.flashOn;
        }
        G.atBase = false;
        Expansion.onDive(true);
        if (G.o2 <= 0 || G.hp <= 0) fail('Погружение прервано: запас кислорода или здоровье исчерпаны.');
        else UI.resume();
      }
    }
    G.depth = toDepth(Player.obj.position.y);
    G.zone = zoneByDepth(G.depth);
    refreshTarget();
    Save.save();
  }

  function toMenu() {
    Save.save();
    G.mode = 'menu';
    UI.closeAll();
    UI.showHud(false);
    UI.open('main');
  }

  function toggleFlashlight() {
    Player.flashOn = !Player.flashOn;
    Sound.play('click');
    if (Player.flashOn && !hasItem('flashlight') && !subActive()) throttled('flash', 20, () => UI.toast('Слабый налобный фонарь. Купите «Подводный фонарь» для мощного луча', 'info'));
  }

  // ---------- Главный цикл (во время игры) ----------
  function update(dt, input) {
    G.time += dt;
    const st = stats();
    const pp = Player.obj.position;
    Player.update(dt, G.time, input, { speed: st.speed, vspeed: st.vspeed, drone: st.drone, depth: G.depth, frozen: false, current: Expansion.current });
    G.depth = toDepth(pp.y);
    if (G.depth > S.stats.maxDepth) S.stats.maxDepth = Math.round(G.depth);
    G.atBase = false;

    // Кислород
    if (Player.atSurface && S.mode !== 'expedition') {
      G.o2 = Math.min(st.o2Max, G.o2 + 35 * dt);
    } else {
      G.o2 -= (0.7 + G.depth / 600) * (subActive() ? 0.8 : 1) * (S.mode==='free'?0.75:S.mode==='expedition'?1.4:1) * (input.boost?1.5:1) * dt;
    }
    const o2k = G.o2 / st.o2Max;
    if (o2k < 0.3 && !Player.atSurface) throttled('o2low', o2k < 0.15 ? 2 : 12, () => { Sound.play('warn'); UI.toast(o2k < 0.15 ? '⚠ КИСЛОРОД НА ИСХОДЕ! Срочно всплывайте!' : '⚠ Мало кислорода — пора возвращаться', 'bad'); });
    if (G.o2 <= 0) { G.o2 = 0; fail('Кислород закончился.'); return; }

    // Давление
    const md = maxDepth();
    G.overDepth = G.depth > md;
    if (G.overDepth) {
      damage(14 * dt / st.armor, null);
      const z = nextLockedZone();
      throttled('depth', 3, () => { Sound.play('warn'); UI.toast(`⚠ Слишком глубоко! Предел ${md} м. ${z ? 'Нужно: ' + zoneMissing(z).join(', ') : ''}`, 'bad'); });
    }
    // Горячие источники
    for (const h of World.W.hazards) {
      const dx = pp.x - h.c.x, dz = pp.z - h.c.z;
      if (dx * dx + dz * dz < h.r * h.r && pp.y > h.c.y - 2 && pp.y < h.c.y + h.h) damage(h.dps * dt, h.name);
    }
    // Восстановление здоровья
    if (G.time - G.lastDamage > 6) G.hp = Math.min(st.hpMax, G.hp + 1.5 * dt);
    if (G.mode !== 'play' || UI.isBlocking()) return;

    // Зоны
    const zone = zoneByDepth(G.depth);
    const changedZone = zone !== G.zone;
    G.zone = zone;
    if (zoneUnlocked(zone) && !S.zones.includes(zone.id)) {
      S.zones.push(zone.id);
      addCoins(zone.reward);
      addXP(Math.round(zone.reward / 2));
      UI.banner('Новая зона: ' + zone.name, `${zone.desc} · +${zone.reward} 🪙`);
      Save.save();
    } else if (changedZone) UI.toast('📍 ' + zone.name, 'info');
    Sound.setDepth(G.depth);

    // Стражи храма
    const sg5 = Quests.stage('story5');
    Creatures.guardiansActive = !!sg5 && sg5.group === 'pillarGuard' && pp.distanceTo(World.W.templeCenter) < 45;

    // Объекты: подбор, анимация, подсказки
    let best = null, bestD = 1e9;
    const pickR = st.drone ? 12 * (1 + Expansion.gearLevel('drone') * 0.25) : 0;
    for (const o of G.objects) {
      if (!isObjActive(o)) continue;
      const d = o.pos.distanceTo(pp);
      if (o.mesh && d < 90) {
        if (o.kind === 'pickup') { o.mesh.rotation.y += dt; o.mesh.position.y = o.baseY + Math.sin(G.time * 2 + o.pos.x) * 0.15; }
        if (o.mesh.userData.blink) o.mesh.userData.blink.visible = Math.sin(G.time * 6) > 0;
        if (o.needDetector) o.mesh.visible = d < 30;
      }
      if (o.kind === 'pickup') {
        const droneOk = pickR && o.group !== 'orb' && d < pickR && !blockReason(o);
        if (d < o.radius || droneOk) { if (!blockReason(o)) collect(o); else throttled('pk' + o.id, 4, () => UI.toast(blockReason(o), 'bad')); }
      } else if (d < o.radius && d < bestD) { best = o; bestD = d; }
    }
    G.objects.forEach(o => { if (o.placed && o.placed.visible) o.placed.userData.blink.visible = Math.sin(G.time * 4 + o.pos.x) > 0; });

    // Подсказка взаимодействия (приоритет: объект → база → фото → поверхность)
    let prompt = null;
    if (best) {
      const br = blockReason(best);
      prompt = { label: best.label, hold: (best.hold || 0) * (best.tool==='knife' ? 1 - Expansion.gearLevel('knife') * 0.15 : 1), blocked: br, act: () => collect(best), key: best.id };
    } else if (pp.distanceTo(World.W.poi.base) < 14) {
      prompt = { label: 'Войти на базу', hold: 0, act: enterBase, key: 'base' };
    } else {
      if (hasItem('camera')) {
        let bc = null, bd = 10;
        for (const c of Creatures.list) {
          if (!c.mesh.visible || c.state === 'trapped') continue;
          const rec = S.species[c.sp.id];
          if (!rec || rec.photo) continue;
          const d = c.pos.distanceTo(pp) - c.bodyR;
          if (d < bd) { bd = d; bc = c; }
        }
        if (bc) prompt = { label: 'Сфотографировать: ' + bc.sp.name, hold: 0, act: () => photo(bc), key: 'photo' };
      }
      if (!prompt && Player.atSurface) prompt = { label: 'Вызвать катер и вернуться на базу', hold: 0, act: enterBase, key: 'boat' };
    }
    if (!prompt || !G.prompt || prompt.key !== G.prompt.key) G.hold = 0;
    G.prompt = prompt;
    if (prompt && !prompt.blocked) {
      if (prompt.hold > 0) {
        if (input.e) {
          G.hold += dt;
          if (G.hold >= prompt.hold) { G.hold = 0; prompt.act(); }
        } else G.hold = Math.max(0, G.hold - dt * 2);
      } else if (input.ePressed) prompt.act();
    } else if (prompt && prompt.blocked && input.ePressed) { Sound.play('error'); UI.toast(prompt.blocked, 'bad'); }

    if (UI.isBlocking()) return;

    // Обнаружение видов
    G.discoverT -= dt;
    if (G.discoverT <= 0) {
      G.discoverT = 0.3;
      for (const c of Creatures.list) {
        if (!c.mesh.visible || S.species[c.sp.id] || c.state === 'trapped') continue;
        const range = c.pos.distanceTo(pp) - c.bodyR;
        if (range < st.discoverR * 1.5 && !S.noticed.includes(c.sp.id)) {
          S.noticed.push(c.sp.id);
          throttled('noticed',3,()=>UI.toast('👁 Замечено существо: приблизьтесь для изучения', 'info'));
        }
        if (range > st.discoverR) continue;
        if (!hasItem('scanner') && !hasItem('camera')) {
          throttled('studyTool',30,()=>UI.toast('Существо замечено. Для изучения купите сканер или подводную камеру','info'));
          continue;
        }
        if ((c.sp.rarity === 'epic' || c.sp.rarity === 'legendary') && !hasItem('scanner')) {
          throttled('unk' + c.sp.id, 30, () => UI.toast('❓ Неизвестное существо! Нужен сканер, чтобы его распознать', 'info'));
          continue;
        }
        discover(c.sp);
      }
    }

    // Металлоискатель
    G.detector = -1;
    if (hasItem('detector')) {
      const detectorRange = 60 * (1 + Expansion.gearLevel('detector') * 0.35);
      let dmin = 1e9;
      G.objects.forEach(o => { if (o.needDetector && isObjActive(o)) dmin = Math.min(dmin, o.pos.distanceTo(pp)); });
      if (dmin < detectorRange) {
        G.detector = 1 - dmin / detectorRange;
        G.pingT -= dt;
        if (G.pingT <= 0) { G.pingT = 0.15 + (1 - G.detector) * 1.2; Sound.play('ping', G.detector); }
      }
    }

    // Маркер цели
    if (S.waypoint) {
      const distance = pp.distanceTo(new V3(...S.waypoint.pos));
      const isBase = S.waypoint.kind === 'base';
      if (distance < (isBase ? 14 : 4.5)) {
        clearWaypoint(false);
        UI.toast(isBase ? '🏠 Вы у базы. Нажмите E, чтобы войти' : '📍 Вы достигли своей метки', 'good');
      }
    }
    refreshTarget();
    const tgt = G.target;
    marker.visible = !!tgt;
    if (tgt) {
      marker.material.color.set(S.waypoint ? 0xffc83a : 0x5fffe0);
      const d = tgt.distanceTo(pp);
      marker.position.copy(tgt).y += 2.5 + Math.sin(G.time * 3) * 0.3;
      marker.rotation.y += dt * 2;
      marker.scale.setScalar(Math.max(1, d * 0.025));
    }

    Quests.update();
    if (!UI.isBlocking()) Expansion.update(dt);
    G.saveT += dt;
    if (G.saveT > 15) { G.saveT = 0; Save.save(); }
  }

  Object.assign(G, {
    hasItem, hasUp, subActive, stats, zoneUnlocked, zoneMissing, maxDepth, zoneByDepth, nextLockedZone,
    addCoins, addXP, canBuy, buyItem, canBuyUp, buyUpgrade, toggleEquip, applyGear, study, STUDY,
    discoveredCount, discover, photo, groupObjects, isCollected, isObjActive, refreshObjects,
    onCalfArrived, onStageChanged, onQuestDone, damage, fail, enterBase, dive,
    init, startGame, toMenu, toggleFlashlight, update,
    setWaypoint, clearWaypoint, refreshTarget,
    addObject,
  });
  return G;
})();
