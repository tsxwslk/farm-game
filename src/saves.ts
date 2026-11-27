import * as z from 'zod';
import { BAG_SLOTS, CROP_IDS, ENTRIES, HOTBAR_COLUMNS, ITEMS, LIUWAN_ROWS, MAX_BAG_SLOTS, RECIPES, RESOURCES, SOUTH_PASS, STARTING_TOOLS, STATIONS,
  TILL_HITS, TOOLS, TRACE_IDS, TRACE_STATES, TRACES, TRADE, WAREHOUSE_SLOTS, WATER_CAPACITY, type Tool } from './content';
import { canTravel, DAY, SAVE_VERSION, waterByRain, type Game } from './game';
import { count, equippedTool, startingInventory } from './inventory';
import type { Plot, World } from './scene';

const whole = z.int().nonnegative();
const minute = z.number().nonnegative();
const point = z.tuple([whole, whole]);
const deadline = minute.nullable();
const tool = z.enum(Object.keys(TOOLS) as (keyof typeof TOOLS)[]);
const item = z.enum(Object.keys(ITEMS) as (keyof typeof ITEMS)[]);
const entryId = z.enum(Object.keys(ENTRIES) as (keyof typeof ENTRIES)[]);
const station = z.enum(Object.keys(STATIONS) as (keyof typeof STATIONS)[]);
const recipe = z.enum(Object.keys(RECIPES) as (keyof typeof RECIPES)[]);
const oldPlot = z.strictObject({ tilled: z.boolean(), planted: deadline, watered: deadline });

const batches = z.array(z.strictObject({ quantity: whole.min(1), deadline })).min(1);
const stack = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tool'), id: tool }),
  z.strictObject({ kind: z.literal('item'), id: item, batches }),
]).nullable();

const gameFields = {
  day: whole.min(1), minute, review: z.boolean(), position: point,
  water: whole.max(WATER_CAPACITY), coins: whole,
  plots: z.array(oldPlot),
  stations: z.partialRecord(station, point),
  entries: z.partialRecord(entryId, z.strictObject({ lit: z.boolean(), deadline })),
  jobs: z.partialRecord(station, z.strictObject({
    recipe, started: minute, at: minute, ready: z.boolean(), deadlines: z.partialRecord(item, deadline),
  })),
  strikes: z.record(z.string(), whole.min(1)),
  depleted: z.record(z.string(), whole.min(1)),
  action: z.strictObject({ key: z.string(), tool, at: minute }).nullable(),
  chestOpened: z.boolean(), submitted: z.boolean(), seedStock: whole.max(TRADE.dailySeeds),
  log: z.array(z.string().max(250)).max(50),
  account: z.strictObject({ income: whole, expenses: whole, royalties: whole }),
};
const previousGame = z.strictObject({
  ...gameFields,
  hotbarRow: whole.max(BAG_SLOTS / HOTBAR_COLUMNS - 1),
  equippedSlot: whole.max(BAG_SLOTS - 1).nullable(),
  bag: z.array(stack).length(BAG_SLOTS), warehouse: z.array(stack).length(WAREHOUSE_SLOTS),
});
const gameV7 = previousGame.extend({
  schemaVersion: z.literal(7),
  plots: z.array(oldPlot.extend({ crop: z.enum(CROP_IDS).nullable() })),
  commissions: z.strictObject({ radishStockDay: whole, trailFood: z.boolean() }),
});
const gameV8 = gameV7.extend({
  schemaVersion: z.literal(8),
  hotbarRow: whole.max(MAX_BAG_SLOTS / HOTBAR_COLUMNS - 1),
  equippedSlot: whole.max(MAX_BAG_SLOTS - 1).nullable(),
  bag: z.array(stack).min(BAG_SLOTS).max(MAX_BAG_SLOTS).refine(slots => slots.length % HOTBAR_COLUMNS === 0),
  warehouse: z.array(stack).min(WAREHOUSE_SLOTS).refine(slots => slots.length % WAREHOUSE_SLOTS === 0),
});
const traceState = z.enum(TRACE_STATES);
const gameV9 = gameV8.extend({
  schemaVersion: z.literal(9),
  mustardTrace: traceState,
  pakChoiSeedStock: whole.max(TRADE.dailySeeds),
});
const gameSchema = gameV9.omit({ mustardTrace: true }).extend({
  schemaVersion: z.literal(SAVE_VERSION),
  traces: z.record(z.enum(TRACE_IDS), traceState),
});

const saveSchema = z.strictObject({
  id: z.uuid(), savedAt: z.iso.datetime(), game: gameSchema,
});
export type Save = z.infer<typeof saveSchema>;

