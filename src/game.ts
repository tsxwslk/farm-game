import {
  ENTRIES, ITEMS, KILN_COST, RECIPES, RESOURCES, SEEDS_PER_RADISH, STATIONS, STATION_ITEMS, TILL_HITS, TOOLS, TRADE, WATER_CAPACITY,
  type EntryId, type Item, type Point, type RecipeId, type Station, type Tool,
} from './content';
import type { Plot, Target, World } from './scene';
import { batchesFor, consume, count, equippedStack, equippedTool, hasRoom, receive, startingInventory, type Stack } from './inventory';

export const DAY = 1080;
export const START: Point = [11, 6];
export const SAVE_VERSION = 5;
export interface Entry {
  lit: boolean;
  deadline: number | null;
}
export interface Job {
  recipe: RecipeId;
  started: number;
  at: number;
  deadlines: Partial<Record<Item, number | null>>;
  ready: boolean;
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
  stations: Partial<Record<Station, Point>>;
  bag: (Stack | null)[];
  warehouse: (Stack | null)[];
  entries: Partial<Record<EntryId, Entry>>;
  jobs: Partial<Record<Station, Job>>;
  strikes: Record<string, number>;
  depleted: Record<string, number>;
  action: Action | null;
  chestOpened: boolean;
  submitted: boolean;
  seedStock: number;
  log: string[];
  account: Account;
}

export function newGame(world: World): Game {
  return {
    schemaVersion: SAVE_VERSION,
    day: 1, minute: 0, review: false, position: [...START], hotbarRow: 0, equippedSlot: null, water: 0, coins: 0,
    plots: world.plots.map(() => ({ tilled: false, planted: null, watered: null })),
    stations: {}, ...startingInventory(), entries: {}, jobs: {}, strikes: {}, depleted: {}, action: null,
    chestOpened: false, submitted: false, seedStock: TRADE.dailySeeds, log: [],
    account: { income: 0, expenses: 0, royalties: 0 },
  };
}

export function record(game: Game, message: string) {
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
  game.coins += reward;
  game.account.royalties += reward;
  record(game, ITEMS[id] + '已上锚，稿酬 +' + reward + ' 文');
}

export function formatClock(game: Pick<Game, 'day' | 'minute' | 'review'>) {
  const minute = 360 + Math.floor(game.minute - (game.day - 1) * DAY);
  const pad = (value: number) => String(value).padStart(2, '0');
  return pad(Math.floor(minute / 60)) + ':' + pad(minute % 60);
}

export function growthStatus(game: Game, plot: Plot) {
  const status = window.LiuwanGame.describeGrowth(game, plot);
  if (plot.watered === null) return status;
  const minute = Math.ceil(plot.watered + window.LiuwanGame.ripeAfter);
  if (minute <= game.minute) return status;
  const day = Math.floor(minute / DAY) + 1;
  const when = (day === game.day ? '' : '第 ' + day + ' 天 ') + formatClock({ day, minute, review: false });
  return status + ' · 预计 ' + when + ' 成熟';
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
  if (game.stations[station]) return false;
  if (station === 'jar') return count(game, 'crock') > 0;
  return !count(game, 'kiln') && !count(game, 'kiln', 'warehouse') && hasMaterials(game, KILN_COST);
}

export function place(game: Game, station: Station, point: Point, slot?: number) {
  if (game.review || game.stations[station]) return null;
  const item = STATION_ITEMS[station];
  if (slot !== undefined) {
    const stack = game.bag[slot];
    if (stack?.kind !== 'item' || stack.id !== item) return null;
    consume(game, item, 1, Infinity, slot);
  } else if (!canBuild(game, station)) return null;
  else if (station === 'kiln') {
    for (const [item, quantity] of itemCounts(KILN_COST)) consume(game, item, quantity);
  } else consume(game, item, 1);
  game.stations[station] = point;
  return record(game, '已摆放' + STATIONS[station] + '。');
}

export function packStation(game: Game, station: Station) {
  if (game.review || !game.stations[station]) return { ok: false, message: '这里没有可收起的设施。' };
  const job = game.jobs[station];
  if (job) return { ok: false, message: job.ready ? '请先领取成品。' : '加工完成后才能收起。' };
  const item = STATION_ITEMS[station];
  if (!hasRoom(game, item)) return { ok: false, message: '背包满了，腾出一格后再收起。' };
  receive(game, item, 1);
  delete game.stations[station];
  return { ok: true, message: record(game, '已收起' + STATIONS[station] + '，可从快捷栏重新摆放。') };
}

