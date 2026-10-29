'use strict';
// ============================================================
//  AQUA WORLD: Тайны глубин — игровые данные
//  Зоны, снаряжение, улучшения базы, животные, задания, объекты
// ============================================================

// 1 единица высоты в 3D-мире = 5 метров глубины
const DEPTH_SCALE = 5;
const toDepth = y => Math.max(0, -y * DEPTH_SCALE);

// ---------- Зоны океана ----------
// z — диапазон по оси Z (мир уходит вдоль -Z от базы к бездне)
const ZONES = [
  { id: 'reef', name: 'Солнечный риф', min: 0, max: 50, z: [60, -180], color: '#4fd8ff', reward: 0,
    desc: 'Тёплое мелководье, полное кораллов, черепах и ярких рыб.', req: {} },
  { id: 'kelp', name: 'Лес водорослей', min: 50, max: 150, z: [-180, -380], color: '#5fe0a0', reward: 150,
    desc: 'Гигантские водоросли тянутся к солнцу. Здесь живут дельфины и скаты.',
    req: { item: 'scuba', quest: 'story1' } },
  { id: 'wreck', name: 'Кладбище затонувших кораблей', min: 150, max: 400, z: [-380, -580], color: '#d6b26a', reward: 300,
    desc: 'Остовы старинных кораблей хранят сокровища и тайны прошлых экспедиций.',
    req: { upgrade: 'barochamber', quest: 'story2' } },
  { id: 'caves', name: 'Светящиеся пещеры', min: 400, max: 1000, z: [-580, -800], color: '#b77dff', reward: 500,
    desc: 'Каньон, освещённый кристаллами и светящимися грибами.',
    req: { item: 'deepsuit', quest: 'story3' } },
  { id: 'abyss', name: 'Бездна', min: 1000, max: Infinity, z: [-800, -1010], color: '#ff5f7a', reward: 1000,
    desc: 'Вечная тьма, чудовищное давление и источник загадочного сигнала.',
    req: { item: 'sub', quest: 'story4' } },
];

// Области обитания животных (x: ±95)
const REGIONS = {
  reef: { z: [40, -170], yTop: -1.5 },
  kelp: { z: [-190, -370], yTop: -2.5 },
  wreck: { z: [-400, -560], yTop: -34 },
  caves: { z: [-605, -775], yTop: -86 },
  abyss: { z: [-825, -1000], yTop: -205 },
};

// ---------- Снаряжение (магазин) ----------
const ITEMS = [
  { id: 'scuba', name: 'Улучшенный акваланг', price: 300, level: 1,
    desc: 'Композитный баллон высокого давления.', effect: 'Кислород 120 → 220. Открывает погружение до 150 м.' },
  { id: 'flashlight', name: 'Подводный фонарь', price: 200, level: 1,
    desc: 'Светодиодный фонарь на 3000 люмен.', effect: 'Мощный луч (клавиша F). Нужен в пещерах и бездне.' },
  { id: 'knife', name: 'Нож спасателя', price: 150, level: 1,
    desc: 'Титановый нож с серрейтором для сетей и тросов.', effect: 'Позволяет освобождать животных из сетей и верёвок.' },
  { id: 'camera', name: 'Подводная камера', price: 250, level: 1,
    desc: 'Камера в герметичном боксе.', effect: 'Фотографирование существ (E рядом с животным). Монеты за снимки.' },
  { id: 'fins', name: 'Улучшенные ласты', price: 350, level: 2,
    desc: 'Карбоновые ласты с каналами.', effect: 'Скорость плавания +45%.' },
  { id: 'scanner', name: 'Сканер морских животных', price: 450, level: 2,
    desc: 'Гидроакустический сканер с базой видов.', effect: 'Радиус обнаружения ×2.5. Распознаёт эпических и легендарных существ.' },
  { id: 'detector', name: 'Металлоискатель', price: 600, level: 3,
    desc: 'Импульсный детектор для работы под водой.', effect: 'Показывает закопанные сокровища и сигнал на экране.' },
  { id: 'drone', name: 'Исследовательский дрон', price: 1500, level: 4,
    desc: 'Автономный помощник с манипулятором.', effect: 'Сам подбирает предметы в радиусе 12 м.' },
  { id: 'deepsuit', name: 'Глубоководный костюм', price: 3000, level: 5, requires: 'scuba',
    desc: 'Жёсткий скафандр с компенсацией давления.', effect: 'Погружение до 1000 м, здоровье +50, кислород 320, урон −50%.' },
  { id: 'sub', name: 'Мини-субмарина', price: 5000, level: 6, requires: 'deepsuit',
    desc: 'Одноместный батискаф с прожекторами.', effect: 'Без ограничения глубины, скорость ×2.2, кислород 600.' },
];