const legacySlots = [
  'hoe', 'pick', 'can', 'axe', 'rod', 'seeds', 'radish', 'hand',
  'wood', 'stone', 'clay', 'rockSalt', 'salt', 'pickle', 'crock', null,
] as const;
const legacySave = saveSchema.extend({
  game: z.strictObject({
    ...gameFields, schemaVersion: z.literal(1),
    tool: z.union([tool, z.literal('hand')]),
    selectedSeeds: z.boolean(), hotbarSlot: whole.max(legacySlots.length - 1).optional(),
    bag: z.partialRecord(item, batches),
  }),
});

const migrations: Partial<Record<number, (save: unknown, world: World) => unknown>> = {
  1(value) {
    const parsed = legacySave.safeParse(value);
    if (!parsed.success) throw new Error('旧存档格式有误。');
    const { tool, selectedSeeds, hotbarSlot, bag: oldBag, ...previous } = parsed.data.game;
    if (Object.keys(oldBag).length > 8) throw new Error('旧存档的背包容量有误。');
    const inventory = startingInventory(!previous.chestOpened);
    for (const [id, stack] of Object.entries(oldBag)) {
      const index = legacySlots.findIndex(slot => slot === id);
      if (index < 0) throw new Error('旧存档中有未知物品。');
      inventory.bag[index] = { kind: 'item', id: id as keyof typeof ITEMS, batches: stack };
    }
    const index = hotbarSlot ?? legacySlots.indexOf(tool === 'hand' && selectedSeeds ? 'seeds' : tool);
    return {
      ...parsed.data, game: {
        ...previous, ...inventory, schemaVersion: 2, hotbarRow: Math.floor(index / HOTBAR_COLUMNS),
        equippedSlot: inventory.bag[index] ? index : null,
      },
    };
  },
  2(value, world) {
    const parsed = saveSchema.extend({ game: previousGame.extend({ schemaVersion: z.literal(2) }) }).safeParse(value);
    if (!parsed.success || parsed.data.game.plots.length !== 12) throw new Error('旧存档格式有误。');
    const { game } = parsed.data;
    return {
      ...parsed.data,
      game: {
        ...game, schemaVersion: 3,
        plots: world.legacyPlots.map(({ id }) => game.plots[id] ?? { tilled: false, planted: null, watered: null }),
        action: game.action?.key.startsWith('plot-') ? game.action : null,
      },
    };
  },
  3(value) {
    const parsed = saveSchema.extend({ game: previousGame.extend({ schemaVersion: z.literal(3) }) }).safeParse(value);
    if (!parsed.success) throw new Error('旧存档格式有误。');
    const { game } = parsed.data;
    const resourceIds: Record<string, string> = { 'north-willow': 'north-oak', 'east-willow': 'east-oak' };
    const renameResource = (key: string) => Object.hasOwn(resourceIds, key) ? resourceIds[key] : key;
    const renameProgress = (progress: Record<string, number>) =>
      Object.fromEntries(Object.entries(progress).map(([key, count]) => [renameResource(key), count]));
    return {
      ...parsed.data,
      game: {
        ...game, schemaVersion: 4,
        strikes: renameProgress(game.strikes),
        depleted: renameProgress(game.depleted),
        action: game.action && { ...game.action, key: renameResource(game.action.key) },
      },
    };
  },
  4(value, world) {
    const parsed = saveSchema.extend({ game: previousGame.extend({ schemaVersion: z.literal(4) }) }).safeParse(value);
    if (!parsed.success || parsed.data.game.plots.length !== world.legacyPlots.length) throw new Error('旧存档格式有误。');
    const { game } = parsed.data;
    const plots: Omit<Plot, 'crop'>[] = world.plots.map(() => ({ tilled: false, planted: null, watered: null }));
    const migratedKeys = new Map<string, string>();
    for (const old of world.legacyPlots) {
      const x = old.x / 32, y = old.y / 32;
      const tileIds = [0, 1, world.cols, world.cols + 1]
        .map(offset => world.plotIds[y * world.cols + x + offset]).filter(id => id >= 0);
      const previous = game.plots[old.id];
      const cropId = tileIds.at(-1)!;
      if (previous.tilled) {
        for (const id of tileIds) plots[id].tilled = true;
        plots[cropId] = previous;
      }
      const standing = world.plotIds[game.position[1] * world.cols + game.position[0]];
      migratedKeys.set('plot-' + old.id, 'plot-' + (tileIds.includes(standing) ? standing : cropId));
    }
    const migrateKey = (key: string) => migratedKeys.get(key) ?? key;
    return {
      ...parsed.data,
      game: {
        ...game, schemaVersion: 5, plots,
        strikes: Object.fromEntries(Object.entries(game.strikes).map(([key, count]) => [migrateKey(key), count])),
        action: game.action && { ...game.action, key: migrateKey(game.action.key) },
      },
    };
  },
  5(value) {
    const parsed = saveSchema.extend({ game: previousGame.extend({ schemaVersion: z.literal(5) }) }).safeParse(value);
    if (!parsed.success) throw new Error('旧存档格式有误。');
    const { game } = parsed.data;
    for (const stack of [...game.bag, ...game.warehouse]) {
      if (stack?.kind !== 'item' || stack.id !== 'salt') continue;
      // One old unit covered one jar of pickles, which now takes three seasoning portions.
      for (const batch of stack.batches) batch.quantity *= 3;
    }
    return { ...parsed.data, game: { ...game, schemaVersion: 6 } };
  },
  6(value) {
    const parsed = saveSchema.extend({ game: previousGame.extend({ schemaVersion: z.literal(6) }) }).safeParse(value);
    if (!parsed.success) throw new Error('旧存档格式有误。');
    const { game } = parsed.data;
    return { ...parsed.data, game: {
      ...game, schemaVersion: 7,
      plots: game.plots.map(plot => ({ ...plot, crop: plot.planted === null ? null : 'radish' })),
      commissions: { radishStockDay: 0, trailFood: false },
    } };
  },
  7(value) {
    const parsed = saveSchema.extend({ game: gameV7 }).safeParse(value);
    if (!parsed.success) throw new Error('旧存档格式有误。');
    return { ...parsed.data, game: { ...parsed.data.game, schemaVersion: 8 } };
  },
  8(value) {
    const parsed = saveSchema.extend({ game: gameV8 }).safeParse(value);
    if (!parsed.success) throw new Error('旧存档格式有误。');
    return { ...parsed.data, game: { ...parsed.data.game, schemaVersion: 9,
      mustardTrace: 'unfound', pakChoiSeedStock: TRADE.dailySeeds } };
  },
  9(value) {
    const parsed = saveSchema.extend({ game: gameV9 }).safeParse(value);
    if (!parsed.success) throw new Error('旧存档格式有误。');
    const { mustardTrace, ...game } = parsed.data.game;
    return { ...parsed.data, game: { ...game, schemaVersion: 10, traces: { mustard: mustardTrace, perilla: 'unfound' } } };
  },
};