export function catchFish(game: Game) {
  if (!hasRoom(game, 'crucian')) return '背包满了，鲫鱼游走了。';
  receive(game, 'crucian', 1, discover(game, 'crucian'));
  return record(game, '钓到鲫鱼 ×1。可以用盐灶炖汤。');
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
      const stage = window.LiuwanGame.cropStage(game, plot);
      if (stage === 'ground') return { tool: 'hoe' as const, label: '翻地', hits: TILL_HITS };
      if (stage === 'tilled') return { label: '播种' };
      if (stage === 'seed') return { tool: 'can' as const, label: '浇水' };
      if (stage === 'ripe') return { label: '收获' };
      return { label: '查看长势' };
    }
    case 'water': return { tool: 'can' as const, label: '取水' };
    case 'fishing': return { tool: 'rod', label: '抛竿' };
    case 'ruin': return { label: '查看旧制盐台' };
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
        return record(game, '已将空耕地恢复成草地。');
      }
      plot.tilled = true;
      return record(game, '翻好一块地。可从背包选种播下。');
    }
    const { item, quantity } = RESOURCES[key];
    if (!hasRoom(game, item)) return '背包满了。腾出一格后再继续。';
    delete game.strikes[key];
    game.depleted[key] = game.day;
    const deadline = item === 'rockSalt' || item === 'clay' ? discover(game, item) : null;
    receive(game, item, quantity, deadline);
    return record(game, '获得' + ITEMS[item] + ' ×' + quantity + '。');
  }
  if (target.kind === 'water') {
    game.water = WATER_CAPACITY;
    return '水壶已装满。';
  }
  if (target.kind !== 'plot') return label;
  const plot = game.plots[Number(target.id)];
  if (label === '播种') {
    if (!count(game, 'seeds')) return count(game, 'seeds', 'warehouse') ? '种子在仓库里，先取进背包。' : '种子用完了。可到田记所补种。';
    if (equippedStack(game)?.id !== 'seeds') return '先在快捷栏选中樱桃萝卜种子。';
    consume(game, 'seeds', 1, Infinity, game.equippedSlot!);
    plot.planted = game.minute;
    return record(game, '播下了樱桃萝卜。');
  }
  if (label === '浇水') {
    if (!game.water) return '水壶空了，先到河边取水。';
    game.water--;
    plot.watered = game.minute;
    return record(game, '浇过水了。');
  }
  if (label === '收获') {
    if (!hasRoom(game, 'radish')) return '背包满了。腾出一格后再收获。';
    receive(game, 'radish', 1, discover(game, 'radish'));
    plot.planted = plot.watered = null;
    return record(game, '收获樱桃萝卜 ×1。');
  }
  return growthStatus(game, plot);
}

export function startJob(game: Game, id: RecipeId) {
  const recipe = RECIPES[id];
  if (game.review || !game.stations[recipe.station] || game.jobs[recipe.station]) return '设施当前不可开工。';
  if (!hasMaterials(game, recipe.inputs)) return '缺少材料。';
  const at = game.minute + recipe.duration;
  const deadlines: Job['deadlines'] = {};
  for (const [item, quantity] of itemCounts(recipe.inputs)) deadlines[item] = consume(game, item, quantity, at);
  game.jobs[recipe.station] = { recipe: id, started: game.minute, at, deadlines, ready: false };
  return record(game, '开始' + recipe.label + '。');
}

export function claimJob(game: Game, station: Station) {
  const job = game.jobs[station];
  if (!job?.ready) return '尚无待领成品。';
  const { output } = RECIPES[job.recipe];
  if (!hasRoom(game, output)) return '背包满了，成品仍留在设施中。';
  receive(game, output, 1, job.deadlines.rockSalt ?? null);
  delete game.jobs[station];
  return record(game, '制成' + ITEMS[output] + ' ×1，已放入背包。');
}

