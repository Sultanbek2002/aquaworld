'use strict';
// Additional systems use the existing world, interactions and quest engine.
const MODES = [
  {id:'free',name:'Свободное исследование',desc:'Кислород расходуется на 25% медленнее. Изучите 3 новых вида.',target:3,coins:180,xp:90},
  {id:'missions',name:'Режим миссий',desc:'Выполните 2 задания за погружение.',target:2,coins:250,xp:120},
  {id:'expedition',name:'Экспедиция',desc:'8 минут, кислород ×1.4; пополнения только на базе. Соберите 10 образцов.',target:10,coins:450,xp:200},
  {id:'treasure',name:'Охота за сокровищами',desc:'Нужен металлоискатель. Найдите 3 тайника за 6 минут.',target:3,coins:500,xp:180},
  {id:'rescue',name:'Спасательная операция',desc:'Нужен нож. Освободите 3 животных; срочные вызовы поступают чаще.',target:3,coins:600,xp:250},
  {id:'abyss',name:'Исследование бездны',desc:'Уровень 6, субмарина и открытая бездна. Изучите 3 глубинных сигнала за 6 минут.',target:3,coins:900,xp:400},
];
const COLLECTIONS = [
  {id:'coin',name:'Древняя монета',icon:'🪙',price:45,rarity:'common'},
  {id:'lens',name:'Линза навигатора',icon:'🔮',price:160,rarity:'rare'},
  {id:'mineral',name:'Сапфир глубин',icon:'💎',price:110,rarity:'rare'},
  {id:'log',name:'Записи экспедиции',icon:'📜',price:85,rarity:'epic'},
  {id:'seal',name:'Печать древних',icon:'🗿',price:400,rarity:'legendary'},
];
const CATEGORIES = {rescue:'Спасательные',research:'Исследовательские',photo:'Фотографические',search:'Поисковые',science:'Научные',secret:'Секретные'};
QUESTS.push(
  {id:'secret_cave',title:'Линза навигатора',category:'secret',level:3,requires:['story2'],requiresCollection:'lens',tools:['scanner'],
    desc:'Линза из древнего тайника указывает на скрытый грот в лесу водорослей. Исследуйте его и просканируйте минерал.',
    startText:'На линзе проступили координаты грота. Возьми сканер и проверь сигнал.',doneText:'Грот отмечен на карте. Минерал содержит координаты глубинного архива.',
    stages:[{type:'reach',poi:'secretCave',radius:9,text:'Найдите скрытый грот'},{type:'objects',group:'caveMineral',text:'Изучите минерал сканером'}],reward:{coins:450,xp:200}},
  {id:'secret_archive',title:'Архив забытых глубин',category:'secret',level:5,requires:['secret_cave','story3'],tools:['flashlight','detector'],
    desc:'Расшифрованный минерал указывает на архив в светящихся пещерах. Найдите древнюю печать.',
    startText:'Следующая часть карты ведёт к архиву. Понадобятся фонарь и металлоискатель.',doneText:'Печать занесена в коллекцию, а секретный архив открыт на карте.',
    stages:[{type:'objects',group:'archiveSeal',text:'Откройте архив с включённым фонарём'}],reward:{coins:750,xp:350}}
);
OBJECTS.push(
  ...[[-25,-115],[58,-152],[-40,-320],[72,-438]].map((p,i)=>({id:'antique'+i,group:'antique',at:[...p,0.5],model:'oyster',kind:'pickup',loot:'coin'})),
  {id:'navLens',group:'collection',at:[45,-310,0.6],model:'orb',label:'Извлечь линзу из тайника',hold:2,tool:'detector',loot:'lens'},
  {id:'oldLog',group:'collection',poi:'room470',model:'logbook',label:'Забрать записи из каюты',hold:2,loot:'log'},
  {id:'deepGem',group:'collection',at:[28,-672,0.6],model:'crystal',label:'Изучить редкий минерал',hold:2,tool:'scanner',loot:'mineral'},
  {id:'caveMineral',group:'caveMineral',at:[65,-340,1.5],model:'crystal',label:'Просканировать минерал',hold:3,tool:'scanner',quest:'secret_cave',stageOnly:true,loot:'mineral'},
  {id:'archiveSeal',group:'archiveSeal',at:[-55,-733,1],model:'chest',label:'Открыть архив',hold:3,tool:'detector',cond:'light',quest:'secret_archive',stageOnly:true,loot:'seal'}
);

