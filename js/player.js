'use strict';
// ============================================================
//  Игрок: дайвер / мини-субмарина, движение, камера, фонарь
// ============================================================

const Player = (() => {
  const V3 = THREE.Vector3;
  const P = {
    obj: null, vel: new V3(), yaw: 0, pitch: 0.22, heading: Math.PI, swim: 0,
    flashOn: false, atSurface: false, moving: false, inSub: false, camZoom: 1,
  };
  let camera, scene, diver, subM, drone, spot, spotTarget, fill, beam;
  let bubbles, bubbleData = [], breathT = 0, trailT = 0;
  const wish = new V3(), tmp = new V3(), tmp2 = new V3(), camTarget = new V3();
  // Персонажи создаются при первом выборе; diver — запасной вариант
  const avatars = {};
  let viewBlend = 0, camRoll = 0, lastYaw = 0, restPitch = 0.3;
  const fpPos = new V3(), fpLook = new V3(), tpPos = new V3(), lookAt = new V3();
  function current() {
    const id = SETTINGS.character || 'diver';
    if (!avatars[id]) {
      const model = typeof Characters !== 'undefined' ? Characters.build(id) : null;
      if (!model) return avatars.diver;
      model.visible = false;
      // Персонаж отбрасывает тень, но не принимает: изгиб хвоста в шейдере дал бы полосы самозатенения
      model.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
      P.obj.add(model);
      avatars[id] = model;
      if (typeof Gfx !== 'undefined') { Gfx.enhanceScene(model); Gfx.Assets.attach(id, model); }
    }
    return avatars[id];
  }
  const BUBBLES = 140;
  const raycast = new THREE.Raycaster(), camDelta = new V3(), camNearest = new V3();
  const local = new V3(), nearest = new V3();

  function safeCameraPosition(from, desired) {
    camDelta.subVectors(desired, from);
    const length = camDelta.length();
    if (length < 0.01) return desired;
    camDelta.divideScalar(length);
    let allowed = length;
    for(let d=0.3;d<length;d+=0.4) {
      camNearest.copy(from).addScaledVector(camDelta,d);
      if(camNearest.y<World.floorY(camNearest.x,camNearest.z)+0.2) { allowed=Math.min(allowed,Math.max(0.15,d-0.3)); break; }
    }
    for (const c of World.W.colliders) {
      camNearest.subVectors(c.c, from);
      const along = camNearest.dot(camDelta), r = c.r + 0.25;
      const d2 = camNearest.lengthSq() - along * along;
      if (d2 < r * r && along > 0) allowed = Math.min(allowed, Math.max(0.15, along - Math.sqrt(r * r - d2) - 0.15));
    }
    raycast.set(from, camDelta); raycast.near = 0.05; raycast.far = length;
    const hit = raycast.intersectObjects(World.W.walls, false)[0];
    if (hit) allowed = Math.min(allowed, Math.max(0.15, hit.distance - 0.25));
    return desired.copy(from).addScaledVector(camDelta, allowed);
  }

  function init(sc, cam) {
    scene = sc; camera = cam;
    P.obj = new THREE.Group();
    diver = Models.diver();
    diver.traverse(o => { if (o.isMesh) o.castShadow = true; });
    avatars.diver = diver;
    Gfx.Assets.attach('diver', diver);
    subM = Models.sub();
    subM.visible = false;
    subM.traverse(o => { if (o.isMesh) o.castShadow = true; });
    P.obj.add(diver, subM);
    scene.add(P.obj);

    drone = Models.drone();
    drone.visible = false;
    scene.add(drone);

    spot = new THREE.SpotLight(0xe8fbff, 0, 50, 0.42, 0.5, 1.2);
    spotTarget = new THREE.Object3D();
    spot.target = spotTarget;
    scene.add(spot, spotTarget);
    fill = new THREE.PointLight(0x9fdcff, 0.4, 14, 1.5);
    scene.add(fill);
    // Объёмный луч фонаря: мягкие края, затухание по длине и рассеяние в частицах воды
    const beamGeo = new THREE.CylinderGeometry(0.05,2.4,14,24,1,true);
    beamGeo.translate(0,-7,0); beamGeo.rotateX(Math.PI/2);
    beam = new THREE.Mesh(beamGeo,new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending,
      uniforms:{ uOp:{value:0.09}, uTime:Gfx.U.time, uColor:{value:new THREE.Color(0.75,0.95,1.0)} },
      vertexShader:`varying vec2 vUv; varying vec3 vNv; varying vec3 vVp;
        void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vNv=normalize(normalMatrix*normal); vVp=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`uniform float uOp, uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vNv; varying vec3 vVp;
        void main(){
          float edge = pow(abs(dot(normalize(vNv), normalize(vVp))), 2.0);
          float along = pow(vUv.y, 1.5);
          float dust = 0.8 + 0.2 * sin(vUv.y * 40.0 - uTime * 1.5 + vUv.x * 20.0);
          gl_FragColor = vec4(uColor * edge * along * dust * uOp, 1.0);
        }`,
    }));
    beam.visible=false; beam.frustumCulled=false; scene.add(beam);

    // Пузырьки дыхания
    const pos = new Float32Array(BUBBLES * 3).fill(-10000);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bubbles = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8fbff, size: 0.22, map: World.W.bubbleTex, transparent: true, depthWrite: false }));
    bubbles.frustumCulled = false;
    scene.add(bubbles);
    for (let i = 0; i < BUBBLES; i++) bubbleData.push({ p: new V3(0, -10000, 0), v: new V3(), life: 0 });
  }

  function setGear(opts) {
    P.inSub = opts.inSub;
    subM.visible = P.inSub;
    const av = current();
    for (const id in avatars) avatars[id].visible = false;
    av.visible = !P.inSub && !SETTINGS.firstPerson;
    diver.userData.helmet.visible = opts.deepsuit;
    P.hasFlash = opts.flashlight;
  }

  function emit(n, from, spread = 0.15) {
    for (let k = 0; k < n; k++) {
      const b = bubbleData.find(x => x.life <= 0);
      if (!b) return;
      b.life = 2 + Math.random() * 2;
      b.p.copy(from).add(tmp2.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      b.v.set((Math.random() - 0.5) * 0.4, 1.3 + Math.random(), (Math.random() - 0.5) * 0.4);
    }
  }

  function updateBubbles(dt, t) {
    const arr = bubbles.geometry.attributes.position.array;
    for (let i = 0; i < BUBBLES; i++) {
      const b = bubbleData[i];
      if (b.life > 0) {
        b.life -= dt;
        b.p.addScaledVector(b.v, dt);
        b.p.x += Math.sin(t * 5 + i) * dt * 0.3;
        if (b.p.y > -0.3) b.life = 0;
      }
      arr[i * 3] = b.p.x; arr[i * 3 + 1] = b.life > 0 ? b.p.y : -10000; arr[i * 3 + 2] = b.p.z;
    }
    bubbles.geometry.attributes.position.needsUpdate = true;
  }

  function headPos(out) {
    return P.inSub ? out.copy(P.obj.position).add(tmp2.set(0, 0.3, 0)) : current().userData.body.localToWorld(out.set(0, 0.75, 0.1));
  }

  function look(dx, dy) {
    const s = 0.0024 * SETTINGS.sensitivity;
    P.yaw -= dx * s;
    P.pitch += dy * s * (SETTINGS.invertY ? -1 : 1);
    P.pitch = Math.max(-1.2, Math.min(1.3, P.pitch));
  }

  function lerpAngle(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, k);
  }

  // g: { speed, vspeed, drone, depth, frozen }
  function update(dt, t, inp, g) {
    const pos = P.obj.position;
    if (!g.frozen) {
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      wish.set(0, 0, 0);
      if (inp.f) { wish.x += fx; wish.z += fz; }
      if (inp.b) { wish.x -= fx; wish.z -= fz; }
      if (inp.r) { wish.x -= fz; wish.z += fx; }
      if (inp.l) { wish.x += fz; wish.z -= fx; }
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(g.speed);
      if (inp.boost) wish.multiplyScalar(1.35);
      wish.y = ((inp.up ? 1 : 0) - (inp.down ? 1 : 0)) * g.vspeed;
      P.vel.lerp(wish, Math.min(1, dt * 2.5));
    } else {
      P.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
    }
    pos.addScaledVector(P.vel, dt);
    if (g.current) pos.addScaledVector(g.current, dt);

    // Границы мира, дно, поверхность
    pos.x = Math.max(-108, Math.min(108, pos.x));
    pos.z = Math.max(-1000, Math.min(55, pos.z));
    const fy = World.floorY(pos.x, pos.z) + (P.inSub ? 1.6 : 0.9);
    if (pos.y < fy) { pos.y = fy; if (P.vel.y < 0) P.vel.y = 0; }
    if (pos.y > -0.5) { pos.y = -0.5; if (P.vel.y > 0) P.vel.y = 0; }
    // Столкновения с крупными объектами
    const pr = P.inSub ? 1.5 : 0.6;
    for (const c of World.W.colliders) {
      tmp.subVectors(pos, c.c);
      const rr = c.r + pr, d2 = tmp.lengthSq();
      if (d2 < rr * rr && d2 > 1e-6) pos.copy(c.c).addScaledVector(tmp.normalize(), rr);
    }
    // Ship walls retain their local boxes, so tilted hulls remain enterable.
    for (let pass = 0; pass < 2; pass++) for (const wall of World.W.walls) {
      local.copy(pos); wall.worldToLocal(local);
      const box = wall.geometry.boundingBox;
      nearest.copy(local).clamp(box.min, box.max);
      tmp.subVectors(local, nearest);
      if (tmp.lengthSq() >= pr * pr) continue;
      if (tmp.lengthSq() < 1e-8) {
        let axis = 'x', sign = 1, distance = Infinity;
        for (const key of ['x','y','z']) for (const sd of [-1,1]) {
          const d = sd > 0 ? box.max[key] - local[key] : local[key] - box.min[key];
          if (d < distance) { axis = key; sign = sd; distance = d; }
        }
        local[axis] = (sign > 0 ? box.max[axis] : box.min[axis]) + sign * pr;
      } else local.copy(nearest).addScaledVector(tmp.normalize(), pr);
      pos.copy(wall.localToWorld(local));
    }
    P.atSurface = pos.y > -1.6;

    // Поворот и поза плавания
    const hs = Math.hypot(P.vel.x, P.vel.z);
    P.moving = P.vel.length() > 0.6;
    if (hs > 0.3) P.heading = lerpAngle(P.heading, Math.atan2(P.vel.x, P.vel.z), dt * 5);
    else if (SETTINGS.firstPerson) P.heading = P.yaw + Math.PI;
    P.obj.rotation.y = P.heading;
    P.swim += ((hs > 0.8 ? 1 : 0) - P.swim) * Math.min(1, dt * 3);
    const av = current();
    const ud = av.userData;
    const k = Math.min(1, P.vel.length() / 4);
    const tilt = Math.max(-0.4, Math.min(0.4, P.vel.y * 0.08));
    if (av.userData.mixer) av.userData.mixer.update(dt);
    if (ud.kind === 'mermaid') {
      // Хвост: бегущая волна, частота и размах растут со скоростью
      ud.tailU.ph.value += dt * (1.8 + k * 5.5);
      ud.tailU.amp.value += ((0.3 + k * 0.6) - ud.tailU.amp.value) * Math.min(1, dt * 3);
      // У дна русалка ложится горизонтально, чтобы хвост не уходил в песок
      const above = pos.y - World.floorY(pos.x, pos.z);
      restPitch += ((above < 3 ? 1.2 : 0.3) - restPitch) * Math.min(1, dt * 2);
      ud.body.rotation.x = Math.max(restPitch, P.swim * 1.4) - tilt + Math.sin(ud.tailU.ph.value) * 0.04 * ud.tailU.amp.value;
      ud.body.position.y = Math.sin(t * 1.3) * 0.06;
      ud.arms.forEach((a, i) => {
        const sd = i ? 1 : -1;
        a.rotation.z = sd * (0.3 + Math.sin(t * 1.2 + i) * 0.12 * (1 - P.swim) + P.swim * 0.05);
        a.rotation.x = Math.sin(t * 1.3 + i * 2) * 0.25 * (1 - P.swim) + P.swim * 0.35;
        if (inp.e && i === 1) a.rotation.x = -1.25 + Math.sin(t * 9) * 0.12;
      });
    } else {
      ud.body.rotation.x = P.swim * 1.35 - tilt;
      ud.body.position.y = Math.sin(t * 1.3) * 0.08;
      ud.legs[0].rotation.x = Math.sin(t * 8) * 0.5 * k + Math.sin(t * 2) * 0.15;
      ud.legs[1].rotation.x = -Math.sin(t * 8) * 0.5 * k - Math.sin(t * 2) * 0.15;
      ud.arms.forEach((a, i) => {
        a.rotation.z = (i ? 1 : -1) * (0.25 + Math.sin(t * 1.5 + i) * 0.15 * (1 - P.swim));
        a.rotation.x = Math.sin(t * 1.5 + i * 2) * 0.3 * (1 - P.swim) + P.swim * 0.2;
        if (inp.e && i === 1) a.rotation.x = -1.25 + Math.sin(t * 9) * 0.12;
      });
    }
    if (P.inSub) {
      subM.rotation.x = -Math.max(-0.4, Math.min(0.4, P.vel.y * 0.06));
      subM.userData.prop.rotation.z += dt * (2 + P.vel.length() * 3);
    }

    // Камера
    camTarget.copy(pos).y += P.inSub ? 1.2 : 0.6;
    for (const id in avatars) avatars[id].visible = false;
    // Плавный переход между видами: модель скрывается, когда камера почти у головы
    viewBlend += ((SETTINGS.firstPerson ? 1 : 0) - viewBlend) * Math.min(1, dt * 6);
    av.visible = !P.inSub && viewBlend < 0.85;
    // Естественное покачивание: дыхание и толчки при плавании
    const bob = Math.sin(t * 1.25) * 0.035 + Math.sin(t * 6.5) * 0.02 * k;
    const sway = Math.sin(t * 0.8) * 0.025;
    const cp = Math.cos(P.pitch);
    // Вид от первого лица
    fpPos.copy(pos); fpPos.y += (P.inSub ? 0.4 : 0.5) + bob;
    fpPos.x += Math.cos(P.yaw) * sway; fpPos.z -= Math.sin(P.yaw) * sway;
    fpLook.set(-Math.sin(P.yaw) * cp, -Math.sin(P.pitch), -Math.cos(P.yaw) * cp).add(fpPos);
    // Вид от третьего лица
    const dist = (P.inSub ? 9.5 : (ud.kind === 'mermaid' ? 6.2 : 5.5)) * P.camZoom;
    tpPos.set(Math.sin(P.yaw) * cp, Math.sin(P.pitch), Math.cos(P.yaw) * cp).multiplyScalar(dist).add(camTarget);
    const cf = World.floorY(tpPos.x, tpPos.z) + 0.6;
    if (tpPos.y < cf) tpPos.y = cf;
    if (tpPos.y > -0.35) tpPos.y = -0.35;
    tpPos.y += bob * 0.5;
    if (viewBlend > 0.995) {
      camera.position.copy(fpPos);
      lookAt.copy(fpLook);
    } else {
      // Позиция третьего лица сглаживается и не проходит сквозь стены и скалы
      camera.position.lerp(tpPos, 1 - Math.exp(-dt * 10));
      safeCameraPosition(camTarget, camera.position);
      camera.position.lerp(fpPos, viewBlend);
      lookAt.copy(camTarget).lerp(fpLook, viewBlend);
    }
    camera.lookAt(lookAt);
    // Если препятствие прижало камеру вплотную, модель скрывается и не закрывает обзор
    if (camera.position.distanceToSquared(camTarget) < 1.4 * 1.4) av.visible = false;
    // Лёгкий крен при поворотах
    let dyaw = P.yaw - lastYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    lastYaw = P.yaw;
    camRoll += (Math.max(-0.06, Math.min(0.06, dyaw / Math.max(dt, 1e-3) * 0.012)) - camRoll) * Math.min(1, dt * 4);
    camera.rotateZ(camRoll + Math.sin(t * 0.9) * 0.006);

    // Фонарь
    camera.getWorldDirection(tmp);
    spot.position.copy(camTarget);
    spotTarget.position.copy(camTarget).addScaledVector(tmp, 15);
    const strong = P.hasFlash || P.inSub;
    const lightLevel = typeof Expansion !== 'undefined' ? Expansion.gearLevel('flashlight') : 0;
    spot.intensity = P.flashOn ? (strong ? 3.4 + lightLevel * 0.6 : 1.2) : 0;
    spot.distance = strong ? 60 + lightLevel * 20 : 18;
    spotTarget.updateMatrixWorld();
    beam.visible=P.flashOn && Gfx.q.beam;
    beam.material.uniforms.uOp.value = strong ? 0.07 + Math.min(1, g.depth / 300) * 0.06 : 0.04;
    beam.position.copy(camTarget); beam.quaternion.copy(camera.quaternion);
    beam.scale.setScalar(strong?1+lightLevel*0.12:0.65);
    spot.angle = strong ? 0.48 : 0.32;
    fill.position.copy(camTarget);
    fill.intensity = 0.25 + Math.min(1, g.depth / 400) * 0.45;

    // Пузырьки
    breathT -= dt; trailT -= dt;
    if (!P.inSub && breathT <= 0) { breathT = 3; emit(7, headPos(tmp)); if (g.depth > 1) Sound.play('bubble'); }
    if (P.moving && trailT <= 0) { trailT = P.inSub ? 0.05 : 0.18; emit(1, P.inSub ? tmp.copy(pos).addScaledVector(tmp2.set(-Math.sin(P.heading), 0, -Math.cos(P.heading)), 1.8) : pos, 0.4); }
    updateBubbles(dt, t);

    // Дрон-помощник
    drone.visible = g.drone;
    if (g.drone) {
      tmp.set(pos.x + Math.cos(t * 0.8) * 2.4, pos.y + 1.3 + Math.sin(t * 1.7) * 0.3, pos.z + Math.sin(t * 0.8) * 2.4);
      if (drone.position.distanceToSquared(pos) > 400) drone.position.copy(tmp);
      drone.position.lerp(tmp, Math.min(1, dt * 3));
      drone.lookAt(pos);
      drone.userData.props.forEach((p, i) => { p.rotation.y += dt * 25 * (i % 2 ? 1 : -1); });
    }
  }

  function teleport(p, yaw = 0) {
    P.obj.position.set(p[0], p[1], p[2]);
    P.vel.set(0, 0, 0);
    P.yaw = yaw; P.pitch = 0.22; P.heading = yaw + Math.PI;
    lastYaw = yaw; camRoll = 0;
    const cp = Math.cos(P.pitch);
    camera.position.set(p[0] + Math.sin(yaw) * cp * 5.5, Math.min(-0.35, p[1] + 0.6 + Math.sin(P.pitch) * 5.5), p[2] + Math.cos(yaw) * cp * 5.5);
    drone.position.copy(P.obj.position);
  }

  Object.assign(P, { init, update, teleport, setGear, look, headPos, emit, safeCameraPosition });
  return P;
})();
