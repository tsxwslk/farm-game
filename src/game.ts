import {
  BAG_SLOTS, BAG_UPGRADE_PRICES, BUILD_COSTS, COMMISSIONS, CROPS, CROP_IDS, ENTRIES, HOTBAR_COLUMNS, ITEMS, QUALITY_LABELS, RECIPES, RESOURCES, SOUTH_PASS, STATIONS,
  STATION_ITEMS, TILL_HITS, TOOLS, TRACE_IDS, TRACES, TRADE, WAREHOUSE_SLOTS, WAREHOUSE_UPGRADE, WATER_CAPACITY,
  isCrop, isSeedTradeItem, type CommissionId, type EntryId, type Item, type Point, type Quality, type Recipe, type RecipeId,
  type SeedTradeItem, type Station, type Tool, type TraceId, type TraceState,
} from './content';
import type { CropStage, Plot, Target, World } from './scene';
import { batchesFor, consume, count, equippedStack, equippedTool, hasRoom, receive, startingInventory, type Stack, type Storage } from './inventory';
import { liuwanWeather } from './weather';
import { compostGain, harvestQuality, newSoil, recordHarvest, restSoil } from './soil';

export const DAY = 1080;
export const START: Point = [11, 6];
export const SAVE_VERSION = 12;
export interface Entry {
  lit: boolean;
  deadline: number | null;
  qualities?: Quality[];
}
export interface Job {
  recipe: RecipeId;
  started: number;
  at: number;
  deadlines: Partial<Record<Item, number | null>>;
  ready: boolean;
}
export interface PlacedStation {
  kind: Station;
  tile: Point;
  job: Job | null;
}
export interface Action {
  key: string;
  tool: Tool;
  at: number;
}
export interface Account {
  income: number;
  expenses: number;
  royalties: number;
}
export interface Game {
  schemaVersion: typeof SAVE_VERSION;
  day: number;
  minute: number;
  review: boolean;
  position: Point;
  hotbarRow: number;
  equippedSlot: number | null;
  water: number;
  coins: number;
  plots: Plot[];
  stations: Record<string, PlacedStation>;
  bag: (Stack | null)[];
  warehouse: (Stack | null)[];
  entries: Partial<Record<EntryId, Entry>>;
  strikes: Record<string, number>;
  depleted: Record<string, number>;
  action: Action | null;
  chestOpened: boolean;
  submitted: boolean;
  commissions: { radishStockDay: number; trailFood: boolean };
  traces: Record<TraceId, TraceState>;
  seedStock: number;
  pakChoiSeedStock: number;
  peaSeedStock: number;
  log: string[];
  account: Account;
}

export function newGame(world: World): Game {
  return {
    schemaVersion: SAVE_VERSION,
    day: 1, minute: 0, review: false, position: [...START], hotbarRow: 0, equippedSlot: null, water: 0, coins: 0,
    plots: world.plots.map(() => ({ tilled: false, planted: null, watered: null, crop: null, soil: newSoil() })),
    stations: {}, ...startingInventory(), entries: {}, strikes: {}, depleted: {}, action: null,
    chestOpened: false, submitted: false, seedStock: TRADE.dailySeeds, pakChoiSeedStock: TRADE.dailySeeds, log: [],
    peaSeedStock: TRADE.dailySeeds,
    commissions: { radishStockDay: 0, trailFood: false },
    traces: Object.fromEntries(TRACE_IDS.map(id => [id, 'unfound'])) as Game['traces'],
    account: { income: 0, expenses: 0, royalties: 0 },
  };
}

function recordAccount(game: Game, message: string) {
  game.log.push(message);
  if (game.log.length > 50) game.log.shift();
  return message;
}

function discover(game: Game, id: EntryId) {
  const entry = game.entries[id] ??= { lit: false, deadline: null };
  const { duration } = ENTRIES[id];
  if (duration && !entry.lit && (entry.deadline === null || entry.deadline <= game.minute)) {
    entry.deadline = game.minute + duration;
  }
  return entry.deadline;
}

function light(game: Game, id: EntryId) {
  const entry = game.entries[id] ??= { lit: false, deadline: null };
  if (entry.lit) return;
  entry.lit = true;
  const { reward } = ENTRIES[id];
  if (!reward) return;
  game.coins += reward;
  game.account.royalties += reward;
  recordAccount(game, ITEMS[id] + '已上锚，稿酬 +' + reward + ' 文');
}

