'use strict';
// ============================================================
//  Сохранение прогресса (localStorage)
// ============================================================

const SAVE_KEY = 'aquaworld_save_v1';
const SETTINGS_KEY = 'aquaworld_settings_v1';

function defaultState() {
  return {
    v: 1,
    started: false,
    coins: 100,
    xp: 0,
    level: 1,
    items: [],
    upgrades: [],
    equip: { drone: true, sub: true, fins: true },
    zones: ['reef'],
    species: {},          // id -> { seen: true, photo: bool }
    quests: {},           // id -> { status: 'active'|'done', stage: n }
    tracked: null,
    collected: [],        // id одноразовых объектов
    res: { sample: 0, glow: 0, artifact: 0, trash: 0, pearl: 0, fragment: 0 },
    storyDone: false,
    pos: null,
    atBase: true,
    expedition: 0,
    diveState: null,
    waypoint: null,
    gear: { scuba:0, flashlight:0, knife:0, camera:0, fins:0, scanner:0, detector:0, drone:0, deepsuit:0, sub:0 },
    collection: { coin:0, lens:0, mineral:0, log:0, seal:0 },
    cargo: { coin:0, lens:0, mineral:0, log:0, seal:0 },
    explored: [],
    locations: [],
    noticed: [],
    mode: 'missions',
    run: null,
    event: null,
    eventSeq: 0,
    eventCooldown: 75,
    stats: { rescued: 0, photos: 0, dives: 0, maxDepth: 0, studied: 0 },
  };
}

function defaultSettings() {
  return { volume: 0.7, ambient: 0.5, sensitivity: 1, invertY: false, quality: 'medium', showFps: false, firstPerson: false, character: 'diver' };
}

// Текущее состояние игры (глобальное)
let S = defaultState();
let SETTINGS = defaultSettings();

const Save = {
  // Сливает сохранённые данные с шаблоном, чтобы не падать на старых/битых сохранениях
  merge(base, data) {
    for (const k in data) {
      if (!(k in base)) continue;
      const b = base[k], d = data[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && d && typeof d === 'object' && !Array.isArray(d) && k !== 'species' && k !== 'quests') {
        this.merge(b, d);
      } else if (d !== undefined && d !== null && (typeof d === typeof b || b === null)) {
        base[k] = d;
      }
    }
    return base;
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      S = data ? this.merge(defaultState(), data) : defaultState();
      if (data && !Object.prototype.hasOwnProperty.call(data, 'atBase')) S.atBase = !S.pos;
      for (const key of ['items', 'upgrades', 'zones', 'collected', 'explored', 'locations', 'noticed']) {
        if (!Array.isArray(S[key])) S[key] = defaultState()[key];
        S[key] = [...new Set(S[key].filter(x => typeof x === 'string'))];
      }
      for (const key of ['species', 'quests']) {
        if (!S[key] || Array.isArray(S[key]) || typeof S[key] !== 'object') S[key] = {};
      }
      for (const id of Object.keys(S.quests)) {
        const q = QUESTS.find(q => q.id === id), entry = S.quests[id];
        if (!q || !entry || !['active', 'done'].includes(entry.status)) { delete S.quests[id]; continue; }
        entry.stage = entry.status === 'done' ? q.stages.length : Math.max(0, Math.min(q.stages.length - 1, Number.isInteger(entry.stage) ? entry.stage : 0));
      }
      if (!Number.isFinite(S.expedition) || S.expedition < 0) S.expedition = 0;
      for (const bag of ['gear','collection','cargo']) if(!S[bag] || Array.isArray(S[bag]) || typeof S[bag]!=='object') S[bag]=defaultState()[bag];
      for (const key of Object.keys(defaultState().gear)) S.gear[key] = Math.max(0, Math.min(3, Number.isInteger(S.gear[key]) ? S.gear[key] : 0));
      for (const bag of ['collection','cargo']) for (const key of Object.keys(defaultState()[bag])) S[bag][key] = Math.max(0, Math.min(99999, Number.isInteger(S[bag][key]) ? S[bag][key] : 0));
      if (!['free','missions','expedition','treasure','rescue','abyss'].includes(S.mode)) S.mode = 'missions';
      if (!Number.isFinite(S.eventSeq) || S.eventSeq < 0) S.eventSeq = 0;
      if (!Number.isFinite(S.eventCooldown)) S.eventCooldown = 75;
      if (S.event && (!['container','rare','signal','cave','treasure','rescue','current'].includes(S.event.kind) || !Array.isArray(S.event.pos) || S.event.pos.length !== 3 || !S.event.pos.every(Number.isFinite) || !Number.isFinite(S.event.remaining))) S.event = null;
      if (S.run && (!['free','missions','expedition','treasure','rescue','abyss'].includes(S.run.id) || !Number.isFinite(S.run.progress) || !Number.isFinite(S.run.target) || S.run.target<1 || !Number.isFinite(S.run.remaining))) S.run = null;
      if (S.diveState) {
        const d = S.diveState;
        if (!Number.isFinite(d.o2) || !Number.isFinite(d.hp)) S.diveState = null;
        else S.diveState = { o2: Math.max(0, d.o2), hp: Math.max(0, d.hp),
          yaw: Number.isFinite(d.yaw) ? d.yaw : 0,
          pitch: Number.isFinite(d.pitch) ? Math.max(-1.2, Math.min(1.3, d.pitch)) : 0.22,
          flashOn: d.flashOn === true };
      }
      if (S.waypoint) {
        const p = S.waypoint.pos;
        if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite) ||
            Math.abs(p[0]) > 108 || p[1] > 0 || p[1] < -300 || p[2] < -1000 || p[2] > 55) S.waypoint = null;
        else S.waypoint = { pos: p.slice(), kind: S.waypoint.kind === 'base' ? 'base' : 'custom' };
      }
    } catch (e) {
      console.warn('Сохранение повреждено, начинаем заново', e);
      S = defaultState();
    }
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      SETTINGS = raw ? this.merge(defaultSettings(), JSON.parse(raw)) : defaultSettings();
    } catch (e) {
      SETTINGS = defaultSettings();
    }
    if (S.level < 1 || !Number.isInteger(S.level)) S.level = 1;
    if (!Number.isFinite(S.xp) || S.xp < 0) S.xp = 0;
    if (!isFinite(S.coins) || S.coins < 0) S.coins = 0;
    // One-time boost requested for the current playthrough. New games still
    // start at level 1; resetting progress does not repeat this promotion.
    try {
      const boostKey = 'aquaworld_level6_once_20261027';
      if (!localStorage.getItem(boostKey)) {
        S.level = Math.max(6, S.level);
        localStorage.setItem(SAVE_KEY, JSON.stringify(S));
        localStorage.setItem(boostKey, '1');
      }
    } catch (e) { /* Continue playing if browser storage is unavailable. */ }
  },

  save() {
    try {
      if (typeof Player !== 'undefined' && Player.obj && typeof Game !== 'undefined' && Game.mode === 'play') {
        S.atBase = Game.atBase;
        S.expedition = Game.expedition;
        S.diveState = { o2: Game.o2, hp: Game.hp, yaw: Player.yaw,
          pitch: Player.pitch, flashOn: Player.flashOn };
        const p = Player.obj.position;
        S.pos = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
      return true;
    } catch (e) {
      console.error('Не удалось сохранить игру', e);
      return false;
    }
  },

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) { /* приватный режим */ }
  },

  has() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return !!raw && JSON.parse(raw).started === true;
    } catch (e) { return false; }
  },

  reset() {
    S = defaultState();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ничего */ }
  },
};