// ---------- Улучшения базы ----------
const UPGRADES = [
  { id: 'quarters', name: 'Жилой модуль', icon: '🛏️', price: 400, level: 1,
    effect: 'Максимальное здоровье +25.' },
  { id: 'compressor', name: 'Кислородный компрессор', icon: '🫧', price: 600, level: 2,
    effect: 'Ёмкость кислорода +30%.' },
  { id: 'barochamber', name: 'Барокамера', icon: '🧪', price: 800, level: 3, requiresItem: 'scuba',
    effect: 'Декомпрессия после глубоких погружений. Открывает погружение до 400 м.' },
  { id: 'vet', name: 'Ветеринарный блок', icon: '🩺', price: 1200, level: 3,
    effect: 'Награды за спасение животных +50%.' },
  { id: 'sonar', name: 'Сонарная рубка', icon: '📡', price: 1000, level: 4,
    effect: 'Показывает на карте сокровища, кислородные станции и ресурсы.' },
];

const RARITY = {
  common: { name: 'Обычный', color: '#9fd8ff', coins: 15, xp: 10, photo: 10 },
  rare: { name: 'Редкий', color: '#4f9dff', coins: 40, xp: 25, photo: 30 },
  epic: { name: 'Эпический', color: '#c06bff', coins: 100, xp: 60, photo: 80 },
  legendary: { name: 'Легендарный', color: '#ffc83a', coins: 300, xp: 150, photo: 250 },
};