export function formatClock(game: Pick<Game, 'day' | 'minute' | 'review'>) {
  const minute = 360 + Math.floor(game.minute - (game.day - 1) * DAY);
  const pad = (value: number) => String(value).padStart(2, '0');
  return pad(Math.floor(minute / 60)) + ':' + pad(minute % 60);
}

const STAGES = ['sprout', 'seedling', 'bulking', 'ripe'] as const;
const GROWTH_LABELS = { germinating: '种子吸水', sprout: '刚出土', seedling: '幼苗', bulking: '生长中期', ripe: '成熟' };

export function cropStage(game: Game, plot: Plot): CropStage {
  if (!plot.tilled) return 'ground';
  if (plot.crop === null) return 'tilled';
  if (plot.watered === null) return 'seed';
  const age = game.minute - plot.watered;
  const index = CROPS[plot.crop].stages.findLastIndex(threshold => age >= threshold);
  return STAGES[index] ?? 'germinating';
}

export function growthStatus(game: Game, plot: Plot) {
  const { crop, watered } = plot;
  if (crop === null || watered === null) return '';
  const name = ITEMS[crop];
  const thresholds = CROPS[crop].stages;
  const index = thresholds.findLastIndex(threshold => game.minute - watered >= threshold);
  if (index === 3) return name + '已成熟，可以收获。';
  const minute = Math.ceil(watered + thresholds[3]);
  const day = Math.floor(minute / DAY) + 1;
  const when = (day === game.day ? '' : '第 ' + day + ' 天 ') + formatClock({ day, minute, review: false });
  const labels = { ...GROWTH_LABELS, bulking: CROPS[crop].middleLabel };
  const label = labels[STAGES[index] ?? 'germinating'];
  const next = labels[STAGES[index + 1]];
  const wait = Math.ceil(watered + thresholds[index + 1] - game.minute);
  return name + ' · ' + label + ' · 距' + next + ' ' + wait + ' 游戏分钟 · 预计 ' + when + ' 成熟';
}

export function costs(items: Partial<Record<Item, number>>) {
  return itemCounts(items).map(([item, quantity]) => ITEMS[item] + ' ×' + quantity).join('、');
}

function itemCounts(items: Partial<Record<Item, number>>) {
  return Object.entries(items) as [Item, number][];
}

export function hasMaterials(game: Game, items: Partial<Record<Item, number>>) {
  return itemCounts(items).every(([item, quantity]) => count(game, item) >= quantity);
}

export function canBuild(game: Game, station: Station) {
  const item = STATION_ITEMS[station];
  const materials = BUILD_COSTS[station];
  if (!materials) return count(game, item) > 0;
  return hasMaterials(game, materials);
}

export function stationKey(tile: Point) {
  return 'station-' + tile.join(',');
}

export function place(game: Game, station: Station, point: Point, slot?: number) {
  const key = stationKey(point);
  if (game.review || game.stations[key] || key === stationKey(game.position)) return null;
  const item = STATION_ITEMS[station];
  if (slot !== undefined) {
    const stack = game.bag[slot];
    if (stack?.kind !== 'item' || stack.id !== item) return null;
    consume(game, item, 1, Infinity, slot);
  } else if (!canBuild(game, station)) return null;
  else {
    const materials = BUILD_COSTS[station] ?? { [item]: 1 };
    for (const [material, quantity] of itemCounts(materials)) consume(game, material, quantity);
  }
  game.stations[key] = { kind: station, tile: point, job: null };
  return '已摆放' + STATIONS[station] + '。';
}

export function packStation(game: Game, key: string) {
  const station = game.stations[key];
  if (game.review || !station) return { ok: false, message: '这里没有可收起的设施。' };
  const { kind, job } = station;
  if (job) return { ok: false, message: job.ready ? '请先领取成品。' : '加工完成后才能收起。' };
  const item = STATION_ITEMS[kind];
  if (!hasRoom(game, item)) return { ok: false, message: '背包满了，腾出一格后再收起。' };
  receive(game, item, 1);
  delete game.stations[key];
  return { ok: true, message: '已收起' + STATIONS[kind] + '，可从快捷栏重新摆放。' };
}

