// Runs inside the isolated test iframe with the real game systems.
// Travel is accelerated by teleporting; interactions, rewards and costs are real.
(async () => {
  const lines = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  let farmTrips = 0;
  function dismiss() {
    if (UI.top() === 'ending') return;
    let guard = 30;
    while (UI.top() === 'dialog' && guard-- > 0) UI.back();
    UI.closeAll();
  }
  function tick(seconds, input = {}) {
    for (let t = 0; t < seconds; t += 0.05) {
      assert(UI.top() !== 'fail', 'Экспедиция прервана');
      if (UI.isBlocking()) break;
      Game.update(0.05, input);
      if (!UI.isBlocking()) Creatures.update(0.05, Game.time, Player.obj.position, true);
    }
  }
  function visit(pos) {
    dismiss();
    Game.atBase = false;
    Player.teleport(pos.toArray ? pos.toArray() : pos);
    tick(0.1);
  }
  function interact(o) {
    assert(o, 'Объект отсутствует');
    if (Game.isCollected(o)) return;
    visit(o.pos);
    // Keep the diver next to the target while accelerating travel. Currents
    // remain enabled; real users counter them with movement controls.
    for(let t=0;!Game.isCollected(o) && t<(o.hold || 0)+0.5;t+=0.05) {
      Player.teleport(o.pos.toArray()); tick(0.05, {e:true,ePressed:true});
    }
    assert(Game.isCollected(o), o.id + ': не удалось взаимодействовать, подсказка=' + JSON.stringify(Game.prompt && {key:Game.prompt.key,blocked:Game.prompt.blocked}) + ', расстояние=' + o.pos.distanceTo(Player.obj.position).toFixed(2));
    dismiss();
  }
  function group(name) { Game.groupObjects(name).forEach(interact); }
  function accept(id) {
    Game.enterBase();
    assert(Quests.accept(id, true), id + ': ' + Quests.lockReason(id));
    dismiss();
  }
  function completed(id) {
    assert(Quests.isDone(id), id + ': не завершено, этап=' + JSON.stringify(Quests.stage(id)));
    lines.push('PASS Сюжет/задание: ' + Quests.def(id).title);
    dismiss();
  }
  function farm() {
    assert(++farmTrips <= 30, 'Слишком много повторных погружений для прогресса');
    Game.enterBase(); dismiss();
    Game.objects.filter(o => o.repeat && ['oyster','algae'].includes(o.group) && toDepth(o.pos.y) < Game.maxDepth()).forEach(interact);
    Game.enterBase();
    Object.keys(Game.STUDY).forEach(k => Game.study(k));
    dismiss();
  }
  function buy(id, upgrade = false) {
    const it = (upgrade ? UPGRADES : ITEMS).find(i => i.id === id);
    while (S.coins < it.price || S.level < it.level) farm();
    Game.enterBase();
    const result = upgrade ? Game.buyUpgrade(id) : Game.buyItem(id);
    assert(result.ok, 'Покупка ' + id + ': ' + result.msg);
    dismiss();
  }
  function observe(zone) {
    for (const sp of SPECIES.filter(s => s.zone === zone)) {
      if (['epic','legendary'].includes(sp.rarity) && !Game.hasItem('scanner')) continue;
      const c = Creatures.list.find(c => c.sp.id === sp.id && c.state === 'wander');
      const p = c.pos.clone().add(new THREE.Vector3(0, 1, 3 + c.bodyR));
      visit(p); Game.discoverT = 0; tick(0.35);
      assert(S.species[sp.id], 'Не обнаружен вид ' + sp.id);
      if (Game.hasItem('camera')) {
        tick(0.1, {ePressed:true});
        // A nearby quest object can take interaction priority: photo is tested
        // away from those objects at a second approach.
        if (!S.species[sp.id].photo) {
          visit(c.pos.clone().add(new THREE.Vector3(4 + c.bodyR, 1, 0)));
          tick(0.1, {ePressed:true});
        }
      }
      dismiss();
    }
    Quests.update(); dismiss();
  }
  function story(id) {
    accept(id);
    let guard = 20;
    while (Quests.isActive(id) && guard-- > 0) {
      const stage = Quests.stage(id);
      if (stage.type === 'reach') visit(World.W.poi[stage.poi]);
      else if (stage.group) {
        if (stage.group === 'pillarLight') Player.flashOn = true;
        group(stage.group);
      } else throw new Error('Неизвестный этап ' + stage.type);
      Quests.update(); dismiss();
    }
    completed(id);
  }
  try {
    Game.startGame(true); dismiss();
    buy('knife');
    accept('side_turtle'); group('turtleNet'); completed('side_turtle');
    accept('side_trash'); group('trash'); completed('side_trash');
    story('story1'); buy('scuba'); buy('camera'); buy('scanner'); buy('flashlight'); buy('fins');
    accept('side_census'); observe('reef'); observe('kelp'); completed('side_census');
    accept('side_jelly'); observe('kelp'); Quests.update(); completed('side_jelly');
    story('story2');
    accept('side_dolphin'); group('calf');
    // Lead the calf along the route rather than setting its state or progress.
    const start = Creatures.special.calf.pos.clone();
    for (let i = 1; i <= 30 && !Creatures.calfArrived; i++) {
      visit(start.clone().lerp(Creatures.POD, i / 30)); tick(1);
    }
    tick(8); Quests.update(); completed('side_dolphin');
    accept('side_manta'); group('mantaRope'); completed('side_manta');
    buy('barochamber', true); story('story3');
    accept('side_wreck'); group('auroraLog'); completed('side_wreck');
    accept('side_octopus'); Player.flashOn = true; group('octoJar'); completed('side_octopus');
    buy('detector'); accept('side_treasure'); group('treasure'); completed('side_treasure');
    interact(Game.objects.find(o=>o.id==='navLens')); story('secret_cave');
    observe('wreck');
    accept('side_goldturtle'); observe('reef'); Quests.update(); completed('side_goldturtle');
    buy('deepsuit'); story('story4');
    story('secret_archive');
    accept('side_glow'); group('glowshroom'); completed('side_glow');
    observe('caves');
    accept('side_census2'); Quests.update(); completed('side_census2');
    buy('sub'); story('story5');
    assert(S.storyDone && S.res.fragment === 3 && World.W.coreDone, 'Финал не активирован');
    assert(UI.top() === 'ending', 'Финальный экран отсутствует');
    document.querySelector('[data-act="endok"]').click();
    assert(!UI.isBlocking() && Game.mode === 'play', 'После финала исследование недоступно: экран=' + UI.top() + ', режим=' + Game.mode);
    lines.push('PASS Финал и свободное исследование после сюжета');
    accept('side_legend'); observe('abyss'); Quests.update(); completed('side_legend');
    assert(QUESTS.every(q => Quests.isDone(q.id)), 'Остались незавершённые задания');
    lines.push('PASS Все ' + QUESTS.length + ' сюжетных и побочных заданий');
    Game.enterBase(); Save.save(); S = defaultState(); Save.load(); Game.startGame(false);
    assert(S.storyDone && Quests.isDone('story5') && S.res.fragment === 3 && World.W.coreDone && Game.atBase, 'Финальный прогресс потерян после загрузки');
    lines.push('PASS Сохранение и загрузка после финала');
    lines.push('INFO Прогресс без выдачи монет/уровней: уровень ' + S.level + ', монеты ' + S.coins + ', ресурсных экспедиций ' + farmTrips);
  } catch (e) {
    lines.push('FAIL Кампания: ' + e.message);
  }
  Game.enterBase();
  return lines.join('\n');
})()