export function validateSave(value: unknown, world: World): Save {
  const version = (value as Partial<Save> | null)?.game?.schemaVersion;
  if (typeof version === 'number' && version > SAVE_VERSION) throw new Error('这份存档来自更新的游戏版本。');
  let migrated = value;
  for (let current = version ?? SAVE_VERSION; current < SAVE_VERSION; current++) {
    const migrate = migrations[current];
    if (!migrate) throw new Error('目前无法读取这份旧版本存档。');
    migrated = migrate(migrated, world);
  }
  const parsed = saveSchema.safeParse(migrated);
  if (!parsed.success) throw new Error('存档格式有误。');

  const { game } = parsed.data;
  // Older saves also logged farm actions. Keep only the financial entries they still have.
  game.log = game.log.filter(message => /(?:，(?:收入|支出) [1-9]\d* 文。|，稿酬 \+[1-9]\d* 文$)/.test(message));
  const { bounds } = SOUTH_PASS;
  const inBounds = ([x, y]: Game['position']) =>
    x < world.cols && y < world.rows && world.cells[y * world.cols + x] !== 'water' &&
    (y < LIUWAN_ROWS || canTravel(game) && y >= bounds.y && x >= bounds.x && x < bounds.x + bounds.width);
  const hitsFor = (key: string, tool?: Tool) => {
    if (Object.hasOwn(RESOURCES, key)) {
      const resource = RESOURCES[key];
      return !tool || resource.tool === tool ? resource.hits : 0;
    }
    const plot = /^plot-(\d+)$/.exec(key);
    const state = plot && game.plots[Number(plot[1])];
    if (!state) return 0;
    if (tool === 'pick') return state.tilled && state.planted === null ? 1 : 0;
    return (!tool || tool === 'hoe') && !state.tilled ? TILL_HITS : 0;
  };
  const end = game.day * DAY;
  const toolIds = [...game.bag, ...game.warehouse].flatMap(slot => slot?.kind === 'tool' ? [slot.id] : []);
  const positions = [game.position, ...Object.values(game.stations)];
  if (game.plots.length !== world.plots.length || game.minute < end - DAY ||
      (game.review ? game.minute !== end : game.minute >= end) || !positions.every(inBounds) ||
      Object.values(game.stations).some(([, y]) => y >= LIUWAN_ROWS) ||
      game.commissions.radishStockDay > game.day ||
      (!game.submitted && (game.commissions.radishStockDay > 0 || game.commissions.trailFood)) ||
      (game.commissions.trailFood && !game.entries.pakChoi?.lit) ||
      new Set(positions.map(value => value.join(','))).size !== positions.length ||
      game.hotbarRow >= game.bag.length / HOTBAR_COLUMNS ||
      (game.equippedSlot !== null && (!game.bag[game.equippedSlot] || Math.floor(game.equippedSlot / HOTBAR_COLUMNS) !== game.hotbarRow)) ||
      toolIds.length !== STARTING_TOOLS.length || new Set(toolIds).size !== STARTING_TOOLS.length ||
      Object.entries(game.depleted).some(([id, day]) => !Object.hasOwn(RESOURCES, id) || day > game.day) ||
      Object.entries(game.strikes).some(([key, hits]) => hits >= hitsFor(key) || game.depleted[key]) ||
      (game.action && (!hitsFor(game.action.key, game.action.tool) || game.action.at <= game.minute || game.action.tool !== equippedTool(game))) ||
      game.plots.some(plot => (plot.crop === null) !== (plot.planted === null) ||
        (plot.planted !== null && (!plot.tilled || plot.planted > game.minute)) ||
        (plot.watered !== null && (plot.planted === null || plot.watered < plot.planted || plot.watered > game.minute))) ||
      Object.entries(game.jobs).some(([id, job]) =>
        !game.stations[id as keyof Game['stations']] || RECIPES[job.recipe].station !== id ||
        job.started > game.minute || Math.abs(job.at - job.started - RECIPES[job.recipe].duration) > 1e-6 ||
        job.ready !== (job.at <= game.minute))) {
    throw new Error('存档内的时间、位置或物品状态有误。');
  }

  // Older saves can still show that a product was made, even if it was sold or used.
  const jobs = Object.values(game.jobs);
  const hasProduct = (id: 'salt' | 'fishSoup') => count(game, id) || count(game, id, 'warehouse') ||
    jobs.some(job => job.ready && RECIPES[job.recipe].output === id);
  if (hasProduct('fishSoup') || game.entries.crucian?.lit) {
    game.entries.fishSoup ??= { lit: true, deadline: null };
  }
  if (hasProduct('salt') || game.entries.pickle?.lit || game.entries.pakChoiPickle?.lit ||
      game.entries.fishSoup?.lit || jobs.some(job => 'salt' in RECIPES[job.recipe].inputs)) {
    game.entries.salt ??= { lit: true, deadline: null };
  }
  for (const id of TRACE_IDS) {
    const { item, inSouthPass } = TRACES[id];
    const state = game.traces[id];
    const held = count(game, item) + count(game, item, 'warehouse');
    if (held !== Number(state === 'collected') || (state === 'restored') !== Boolean(game.entries[id]) ||
        (inSouthPass && state !== 'unfound' && !canTravel(game))) {
      throw new Error('存档内的余绪状态有误。');
    }
  }
  if (typeof version === 'number' && version < 9) waterByRain(game);
  return parsed.data;
}