export function catchFish(game: Game) {
  if (!hasRoom(game, 'crucian')) return '背包满了，鲫鱼游走了。';
  receive(game, 'crucian', 1, discover(game, 'crucian'));
  return '钓到鲫鱼 ×1。可加粗盐炖汤，也可卖给田记所。';
}

export function targetKey(target: Target) {
  if (target.kind === 'plot') return 'plot-' + target.id;
  return String(target.id ?? target.kind);
}

export function targetAction(game: Game, target: Target): { label: string; tool?: Tool; hits?: number } {
  switch (target.kind) {
    case 'resource': {
      const rule = RESOURCES[String(target.id)];
      if (game.depleted[String(target.id)]) return { label: '今日已挖完' };
      return {
        tool: rule.tool,
        label: { stump: '清理树桩', salt: '采岩盐', stone: '采石', clay: '挖黏土', willow: '砍柳树', oak: '砍橡树' }[rule.actor],
        hits: rule.hits,
      };
    }
    case 'plot': {
      const plot = game.plots[Number(target.id)];
      if (plot.tilled && equippedTool(game) === 'pick') {
        return plot.planted === null ? { tool: 'pick', label: '恢复草地', hits: 1 } :
          { tool: 'pick', label: '收获后可恢复草地' };
      }
      const stage = cropStage(game, plot);
      if (stage === 'ground') return { tool: 'hoe' as const, label: '翻地', hits: TILL_HITS };
      if (stage === 'tilled') {
        const held = equippedStack(game);
        const seed = CROP_IDS.some(id => CROPS[id].seed === held?.id);
        return { label: held?.id === 'compost' ? '施堆肥' : seed ? '播种' : '查看土壤' };
      }
      if (stage === 'seed') return { tool: 'can' as const, label: '浇水' };
      if (stage === 'ripe') return { label: '收获' };
      return { label: '查看长势' };
    }
    case 'water': return { tool: 'can' as const, label: '取水' };
    case 'fishing': return { tool: 'rod', label: '抛竿' };
    case 'ruin': return { label: '查看旧制盐台' };
    case 'trace': {
      const id = target.trace;
      return { label: id && traceVisible(game, id) ? '采集' + ITEMS[TRACES[id].item] : '查看' + target.label };
    }
    case 'trail': return { label: canTravel(game) ? '前往' + SOUTH_PASS.name : '查看山道入口' };
    case 'return': return { label: '返回柳湾' };
    case 'waystone': return { label: '查看路碑' };
    case 'chest': return { label: '打开仓库' };
    case 'archive': return { label: '打开田记所' };
    default: return { label: '查看' + STATIONS[target.kind] };
  }
}

export function targetProgress(game: Game, target: Target) {
  const total = targetAction(game, target).hits;
  return total ? { done: game.strikes[targetKey(target)] ?? 0, total } : null;
}

export function jobMeter(job: Job, minute: number) {
  const remaining = Math.max(0, Math.ceil(job.at - minute));
  const elapsed = Math.min(job.at - job.started, Math.max(0, minute - job.started));
  return { remaining, elapsed, duration: job.at - job.started };
}

