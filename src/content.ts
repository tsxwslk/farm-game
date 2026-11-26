export type Point = [number, number];

export const ITEMS = {
  seeds: '樱桃萝卜种子',
  radish: '樱桃萝卜',
  rockSalt: '岩盐',
  salt: '粗盐',
  pickle: '盐渍樱桃萝卜',
  wood: '木材',
  stone: '石材',
  clay: '黏土',
  crock: '腌菜缸',
  kiln: '盐灶',
  crucian: '鲫鱼',
  fishSoup: '鲫鱼汤',
  pakChoiSeeds: '小白菜种子',
  pakChoi: '小白菜',
  pakChoiPickle: '盐渍小白菜',
  mustardTrace: '芥菜余绪',
  mustardSeeds: '芥菜种子',
  mustard: '芥菜',
  mustardPickle: '盐渍芥菜',
} as const;
export type Item = keyof typeof ITEMS;

export const TOOLS = {
  hoe: { name: '锄头' },
  pick: { name: '石镐' },
  can: { name: '水壶' },
  rod: { name: '钓竿' },
  axe: { name: '斧子' },
} as const;
export type Tool = keyof typeof TOOLS;

export const INVENTORY_INFO = {
  hoe: ['农具', '在空闲草地开垦菜畦，也能挖取河岸的黏土。'],
  pick: ['农具', '敲碎石块采集石材和岩盐，也能把空耕地恢复成草地。'],
  can: ['农具', '从河边装水，给播好的菜畦浇水。'],
  rod: ['农具', '在河岸抛竿。水面泛起涟漪的地方更容易咬钩。'],
  axe: ['农具', '砍柳树、橡树或清理树桩，取得木材。'],
  seeds: ['种子', '播在翻好的菜畦里，浇水后开始发芽。'],
  radish: ['作物', '可以留种、卖给田记所，或和粗盐一起腌制。'],
  rockSalt: ['矿物', '带灰白纹的盐矿，可在盐灶熬成一批粗盐。'],
  salt: ['加工材料', '由岩盐熬制，可用于腌萝卜和炖鲫鱼汤。'],
  pickle: ['加工品', '用粗盐腌成的樱桃萝卜，可卖给田记所。'],
  wood: ['建材', '从树木和树桩取得，用于搭建盐灶和烧制腌菜缸。'],
  stone: ['建材', '从普通岩石取得，可用来搭建盐灶。'],
  clay: ['建材', '河岸挖出的细土，可在盐灶烧制成腌菜缸。'],
  crock: ['设施', '摆在可达的空地上，可用粗盐腌制樱桃萝卜。'],
  kiln: ['设施', '摆在可达的空地上，可制盐、烧缸和炖鱼汤。'],
  crucian: ['鱼获', '从柳湾河钓得，可加粗盐炖汤，也可卖给田记所。'],
  fishSoup: ['加工品', '鲫鱼加粗盐炖成的汤，可卖给田记所。'],
  pakChoiSeeds: ['种子', '第一卷归档后可在田记所买入或领种，在翻好的菜畦里播种。'],
  pakChoi: ['作物', '可留种，也可加粗盐腌制。'],
  pakChoiPickle: ['加工品', '田记所用它试备山道行粮。'],
  mustardTrace: ['余绪', '从旧制盐台西侧采得，带回田记所可复原芥菜种子。'],
  mustardSeeds: ['种子', '在田记所复原所得，可在翻好的菜畦里播种。'],
  mustard: ['作物', '可留种，也可加入粗盐制成盐渍芥菜。'],
  mustardPickle: ['加工品', '以芥菜和粗盐腌成的咸菜。'],
} as const satisfies Record<Item | Tool, readonly [string, string]>;