const Expansion = (() => {
  const V = THREE.Vector3;
  let scene, eventObject = null, eventAnimal = null, tickT = 0;
  const caveGroups=[];
  const current = new V();
  const E = { current, eventObject: null };
  const gearLevel = id => Game.hasItem(id) ? S.gear[id] || 0 : 0;
  function gearInfo(id, level = gearLevel(id)) {
    if(id==='flashlight') return 'Дальность света: '+(60+level*20)+' м';
    if(id==='knife') return 'Время разрезания: '+Math.round((1-level*0.15)*100)+'% базового';
    if(id==='deepsuit') return 'Здоровье +'+level*20+'; урон −'+level*10+'%; кислород +'+level*25+'%';
    const rates = {scuba:25,flashlight:33,knife:15,camera:25,fins:15,scanner:30,detector:35,drone:25,deepsuit:15,sub:12};
    const names = {scuba:'Запас кислорода',flashlight:'Дальность света',knife:'Скорость разрезания',camera:'Награда за снимки',fins:'Скорость ласт',scanner:'Радиус изучения',detector:'Радиус поиска',drone:'Радиус подбора',deepsuit:'Здоровье и защита',sub:'Скорость и кислород'};
    return names[id] + ': +' + Math.round(level * rates[id]) + '%';
  }
  function gearOffer(id) {
    const item = ITEMS.find(i=>i.id===id), level = gearLevel(id);
    if (!item) return null;
    const price = Math.round(item.price * (0.6 + 0.4 * (level + 1)));
    const reason = !Game.hasItem(id) ? 'Сначала купите предмет' : level >= 3 ? 'Максимум' : !Game.atBase && Game.mode === 'play' ? 'Улучшения доступны на базе' : S.level < item.level + level ? 'Нужен уровень ' + (item.level + level) : S.coins < price ? 'Не хватает монет' : null;
    return {level,price,reason,rarity:['common','rare','epic','legendary'][level],now:gearInfo(id,level),next:gearInfo(id,Math.min(3,level+1))};
  }
  function upgradeGear(id) {
    const offer = gearOffer(id);
    if (!offer || offer.reason) return {ok:false,msg:offer ? offer.reason : 'Предмет не найден'};
    S.coins -= offer.price; S.gear[id] = offer.level + 1;
    Game.applyGear(); Save.save(); Sound.play('level');
    return {ok:true,msg:'Улучшено: ' + ITEMS.find(i=>i.id===id).name + ' · ' + gearInfo(id)};
  }
  function applyStats(st) {
    const vehicle = Game.subActive(), tank = vehicle ? 'sub' : Game.hasItem('deepsuit') ? 'deepsuit' : 'scuba';
    st.o2Max = Math.round(st.o2Max * (1 + gearLevel(tank) * (vehicle ? 0.12 : 0.25)));
    st.hpMax += gearLevel('deepsuit') * 20;
    st.speed *= 1 + gearLevel(vehicle ? 'sub' : 'fins') * (vehicle ? 0.12 : S.equip.fins ? 0.15 : 0);
    st.vspeed *= 1 + gearLevel(vehicle ? 'sub' : 'fins') * (vehicle || S.equip.fins ? 0.1 : 0);
    st.discoverR *= 1 + gearLevel('scanner') * 0.3;
    st.armor *= 1 - gearLevel('deepsuit') * 0.1;
    return st;
  }
  function modeReason(id) {
    if (!MODES.some(m=>m.id===id)) return 'Неизвестный режим';
    if (id==='treasure' && !Game.hasItem('detector')) return 'Нужен металлоискатель';
    if (id==='rescue' && !Game.hasItem('knife')) return 'Нужен нож спасателя';
    if (id==='abyss' && (S.level<6 || !Game.zoneUnlocked(ZONES[4]))) return 'Нужны уровень 6, активная субмарина и открытая бездна';
    return null;
  }
  function selectMode(id) {
    if (!Game.atBase || modeReason(id)) return false;
    S.mode = id; Save.save(); return true;
  }
  function removeDynamic(o) {
    if (!o) return;
    if (o.mesh) scene.remove(o.mesh);
    const i = Game.objects.indexOf(o); if(i>=0) Game.objects.splice(i,1);
  }
  function clearEvent() {
    removeDynamic(eventObject); eventObject = E.eventObject = null;
    if (eventAnimal) {
      scene.remove(eventAnimal.mesh);
      const i = Creatures.list.indexOf(eventAnimal); if(i>=0) Creatures.list.splice(i,1);
      eventAnimal = null;
    }
    current.set(0,0,0);
  }
  function modeObjects() {
    Game.objects.filter(o=>o.modeObject).forEach(removeDynamic);
    if (!S.run || S.run.completed || !['treasure','abyss'].includes(S.mode)) return;
    const pp = Player.obj.position;
    for(let i=S.run.progress;i<3;i++) {
      const x = Math.max(-75,Math.min(75,pp.x + (i-1)*18)), z = Math.max(-990,Math.min(30,pp.z - 30 - i*20));
      Game.addObject({id:'contract'+i,group:'contract',at:[x,z,1],model:S.mode==='treasure'?'chest':'beaconSpot',label:S.mode==='treasure'?'Исследовать тайник':'Изучить глубинный сигнал',hold:2,tool:S.mode==='treasure'?'detector':null,once:false,modeObject:true});
    }
  }
  function onDive(resume = false) {
    clearEvent();
    if (!resume) {
      S.event = null; S.eventCooldown = S.mode==='rescue'?25:65 + Math.random()*25;
      const mode = MODES.find(m=>m.id===S.mode) || MODES[1];
      S.run = {id:S.mode,remaining:S.mode==='expedition'?480:360,progress:0,target:mode.target,completed:false,failed:false};
    }
    modeObjects();
    if (resume && S.event && !S.event.done && S.event.remaining>0) materializeEvent();
  }
  function progress(n=1) {
    const run=S.run;
    if (!run || run.completed || run.failed) return;
    run.progress=Math.min(run.target,run.progress+n);
    if (run.progress < run.target) return;
    const mode=MODES.find(m=>m.id===run.id);
    run.completed=true;
    Game.addCoins(mode.coins); Game.addXP(mode.xp); Sound.play('quest');
    UI.banner('Цель режима выполнена',mode.name+' · +'+mode.coins+' 🪙 · +'+mode.xp+' XP'); Save.save();
  }
  function onBase() { clearEvent(); S.event=null; Game.objects.filter(o=>o.modeObject).forEach(removeDynamic); }
  function onQuestDone(q) { if(S.mode==='missions' || S.mode==='rescue' && q.rescue) progress(); }
  function onDiscover(sp) {
    if(S.mode==='free') progress();
    if(S.event && !S.event.done && S.event.kind==='rare' && eventAnimal && sp.id===eventAnimal.sp.id) {
      S.event.done=true; Game.addCoins(90); Game.addXP(45); UI.toast('Редкое наблюдение подтверждено: +90 🪙','good');
    }
  }
  function onCollect(o) {
    if(o.eventId && (!S.event || S.event.id!==o.eventId || S.event.done)) return;
    if (o.loot) {
      S.collection[o.loot]++; S.cargo[o.loot]++;
      UI.toast('Коллекция: '+COLLECTIONS.find(c=>c.id===o.loot).name,'good');
    }
    if (o.modeObject || S.mode==='expedition' && ['algae','crystal','glowshroom'].includes(o.group)) progress();
    if (S.event && o.eventId===S.event.id && !S.event.done) {
      S.event.done=true;
      Game.addCoins(S.event.kind==='rescue'?180:90); Game.addXP(45);
      if(S.event.kind==='rescue') {
        if (eventAnimal) { eventAnimal.state='wander'; eventAnimal.home=eventAnimal.pos.clone().add(new V(8,3,-8)); eventAnimal.range=12; }
        S.stats.rescued++; if(S.mode==='rescue') progress();
      }
      if(S.event.kind==='cave') {
        const p=S.event.pos;
        const id='cave@'+p[0].toFixed(1)+','+p[2].toFixed(1);
        if(!S.locations.includes(id)) { S.locations.push(id); caveDecoration(new V(...p),false,true); }
      }
      UI.banner('Событие завершено','Данные и находки переданы в экспедиционный журнал');
    }
  }
  function sell(id) {
    const item=COLLECTIONS.find(c=>c.id===id), count=S.cargo[id];
    if(!Game.atBase || !item || !count) return {ok:false,msg:'Продажа доступна на базе, если есть груз'};
    S.cargo[id]=0; Game.addCoins(count*item.price); Save.save();
    return {ok:true,msg:'Продано: '+item.name+' ×'+count+' · +'+count*item.price+' 🪙. Коллекция сохранена.'};
  }
  const cell = (x,z) => Math.floor((x+120)/20)+':'+Math.floor((55-z)/20);
  function explore() {
    const p=Player.obj.position;
    for(let dx=-20;dx<=20;dx+=20) for(let dz=-20;dz<=20;dz+=20) {
      const key=cell(p.x+dx,p.z+dz); if(!S.explored.includes(key)) S.explored.push(key);
    }
    const sites=[['cave',World.W.poi.secretCave],['archive',World.W.poi.secretArchive],['anna',World.W.poi.annaWreck]];
    for(const [id,pos] of sites) if(pos && pos.distanceTo(p)<22 && !S.locations.includes(id)) {
      S.locations.push(id); UI.toast('Открыта локация: '+({cave:'Тайный грот',archive:'Архив глубин',anna:'Корабль «Святая Анна»'}[id]),'good'); Save.save();
    }
  }
  const isExplored=(x,z)=>S.explored.includes(cell(x,z));
  function materializeEvent() {
    const e=S.event; if(!e || e.done) return;
    const p=new V(...e.pos);
    if(e.kind==='current') { current.set(1.6,0,0.7); return; }
    if(e.kind==='rare') {
      const sp=SPECIES.find(s=>s.zone===Game.zone.id && s.rarity==='rare') || SPECIES[4];
      eventAnimal=Creatures.spawn(sp,p,{home:p.clone(),range:8});
      eventObject=E.eventObject=Game.addObject({id:e.id,group:'event',abs:e.pos,label:'Подтвердить редкое наблюдение',hold:2,tool:Game.hasItem('scanner')?'scanner':'camera',once:false,eventId:e.id});
      return;
    }
    if(e.kind==='rescue') {
      const sp=SPECIES.find(s=>s.zone===Game.zone.id && !s.hostile && !['legendary','epic'].includes(s.rarity) && ['turtle','ray','octopus'].includes(s.model.type)) || SPECIES.find(s=>s.zone===Game.zone.id && !s.hostile) || SPECIES[4];
      eventAnimal=Creatures.spawn(sp,p,{state:'trapped',home:p.clone(),range:12});
    }
    const models={container:'probe',signal:'beaconSpot',cave:'fragment',treasure:'chest',rescue:'net'};
    eventObject=E.eventObject=Game.addObject({id:e.id,group:'event',abs:e.pos,model:models[e.kind],label:e.kind==='rescue'?'Освободить животное':e.kind==='signal'?'Изучить сигнал':'Исследовать находку',hold:e.kind==='rescue'?3:2,tool:e.kind==='rescue'?'knife':e.kind==='signal'?'scanner':null,once:false,eventId:e.id,loot:e.kind==='treasure'?'coin':e.kind==='cave'?'mineral':e.loot || null});
  }
  function startEvent(kind = null) {
    if (S.event && !S.event.done && S.event.remaining>0) return false;
    clearEvent();
    const choices=['container','rare','signal','cave','treasure','rescue','current'];
    kind=kind || (S.mode==='rescue'?'rescue':choices[Math.floor(Math.random()*choices.length)]);
    if(!choices.includes(kind)) return false;
    const pp=Player.obj.position;
    let p=null;
    for(let i=0;i<40;i++) {
      const a=Math.random()*Math.PI*2;
      const x=Math.max(-80,Math.min(80,pp.x+Math.cos(a)*22)), z=Math.max(-985,Math.min(35,pp.z+Math.sin(a)*22));
      const candidate=new V(x,Math.min(-2,Math.max(World.floorY(x,z)+2,pp.y-6)),z);
      if(toDepth(candidate.y)>Game.maxDepth() || World.W.colliders.some(c=>candidate.distanceTo(c.c)<c.r+5) || World.W.hazards.some(h=>Math.hypot(x-h.c.x,z-h.c.z)<h.r+4)) continue;
      p=candidate; break;
    }
    if(!p) { S.eventCooldown=20; return false; }
    S.event={id:'event'+(++S.eventSeq),kind,pos:p.toArray(),remaining:90,done:false,loot:kind==='container' && Math.random()<0.2?'lens':null};
    materializeEvent();
    UI.banner('Событие экспедиции',({container:'Найден потерянный контейнер',rare:'Поблизости замечено редкое животное',signal:'Сканер получил необычный сигнал',cave:'Течение обнажило вход в малый грот',treasure:'Замечен сундук на дне',rescue:'Срочно: животное запуталось в сети!',current:'Сильное течение: двигайтесь поперёк потока'})[kind]);
    Save.save(); return true;
  }
  function eventTarget() { return S.event && !S.event.done && S.event.kind!=='current' ? new V(...S.event.pos) : null; }
  function update(dt) {
    const run=S.run;
    if(run && !run.completed && !run.failed && ['expedition','treasure','abyss'].includes(run.id)) {
      run.remaining=Math.max(0,run.remaining-dt);
      if(run.remaining===0) { run.failed=true; UI.banner('Время режима истекло','Возвращайтесь на базу. Найденные предметы остаются у вас.'); }
    }
    if(S.event) {
      if(S.event.kind==='rare' && eventAnimal && eventObject) eventObject.pos.copy(eventAnimal.pos);
      S.event.remaining-=dt;
      if(S.event.remaining<=0 || S.event.done) { clearEvent(); S.event=null; S.eventCooldown=S.mode==='rescue'?35:95+Math.random()*50; }
    } else {
      S.eventCooldown-=dt;
      if(S.eventCooldown<=0 && !Player.atSurface) startEvent();
    }
    tickT-=dt; if(tickT<=0) { tickT=0.7; explore(); }
  }
  function category(q) {
    return q.category || (q.rescue?'rescue':q.stages.some(s=>s.type==='photo')?'photo':q.stages.some(s=>s.type==='discover')?'research':q.stages.some(s=>s.type==='pickups'||s.group==='beacon')?'science':q.story?'research':'search');
  }
  function tools(q) {
    return q.tools || [...new Set(q.stages.flatMap(s=>[
      ...(s.type==='photo'?['camera']:[]),
      ...(s.species && SPECIES.some(sp=>sp.id===s.species && ['epic','legendary'].includes(sp.rarity))?['scanner']:[]),
      ...OBJECTS.filter(o=>o.group===s.group).flatMap(o=>[...(o.tool?[o.tool]:[]),...(o.cond==='light'?['flashlight']:[])])
    ]))];
  }
  function caveDecoration(pos, coral=false, dynamic=false) {
    const geometry=new THREE.TorusGeometry(coral?4:5,0.85,6,18,Math.PI);
    const material=new THREE.MeshStandardMaterial({color:coral?0xe270a2:0x425c69,emissive:coral?0x371325:0x0e2732,roughness:0.9});
    const group=new THREE.Group(); scene.add(group);
    if(dynamic) caveGroups.push(group);
    for(let i=0;i<3;i++) {
      const arch=new THREE.Mesh(geometry,material); arch.position.copy(pos); arch.position.z-=i*2; group.add(arch);
    }
  }
  function syncWorld() {
    for(const group of caveGroups.splice(0)) {
      scene.remove(group);
      const mesh=group.children[0]; if(mesh) {mesh.geometry.dispose(); mesh.material.dispose();}
    }
    for(const id of S.locations.filter(id=>id.startsWith('cave@'))) {
      const [x,z]=id.slice(5).split(',').map(Number);
      if(Number.isFinite(x)&&Number.isFinite(z)) caveDecoration(new V(x,World.floorY(x,z)+2,z),false,true);
    }
  }
  function init(sc) {
    scene=sc;
    World.W.poi.secretCave=new V(65,World.floorY(65,-340)+3,-340);
    World.W.poi.secretArchive=new V(-55,World.floorY(-55,-733)+3,-733);
    for(const pos of [World.W.poi.secretCave,World.W.poi.secretArchive]) caveDecoration(pos);
    for(const [x,z] of [[-65,-105],[60,-65]]) caveDecoration(new V(x,World.floorY(x,z),z),true);
    syncWorld();
  }
  return Object.assign(E,{init,update,syncWorld,gearLevel,gearInfo,gearOffer,upgradeGear,applyStats,modeReason,selectMode,onDive,onBase,onQuestDone,onDiscover,onCollect,sell,explore,isExplored,cell,startEvent,eventTarget,category,tools});
})();
