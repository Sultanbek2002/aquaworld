'use strict';
// ============================================================
//  Графика: пресеты качества, процедурные текстуры, каустики,
//  подводный туман, постобработка (bloom, преломление, ACES),
//  загрузка GLB-моделей и адаптивное разрешение
// ============================================================

const Gfx = (() => {
  const PI = Math.PI;

  // ---------- Пресеты качества ----------
  const PRESETS = {
    low:    { pr: 0.75, post: false, shadows: false, shadowSize: 0,    msaa: 0, flora: 0.5, particles: 0.5, rays: 8,  creatures: 0.5, beam: false, bloom: 0 },
    medium: { pr: 1,    post: true,  shadows: true,  shadowSize: 1024, msaa: 2, flora: 1,   particles: 1,   rays: 14, creatures: 1,   beam: true,  bloom: 0.8 },
    high:   { pr: 1.5,  post: true,  shadows: true,  shadowSize: 2048, msaa: 4, flora: 1.3, particles: 1.4, rays: 20, creatures: 1,   beam: true,  bloom: 0.9 },
    ultra:  { pr: 2,    post: true,  shadows: true,  shadowSize: 4096, msaa: 4, flora: 1.7, particles: 2,   rays: 26, creatures: 1.2, beam: true,  bloom: 1 },
  };
  const preset = q => PRESETS[q] || PRESETS.medium;

  // Общие uniform-объекты (одни на все материалы)
  const U = {
    time: { value: 0 },
    caustTex: { value: null },
    caustK: { value: 1 },
  };

  // ---------- Подводный туман: красный свет поглощается быстрее синего ----------
  THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );
    vec3 waterAbsorb = exp( - fogDepth * fogDensity * vec3( 2.6, 0.9, 0.55 ) );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, fogDepth );
    vec3 waterAbsorb = vec3( 1.0 );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb * waterAbsorb, fogColor, fogFactor );