export const HOTBAR_COLUMNS = 8;
export const BAG_SLOTS = 16;
export const WAREHOUSE_SLOTS = 24;
export const BAG_UPGRADE_PRICES = [100, 250] as const;
export const MAX_BAG_SLOTS = BAG_SLOTS + HOTBAR_COLUMNS * BAG_UPGRADE_PRICES.length;
export const WAREHOUSE_UPGRADE = { firstPrice: 80, priceStep: 40 } as const;
export const STARTING_TOOLS = ['hoe', 'pick', 'can', 'axe', 'rod'] as const satisfies readonly Tool[];

export const STATIONS = { kiln: '盐灶', jar: '腌菜缸' } as const;
export type Station = keyof typeof STATIONS;
export const STATION_ITEMS = { kiln: 'kiln', jar: 'crock' } as const satisfies Record<Station, Item>;
export const KILN_COST = { stone: 4, wood: 2 };

export const CROPS = {
  radish: { seed: 'seeds', seedYield: 2, pickle: 'pickle', art: 'cherry-radish', stages: [35, 90, 180, 300], middleLabel: '根部膨大' },
  pakChoi: { seed: 'pakChoiSeeds', seedYield: 2, pickle: 'pakChoiPickle', art: 'pak-choi', stages: [45, 110, 230, 360], middleLabel: '叶丛展开' },
  mustard: { seed: 'mustardSeeds', seedYield: 2, pickle: 'mustardPickle', art: 'mustard', stages: [40, 95, 200, 320], middleLabel: '锯齿叶展开' },
} as const satisfies Record<string, {
  seed: Item; seedYield: number; pickle?: Item; art: string; stages: readonly [number, number, number, number]; middleLabel: string;
}>;
export type CropId = keyof typeof CROPS;
export const CROP_IDS = Object.keys(CROPS) as CropId[];

export interface Recipe<Collected extends Item = EntryId> {
  label: string;
  station: Station;
  inputs: Partial<Record<Item, number>>;
  output: Item;
  outputQuantity: number;
  duration: number;
  timedInputs?: readonly Item[];
  carryDeadline?: Item;
  anchors?: readonly { input: Item; entry: Collected }[];
  outputEntry?: Collected;
  requiresArchive?: boolean;
}
export const RECIPES = {
  salt: {
    label: '制粗盐', station: 'kiln', inputs: { rockSalt: 1 }, output: 'salt', outputQuantity: 12,
    duration: 45, timedInputs: ['rockSalt'], carryDeadline: 'rockSalt', outputEntry: 'salt',
  },
  crock: {
    label: '烧制腌菜缸', station: 'kiln', inputs: { clay: 3, wood: 1 }, output: 'crock', outputQuantity: 1, duration: 90,
  },
  pickle: {
    label: '腌樱桃萝卜', station: 'jar', inputs: { radish: 1, salt: 3 }, output: 'pickle', outputQuantity: 1,
    duration: 75, timedInputs: ['radish', 'salt'],
    anchors: [{ input: 'radish', entry: 'radish' }, { input: 'salt', entry: 'rockSalt' }], outputEntry: 'pickle',
  },
  fishSoup: {
    label: '炖鲫鱼汤', station: 'kiln', inputs: { crucian: 1, salt: 1 }, output: 'fishSoup', outputQuantity: 1,
    duration: 45, timedInputs: ['crucian'], anchors: [{ input: 'crucian', entry: 'crucian' }], outputEntry: 'fishSoup',
  },
  pakChoiPickle: {
    label: '腌小白菜', station: 'jar', inputs: { pakChoi: 1, salt: 3 }, output: 'pakChoiPickle', outputQuantity: 1,
    duration: 75, timedInputs: ['pakChoi'], carryDeadline: 'pakChoi', outputEntry: 'pakChoiPickle', requiresArchive: true,
  },
  mustardPickle: {
    label: '腌芥菜', station: 'jar', inputs: { mustard: 1, salt: 3 }, output: 'mustardPickle', outputQuantity: 1,
    duration: 75, timedInputs: ['mustard'], anchors: [{ input: 'mustard', entry: 'mustard' }], outputEntry: 'mustardPickle',
  },
} as const satisfies Record<string, Recipe<Item>>;
export type RecipeId = keyof typeof RECIPES;

