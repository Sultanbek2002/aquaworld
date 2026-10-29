'use strict';
// ============================================================
//  Подводный мир: рельеф, вода, освещение, растения, корабли,
//  пещеры, древний храм и исследовательская база
// ============================================================

const World = (() => {
  const PI = Math.PI;
  const W = {
    poi: {}, colliders: [], walls: [], hazards: [], o2vents: [], pillars: [], upgrades: {},
    time: { value: 0 }, snowCenter: { value: new THREE.Vector3() },
    rays: [], core: null, coreLight: null, sonarDish: null,
  };
  let scene, terrainMat, sun, hemi;

  // Детерминированный генератор случайных чисел — мир одинаковый при каждом запуске
  let seed = 1337;
  function rng() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  const R = (a, b) => a + rng() * (b - a);
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- Рельеф дна ----------
  // d — расстояние от базы (d = -z). Дно ступенями уходит вниз через обрывы.
  function floorBase(d) {
    let y = -7;
    y += -19 * smooth(160, 200, d);
    y += -46 * smooth(360, 400, d);
    y += -113 * smooth(560, 600, d);
    y += -65 * smooth(780, 820, d);
    return y;
  }
  function floorY(x, z) {
    const d = -z, ax = Math.abs(x);
    let y = floorBase(d);
    y += Math.sin(x * 0.08 + z * 0.03) * 1.2 + Math.sin(x * 0.023 - z * 0.05) * 2.0 + Math.cos(x * 0.15 + z * 0.11) * 0.5;
    y += smooth(80, 125, ax) * (14 + (-floorBase(d)) * 0.55);   // боковые скалы
    y += smooth(-35, -70, d) * 9;                               // берег за базой
    y += smooth(990, 1030, d) * 140;                            // стена в конце бездны
    return y;
  }

  // ---------- Текстуры на canvas ----------
  function canvasTex(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    return t;
  }
  const dotTex = () => canvasTex(64, (g, n) => {
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  });
  const bubbleTex = () => canvasTex(64, (g, n) => {
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 5;
    g.beginPath(); g.arc(n / 2, n / 2, n / 2 - 5, 0, PI * 2); g.stroke();
    g.fillStyle = 'rgba(200,240,255,0.25)'; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(n * 0.36, n * 0.34, 6, 0, PI * 2); g.fill();
  });
  W.dotTex = null; W.bubbleTex = null;

  // ---------- Помощники ----------
  function add(o) { scene.add(o); return o; }
  function mesh(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; }
  const stdMat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9 }, o));

  // Сглаженные нормали для не-индексированной геометрии (вершины с одинаковой позицией)
  function smoothNormals(geo) {
    geo.computeVertexNormals();
    const p = geo.attributes.position, n = geo.attributes.normal, acc = new Map();
    const key = i => Math.round(p.getX(i) * 1e3) + ',' + Math.round(p.getY(i) * 1e3) + ',' + Math.round(p.getZ(i) * 1e3);
    for (let i = 0; i < p.count; i++) {
      const k = key(i), a = acc.get(k) || [0, 0, 0];
      a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
      acc.set(k, a);
    }
    for (let i = 0; i < p.count; i++) {
      const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
      n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
    }
    return geo;
  }
  // Деформация шумом (камни, кораллы)
  function displace(geo, amp, freq, seedOff = 0) {
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Gfx.fbm(v.x * freq + 11 + seedOff, v.z * freq + v.y * freq * 0.7 + 5, 256, 3) - 0.5;
      v.multiplyScalar(1 + n * amp);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    return smoothNormals(geo);
  }
  // Сферические UV для деформированных многогранников (для карт нормалей)
  function sphereUV(geo, rep = 2) {
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1;
      uv[i * 2] = (Math.atan2(z, x) / (PI * 2) + 0.5) * rep;
      uv[i * 2 + 1] = (Math.asin(y / l) / PI + 0.5) * rep;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }
  // Объединение нескольких геометрий (позиция, нормаль, uv) в одну
  function merge(geos) {
    const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
    let n = 0;
    parts.forEach(g => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    parts.forEach(g => {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  }

  // Множество одинаковых объектов одним вызовом отрисовки (InstancedMesh)
  function scatter(geo, mat, n, place) {
    const im = new THREE.InstancedMesh(geo, mat, n);
    const d = new THREE.Object3D(), c = new THREE.Color();
    let k = 0;
    for (let i = 0; i < n; i++) {
      d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); c.set(0xffffff);
      if (place(d, c, i) === false) continue;
      d.updateMatrix();
      im.setMatrixAt(k, d.matrix);
      im.setColorAt(k, c);
      k++;
    }
    im.count = k;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    return add(im);
  }

  // Материал с покачиванием (водоросли). Параметры — через uniform, чтобы шейдер был общим.
  function swayMaterial(strength) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
    const uSway = { value: strength };
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = W.time;
      sh.uniforms.uSway = uSway;
      sh.vertexShader = 'uniform float uTime;\nuniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        float hh = max(position.y, 0.0);
        vec4 ip = instanceMatrix[3];
        float ph = ip.x * 0.37 + ip.z * 0.23;
        transformed.x += sin(uTime * 1.3 + ph + hh * 2.5) * hh * hh * uSway;
        transformed.z += cos(uTime * 1.1 + ph * 1.3 + hh * 2.0) * hh * hh * uSway * 0.6;`);
    };
    return m;
  }

  // Пульсация яркости светящихся экземпляров (кристаллы, грибы); фаза — от позиции экземпляра
  function pulse(m, amount) {
    const uAmt = { value: amount };
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = W.time; sh.uniforms.uAmt = uAmt;
      sh.vertexShader = 'uniform float uTime;\nuniform float uAmt;\nvarying float vPulse;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 pp = instanceMatrix[3];
        vPulse = 1.0 + uAmt * sin(uTime * 1.4 + pp.x * 0.7 + pp.z * 0.31);`);
      sh.fragmentShader = 'varying float vPulse;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPulse;');
    };
    return m;
  }
  // Светящиеся колышущиеся стебли: яркость растёт к кончику
  function glowSway(strength) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = W.time;
      sh.vertexShader = 'uniform float uTime;\nvarying float vH;\nvarying float vPh;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        float hh = max(position.y, 0.0);
        vec4 ip = instanceMatrix[3];
        float ph = ip.x * 0.37 + ip.z * 0.23;
        transformed.x += sin(uTime * 1.1 + ph + hh * 2.5) * hh * hh * ${strength.toFixed(2)};
        transformed.z += cos(uTime * 0.9 + ph * 1.3 + hh * 2.0) * hh * hh * ${(strength * 0.6).toFixed(2)};
        vH = hh; vPh = ph;`);
      sh.fragmentShader = 'uniform float uTime;\nvarying float vH;\nvarying float vPh;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= (0.15 + 3.2 * pow(vH, 3.0)) * (0.8 + 0.2 * sin(uTime * 2.0 + vPh * 5.0));`);
    };
    return m;
  }

  // Колонна пузырьков (анимация в шейдере)
  function bubbleColumn(x, y0, z, height, count = 40, color = 0xd8f6ff, size = 0.35) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { pos[i * 3] = R(-0.7, 0.7); pos[i * 3 + 1] = R(0, height); pos[i * 3 + 2] = R(-0.7, 0.7); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, map: W.bubbleTex, transparent: true, depthWrite: false, opacity: 0.85 });
    const uH = { value: height }, uS = { value: R(2.5, 4) };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = W.time; sh.uniforms.uH = uH; sh.uniforms.uS = uS;
      sh.vertexShader = 'uniform float uTime;\nuniform float uH;\nuniform float uS;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `vec3 transformed = position;
        transformed.y = mod(position.y + uTime * uS, uH);
        transformed.x += sin(uTime * 2.0 + position.y * 3.0) * 0.15 * (transformed.y / uH + 0.3);`);
    };
    const p = new THREE.Points(geo, mat);
    p.position.set(x, y0, z);
    p.frustumCulled = false;
    return add(p);
  }

  // ---------- Затонувший корабль ----------
  function ship(x, z, rotY, tilt, L) {
    const g = new THREE.Group();
    const T = Gfx.T;
    const wood = stdMat(0xb89a80, { side: THREE.DoubleSide, map: T.wood, normalMap: T.woodN, normalScale: new THREE.Vector2(0.8, 0.8) });
    const moss = stdMat(0x6f8a5a, { map: T.wood, normalMap: T.woodN }), dark = stdMat(0x1a1410);
    const sh = new THREE.Shape();
    sh.moveTo(-L / 2, 4.5); sh.lineTo(-L / 2 + 1, 0.3); sh.lineTo(-L / 2 + 3, -0.5);
    sh.lineTo(L / 2 - 6, -0.5); sh.lineTo(L / 2 - 1, 2); sh.lineTo(L / 2 + 1, 5.2); sh.lineTo(-L / 2, 4.5);
    const hg = new THREE.ExtrudeGeometry(sh, { depth: 7, bevelEnabled: false });
    hg.translate(0, 0, -3.5);
    hg.rotateY(-PI / 2);
    // Open hull: two rooms, a side entrance and a hatch through the deck.
    const roomParts = [];
    const wall = (sx, sy, sz, x, y, z, mat = wood) => {
      const p = mesh(new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z);
      g.add(p); roomParts.push(p); return p;
    };
    wall(6.6, 0.35, L - 3, 0, 0.55, 0);
    wall(0.25, 3.6, L - 3, -3.3, 2.4, 0);
    // The starboard entrance is three units wide.
    wall(0.25, 3.6, L / 2 - 3, 3.3, 2.4, -L / 4 - 0.5);
    wall(0.25, 3.6, L / 2 - 3, 3.3, 2.4, L / 4 + 0.5);
    wall(6.6, 3.6, 0.3, 0, 2.4, -L / 2 + 1.5);
    wall(6.6, 3.6, 0.3, 0, 2.4, L / 2 - 1.5);
    wall(2, 3.3, 0.25, -2.3, 2.4, 0); wall(2, 3.3, 0.25, 2.3, 2.4, 0);
    wall(1.8, 0.3, L - 3, -2.4, 4.3, 0, moss);
    wall(1.8, 0.3, L - 3, 2.4, 4.3, 0, moss);
    wall(3, 0.3, L / 2 - 3, 0, 4.3, L / 4 + 0.5, moss);
    wall(3, 0.3, L / 2 - 3, 0, 4.3, -L / 4 - 0.5, moss);
    // Cargo and luminous research notes can be explored from inside.
    g.add(mesh(new THREE.BoxGeometry(1.2, 1, 1.2), moss, -1.9, 1.2, L / 4));
    g.add(mesh(new THREE.BoxGeometry(0.65, 0.05, 0.5), new THREE.MeshBasicMaterial({color:0x65dbc9}), -1.8, 1.8, -L / 4));
    g.add(mesh(new THREE.BoxGeometry(2.5, 0.35, 3), dark, 1.2, 4.35, -L / 4));          // пробоина
    g.add(mesh(new THREE.BoxGeometry(0.2, 2, 2.5), dark, 3.55, 1.8, L / 6));           // дыра в борту
    g.add(mesh(new THREE.BoxGeometry(5, 3, 6), wood, 0, 6, -L / 2 + 4));                // рубка
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.8, 0.1), stdMat(0x0a1a22, { emissive: 0x1a4a5a, emissiveIntensity: 0.4 }), 0, 6.3, -L / 2 + 7.05));
    const mast = mesh(new THREE.CylinderGeometry(0.3, 0.35, 16, 8), wood, 0, 12, 2);
    g.add(mast);
    g.add(mesh(new THREE.BoxGeometry(9, 0.25, 0.25), wood, 0, 16, 2));
    const broken = mesh(new THREE.CylinderGeometry(0.3, 0.35, 6, 8), wood, 0, 7, L / 3);
    g.add(broken);
    const fallen = mesh(new THREE.CylinderGeometry(0.3, 0.3, 12, 8), wood, 4, 1, L / 3 + 3);
    fallen.rotation.set(0.3, 0, 1.3);
    g.add(fallen);
    // Шпангоуты: рёбра корпуса, торчащие из-под палубы
    const ribGeo = new THREE.TorusGeometry(3.7, 0.2, 6, 18, PI);
    for (let k = -L / 2 + 3; k < L / 2 - 2; k += 2.6) {
      if (Math.abs(k) < 2.6) continue;
      const rib = mesh(ribGeo, wood, 0, 4.1, k);
      rib.rotation.z = PI;
      rib.scale.set(1, 1.05, 1);
      g.add(rib);
    }
    // Иллюминаторы с латунными кольцами
    const brass = stdMat(0x9a7a3a, { metalness: 0.8, roughness: 0.45 });
    const portGlass = new THREE.MeshStandardMaterial({ color: 0x0b2630, emissive: 0x1d6a7a, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.3 });
    const ringGeo = new THREE.TorusGeometry(0.35, 0.08, 6, 14), discGeo = new THREE.CircleGeometry(0.33, 14);
    [-1, 1].forEach(sd => {
      for (let k = -L / 2 + 4; k < L / 2 - 3; k += 3.5) {
        if (sd > 0 && Math.abs(k + 0.5) < 3) continue;
        const r = mesh(ringGeo, brass, sd * 3.45, 2.8, k); r.rotation.y = PI / 2; g.add(r);
        const d = mesh(discGeo, portGlass, sd * 3.44, 2.8, k); d.rotation.y = sd * PI / 2; g.add(d);
      }
    });
    // Старый фонарь в рубке — тёплое свечение для bloom
    g.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb050).multiplyScalar(2.2) }), 1.6, 7.6, -L / 2 + 6.9));
    g.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 8), brass, 1.6, 7.95, -L / 2 + 6.9));
    g.position.set(x, floorY(x, z) - 0.3, z);
    g.rotation.set(0, rotY, tilt);
    add(g);
    g.updateMatrixWorld(true);
    const toWorld = (lx, ly, lz) => g.localToWorld(new THREE.Vector3(lx, ly, lz));
    roomParts.forEach(p => { p.geometry.computeBoundingBox(); W.walls.push(p); });
    W.poi['room' + Math.round(-z)] = toWorld(0, 2.3, L / 4);
    return { g, toWorld };
  }

  // ---------- Исследовательская база ----------
  function buildBase() {
    const B = new THREE.Group();
    B.position.set(0, 0, 20);
    add(B);
    const white = stdMat(0xeef4f8, { roughness: 0.5, metalness: 0.2 }), orange = stdMat(0xff7a1a, { roughness: 0.5 });
    const metal = stdMat(0x8899aa, { roughness: 0.4, metalness: 0.6 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x9fefff, emissive: 0x1f6f8f, emissiveIntensity: 0.4, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, roughness: 0.1, metalness: 0.5 });
    const glowC = new THREE.MeshBasicMaterial({ color: 0x5fe8ff });
    const fy = floorY(0, 20);
    // Плавучая платформа на поверхности
    B.add(mesh(new THREE.CylinderGeometry(9, 9, 1.4, 24), white, 0, 0.2, 0));
    const ring = mesh(new THREE.TorusGeometry(9, 0.35, 8, 32), orange, 0, 0.3, 0);
    ring.rotation.x = PI / 2; B.add(ring);
    B.add(mesh(new THREE.BoxGeometry(8, 3.5, 6), white, 0, 2.6, 0));
    B.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), metal, 2, 7, 0));
    [[5, 5], [-5, 5], [5, -5], [-5, -5]].forEach(([x, z]) => B.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, -fy, 8), metal, x, fy / 2, z)));
    // Шахта к подводному куполу
    B.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 6, 12), metal, 0, -3, 0));
    const dome = mesh(new THREE.SphereGeometry(6, 24, 12, 0, PI * 2, 0, PI / 2), glassM, 0, fy, 0);
    B.add(dome);
    for (let i = 0; i < 4; i++) {
      const fr = mesh(new THREE.TorusGeometry(6, 0.14, 6, 32, PI), metal, 0, fy, 0);
      fr.rotation.y = i * PI / 4;
      B.add(fr);
    }
    const baseRing = mesh(new THREE.TorusGeometry(6.1, 0.3, 6, 32), metal, 0, fy + 0.2, 0);
    baseRing.rotation.x = PI / 2; B.add(baseRing);
    for (let i = 0; i < 10; i++) B.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), glowC, Math.cos(i / 10 * PI * 2) * 6.6, fy + 0.4, Math.sin(i / 10 * PI * 2) * 6.6));
    // Внутри купола: лаборатория
    B.add(mesh(new THREE.BoxGeometry(3, 1.2, 1.2), white, -1.5, fy + 0.6, -2));
    B.add(mesh(new THREE.BoxGeometry(1.6, 1, 0.1), new THREE.MeshBasicMaterial({ color: 0x27d3ff }), -1.5, fy + 1.8, -2.5));
    B.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 12), glassM, 2, fy + 1.1, 1));
    const pl = new THREE.PointLight(0xffe2b0, 1.4, 26);
    pl.position.set(0, fy + 3, 0);
    B.add(pl);
    // Точка начала погружения (лунный бассейн)
    const pool = mesh(new THREE.TorusGeometry(2.4, 0.15, 8, 32), glowC, 0, -2.5, -10);
    pool.rotation.x = PI / 2; B.add(pool);
    W.colliders.push({ c: new THREE.Vector3(0, fy, 20), r: 6.4 });

    // Модули улучшений (появляются после покупки)
    const mod = (id, build) => { const g = new THREE.Group(); build(g); g.visible = false; B.add(g); W.upgrades[id] = g; };
    const tube = (g, x, z, len, rotY) => { const t = mesh(new THREE.CylinderGeometry(0.8, 0.8, len, 10), metal, x, fy + 1, z); t.rotation.set(0, rotY, PI / 2); g.add(t); };
    mod('quarters', g => {
      g.add(mesh(new THREE.SphereGeometry(3.5, 16, 8, 0, PI * 2, 0, PI / 2), glassM, 12, fy, 0));
      g.add(mesh(new THREE.BoxGeometry(2, 0.6, 1.2), orange, 12, fy + 0.3, 0));
      tube(g, 7.5, 0, 4, 0);
      W.colliders.push({ c: new THREE.Vector3(12, fy, 20), r: 3.8 });
    });
    mod('compressor', g => {
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 4, 12), stdMat(i % 2 ? 0x27d3ff : 0xeef4f8, { metalness: 0.5 }), -10 - i * 1.8, fy + 2, 2));
      tube(g, -7.5, 1, 3, 0);
    });
    mod('barochamber', g => {
      const c = mesh(new THREE.CylinderGeometry(2, 2, 7, 16), white, 0, fy + 2, 12);
      c.rotation.x = PI / 2; g.add(c);
      const port = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.2, 12), glowC, 0, fy + 2, 15.6);
      port.rotation.x = PI / 2; g.add(port);
      tube(g, 0, 7.5, 3, PI / 2);
      W.colliders.push({ c: new THREE.Vector3(0, fy + 2, 32), r: 2.6 });
    });
    mod('vet', g => {
      g.add(mesh(new THREE.SphereGeometry(3.5, 16, 8, 0, PI * 2, 0, PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fffc8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), 9, fy, -9));
      const gm = new THREE.MeshBasicMaterial({ color: 0x5fffa0 });
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.4, 0.1), gm, 9, fy + 4.2, -9));
      g.add(mesh(new THREE.BoxGeometry(0.4, 1.6, 0.1), gm, 9, fy + 4.2, -9));
      tube(g, 5.5, -5.5, 3, -PI / 4);
    });
    mod('sonar', g => {
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), metal, -2.5, 5.5, 0));
      const dish = mesh(new THREE.SphereGeometry(1.6, 12, 6, 0, PI * 2, 0, PI / 2), white, -2.5, 7.2, 0);
      dish.rotation.x = 2.2;
      g.add(dish);
      W.sonarDish = dish;
      const s2 = mesh(new THREE.SphereGeometry(1.2, 12, 6, 0, PI * 2, 0, PI / 2), metal, 0, -1, 0);
      s2.rotation.x = PI;
      const holder = new THREE.Group(); holder.position.set(-5, fy + 0.5, -5); holder.add(s2); g.add(holder);
    });
    W.poi.base = new THREE.Vector3(0, -4, 20);
  }

  function setUpgrades(list) {
    for (const id in W.upgrades) W.upgrades[id].visible = list.includes(id);
  }

  // ---------- Сборка мира ----------
  function build(sc, quality) {
    scene = sc;
    W.dotTex = dotTex();
    W.bubbleTex = bubbleTex();
    const Q = Gfx.preset(quality);
    const T = Gfx.buildTextures();
    scene.fog = new THREE.FogExp2(0x2d9fc8, 0.012);
    scene.background = new THREE.Color(0x2d9fc8);

    hemi = add(new THREE.HemisphereLight(0xbff0ff, 0x0d2a40, 0.9));
    // Солнце следует за игроком, чтобы тени были чёткими рядом с ним
    sun = new THREE.DirectionalLight(0xfff1d6, 1.2);
    sun.position.set(30, 100, 20);
    sun.castShadow = true;
    const shCam = sun.shadow.camera;
    shCam.left = -45; shCam.right = 45; shCam.top = 45; shCam.bottom = -45; shCam.near = 1; shCam.far = 260;
    sun.shadow.mapSize.set(Q.shadowSize || 512, Q.shadowSize || 512);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    add(sun); add(sun.target);
    Gfx.sun = sun;
    add(new THREE.AmbientLight(0x1a3050, 0.25));

    // Рельеф: песок с рябью (карта нормалей), плавные переходы цвета зон
    const geo = new THREE.PlaneGeometry(300, 1120, 100, 373);
    geo.rotateX(-PI / 2);
    geo.translate(0, 0, -490);
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
    const zc = [new THREE.Color(0xc2aa7c), new THREE.Color(0x8f8a5c), new THREE.Color(0x6a6152), new THREE.Color(0x46385f), new THREE.Color(0x1c2030)];
    const rock = new THREE.Color(0x5a6470), patch = new THREE.Color(0x9a9a6a), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = -z;
      pos.setY(i, floorY(x, z));
      c.copy(zc[0]).lerp(zc[1], smooth(170, 200, d)).lerp(zc[2], smooth(370, 400, d)).lerp(zc[3], smooth(570, 600, d)).lerp(zc[4], smooth(790, 820, d));
      const nz = Gfx.fbm(x * 0.03 + 50, z * 0.03 + 50, 256, 4);
      if (d < 190) c.lerp(patch, smooth(0.45, 0.7, nz) * 0.5);
      c.lerp(rock, smooth(78, 110, Math.abs(x)) * 0.8);
      const n = 0.82 + nz * 0.3;
      cols[i * 3] = c.r * n; cols[i * 3 + 1] = c.g * n; cols[i * 3 + 2] = c.b * n;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    T.sandN.repeat.set(75, 280);
    terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, normalMap: T.sandN, normalScale: new THREE.Vector2(0.9, 0.9) });
    const terrain = add(new THREE.Mesh(geo, terrainMat));
    terrain.receiveShadow = true;

    buildWater();
    buildRays(Q.rays);
    buildParticles(Q.particles);

    buildFlora(quality);
    buildWrecks();
    buildCaves();
    buildAbyss();
    buildBase();
    buildVents();
  }

  // ---------- Поверхность океана (вид снизу) ----------
  // Волны Герстнера в вершинах, окно Снеллиуса и полное внутреннее отражение во фрагментах.
  function buildWater() {
    const wg = new THREE.PlaneGeometry(700, 1400, 100, 200);
    wg.rotateX(-PI / 2);
    wg.translate(0, 0, -480);
    W.waterU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uBright: { value: 1 },
      uDeep: { value: new THREE.Color(0x1d6f92) }, uSky: { value: new THREE.Color(0.75, 0.93, 1.0) },
      uSunDir: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() },
    }]);
    const mat = new THREE.ShaderMaterial({
      uniforms: W.waterU, fog: true, side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime;
        varying vec3 vW; varying vec3 vN;
        #include <fog_pars_vertex>
        void wave(vec2 p, vec2 d, float k, float a, float s, inout vec3 off, inout vec3 n) {
          d = normalize(d);
          float f = dot(d, p) * k + uTime * s;
          off.xz += d * (a * 0.6) * cos(f);
          off.y += a * sin(f);
          n.xz -= d * k * a * cos(f);
        }
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 off = vec3(0.0), n = vec3(0.0, 1.0, 0.0);
          wave(wp.xz, vec2(1.0, 0.3), 0.11, 0.38, 1.05, off, n);
          wave(wp.xz, vec2(-0.4, 1.0), 0.17, 0.22, 1.35, off, n);
          wave(wp.xz, vec2(0.7, -0.8), 0.29, 0.12, 1.9, off, n);
          wave(wp.xz, vec2(-1.0, -0.2), 0.47, 0.06, 2.6, off, n);
          wp.xyz += off;
          vW = wp.xyz; vN = normalize(n);
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime, uBright;
        uniform vec3 uDeep, uSky, uSunDir;
        varying vec3 vW; varying vec3 vN;
        #include <fog_pars_fragment>
        void main() {
          vec3 n = vN;
          vec2 p = vW.xz * 0.7;
          n.x += (sin(p.x * 1.7 + uTime * 1.9) + sin(p.y * 2.3 - uTime * 1.4 + p.x)) * 0.05;
          n.z += (cos(p.y * 1.9 + uTime * 1.6) + cos(p.x * 2.1 + uTime * 1.2 - p.y)) * 0.05;
          n = normalize(n);
          vec3 I = normalize(vW - cameraPosition);
          float cosI = abs(dot(I, n));
          float k = 1.0 - 1.777 * (1.0 - cosI * cosI);
          float win = smoothstep(0.0, 0.22, k);
          vec3 T = refract(I, -n, 1.333);
          vec3 Tn = normalize(T + vec3(0.0, 1e-4, 0.0));
          vec3 sky = mix(uSky * 0.8, uSky * 1.8, clamp(Tn.y, 0.0, 1.0));
          float sunD = max(dot(Tn, uSunDir), 0.0);
          sky += vec3(1.0, 0.95, 0.82) * (pow(sunD, 400.0) * 40.0 + pow(sunD, 10.0) * 1.4);
          // Вне окна — отражение глубины (полное внутреннее отражение)
          vec3 refl = uDeep * (0.55 + 0.45 * abs(n.y)) + uSky * 0.05;
          vec3 col = mix(refl, sky * uBright, win);
          col += uSky * 0.6 * uBright * exp(-abs(k - 0.03) * 30.0);
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    W.water = add(new THREE.Mesh(wg, mat));
    W.water.frustumCulled = false;
  }

  // ---------- Солнечные лучи: объёмные конусы с мягкими краями ----------
  const rayVS = `
    varying vec2 vUv; varying vec3 vNv; varying vec3 vVp;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNv = normalize(normalMatrix * normal); vVp = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const rayFS = `
    uniform float uOp, uTime, uSeed; uniform vec3 uColor;
    varying vec2 vUv; varying vec3 vNv; varying vec3 vVp;
    void main() {
      float d = length(vVp);
      float edge = pow(abs(dot(normalize(vNv), vVp / d)), 2.5);
      float fall = pow(vUv.y, 1.8);
      float flick = 0.7 + 0.3 * sin(uTime * 1.1 + vUv.x * 31.4 + uSeed) * sin(uTime * 0.6 + vUv.x * 12.6 - uSeed);
      float fade = smoothstep(2.0, 12.0, d) * exp(-d * 0.012);
      gl_FragColor = vec4(uColor * edge * fall * flick * fade * uOp, 1.0);
    }`;
  function buildRays(n) {
    const rg = new THREE.CylinderGeometry(1.3, 5, 60, 20, 1, true);
    rg.translate(0, -30, 0);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(rg, new THREE.ShaderMaterial({
        vertexShader: rayVS, fragmentShader: rayFS, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uOp: { value: 0 }, uTime: W.time, uSeed: { value: R(0, 50) }, uColor: { value: new THREE.Color(0.75, 0.95, 1.0) } },
      }));
      m.position.set(R(-60, 60), 0, R(-60, 60));
      m.rotation.set(R(-0.12, 0.12), 0, 0.22 + R(-0.06, 0.06));
      m.scale.set(R(0.6, 1.4), R(0.8, 1.2), R(0.6, 1.4));
      m.userData.ph = R(0, 10);
      m.frustumCulled = false;
      W.rays.push(add(m));
    }
  }

  // ---------- Частицы: морской снег и светящийся планктон ----------
  function buildParticles(k) {
    const snowN = Math.round(1800 * k);
    const sp = new Float32Array(snowN * 3);
    for (let i = 0; i < snowN * 3; i++) sp[i] = R(0, 90);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const sm = new THREE.PointsMaterial({ color: 0xd8f4ff, size: 0.12, map: Gfx.T.dot, transparent: true, opacity: 0.7, depthWrite: false });
    sm.onBeforeCompile = sh => {
      sh.uniforms.uTime = W.time; sh.uniforms.uCenter = W.snowCenter;
      sh.vertexShader = 'uniform float uTime;\nuniform vec3 uCenter;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `vec3 transformed = position;
        transformed.y -= uTime * 0.3;
        transformed.x += sin(uTime * 0.3 + position.z) * 0.6;
        transformed.z += cos(uTime * 0.25 + position.x) * 0.4;
        transformed = mod(transformed - uCenter + 45.0, 90.0) + uCenter - 45.0;`);
    };
    const snow = new THREE.Points(sg, sm);
    snow.frustumCulled = false;
    add(snow);

    // Биолюминесцентный планктон: проявляется на глубине, мерцает
    const pn = Math.round(900 * k);
    const pp = new Float32Array(pn * 3), pc = new Float32Array(pn * 3), ph = new Float32Array(pn);
    const pal = [new THREE.Color(0x40e0ff), new THREE.Color(0x5fffb0), new THREE.Color(0xb77dff), new THREE.Color(0x9fdfff)];
    for (let i = 0; i < pn; i++) {
      pp[i * 3] = R(0, 60); pp[i * 3 + 1] = R(0, 60); pp[i * 3 + 2] = R(0, 60);
      const c = pick(pal); pc[i * 3] = c.r; pc[i * 3 + 1] = c.g; pc[i * 3 + 2] = c.b;
      ph[i] = R(0, 20);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
    pg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    W.planktonU = { uTime: W.time, uCenter: W.snowCenter, uOp: { value: 0 }, uScale: { value: 400 }, uMap: { value: Gfx.T.dot } };
    const pm = new THREE.ShaderMaterial({
      uniforms: W.planktonU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 color; attribute float aPh;
        uniform float uTime, uOp, uScale; uniform vec3 uCenter;
        varying vec3 vC; varying float vA;
        void main() {
          vec3 p = position;
          p.y += sin(uTime * 0.3 + aPh) * 0.8;
          p.x += cos(uTime * 0.23 + aPh * 1.7) * 0.8;
          p = mod(p - uCenter + 30.0, 60.0) + uCenter - 30.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float pulse = 0.5 + 0.5 * sin(uTime * (0.8 + fract(aPh) * 2.2) + aPh * 6.0);
          vA = pulse * uOp * smoothstep(40.0, 8.0, -mv.z);
          vC = color;
          gl_PointSize = 0.12 * (0.6 + pulse * 0.8) * uScale / max(-mv.z, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vC; varying float vA;
        void main() { float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vC * a * vA * 2.5, 1.0); }`,
    });
    const plankton = new THREE.Points(pg, pm);
    plankton.frustumCulled = false;
    add(plankton);
  }

  // Случайная точка в полосе z с отступом от POI
  const avoid = [];
  function farFromPoi(x, z, r) { return avoid.every(p => (p[0] - x) ** 2 + (p[1] - z) ** 2 > r * r); }

  // Ветвистый коралл (оленерог): ветви — объединённые цилиндры
  function branchCoralGeo() {
    const parts = [];
    const up = new THREE.Vector3(0, 1, 0);
    const grow = (from, dir, len, r, depth) => {
      const to = from.clone().addScaledVector(dir, len);
      const g = new THREE.CylinderGeometry(r * 0.7, r, len, 6, 1, true);
      g.translate(0, len / 2, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir)));
      g.translate(from.x, from.y, from.z);
      parts.push(g);
      const tip = new THREE.SphereGeometry(r * 0.75, 6, 4);
      tip.translate(to.x, to.y, to.z);
      parts.push(tip);
      if (depth <= 0) return;
      const n = depth > 1 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = i / n * PI * 2 + depth;
        const d = dir.clone().add(new THREE.Vector3(Math.cos(a) * 0.65, 0.25, Math.sin(a) * 0.65)).normalize();
        grow(to, d, len * 0.72, r * 0.72, depth - 1);
      }
    };
    grow(new THREE.Vector3(0, 0, 0), up.clone(), 0.55, 0.11, 3);
    return merge(parts);
  }
  // Ламинария: стебель и поочерёдные листья (высота 0..1, затем масштаб)
  function kelpGeo() {
    const parts = [];
    const stem = new THREE.PlaneGeometry(0.05, 1, 1, 16); stem.translate(0, 0.5, 0);
    parts.push(stem);
    for (let y = 0.06; y < 0.98; y += 0.055) {
      const side = Math.round(y / 0.055) % 2 ? 1 : -1;
      const leaf = new THREE.PlaneGeometry(0.42, 0.045, 3, 1);
      const p = leaf.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + 0.21, taper = 1 - Math.pow(Math.abs(x / 0.42 - 0.45) * 1.6, 2);
        p.setY(i, p.getY(i) * Math.max(0.15, taper) + x * 0.06);
        p.setX(i, x * side);
        p.setZ(i, Math.sin(x * 9) * 0.03);
      }
      leaf.computeVertexNormals();
      leaf.translate(0, y, 0);
      parts.push(leaf);
    }
    return merge(parts);
  }
  // Травинка, сужающаяся к кончику
  function bladeGeo() {
    const g = new THREE.PlaneGeometry(0.14, 1, 1, 5).translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - p.getY(i) * 0.9));
    g.computeVertexNormals();
    return g;
  }
  // Актиния: щупальца вокруг диска
  function anemoneGeo() {
    const parts = [new THREE.CylinderGeometry(0.3, 0.36, 0.25, 12).translate(0, 0.12, 0)];
    for (let i = 0; i < 22; i++) {
      const a = i * 2.4, r = 0.08 + (i % 3) * 0.08;
      const t = new THREE.CylinderGeometry(0.012, 0.035, 0.7, 5, 4).translate(0, 0.35, 0);
      t.rotateX(0.25 + r); t.rotateY(a);
      t.translate(Math.cos(a) * r, 0.22, Math.sin(a) * r);
      parts.push(t);
    }
    return merge(parts);
  }
  // Кружевная текстура для веерных кораллов (альфа-маска)
  function fanAlpha() {
    return canvasTex(256, (g, n) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
      g.strokeStyle = '#fff'; g.lineCap = 'round';
      const br = (x, y, a, len, w, d) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        if (d > 0) { br(x2, y2, a - 0.35, len * 0.8, w * 0.75, d - 1); br(x2, y2, a + 0.35, len * 0.8, w * 0.75, d - 1); }
      };
      for (let i = 0; i < 5; i++) br(n / 2, n, -PI / 2 + (i - 2) * 0.3, n * 0.16, 5, 6);
      g.globalCompositeOperation = 'source-over';
      g.lineWidth = 1.2;
      for (let r = 20; r < n; r += 14) { g.beginPath(); g.arc(n / 2, n, r, PI, PI * 2); g.stroke(); }
    });
  }

  function buildFlora(quality) {
    const q = Gfx.preset(quality).flora;
    const T = Gfx.T;
    OBJECTS.forEach(o => { if (o.at) avoid.push([o.at[0], o.at[1]]); });
    // Морская трава на рифе
    scatter(bladeGeo(), swayMaterial(0.35), Math.round(1500 * q), (d, c) => {
      const x = R(-85, 85), z = R(50, -175);
      d.position.set(x, floorY(x, z) - 0.1, z);
      d.rotation.set(R(-0.2, 0.2), R(0, PI), 0);
      d.scale.set(R(0.8, 1.4), R(0.6, 2.2), 1);
      c.setHSL(R(0.22, 0.36), 0.6, R(0.28, 0.45));
    });
    // Гигантские водоросли (ламинария) с листьями
    scatter(kelpGeo(), swayMaterial(1.1), Math.round(420 * q), (d, c, i) => {
      const border = i < 60;
      const x = R(-90, 90), z = border ? R(-130, -185) : R(-185, -378);
      const fy = floorY(x, z);
      if (!farFromPoi(x, z, 3)) return false;
      const h = Math.min(border ? R(6, 10) : R(14, 26), -fy - 1.5);
      d.position.set(x, fy - 0.2, z);
      d.rotation.y = R(0, PI);
      d.scale.set(R(1.6, 2.6), h, 1);
      c.setHSL(R(0.1, 0.2), R(0.55, 0.75), R(0.24, 0.38));
    });
    const coralCols = [0xff6f91, 0xff9f43, 0xc56cf0, 0xffd23a, 0x5fe0c0, 0xff4f6f, 0x9f7fff];
    // Кораллы-«мозги»: деформированная сфера с бороздами (карта нормалей)
    const brainGeo = sphereUV(displace(new THREE.IcosahedronGeometry(1, 3), 0.25, 1.4), 3);
    const brain = scatter(brainGeo, stdMat(0xffffff, { roughness: 0.75, normalMap: T.coralN, normalScale: new THREE.Vector2(1.4, 1.4) }), Math.round(320 * q), (d, c, i) => {
      const kelp = i > 270 * q;
      const x = R(-82, 82), z = kelp ? R(-190, -370) : R(45, -170);
      if (!farFromPoi(x, z, 2.5)) return false;
      d.position.set(x, floorY(x, z) + 0.1, z);
      const s = R(0.5, 1.8);
      d.scale.set(s * R(0.9, 1.3), s * R(0.5, 0.8), s * R(0.9, 1.3));
      d.rotation.y = R(0, PI);
      c.set(pick(coralCols)); if (kelp) c.multiplyScalar(0.6);
    });
    brain.castShadow = brain.receiveShadow = true;
    // Ветвистые кораллы
    const branch = scatter(branchCoralGeo(), stdMat(0xffffff, { roughness: 0.6 }), Math.round(260 * q), (d, c) => {
      const x = R(-80, 80), z = R(45, -170);
      if (!farFromPoi(x, z, 3)) return false;
      d.position.set(x, floorY(x, z) - 0.15, z);
      d.rotation.set(R(-0.2, 0.2), R(0, PI), R(-0.2, 0.2));
      d.scale.setScalar(R(1.2, 2.6));
      c.set(pick([0xff8fb0, 0xffb070, 0xb08fff, 0x7fe8d0, 0xfff0e0])).offsetHSL(R(-0.02, 0.02), 0, R(-0.06, 0.06));
    });
    branch.castShadow = branch.receiveShadow = true;
    // Трубчатые кораллы (кустами)
    let cx = 0, cz = 0, col = 0xffffff;
    const tubeGeo = new THREE.CylinderGeometry(0.2, 0.28, 1, 10, 1, true).translate(0, 0.5, 0);
    const tubes = scatter(tubeGeo, stdMat(0xffffff, { roughness: 0.6, side: THREE.DoubleSide }), Math.round(800 * q), (d, c, i) => {
      if (i % 6 === 0) { cx = R(-80, 80); cz = R(45, -170); col = pick(coralCols); }
      const x = cx + R(-1.5, 1.5), z = cz + R(-1.5, 1.5);
      if (!farFromPoi(cx, cz, 3)) return false;
      d.position.set(x, floorY(x, z) - 0.1, z);
      d.rotation.set(R(-0.4, 0.4), 0, R(-0.4, 0.4));
      d.scale.set(R(0.7, 1.4), R(1, 3.5), R(0.7, 1.4));
      c.set(col).offsetHSL(R(-0.03, 0.03), 0, R(-0.08, 0.08));
    });
    tubes.castShadow = true;
    // Веерные кораллы (горгонарии) — кружево с прозрачностью
    scatter(new THREE.CircleGeometry(1, 20, 0, PI), stdMat(0xffffff, { side: THREE.DoubleSide, roughness: 0.8, alphaMap: fanAlpha(), alphaTest: 0.5 }), Math.round(200 * q), (d, c) => {
      const x = R(-80, 80), z = R(40, -170);
      if (!farFromPoi(x, z, 3)) return false;
      d.position.set(x, floorY(x, z) - 0.1, z);
      d.rotation.y = R(0, PI);
      d.scale.setScalar(R(0.8, 2.4));
      c.set(pick([0xff4f6f, 0xc56cf0, 0xffb02e, 0xff6fd0]));
    });
    // Актинии: покачивающиеся щупальца, слегка светятся
    const anemMat = swayMaterial(0.25);
    anemMat.emissive = new THREE.Color(0x401830);
    scatter(anemoneGeo(), anemMat, Math.round(140 * q), (d, c) => {
      const x = R(-80, 80), z = R(45, -330);
      if (!farFromPoi(x, z, 3)) return false;
      d.position.set(x, floorY(x, z) - 0.05, z);
      d.rotation.y = R(0, PI);
      d.scale.setScalar(R(0.8, 1.8));
      c.set(pick([0xff7fc0, 0xffa060, 0x9fffd0, 0xd08fff]));
    });
    // Губки-бочки
    const sponges = scatter(new THREE.CylinderGeometry(0.35, 0.55, 1, 12, 1, true).translate(0, 0.5, 0), stdMat(0xffffff, { side: THREE.DoubleSide, normalMap: T.rockN, normalScale: new THREE.Vector2(0.6, 0.6) }), Math.round(260 * q), (d, c, i) => {
      const zone = i < 150 * q ? 0 : i < 200 * q ? 1 : 2;
      const x = R(-82, 82), z = [R(40, -170), R(-190, -370), R(-400, -560)][zone];
      if (!farFromPoi(x, z, 3)) return false;
      d.position.set(x, floorY(x, z) - 0.1, z);
      const s = R(0.6, 1.8);
      d.scale.set(s, s * R(1, 2.5), s);
      c.set(zone === 2 ? pick([0x7a6a4a, 0x8a5a4a, 0x5a6a5a]) : pick([0xffa040, 0xc56cf0, 0xff6f91, 0xe0e070]));
    });
    sponges.castShadow = true;
    // Камни во всех зонах: деформированный многогранник с каменной фактурой
    const zoneRock = [0x8a8070, 0x6a6a5a, 0x5a5650, 0x3e3456, 0x22252e];
    const rockGeo = sphereUV(displace(new THREE.IcosahedronGeometry(1, 2), 0.55, 0.9), 2);
    const rocks = scatter(rockGeo, stdMat(0xffffff, { roughness: 0.95, normalMap: T.rockN, normalScale: new THREE.Vector2(1.2, 1.2) }), Math.round(600 * q), (d, c) => {
      const x = R(-95, 95), z = R(50, -1000);
      if (!farFromPoi(x, z, 4)) return false;
      const d0 = -z, zi = d0 < 180 ? 0 : d0 < 380 ? 1 : d0 < 580 ? 2 : d0 < 800 ? 3 : 4;
      d.position.set(x, floorY(x, z), z);
      d.rotation.set(R(0, PI), R(0, PI), R(0, PI));
      const s = R(0.4, zi > 1 ? 4.5 : 2.5);
      d.scale.set(s, s * R(0.5, 1), s * R(0.7, 1.2));
      c.set(zoneRock[zi]).multiplyScalar(R(0.8, 1.2));
    });
    rocks.castShadow = rocks.receiveShadow = true;
    // Бочки на кладбище кораблей
    const barrels = scatter(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 14), stdMat(0xffffff, { map: T.wood, normalMap: T.woodN }), 40, (d, c) => {
      const x = R(-80, 80), z = R(-405, -560);
      if (!farFromPoi(x, z, 3)) return false;
      d.position.set(x, floorY(x, z) + 0.4, z);
      d.rotation.set(R(0, 1.6), R(0, PI), R(0, 1.6));
      c.set(pick([0x9b7453, 0x8a6a4a, 0xaa8a6a]));
    });
    barrels.castShadow = true;
  }

  function buildWrecks() {
    const anna = ship(-30, -470, 0.4, 0.22, 26);
    W.poi.annaWreck = anna.toWorld(0, 4, 0);
    W.poi.annaLog = anna.toWorld(0, 7.9, -26 / 2 + 4);
    W.poi.annaChest = anna.toWorld(1.5, 5.0, -26 / 2 + 9);
    const aurora = ship(50, -522, -0.9, -0.28, 30);
    W.poi.aurora0 = aurora.toWorld(0, 5.6, 30 / 2 - 1.5);
    W.poi.aurora1 = aurora.toWorld(-1.5, 4.9, 2);
    W.poi.aurora2 = aurora.toWorld(1.2, 4.9, -30 / 4);
    ship(-2, -425, 1.7, 0.6, 18);
    // Якоря и пушки
    const iron = stdMat(0x3a3a40, { metalness: 0.6, roughness: 0.6 });
    [[20, -500], [-60, -520], [70, -470]].forEach(([x, z]) => {
      const c = mesh(new THREE.CylinderGeometry(0.4, 0.55, 3.5, 10), iron, x, floorY(x, z) + 0.4, z);
      c.rotation.set(PI / 2, R(0, PI), 0.2);
      add(c);
    });
  }

  function buildCaves() {
    const caveAvoid = [[0, -610], [-15, -680]];
    caveAvoid.forEach(p => avoid.push(p));
    // Сталагмиты
    const stone = stdMat(0xffffff, { normalMap: Gfx.T.rockN, normalScale: new THREE.Vector2(1.5, 1.5) });
    const stalGeo = displace(new THREE.ConeGeometry(1, 1, 10, 6).translate(0, 0.5, 0).toNonIndexed(), 0.2, 2.5);
    const stal = scatter(stalGeo, stone, 230, (d, c) => {
      const x = R(-95, 95), z = R(-595, -790);
      if (!farFromPoi(x, z, 7)) return false;
      const big = rng() < 0.35;
      d.position.set(x, floorY(x, z) - 1, z);
      const r = big ? R(3, 6) : R(1, 3);
      d.scale.set(r, big ? R(25, 60) : R(5, 18), r * R(0.8, 1.2));
      d.rotation.set(R(-0.08, 0.08), R(0, PI), R(-0.08, 0.08));
      c.set(pick([0x3e3456, 0x4a3a66, 0x342b48]));
      if (big) W.colliders.push({ c: new THREE.Vector3(x, d.position.y + 6, z), r: r * 0.9 }, { c: new THREE.Vector3(x, d.position.y + 16, z), r: r * 0.6 });
    });
    stal.castShadow = stal.receiveShadow = true;
    // Каменные арки над каньоном
    const archMat = stdMat(0x3a2f50, { normalMap: Gfx.T.rockN, normalScale: new THREE.Vector2(2, 2) });
    for (let i = 0; i < 7; i++) {
      const z = -610 - i * 27, rr = R(28, 45);
      const a = mesh(new THREE.TorusGeometry(rr, R(3, 5), 8, 24, PI), archMat, R(-30, 30), floorY(0, z) - 5, z);
      a.rotation.y = R(-0.4, 0.4);
      add(a);
    }
    // Светящиеся кристаллы
    const crystalCols = [0x40e0ff, 0xb77dff, 0xff6fd8, 0x5fffb0];
    // Цвет > 1 — HDR-свечение, которое подхватывает bloom
    const crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) });
    pulse(crystalMat, 0.35);
    scatter(new THREE.OctahedronGeometry(0.5, 0), crystalMat, 320, (d, c, i) => {
      const grotto = i < 40;
      const x = grotto ? R(-9, 9) : R(-95, 95), z = grotto ? R(-737, -753) : R(-595, -790);
      if (!grotto && !farFromPoi(x, z, 4)) return false;
      d.position.set(x, floorY(x, z) + R(-0.2, 0.5), z);
      d.rotation.set(R(-0.6, 0.6), R(0, PI), R(-0.6, 0.6));
      const s = R(0.6, grotto ? 4 : 2.5);
      d.scale.set(s * 0.5, s * R(1.5, 3), s * 0.5);
      c.set(grotto ? 0x9fffe8 : pick(crystalCols));
    });
    // Светящиеся грибы (декор)
    const shroomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8) });
    pulse(shroomMat, 0.5);
    scatter(new THREE.SphereGeometry(0.5, 14, 7, 0, PI * 2, 0, PI / 2), shroomMat, 180, (d, c) => {
      const x = R(-90, 90), z = R(-600, -790);
      d.position.set(x, floorY(x, z) + R(0.3, 1), z);
      const s = R(0.4, 1.5);
      d.scale.set(s, s * 0.6, s);
      c.set(pick([0xff5fd8, 0x5ffff0, 0xb77dff]));
    });
    // Биолюминесцентные растения: тонкие стебли со светящимися кончиками, колышутся
    const glowPlant = glowSway(0.5);
    scatter(new THREE.CylinderGeometry(0.02, 0.06, 1, 5, 6).translate(0, 0.5, 0), glowPlant, 420, (d, c) => {
      const x = R(-92, 92), z = R(-598, -1000);
      if (!farFromPoi(x, z, 3)) return false;
      d.position.set(x, floorY(x, z) - 0.1, z);
      d.rotation.set(R(-0.3, 0.3), R(0, PI), R(-0.3, 0.3));
      d.scale.set(R(1, 2), R(0.8, 3.2), R(1, 2));
      c.set(pick([0x40e0ff, 0x5fffb0, 0xb77dff, 0xff6fd8]));
    });
    // Несколько точечных источников света
    [[-40, -640, 0x40e0ff], [35, -700, 0xb77dff], [0, -745, 0x9fffe8]].forEach(([x, z, col]) => {
      const l = new THREE.PointLight(col, 2.2, 70, 1.2);
      l.position.set(x, floorY(x, z) + 10, z);
      add(l);
    });
  }

  function buildAbyss() {
    const tz = -920, ty = floorY(0, tz);
    const tc = new THREE.Vector3(0, ty, tz);
    W.templeCenter = tc;
    avoid.push([0, tz]);
    const rn = { normalMap: Gfx.T.rockN, normalScale: new THREE.Vector2(1.5, 1.5) };
    const stone = stdMat(0x2a3040, rn), stone2 = stdMat(0x1e2230, rn);
    const plat = mesh(new THREE.CylinderGeometry(26, 29, 4, 24), stone, 0, ty + 1, tz);
    add(plat);
    add(mesh(new THREE.CylinderGeometry(18, 20, 1.5, 24), stone2, 0, ty + 3.6, tz));
    // Обломки колонн по кругу
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * PI * 2, h = R(4, 13);
      const col = mesh(new THREE.CylinderGeometry(1.1, 1.3, h, 8), stone, Math.cos(a) * 24, ty + 3 + h / 2, tz + Math.sin(a) * 24);
      if (i % 4 === 3) { col.rotation.z = 1.2; col.position.y = ty + 4; }
      add(col);
    }
    // Три столпа испытаний
    const runeG = new THREE.BoxGeometry(3.2, 0.4, 3.2);
    for (let i = 0; i < 3; i++) {
      const a = PI / 2 + i * PI * 2 / 3;
      const x = Math.cos(a) * 15, z = tz + Math.sin(a) * 15;
      add(mesh(new THREE.BoxGeometry(3, 14, 3), stone, x, ty + 11, z));
      const rm = new THREE.MeshStandardMaterial({ color: 0x102030, emissive: 0x1a3a5a, emissiveIntensity: 0.6 });
      for (let k = 0; k < 4; k++) add(mesh(runeG, rm, x, ty + 7 + k * 3, z));
      W.pillars.push(rm);
      W.colliders.push({ c: new THREE.Vector3(x, ty + 9, z), r: 2.4 }, { c: new THREE.Vector3(x, ty + 14, z), r: 2.4 });
      const inward = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)).multiplyScalar(4.5);
      W.poi['pillar' + i] = new THREE.Vector3(x, ty + 7, z).add(inward);
    }
    // Сердце океана
    W.core = mesh(new THREE.OctahedronGeometry(3, 0), new THREE.MeshStandardMaterial({ color: 0x40e0ff, emissive: 0x40e0ff, emissiveIntensity: 2.2, flatShading: true, metalness: 0.3, roughness: 0.2 }), 0, ty + 12, tz);
    add(W.core);
    W.coreLight = new THREE.PointLight(0x40e0ff, 2, 90, 1.2);
    W.coreLight.position.set(0, ty + 14, tz);
    add(W.coreLight);
    W.colliders.push({ c: W.core.position.clone(), r: 3.2 });
    W.poi.core = new THREE.Vector3(0, ty + 7.5, tz);
    W.poi.temple = new THREE.Vector3(0, ty + 8, tz);
    // Горячие источники и сферы энергии
    const ventMat = stdMat(0x1a1410, rn), lava = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1a).multiplyScalar(2.5) });
    for (let i = 0; i < 3; i++) {
      const a = PI / 6 + i * PI * 2 / 3;
      const x = Math.cos(a) * 36, z = tz + Math.sin(a) * 36, fy = floorY(x, z);
      add(mesh(new THREE.ConeGeometry(3, 8, 8), ventMat, x, fy + 3.5, z));
      add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 10), lava, x, fy + 7.5, z));
      bubbleColumn(x, fy + 7.5, z, 30, 50, 0xffc08a, 0.5);
      const top = new THREE.Vector3(x, fy + 7.5, z);
      W.hazards.push({ c: top, r: 3.2, h: 12, dps: 18, name: 'Горячий источник!' });
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(3.4);
      W.poi['orb' + i] = top.clone().add(side).add(new THREE.Vector3(0, 4, 0));
    }
    const vl = new THREE.PointLight(0xff6a1a, 1.5, 60, 1.5);
    vl.position.set(0, ty + 15, tz);
    add(vl);
    // Трубчатые черви у источников
    scatter(new THREE.CylinderGeometry(0.15, 0.2, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x401010 }), 140, (d, c) => {
      const a = R(0, PI * 2), r = R(28, 44);
      const x = Math.cos(a) * r, z = tz + Math.sin(a) * r;
      d.position.set(x, floorY(x, z), z);
      d.scale.set(1, R(1, 3), 1);
      c.set(pick([0xffffff, 0xff3a3a, 0xf0e0d0]));
    });
  }

  function buildVents() {
    // Кислородные станции
    const ringM = stdMat(0x2a3540, { metalness: 0.6, roughness: 0.4 }), discM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5fe8ff).multiplyScalar(1.8) });
    [[22, -40], [-30, -262], [40, -330], [25, -480], [-15, -680], [35, -880], [-30, -960]].forEach(([x, z]) => {
      const fy = floorY(x, z);
      const r = mesh(new THREE.TorusGeometry(1.6, 0.5, 6, 16), ringM, x, fy + 0.3, z);
      r.rotation.x = PI / 2; add(r);
      add(mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 16), discM, x, fy + 0.35, z));
      bubbleColumn(x, fy + 0.5, z, Math.min(30, -fy - 1), 45);
      W.o2vents.push(new THREE.Vector3(x, fy + 1.5, z));
    });
    // Буи над точками погружения + трос-ориентир
    const buoyM = stdMat(0xff7a1a, { roughness: 0.5 }), ropeM = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.5 });
    DIVE_POINTS.slice(1).forEach(dp => {
      const [x, y, z] = dp.pos;
      add(mesh(new THREE.CylinderGeometry(1, 1.4, 1.6, 12), buoyM, x, 0, z));
      const rope = mesh(new THREE.CylinderGeometry(0.05, 0.05, -y, 4), ropeM, x, y / 2, z);
      add(rope);
    });
    // Алтарь в Лесу водорослей
    const ax = 6, az = -300, ay = floorY(ax, az), st = stdMat(0x6a7a7a);
    add(mesh(new THREE.CylinderGeometry(2.5, 3, 1.4, 8), st, ax, ay + 0.6, az));
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2 + PI / 4;
      add(mesh(new THREE.BoxGeometry(0.8, 4, 0.8), st, ax + Math.cos(a) * 3.5, ay + 2, az + Math.sin(a) * 3.5));
      add(mesh(new THREE.BoxGeometry(0.85, 0.3, 0.85), new THREE.MeshBasicMaterial({ color: 0x9fff6a }), ax + Math.cos(a) * 3.5, ay + 3, az + Math.sin(a) * 3.5));
    }
    W.poi.altar = new THREE.Vector3(ax, ay + 2.0, az);
  }

  // ---------- Атмосфера по глубине ----------
  // Глубина (м) → цвет воды (sRGB), плотность тумана. Каждая зона со своим настроением:
  // бирюзовый риф, зелёный лес водорослей, мутное кладбище кораблей, фиолетовые пещеры, чёрная бездна.
  const FOG_STOPS = [
    [0, 0x4ac6e8, 0.0095], [45, 0x2a9fb8, 0.012], [100, 0x237f86, 0.015], [170, 0x1a4f62, 0.019],
    [380, 0x123048, 0.022], [450, 0x1a1844, 0.021], [900, 0x0a0a22, 0.026], [1100, 0x03050e, 0.03], [1400, 0x010206, 0.033],
  ];
  const ca = new THREE.Color(), cb = new THREE.Color();
  const sunOff = new THREE.Vector3(30, 100, 20).normalize().multiplyScalar(120);
  function atmosphere(depth) {
    let i = 0;
    while (i < FOG_STOPS.length - 2 && depth > FOG_STOPS[i + 1][0]) i++;
    const a = FOG_STOPS[i], b = FOG_STOPS[i + 1];
    const t = Math.min(1, Math.max(0, (depth - a[0]) / (b[0] - a[0])));
    ca.set(a[1]); cb.set(b[1]); ca.lerp(cb, t);
    ca.convertSRGBToLinear();
    scene.fog.color.copy(ca);
    scene.fog.density = a[2] + (b[2] - a[2]) * t;
    // Плавное затемнение при погружении и возвращение дневного света при всплытии
    sun.intensity = (0.85 + Math.sin(W.time.value * 0.21) * 0.05) * Math.exp(-depth / 120);
    hemi.intensity = 0.1 + 0.55 * Math.exp(-depth / 200);
    if (W.waterU) {
      W.waterU.uDeep.value.copy(ca).multiplyScalar(0.8);
      W.waterU.uBright.value = 0.6 + 0.6 * Math.exp(-depth / 60);
    }
    if (W.planktonU) {
      W.planktonU.uOp.value = smooth(180, 520, depth);
      W.planktonU.uScale.value = window.innerHeight * 0.6;
    }
  }

  function update(dt, t, playerPos, depth) {
    W.time.value = t;
    if (W.waterU) W.waterU.uTime.value = t;
    W.snowCenter.value.copy(playerPos);
    atmosphere(depth);
    sun.position.copy(playerPos).add(sunOff);
    sun.target.position.copy(playerPos);
    const rayK = Math.max(0, 1 - depth / 130);
    W.rays.forEach(r => {
      const dx = r.position.x - playerPos.x, dz = r.position.z - playerPos.z;
      if (dx * dx + dz * dz > 65 * 65) {
        const a = Math.random() * PI * 2, d = 15 + Math.random() * 45;
        r.position.x = playerPos.x + Math.cos(a) * d;
        r.position.z = playerPos.z + Math.sin(a) * d;
      }
      r.material.uniforms.uOp.value = rayK * (0.2 + 0.08 * Math.sin(t * 0.5 + r.userData.ph));
      r.visible = rayK > 0.01;
    });
    if (W.core) {
      W.core.rotation.y += dt * 0.6;
      W.core.position.y = W.templeCenter.y + 12 + Math.sin(t * 1.2) * 0.6;
      W.coreLight.intensity = (W.coreDone ? 3 : 1.6) + Math.sin(t * (W.coreDone ? 1 : 4)) * 0.6;
    }
    if (W.sonarDish) W.sonarDish.rotation.z += dt * 0.8;
  }

  function setPillar(i, on) {
    const m = W.pillars[i];
    if (!m) return;
    m.emissive.set(on ? 0x40e0ff : 0x1a3a5a);
    m.emissiveIntensity = on ? 3 : 0.6;
  }
  function setCoreDone(on = true) {
    W.coreDone = on;
    if (W.core) { W.core.material.emissive.set(on ? 0xffffff : 0x40e0ff); W.core.material.emissiveIntensity = on ? 3.2 : 2.2; }
  }

  return { W, floorY, floorBase, build, update, setUpgrades, setPillar, setCoreDone, smooth };
})();