export function operate(
  game: Game, target: Target, isClear: (target: Target) => boolean, hit = false,
): string {
  const { tool, label, hits } = targetAction(game, target);
  if (game.review) return '请先确认日结。';
  if (target.kind === 'trace' && target.trace) return collectTrace(game, target.trace);
  if (tool && equippedTool(game) !== tool) return '需要' + TOOLS[tool].name + '。';
  if (target.kind === 'plot' && tool === 'pick' && !hits) return '这块地还有作物，收获后可恢复草地。';
  if (hits && tool) {
    if (target.kind === 'plot' && !isClear(target)) return '先清理这块地上的树石或设施。';
    const key = targetKey(target);
    if (!hit) {
      if (!game.action) game.action = { key, tool, at: game.minute + .18 };
      return '';
    }
    const done = (game.strikes[key] ?? 0) + 1;
    if (done < hits) {
      game.strikes[key] = done;
      return '';
    }
    if (target.kind === 'plot') {
      delete game.strikes[key];
      const plot = game.plots[Number(target.id)];
      if (tool === 'pick') {
        plot.tilled = false;
        return '已将空耕地恢复成草地。';
      }
      plot.tilled = true;
      return '翻好一块地。可从背包选种播下。';
    }
    const { item, quantity } = RESOURCES[key];
    if (!hasRoom(game, item)) return '背包满了。腾出一格后再继续。';
    delete game.strikes[key];
    game.depleted[key] = game.day;
    const deadline = item === 'rockSalt' || item === 'clay' ? discover(game, item) : null;
    receive(game, item, quantity, deadline);
    return '获得' + ITEMS[item] + ' ×' + quantity + '。';
  }
  if (target.kind === 'water') {
    game.water = WATER_CAPACITY;
    return '水壶已装满。';
  }
  if (target.kind !== 'plot') return label;
  const plot = game.plots[Number(target.id)];
  if (label === '施堆肥') {
    const gain = compostGain(plot.soil);
    if (!gain.nutrients && !gain.microbes) return '这块地的主养分和菌群已经充足。';
    consume(game, 'compost', 1, Infinity, game.equippedSlot!);
    plot.soil.nutrients += gain.nutrients;
    plot.soil.microbes += gain.microbes;
    return '施了堆肥。主养分 +' + gain.nutrients + '，菌群健康 +' + gain.microbes + '。';
  }
  if (label === '播种') {
    const crop = CROP_IDS.find(id => CROPS[id].seed === equippedStack(game)?.id);
    if (!crop) {
      if (CROP_IDS.some(id => count(game, CROPS[id].seed))) return '先在快捷栏选中要播的种子。';
      return CROP_IDS.some(id => count(game, CROPS[id].seed, 'warehouse'))
        ? '种子在仓库里，先取进背包。' : '种子用完了。可到田记所补种。';
    }
    consume(game, CROPS[crop].seed, 1, Infinity, game.equippedSlot!);
    plot.crop = crop;
    plot.planted = game.minute;
    plot.soil.vacantSince = null;
    if (liuwanWeather(game.day) === 'rain') {
      plot.watered = game.minute;
      return '播下了' + ITEMS[crop] + '。雨水已经浇透菜畦。';
    }
    return '播下了' + ITEMS[crop] + '。';
  }
  if (label === '浇水') {
    if (!game.water) return '水壶空了，先到河边取水。';
    game.water--;
    plot.watered = game.minute;
    return '浇过水了。';
  }
  if (label === '收获' && plot.crop) {
    const { crop } = plot;
    const quality = harvestQuality(plot.soil, crop);
    const needed = Number(!count(game, crop, 'bag', quality)) + Number(!count(game, 'plantScraps', 'bag', 'normal'));
    if (game.bag.filter(slot => slot === null).length < needed) return '背包空间不足。给作物和植物残料留出位置后再收获。';
    receive(game, crop, 1, discover(game, crop), quality);
    receive(game, 'plantScraps', 1);
    const entry = game.entries[crop]!;
    const qualities = entry.qualities ??= [];
    if (!qualities.includes(quality)) qualities.push(quality);
    recordHarvest(plot.soil, crop, game.minute);
    plot.crop = null;
    plot.planted = plot.watered = null;
    return '收获' + ITEMS[crop] + ' ×1（' + QUALITY_LABELS[quality] + '）、植物残料 ×1。';
  }
  return growthStatus(game, plot);
}

export function startJob(game: Game, key: string, id: RecipeId) {
  const recipe: Recipe = RECIPES[id];
  const station = game.stations[key];
  if (game.review || station?.kind !== recipe.station || station.job) return '设施当前不可开工。';
  if (recipe.requiresArchive && !game.submitted) return '请先在田记所归档柳湾第一卷。';
  if (recipe.requiresTrace && game.traces[recipe.requiresTrace] !== 'restored') return '请先到田记所复原种源。';
  if (!hasMaterials(game, recipe.inputs)) return '缺少材料。';
  const at = game.minute + recipe.duration;
  const deadlines: Job['deadlines'] = {};
  for (const [item, quantity] of itemCounts(recipe.inputs)) {
    if (recipe.timedInputs?.includes(item)) deadlines[item] = consume(game, item, quantity, at);
    else consume(game, item, quantity);
  }
  station.job = { recipe: id, started: game.minute, at, deadlines, ready: false };
  return '开始' + recipe.label + '。';
}

