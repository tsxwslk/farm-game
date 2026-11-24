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

export const HOTBAR_COLUMNS = 8;
export const BAG_SLOTS = 16;
export const WAREHOUSE_SLOTS = 24;
export const STARTING_TOOLS = ['hoe', 'pick', 'can', 'axe', 'rod'] as const satisfies readonly Tool[];

export const STATIONS = { kiln: '盐灶', jar: '腌菜缸' } as const;
export type Station = keyof typeof STATIONS;
export const KILN_COST = { stone: 4, wood: 2 };

export interface Recipe {
  label: string;
  station: Station;
  inputs: Partial<Record<Item, number>>;
  output: Item;
  duration: number;
}
export const RECIPES = {
  salt: { label: '制粗盐', station: 'kiln', inputs: { rockSalt: 1 }, output: 'salt', duration: 45 },
  crock: { label: '烧制腌菜缸', station: 'kiln', inputs: { clay: 3, wood: 1 }, output: 'crock', duration: 90 },
  pickle: { label: '腌樱桃萝卜', station: 'jar', inputs: { radish: 1, salt: 1 }, output: 'pickle', duration: 75 },
} as const satisfies Record<string, Recipe>;
export type RecipeId = keyof typeof RECIPES;

export const ENTRIES = {
  radish: {
    section: '草木册', reward: 55, duration: 360,
    clue: '货箱里留有种子。翻地、播种、浇水后等它长熟。',
    use: '将一份樱桃萝卜与粗盐放进腌菜缸。',
  },
  rockSalt: {
    section: '矿物册', reward: 45, duration: 720,
    clue: '敲开柳湾的岩石，里面有时会藏着盐。',
    use: '用盐灶制成粗盐，再用这批粗盐腌萝卜。',
  },
  clay: {
    section: '矿物册', reward: 0, duration: 0,
    clue: '沿河岸找偏灰褐的裸土，用锄头挖掘。',
    use: '盐灶加盖烧制，三份黏土与一份木材可做一只腌菜缸。',
  },
  pickle: {
    section: '加工品册', reward: 30, duration: 0,
    clue: '在腌菜缸中放入樱桃萝卜与粗盐。',
    use: '制成后收录，余货可交给田记所收购。',
  },
} as const;
export type EntryId = keyof typeof ENTRIES;

export const TRADE = { sell: { radish: 12, pickle: 30 }, buy: { seeds: 6 }, dailySeeds: 6 } as const;
export const STARTING_SEEDS = 3;
export const SEEDS_PER_RADISH = 2;
export const WATER_CAPACITY = 5;
export const TILL_HITS = 3;

interface Resource {
  tile: Point;
  actor: 'willow' | 'stone' | 'clay' | 'salt';
  item: Item;
  tool: Tool;
  hits: number;
  quantity: number;
  renews?: boolean;
}
export const RESOURCES: Record<string, Resource> = {
  'field-willow': { tile: [9, 8], actor: 'willow', item: 'wood', tool: 'axe', hits: 4, quantity: 4 },
  'field-stone-west': { tile: [7, 8], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'field-stone-east': { tile: [9, 9], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'north-willow': { tile: [15, 3], actor: 'willow', item: 'wood', tool: 'axe', hits: 4, quantity: 4, renews: true },
  'east-willow': { tile: [17, 4], actor: 'willow', item: 'wood', tool: 'axe', hits: 4, quantity: 4 },
  'west-stone': { tile: [1, 7], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2, renews: true },
  'south-stone': { tile: [7, 17], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'north-stone': { tile: [13, 2], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'buried-salt': { tile: [21, 5], actor: 'salt', item: 'rockSalt', tool: 'pick', hits: 4, quantity: 1, renews: true },
  'east-stone': { tile: [23, 3], actor: 'stone', item: 'stone', tool: 'pick', hits: 3, quantity: 2 },
  'bank-clay': { tile: [26, 10], actor: 'clay', item: 'clay', tool: 'hoe', hits: 3, quantity: 3, renews: true },
  'north-clay': { tile: [25, 7], actor: 'clay', item: 'clay', tool: 'hoe', hits: 3, quantity: 3, renews: true },
};
