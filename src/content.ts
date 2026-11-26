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
} as const satisfies Record<Item | Tool, readonly [string, string]>;

export const HOTBAR_COLUMNS = 8;
export const BAG_SLOTS = 16;
export const WAREHOUSE_SLOTS = 24;
export const STARTING_TOOLS = ['hoe', 'pick', 'can', 'axe', 'rod'] as const satisfies readonly Tool[];

export const STATIONS = { kiln: '盐灶', jar: '腌菜缸' } as const;
export type Station = keyof typeof STATIONS;
export const STATION_ITEMS = { kiln: 'kiln', jar: 'crock' } as const satisfies Record<Station, Item>;
export const KILN_COST = { stone: 4, wood: 2 };

export interface Recipe {
  label: string;
  station: Station;
  inputs: Partial<Record<Item, number>>;
  output: Item;
  outputQuantity: number;
  duration: number;
  timedInputs?: readonly Item[];
}
export const RECIPES = {
  salt: {
    label: '制粗盐', station: 'kiln', inputs: { rockSalt: 1 }, output: 'salt', outputQuantity: 12,
    duration: 45, timedInputs: ['rockSalt'],
  },
  crock: {
    label: '烧制腌菜缸', station: 'kiln', inputs: { clay: 3, wood: 1 }, output: 'crock', outputQuantity: 1, duration: 90,
  },
  pickle: {
    label: '腌樱桃萝卜', station: 'jar', inputs: { radish: 1, salt: 3 }, output: 'pickle', outputQuantity: 1,
    duration: 75, timedInputs: ['radish', 'salt'],
  },
  fishSoup: {
    label: '炖鲫鱼汤', station: 'kiln', inputs: { crucian: 1, salt: 1 }, output: 'fishSoup', outputQuantity: 1,
    duration: 45, timedInputs: ['crucian'],
  },
} as const satisfies Record<string, Recipe>;
export type RecipeId = keyof typeof RECIPES;

export const ENTRIES = {
  radish: {
    section: '草木册', reward: 55, duration: 360,
    clue: '货箱里留有种子。翻地、播种、浇水后等它长熟。',
    use: `将樱桃萝卜 ×${RECIPES.pickle.inputs.radish} 与粗盐 ×${RECIPES.pickle.inputs.salt} 放进腌菜缸。`,
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
  pickle: {
    section: '加工品册', reward: 30, duration: 0,
    clue: '在腌菜缸中用粗盐腌制樱桃萝卜。',
    use: '制成后收录，余货可交给田记所收购。',
  },
} as const;
export type EntryId = keyof typeof ENTRIES;

export const TRADE = { sell: { radish: 12, pickle: 30, crucian: 16, fishSoup: 26 }, buy: { seeds: 6 }, dailySeeds: 6 } as const;
export const STARTING_SEEDS = 3;
export const SEEDS_PER_RADISH = 2;
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