// ---------- Морские животные ----------
const SPECIES = [
  { id: 'clownfish', name: 'Рыба-клоун', rarity: 'common', zone: 'reef', depth: '5–40 м', count: 14, school: 7,
    desc: 'Яркая рыбка, живущая среди актиний. Слизь на чешуе защищает её от стрекательных клеток.',
    model: { type: 'fish', color: 0xff7a1a, color2: 0xffffff, stripes: [0.22, -0.12], size: 0.45 } },
  { id: 'surgeon', name: 'Голубой хирург', rarity: 'common', zone: 'reef', depth: '2–40 м', count: 12, school: 6,
    desc: 'У основания хвоста у неё острые «скальпели», которыми она защищается.',
    model: { type: 'fish', color: 0x2a6bff, color2: 0xffd21a, tall: 0.8, size: 0.55 } },
  { id: 'angelfish', name: 'Рыба-ангел', rarity: 'common', zone: 'reef', depth: '3–50 м', count: 8, school: 4,
    desc: 'Высокое плоское тело позволяет ей ловко скользить между кораллами.',
    model: { type: 'fish', color: 0xffe23a, color2: 0x1a1a2a, stripes: [0.05], tall: 1.25, size: 0.6 } },
  { id: 'parrotfish', name: 'Рыба-попугай', rarity: 'rare', zone: 'reef', depth: '3–30 м', count: 4,
    desc: 'Грызёт кораллы мощным «клювом» и превращает их в белоснежный песок.',
    model: { type: 'fish', color: 0x2fd39a, color2: 0xff6fb5, size: 1.0, tall: 0.75 } },
  { id: 'turtle', name: 'Зелёная черепаха', rarity: 'rare', zone: 'reef', depth: '1–40 м', count: 3,
    desc: 'Может жить больше 80 лет и проплывать тысячи километров к местам гнездования.',
    model: { type: 'turtle', color: 0x7f9a4f, shell: 0x6b5232, size: 1.4 } },
  { id: 'goldturtle', name: 'Золотая черепаха', rarity: 'legendary', zone: 'reef', depth: '10–45 м', count: 1,
    desc: 'Легенда рыбаков: черепаха с панцирем, сияющим как солнце. Видели её единицы.',
    model: { type: 'turtle', color: 0xd9c27a, shell: 0xffc83a, glow: true, size: 1.7 } },
  { id: 'seahorse', name: 'Морской конёк', rarity: 'common', zone: 'kelp', depth: '50–120 м', count: 6,
    desc: 'Плавает вертикально и цепляется хвостом за водоросли. Потомство вынашивают самцы.',
    model: { type: 'seahorse', color: 0xffb347, size: 0.7 } },
  { id: 'dolphin', name: 'Афалина', rarity: 'rare', zone: 'kelp', depth: '0–80 м', count: 5,
    desc: 'Умный и общительный дельфин. Общается свистами и щелчками, живёт стаями.',
    model: { type: 'dolphin', color: 0x8a9bb0, size: 2.4 } },
  { id: 'manta', name: 'Скат-манта', rarity: 'rare', zone: 'kelp', depth: '20–140 м', count: 2,
    desc: 'Размах «крыльев» до 7 метров. Питается планктоном и очень любопытна.',
    model: { type: 'ray', color: 0x2b3a4f, size: 3 } },
  { id: 'moonjelly', name: 'Лунная медуза', rarity: 'rare', zone: 'kelp', depth: '50–150 м', count: 5,
    desc: 'Полупрозрачный купол мягко светится в полумраке водорослевого леса.',
    model: { type: 'jelly', color: 0xd9b8ff, size: 1.0 } },
  { id: 'moray', name: 'Зелёная мурена', rarity: 'common', zone: 'wreck', depth: '150–300 м', count: 5,
    desc: 'Прячется в обломках кораблей и выжидает добычу, открывая и закрывая пасть.',
    model: { type: 'eel', color: 0x4f7a2a, size: 2 } },
  { id: 'barracuda', name: 'Барракуда', rarity: 'rare', zone: 'wreck', depth: '150–350 м', count: 6, school: 6,
    desc: 'Стремительный хищник с острыми зубами. Развивает скорость до 40 км/ч.',
    model: { type: 'fish', color: 0xb8c4cc, color2: 0x55606a, long: 2.4, tall: 0.45, size: 1.3 } },
  { id: 'octopus', name: 'Обыкновенный осьминог', rarity: 'common', zone: 'wreck', depth: '150–400 м', count: 2,
    desc: 'Три сердца, голубая кровь и умение открывать банки изнутри.',
    model: { type: 'octopus', color: 0xc0573a, size: 1 } },
  { id: 'hammerhead', name: 'Акула-молот', rarity: 'epic', zone: 'wreck', depth: '150–400 м', count: 2,
    desc: 'Широкая голова работает как радар: акула чувствует электрические поля добычи.',
    model: { type: 'shark', color: 0x6f7f8f, size: 4 } },
  { id: 'fireflysquid', name: 'Кальмар-светлячок', rarity: 'common', zone: 'caves', depth: '400–900 м', count: 10, school: 5,
    desc: 'Тысячи светящихся точек на теле помогают маскироваться и общаться.',
    model: { type: 'squid', color: 0x3fa9ff, glow: true, size: 0.7 } },
  { id: 'neonjelly', name: 'Неоновая медуза', rarity: 'rare', zone: 'caves', depth: '400–1000 м', count: 8,
    desc: 'Светится бирюзовым светом. Её стрекательные клетки обжигают — держитесь подальше!',
    model: { type: 'jelly', color: 0x2affe0, size: 1.2 } },
  { id: 'mimic', name: 'Осьминог-мимик', rarity: 'epic', zone: 'caves', depth: '400–1000 м', count: 2,
    desc: 'Мастер маскировки: умеет изображать ядовитых рыб, змей и медуз.',
    model: { type: 'octopus', color: 0xf3e3c3, glow: true, size: 1.3 } },
  { id: 'lanternfish', name: 'Рыба-фонарь', rarity: 'common', zone: 'abyss', depth: '1000–1500 м', count: 12, school: 6,
    desc: 'Светящиеся органы-фотофоры позволяют находить сородичей в абсолютной тьме.',
    model: { type: 'fish', color: 0x1d2a44, color2: 0x7fd8ff, glowSpots: true, size: 0.5 } },
  { id: 'angler', name: 'Удильщик', rarity: 'rare', zone: 'abyss', depth: '1000–1500 м', count: 6, hostile: true,
    desc: 'Приманивает добычу светящейся «удочкой». Агрессивен — может укусить!',
    model: { type: 'angler', color: 0x241b2e, size: 1.6 } },
  { id: 'giantsquid', name: 'Гигантский кальмар', rarity: 'epic', zone: 'abyss', depth: '1000–1500 м', count: 1,
    desc: 'Глаза размером с футбольный мяч — самые большие в животном мире.',
    model: { type: 'squid', color: 0xb83a3a, size: 6 } },
  { id: 'leviathan', name: 'Левиафан глубин', rarity: 'legendary', zone: 'abyss', depth: '1100–1500 м', count: 1,
    desc: 'Огромное светящееся существо, о котором ходили только легенды. Хранитель древнего сооружения.',
    model: { type: 'whale', color: 0x0d1b3a, glowColor: 0x40e0ff, size: 14 } },
];

