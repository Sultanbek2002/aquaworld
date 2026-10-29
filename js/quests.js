'use strict';
// ============================================================
//  Система заданий: принятие, этапы, прогресс, награды
// ============================================================

const Quests = (() => {
  const def = id => QUESTS.find(q => q.id === id);
  const isDone = id => !!S.quests[id] && S.quests[id].status === 'done';
  const isActive = id => !!S.quests[id] && S.quests[id].status === 'active';

  function lockReason(id) {
    const q = def(id);
    if (!q) return 'Неизвестное задание';
    if (S.level < q.level) return `Нужен уровень ${q.level}`;
    if (q.requiresCollection && !S.collection[q.requiresCollection]) return 'Сначала найдите «' + COLLECTIONS.find(c=>c.id===q.requiresCollection).name + '»';
    if (q.tools) {
      const tool = q.tools.find(id=>!Game.hasItem(id));
      if(tool) return 'Нужно: ' + ITEMS.find(i=>i.id===tool).name;
    }
    const miss = q.requires.filter(r => !isDone(r));
    if (miss.length) return `Сначала выполните «${def(miss[0]).title}»`;
    return null;
  }
  const available = id => !S.quests[id] && !lockReason(id);
  function status(id) {
    if (isDone(id)) return 'done';
    if (isActive(id)) return 'active';
    return available(id) ? 'available' : 'locked';
  }

  function accept(id, auto = false) {
    if (!available(id)) return false;
    const q = def(id);
    S.quests[id] = { status: 'active', stage: 0 };
    if (!tracked() || q.story) S.tracked = id;
    Sound.play('quest');
    if (auto) UI.toast(`📜 Новое задание: «${q.title}»`, 'quest');
    else if (q.startText) UI.dialog(q.title, q.startText);
    Game.onStageChanged(id);
    Save.save();
    return true;
  }

  function stage(id) {
    const s = S.quests[id];
    if (!s || s.status !== 'active') return null;
    return def(id).stages[s.stage] || null;
  }

  function progress(id) {
    const sg = stage(id);
    if (!sg) return null;
    switch (sg.type) {
      case 'objects': case 'pickups': {
        const objs = Game.groupObjects(sg.group);
        const need = sg.count || objs.length;
        return { cur: Math.min(need, objs.filter(o => Game.isCollected(o)).length), need };
      }
      case 'escort': return { cur: Creatures.calfArrived ? 1 : 0, need: 1 };
      case 'photo': return { cur: S.species[sg.species] && S.species[sg.species].photo ? 1 : 0, need: 1 };
      case 'discover': return { cur: Math.min(sg.count, Game.discoveredCount()), need: sg.count };
      default: return { cur: 0, need: 1 };
    }
  }

  function stageDone(id) {
    const sg = stage(id);
    if (!sg) return false;
    if (sg.type === 'reach') {
      const p = World.W.poi[sg.poi];
      return Game.mode === 'play' && !!p && Player.obj.position.distanceTo(p) < sg.radius;
    }
    const p = progress(id);
    return p.cur >= p.need;
  }

  function update() {
    for (const id in S.quests) if (isActive(id) && stageDone(id)) advance(id);
  }

  function advance(id) {
    const s = S.quests[id], q = def(id);
    s.stage++;
    if (s.stage >= q.stages.length) { complete(id); return; }
    UI.toast(`✔ Этап выполнен: ${q.stages[s.stage - 1].text}`, 'quest');
    Sound.play('pickup');
    Game.onStageChanged(id);
    Save.save();
  }

  function complete(id) {
    const q = def(id);
    S.quests[id] = { status: 'done', stage: q.stages.length };
    let coins = q.reward.coins;
    if (q.rescue && Game.hasUp('vet')) coins = Math.round(coins * 1.5);
    Game.addCoins(coins);
    Game.addXP(q.reward.xp);
    if (q.rescue) S.stats.rescued++;
    if (S.tracked === id) S.tracked = activeList()[0] || null;
    Sound.play('quest');
    UI.banner('Задание выполнено!', `${q.title} · +${coins} 🪙 · +${q.reward.xp} XP`);
    if (q.doneText && q.story && id !== 'story5') UI.dialog(q.title, q.doneText);
    else if (q.doneText) UI.toast(q.doneText, 'good');
    Game.onQuestDone(id);
    Save.save();
  }

  // Точка, куда указывает компас
  function target(id) {
    const sg = stage(id);
    if (!sg) return null;
    const pp = Player.obj.position;
    switch (sg.type) {
      case 'objects': case 'pickups': {
        const o = Game.groupObjects(sg.group).filter(o => Game.isObjActive(o))
          .sort((a, b) => a.pos.distanceToSquared(pp) - b.pos.distanceToSquared(pp))[0];
        return o ? o.pos : null;
      }
      case 'reach': return World.W.poi[sg.poi] || null;
      case 'escort': return Creatures.POD;
      case 'photo': {
        const c = Creatures.list.filter(c => c.sp.id === sg.species && c.state !== 'trapped')
          .sort((a, b) => a.pos.distanceToSquared(pp) - b.pos.distanceToSquared(pp))[0];
        return c ? c.pos : null;
      }
      default: return null;
    }
  }

  function tracked() { return S.tracked && isActive(S.tracked) ? S.tracked : null; }
  function activeList() { return QUESTS.filter(q => isActive(q.id)).map(q => q.id); }

  return { def, isDone, isActive, lockReason, available, status, accept, stage, progress, update, target, tracked, activeList };
})();