export const ENTRIES = {
  radish: {
    section: '草木册', reward: 55, duration: 360,
    clue: '货箱里留有种子。翻地、播种、浇水后等它长熟。',
    use: `将樱桃萝卜 ×${RECIPES.pickle.inputs.radish} 与粗盐 ×${RECIPES.pickle.inputs.salt} 放进腌菜缸。`,
  },
  pakChoi: {
    section: '草木册', reward: 55, duration: 480,
    clue: '第一卷归档后，田记所的委托簿有小白菜种源。',
    use: '将小白菜用粗盐腌制，趁这批线索仍在，将成品交给田记所备作山道行粮。',
  },
  mustard: {
    section: '草木册', reward: 55, duration: 480,
    clue: '霾天去旧制盐台西侧寻找余绪，带回田记所复原种子。',
    use: `用腌菜缸把芥菜 ×${RECIPES.mustardPickle.inputs.mustard} 和粗盐 ×${RECIPES.mustardPickle.inputs.salt} 腌成盐渍芥菜。`,
  },
  rockSalt: {
    section: '矿物册', reward: 45, duration: 720,
    clue: '从田记所东边沿小径往北，经林缘向东走。旧制盐台旁的岩石露着灰白纹。',
    use: `用盐灶把岩盐 ×${RECIPES.salt.inputs.rockSalt} 熬成粗盐 ×${RECIPES.salt.outputQuantity}，再用这批盐腌萝卜。`,
  },
  clay: {
    section: '矿物册', reward: 0, duration: 0,
    clue: '沿河岸找偏灰褐的裸土，用锄头挖掘。',
    use: '盐灶加盖烧制，三份黏土与一份木材可做一只腌菜缸。',
  },
  crucian: {
    section: '水族册', reward: 35, duration: 480,
    clue: '带钓竿去柳湾河岸抛竿。水面出现涟漪的地方更容易咬钩。',
    use: `把鲫鱼 ×${RECIPES.fishSoup.inputs.crucian} 和粗盐 ×${RECIPES.fishSoup.inputs.salt} 放进盐灶炖汤。`,
  },
  salt: {
    section: '加工品册', reward: 0, duration: 0,
    clue: `在盐灶用岩盐 ×${RECIPES.salt.inputs.rockSalt} 熬制粗盐。`,
    use: '熬出的粗盐可用来腌菜和炖汤。',
  },
  fishSoup: {
    section: '加工品册', reward: 0, duration: 0,
    clue: `在盐灶用鲫鱼 ×${RECIPES.fishSoup.inputs.crucian} 和粗盐 ×${RECIPES.fishSoup.inputs.salt} 炖汤。`,
    use: '制成的鲫鱼汤可卖给田记所。',
  },
  pickle: {
    section: '加工品册', reward: 30, duration: 0,
    clue: '在腌菜缸中用粗盐腌制樱桃萝卜。',
    use: '制成后收录，余货可交给田记所收购。',
  },
  pakChoiPickle: {
    section: '加工品册', reward: 30, duration: 0,
    clue: '在腌菜缸中用粗盐腌制小白菜。',
    use: '交到田记所，试备山道行粮。',
  },
  mustardPickle: {
    section: '加工品册', reward: 30, duration: 0,
    clue: '在腌菜缸中用粗盐腌制芥菜。',
    use: '把鲜芥菜用盐腌住，便于保存。',
  },
} as const;
export type EntryId = keyof typeof ENTRIES;

export const TRADE = { sell: { radish: 12, pickle: 30, crucian: 16, fishSoup: 26, pakChoi: 14, pakChoiPickle: 30 },
  buy: { seeds: 6, pakChoiSeeds: 7 }, dailySeeds: 6 } as const;
