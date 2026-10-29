'use strict';
// ============================================================
//  Процедурные 3D-модели из примитивов Three.js
//  Все модели смотрят вдоль +Z
// ============================================================

const Models = (() => {
  const PI = Math.PI;
  const mats = {};
  // Кэш материалов: одинаковые цвета/параметры используют один материал.
  // Флаг skin: true добавляет карту нормалей чешуи (текстуры не попадают в ключ кэша).
  function M(color, o = {}) {
    const key = color + '|' + JSON.stringify(o);
    if (!mats[key]) {
      const p = Object.assign({ color, roughness: 0.45, metalness: 0.05 }, o);
      const skin = p.skin; delete p.skin;
      if (skin && typeof Gfx !== 'undefined') {
        p.normalMap = Gfx.buildTextures().scaleN;
        p.normalScale = new THREE.Vector2(0.7, 0.7);
        p.roughness = 0.35;
      }
      mats[key] = new THREE.MeshStandardMaterial(p);
    }
    return mats[key];
  }
  // Свечение сильнее 1 подхватывается bloom-эффектом
  const glow = (color, i = 1, o = {}) => M(color, Object.assign({ emissive: color, emissiveIntensity: i * 1.6 }, o));
  const glass = (color, opacity = 0.6) => M(color, { emissive: color, emissiveIntensity: 0.6, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, roughness: 0.15 });
  // Полупрозрачные плавники
  const fin = color => M(color, { transparent: true, opacity: 0.78, side: THREE.DoubleSide, roughness: 0.3 });
  const darker = (c, k = 0.7) => new THREE.Color(c).multiplyScalar(k).getHex();

  // Общие геометрии (масштабируются через mesh.scale)
  const SPH = new THREE.SphereGeometry(0.5, 20, 14);
  const HEMI = new THREE.SphereGeometry(0.5, 16, 8, 0, PI * 2, 0, PI / 2);
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const TCYL = new THREE.CylinderGeometry(0.2, 0.5, 1, 8);
  const CONE = new THREE.ConeGeometry(0.5, 1, 10);
  const OCTA = new THREE.OctahedronGeometry(0.5, 0);
  const TORUS = new THREE.TorusGeometry(0.5, 0.06, 6, 24);
  const STAIL = new THREE.TorusGeometry(0.1, 0.035, 6, 12, PI * 1.6);
  const WING = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.35); sh.lineTo(1, -0.05); sh.lineTo(0, -0.35); sh.lineTo(0, 0.35);
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(PI / 2);
    return g;
  })();

  function part(parent, geo, mat, p, s, r) {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (s) m.scale.set(s[0], s[1], s[2]);
    if (r) m.rotation.set(r[0], r[1], r[2]);
    parent.add(m);
    return m;
  }
  // Глаза: глянцевый зрачок и светлое кольцо радужки
  const eyes = (g, x, y, z, r, col = 0x111111) => [-1, 1].forEach(sd => {
    if (typeof col === 'number' && col === 0x111111) part(g, SPH, M(0xf0e8c8, { roughness: 0.3 }), [sd * x * 0.97, y, z], [r * 1.25, r * 1.25, r * 0.7]);
    part(g, SPH, typeof col === 'number' ? M(col, { roughness: 0.05, metalness: 0.2 }) : col, [sd * x, y, z], [r, r, r]);
  });

  // ---------------- Животные ----------------
  function fish(o) {
    const g = new THREE.Group(), s = o.size || 0.5;
    const L = (o.long || 1) * s, T = (o.tall || 0.6) * s, W = 0.36 * s;
    const bm = o.glow ? glow(o.color, 0.6, { skin: true }) : M(o.color, { skin: true });
    const belly = M(new THREE.Color(o.color).lerp(new THREE.Color(0xffffff), 0.55).getHex(), { skin: true });
    // Передняя часть тела + светлое брюхо (противотень, как у настоящих рыб)
    part(g, SPH, bm, [0, 0, L * 0.1], [W, T, L * 0.8]);
    part(g, SPH, belly, [0, -T * 0.13, L * 0.1], [W * 0.92, T * 0.72, L * 0.72]);
    (o.stripes || []).forEach(z => {
      const f = Math.sqrt(Math.max(0.1, 1 - 4 * z * z)) * 1.06;
      part(g, CYL, M(o.color2), [0, 0, z * L], [W * f, 0.08 * L, T * f], [PI / 2, 0, 0]);
    });
    eyes(g, W * 0.42, T * 0.12, L * 0.3, 0.09 * s);
    const fc = fin(o.color2 || o.color);
    part(g, CONE, fc, [0, T * 0.45, -0.05 * L], [0.03 * s, T * 0.55, 0.4 * L], [-0.6, 0, 0]);
    // Грудные плавники
    const pecs = [-1, 1].map(sd => {
      const p = new THREE.Group();
      p.position.set(sd * W * 0.45, -T * 0.1, L * 0.12);
      const w = new THREE.Mesh(WING, fc);
      w.scale.set(sd * 0.28 * L, 1, 0.22 * L);
      w.rotation.y = sd * -0.5;
      p.add(w); g.add(p); p.userData.side = sd;
      return p;
    });
    // Задняя часть тела изгибается отдельно — получается бегущая волна
    const rear = new THREE.Group();
    rear.position.z = -L * 0.05;
    g.add(rear);
    part(rear, SPH, bm, [0, 0, -L * 0.25], [W * 0.72, T * 0.68, L * 0.55]);
    part(rear, CONE, fc, [0, -T * 0.35, -L * 0.2], [0.03 * s, T * 0.35, 0.25 * L], [-2.4, 0, 0]);
    const tail = new THREE.Group();
    tail.position.z = -L * 0.48;
    rear.add(tail);
    // Раздвоенный хвостовой плавник
    [-1, 1].forEach(sd => part(tail, CONE, fc, [0, sd * T * 0.22, -0.16 * s], [0.03 * s, 0.42 * s, T * 0.5], [PI / 2 + sd * 0.55, 0, 0]));
    if (o.glowSpots) for (let i = 0; i < 4; i++) [-1, 1].forEach(sd =>
      part(i < 2 ? g : rear, SPH, glow(o.color2, 1.6), [sd * W * 0.45, -T * 0.15, i < 2 ? L * (0.25 - i * 0.15) : -L * (0.1 + (i - 2) * 0.12)], [0.07 * s, 0.07 * s, 0.07 * s]));
    g.userData.anim = { type: 'fish', tail, rear, pecs, ph: Math.random() * 6 };
    return g;
  }

  function turtle(o) {
    const g = new THREE.Group(), s = o.size || 1.4;
    const shellM = o.glow ? glow(o.shell, 0.6, { metalness: 0.5, skin: true }) : M(o.shell, { skin: true, roughness: 0.5 });
    part(g, SPH, shellM, [0, 0.08 * s, 0], [1.0 * s, 0.42 * s, 1.2 * s]);
    part(g, OCTA, o.glow ? glow(darker(o.shell, 0.85), 0.8) : M(darker(o.shell)), [0, 0.22 * s, 0], [0.6 * s, 0.22 * s, 0.75 * s]);
    part(g, SPH, M(o.color), [0, -0.04 * s, 0], [0.9 * s, 0.22 * s, 1.1 * s]);
    part(g, SPH, M(o.color), [0, 0.02 * s, 0.68 * s], [0.32 * s, 0.28 * s, 0.42 * s]);
    eyes(g, 0.11 * s, 0.08 * s, 0.8 * s, 0.06 * s);
    const fl = [];
    [[1, 0.32], [-1, 0.32], [1, -0.4], [-1, -0.4]].forEach(([side, z], i) => {
      const p = new THREE.Group();
      p.position.set(side * 0.42 * s, -0.02 * s, z * s);
      g.add(p);
      const big = i < 2;
      part(p, SPH, M(o.color), [side * (big ? 0.4 : 0.22) * s, 0, big ? -0.05 * s : 0],
        [big ? 0.8 * s : 0.42 * s, 0.07 * s, big ? 0.32 * s : 0.25 * s], [0, side * (big ? 0.35 : 0.6), 0]);
      p.userData.side = side;
      fl.push(p);
    });
    g.userData.anim = { type: 'turtle', fl };
    return g;
  }

  function dolphin(o) {
    const g = new THREE.Group(), s = o.size || 2.4, c = M(o.color);
    part(g, SPH, c, [0, 0, 0], [0.3 * s, 0.32 * s, s]);
    part(g, SPH, M(0xdfe6ee), [0, -0.05 * s, 0.05 * s], [0.24 * s, 0.24 * s, 0.85 * s]);
    part(g, SPH, c, [0, -0.04 * s, 0.5 * s], [0.08 * s, 0.07 * s, 0.24 * s]);
    part(g, CONE, c, [0, 0.17 * s, -0.05 * s], [0.03 * s, 0.17 * s, 0.14 * s], [-0.5, 0, 0]);
    [-1, 1].forEach(sd => part(g, BOX, c, [sd * 0.17 * s, -0.08 * s, 0.18 * s], [0.2 * s, 0.02 * s, 0.08 * s], [0, 0, sd * 0.4]));
    eyes(g, 0.13 * s, 0.03 * s, 0.36 * s, 0.03 * s);
    const tail = new THREE.Group();
    tail.position.z = -0.45 * s;
    g.add(tail);
    part(tail, SPH, c, [0, 0, -0.08 * s], [0.1 * s, 0.1 * s, 0.25 * s]);
    part(tail, BOX, c, [0, 0, -0.22 * s], [0.45 * s, 0.02 * s, 0.12 * s]);
    g.userData.anim = { type: 'dolphin', tail, speed: 5 };
    return g;
  }

  function ray(o) {
    const g = new THREE.Group(), s = o.size || 3, c = M(o.color);
    part(g, SPH, c, [0, 0, 0], [0.45 * s, 0.12 * s, 0.55 * s]);
    part(g, SPH, M(0xe8eef2), [0, -0.025 * s, 0], [0.42 * s, 0.08 * s, 0.5 * s]);
    const wings = [];
    [-1, 1].forEach(sd => {
      const p = new THREE.Group();
      p.position.x = sd * 0.15 * s;
      const w = new THREE.Mesh(WING, M(o.color, { side: THREE.DoubleSide }));
      w.scale.set(sd * 0.5 * s, 1, 0.5 * s);
      p.add(w); g.add(p);
      p.userData.side = sd;
      wings.push(p);
      part(g, BOX, c, [sd * 0.1 * s, 0, 0.3 * s], [0.04 * s, 0.03 * s, 0.14 * s]);
    });
    part(g, CYL, c, [0, 0, -0.55 * s], [0.015 * s, 0.6 * s, 0.015 * s], [PI / 2, 0, 0]);
    eyes(g, 0.16 * s, 0.03 * s, 0.22 * s, 0.03 * s);
    g.userData.anim = { type: 'ray', wings };
    return g;
  }

  function jelly(o) {
    const g = new THREE.Group(), s = o.size || 1;
    const m = glass(o.color, 0.6);
    const bell = part(g, HEMI, m, [0, 0, 0], [s, 0.75 * s, s]);
    part(g, SPH, glow(o.color, 1.3), [0, 0.12 * s, 0], [0.35 * s, 0.25 * s, 0.35 * s]);
    const tg = new THREE.Group();
    g.add(tg);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI * 2;
      part(tg, CYL, m, [Math.cos(a) * 0.36 * s, -0.6 * s, Math.sin(a) * 0.36 * s], [0.025 * s, 1.2 * s, 0.025 * s]);
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * PI * 2 + 0.4;
      part(tg, CYL, glow(o.color, 0.8, { transparent: true, opacity: 0.8 }), [Math.cos(a) * 0.1 * s, -0.4 * s, Math.sin(a) * 0.1 * s], [0.07 * s, 0.8 * s, 0.07 * s]);
    }
    g.userData.anim = { type: 'jelly', bell, tg, s };
    g.userData.upright = true;
    return g;
  }

  function seahorse(o) {
    const g = new THREE.Group(), s = o.size || 0.7, c = M(o.color);
    const b = new THREE.Group();
    g.add(b);
    part(b, SPH, c, [0, 0.5 * s, 0.02 * s], [0.18 * s, 0.18 * s, 0.2 * s]);
    part(b, CYL, c, [0, 0.48 * s, 0.17 * s], [0.05 * s, 0.2 * s, 0.05 * s], [PI / 2, 0, 0]);
    [[0.3, 0.05, 0.22], [0.1, 0.08, 0.24], [-0.1, 0.04, 0.2], [-0.27, -0.03, 0.14]].forEach(([y, z, r]) =>
      part(b, SPH, c, [0, y * s, z * s], [r * s, r * 1.1 * s, r * s]));
    const tail = new THREE.Mesh(STAIL, c);
    tail.position.set(0, -0.42 * s, -0.04 * s);
    tail.scale.setScalar(s * 1.2);
    tail.rotation.y = PI / 2;
    b.add(tail);
    part(b, CONE, c, [0, 0.66 * s, -0.02 * s], [0.06 * s, 0.14 * s, 0.06 * s]);
    part(b, BOX, glow(darker(o.color, 1.2), 0.3), [0, 0.1 * s, -0.12 * s], [0.02 * s, 0.25 * s, 0.1 * s]);
    eyes(b, 0.08 * s, 0.53 * s, 0.08 * s, 0.05 * s);
    g.userData.anim = { type: 'bob', b };
    g.userData.upright = true;
    return g;
  }

  function eel(o) {
    const g = new THREE.Group(), s = o.size || 2, c = M(o.color);
    const segs = [], n = 8;
    for (let i = 0; i < n; i++) {
      const r = 0.13 * s * (1 - i / n * 0.6);
      segs.push(part(g, SPH, c, [0, 0, 0.45 * s - i * 0.12 * s], [r, r * 1.15, 0.2 * s]));
    }
    eyes(g, 0.05 * s, 0.04 * s, 0.52 * s, 0.025 * s, 0xffee66);
    part(g, BOX, M(darker(o.color)), [0, 0.09 * s, 0], [0.02 * s, 0.05 * s, 0.9 * s]);
    g.userData.anim = { type: 'eel', segs, s };
    return g;
  }

  function shark(o) {
    const g = new THREE.Group(), s = o.size || 4, c = M(o.color);
    part(g, SPH, c, [0, 0, 0], [0.24 * s, 0.26 * s, s]);
    part(g, SPH, M(0xd5dde3), [0, -0.05 * s, 0.02 * s], [0.2 * s, 0.18 * s, 0.85 * s]);
    part(g, BOX, c, [0, 0.02 * s, 0.47 * s], [0.5 * s, 0.05 * s, 0.1 * s]);
    eyes(g, 0.25 * s, 0.02 * s, 0.47 * s, 0.035 * s);
    part(g, CONE, c, [0, 0.2 * s, 0.02 * s], [0.025 * s, 0.22 * s, 0.12 * s], [-0.35, 0, 0]);
    [-1, 1].forEach(sd => part(g, BOX, c, [sd * 0.17 * s, -0.08 * s, 0.15 * s], [0.22 * s, 0.015 * s, 0.09 * s], [0, sd * 0.3, -sd * 0.25]));
    const tail = new THREE.Group();
    tail.position.z = -0.45 * s;
    g.add(tail);
    part(tail, CONE, c, [0, 0.12 * s, -0.08 * s], [0.02 * s, 0.3 * s, 0.08 * s], [-0.9, 0, 0]);
    part(tail, CONE, c, [0, -0.05 * s, -0.04 * s], [0.02 * s, 0.14 * s, 0.06 * s], [-2.3, 0, 0]);
    g.userData.anim = { type: 'fish', tail, slow: 0.4 };
    return g;
  }

  function squid(o) {
    const g = new THREE.Group(), s = o.size || 0.7;
    const m = o.glow ? glow(o.color, 0.8) : M(o.color);
    part(g, CONE, m, [0, 0, 0.3 * s], [0.28 * s, 0.8 * s, 0.28 * s], [PI / 2, 0, 0]);
    part(g, BOX, m, [0, 0, 0.6 * s], [0.3 * s, 0.02 * s, 0.3 * s], [0, PI / 4, 0]);
    part(g, SPH, m, [0, 0, -0.15 * s], [0.22 * s, 0.22 * s, 0.25 * s]);
    eyes(g, 0.1 * s, 0.02 * s, -0.12 * s, 0.09 * s, o.glow ? glow(0xffffff, 1) : 0x111111);
    const tg = new THREE.Group();
    tg.position.z = -0.25 * s;
    g.add(tg);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI * 2;
      part(tg, CYL, m, [Math.cos(a) * 0.07 * s, Math.sin(a) * 0.07 * s, -0.35 * s], [0.025 * s, 0.7 * s, 0.025 * s], [PI / 2, 0, 0]);
    }
    [-1, 1].forEach(sd => part(tg, CYL, m, [sd * 0.03 * s, 0, -0.6 * s], [0.02 * s, 1.2 * s, 0.02 * s], [PI / 2, 0, 0]));
    if (o.glow) for (let i = 0; i < 6; i++)
      part(g, SPH, glow(0xbff4ff, 2), [Math.cos(i) * 0.1 * s, Math.sin(i) * 0.1 * s, (0.1 + i * 0.07) * s], [0.04 * s, 0.04 * s, 0.04 * s]);
    g.userData.anim = { type: 'squid', tg };
    return g;
  }

  function octopus(o) {
    const g = new THREE.Group(), s = o.size || 1;
    const m = o.glow ? glow(o.color, 0.25) : M(o.color);
    part(g, SPH, m, [0, 0.45 * s, -0.12 * s], [0.6 * s, 0.7 * s, 0.75 * s]);
    eyes(g, 0.2 * s, 0.38 * s, 0.15 * s, 0.12 * s, 0xf5f0d0);
    eyes(g, 0.21 * s, 0.38 * s, 0.2 * s, 0.05 * s);
    const tents = [];
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Group();
      p.rotation.order = 'YXZ';
      p.position.set(0, 0.15 * s, 0);
      p.rotation.y = i / 8 * PI * 2;
      part(p, TCYL, m, [0, 0, 0.4 * s], [0.16 * s, 0.8 * s, 0.16 * s], [PI / 2, 0, 0]);
      g.add(p);
      tents.push(p);
    }
    g.userData.anim = { type: 'octopus', tents };
    return g;
  }

  function angler(o) {
    const g = new THREE.Group(), s = o.size || 1.6, c = M(o.color, { roughness: 0.9 });
    part(g, SPH, c, [0, 0, 0], [0.9 * s, 0.8 * s, 1.0 * s]);
    part(g, SPH, c, [0, -0.22 * s, 0.25 * s], [0.75 * s, 0.35 * s, 0.6 * s]);
    for (let i = 0; i < 7; i++)
      part(g, CONE, M(0xeeeeee), [(-0.3 + i * 0.1) * s, -0.05 * s, 0.5 * s], [0.03 * s, 0.12 * s, 0.03 * s], [PI, 0, 0]);
    eyes(g, 0.25 * s, 0.15 * s, 0.35 * s, 0.07 * s, glow(0xaaffff, 1.2));
    part(g, CYL, c, [0, 0.5 * s, 0.3 * s], [0.02 * s, 0.5 * s, 0.02 * s], [0.7, 0, 0]);
    const lure = part(g, SPH, glow(0x9ff7ff, 2.5), [0, 0.72 * s, 0.5 * s], [0.12 * s, 0.12 * s, 0.12 * s]);
    const tail = new THREE.Group();
    tail.position.z = -0.45 * s;
    g.add(tail);
    part(tail, CONE, c, [0, 0, -0.2 * s], [0.05 * s, 0.4 * s, 0.6 * s], [PI / 2, 0, 0]);
    g.userData.anim = { type: 'fish', tail, lure };
    return g;
  }

  function whale(o) {
    const g = new THREE.Group(), s = o.size || 14, c = M(o.color), gl = glow(o.glowColor || 0x40e0ff, 1.6);
    part(g, SPH, c, [0, 0, 0], [0.22 * s, 0.2 * s, s]);
    part(g, SPH, c, [0, 0.01 * s, 0.32 * s], [0.2 * s, 0.18 * s, 0.4 * s]);
    [-1, 1].forEach(sd => {
      part(g, BOX, gl, [sd * 0.1 * s, 0, 0], [0.006 * s, 0.012 * s, 0.75 * s]);
      part(g, BOX, c, [sd * 0.16 * s, -0.06 * s, 0.15 * s], [0.25 * s, 0.01 * s, 0.08 * s], [0, sd * 0.3, -sd * 0.2]);
    });
    part(g, BOX, gl, [0, 0.1 * s, -0.05 * s], [0.008 * s, 0.008 * s, 0.6 * s]);
    for (let i = 0; i < 8; i++) part(g, SPH, gl, [0, -0.07 * s, (0.35 - i * 0.09) * s], [0.02 * s, 0.02 * s, 0.02 * s]);
    eyes(g, 0.09 * s, 0.03 * s, 0.42 * s, 0.025 * s, gl);
    const tail = new THREE.Group();
    tail.position.z = -0.47 * s;
    g.add(tail);
    part(tail, SPH, c, [0, 0, -0.06 * s], [0.08 * s, 0.07 * s, 0.2 * s]);
    part(tail, BOX, c, [0, 0, -0.16 * s], [0.38 * s, 0.012 * s, 0.1 * s]);
    part(tail, BOX, gl, [0, 0, -0.21 * s], [0.38 * s, 0.014 * s, 0.01 * s]);
    g.userData.anim = { type: 'dolphin', tail, speed: 1.5 };
    return g;
  }

  const builders = { fish, turtle, dolphin, ray, jelly, seahorse, eel, shark, squid, octopus, angler, whale };
  function creature(spec) { return builders[spec.type](spec); }

  // ---------------- Дайвер, субмарина, дрон ----------------
  function diver() {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const suit = M(0x1c2b4a), accent = glow(0x27d3ff, 0.5);
    part(body, CYL, suit, [0, 0.15, 0], [0.46, 0.75, 0.3]);
    [-1, 1].forEach(sd => part(body, BOX, accent, [sd * 0.12, 0.2, 0.15], [0.04, 0.55, 0.03]));
    part(body, SPH, M(0x14202f), [0, 0.72, 0], [0.34, 0.36, 0.34]);
    part(body, BOX, M(0x8fe9ff, { emissive: 0x3fb8ff, emissiveIntensity: 0.6, metalness: 0.5 }), [0, 0.74, 0.15], [0.28, 0.14, 0.08]);
    part(body, CYL, M(0x333333), [0, 0.6, 0.18], [0.06, 0.08, 0.06], [PI / 2, 0, 0]);
    [-1, 1].forEach(sd => part(body, CYL, M(0xffc21a, { metalness: 0.4, roughness: 0.35 }), [sd * 0.1, 0.25, -0.22], [0.17, 0.62, 0.17]));
    part(body, CYL, M(0x222222), [0, -0.2, 0], [0.48, 0.08, 0.32]);
    const arms = [], legs = [];
    [-1, 1].forEach(sd => {
      const a = new THREE.Group();
      a.position.set(sd * 0.3, 0.45, 0);
      part(a, CYL, suit, [0, -0.3, 0], [0.12, 0.6, 0.12]);
      part(a, SPH, M(0x111820), [0, -0.62, 0], [0.13, 0.13, 0.13]);
      body.add(a); arms.push(a);
      const l = new THREE.Group();
      l.position.set(sd * 0.12, -0.25, 0);
      part(l, CYL, suit, [0, -0.32, 0], [0.15, 0.62, 0.15]);
      part(l, BOX, M(0xffd21a), [0, -0.85, 0.05], [0.22, 0.5, 0.03]);
      body.add(l); legs.push(l);
    });
    const helmet = new THREE.Group();
    const brass = M(0xc9a24a, { metalness: 0.8, roughness: 0.3 });
    part(helmet, SPH, brass, [0, 0.74, 0], [0.52, 0.52, 0.52]);
    part(helmet, CYL, glass(0x7fe0ff, 0.8), [0, 0.76, 0.24], [0.24, 0.05, 0.24], [PI / 2, 0, 0]);
    part(helmet, CYL, brass, [0, 0.47, 0], [0.5, 0.1, 0.5]);
    [-1, 1].forEach(sd => part(helmet, CYL, glass(0x7fe0ff, 0.8), [sd * 0.25, 0.76, 0], [0.12, 0.04, 0.12], [0, 0, PI / 2]));
    helmet.visible = false;
    body.add(helmet);
    root.userData = { body, arms, legs, helmet };
    return root;
  }

  function sub() {
    const g = new THREE.Group();
    const y = M(0xffc21a, { metalness: 0.3, roughness: 0.4 });
    part(g, SPH, y, [0, 0, 0], [1.5, 1.4, 3.0]);
    part(g, SPH, glass(0x9fefff, 0.7), [0, 0.25, 1.05], [1.0, 0.9, 0.9]);
    part(g, CYL, y, [0, 0.75, 0.2], [0.6, 0.5, 0.9]);
    part(g, BOX, y, [0, 0, -1.3], [1.8, 0.06, 0.5]);
    part(g, BOX, y, [0, 0, -1.3], [0.06, 1.4, 0.5]);
    const prop = new THREE.Group();
    prop.position.z = -1.6;
    for (let i = 0; i < 3; i++) part(prop, BOX, M(0x444444, { metalness: 0.6 }), [0, 0, 0], [0.12, 0.9, 0.04], [0, 0, i * PI * 2 / 3]);
    g.add(prop);
    [-1, 1].forEach(sd => {
      part(g, SPH, glow(0xfff4c0, 2), [sd * 0.6, -0.35, 1.25], [0.18, 0.18, 0.1]);
      part(g, CYL, M(0x555555), [sd * 0.6, -0.75, 0], [0.08, 2.2, 0.08], [PI / 2, 0, 0]);
    });
    g.userData = { prop };
    return g;
  }

  function drone() {
    const g = new THREE.Group();
    part(g, BOX, M(0xeef4f8, { metalness: 0.3 }), [0, 0, 0], [0.5, 0.18, 0.5]);
    part(g, SPH, glow(0x27d3ff, 1.5), [0, 0, 0.26], [0.12, 0.12, 0.06]);
    const props = [];
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => {
      part(g, CYL, M(0x333a44), [x * 0.32, 0.03, z * 0.32], [0.08, 0.1, 0.08]);
      props.push(part(g, BOX, M(0x27d3ff), [x * 0.32, 0.1, z * 0.32], [0.3, 0.01, 0.05]));
    });
    g.userData = { props };
    return g;
  }

  // ---------------- Снаряжение (для витрины магазина) ----------------
  function item(id) {
    const g = new THREE.Group();
    switch (id) {
      case 'scuba':
        part(g, CYL, M(0xffc21a, { metalness: 0.5, roughness: 0.3 }), [0, 0, 0], [0.35, 1.1, 0.35]);
        part(g, SPH, M(0xffc21a, { metalness: 0.5, roughness: 0.3 }), [0, 0.55, 0], [0.35, 0.3, 0.35]);
        part(g, CYL, M(0x888888, { metalness: 0.8 }), [0, 0.78, 0], [0.12, 0.2, 0.12]);
        part(g, TORUS, M(0x222222), [0.15, 0.6, 0], [0.5, 0.5, 0.5], [0, PI / 2, 0]);
        break;
      case 'flashlight':
        part(g, CYL, M(0x1d2733, { metalness: 0.6 }), [0, 0, 0], [0.22, 0.9, 0.22], [0, 0, PI / 2]);
        part(g, CYL, M(0x2b3a4f, { metalness: 0.6 }), [0.5, 0, 0], [0.34, 0.2, 0.34], [0, 0, PI / 2]);
        part(g, CYL, glow(0xfff6c8, 2), [0.61, 0, 0], [0.28, 0.02, 0.28], [0, 0, PI / 2]);
        break;
      case 'scanner':
        part(g, BOX, M(0x1d2733), [0, 0, 0], [0.9, 0.6, 0.14]);
        part(g, BOX, glow(0x27d3ff, 1.2), [0, 0.03, 0.08], [0.72, 0.42, 0.01]);
        part(g, BOX, M(0x1d2733), [0, -0.5, -0.05], [0.15, 0.5, 0.1]);
        part(g, TORUS, glow(0x5fffb0, 1.5), [0, 0.03, 0.09], [0.4, 0.4, 0.4]);
        break;
      case 'knife':
        part(g, BOX, M(0xd8e2ea, { metalness: 0.9, roughness: 0.2 }), [0, 0.3, 0], [0.14, 0.8, 0.03]);
        part(g, CONE, M(0xd8e2ea, { metalness: 0.9, roughness: 0.2 }), [0, 0.8, 0], [0.14, 0.2, 0.03]);
        part(g, BOX, M(0xff7a1a), [0, -0.3, 0], [0.18, 0.45, 0.1]);
        part(g, BOX, M(0x333333), [0, -0.06, 0], [0.32, 0.05, 0.12]);
        break;
      case 'camera':
        part(g, BOX, M(0x1f4f8f), [0, 0, 0], [0.9, 0.6, 0.5]);
        part(g, CYL, M(0x111111, { metalness: 0.6 }), [0, 0, 0.35], [0.35, 0.25, 0.35], [PI / 2, 0, 0]);
        part(g, CYL, glass(0x7fbfff, 0.9), [0, 0, 0.48], [0.28, 0.02, 0.28], [PI / 2, 0, 0]);
        part(g, BOX, glow(0xffffff, 1), [0.3, 0.38, 0], [0.2, 0.1, 0.15]);
        break;
      case 'fins':
        [-1, 1].forEach(sd => {
          part(g, BOX, M(0xffd21a), [sd * 0.3, 0, 0], [0.4, 0.05, 1.2]);
          part(g, BOX, M(0x1d2733), [sd * 0.3, 0.08, 0.4], [0.32, 0.15, 0.35]);
        });
        break;
      case 'detector':
        part(g, CYL, M(0x666f78, { metalness: 0.8 }), [0, 0.1, 0], [0.06, 1.6, 0.06]);
        part(g, CYL, M(0xff7a1a), [0, -0.75, 0.15], [0.7, 0.06, 0.55], [0.3, 0, 0]);
        part(g, BOX, M(0x1d2733), [0, 0.7, 0.1], [0.2, 0.3, 0.15]);
        part(g, BOX, glow(0x5fffb0, 1.2), [0, 0.72, 0.18], [0.14, 0.12, 0.01]);
        break;
      case 'drone': return drone();
      case 'deepsuit': {
        const brass = M(0xc9a24a, { metalness: 0.8, roughness: 0.3 });
        part(g, SPH, brass, [0, 0.6, 0], [0.9, 0.9, 0.9]);
        part(g, CYL, glass(0x7fe0ff, 0.85), [0, 0.6, 0.42], [0.4, 0.06, 0.4], [PI / 2, 0, 0]);
        [-1, 1].forEach(sd => part(g, CYL, glass(0x7fe0ff, 0.85), [sd * 0.44, 0.6, 0], [0.22, 0.05, 0.22], [0, 0, PI / 2]));
        part(g, CYL, brass, [0, 0.12, 0], [1.3, 0.25, 0.9]);
        part(g, CYL, M(0x3a3226), [0, -0.4, 0], [1.1, 0.8, 0.7]);
        break;
      }
      case 'sub': return sub();
    }
    return g;
  }

  // ---------------- Предметы в мире ----------------
  function pickup(kind, v = 0) {
    const g = new THREE.Group();
    switch (kind) {
      case 'trash':
        if (v === 0) {
          part(g, CYL, glass(0x3f9f5f, 0.75), [0, 0, 0], [0.22, 0.6, 0.22], [0, 0, PI / 2]);
          part(g, CYL, glass(0x3f9f5f, 0.75), [0.4, 0, 0], [0.09, 0.22, 0.09], [0, 0, PI / 2]);
        } else if (v === 1) {
          part(g, CYL, M(0xd23a3a, { metalness: 0.7, roughness: 0.3 }), [0, 0, 0], [0.24, 0.38, 0.24], [0.3, 0, PI / 2]);
        } else {
          part(g, SPH, M(0xf2f2f2, { transparent: true, opacity: 0.75, side: THREE.DoubleSide }), [0, 0, 0], [0.8, 0.3, 0.6]);
          part(g, SPH, M(0xf2f2f2, { transparent: true, opacity: 0.75 }), [0.3, 0.12, 0.1], [0.3, 0.25, 0.3]);
        }
        break;
      case 'oyster':
        part(g, HEMI, M(0x8f8a9a), [0, 0, 0], [0.8, 0.25, 0.7], [PI, 0, 0]);
        part(g, HEMI, M(0xb0a8bc), [0, 0.05, -0.15], [0.8, 0.25, 0.7], [-0.7, 0, 0]);
        part(g, SPH, glow(0xfaf5ff, 0.5, { metalness: 0.3, roughness: 0.1 }), [0, 0.1, 0.05], [0.22, 0.22, 0.22]);
        break;
      case 'o2':
        part(g, CYL, glow(0x27d3ff, 0.8), [0, 0, 0], [0.32, 0.6, 0.32]);
        part(g, CYL, M(0xeef4f8, { metalness: 0.6 }), [0, 0.36, 0], [0.18, 0.12, 0.18]);
        part(g, TORUS, glow(0x9ff7ff, 1.5), [0, 0, 0], [1, 1, 1], [PI / 2, 0, 0]);
        break;
      case 'algae':
        for (let i = 0; i < 3; i++) part(g, CONE, glow(0x4fd36a, 0.5), [Math.cos(i * 2) * 0.12, 0.3, Math.sin(i * 2) * 0.12], [0.1, 0.6 + i * 0.15, 0.1], [0.2 * Math.cos(i * 2), 0, 0.2 * Math.sin(i * 2)]);
        break;
      case 'crystal':
        part(g, CYL, M(0x2f8f4f), [0, 0.35, 0], [0.08, 0.7, 0.08]);
        for (let i = 0; i < 3; i++) part(g, OCTA, glow(0x9fff6a, 1.4), [Math.cos(i * 2.1) * 0.2, 0.6 + i * 0.15, Math.sin(i * 2.1) * 0.2], [0.25, 0.45, 0.25]);
        break;
      case 'glowshroom':
        part(g, CYL, M(0xe8e0d0), [0, 0.3, 0], [0.12, 0.6, 0.12]);
        part(g, HEMI, glow(0xff5fd8, 1.4), [0, 0.6, 0], [0.7, 0.45, 0.7]);
        part(g, HEMI, glow(0x5ffff0, 1.4), [0.3, 0.3, 0.1], [0.35, 0.25, 0.35]);
        break;
      case 'orb':
        part(g, SPH, glow(0xffd23a, 2.2), [0, 0, 0], [0.9, 0.9, 0.9]);
        part(g, TORUS, glow(0xfff2a0, 2), [0, 0, 0], [1.6, 1.6, 1.6], [PI / 2, 0, 0]);
        break;
      case 'fragment':
        part(g, BOX, glow(0xd9c08a, 0.35), [0, 0, 0], [0.9, 0.05, 0.65], [0, 0.3, 0]);
        part(g, BOX, glow(0xffc83a, 1.2), [0, 0.03, 0], [0.5, 0.01, 0.04], [0, 0.9, 0]);
        part(g, TORUS, glow(0xffc83a, 1.6), [0, 0, 0], [2, 2, 2], [PI / 2, 0, 0]);
        break;
      case 'probe': {
        part(g, SPH, M(0xffc21a, { metalness: 0.4 }), [0, 0, 0], [0.9, 0.9, 0.9]);
        part(g, CYL, M(0x333a44), [0, 0, 0], [0.95, 0.15, 0.95]);
        part(g, CYL, M(0x888888), [0, 0.7, 0], [0.04, 0.6, 0.04]);
        const l = part(g, SPH, glow(0xff3a3a, 2), [0, 1.0, 0], [0.15, 0.15, 0.15]);
        g.userData.blink = l;
        break;
      }
      case 'chest': {
        const wood = M(0x6b4423);
        part(g, BOX, wood, [0, 0, 0], [1.1, 0.6, 0.75]);
        part(g, CYL, wood, [0, 0.3, 0], [0.75, 1.1, 0.75], [0, 0, PI / 2]);
        [-0.35, 0.35].forEach(x => part(g, BOX, M(0xffc83a, { metalness: 0.8, roughness: 0.3 }), [x, 0.15, 0], [0.08, 0.95, 0.8]));
        part(g, BOX, glow(0xffc83a, 0.8), [0, 0.15, 0.4], [0.15, 0.2, 0.05]);
        break;
      }
      case 'logbook':
        part(g, BOX, M(0x7a1f1f), [0, 0, 0], [0.55, 0.1, 0.42]);
        part(g, BOX, glow(0xf2e2b8, 0.6), [0, 0.06, 0], [0.5, 0.02, 0.38]);
        part(g, TORUS, glow(0x27d3ff, 1.2), [0, 0, 0], [1.4, 1.4, 1.4], [PI / 2, 0, 0]);
        break;
      case 'jar':
        part(g, SPH, M(0xa8623a), [0, 0, 0], [0.8, 1.0, 0.8]);
        part(g, CYL, M(0xa8623a), [0.4, 0.3, 0], [0.3, 0.5, 0.3], [0, 0, -1.2]);
        part(g, TCYL, M(0xc0573a), [0.75, 0.48, 0], [0.12, 0.5, 0.12], [0, 0, -0.9]);
        g.rotation.z = 1.3;
        break;
      case 'beaconSpot':
        part(g, TORUS, glow(0x5fffb0, 1.6), [0, 0.1, 0], [2.2, 2.2, 2.2], [PI / 2, 0, 0]);
        part(g, CYL, M(0x333a44), [0, 0.1, 0], [0.5, 0.2, 0.5]);
        break;
      case 'beacon':
        part(g, CYL, M(0x333a44, { metalness: 0.6 }), [0, 0.1, 0], [0.7, 0.2, 0.7]);
        part(g, CYL, M(0xeef4f8, { metalness: 0.5 }), [0, 1.0, 0], [0.12, 1.8, 0.12]);
        g.userData.blink = part(g, SPH, glow(0x5fffb0, 3), [0, 2.0, 0], [0.35, 0.35, 0.35]);
        break;
      case 'net': {
        const net = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd9c38a, wireframe: true, transparent: true, opacity: 0.85 }));
        net.scale.set(1.7, 0.9, 1.9);
        g.add(net);
        part(g, SPH, M(0xff7a1a), [1.2, 0.8, 0.5], [0.25, 0.25, 0.25]);
        break;
      }
      case 'rope':
        part(g, CYL, M(0xb89a62), [0, 0, 0], [0.08, 2.6, 0.08], [0.4, 0, 0.7]);
        part(g, SPH, M(0x8a6f42), [0, 0, 0], [0.25, 0.25, 0.25]);
        break;
    }
    return g;
  }

  // ---------------- Анимация ----------------
  function animate(g, t, k = 1) {
    const a = g.userData.anim;
    // Шаг времени для этого объекта: анимация не зависит от FPS
    const dt = a && a.lt !== undefined ? Math.min(0.1, Math.max(0, t - a.lt)) : 0;
    if (a) a.lt = t;
    if (g.userData.mixer) g.userData.mixer.update(dt || 0.016);
    if (!a || g.userData.glb) return;
    switch (a.type) {
      case 'fish': {
        // Частота взмахов растёт со скоростью; фаза накапливается, поэтому без рывков
        a.ph = (a.ph || 0) + dt * 9 * (a.slow || 1) * (0.5 + k);
        const amp = 0.3 + Math.min(1, k) * 0.2;
        if (a.rear) {
          a.rear.rotation.y = Math.sin(a.ph) * amp * 0.45;
          a.tail.rotation.y = Math.sin(a.ph - 1.2) * amp * 1.1;
        } else a.tail.rotation.y = Math.sin(a.ph) * 0.45;
        if (a.pecs) a.pecs.forEach(p => { p.rotation.z = Math.sin(a.ph * 0.5 + p.userData.side) * 0.35 * p.userData.side; });
        if (a.lure) {
          if (a.lure.userData.y0 === undefined) a.lure.userData.y0 = a.lure.position.y;
          a.lure.position.y = a.lure.userData.y0 + Math.sin(t * 3) * 0.05;
          a.lure.material.emissiveIntensity = 3 + Math.sin(t * 2.3) * 1.2;
        }
        break;
      }
      case 'turtle':
        a.fl.forEach((p, i) => {
          const phase = t * 1.8 * (0.7 + k * 0.5) + (i < 2 ? 0 : 1.7);
          p.rotation.z = (Math.sin(phase) * 0.4 - 0.12) * p.userData.side;
          p.rotation.y = Math.cos(phase) * 0.16 * p.userData.side;
        });
        break;
      case 'dolphin':
        a.tail.rotation.x = Math.sin(t * a.speed * (0.5 + k)) * 0.35;
        break;
      case 'ray':
        a.wings.forEach(w => { w.rotation.z = (Math.sin(t * (1.4 + k * 0.35)) * 0.38 + Math.sin(t * 2.8) * 0.07) * w.userData.side; });
        break;
      case 'jelly': {
        const p = 1 + Math.sin(t * 2.2) * 0.12;
        a.bell.scale.set(a.s * p, 0.75 * a.s * (2 - p), a.s * p);
        a.tg.rotation.z = Math.sin(t * 1.3) * 0.12;
        a.tg.rotation.x = Math.cos(t * 1.1) * 0.08;
        a.tg.scale.y = 2 - p;
        // Щупальца колышутся с разной фазой
        a.tg.children.forEach((c, i) => { c.rotation.x = Math.sin(t * 1.7 + i) * 0.18; c.rotation.z = Math.cos(t * 1.3 + i * 1.7) * 0.18; });
        break;
      }
      case 'bob':
        a.b.rotation.x = Math.sin(t * 1.5) * 0.12;
        a.b.position.y = Math.sin(t * 1.2) * 0.05;
        break;
      case 'eel':
        a.segs.forEach((sg, i) => { sg.position.x = Math.sin(t * 4 - i * 0.8) * 0.05 * a.s * (i + 1) / a.segs.length; });
        break;
      case 'squid': {
        const p = 1 + Math.sin(t * 3) * 0.25;
        a.tg.scale.set(p, p, 1);
        break;
      }
      case 'octopus':
        a.tents.forEach((p, i) => { p.rotation.x = 0.7 + Math.sin(t * 2 + i) * 0.3; });
        break;
    }
  }

  // ---------------- Превью (картинки для меню) ----------------
  let tR = null, tScene, tCam;
  function thumbnail(obj, dir) {
    try {
      if (!tR) {
        tR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        tR.setSize(160, 160);
        tR.outputEncoding = THREE.sRGBEncoding;
        tScene = new THREE.Scene();
        tScene.add(new THREE.HemisphereLight(0xffffff, 0x335577, 1.1));
        const d = new THREE.DirectionalLight(0xffffff, 0.8);
        d.position.set(3, 5, 4);
        tScene.add(d);
        tCam = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
      }
      tScene.add(obj);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3()).length();
      const c = box.getCenter(new THREE.Vector3());
      tCam.position.copy(c).addScaledVector((dir || new THREE.Vector3(1, 0.45, 0.7)).normalize(), size * 1.35);
      tCam.near = size * 0.01; tCam.far = size * 10;
      tCam.updateProjectionMatrix();
      tCam.lookAt(c);
      tR.render(tScene, tCam);
      const url = tR.domElement.toDataURL('image/png');
      tScene.remove(obj);
      return url;
    } catch (e) {
      console.warn('Не удалось создать превью', e);
      return '';
    }
  }

  return { M, glow, glass, part, SPH, BOX, CYL, CONE, OCTA, TORUS, HEMI, creature, diver, sub, drone, item, pickup, animate, thumbnail };
})();