#endif`;

  // ---------- Процедурные текстуры ----------
  function canvas(size, h) {
    const c = document.createElement('canvas');
    c.width = size; c.height = h || size;
    return c;
  }
  function tex(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    return t;
  }
  // Бесшовный value-noise
  function makeNoise(seed) {
    const N = 256, p = new Float32Array(N * N);
    let s = seed || 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < p.length; i++) p[i] = r();
    return (x, y, period) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const P = period || N;
      const g = (a, b) => p[(((a % P) + P) % P) % N + ((((b % P) + P) % P) % N) * N];
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  const noise = makeNoise(13);
  function fbm(x, y, period, oct = 4) {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += noise(x * f, y * f, period * f) * a; a *= 0.5; f *= 2; }
    return v;
  }

  // Карта нормалей из функции высоты h(u, v) ∈ [0,1]
  function normalMap(size, h, strength = 2) {
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = h(x / size, y / size);
    const c = canvas(size), g = c.getContext('2d'), img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = H[y * size + (x - 1 + size) % size], r = H[y * size + (x + 1) % size];
      const u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c);
  }

  // Каустики: сеть ярких линий (расстояние до границы ячеек Вороного)
  function makeCaustics() {
    const N = 256, c = canvas(N), g = c.getContext('2d'), img = g.createImageData(N, N);
    const pts = [];
    let s = 99;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 26; i++) pts.push([r() * N, r() * N]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let d1 = 1e9, d2 = 1e9;
      for (const p of pts) for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) {
        const dx = x - p[0] - ox, dy = y - p[1] - oy, d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      let v = Math.max(0, 1 - e / 9);
      v = Math.pow(v, 2.2) * 255;
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c);
  }

  const T = {};
  function buildTextures() {
    if (T.caustics) return T;
    T.caustics = makeCaustics();
    U.caustTex.value = T.caustics;
    // Песчаная рябь
    T.sandN = normalMap(256, (u, v) => {
      const w = fbm(u * 4, v * 4, 4) * 2.5;
      return Math.sin((u * 10 + v * 3 + w) * PI * 2) * 0.35 + fbm(u * 32, v * 32, 32, 3) * 0.65;
    }, 3);
    // Камень
    T.rockN = normalMap(256, (u, v) => fbm(u * 8, v * 8, 8, 5) + Math.abs(fbm(u * 3 + 7, v * 3, 3) - 0.5) * 0.8, 5);
    // Чешуя (ряды полукругов)
    T.scaleN = normalMap(256, (u, v) => {
      const rows = 12, cols = 12, row = Math.floor(v * rows), off = row % 2 ? 0.5 : 0;
      const cx = (u * cols + off) % 1, cy = v * rows % 1;
      const d = Math.hypot(cx - 0.5, cy * 1.1);
      return Math.max(0, 1 - d * 1.6) * 0.8 + cy * 0.2;
    }, 4);
    // Борозды мозгового коралла
    T.coralN = normalMap(256, (u, v) => Math.abs(Math.sin((fbm(u * 5, v * 5, 5) * 6 + u * 2) * PI * 2)), 3);
    // Доски затонувших кораблей
    {
      const c = canvas(256), g = c.getContext('2d');
      for (let i = 0; i < 8; i++) {
        const l = 34 + (i * 37 % 17);
        g.fillStyle = `rgb(${l + 40},${l + 22},${l + 8})`;
        g.fillRect(0, i * 32, 256, 32);
        g.fillStyle = 'rgba(20,12,6,0.85)'; g.fillRect(0, i * 32, 256, 2);
        for (let k = 0; k < 40; k++) {
          g.strokeStyle = `rgba(${k % 2 ? 30 : 90},${k % 2 ? 20 : 70},${k % 2 ? 10 : 40},0.25)`;
          const y = i * 32 + 3 + Math.random() * 27;
          g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + 2, 170, y - 2, 256, y + 1); g.stroke();
        }
        g.fillStyle = 'rgba(10,6,3,0.9)'; g.fillRect((i * 97) % 256, i * 32, 2, 32);
      }
      // Пятна мха и ракушек
      for (let k = 0; k < 90; k++) {
        g.fillStyle = k % 3 ? 'rgba(70,95,60,0.35)' : 'rgba(200,200,180,0.35)';
        g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * (k % 3 ? 12 : 3), 0, PI * 2); g.fill();
      }
      T.wood = tex(c);
      T.wood.encoding = THREE.sRGBEncoding;
      T.woodN = normalMap(256, (u, v) => (v * 8 % 1 < 0.06 ? 0 : 0.6) + fbm(u * 40, v * 4, 40, 3) * 0.4, 3);
    }
    // Мягкая точка (частицы)
    {
      const c = canvas(64), g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      T.dot = new THREE.CanvasTexture(c);
    }
    return T;
  }

  // ---------- Каустики на материалах MeshStandard / MeshPhysical ----------
  // Внедряется в шейдер через onBeforeCompile; предыдущий onBeforeCompile сохраняется.
  function enhance(m) {
    if (!m || !m.isMeshStandardMaterial || m.userData.gfx) return m;
    m.userData.gfx = true;
    const prev = m.onBeforeCompile;
    const prevKey = prev && prev !== THREE.Material.prototype.onBeforeCompile ? prev.toString() : '';
    const prevCK = m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? m.customProgramCacheKey() : '';
    m.onBeforeCompile = function (sh, r) {
      if (prevKey) prev.call(this, sh, r);
      sh.uniforms.uGfxTime = U.time;
      sh.uniforms.uCaust = U.caustTex;
      sh.uniforms.uCaustK = U.caustK;
      sh.vertexShader = 'varying vec3 vGfxW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 gfxW = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          gfxW = instanceMatrix * gfxW;
        #endif
        vGfxW = ( modelMatrix * gfxW ).xyz;`);
      sh.fragmentShader = 'varying vec3 vGfxW;\nuniform float uGfxTime;\nuniform float uCaustK;\nuniform sampler2D uCaust;\n' +
        sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          vec3 gwn = inverseTransformDirection( normal, viewMatrix );
          float gUp = clamp( gwn.y * 0.75 + 0.25, 0.0, 1.0 );
          vec2 cuv = ( vGfxW.xz + vGfxW.y * vec2( 0.3, 0.2 ) ) * 0.085;
          float c1 = texture2D( uCaust, cuv + vec2( uGfxTime * 0.021, uGfxTime * 0.013 ) ).r;
          float c2 = texture2D( uCaust, cuv * 1.37 + vec2( -uGfxTime * 0.017, uGfxTime * 0.019 ) ).r;
          float gC = min( c1, c2 ) * 1.6 + c1 * c2 * 0.6;
          float gDepth = exp( min( vGfxW.y, 0.0 ) * 0.05 );
          reflectedLight.directDiffuse += diffuseColor.rgb * gC * gUp * gDepth * uCaustK * 0.55;
        }`);
    };
    m.customProgramCacheKey = () => 'gfx1|' + prevCK + '|' + prevKey;
    m.needsUpdate = true;
    return m;
  }
  function enhanceScene(root) {
    root.traverse(o => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(enhance);
    });
  }
  function shadows(obj, cast = true, receive = true) {
    obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
    return obj;
  }

  // ---------- Постобработка ----------
  const quadVS = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
  const brightFS = `
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThr;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-0.5,-0.5)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(0.5,-0.5)).rgb
             + texture2D(tDiffuse, vUv + uTexel * vec2(-0.5,0.5)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(0.5,0.5)).rgb;
      c *= 0.25;
      float l = max(c.r, max(c.g, c.b));
      float k = smoothstep(uThr, uThr + 0.6, l);
      gl_FragColor = vec4(min(c * k, vec3(16.0)), 1.0);
    }`;
  const blurFS = `
    uniform sampler2D tDiffuse; uniform vec2 uDir;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
      c += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
      c += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }`;
  const compositeFS = `
    uniform sampler2D tScene, tB1, tB2;
    uniform float uTime, uBloom, uExposure, uDistort, uVig, uGrade, uGrain;
    uniform vec3 uTint;
    uniform vec2 uRes;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 acesFilm(vec3 color){
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= uExposure / 0.6;
      color = OUT * RRTAndODTFit(IN * color);
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    void main(){
      vec2 uv = vUv;
      // Преломление: лёгкое колыхание изображения под водой
      vec2 w = vec2(sin(uv.y * 23.0 + uTime * 1.7) + 0.5 * sin(uv.y * 41.0 - uTime * 2.3),
                    cos(uv.x * 19.0 + uTime * 1.3) + 0.5 * cos(uv.x * 37.0 + uTime * 2.1));
      uv += w * uDistort;
      vec2 dc = uv - 0.5;
      float ca = uDistort * 0.5 + dot(dc, dc) * 0.006;
      vec3 col;
      col.r = texture2D(tScene, uv + dc * ca).r;
      col.g = texture2D(tScene, uv).g;
      col.b = texture2D(tScene, uv - dc * ca).b;
      vec3 bloom = texture2D(tB1, uv).rgb * 0.45 + texture2D(tB2, uv).rgb * 0.6;
      col += bloom * uBloom;
      // Цветокоррекция по глубине: тени уходят в сине-зелёный
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, mix(col, lum * uTint, 0.6), uGrade);
      col = acesFilm(col);
      // Виньетка
      vec2 vd = dc * vec2(uRes.x / uRes.y, 1.0);
      col *= mix(1.0, smoothstep(1.05, 0.25, length(vd)), uVig);
      col = toSRGB(col);
      float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`;

  let renderer = null, q = PRESETS.medium, qName = 'medium';
  const post = { on: false };
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsScene = new THREE.Scene();
  const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  fsQuad.frustumCulled = false;
  fsScene.add(fsQuad);
  const mBright = new THREE.ShaderMaterial({ vertexShader: quadVS, fragmentShader: brightFS, uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1.0 } }, depthTest: false, depthWrite: false });
  const mBlur = new THREE.ShaderMaterial({ vertexShader: quadVS, fragmentShader: blurFS, uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
  const mComp = new THREE.ShaderMaterial({
    vertexShader: quadVS, fragmentShader: compositeFS, depthTest: false, depthWrite: false,
    uniforms: {
      tScene: { value: null }, tB1: { value: null }, tB2: { value: null },
      uTime: { value: 0 }, uBloom: { value: 0.8 }, uExposure: { value: 0.8 }, uDistort: { value: 0.0008 },
      uVig: { value: 0.35 }, uGrade: { value: 0 }, uGrain: { value: 0.012 },
      uTint: { value: new THREE.Color(0.25, 0.75, 1.0) }, uRes: { value: new THREE.Vector2(1, 1) },
    },
  });

  function pass(mat, target) {
    fsQuad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCam);
  }

  function rtType() {
    const caps = renderer.capabilities, ext = renderer.extensions;
    if (caps.isWebGL2 && ext.has('EXT_color_buffer_float')) return THREE.HalfFloatType;
    if (!caps.isWebGL2 && ext.has('OES_texture_half_float') && ext.has('OES_texture_half_float_linear') && ext.has('EXT_color_buffer_half_float')) return THREE.HalfFloatType;
    return THREE.UnsignedByteType;
  }

  function disposeTargets() {
    ['scene', 'b1', 't1', 'b2', 't2'].forEach(k => { if (post[k]) { post[k].dispose(); post[k] = null; } });
  }
  function buildTargets() {
    disposeTargets();
    if (!post.on) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, size.x), h = Math.max(2, size.y);
    const type = rtType();
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type };
    if (q.msaa && renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
      post.scene = new THREE.WebGLMultisampleRenderTarget(w, h, opts);
      post.scene.samples = q.msaa;
    } else post.scene = new THREE.WebGLRenderTarget(w, h, opts);
    const h1 = [Math.ceil(w / 2), Math.ceil(h / 2)], h2 = [Math.ceil(w / 4), Math.ceil(h / 4)];
    const small = Object.assign({}, opts, { depthBuffer: false });
    post.b1 = new THREE.WebGLRenderTarget(h1[0], h1[1], small);
    post.t1 = new THREE.WebGLRenderTarget(h1[0], h1[1], small);
    post.b2 = new THREE.WebGLRenderTarget(h2[0], h2[1], small);
    post.t2 = new THREE.WebGLRenderTarget(h2[0], h2[1], small);
    post.w = w; post.h = h;
    post.hdr = type !== THREE.UnsignedByteType;
    mBright.uniforms.uThr.value = post.hdr ? 1.5 : 0.9;
    mComp.uniforms.uRes.value.set(w, h);
  }

  function blur(src, tmp, dst) {
    mBlur.uniforms.tDiffuse.value = src.texture;
    mBlur.uniforms.uDir.value.set(1 / src.width, 0);
    pass(mBlur, tmp);
    mBlur.uniforms.tDiffuse.value = tmp.texture;
    mBlur.uniforms.uDir.value.set(0, 1 / tmp.height);
    pass(mBlur, dst);
  }

  // ---------- Адаптивное разрешение ----------
  const perf = { scale: 1, acc: 0, n: 0, cool: 0 };
  function applyPR() {
    const pr = Math.max(0.5, Math.min(q.pr, window.devicePixelRatio || 1) * perf.scale);
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    buildTargets();
  }
  function adapt(dt) {
    perf.acc += dt; perf.n++;
    perf.cool -= dt;
    if (perf.acc < 2) return;
    const fps = perf.n / perf.acc;
    perf.acc = 0; perf.n = 0;
    if (perf.cool > 0 || document.hidden) return;
    let s = perf.scale;
    if (fps < 38 && s > 0.6) s = Math.max(0.6, s - 0.1);
    else if (fps > 57 && s < 1) s = Math.min(1, s + 0.05);
    if (Math.abs(s - perf.scale) > 0.001) { perf.scale = s; perf.cool = 3; applyPR(); }
  }

  // ---------- Перевод цвета тумана для фона без постобработки ----------
  const tmpC = new THREE.Color();
  function aces(x) { const a = x * (x + 0.0245786) - 0.000090537, b = x * (0.983729 * x + 0.4329510) + 0.238081; return a / b; }
  function displayColor(lin, out, exposure) {
    // Приближение ACES + sRGB на CPU, чтобы фон совпадал с затуманенными объектами
    const k = (exposure || 0.8) / 0.6;
    const r = lin.r * k, g = lin.g * k, b = lin.b * k;
    const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b, ig = 0.07600 * r + 0.90834 * g + 0.01566 * b, ib = 0.02840 * r + 0.13383 * g + 0.83777 * b;
    const fr = aces(ir), fg = aces(ig), fb = aces(ib);
    const or = 1.60475 * fr - 0.53108 * fg - 0.07367 * fb, og = -0.10208 * fr + 1.10813 * fg - 0.00605 * fb, ob = -0.00327 * fr - 0.07276 * fg + 1.07602 * fb;
    const s = v => { v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
    // Цвет очистки записывается в кадр без преобразований, поэтому отдаём уже готовый sRGB
    return out.setRGB(s(or), s(og), s(ob));
  }

  // ---------- Инициализация / смена качества ----------
  function init(r, quality) {
    renderer = r;
    buildTextures();
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    setQuality(quality, true);
  }

  function setQuality(name, first) {
    qName = PRESETS[name] ? name : 'medium';
    q = PRESETS[qName];
    const wasPost = post.on, wasShadows = renderer.shadowMap.enabled;
    post.on = q.post;
    renderer.shadowMap.enabled = q.shadows;
    renderer.toneMapping = post.on ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    mComp.uniforms.uBloom.value = q.bloom;
    perf.scale = 1;
    applyPR();
    if (Gfx.sun) {
      const sh = Gfx.sun.shadow;
      if (sh.mapSize.x !== (q.shadowSize || 512)) {
        sh.mapSize.set(q.shadowSize || 512, q.shadowSize || 512);
        if (sh.map) { sh.map.dispose(); sh.map = null; }
      }
    }
    if (!first && Gfx.scene && (wasPost !== post.on || wasShadows !== q.shadows)) {
      Gfx.scene.traverse(o => {
        if (!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; });
      });
    }
    syncBackground();
  }

  function syncBackground() {
    const sc = Gfx.scene;
    if (!sc || !sc.fog) return;
    if (post.on) sc.background.copy(sc.fog.color);
    else displayColor(sc.fog.color, sc.background);
  }

  // depthM — глубина камеры в метрах
  let shadowFrame = 0;
  function render(scene, camera, dt, t, depthM) {
    U.time.value = t;
    U.caustK.value = Math.max(0, 1 - depthM / 260);
    adapt(dt);
    // Тени: каждый кадр у поверхности, на глубине — редко (солнце там почти не светит)
    shadowFrame++;
    if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = depthM < 260 || shadowFrame % 30 === 0;
    syncBackground();
    if (!post.on) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    if (!post.scene) buildTargets();
    renderer.setRenderTarget(post.scene);
    renderer.render(scene, camera);
    // Bloom: яркие области → половинное и четвертное разрешение
    mBright.uniforms.tDiffuse.value = post.scene.texture;
    mBright.uniforms.uTexel.value.set(1 / post.w, 1 / post.h);
    pass(mBright, post.b1);
    blur(post.b1, post.t1, post.b1);
    mBlur.uniforms.tDiffuse.value = post.b1.texture;
    mBlur.uniforms.uDir.value.set(1 / post.b1.width, 0);
    pass(mBlur, post.b2);
    blur(post.b2, post.t2, post.b2);
    const u = mComp.uniforms;
    u.tScene.value = post.scene.texture; u.tB1.value = post.b1.texture; u.tB2.value = post.b2.texture;
    u.uTime.value = t;
    const deep = Math.min(1, depthM / 600);
    u.uDistort.value = 0.0007 + 0.0005 * Math.max(0, 1 - depthM / 40);
    u.uVig.value = 0.3 + deep * 0.45;
    u.uGrade.value = Math.min(0.5, depthM / 500);
    u.uTint.value.setRGB(0.25 - deep * 0.1, 0.7 - deep * 0.2, 1.0);
    u.uGrain.value = 0.01 + deep * 0.015;
    pass(mComp, null);
  }

  // ---------- GLB / GLTF модели (необязательные) ----------
  // models/manifest.json: { "models": [ { "id": "lilia", "file": "models/lilia.glb", "scale": 1, "rotationY": 0, "offset": [0,0,0] } ] }
  // id — идентификатор персонажа (diver, lilia, marina, arachna, guardian) или вида животного из SPECIES.
  const Assets = (() => {
    const loaded = {}, waiting = {};
    function start() {
      if (!THREE.GLTFLoader || typeof fetch !== 'function' || location.protocol === 'file:') return;
      fetch('models/manifest.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (!data || !Array.isArray(data.models)) return;
          const loader = new THREE.GLTFLoader();
          data.models.forEach(entry => {
            if (!entry || !entry.id || !entry.file) return;
            loader.load(entry.file, gltf => {
              loaded[entry.id] = { gltf, entry };
              (waiting[entry.id] || []).forEach(fn => fn());
              waiting[entry.id] = [];
            }, undefined, err => console.warn('GLB не загружен: ' + entry.file, err && err.message));
          });
        })
        .catch(() => { /* манифест не обязателен */ });
    }
    function instance(id) {
      const a = loaded[id];
      if (!a) return null;
      const src = a.gltf.scene;
      const obj = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(src) : src.clone(true);
      const e = a.entry;
      const holder = new THREE.Group();
      obj.scale.setScalar(e.scale || 1);
      obj.rotation.y = e.rotationY || 0;
      if (Array.isArray(e.offset)) obj.position.fromArray(e.offset);
      holder.add(obj);
      obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) enhance(o.material); } });
      if (a.gltf.animations && a.gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(obj);
        const clip = a.gltf.animations.find(c => /swim|idle/i.test(c.name)) || a.gltf.animations[0];
        mixer.clipAction(clip).play();
        holder.userData.mixer = mixer;
      }
      return holder;
    }
    // Заменяет процедурную модель группы на GLB, когда (и если) он загрузится
    function attach(id, group, onSwap) {
      const apply = () => {
        const inst = instance(id);
        if (!inst) return;
        group.children.forEach(ch => { ch.visible = false; });
        group.add(inst);
        group.userData.glb = inst;
        if (inst.userData.mixer) group.userData.mixer = inst.userData.mixer;
        if (onSwap) onSwap(inst);
      };
      if (loaded[id]) apply();
      else (waiting[id] = waiting[id] || []).push(apply);
    }
    return { start, attach, instance, has: id => !!loaded[id] };
  })();

  const Gfx = {
    PRESETS, preset, U, T, init, setQuality, render, resize: () => { if (renderer) applyPR(); }, enhance, enhanceScene, shadows, buildTextures,
    syncBackground, displayColor, Assets, fbm, noise,
    get quality() { return qName; }, get q() { return q; }, get postOn() { return post.on; },
    scene: null, sun: null,
  };
  return Gfx;
})();