export const STARTING_SEEDS = 3;
export const COMMISSIONS = {
  radishStock: { name: '萝卜补库', item: 'radish', quantity: 2, reward: 30 },
  trailFood: { name: '南山道行粮', item: 'pakChoiPickle', quantity: 1, reward: 40 },
} as const;
export type CommissionId = keyof typeof COMMISSIONS;
export const LIUWAN_ROWS = 30;
export const SOUTH_PASS = {
  name: '南山道',
  gate: [5, 25] as Point,
  bounds: { x: 0, y: LIUWAN_ROWS + 1, width: 15, height: 12 },
  returnGate: [5, 33] as Point,
  waystone: [8, 39] as Point,
};
export const WATER_CAPACITY = 5;
export const TILL_HITS = 3;

interface Resource {
  tile: Point;
  actor: 'willow' | 'oak' | 'stump' | 'stone' | 'clay' | 'salt';
  item: Item;
  tool: Tool;
  hits: number;
  quantity: number;
  renews?: boolean;
}
function tree(actor: 'willow' | 'oak', tile: Point, renews = false): Resource {
  return { tile, actor, item: 'wood', tool: 'axe', hits: 4, quantity: 4, renews };
}

export const RESOURCES: Record<string, Resource> = {
  'field-willow': tree('willow', [9, 8]),
  'field-stone-west': { tile: [7, 8], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'field-stone-east': { tile: [9, 9], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'north-oak': tree('oak', [18, 3], true),
  'east-oak': tree('oak', [24, 5]),
  'woods-oak-1': tree('oak', [17, 4]),
  'woods-oak-2': tree('oak', [20, 3]),
  'woods-oak-3': tree('oak', [21, 9]),
  'woods-oak-4': tree('oak', [23, 3]),
  'woods-oak-5': tree('oak', [25, 10]),
  'woods-oak-6': tree('oak', [27, 4]),
  'woods-oak-7': tree('oak', [28, 10]),
  'woods-oak-8': tree('oak', [30, 4]),
  'woods-oak-9': tree('oak', [32, 8]),
  'bank-willow-1': tree('willow', [40, 4]),
  'bank-willow-2': tree('willow', [39, 8]),
  'bank-willow-3': tree('willow', [33, 11]),
  'bank-willow-4': tree('willow', [28, 15]),
  'bank-willow-5': tree('willow', [28, 17]),
  'bank-willow-6': tree('willow', [30, 19]),
  'bank-willow-7': tree('willow', [35, 24]),
  'bank-willow-8': tree('willow', [37, 26]),
  'bank-willow-9': tree('willow', [39, 28]),
  'west-stone': { tile: [1, 7], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2, renews: true },
  'south-stone': { tile: [7, 17], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'north-stone': { tile: [13, 2], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'buried-salt': { tile: [37, 5], actor: 'salt', item: 'rockSalt', tool: 'pick', hits: 4, quantity: 1, renews: true },
  'east-stone': { tile: [35, 3], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'bank-clay': { tile: [31, 13], actor: 'clay', item: 'clay', tool: 'hoe', hits: 3, quantity: 3, renews: true },
  'north-clay': { tile: [39, 7], actor: 'clay', item: 'clay', tool: 'hoe', hits: 3, quantity: 3, renews: true },
  'woods-stone': { tile: [26, 7], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2, renews: true },
  'expansion-stone-a': { tile: [6, 21], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'expansion-stone-b': { tile: [8, 21], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'expansion-stone-c': { tile: [9, 23], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'expansion-stump-a': { tile: [6, 23], actor: 'stump', item: 'wood', tool: 'axe', hits: 4, quantity: 3 },
  'expansion-stump-b': { tile: [11, 23], actor: 'stump', item: 'wood', tool: 'axe', hits: 4, quantity: 3 },
};

export const SALT_RUIN: Point = [35, 5];
export const MUSTARD_TRACE = { tile: [33, 5] as Point, seedQuantity: 2 } as const;