export function claimJob(game: Game, key: string) {
  const station = game.stations[key];
  if (!station?.job?.ready) return '尚无待领成品。';
  const { job } = station;
  const { output, outputQuantity, carryDeadline }: Recipe = RECIPES[job.recipe];
  if (!hasRoom(game, output)) return '背包满了，成品仍留在设施中。';
  receive(game, output, outputQuantity, carryDeadline ? job.deadlines[carryDeadline] ?? null : null);
  station.job = null;
  return '制成' + ITEMS[output] + ' ×' + outputQuantity + '，已放入背包。';
}

export function advance(game: Game, amount: number, onHit: (action: Action) => string | undefined): string[] {
  if (game.review || amount <= 0) return [];
  const end = Math.min(game.day * DAY, game.minute + amount);
  const events: { at: number; station: string | null }[] = [];
  for (const [key, { job }] of Object.entries(game.stations)) {
    if (job && !job.ready && job.at <= end) events.push({ at: job.at, station: key });
  }
  if (game.action && game.action.at <= end) events.push({ at: game.action.at, station: null });
  const notes: string[] = [];
  for (const event of events.sort((a, b) => a.at - b.at)) {
    game.minute = event.at;
    if (event.station === null) {
      const action = game.action!;
      game.action = null;
      const result = onHit(action);
      if (result) notes.push(result);
      continue;
    }
    const job = game.stations[event.station].job!;
    job.ready = true;
    const recipe: Recipe = RECIPES[job.recipe];
    for (const { input, entry } of recipe.anchors ?? []) {
      if ((job.deadlines[input] ?? 0) > job.at) light(game, entry);
    }
    if (recipe.outputEntry) light(game, recipe.outputEntry);
    if (job.recipe === 'crock') {
      const clay = game.entries.clay;
      if (clay) clay.lit = true;
    }
    notes.push(claimJob(game, event.station));
  }
  game.minute = end;
  if (end === game.day * DAY) game.review = true;
  return notes;
}

export function nextDay(game: Game, reviewDay: number) {
  if (!game.review || reviewDay !== game.day) return false;
  game.day++;
  game.review = false;
  game.seedStock = TRADE.dailySeeds;
  game.pakChoiSeedStock = TRADE.dailySeeds;
  game.peaSeedStock = TRADE.dailySeeds;
  game.log = [];
  game.account = { income: 0, expenses: 0, royalties: 0 };
  for (const plot of game.plots) restSoil(plot.soil, game.minute, DAY);
  waterByRain(game);
  return true;
}

export function waterByRain(game: Game) {
  if (game.review || liuwanWeather(game.day) !== 'rain') return;
  for (const plot of game.plots) {
    if (plot.crop !== null && plot.watered === null) plot.watered = game.minute;
  }
}

export function traceVisible(game: Game, id: TraceId) {
  if (game.review || game.traces[id] !== 'unfound') return false;
  const site = TRACES[id];
  if (site.inSouthPass && !canTravel(game)) return false;
  const evening = 'eveningHour' in site && game.minute - (game.day - 1) * DAY >= (site.eveningHour - 6) * 60;
  return liuwanWeather(game.day) === 'haze' || evening;
}

function collectTrace(game: Game, id: TraceId) {
  const { item, place } = TRACES[id];
  if (!traceVisible(game, id)) {
    if (game.traces[id] === 'collected') return '带' + ITEMS[item] + '回田记所复原。';
    if (game.traces[id] === 'restored') return ITEMS[id] + '种源已复原，可在柳湾菜畦种植。';
    return place + '暂时看不到' + ITEMS[item] + '。' + ENTRIES[id].clue;
  }
  if (!hasRoom(game, item)) return '背包满了。腾出一格后再采集。';
  receive(game, item, 1);
  game.traces[id] = 'collected';
  return '采到了' + ITEMS[item] + '。带回田记所复原种子。';
}

export function restoreTrace(game: Game, id: TraceId) {
  const { item, seedQuantity } = TRACES[id];
  const { seed } = CROPS[id];
  if (game.review || game.traces[id] !== 'collected') return '没有待复原的' + ITEMS[item] + '。';
  const slot = game.bag.findIndex(stack => stack?.id === item);
  if (slot < 0) return '先把' + ITEMS[item] + '取到背包。';
  consume(game, item, 1, Infinity, slot);
  receive(game, seed, seedQuantity);
  game.traces[id] = 'restored';
  game.entries[id] ??= { lit: false, deadline: null };
  return '复原了' + ITEMS[seed] + ' ×' + seedQuantity + '。';
}