// ---------- Задания ----------
// Типы этапов: objects (взаимодействие E), pickups (подобрать), reach (доплыть),
// escort (отвести животное), photo (сфотографировать вид), discover (открыть N видов)
const DR = 'Доктор Марина Волкова';
const QUESTS = [
  { id: 'story1', story: true, title: 'Сигнал из глубин', level: 1, requires: [],
    desc: 'Гидрофоны станции поймали загадочный сигнал. Зонд, отправленный к рифу, пропал. Найдите его и доставьте данные на базу.',
    startText: 'Наш зонд-разведчик замолчал где-то на Солнечном рифе, к востоку от базы. В его памяти — запись сигнала. Найди зонд и привези его на станцию.',
    doneText: 'Невероятно! Запись зонда показывает: сигнал повторяет узор древней карты, которую когда-то разбили на три фрагмента. Первый, судя по легендам, спрятан в Лесу водорослей. Купи улучшенный акваланг — без него туда не добраться.',
    stages: [
      { type: 'objects', group: 'probe', text: 'Найдите пропавший зонд на Солнечном рифе' },
      { type: 'reach', poi: 'base', radius: 14, text: 'Доставьте зонд на исследовательскую базу' },
    ], reward: { coins: 250, xp: 120 } },

  { id: 'story2', story: true, title: 'Первый фрагмент карты', level: 2, requires: ['story1'],
    hint: 'Нужен «Улучшенный акваланг» для зоны 50–150 м.',
    desc: 'Соберите образцы кристальной водоросли — они реагируют на сигнал — и найдите каменный алтарь в Лесу водорослей.',
    startText: 'Кристальные водоросли резонируют с сигналом. Собери три образца — они укажут путь к древнему алтарю в самом сердце Леса водорослей.',
    doneText: 'Первый фрагмент у нас! На нём изображён корабль — «Святая Анна», пропавшая в 1890 году. Её остов лежит на Кладбище кораблей, на глубине почти 400 метров. Для таких погружений базе нужна барокамера.',
    stages: [
      { type: 'pickups', group: 'crystal', text: 'Соберите образцы кристальной водоросли' },
      { type: 'objects', group: 'frag1', text: 'Заберите фрагмент карты с древнего алтаря' },
    ], reward: { coins: 500, xp: 220 } },

  { id: 'story3', story: true, title: 'Корабль-призрак', level: 3, requires: ['story2'],
    hint: 'Нужна «Барокамера» (улучшение базы) для зоны 150–400 м.',
    desc: 'Найдите затонувший корабль «Святая Анна», прочитайте судовой журнал и откройте сундук капитана.',
    startText: '«Святая Анна» — экспедиционное судно профессора Лаврова. Он искал «Город Света» на дне океана. Найди корабль — его журнал может многое объяснить.',
    doneText: 'Журнал Лаврова подтверждает: под океаном есть древнее сооружение, и оно «зовёт». Третий фрагмент карты спрятан в Светящихся пещерах. Это глубже 400 метров — понадобится глубоководный костюм.',
    stages: [
      { type: 'reach', poi: 'annaWreck', radius: 16, text: 'Найдите затонувший корабль «Святая Анна»' },
      { type: 'objects', group: 'annaLog', text: 'Прочитайте судовой журнал в рубке' },
      { type: 'objects', group: 'frag2', text: 'Откройте сундук капитана в корме' },
    ], reward: { coins: 900, xp: 350 } },

  { id: 'story4', story: true, title: 'Огни пещер', level: 5, requires: ['story3'],
    hint: 'Нужен «Глубоководный костюм» для зоны 400–1000 м.',
    desc: 'Установите три навигационных маяка в Светящихся пещерах и найдите последний фрагмент карты.',
    startText: 'Пещеры — настоящий лабиринт. Установи три маяка, чтобы сонар базы смог построить карту, — и мы найдём последний фрагмент.',
    doneText: 'Карта собрана! Она указывает на сооружение в самой Бездне — сигнал идёт оттуда. Давление там такое, что выдержит только мини-субмарина. Это будет главная экспедиция в истории станции.',
    stages: [
      { type: 'objects', group: 'beacon', text: 'Установите навигационные маяки в пещерах' },
      { type: 'objects', group: 'frag3', text: 'Заберите последний фрагмент карты в Кристальном гроте' },
    ], reward: { coins: 1500, xp: 600 } },

  { id: 'story5', story: true, title: 'Тайна бездны', level: 6, requires: ['story4'],
    hint: 'Нужна «Мини-субмарина» для глубины больше 1000 м.',
    desc: 'Найдите источник сигнала в Бездне и пройдите три древних испытания.',
    startText: 'Это оно. Древний храм, построенный задолго до людей. Будь осторожен: испытания света, стражей и пути. Мы будем на связи.',
    doneText: 'Сигнал стих… и океан словно вздохнул. Ты сделал невозможное.',
    stages: [
      { type: 'reach', poi: 'temple', radius: 30, text: 'Найдите источник сигнала в Бездне' },
      { type: 'objects', group: 'pillarLight', text: 'Испытание света: осветите первый столп фонарём' },
      { type: 'objects', group: 'pillarGuard', text: 'Испытание стражей: удержите второй столп, пока атакуют стражи' },
      { type: 'pickups', group: 'orb', text: 'Испытание пути: соберите сферы энергии у горячих источников' },
      { type: 'objects', group: 'core', text: 'Активируйте Сердце океана в центре храма' },
    ], reward: { coins: 3000, xp: 1500 } },

  // ----- Побочные задания -----
  { id: 'side_turtle', title: 'Черепаха в сетях', level: 1, requires: [], rescue: true,
    desc: 'Зелёная черепаха запуталась в старой рыболовной сети к западу от базы. Освободите её!',
    startText: 'Мы засекли черепаху, запутавшуюся в брошенной сети. Возьми нож спасателя и освободи её — каждая минута на счету!',
    doneText: 'Черепаха свободна и уплыла! Спасибо — именно ради этого мы здесь работаем.',
    stages: [{ type: 'objects', group: 'turtleNet', text: 'Освободите черепаху из сети (нужен нож)' }],
    reward: { coins: 150, xp: 80 } },
  { id: 'side_trash', title: 'Чистый риф', level: 1, requires: [],
    desc: 'Течения принесли на риф мусор. Соберите его, пока он не навредил животным.',
    startText: 'Риф засыпан мусором: бутылки, банки, пакеты. Собери хотя бы восемь предметов.',
    doneText: 'Риф снова чистый! Рыбы тебе благодарны.',
    stages: [{ type: 'pickups', group: 'trash', count: 8, text: 'Соберите мусор на рифе' }],
    reward: { coins: 150, xp: 70 } },
  { id: 'side_census', title: 'Перепись рифа', level: 1, requires: [],
    desc: 'Найдите и занесите в энциклопедию 6 видов морских существ.',
    startText: 'Нашей базе данных нужны свежие наблюдения. Найди 6 разных видов — подплыви ближе, и они попадут в энциклопедию.',
    doneText: 'Отличная работа, натуралист!',
    stages: [{ type: 'discover', count: 6, text: 'Откройте виды существ' }],
    reward: { coins: 200, xp: 90 } },
  { id: 'side_dolphin', title: 'Потерявшийся дельфинёнок', level: 2, requires: ['story1'], rescue: true,
    desc: 'Детёныш афалины отбился от стаи в Лесу водорослей. Найдите его и отведите к своим.',
    startText: 'Гидрофоны слышат одинокий свист детёныша дельфина на востоке Леса водорослей. Его стая — на западе. Помоги им встретиться!',
    doneText: 'Дельфинёнок снова со стаей! Слышишь, как они радостно свистят?',
    stages: [
      { type: 'objects', group: 'calf', text: 'Найдите дельфинёнка в Лесу водорослей' },
      { type: 'escort', text: 'Отведите дельфинёнка к стае на западе леса' },
    ], reward: { coins: 250, xp: 130 } },
  { id: 'side_jelly', title: 'Лунный свет', level: 2, requires: ['story1'],
    desc: 'Сфотографируйте редкую лунную медузу в Лесу водорослей.',
    startText: 'Лунные медузы светятся только в Лесу водорослей. Сделай снимок для научного журнала — понадобится подводная камера.',
    doneText: 'Потрясающий снимок! Его напечатают на обложке.',
    stages: [{ type: 'photo', species: 'moonjelly', text: 'Сфотографируйте лунную медузу (нужна камера)' }],
    reward: { coins: 250, xp: 120 } },
  { id: 'side_manta', title: 'Скат в ловушке', level: 3, requires: ['story1'], rescue: true,
    desc: 'Скат-манта запутался в обрывках верёвок. Перережьте все три троса.',
    startText: 'Манта опутана тросами от старого буя. Перережь все три верёвки — осторожно, она напугана.',
    doneText: 'Манта взмахнула крыльями и улетела в синеву. Красота!',
    stages: [{ type: 'objects', group: 'mantaRope', text: 'Перережьте верёвки, опутавшие ската (нужен нож)' }],
    reward: { coins: 350, xp: 160 } },
  { id: 'side_wreck', title: 'Тайна «Авроры»', level: 3, requires: ['story2'],
    desc: 'Исследуйте затонувший корабль «Аврора»: нос, палубу и трюм.',
    startText: 'Рядом со «Святой Анной» лежит торговое судно «Аврора». Осмотри нос, палубу и трюм — вдруг найдёшь что-то ценное.',
    doneText: '«Аврора» везла приборы для экспедиции Лаврова. Всё сходится!',
    stages: [{ type: 'objects', group: 'auroraLog', text: 'Исследуйте нос, палубу и трюм «Авроры»' }],
    reward: { coins: 450, xp: 200 } },
  { id: 'side_octopus', title: 'Пленник кувшина', level: 3, requires: ['story2'], rescue: true,
    desc: 'Осьминог застрял в старинном кувшине. В темноте освободить его можно только с включённым фонарём.',
    startText: 'Осьминог залез в амфору и не может выбраться. Включи фонарь и аккуратно помоги ему.',
    doneText: 'Осьминог выбрался и, кажется, помахал тебе щупальцем!',
    stages: [{ type: 'objects', group: 'octoJar', text: 'Освободите осьминога из кувшина (нужен включённый фонарь)' }],
    reward: { coins: 300, xp: 150 } },
  { id: 'side_treasure', title: 'Пиратский клад', level: 4, requires: ['story2'],
    desc: 'По слухам, на Кладбище кораблей закопаны три сундука. Найдите их металлоискателем.',
    startText: 'Старые карты говорят о трёх сундуках, зарытых в песок у затонувших кораблей. Без металлоискателя их не найти.',
    doneText: 'Три сундука! Часть находок передадим в музей, а награда — твоя.',
    stages: [{ type: 'objects', group: 'treasure', text: 'Откопайте сундуки (нужен металлоискатель)' }],
    reward: { coins: 900, xp: 300 } },
  { id: 'side_goldturtle', title: 'Золотая легенда', level: 4, requires: ['story1'],
    desc: 'Сфотографируйте легендарную золотую черепаху на Солнечном рифе.',
    startText: 'Рыбаки снова видели золотую черепаху на рифе! Сканер поможет её распознать, а камера — доказать, что она существует.',
    doneText: 'Это правда! Золотая черепаха существует!',
    stages: [{ type: 'photo', species: 'goldturtle', text: 'Сфотографируйте золотую черепаху' }],
    reward: { coins: 800, xp: 400 } },
  { id: 'side_glow', title: 'Светящиеся образцы', level: 5, requires: ['story3'],
    desc: 'Соберите 4 светящихся гриба в пещерах для лаборатории.',
    startText: 'Светящиеся грибы пещер могут стать основой нового лекарства. Принеси четыре образца.',
    doneText: 'Образцы в лаборатории. Это прорыв!',
    stages: [{ type: 'pickups', group: 'glowshroom', count: 4, text: 'Соберите светящиеся грибы' }],
    reward: { coins: 500, xp: 250 } },
  { id: 'side_census2', title: 'Великий натуралист', level: 5, requires: ['side_census'],
    desc: 'Откройте 15 видов морских существ.',
    startText: 'Твоя энциклопедия впечатляет. Доведи её до 15 видов!',
    doneText: 'Ты — настоящий натуралист!',
    stages: [{ type: 'discover', count: 15, text: 'Откройте виды существ' }],
    reward: { coins: 600, xp: 300 } },
  { id: 'side_legend', title: 'Легенда бездны', level: 7, requires: ['story4'],
    desc: 'Сфотографируйте Левиафана глубин — легендарного хранителя Бездны.',
    startText: 'Говорят, в Бездне обитает Левиафан. Если он существует — сфотографируй его.',
    doneText: 'Левиафан… он реален. Мир никогда не будет прежним.',
    stages: [{ type: 'photo', species: 'leviathan', text: 'Сфотографируйте Левиафана глубин' }],
    reward: { coins: 1500, xp: 700 } },
];

