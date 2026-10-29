(() => {
  const lines=[];
  function check(name, fn) {try {if(!fn()) throw new Error('assertion'); lines.push('PASS '+name);} catch(e){lines.push('FAIL '+name+': '+e.message);}}
  function reset() {Game.startGame(true); UI.closeAll(); Game.enterBase();}
  function dive() {Game.dive('base'); UI.closeAll(); Player.teleport([8,-4,-95]);}
  function interact(o) {
    UI.closeAll(); Player.teleport(o.pos.toArray());
    for(let t=0;t<(o.hold||0)+0.6;t+=0.05) {
      if(UI.isBlocking()) break;
      Game.update(0.05,{e:true,ePressed:true});
      if(Game.isCollected(o) || o.eventId && S.event && S.event.done) break;
    }
  }
  reset(); dive();
  const ordinary=SPECIES[0], before=S.coins;
  Game.discover(ordinary);
  check('Без инструментов наблюдение не даёт монеты за изучение',()=>!S.species[ordinary.id] && S.coins===before);
  reset(); S.coins=100000; S.level=20;
  ITEMS.forEach(i=>Game.buyItem(i.id));
  const o2=Game.stats().o2Max;
  Game.toggleEquip('sub');
  const scubaBase=Game.stats().o2Max;
  Game.toggleEquip('sub');
  for(const item of ITEMS) {
    check('Три ступени улучшения: '+item.id,()=>{
      for(let n=0;n<3;n++) if(!Expansion.upgradeGear(item.id).ok) return false;
      return Expansion.gearLevel(item.id)===3 && Expansion.gearOffer(item.id).rarity==='legendary' && !Expansion.upgradeGear(item.id).ok;
    });
  }
  check('Улучшенная субмарина увеличивает запас кислорода',()=>Game.stats().o2Max>o2);
  Game.toggleEquip('sub');
  check('Глубоководный комплект действительно улучшает запас',()=>Game.stats().o2Max>scubaBase);
  check('Цена не списывается после максимума',()=>{const coins=S.coins; Expansion.upgradeGear('scuba');return S.coins===coins;});
  const gear=JSON.stringify(S.gear); Save.save(); S=defaultState(); Save.load(); Game.startGame(false);
  check('Все ступени оборудования сохраняются',()=>JSON.stringify(S.gear)===gear);
  for(const id of ['story1','story2','story3','story4']) S.quests[id]={status:'done',stage:2};
  if(!Game.subActive()) Game.toggleEquip('sub');
  check('Шесть режимов доступны при выполненных требованиях',()=>MODES.length===6 && MODES.every(m=>!Expansion.modeReason(m.id)));
  Expansion.selectMode('treasure'); dive();
  const contracts=Game.objects.filter(o=>o.modeObject);
  contracts.forEach(interact);
  check('Охота за сокровищами создаёт три работающих тайника',()=>contracts.length===3 && S.run.completed);
  const paid=S.coins;
  Expansion.onCollect(contracts[0]);
  check('Повторный вызов не выдаёт награду режима повторно',()=>S.coins===paid);
  Game.enterBase(); Expansion.selectMode('expedition'); dive();
  const vent=Game.groupObjects('vent')[0]; interact(vent);
  check('В экспедиции нельзя пополнить кислород у станции',()=>Game.prompt && /только на базе/.test(Game.prompt.blocked));
  S.run.remaining=0.02; Expansion.update(0.05);
  check('Лимит времени завершает цель без выдачи награды',()=>S.run.failed && !S.run.completed);
  Game.enterBase(); Expansion.selectMode('missions'); dive();
  for(const kind of ['container','signal','treasure','cave','rescue']) {
    S.event=null; Expansion.onBase();
    check('Случайное событие: '+kind,()=>{
      if(!Expansion.startEvent(kind)) return false;
      const obj=Expansion.eventObject, coins=S.coins;
      interact(obj);
      if(!obj.taken || S.coins<=coins || S.event && !S.event.done) return false;
      const once=S.coins; Expansion.onCollect(obj);
      return S.coins===once;
    });
  }
  Expansion.update(0.05);
  check('После события динамические объекты очищаются',()=>!Expansion.eventObject && !Game.objects.some(o=>o.eventId));
  check('Вход в найденную пещеру сохраняется на карте',()=>S.locations.some(id=>id.startsWith('cave@')));
  Expansion.startEvent('current'); const eventId=S.event.id;
  check('Течение влияет на движение',()=>{
    const from=Player.obj.position.clone();
    Player.update(1,Game.time,{}, {speed:0,vspeed:0,depth:Game.depth,current:Expansion.current});
    return Player.obj.position.distanceTo(from)>0.5;
  });
  Save.save(); S=defaultState(); Save.load(); Game.startGame(false); UI.closeAll();
  check('Событие и течение продолжаются после загрузки',()=>S.event && S.event.id===eventId && Expansion.current.length()>0);
  Expansion.onBase();
  check('Событие с редким существом создаёт животное',()=>{S.event=null;const count=Creatures.list.length;return Expansion.startEvent('rare') && Creatures.list.length===count+1;});
  Expansion.onBase();
  Game.enterBase();
  S.cargo.coin=2; S.collection.coin=2;
  const money=S.coins;
  check('Продажа груза сохраняет коллекцию',()=>Expansion.sell('coin').ok && S.coins===money+90 && S.cargo.coin===0 && S.collection.coin===2);
  check('Повторная продажа пустого груза запрещена',()=>!Expansion.sell('coin').ok);
  dive(); Expansion.explore();
  check('Исследование открывает ячейки тумана',()=>Expansion.isExplored(Player.obj.position.x,Player.obj.position.z) && !Expansion.isExplored(100,-990));
  const explored=S.explored.slice(); Save.save(); S=defaultState(); Save.load();
  check('Исследованная карта сохраняется',()=>explored.every(id=>S.explored.includes(id)));
  Game.startGame(false); UI.closeAll();
  check('Камера останавливается перед препятствием',()=>{
    const c={c:new THREE.Vector3(0,-3,-12),r:1}; World.W.colliders.push(c);
    const from=new THREE.Vector3(0,-3,-9), dest=new THREE.Vector3(0,-3,-17);
    Player.safeCameraPosition(from,dest); World.W.colliders.pop();
    return dest.distanceTo(from)<3 && dest.distanceTo(c.c)>1;
  });
  check('В корабле есть доступное внутреннее помещение',()=>{
    const pos=World.W.poi.room470; Player.teleport(pos.toArray());
    Player.update(0.05,Game.time,{}, {speed:0,vspeed:0,depth:300});
    return World.W.walls.length>10 && Player.obj.position.distanceTo(pos)<2.3;
  });
  Game.enterBase(); Expansion.selectMode('abyss'); Game.dive('abyss'); UI.closeAll();
  Game.objects.filter(o=>o.modeObject).forEach(interact);
  check('Режим бездны создаёт и завершает три глубинных цели',()=>S.run.id==='abyss' && S.run.completed);
  Game.enterBase(); Expansion.selectMode('rescue'); dive();
  for(let i=0;i<3;i++) { Expansion.startEvent('rescue'); interact(Expansion.eventObject); }
  check('Три срочных спасения завершают спасательную операцию',()=>S.run.id==='rescue' && S.run.completed);
  Game.enterBase(); Expansion.selectMode('free'); dive();
  S.species={};
  for(const sp of SPECIES.filter(s=>s.zone==='reef').slice(0,3)) {
    const c=Creatures.list.find(c=>c.sp.id===sp.id && c.state==='wander');
    Player.teleport(c.pos.clone().add(new THREE.Vector3(3,1,0)).toArray());
    c.mesh.visible=true; Game.discoverT=0; Game.update(0.05,{});
  }
  check('Свободное исследование награждает за изучение видов',()=>S.run.id==='free' && S.run.completed);
  Game.enterBase(); Expansion.selectMode('expedition'); dive();
  Game.objects.filter(o=>o.group==='algae').slice(0,10).forEach(interact);
  check('Экспедиция завершается сбором десяти образцов',()=>S.run.id==='expedition' && S.run.completed);
  Game.enterBase(); Expansion.selectMode('missions'); dive();
  delete S.quests.side_trash; delete S.quests.side_census;
  S.collected=S.collected.filter(id=>!id.startsWith('trash'));
  Quests.accept('side_trash',true); Quests.accept('side_census',true);
  Game.groupObjects('trash').slice(0,8).forEach(interact);
  for(const sp of SPECIES.filter(sp=>sp.zone==='reef').slice(3)) {
    const c=Creatures.list.find(c=>c.sp.id===sp.id && c.state==='wander');
    Player.teleport(c.pos.clone().add(new THREE.Vector3(3,1,0)).toArray());c.mesh.visible=true;Game.discoverT=0;Game.update(0.05,{});
  }
  Quests.update();
  check('Две завершённые миссии выполняют цель режима',()=>S.run.id==='missions' && S.run.completed);
  Game.enterBase();
  for(const screen of ['base','shop','inventory','quests','lab','map','settings','ency','help']) {
    UI.open(screen); check('Экран '+screen,()=>!document.getElementById('scr-'+screen).classList.contains('hidden')); UI.back();
  }
  UI.open('quests'); document.getElementById('questCategory').value='secret'; document.getElementById('questCategory').dispatchEvent(new Event('change'));
  check('Есть фильтр секретных заданий',()=>document.getElementById('questCategory').options.length===7);
  document.getElementById('questCategory').value='all'; document.getElementById('questCategory').dispatchEvent(new Event('change'));
  window.dispatchEvent(new Event('resize'));
  check('Изменение окна сохраняет рабочий canvas',()=>document.getElementById('game').width>0);
  Game.enterBase();
  return lines.join('\n');
})()