export function advance(game: Game, amount: number, onHit: (action: Action) => string | undefined): string[] {
  if (game.review || amount <= 0) return [];
  const end = Math.min(game.day * DAY, game.minute + amount);
  const events: { at: number; station: Station | 'hit' }[] =
    (Object.entries(game.jobs) as [Station, Job][]).filter(([, job]) => !job.ready && job.at <= end)
    .map(([station, job]) => ({ at: job.at, station }));
  if (game.action && game.action.at <= end) events.push({ at: game.action.at, station: 'hit' });
  const notes: string[] = [];
  for (const event of events.sort((a, b) => a.at - b.at)) {
    game.minute = event.at;
    if (event.station === 'hit') {
      const action = game.action!;
      game.action = null;
      const result = onHit(action);
      if (result) notes.push(result);
      continue;
    }
    const job = game.jobs[event.station]!;
    job.ready = true;
    if (job.recipe === 'pickle') {
      if ((job.deadlines.radish ?? 0) > job.at) light(game, 'radish');
      if ((job.deadlines.salt ?? 0) > job.at) light(game, 'rockSalt');
      light(game, 'pickle');
    }
    if (job.recipe === 'crock') {
      const clay = game.entries.clay;
      if (clay) clay.lit = true;
    }
    if (job.recipe === 'fishSoup' && (job.deadlines.crucian ?? 0) > job.at) light(game, 'crucian');
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
  game.log = [];
  game.account = { income: 0, expenses: 0, royalties: 0 };
  return true;
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
export function tradeLimit(game: Game, item: TradeItem) {
  if (item !== 'seeds') return count(game, item);
  if (!hasRoom(game, item)) return 0;
  return Math.min(game.seedStock, Math.floor(game.coins / TRADE.buy.seeds));
}

export function warnSale(game: Game, item: TradeItem, quantity: number) {
  if (item !== 'radish' || game.entries.radish?.lit) return false;
  const fresh = batchesFor(game, item).some(({ batch }) => (batch.deadline ?? 0) > game.minute);
  return fresh && quantity >= count(game, item);
}

export function trade(game: Game, item: TradeItem, quantity: number) {
  if (game.review || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > tradeLimit(game, item)) {
    return { ok: false, message: '交易未完成，请确认数量、钱袋和背包。' };
  }
  if (item === 'seeds') {
    const total = quantity * TRADE.buy.seeds;
    game.coins -= total;
    game.account.expenses += total;
    game.seedStock -= quantity;
    receive(game, item, quantity);
    return { ok: true, message: record(game, '买入' + ITEMS[item] + ' ×' + quantity + '，支出 ' + total + ' 文。') };
  }
  const total = quantity * TRADE.sell[item];
  consume(game, item, quantity);
  game.coins += total;
  game.account.income += total;
  return { ok: true, message: record(game, '售出' + ITEMS[item] + ' ×' + quantity + '，收入 ' + total + ' 文。') };
}

export function needsSeed(game: Game) {
  return !count(game, 'seeds') && !count(game, 'radish') &&
    !count(game, 'seeds', 'warehouse') && !count(game, 'radish', 'warehouse') && game.plots.every(plot => plot.planted === null);
}

export function claimSeed(game: Game) {
  if (game.review || !needsSeed(game)) return '仍有种子、田间作物或可留种萝卜。';
  if (!hasRoom(game, 'seeds')) return '背包满了。腾出一格后再领取。';
  receive(game, 'seeds', 1);
  return record(game, '从田记所领取补种种子 ×1。');
}

export function saveSeed(game: Game, index: number) {
  const radish = game.bag[index];
  if (game.review || radish?.kind !== 'item' || radish.id !== 'radish') return '背包里没有可留种的萝卜。';
  if (!hasRoom(game, 'seeds', index)) return '背包满了。腾出一格后再留种。';
  consume(game, 'radish', 1, Infinity, index);
  receive(game, 'seeds', SEEDS_PER_RADISH);
  return record(game, '留取种子 ×' + SEEDS_PER_RADISH + '。');
}

export function canSubmit(game: Game) {
  return (['radish', 'rockSalt', 'pickle'] as const).every(id => game.entries[id]?.lit);
}

export function submit(game: Game) {
  if (game.review || !canSubmit(game)) return '记录齐全后可归档。';
  if (game.submitted) return '柳湾第一卷已归档。';
  game.submitted = true;
  return record(game, '柳湾第一卷已归档。');
}
