(() => {
  const lines = [];
  function check(name, fn) {
    try { if (!fn()) throw new Error('assertion'); lines.push('PASS ' + name); }
    catch (e) { lines.push('FAIL ' + name + ': ' + e.message); }
  }
  Game.startGame(true); UI.closeAll(); Game.dive('base'); UI.closeAll();
  Player.teleport([10, -4, -75], 0.8);
  Player.pitch = -0.3; Player.flashOn = true;
  Game.o2 = 61; Game.hp = 43;
  Save.save(); S = defaultState(); Save.load(); Game.startGame(false);
  check('Загрузка сохраняет кислород и здоровье', () => Game.o2 === 61 && Game.hp === 43 && !Game.atBase);
  check('Загрузка сохраняет камеру и фонарь', () => Player.yaw === 0.8 && Player.pitch === -0.3 && Player.flashOn);
  UI.closeAll(); UI.open('map');
  const canvas = document.getElementById('mapCanvas'), rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true,
    clientX: rect.left + (100 + 60) / 1070 * rect.width,
    clientY: rect.top + (20 + 120) / 240 * rect.height }));
  // MouseEvent coordinates are rounded to CSS pixels by some browsers.
  check('Клик по карте ставит метку с учётом масштаба', () => S.waypoint && Math.abs(S.waypoint.pos[0] - 20) <= 240 / rect.height * 1.5 && Math.abs(S.waypoint.pos[2] + 100) <= 1070 / rect.width * 1.5);
  const savedPoint = S.waypoint && S.waypoint.pos.slice();
  check('Закрытая зона не заменяет метку', () => !Game.setWaypoint(0, -650) && JSON.stringify(S.waypoint.pos) === JSON.stringify(savedPoint));
  Save.save(); S = defaultState(); Save.load(); Game.startGame(false);
  check('Метка сохраняется после перезапуска', () => S.waypoint && Game.target.distanceTo(new THREE.Vector3(...savedPoint)) < 0.01);
  UI.closeAll(); UI.open('map');
  document.querySelector('[data-act="routebase"]').click();
  check('Кнопка «К базе» выбирает станцию', () => S.waypoint && S.waypoint.kind === 'base' && Game.target.equals(World.W.poi.base));
  const pos = Player.obj.position.clone();
  document.getElementById('followRoute').click();
  check('Плыть к метке закрывает карту без телепортации', () => !UI.isBlocking() && Player.obj.position.equals(pos));
  Game.enterBase(); Quests.accept('story1', true); UI.closeAll(); Game.dive('base'); UI.closeAll();
  Game.setWaypoint(20, -100); Game.clearWaypoint(false);
  check('Снятие метки возвращает цель задания', () => !S.waypoint && Game.target.equals(Quests.target('story1')));
  Game.setWaypoint(20, -100); Player.teleport(S.waypoint.pos); Game.update(0.05, {});
  check('Прибытие снимает метку и возвращает компас к заданию', () => !S.waypoint && Game.target.equals(Quests.target('story1')));
  S.items.push('scuba'); S.quests.story1 = {status:'done', stage:2};
  Game.enterBase(); Game.dive('kelp'); Save.save();
  S = defaultState(); Save.load(); Game.startGame(false); UI.closeAll();
  const coinsBeforeZone = S.coins;
  Game.update(0.05, {});
  check('Загрузка в новой зоне сохраняет награду за открытие', () => S.zones.includes('kelp') && S.coins === coinsBeforeZone + 150);
  Game.update(0.05, {});
  check('Награда за новую зону выдаётся один раз', () => S.coins === coinsBeforeZone + 150);
  localStorage.setItem(SAVE_KEY, JSON.stringify({started:true, atBase:false, pos:[5,-4,-70], diveState:null}));
  S = defaultState(); Save.load(); Game.startGame(false);
  check('Совместимость со старыми сохранениями', () => !Game.atBase && Game.o2 === Game.stats().o2Max && Game.hp === Game.stats().hpMax);
  localStorage.setItem(SAVE_KEY, JSON.stringify({started:true, atBase:false, pos:[5,-4,-70], diveState:{o2:0,hp:43}, coins:500, expedition:100}));
  S = defaultState(); Save.load(); Game.startGame(false);
  check('Нулевой кислород после загрузки вызывает эвакуацию', () => Game.atBase && UI.top() === 'fail' && S.coins === 450);
  Game.enterBase();
  check('База полностью восстанавливает запасы', () => Game.o2 === Game.stats().o2Max && Game.hp === Game.stats().hpMax);
  localStorage.setItem(SAVE_KEY, JSON.stringify({started:true, atBase:false, pos:[null,-4,-70], waypoint:{pos:[999,-4,-70]}, diveState:{o2:'bad',hp:3}}));
  S = defaultState(); Save.load(); Game.startGame(false);
  check('Повреждённая позиция безопасно возвращает на базу', () => Game.atBase && !S.waypoint && Game.o2 === Game.stats().o2Max);
  return lines.join('\n');
})()