// ---------- Объекты заданий и ресурсы ----------
// at: [x, z, высота над дном]; abs: [x, y, z]; poi: точка, которую создаёт World
const OBJECTS = [
  { id: 'probe', group: 'probe', at: [38, -95, 0.8], model: 'probe', label: 'Забрать зонд', hold: 2, quest: 'story1', stageOnly: true },
  { id: 'turtleNet', group: 'turtleNet', at: [-42, -62, 1.6], model: 'net', label: 'Разрезать сеть', hold: 3, tool: 'knife', quest: 'side_turtle', rescue: 'questTurtle' },
  ...[[12, -20], [-18, -35], [30, -60], [-55, -85], [5, -110], [60, -120], [-25, -140], [45, -30], [-60, -20], [20, -150]]
    .map((p, i) => ({ id: 'trash' + i, group: 'trash', at: [p[0], p[1], 0.3], model: 'trash', kind: 'pickup', quest: 'side_trash', coins: 5, res: 'trash' })),
  ...[[-52, -222], [44, -282], [-12, -342]]
    .map((p, i) => ({ id: 'crystal' + i, group: 'crystal', at: [p[0], p[1], 0.2], model: 'crystal', kind: 'pickup', quest: 'story2', stageOnly: true, res: 'sample' })),
  { id: 'frag1', group: 'frag1', poi: 'altar', model: 'fragment', label: 'Забрать фрагмент карты', hold: 2, quest: 'story2', stageOnly: true, res: 'fragment' },
  { id: 'calf', group: 'calf', abs: [62, -14, -240], label: 'Позвать дельфинёнка за собой', hold: 1, quest: 'side_dolphin', radius: 5 },
  ...[[2.4, 0, 0], [-2.4, 0, 0], [0, 1.2, 1.6]]
    .map((o, i) => ({ id: 'mantaRope' + i, group: 'mantaRope', at: [-60 + o[0], -268 + o[2], 3 + o[1]], model: 'rope', label: 'Перерезать трос', hold: 2, tool: 'knife', quest: 'side_manta', rescue: 'questManta' })),
  { id: 'annaLog', group: 'annaLog', poi: 'annaLog', model: 'logbook', label: 'Прочитать журнал', hold: 2, quest: 'story3', stageOnly: true },
  { id: 'frag2', group: 'frag2', poi: 'annaChest', model: 'chest', label: 'Открыть сундук капитана', hold: 3, quest: 'story3', stageOnly: true, res: 'fragment' },
  ...[0, 1, 2].map(i => ({ id: 'aurora' + i, group: 'auroraLog', poi: 'aurora' + i, model: 'logbook', label: ['Осмотреть нос', 'Осмотреть палубу', 'Осмотреть трюм'][i], hold: 2, quest: 'side_wreck', res: 'artifact' })),
  { id: 'octoJar', group: 'octoJar', at: [38, -455, 0.7], model: 'jar', label: 'Освободить осьминога', hold: 4, cond: 'light', quest: 'side_octopus', rescue: 'questOcto' },
  ...[[-72, -448], [82, -438], [18, -548]]
    .map((p, i) => ({ id: 'treasure' + i, group: 'treasure', at: [p[0], p[1], 0.1], model: 'chest', label: 'Откопать сундук', hold: 2, tool: 'detector', needDetector: true, quest: 'side_treasure', coins: 60, res: 'artifact' })),
  ...[[-42, -630], [32, -700], [-22, -760]]
    .map((p, i) => ({ id: 'beacon' + i, group: 'beacon', at: [p[0], p[1], 0.2], model: 'beaconSpot', label: 'Установить маяк', hold: 2, quest: 'story4', stageOnly: true })),
  { id: 'frag3', group: 'frag3', at: [0, -745, 1.6], model: 'fragment', label: 'Забрать последний фрагмент', hold: 2, quest: 'story4', stageOnly: true, res: 'fragment' },
  ...[[-30, -615], [45, -650], [-55, -690], [10, -720], [50, -750], [-10, -772]]
    .map((p, i) => ({ id: 'glow' + i, group: 'glowshroom', at: [p[0], p[1], 0.1], model: 'glowshroom', kind: 'pickup', quest: 'side_glow', res: 'glow' })),
  { id: 'pillarLight', group: 'pillarLight', poi: 'pillar0', label: 'Осветить столп', hold: 3, cond: 'light', quest: 'story5', stageOnly: true, radius: 6 },
  { id: 'pillarGuard', group: 'pillarGuard', poi: 'pillar1', label: 'Удерживать столп', hold: 6, quest: 'story5', stageOnly: true, radius: 6 },
  ...[0, 1, 2].map(i => ({ id: 'orb' + i, group: 'orb', poi: 'orb' + i, model: 'orb', kind: 'pickup', quest: 'story5', stageOnly: true })),
  { id: 'core', group: 'core', poi: 'core', label: 'Активировать Сердце океана', hold: 3, quest: 'story5', stageOnly: true, radius: 7 },
];