export function claimTraceSeed(game: Game, id: TraceId) {
  const { seed } = CROPS[id];
  if (game.review || game.traces[id] !== 'restored' || !needsSeed(game, id)) return '当前无需补领' + ITEMS[seed] + '。';
  if (!hasRoom(game, seed)) return '背包满了。腾出一格后再领取。';
  receive(game, seed, 1);
  return '从田记所补领' + ITEMS[seed] + ' ×1。';
}

export function renewResources(game: Game, world: World) {
  let changed = false;
  for (const [id, day] of Object.entries(game.depleted)) {
    const resource = RESOURCES[id];
    if (!resource.renews || day >= game.day) continue;
    const [x, y] = resource.tile;
    if (resource.actor !== 'clay' && (game.position[0] === x && game.position[1] === y ||
      game.plots[world.plotIds[y * world.cols + x]]?.tilled || game.strikes['plot-' + world.plotIds[y * world.cols + x]])) continue;
    delete game.depleted[id];
    changed = true;
  }
  return changed;
}

export type TradeItem = keyof typeof TRADE.sell | keyof typeof TRADE.buy;
export function storageUpgrade(game: Game, storage: Storage) {
  const slots = game[storage].length;
  if (storage === 'bag') {
    const price = BAG_UPGRADE_PRICES[(slots - BAG_SLOTS) / HOTBAR_COLUMNS];
    return price === undefined ? null : { slots: slots + HOTBAR_COLUMNS, price };
  }
  return {
    slots: slots + WAREHOUSE_SLOTS,
    price: WAREHOUSE_UPGRADE.firstPrice + (slots / WAREHOUSE_SLOTS - 1) * WAREHOUSE_UPGRADE.priceStep,
  };
}

export function expandStorage(game: Game, storage: Storage, quotedSlots: number) {
  const offer = storageUpgrade(game, storage);
  if (game.review || !offer || quotedSlots !== offer.slots) return '当前无法扩容。';
  if (game.coins < offer.price) return '钱袋里的文不足。';
  const slots = game[storage];
  slots.push(...Array<null>(offer.slots - slots.length).fill(null));
  game.coins -= offer.price;
  game.account.expenses += offer.price;
  return recordAccount(game, (storage === 'bag' ? '背包' : '仓库') + '已扩至 ' + offer.slots + ' 格，支出 ' + offer.price + ' 文。');
}

const seedStockFields = { seeds: 'seedStock', pakChoiSeeds: 'pakChoiSeedStock', peaSeeds: 'peaSeedStock' } as const;

export function seedStockFor(game: Game, item: SeedTradeItem) {
  return game[seedStockFields[item]];
}

export function tradePrice(item: TradeItem, quality: Quality = 'normal') {
  if (isSeedTradeItem(item)) return TRADE.buy[item];
  const multiplier = isCrop(item) ? { normal: 100, good: 125, fine: 150 }[quality] : 100;
  return Math.floor(TRADE.sell[item] * multiplier / 100);
}

export function tradeLimit(game: Game, item: TradeItem, quality: Quality = 'normal') {
  if (!game.submitted && (item === 'pakChoi' || item === 'pakChoiPickle' || item === 'pakChoiSeeds')) return 0;
  if (!isSeedTradeItem(item)) return count(game, item, 'bag', quality);
  if (!hasRoom(game, item)) return 0;
  return Math.min(seedStockFor(game, item), Math.floor(game.coins / TRADE.buy[item]));
}

export function warnSale(game: Game, item: TradeItem, quantity: number, quality: Quality = 'normal') {
  if (!isCrop(item) && item !== 'crucian' && item !== 'pakChoiPickle') return false;
  const entry = item === 'pakChoiPickle' ? 'pakChoi' : item;
  if (game.entries[entry]?.lit) return false;
  const fresh = batchesFor(game, item).filter(({ batch }) => (batch.deadline ?? 0) > game.minute);
  return fresh.length > 0 && fresh.every(({ stack }) => (stack.quality ?? 'normal') === quality) &&
    quantity >= count(game, item, 'bag', quality);
}

