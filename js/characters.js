'use strict';
// ============================================================
//  Играбельные персонажи: процедурные модели русалок и героя.
//  Если в models/manifest.json указан GLB с тем же id, он заменяет
//  процедурную модель (см. Gfx.Assets).
//  Система координат как у дайвера: тело смотрит вдоль +Z, голова вверх.
// ============================================================

const CHARACTERS = [
  { id: 'diver', name: 'Дайвер', desc: 'Исследователь станции «Аква-1» в гидрокостюме.' },
  { id: 'lilia', name: 'Лилия', desc: 'Розовая русалка. «Даже в самой глубокой тьме есть место для света».', kind: 'mermaid' },
  { id: 'oceana', name: 'Океана', desc: 'Русалка глубин в синем: корона из ракушек и жемчуга.', kind: 'mermaid' },
  { id: 'arachna', name: 'Арахна', desc: 'Русалка с паутинным узором и красными очками. Спокойная, умная, смелая.', kind: 'mermaid' },
  { id: 'guardian', name: 'Морской страж', desc: 'Герой в золотой чешуйчатой броне с трезубцем.', kind: 'hero' },
];

const Characters = (() => {
  const PI = Math.PI;
  const V3 = THREE.Vector3;

  // ---------- Палитры персонажей ----------
  const CFG = {
    lilia: {
      skin: '#ffe2d6', hair: 0xe07a9e, hairHi: '#ffd0e0', hairLen: -0.95, eyes: ['#9fb8ff', '#6a5bd0'], lips: '#e8708e', brow: '#d88aa0',
      top: 0xfff4f6, topOpacity: 0.86, sleeve: 0xfff0f4, sleeveOpacity: 0.62, collar: true,
      tail: ['#ef8fb0', '#c9608a', '#ffd3e3'], tailSheen: 0xffc0e0, fin: ['#f6a3c0', '#ffe6ef', '#ffffff'],
      ruffle: 0xfff0f5, ruffleOpacity: 0.7, belt: 'pearl', flower: 0xffe4ee, pearls: true, pendant: 0xff9fd0,
    },
    oceana: {
      skin: '#f6d8c8', hair: 0x060c1c, hairHi: '#3a5a9a', hairLen: -1.0, eyes: ['#7fd0ff', '#2a5aa8'], lips: '#d0707a', brow: '#1a2238',
      top: 0x1a3c8a, topOpacity: 1, sleeve: 0x22468a, sleeveOpacity: 0.72, collar: true, shell: true, cropTop: true,
      tail: ['#2a5fd0', '#123a8a', '#5fd0ff'], tailSheen: 0x7fe8ff, fin: ['#3f8fe0', '#8ff0ff', '#d8fbff'],
      ruffle: 0x2f78d0, ruffleOpacity: 0.72, belt: 'pearl', crown: true, pearls: true, pendant: 0xbfefff,
    },
    arachna: {
      skin: '#e8c2a6', hair: 0x050406, hairHi: '#3a2a30', hairLen: -0.85, eyes: ['#5a3a2a', '#2a1a10'], lips: '#b0605a', brow: '#151012',
      top: 0xe6d6bc, topOpacity: 1, sleeve: 0xe0d0b4, sleeveOpacity: 0.9, collar: true, web: true,
      tail: ['#e8dcc4', '#1a2448', '#c8202e'], tailSheen: 0xffffff, fin: ['#1c2a5a', '#c8202e', '#e8dcc4'], finWeb: true,
      ruffle: 0xe0d0b4, ruffleOpacity: 0.85, belt: 'leather', glasses: true, ribbons: 0xc8202e, braids: true,
    },
    guardian: {
      skin: '#d9a582', hair: 0x1c0f06, hairHi: '#c99a5a', hairLen: 0.32, eyes: ['#4f8fa8', '#2a4a5a'], lips: '#9a5a4a', brow: '#4a3018', beard: '#5a3a1e',
    },
  };

  // ---------- Текстуры ----------
  const texCache = {};
  function canvasTex(key, w, h, draw) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    texCache[key] = t;
    return t;
  }

  // Лицо на сфере: центр лица — u = 0.25 (направление +Z)
  function faceTex(id, c) {
    return canvasTex('face_' + id, 512, 256, (g, W, H) => {
      g.fillStyle = c.skin; g.fillRect(0, 0, W, H);
      const cx = 128, ey = 124;
      // Мягкая тень по краям лица
      const sh = g.createRadialGradient(cx, 140, 30, cx, 140, 110);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(120,60,50,0.18)');
      g.fillStyle = sh; g.fillRect(0, 0, W, H);
      // Румянец
      [-1, 1].forEach(s => {
        const b = g.createRadialGradient(cx + s * 34, 152, 0, cx + s * 34, 152, 16);
        b.addColorStop(0, 'rgba(255,120,140,0.45)'); b.addColorStop(1, 'rgba(255,120,140,0)');
        g.fillStyle = b; g.fillRect(cx + s * 34 - 18, 134, 36, 36);
      });
      if (c.beard) {
        g.fillStyle = c.beard;
        g.beginPath();
        g.moveTo(cx - 52, 128); g.quadraticCurveTo(cx - 50, 205, cx, 222); g.quadraticCurveTo(cx + 50, 205, cx + 52, 128);
        g.lineTo(cx + 40, 150); g.quadraticCurveTo(cx, 160, cx - 40, 150); g.closePath(); g.fill();
        g.fillStyle = c.skin; g.beginPath(); g.ellipse(cx, 172, 13, 7, 0, 0, PI * 2); g.fill();
        g.fillStyle = c.beard; g.beginPath(); g.ellipse(cx, 164, 20, 5, 0, 0, PI * 2); g.fill();
        for (let i = 0; i < 160; i++) {
          g.strokeStyle = 'rgba(30,18,8,0.4)'; g.lineWidth = 1;
          const x = cx - 50 + Math.random() * 100, y = 140 + Math.random() * 75;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + 6); g.stroke();
        }
      }
      // Глаза: склера, радужка с градиентом, зрачок, блики, ресницы
      const big = !c.beard;
      [-1, 1].forEach(s => {
        const x = cx + s * (big ? 24 : 22), ew = big ? 15 : 12, eh = big ? 13 : 7;
        g.fillStyle = '#fbf8f6'; g.beginPath(); g.ellipse(x, ey, ew, eh, 0, 0, PI * 2); g.fill();
        g.save(); g.beginPath(); g.ellipse(x, ey, ew, eh, 0, 0, PI * 2); g.clip();
        const ir = g.createRadialGradient(x, ey + 2, 1, x, ey, big ? 12 : 7);
        ir.addColorStop(0, c.eyes[0]); ir.addColorStop(0.7, c.eyes[1]); ir.addColorStop(1, '#101020');
        g.fillStyle = ir; g.beginPath(); g.ellipse(x, ey + 1, big ? 10 : 6, big ? 13 : 7, 0, 0, PI * 2); g.fill();
        g.fillStyle = '#0a0a14'; g.beginPath(); g.ellipse(x, ey + 1, big ? 4 : 2.5, big ? 6 : 3.5, 0, 0, PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(x - 3, ey - 4, big ? 3.2 : 1.8, 0, PI * 2); g.fill();
        g.beginPath(); g.arc(x + 3, ey + 5, big ? 1.6 : 1, 0, PI * 2); g.fill();
        g.restore();
        g.strokeStyle = '#1a1018'; g.lineWidth = big ? 3.2 : 2.4; g.lineCap = 'round';
        g.beginPath(); g.ellipse(x, ey, ew + 1, eh + 1, 0, PI * 1.05, PI * 1.95); g.stroke();
        g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + s * (ew - 1), ey - eh * 0.6); g.lineTo(x + s * (ew + 5), ey - eh - 2); g.stroke();
        g.strokeStyle = 'rgba(80,40,40,0.4)'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(x, ey + 1, ew, eh + 2, 0, PI * 0.15, PI * 0.85); g.stroke();
        // Брови
        g.strokeStyle = c.brow; g.lineWidth = c.beard ? 4 : 2.2;
        g.beginPath(); g.moveTo(x - s * 12, ey - (c.beard ? 16 : 22)); g.quadraticCurveTo(x + s * 2, ey - (c.beard ? 22 : 28), x + s * 15, ey - (c.beard ? 17 : 22)); g.stroke();
      });
      // Нос
      g.strokeStyle = 'rgba(150,80,70,0.45)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(cx + 2, 138); g.quadraticCurveTo(cx + 5, 150, cx, 152); g.stroke();
      // Губы
      g.fillStyle = c.lips;
      g.beginPath(); g.moveTo(cx - 10, 170); g.quadraticCurveTo(cx, 164, cx + 10, 170); g.quadraticCurveTo(cx, 178, cx - 10, 170); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(cx + 2, 172, 4, 1.5, 0, 0, PI * 2); g.fill();
    });
  }

  const mixHex = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
  // Чешуя хвоста: перед (u≈0/1) светлее, по бокам — основной цвет, блики по краю чешуек
  function scaleTex(id, cols, web) {
    return canvasTex('tail_' + id, 512, 1024, (g, W, H) => {
      const cw = 22, ch = 18;
      g.fillStyle = web ? cols[1] : cols[0]; g.fillRect(0, 0, W, H);
      for (let row = -1; row < H / ch + 1; row++) {
        for (let col = -1; col < W / cw + 1; col++) {
          const x = col * cw + (row % 2 ? cw / 2 : 0), y = row * ch;
          const u = (x / W + 1) % 1;
          // u = 0.5 — передняя сторона развёртки LatheGeometry
          const front = Math.pow(0.5 - Math.cos(u * PI * 2) * 0.5, 1.5);
          // Плавный переход основного цвета к светлому «животу» хвоста
          const base = web ? (front > 0.45 ? cols[0] : cols[1]) : mixHex(cols[0], cols[2], Math.min(1, front * 1.3));
          const gr = g.createLinearGradient(x, y, x, y + ch * 1.2);
          gr.addColorStop(0, mixHex(base, web ? base : cols[1], 0.35)); gr.addColorStop(0.7, base); gr.addColorStop(1, mixHex(base, '#ffffff', 0.35));
          g.fillStyle = gr;
          g.beginPath(); g.arc(x, y, cw * 0.62, 0, PI); g.fill();
          g.strokeStyle = web ? 'rgba(200,170,140,0.6)' : 'rgba(255,255,255,0.45)'; g.lineWidth = 1.2;
          g.beginPath(); g.arc(x, y, cw * 0.6, 0.2, PI - 0.2); g.stroke();
        }
      }
      if (web) {
        // Красные кромки между светлой и тёмной частью
        g.fillStyle = cols[2];
        [0.36, 0.64].forEach(u => g.fillRect(u * W - 5, 0, 10, H));
        g.strokeStyle = 'rgba(210,190,160,0.55)'; g.lineWidth = 1.5;
        for (let y = 0; y < H; y += 60) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x * 0.05) * 8); g.stroke(); }
      }
    });
  }

  // Плавник: градиент, лучи, полупрозрачный край (альфа в текстуре)
  function finTex(id, cols, web) {
    return canvasTex('fin_' + id, 256, 256, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, cols[0]); gr.addColorStop(0.7, cols[web ? 0 : 1]); gr.addColorStop(1, cols[2]);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.strokeStyle = web ? cols[1] : 'rgba(255,255,255,0.7)'; g.lineWidth = web ? 2.5 : 1.6;
      for (let i = 0; i <= 18; i++) {
        const x = i / 18 * W;
        g.beginPath(); g.moveTo(W / 2 + (x - W / 2) * 0.15, 0); g.quadraticCurveTo(x, H * 0.5, x + (x - W / 2) * 0.2, H); g.stroke();
      }
      if (web) {
        g.strokeStyle = 'rgba(230,220,200,0.7)'; g.lineWidth = 1.5;
        for (let r = 30; r < H * 1.3; r += 30) { g.beginPath(); g.arc(W / 2, -20, r, 0.2, PI - 0.2); g.stroke(); }
        g.fillStyle = cols[1]; g.fillRect(0, H - 14, W, 14);
      }
      // Прозрачность: плотнее у основания, кружевной край
      const img = g.getImageData(0, 0, W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        img.data[i + 3] = Math.round(255 * (0.92 - 0.45 * (y / H)));
      }
      g.putImageData(img, 0, 0);
    });
  }

  // Ткань верха: узор паутины / ракушка / вышивка жемчугом
  function topTex(id, c) {
    return canvasTex('top_' + id, 256, 256, (g, W, H) => {
      g.fillStyle = '#' + new THREE.Color(c.top).getHexString(); g.fillRect(0, 0, W, H);
      if (c.web) {
        // Тёмные боковые панели и паутинный узор (без логотипов)
        g.fillStyle = '#1a2448';
        g.fillRect(W * 0.16, 0, W * 0.12, H); g.fillRect(W * 0.72, 0, W * 0.12, H);
        g.strokeStyle = 'rgba(160,140,110,0.55)'; g.lineWidth = 1.2;
        const cx = W * 0.5, cy = H * 0.45;
        for (let a = 0; a < 12; a++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a / 12 * PI * 2) * 120, cy + Math.sin(a / 12 * PI * 2) * 120); g.stroke(); }
        for (let r = 12; r < 120; r += 14) {
          g.beginPath();
          for (let a = 0; a <= 12; a++) { const x = cx + Math.cos(a / 12 * PI * 2) * r, y = cy + Math.sin(a / 12 * PI * 2) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
        g.strokeStyle = '#c8202e'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(W * 0.28, 0); g.lineTo(W * 0.28, H); g.moveTo(W * 0.72, 0); g.lineTo(W * 0.72, H); g.stroke();
      } else {
        // Тонкая вышивка и складки
        g.strokeStyle = c.shell ? 'rgba(160,210,255,0.5)' : 'rgba(255,190,210,0.6)'; g.lineWidth = 1;
        for (let i = 0; i < 26; i++) { const x = i / 26 * W; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, H * 0.3, x - 6, H * 0.6, x, H); g.stroke(); }
        g.fillStyle = c.shell ? 'rgba(220,240,255,0.9)' : 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(W * 0.5 + Math.sin(i * 0.5) * 60 * (i / 40), H * (0.25 + i / 60), 1.8, 0, PI * 2); g.fill(); }
        if (c.shell) {
          // Ракушка-гребешок на груди
          g.save(); g.translate(W / 2, H * 0.42);
          g.fillStyle = '#e8f4ff'; g.strokeStyle = '#7fb8e8'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(0, 22); for (let a = 0; a <= 8; a++) { const ang = PI + a / 8 * PI; g.lineTo(Math.cos(ang) * 30, 10 + Math.sin(ang) * 30); } g.closePath(); g.fill(); g.stroke();
          for (let a = 1; a < 8; a++) { const ang = PI + a / 8 * PI; g.beginPath(); g.moveTo(0, 22); g.lineTo(Math.cos(ang) * 28, 10 + Math.sin(ang) * 28); g.stroke(); }
          g.restore();
        }
      }
    });
  }

  // Золотая чешуйчатая броня / зелёные поножи
  function armorTex(key, a, b, line) {
    return canvasTex(key, 256, 256, (g, W, H) => {
      g.fillStyle = b; g.fillRect(0, 0, W, H);
      const cw = 20, ch = 16;
      for (let row = -1; row < H / ch + 1; row++) for (let col = -1; col < W / cw + 1; col++) {
        const x = col * cw + (row % 2 ? cw / 2 : 0), y = row * ch;
        const gr = g.createLinearGradient(x, y, x, y + ch);
        gr.addColorStop(0, b); gr.addColorStop(1, a);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, cw * 0.6, 0, PI); g.fill();
        g.strokeStyle = line; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, cw * 0.58, 0.1, PI - 0.1); g.stroke();
      }
    });
  }

  // ---------- Геометрия ----------
  function lathe(points, seg = 28, zScale = 0.78) {
    const g = new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), seg);
    g.scale(1, 1, zScale);
    g.computeVertexNormals();
    return g;
  }
  // Плоская фигура с UV по габаритам (для текстур плавников)
  function shapeGeo(pts, curveSeg = 6) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ShapeGeometry(sh, curveSeg);
    g.computeBoundingBox();
    const bb = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x || 1), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1));
    return g;
  }
  function mesh(geo, mat, pos, rot, scl, parent) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  const SPH = new THREE.SphereGeometry(0.5, 24, 16);

  // ---------- Шейдер изгиба хвоста (волна, как у дельфина) ----------
  function tailBend(mat, u) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uPh = u.ph; sh.uniforms.uAmp = u.amp;
      sh.vertexShader = 'uniform float uPh;\nuniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        float tdist = max(0.0, -0.12 - position.y);
        transformed.z += sin(uPh - tdist * 2.1) * uAmp * tdist * tdist * 0.32;
        transformed.x += sin(uPh * 0.5 - tdist * 1.3) * uAmp * tdist * 0.04;`);
    };
    mat.customProgramCacheKey = () => 'tailBend';
    return mat;
  }
  // Колыхание волос: чем ниже прядь, тем сильнее
  function hairSway(mat, top) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = Gfx.U.time;
      sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        float hd = max(0.0, ${top.toFixed(2)} - position.y);
        transformed.z += (sin(uT * 1.4 + position.y * 3.0 + position.x * 4.0) * 0.06 - 0.05) * hd * hd;
        transformed.x += sin(uT * 1.1 + position.y * 2.3 + position.z * 5.0) * 0.05 * hd * hd;`);
    };
    mat.customProgramCacheKey = () => 'hairSway' + top;
    return mat;
  }

  // Волосы: шапка + пряди-трубки вдоль спины, объединённые в одну геометрию
  function hair(c, body, headY, headR, long) {
    const mat = hairSway(new THREE.MeshPhysicalMaterial({ color: c.hair, roughness: 0.55, metalness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.5, side: THREE.DoubleSide }), headY);
    const parts = [];
    // Шапка волос: сфера без лицевой части + чёлка
    const cap = new THREE.SphereGeometry(headR * 1.08, 28, 18, PI * 0.5 + 0.95, PI * 2 - 1.9, 0, PI * 0.78);
    cap.scale(1, 1.2, 1.06); cap.translate(0, headY, -0.01);
    parts.push(cap);
    const bangs = new THREE.SphereGeometry(headR * 1.09, 28, 10, 0, PI * 2, 0, PI * 0.3);
    bangs.scale(1, 1.2, 1.06);
    bangs.translate(0, headY + 0.005, 0);
    parts.push(bangs);
    const strand = (x0, y0, z0, x1, y1, z1, r, wav) => {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const k = i / 8;
        pts.push(new V3(x0 + (x1 - x0) * k + Math.sin(k * 9 + wav) * 0.03 * k,
          y0 + (y1 - y0) * k, z0 + (z1 - z0) * k + Math.cos(k * 7 + wav) * 0.025 * k - Math.sin(k * PI) * 0.06));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tg = new THREE.TubeGeometry(curve, 20, r, 5, false);
      // Пряди сужаются к кончику (6 вершин на кольцо, 21 кольцо)
      const p = tg.attributes.position, centers = curve.getSpacedPoints(20);
      for (let i = 0; i < p.count; i++) {
        const ring = Math.min(20, Math.floor(i / 6)), center = centers[ring];
        const taper = 1 - ring / 20 * 0.75;
        p.setXYZ(i, center.x + (p.getX(i) - center.x) * taper, center.y + (p.getY(i) - center.y) * taper, center.z + (p.getZ(i) - center.z) * taper);
      }
      tg.computeVertexNormals();
      parts.push(tg);
    };
    // Два слоя прядей (внутренний толще) — объём, как у длинных волнистых волос
    const n = 64;
    for (let i = 0; i < n; i++) {
      const layer = i % 2, f = (i >> 1) / (n / 2 - 1);
      const a = (f - 0.5) * PI * 1.5; // от виска до виска через затылок (a = 0 — затылок)
      const sx = Math.sin(a) * headR * 0.95, sz = -Math.cos(a) * headR * (0.9 - layer * 0.1) - 0.01;
      const end = long + Math.sin(i * 1.7) * 0.12 - layer * 0.08;
      const spread = 1.15 + Math.abs(Math.sin(a)) * 0.35;
      strand(sx, headY + 0.08 - layer * 0.04, sz, sx * spread, end, sz - 0.06 - (i * 0.37 % 1) * 0.06, 0.042 + layer * 0.012 + (i % 3) * 0.006, i);
    }
    // Пряди, обрамляющие лицо (спереди на плечи)
    [-1, 1].forEach(sd => {
      for (let k = 0; k < 3; k++) strand(sd * headR * 0.88, headY + 0.02, 0.04 - k * 0.03, sd * (0.2 + k * 0.03), headY - 0.55 - k * 0.1, 0.1 - k * 0.04, 0.026, k * 2 + sd);
    });
    const geo = mergeGeos(parts);
    const m = mesh(geo, mat, null, null, null, body);
    m.receiveShadow = false;
    return m;
  }
  function mergeGeos(geos) {
    const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
    let n = 0;
    parts.forEach(g => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    parts.forEach(g => {
      if (!g.attributes.normal) g.computeVertexNormals();
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

  // Цветок из лепестков (украшение для волос / пояса)
  function flower(parent, pos, size, color, rot) {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    const petal = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, sheen: new THREE.Color(0xffc0d8), side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * PI * 2;
      mesh(SPH, petal, [Math.cos(a) * size * 0.45, Math.sin(a) * size * 0.45, 0], [0, 0, a], [size * 0.75, size * 0.42, size * 0.12], g).rotation.x = 0.25;
    }
    mesh(SPH, new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffd080, emissiveIntensity: 0.4 }), [0, 0, size * 0.05], null, [size * 0.35, size * 0.35, size * 0.2], g);
    parent.add(g);
    return g;
  }
  // Нить жемчуга по окружности/дуге
  function pearlArc(parent, center, rx, rz, y, n, size, a0 = 0, a1 = PI * 2, sag = 0) {
    const pearl = new THREE.MeshPhysicalMaterial({ color: 0xfff8f0, roughness: 0.15, clearcoat: 1, sheen: new THREE.Color(0xffd6f0) });
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), a = a0 + (a1 - a0) * k;
      mesh(SPH, pearl, [center[0] + Math.cos(a) * rx, y - Math.sin(k * PI) * sag, center[2] + Math.sin(a) * rz], null, [size, size, size], parent);
    }
  }

  // ---------- Русалка ----------
  function mermaid(id) {
    const c = CFG[id];
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const tailU = { ph: { value: 0 }, amp: { value: 0.3 } };
    // Цвет кожи переводится в линейное пространство, чтобы совпадать с текстурой лица
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.skin).convertSRGBToLinear(), roughness: 0.55 });
    const headY = 0.8, headR = 0.155;

    // Голова с нарисованным лицом
    const head = mesh(new THREE.SphereGeometry(0.5, 40, 28), new THREE.MeshPhysicalMaterial({ map: faceTex(id, c), roughness: 0.5, sheen: new THREE.Color(0xff9a8a), clearcoat: 0.12 }),
      [0, headY, 0], null, [headR * 2, headR * 2.35, headR * 2.1], body);
    mesh(SPH, skin, [0, headY - 0.17, 0.0], null, [0.08, 0.16, 0.08], body);       // шея
    [-1, 1].forEach(sd => mesh(SPH, skin, [sd * headR * 0.98, headY - 0.01, -0.01], null, [0.035, 0.06, 0.03], body)); // уши
    hair(c, body, headY, headR, c.hairLen);

    // Торс (женский силуэт), блузка
    const torsoPts = [[0.0, -0.2], [0.17, -0.17], [0.185, -0.06], [0.15, 0.1], [0.165, 0.24], [0.195, 0.36], [0.18, 0.46], [0.16, 0.53], [0.08, 0.6], [0.0, 0.62]];
    mesh(lathe(torsoPts.map(p => [p[0] * 0.92, p[1]])), skin, null, null, null, body);
    const topMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: topTex(id, c), roughness: 0.55, sheen: new THREE.Color(0xffffff), clearcoat: c.web ? 0.1 : 0.3,
      transparent: c.topOpacity < 1, opacity: c.topOpacity, side: THREE.DoubleSide,
    });
    const topPts = (c.cropTop ? torsoPts.slice(3) : torsoPts).map(p => [p[0] + 0.012, p[1]]);
    const top = mesh(lathe(topPts), topMat, null, null, null, body);
    top.material.map.repeat.set(1, 1);
    [-1, 1].forEach(sd => mesh(SPH, topMat, [sd * 0.072, 0.36, 0.09], null, [0.13, 0.12, 0.11], body)); // грудь
    if (c.collar) mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.1, 20, 1, true), topMat, [0, 0.66, 0], null, null, body);
    if (c.pendant) mesh(new THREE.OctahedronGeometry(0.03, 0), new THREE.MeshPhysicalMaterial({ color: c.pendant, emissive: c.pendant, emissiveIntensity: 0.6, roughness: 0.05, clearcoat: 1 }),
      [0, 0.5, 0.15], null, [0.8, 1.4, 0.6], body);
    if (c.pearls) pearlArc(body, [0, 0, 0.02], 0.12, 0.13, 0.56, 13, 0.018, 0.15, PI - 0.15, 0.1);

    // Руки: рукав-колокол с оборкой у запястья
    const sleeveMat = new THREE.MeshPhysicalMaterial({ color: c.sleeve, roughness: 0.5, sheen: new THREE.Color(0xffffff), transparent: c.sleeveOpacity < 1, opacity: c.sleeveOpacity, side: THREE.DoubleSide, depthWrite: c.sleeveOpacity >= 1 });
    const arms = [];
    [-1, 1].forEach(sd => {
      const a = new THREE.Group();
      a.position.set(sd * 0.235, 0.5, 0);
      body.add(a);
      mesh(SPH, sleeveMat.opacity < 0.8 ? skin : sleeveMat, [0, -0.04, 0], null, [0.1, 0.1, 0.1], a);   // плечо
      mesh(SPH, skin, [0, -0.22, 0], null, [0.065, 0.46, 0.065], a);
      mesh(SPH, skin, [0, -0.5, 0.01], null, [0.055, 0.12, 0.032], a); // кисть
      mesh(lathe([[0.04, 0.03], [0.045, -0.1], [0.05, -0.24], [0.065, -0.34], [0.09, -0.42], [0.105, -0.46]], 20, 1), sleeveMat, [0, 0, 0], null, null, a);
      if (c.ribbons) mesh(new THREE.PlaneGeometry(0.03, 0.4), new THREE.MeshStandardMaterial({ color: c.ribbons, side: THREE.DoubleSide }), [0, -0.55, -0.05], [0, 0, 0.1 * sd], null, a);
      arms.push(a);
    });

    // Хвост с перламутровой чешуёй
    const scales = scaleTex(id, c.tail, c.finWeb);
    const tailMat = tailBend(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: scales, normalMap: Gfx.buildTextures().scaleN, normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.32, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: new THREE.Color(c.tailSheen),
    }), tailU);
    const tailPts = [[0.0, -0.1], [0.172, -0.12], [0.2, -0.35], [0.19, -0.6], [0.16, -0.95], [0.13, -1.25], [0.095, -1.55], [0.07, -1.8], [0.06, -1.92], [0.0, -1.98]];
    mesh(lathe(tailPts, 32, 0.72), tailMat, null, null, null, body);

    // Плавники и оборки — полупрозрачные, с прожилками
    const finMat = tailBend(new THREE.MeshPhysicalMaterial({
      map: finTex(id, c.fin, c.finWeb), transparent: true, side: THREE.DoubleSide, depthWrite: false,
      roughness: 0.25, clearcoat: 0.6, sheen: new THREE.Color(c.tailSheen), emissive: new THREE.Color(c.fin[0]), emissiveIntensity: 0.35,
    }), tailU);
    // Хвостовой плавник: две широкие лопасти с рваным краем
    [-1, 1].forEach(sd => {
      const pts = [[0, -1.82], [0.1 * sd, -1.86], [0.34 * sd, -2.05], [0.58 * sd, -2.38], [0.7 * sd, -2.72], [0.6 * sd, -2.66], [0.52 * sd, -2.74], [0.44 * sd, -2.6], [0.34 * sd, -2.62], [0.26 * sd, -2.46], [0.14 * sd, -2.4], [0.05 * sd, -2.22], [0, -2.1]];
      mesh(shapeGeo(sd > 0 ? pts : pts.slice().reverse()), finMat, null, null, null, body);
    });
    // Боковые плавники на «коленях» хвоста (как длинные вуали)
    [-1, 1].forEach(sd => {
      const pts = [[0.12 * sd, -0.85], [0.3 * sd, -1.05], [0.42 * sd, -1.4], [0.36 * sd, -1.36], [0.38 * sd, -1.55], [0.28 * sd, -1.48], [0.24 * sd, -1.62], [0.1 * sd, -1.3]];
      const m = mesh(shapeGeo(sd > 0 ? pts : pts.slice().reverse()), finMat, [0, 0, -0.02], [0, sd * 0.35, 0], null, body);
      m.castShadow = false;
    });
    // Оборка-юбка у бёдер: рваные полупрозрачные полотнища
    const ruffleMat = tailBend(new THREE.MeshPhysicalMaterial({
      color: c.ruffle, map: finTex(id, c.fin, c.finWeb), transparent: true, opacity: c.ruffleOpacity, side: THREE.DoubleSide, depthWrite: false,
      roughness: 0.4, sheen: new THREE.Color(0xffffff),
    }), tailU);
    const panels = c.web ? 9 : 12;
    for (let i = 0; i < panels; i++) {
      const a = i / panels * PI * 2, len = (c.web ? 0.9 : 0.55) + (i % 3) * 0.12;
      const pts = [[-0.09, 0], [0.09, 0], [0.1, -len * 0.7], [0.05, -len * 0.82], [0.03, -len], [-0.02, -len * 0.8], [-0.07, -len * 0.92], [-0.1, -len * 0.65]];
      const m = mesh(shapeGeo(pts), ruffleMat, [Math.sin(a) * 0.19, -0.1, Math.cos(a) * 0.15], null, null, body);
      m.castShadow = false;
      // Поворот наружу и лёгкий наклон: нижний край отходит от хвоста
      m.rotation.order = 'YXZ';
      m.rotation.set(-0.22, a, 0);
    }
    // Пояс
    if (c.belt === 'pearl') {
      pearlArc(body, [0, 0, 0], 0.19, 0.145, -0.1, 30, 0.02);
      pearlArc(body, [0, 0, 0.02], 0.17, 0.14, -0.12, 12, 0.015, 0.4, PI - 0.4, 0.12);
      flower(body, [0.12, -0.08, 0.12], 0.06, c.flower || 0xe8f4ff, [0, 0.6, 0]);
    } else {
      const leather = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.6, metalness: 0.2 });
      const buckle = new THREE.MeshStandardMaterial({ color: 0xc0c4cc, metalness: 0.9, roughness: 0.25 });
      mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 40), leather, [0, -0.08, 0], [PI / 2, 0, 0], [1, 0.8, 1], body);
      mesh(new THREE.TorusGeometry(0.17, 0.014, 8, 40), leather, [0, 0.2, 0], [PI / 2, 0, 0], [1, 0.8, 1], body);
      // Ремни-портупея крест-накрест
      [-1, 1].forEach(sd => mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 40), leather, [0, 0.3, 0], [0.15, 0, sd * 0.55], [0.85, 1.05, 0.95], body));
      [[0, -0.08, 0.15], [0.12, 0.2, 0.11]].forEach(p => mesh(new THREE.BoxGeometry(0.05, 0.04, 0.015), buckle, p, null, null, body));
      // Красные ленты от пояса
      const rib = new THREE.MeshStandardMaterial({ color: c.ribbons, side: THREE.DoubleSide, roughness: 0.5 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6 - 0.5) * 2.4;
        mesh(new THREE.PlaneGeometry(0.025, 0.5 + (i % 2) * 0.2), rib, [Math.sin(a) * 0.19, -0.35, Math.cos(a) * 0.15], [0, a, 0], null, body);
      }
    }

    // Украшения головы
    if (c.flower) {
      flower(body, [0.13, headY + 0.1, 0.06], 0.075, c.flower, [0, 1.0, 0.3]);
      flower(body, [0.16, headY + 0.02, 0.0], 0.045, 0xffd0e0, [0, 1.3, 0]);
    }
    if (c.pearls && !c.crown) pearlArc(body, [0, 0, 0], headR * 1.1, headR * 1.12, headY + 0.1, 26, 0.012, PI * 0.05, PI * 0.95);
    if (c.crown) {
      const silver = new THREE.MeshStandardMaterial({ color: 0xd8e4f0, metalness: 0.9, roughness: 0.2 });
      mesh(new THREE.TorusGeometry(headR * 1.1, 0.01, 6, 40, PI * 1.1), silver, [0, headY + 0.12, 0], [PI / 2 - 0.25, 0, -PI * 0.05], null, body);
      pearlArc(body, [0, 0, 0], headR * 1.1, headR * 1.12, headY + 0.13, 18, 0.014, PI * 0.1, PI * 0.9);
      const shellM = new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.3, clearcoat: 1, sheen: new THREE.Color(0x9fdfff) });
      [-0.6, 0, 0.6].forEach(a => mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, PI * 2, 0, PI / 2), shellM, [Math.sin(a) * 0.15, headY + 0.17 - Math.abs(a) * 0.03, Math.cos(a) * 0.13], [0.3, a, 0], [0.06, 0.05, 0.02], body));
      // Морская звезда
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.012 : 0.03, a = i / 10 * PI * 2 + PI / 2; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      mesh(new THREE.ExtrudeGeometry(star, { depth: 0.008, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xe0a070, roughness: 0.6 }), [0.12, headY + 0.12, 0.1], [0, 0.8, 0.2], null, body);
      // Серьги: три жемчужины на нити
      const pearlM = new THREE.MeshPhysicalMaterial({ color: 0xfff8f0, roughness: 0.15, clearcoat: 1 });
      [-1, 1].forEach(sd => { for (let k = 0; k < 3; k++) mesh(SPH, pearlM, [sd * headR * 1.02, headY - 0.06 - k * 0.03, 0], null, [0.016, 0.016, 0.016], body); });
    }
    if (c.glasses) {
      const lens = new THREE.MeshPhysicalMaterial({ color: 0xb01020, emissive: 0x400008, roughness: 0.05, metalness: 0.4, clearcoat: 1, transparent: true, opacity: 0.85 });
      const frame = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.95, roughness: 0.2 });
      [-1, 1].forEach(sd => {
        mesh(SPH, lens, [sd * 0.058, headY + 0.005, headR * 1.04 * 1.05], [0, sd * 0.3, 0], [0.085, 0.045, 0.02], body);
        mesh(new THREE.TorusGeometry(0.044, 0.005, 6, 24), frame, [sd * 0.058, headY + 0.005, headR * 1.04 * 1.05], [0, sd * 0.3, 0], [1, 0.55, 1], body);
        mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5), frame, [sd * 0.15, headY + 0.01, 0.07], [PI / 2, 0, 0], null, body);
      });
    }
    if (c.braids) {
      // Две косички с красными лентами и бусинами
      const braidM = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.45 });
      const red = new THREE.MeshStandardMaterial({ color: c.ribbons, roughness: 0.4 });
      [-1, 1].forEach(sd => {
        for (let k = 0; k < 9; k++) mesh(SPH, k % 3 === 2 ? red : braidM, [sd * (0.12 + k * 0.008), headY - 0.05 - k * 0.06, 0.02 - k * 0.012], null, [0.04, 0.06, 0.04], body);
      });
    }

    root.userData = { body, arms, legs: [], helmet: new THREE.Group(), kind: 'mermaid', tailU, head };
    root.traverse(o => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    return root;
  }

  // ---------- Морской страж (герой в чешуйчатой броне) ----------
  function guardian() {
    const c = CFG.guardian;
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    // Цвет кожи переводится в линейное пространство, чтобы совпадать с текстурой лица
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.skin).convertSRGBToLinear(), roughness: 0.6 });
    const goldTex = armorTex('gold', '#ffcf4a', '#a8661a', 'rgba(255,240,170,0.8)');
    const greenTex = armorTex('green', '#2fa070', '#0b3a2a', 'rgba(120,230,170,0.6)');
    const scaleN = Gfx.buildTextures().scaleN;
    const gold = new THREE.MeshPhysicalMaterial({ map: goldTex, normalMap: scaleN, normalScale: new THREE.Vector2(0.9, 0.9), metalness: 0.85, roughness: 0.3, clearcoat: 0.5 });
    const green = new THREE.MeshPhysicalMaterial({ map: greenTex, normalMap: scaleN, normalScale: new THREE.Vector2(0.8, 0.8), metalness: 0.4, roughness: 0.38, clearcoat: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xe8b23a, metalness: 1, roughness: 0.22 });
    const greenArmor = new THREE.MeshStandardMaterial({ color: 0x1f6a4a, metalness: 0.7, roughness: 0.3 });
    const headY = 0.83, headR = 0.15;

    mesh(new THREE.SphereGeometry(0.5, 40, 28), new THREE.MeshPhysicalMaterial({ map: faceTex('guardian', c), roughness: 0.55, sheen: new THREE.Color(0xff9a7a) }),
      [0, headY, 0], null, [headR * 2, headR * 2.4, headR * 2.1], body);
    mesh(SPH, skin, [0, headY - 0.2, 0], null, [0.12, 0.18, 0.11], body);
    hair(c, body, headY, headR, c.hairLen);
    // Торс: широкие плечи, золотая чешуя
    const torso = [[0, -0.22], [0.2, -0.2], [0.21, -0.05], [0.2, 0.1], [0.25, 0.3], [0.29, 0.45], [0.27, 0.56], [0.14, 0.64], [0, 0.66]];
    mesh(lathe(torso, 32, 0.7), gold, null, null, null, body);
    [-1, 1].forEach(sd => {
      mesh(SPH, gold, [sd * 0.08, 0.4, 0.13], null, [0.2, 0.17, 0.1], body);         // грудные пластины
      mesh(SPH, gold, [sd * 0.29, 0.53, 0], null, [0.2, 0.17, 0.2], body);           // плечи
    });
    // Пояс с пряжкой-волной
    mesh(new THREE.TorusGeometry(0.205, 0.035, 8, 40), trim, [0, -0.17, 0], [PI / 2, 0, 0], [1, 0.72, 1], body);
    mesh(new THREE.ConeGeometry(0.07, 0.12, 3), trim, [0, -0.2, 0.15], [PI, 0, 0], [1, 1, 0.3], body);
    const arms = [], legs = [];
    [-1, 1].forEach(sd => {
      const a = new THREE.Group();
      a.position.set(sd * 0.32, 0.5, 0);
      body.add(a);
      mesh(SPH, gold, [0, -0.18, 0], null, [0.13, 0.38, 0.13], a);
      mesh(SPH, skin, [0, -0.6, 0.01], null, [0.085, 0.11, 0.07], a);
      // Наруч с плавниками-шипами
      mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.26, 12), greenArmor, [0, -0.42, 0], null, null, a);
      for (let k = 0; k < 3; k++) mesh(new THREE.ConeGeometry(0.03, 0.16, 4), trim, [sd * 0.06, -0.34 - k * 0.07, -0.02], [0, 0, sd * -0.8], [1, 1, 0.3], a);
      arms.push(a);
      const l = new THREE.Group();
      l.position.set(sd * 0.11, -0.22, 0);
      body.add(l);
      mesh(SPH, green, [0, -0.28, 0], null, [0.17, 0.6, 0.17], l);
      // Поножи и сапоги
      mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.36, 12), greenArmor, [0, -0.72, 0.01], null, null, l);
      mesh(new THREE.CylinderGeometry(0.02, 0.09, 0.1, 12), trim, [0, -0.52, 0.01], null, null, l);
      for (let k = 0; k < 2; k++) mesh(new THREE.ConeGeometry(0.035, 0.2, 4), trim, [sd * 0.07, -0.62 - k * 0.12, 0], [0, 0, sd * -0.6], [1, 1, 0.3], l);
      mesh(SPH, greenArmor, [0, -0.93, 0.05], null, [0.12, 0.09, 0.22], l);
      legs.push(l);
    });
    // Трезубец в правой руке
    const tri = new THREE.Group();
    tri.position.set(0, -0.6, 0.06);
    tri.rotation.x = -0.15;
    arms[0].add(tri);
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.2, 8), trim, [0, 0.3, 0], null, null, tri);
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), trim, [0, 1.38, 0], null, null, tri);
    mesh(new THREE.TorusGeometry(0.12, 0.016, 6, 16, PI), trim, [0, 1.43, 0], [0, 0, PI], null, tri);
    [-0.12, 0, 0.12].forEach(x => mesh(new THREE.ConeGeometry(0.035, x ? 0.32 : 0.42, 4), trim, [x, x ? 1.6 : 1.68, 0], null, null, tri));
    root.userData = { body, arms, legs, helmet: new THREE.Group(), kind: 'hero' };
    return root;
  }

  function build(id) {
    if (id === 'guardian') return guardian();
    if (CFG[id]) return mermaid(id);
    return null;
  }
  const get = id => CHARACTERS.find(ch => ch.id === id) || CHARACTERS[0];

  return { build, get, CFG };
})();