// Точки погружения (выбираются на базе)
const DIVE_POINTS = [
  { id: 'base', name: 'Станция «Аква-1»', zone: 'reef', pos: [0, -3, 10] },
  { id: 'kelp', name: 'Буй «Лес водорослей»', zone: 'kelp', pos: [0, -12, -215] },
  { id: 'wreck', name: 'Буй «Кладбище кораблей»', zone: 'wreck', pos: [0, -36, -405] },
  { id: 'caves', name: 'Буй «Светящиеся пещеры»', zone: 'caves', pos: [0, -90, -610] },
  { id: 'abyss', name: 'Буй «Бездна»', zone: 'abyss', pos: [0, -205, -830] },
];

const STORY_INTRO = 'Добро пожаловать на исследовательскую станцию «Аква-1»! Я доктор Марина Волкова, руководитель экспедиции.\n\nТри дня назад наши гидрофоны поймали странный сигнал из самой глубокой части океана — ритмичный, как сердцебиение. Никто не знает, что это.\n\nНачнём с малого: изучай риф, спасай животных, зарабатывай на снаряжение. Задания — на доске в меню базы. Удачного погружения!';

const STORY_ENDING = 'Сердце океана вспыхнуло, и древний храм ожил. Тысячи светящихся существ поднялись из расщелин и закружились вокруг тебя.\n\nСигнал оказался не угрозой, а зовом: сооружение — древний «маяк жизни», который веками поддерживал равновесие океана. Загрязнение и шум ослабили его, и он звал на помощь.\n\nТеперь маяк снова работает, а ты — первый человек, раскрывший тайну глубин.\n\nНо океан огромен: в нём ещё много редких существ, сокровищ и животных, которым нужна помощь. Исследование продолжается!';

const xpForLevel = lvl => 120 + (lvl - 1) * 90;
