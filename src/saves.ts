import * as z from 'zod';
import { BAG_SLOTS, ENTRIES, HOTBAR_COLUMNS, ITEMS, RECIPES, RESOURCES, STARTING_TOOLS, STATIONS, TILL_HITS, TOOLS, TRADE, WAREHOUSE_SLOTS, WATER_CAPACITY } from './content';
import { DAY, SAVE_VERSION, type Game } from './game';
import { equippedTool, startingInventory } from './inventory';
import type { World } from './scene';

const whole = z.int().nonnegative();
const minute = z.number().nonnegative();
const point = z.tuple([whole, whole]);
const deadline = minute.nullable();
const tool = z.enum(Object.keys(TOOLS) as (keyof typeof TOOLS)[]);
const item = z.enum(Object.keys(ITEMS) as (keyof typeof ITEMS)[]);
const entryId = z.enum(Object.keys(ENTRIES) as (keyof typeof ENTRIES)[]);
const station = z.enum(Object.keys(STATIONS) as (keyof typeof STATIONS)[]);
const recipe = z.enum(Object.keys(RECIPES) as (keyof typeof RECIPES)[]);

const batches = z.array(z.strictObject({ quantity: whole.min(1), deadline })).min(1);
const stack = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tool'), id: tool }),
  z.strictObject({ kind: z.literal('item'), id: item, batches }),
]).nullable();

const gameFields = {
  day: whole.min(1), minute, review: z.boolean(), position: point,
  water: whole.max(WATER_CAPACITY), coins: whole,
  plots: z.array(z.strictObject({ tilled: z.boolean(), planted: deadline, watered: deadline })),
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
const gameSchema = z.strictObject({
  ...gameFields, schemaVersion: z.literal(SAVE_VERSION),
  hotbarRow: whole.max(BAG_SLOTS / HOTBAR_COLUMNS - 1),
  equippedSlot: whole.max(BAG_SLOTS - 1).nullable(),
  bag: z.array(stack).length(BAG_SLOTS), warehouse: z.array(stack).length(WAREHOUSE_SLOTS),
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

const migrations: Partial<Record<number, (save: unknown) => unknown>> = {
  1(value) {
    const parsed = legacySave.safeParse(value);
    if (!parsed.success) throw new Error('旧存档格式有误。');
    const { tool, selectedSeeds, hotbarSlot, bag: oldBag, ...previous } = parsed.data.game;
    if (Object.keys(oldBag).length > 8) throw new Error('旧存档的背包容量有误。');
    const inventory = startingInventory(!previous.chestOpened);
    for (const [id, stack] of Object.entries(oldBag)) {
      const index = legacySlots.indexOf(id as keyof typeof ITEMS);
      inventory.bag[index] = { kind: 'item', id: id as keyof typeof ITEMS, batches: stack };
    }
    const index = hotbarSlot ?? legacySlots.indexOf(tool === 'hand' && selectedSeeds ? 'seeds' : tool);
    return {
      ...parsed.data, game: {
        ...previous, ...inventory, schemaVersion: SAVE_VERSION, hotbarRow: Math.floor(index / HOTBAR_COLUMNS),
        equippedSlot: inventory.bag[index] ? index : null,
      },
    };
  },
};

export function validateSave(value: unknown, world: World): Save {
  const version = (value as Partial<Save> | null)?.game?.schemaVersion;
  if (typeof version === 'number' && version > SAVE_VERSION) throw new Error('这份存档来自更新的游戏版本。');
  let migrated = value;
  for (let current = version ?? SAVE_VERSION; current < SAVE_VERSION; current++) {
    const migrate = migrations[current];
    if (!migrate) throw new Error('目前无法读取这份旧版本存档。');
    migrated = migrate(migrated);
  }
  const parsed = saveSchema.safeParse(migrated);
  if (!parsed.success) throw new Error('存档格式有误。');

  const { game } = parsed.data;
  const inBounds = ([x, y]: Game['position']) =>
    x < world.cols && y < world.rows && world.cells[y * world.cols + x] !== 'water';
  const hitsFor = (key: string) => {
    if (Object.hasOwn(RESOURCES, key)) return RESOURCES[key].hits;
    const plot = /^plot-(\d+)$/.exec(key);
    return plot && game.plots[Number(plot[1])] && !game.plots[Number(plot[1])].tilled ? TILL_HITS : 0;
  };
  const end = game.day * DAY;
  const toolIds = [...game.bag, ...game.warehouse].flatMap(slot => slot?.kind === 'tool' ? [slot.id] : []);
  const positions = [game.position, ...Object.values(game.stations)];
  if (game.plots.length !== world.plots.length || game.minute < end - DAY ||
      (game.review ? game.minute !== end : game.minute >= end) || !positions.every(inBounds) ||
      new Set(positions.map(value => value.join(','))).size !== positions.length ||
      (game.equippedSlot !== null && (!game.bag[game.equippedSlot] || Math.floor(game.equippedSlot / HOTBAR_COLUMNS) !== game.hotbarRow)) ||
      toolIds.length !== STARTING_TOOLS.length || new Set(toolIds).size !== STARTING_TOOLS.length ||
      Object.entries(game.depleted).some(([id, day]) => !Object.hasOwn(RESOURCES, id) || day > game.day) ||
      Object.entries(game.strikes).some(([key, hits]) => hits >= hitsFor(key) || game.depleted[key]) ||
      (game.action && (!hitsFor(game.action.key) || game.action.at <= game.minute || game.action.tool !== equippedTool(game))) ||
      game.plots.some(plot => (plot.planted !== null && (!plot.tilled || plot.planted > game.minute)) ||
        (plot.watered !== null && (plot.planted === null || plot.watered < plot.planted || plot.watered > game.minute))) ||
      Object.entries(game.jobs).some(([id, job]) =>
        !game.stations[id as keyof Game['stations']] || RECIPES[job.recipe].station !== id ||
        job.started > game.minute || Math.abs(job.at - job.started - RECIPES[job.recipe].duration) > 1e-6 ||
        job.ready !== (job.at <= game.minute))) {
    throw new Error('存档内的时间、位置或物品状态有误。');
  }
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
  function write(save: Save, activate = false) {
    const commit = queued.then(() => new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      store.put(save, save.id);
      if (activate) store.put(save.id, ACTIVE);
    }));
    queued = commit.catch(() => {});
    return commit;
  }
  return {
    write,
    async active() {
      const store = db.transaction(STORE).objectStore(STORE);
      const id = await read<string | undefined>(store.get(ACTIVE));
      return id ? await read<unknown>(store.get(id)) : undefined;
    },
    async list() {
      const rows = await read<unknown[]>(db.transaction(STORE).objectStore(STORE).getAll());
      return rows.filter((row): row is object => typeof row === 'object' && row !== null);
    },
  };
}

export function snapshot(game: Game, id: string): Save {
  return { id, savedAt: new Date().toISOString(), game: structuredClone(game) };
}