const STORE = 'slots';
const ACTIVE = 'active';

export async function openSaves() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('wu-zhi-liuwan', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('请关闭仍在使用旧存档格式的游戏页面。'));
  });
  db.onversionchange = () => db.close();

  const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let queued: Promise<void> = Promise.resolve();
  function mutate(change: (store: IDBObjectStore) => void) {
    const commit = queued.then(() => new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      change(store);
    }));
    queued = commit.catch(() => {});
    return commit;
  }
  return {
    write(save: Save, activate = false) {
      return mutate(store => {
        store.put(save, save.id);
        if (activate) store.put(save.id, ACTIVE);
      });
    },
    async remove(id: string) {
      if (id === ACTIVE) return false;
      let removed = false;
      await mutate(store => {
        const request = store.get(ACTIVE);
        request.onsuccess = () => {
          if (request.result === id) return;
          store.delete(id);
          removed = true;
        };
      });
      return removed;
    },
    async active() {
      const store = db.transaction(STORE).objectStore(STORE);
      const id = await read<string | undefined>(store.get(ACTIVE));
      return id ? await read<unknown>(store.get(id)) : undefined;
    },
    async list() {
      const store = db.transaction(STORE).objectStore(STORE);
      const [keys, rows] = await Promise.all([
        read(store.getAllKeys()),
        read<unknown[]>(store.getAll()),
      ]);
      return keys.flatMap((id, index) =>
        typeof id === 'string' && id !== ACTIVE ? [{ id, data: rows[index] }] : []);
    },
  };
}

export function snapshot(game: Game, id: string): Save {
  return { id, savedAt: new Date().toISOString(), game: structuredClone(game) };
}