export function trade(game: Game, item: TradeItem, quantity: number, quality: Quality = 'normal') {
  if (game.review || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > tradeLimit(game, item, quality)) {
    return { ok: false, message: '交易未完成，请确认数量、钱袋和背包。' };
  }
  const total = quantity * tradePrice(item, quality);
  if (isSeedTradeItem(item)) {
    game.coins -= total;
    game.account.expenses += total;
    game[seedStockFields[item]] -= quantity;
    receive(game, item, quantity);
    return { ok: true, message: recordAccount(game, '买入' + ITEMS[item] + ' ×' + quantity + '，支出 ' + total + ' 文。') };
  }
  consume(game, item, quantity, Infinity, undefined, quality);
  game.coins += total;
  game.account.income += total;
  const grade = isCrop(item) && quality !== 'normal' ? '（' + QUALITY_LABELS[quality] + '）' : '';
  return { ok: true, message: recordAccount(game, '售出' + ITEMS[item] + grade + ' ×' + quantity + '，收入 ' + total + ' 文。') };
}

export function needsSeed(game: Game, crop: keyof typeof CROPS = 'radish') {
  const { seed } = CROPS[crop];
  return !count(game, seed) && !count(game, crop) && !count(game, seed, 'warehouse') && !count(game, crop, 'warehouse') &&
    !game.plots.some(plot => plot.crop === crop);
}

export function claimSeed(game: Game) {
  if (game.review || !needsSeed(game)) return '仍有种子、田间作物或可留种萝卜。';
  if (!hasRoom(game, 'seeds')) return '背包满了。腾出一格后再领取。';
  receive(game, 'seeds', 1);
  return '从田记所领取补种种子 ×1。';
}

export function saveSeed(game: Game, index: number) {
  const stack = game.bag[index];
  const crop = CROP_IDS.find(id => stack?.kind === 'item' && stack.id === id);
  if (game.review || !crop) return '背包里没有可留种的作物。';
  const { seed, seedYield } = CROPS[crop];
  if (!hasRoom(game, seed, index)) return '背包满了。腾出一格后再留种。';
  consume(game, crop, 1, Infinity, index);
  receive(game, seed, seedYield);
  return '留取' + ITEMS[seed] + ' ×' + seedYield + '。';
}

export function canSubmit(game: Game) {
  return (['radish', 'rockSalt', 'pickle'] as const).every(id => game.entries[id]?.lit);
}

export function submit(game: Game) {
  if (game.review || !canSubmit(game)) return '记录齐全后可归档。';
  if (game.submitted) return '柳湾第一卷已归档。';
  game.submitted = true;
  return '柳湾第一卷已归档。田记所的委托簿翻到了新页。';
}

export function canTravel(game: Game) {
  return game.submitted && game.commissions.trailFood;
}

export function claimPakChoiSeeds(game: Game) {
  if (game.review || !game.submitted || !needsSeed(game, 'pakChoi')) return '当前无需领取小白菜种子。';
  if (!hasRoom(game, 'pakChoiSeeds')) return '背包满了。腾出一格后再领取。';
  receive(game, 'pakChoiSeeds', 2);
  return '领取小白菜种子 ×2。';
}

export function commissionStatus(game: Game, id: CommissionId) {
  if (id === 'radishStock' ? game.commissions.radishStockDay === game.day : game.commissions.trailFood) return '已交付';
  const { item, quantity } = COMMISSIONS[id];
  if (count(game, item) < quantity) return '背包物品不足';
  if (id === 'trailFood' && !batchesFor(game, item).some(({ batch }) => (batch.deadline ?? 0) > game.minute)) {
    return '这批小白菜的线索已过时，请用新收的小白菜再做一份。';
  }
  return '';
}

export function deliverCommission(game: Game, id: CommissionId) {
  if (game.review || !game.submitted) return '田记所的委托簿尚未开放。';
  const status = commissionStatus(game, id);
  if (status) return status + (status.endsWith('。') ? '' : '。');
  const { item, quantity, reward, name } = COMMISSIONS[id];
  if (id === 'trailFood') {
    consume(game, item, quantity, game.minute);
    light(game, 'pakChoi');
    game.commissions.trailFood = true;
  } else {
    consume(game, item, quantity);
    game.commissions.radishStockDay = game.day;
  }
  game.coins += reward;
  game.account.income += reward;
  const payment = recordAccount(game, '已交付「' + name + '」，收入 ' + reward + ' 文。');
  return payment + (id === 'trailFood' ? '南山道已开放。' : '');
}
