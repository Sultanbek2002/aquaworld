'use strict';
// ============================================================
//  Морские животные: поведение, стаи, спасение, хищники
// ============================================================

const Creatures = (() => {
  const V3 = THREE.Vector3;
  const list = [];
  const special = {};
  const tmpV = new V3(), tmpO = new THREE.Object3D();
  let scene;
  const rand = (a, b) => a + Math.random() * (b - a);

  const SPEED = { fish: 2.6, turtle: 1.4, dolphin: 5, ray: 2, jelly: 0.35, seahorse: 0.25, eel: 1, shark: 3, squid: 2.4, octopus: 0.7, angler: 1.4, whale: 2.6 };
  // Насколько высоко над дном держится вид
  const HMAX = { eel: 1.5, octopus: 1.2, seahorse: 6, turtle: 10, angler: 30 };
  const POD = new V3(-70, -10, -335);

  const C = { list, special, calfArrived: false, guardiansActive: false };

  function randomPoint(zone, hmax, out) {
    const r = REGIONS[zone];
    const x = rand(-88, 88), z = rand(r.z[0], r.z[1]);
    const fy = World.floorY(x, z);
    const top = Math.min(r.yTop, fy + (hmax || 999));
    out.set(x, fy + 1.5 + Math.random() * Math.max(0.3, top - fy - 1.5), z);
    return out;
  }
  function pointNear(home, range, out) {
    out.set(home.x + rand(-range, range), home.y + rand(-range, range) * 0.4, home.z + rand(-range, range));
    return out;
  }

  function spawn(sp, pos, opts = {}) {
    const mesh = Models.creature(sp.model);
    mesh.position.copy(pos);
    // Крупные животные отбрасывают тени; при наличии GLB-модели вида она заменит процедурную
    if ((sp.model.size || 1) >= 1) mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    Gfx.Assets.attach(sp.id, mesh);
    scene.add(mesh);
    const type = sp.model.type;
    const c = Object.assign({
      sp, mesh, type, pos: mesh.position, vel: new V3(), target: pos.clone(),
      speed: SPEED[type] * rand(0.8, 1.2), timer: 0, phase: Math.random() * 10,
      state: 'wander', cooldown: 0, upright: !!mesh.userData.upright,
      hmax: HMAX[type] || 999, bodyR: (sp.model.size || 1) * 0.6,
      flees: (type === 'fish' && (sp.model.size || 1) < 1.1) || type === 'squid' && sp.model.size < 2,
    }, opts);
    c.start = c.pos.clone();
    c.baseSpeed = c.speed;
    list.push(c);
    return c;
  }

  function init(sc) {
    scene = sc;
    const p = new V3();
    SPECIES.forEach(sp => {
      let leader = null;
      const count = Math.max(1, Math.round(sp.count * Gfx.preset(SETTINGS.quality).creatures));
      for (let i = 0; i < count; i++) {
        if (sp.id === 'dolphin') {
          const c = spawn(sp, pointNear(POD, 18, p), { home: POD.clone(), range: 22,
            leader: i ? leader : null, offset: new V3(rand(-5,5),rand(-2,2),rand(-5,5)) });
          if (!i) leader = c;
          continue;
        }
        if (sp.school && leader && i % sp.school !== 0) {
          p.copy(leader.pos).add(new V3(rand(-3, 3), rand(-1.5, 1.5), rand(-3, 3)));
          spawn(sp, p, { leader, offset: new V3(rand(-2.5, 2.5), rand(-1.2, 1.2), rand(-2.5, 2.5)) });
        } else {
          randomPoint(sp.zone, HMAX[sp.model.type], p);
          if (sp.zone==='reef' && sp.school && i===0) {
            const index=SPECIES.indexOf(sp), x=(index-1)*12, z=-85-index*8;
            p.set(x,Math.min(-1.5,World.floorY(x,z)+3),z);
          }
          const c = spawn(sp, p);
          if (sp.rarity==='epic' || sp.rarity==='legendary') { c.home=c.pos.clone(); c.range=12; }
          if (sp.school) leader = c;
        }
      }
    });
    const byId = id => SPECIES.find(s => s.id === id);
    const objPos = id => { const o = OBJECTS.find(x => x.id === id); return new V3(o.at[0], World.floorY(o.at[0], o.at[1]) + o.at[2], o.at[1]); };

    // Черепаха в сети
    special.questTurtle = spawn(byId('turtle'), objPos('turtleNet'), { state: 'trapped', rescueOf: ['turtleNet'] });
    // Манта в верёвках
    special.questManta = spawn(byId('manta'), new V3(-60, World.floorY(-60, -268) + 3, -268), { state: 'trapped', rescueOf: ['mantaRope0', 'mantaRope1', 'mantaRope2'] });
    // Осьминог в кувшине (спрятан внутри)
    special.questOcto = spawn(byId('octopus'), objPos('octoJar').add(new V3(0, 0.6, 0)), { state: 'trapped', rescueOf: ['octoJar'], hiddenWhileTrapped: true });
    // Дельфинёнок
    const calfO = OBJECTS.find(o => o.id === 'calf');
    special.calf = spawn(byId('dolphin'), new V3(calfO.abs[0], calfO.abs[1], calfO.abs[2]), { state: 'waiting', isCalf: true });
    special.calf.mesh.scale.setScalar(0.55);
    special.calf.start = special.calf.pos.clone();
    // Стражи храма (удильщики)
    const tc = World.W.templeCenter;
    special.guardians = [0, 1, 2].map(i => spawn(byId('angler'), new V3(tc.x + rand(-20, 20), tc.y + 12, tc.z + rand(-20, 20)),
      { guardian: true, home: new V3(tc.x, tc.y + 12, tc.z), range: 22 }));
    special.guardians.forEach(g => g.mesh.scale.setScalar(1.4));
  }

  // Синхронизация с сохранением (после загрузки/новой игры)
  function syncWithSave() {
    ['questTurtle', 'questManta', 'questOcto'].forEach(k => {
      const c = special[k];
      c.pos.copy(c.start); c.target.copy(c.start); c.vel.set(0, 0, 0); c.speed = c.baseSpeed;
      const freed = c.rescueOf.every(id => S.collected.includes(id));
      if (freed) { c.state = 'wander'; c.home = c.pos.clone(); c.range = 20; c.mesh.visible = true; }
      else { c.state = 'trapped'; c.home = null; }
    });
    const calf = special.calf;
    C.calfArrived = !!(S.quests.side_dolphin && S.quests.side_dolphin.status === 'done');
    if (C.calfArrived) { calf.state = 'wander'; calf.home = POD.clone(); calf.range = 15; calf.pos.copy(POD); }
    else {
      calf.state = S.collected.includes('calf') ? 'follow' : 'waiting';
      calf.pos.copy(calf.start); calf.home = null;
      calf.vel.set(0, 0, 0); calf.target.copy(calf.start);
    }
  }

  function free(key) {
    const c = special[key];
    if (!c || c.state !== 'trapped') return;
    c.state = 'freed';
    c.mesh.visible = true;
    c.escape = c.start.clone().add(new V3(12, 3, -12));
    c.escape.y = Math.min(c.escape.y, -2);
    c.speed *= 1.8;
  }

  function startEscort() { special.calf.state = 'follow'; }
  function resetEscort() {
    const calf = special.calf;
    if (C.calfArrived) return;
    calf.state = 'waiting';
    calf.pos.copy(calf.start);
    calf.vel.set(0, 0, 0);
  }

  function lerpAngle(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, k);
  }

  // active = идёт игра (хищники кусаются, задания проверяются)
  function update(dt, t, player, active) {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const dx = c.pos.x - player.x, dy = c.pos.y - player.y, dz = c.pos.z - player.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const far = d2 > 150 * 150;
      if (c.hiddenWhileTrapped && c.state === 'trapped') { c.mesh.visible = false; continue; }
      c.mesh.visible = !far;
      if (far && c.state !== 'follow') continue;
      const dist = Math.sqrt(d2);
      c.cooldown -= dt;
      let speed = c.speed;

      switch (c.state) {
        case 'trapped':
          c.mesh.rotation.z = Math.sin(t * 7 + c.phase) * 0.18;
          Models.animate(c.mesh, t * 2 + c.phase, 1.5);
          continue;
        case 'waiting':
          c.pos.y = c.start.y + Math.sin(t * 1.5) * 0.4;
          c.mesh.rotation.y += dt * 0.6;
          Models.animate(c.mesh, t + c.phase, 0.5);
          continue;
        case 'freed':
          c.target.copy(c.escape);
          if (c.pos.distanceTo(c.escape) < 3) { c.state = 'wander'; c.home = c.escape.clone(); c.range = 18; c.speed /= 1.8; }
          break;
        case 'follow': {
          tmpV.set(dx, dy, dz).normalize();
          c.target.copy(player).addScaledVector(tmpV, 3.5);
          speed = Math.max(c.speed, dist * 1.4);
          if (c.pos.distanceTo(POD) < 18) {
            c.state = 'wander'; c.home = POD.clone(); c.range = 15;
            C.calfArrived = true;
            if (typeof Game !== 'undefined') Game.onCalfArrived();
          }
          break;
        }
        case 'attack':
          c.target.copy(player);
          speed = c.speed * 3.2;
          if (dist < c.bodyR + 1.6 && c.cooldown <= 0 && active) {
            Game.damage(c.guardian ? 12 : 9, c.sp.name + ' укусил вас!');
            c.cooldown = 1.6;
            c.state = 'retreat'; c.timer = 1.8;
            tmpV.set(dx, dy, dz).normalize();
            c.target.copy(c.pos).addScaledVector(tmpV, 10);
          }
          if (dist > 28 || !active || (c.guardian && !C.guardiansActive)) c.state = 'wander';
          break;
        case 'retreat':
          c.timer -= dt;
          speed = c.speed * 2;
          if (c.timer <= 0) c.state = 'attack';
          break;
        default: { // wander
          c.timer -= dt;
          if (c.leader) {
            c.target.copy(c.leader.pos).add(c.offset);
            // Cohesion with gentle separation, without an all-pairs boids loop.
            const neighbor = list[(i + 1) % list.length];
            if (neighbor.sp.id === c.sp.id && neighbor.pos.distanceToSquared(c.pos) < 2) c.target.add(tmpV.subVectors(c.pos, neighbor.pos).normalize());
          } else if (c.timer <= 0 || c.pos.distanceToSquared(c.target) < 2) {
            c.timer = rand(4, 10);
            if (c.home) pointNear(c.home, c.range, c.target);
            else randomPoint(c.sp.zone, c.hmax, c.target);
          }
          // Любопытные дельфины кружат вокруг игрока
          if (c.type === 'dolphin' && dist < 22 && !c.isCalf && !c.leader) {
            const a = t * 0.6 + c.phase;
            c.target.set(player.x + Math.cos(a) * 6, player.y + Math.sin(a * 2) * 1.5, player.z + Math.sin(a) * 6);
            speed = c.speed * 0.9;
          }
          // Мелкие рыбы уплывают от дайвера
          if (c.flees && dist < 5) {
            tmpV.set(dx, dy * 0.3, dz).normalize();
            c.target.copy(c.pos).addScaledVector(tmpV, 8);
            speed = c.speed * 2.4;
          }
          // Хищники
          if (active && c.sp.hostile && dist < 13 && (!c.guardian || C.guardiansActive)) c.state = 'attack';
          if (c.guardian && C.guardiansActive && active) c.state = 'attack';
        }
      }

      // Ожоги медуз
      if (active && c.type === 'jelly' && dist < c.bodyR + 1.0 && c.cooldown <= 0) {
        Game.damage(5, 'Ожог медузы!');
        c.cooldown = 1.5;
      }

      // Движение
      tmpV.subVectors(c.target, c.pos);
      const len = tmpV.length();
      if (len > 0.001) tmpV.multiplyScalar(Math.min(speed, len * 2) / len);
      c.vel.lerp(tmpV, Math.min(1, dt * (c.type === 'jelly' ? 0.5 : 2)));
      c.pos.addScaledVector(c.vel, dt);
      if (c.type === 'jelly') c.pos.y += Math.sin(t * 1.1 + c.phase) * dt * 0.3;
      const fy = World.floorY(c.pos.x, c.pos.z) + 0.5 + c.bodyR * 0.5;
      if (c.pos.y < fy) { c.pos.y = fy; if (c.vel.y < 0) c.vel.y = 0; }
      if (c.pos.y > -0.8) c.pos.y = -0.8;
      c.pos.x = Math.max(-100, Math.min(100, c.pos.x));

      // Поворот по направлению движения
      const sp2 = c.vel.lengthSq();
      if (c.upright) {
        if (sp2 > 0.0004) c.mesh.rotation.y = lerpAngle(c.mesh.rotation.y, Math.atan2(c.vel.x, c.vel.z), dt * 2);
      } else if (sp2 > 0.0004) {
        tmpO.position.copy(c.pos);
        tmpO.lookAt(tmpV.copy(c.pos).add(c.vel));
        c.mesh.quaternion.slerp(tmpO.quaternion, Math.min(1, dt * 3));
      }
      if (d2 < 90 * 90) Models.animate(c.mesh, t + c.phase, Math.min(2, Math.sqrt(sp2) / c.speed));
    }
  }

  Object.assign(C, { init, update, free, startEscort, resetEscort, syncWithSave, spawn, POD });
  return C;
})();
