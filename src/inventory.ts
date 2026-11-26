import {
  BAG_SLOTS, HOTBAR_COLUMNS, ITEMS, STARTING_SEEDS, STARTING_TOOLS, TOOLS, WAREHOUSE_SLOTS,
  type Item, type Tool,
} from './content';
import type { Game } from './game';

export interface Batch {
  quantity: number;
  deadline: number | null;
}
export interface ItemStack {
  kind: 'item';
  id: Item;
  batches: Batch[];
}
export type Stack = ItemStack | { kind: 'tool'; id: Tool };
export type Storage = 'bag' | 'warehouse';
export interface SlotAddress {
  storage: Storage;
  index: number;
}

export function startingInventory(withSeeds = true) {
  const bag = Array<Stack | null>(BAG_SLOTS).fill(null);
  for (const [i, id] of STARTING_TOOLS.entries()) bag[i] = { kind: 'tool', id };
  const warehouse = Array<Stack | null>(WAREHOUSE_SLOTS).fill(null);
  if (withSeeds) warehouse[0] = { kind: 'item', id: 'seeds', batches: [{ quantity: STARTING_SEEDS, deadline: null }] };
  return { bag, warehouse };
}

export function stackName(stack: Stack) {
  return stack.kind === 'tool' ? TOOLS[stack.id].name : ITEMS[stack.id];
}

export function stackCount(stack: ItemStack) {
  return stack.batches.reduce((total, batch) => total + batch.quantity, 0);
}

export function count(game: Game, item: Item, storage: Storage = 'bag') {
  return game[storage].reduce((sum, stack) => sum + (stack?.kind === 'item' && stack.id === item ? stackCount(stack) : 0), 0);
}

export function equippedStack(game: Game) {
  return game.equippedSlot === null ? null : game.bag[game.equippedSlot];
}

export function equippedTool(game: Game) {
  const stack = equippedStack(game);
  return stack?.kind === 'tool' ? stack.id : undefined;
}

export function equipSlot(game: Game, index: number | null, row = index === null ? game.hotbarRow : Math.floor(index / HOTBAR_COLUMNS)) {
  const selected = index !== null && game.bag[index] ? index : null;
  if (row === game.hotbarRow && selected === game.equippedSlot) return false;
  game.action = null;
  game.equippedSlot = selected;
  game.hotbarRow = row;
  return true;
}

function mergeBatch(stack: ItemStack, batch: Batch) {
  const existing = stack.batches.find(candidate => candidate.deadline === batch.deadline);
  if (existing) existing.quantity += batch.quantity;
  else stack.batches.push(batch);
}

export function moveStack(game: Game, from: SlotAddress, to: SlotAddress) {
  if (game.review || (from.storage === to.storage && from.index === to.index)) return false;
  const origin = game[from.storage];
  const destination = game[to.storage];
  const stack = origin[from.index];
  const target = destination[to.index];
  if (!stack || target === undefined) return false;
  const merge = stack.kind === 'item' && target?.kind === 'item' && stack.id === target.id;
  if (merge) {
    for (const batch of stack.batches) mergeBatch(target, batch);
    origin[from.index] = null;
  } else {
    origin[from.index] = target;
    destination[to.index] = stack;
  }
  if (from.storage === 'bag' && game.equippedSlot === from.index) {
    equipSlot(game, to.storage === 'bag' ? to.index : null);
  } else if (!merge && to.storage === 'bag' && game.equippedSlot === to.index) {
    equipSlot(game, from.storage === 'bag' ? from.index : null);
  }
  return true;
}

export function receive(game: Game, item: Item, quantity: number, deadline: number | null = null) {
  const matching = game.bag.find(stack => stack?.kind === 'item' && stack.id === item);
  if (matching?.kind === 'item') {
    mergeBatch(matching, { quantity, deadline });
    return;
  }
  const index = game.bag.indexOf(null);
  if (index !== -1) game.bag[index] = { kind: 'item', id: item, batches: [{ quantity, deadline }] };
}

export function batchesFor(game: Game, item: Item) {
  return game.bag.flatMap((stack, index) => stack?.kind === 'item' && stack.id === item
    ? stack.batches.map(batch => ({ stack, index, batch })) : []);
}

export function consume(game: Game, item: Item, quantity: number, neededUntil = Infinity, slot?: number): number | null {
  const stock = batchesFor(game, item).filter(({ index }) => slot === undefined || index === slot);
  // Use an eligible batch for recipes, and spend expired stock first for ordinary uses.
  stock.sort((a, b) => priority(a.batch) - priority(b.batch));
  function priority(batch: Batch) {
    if (batch.deadline === null || batch.deadline <= game.minute) return 1;
    return batch.deadline > neededUntil ? 0 : 2;
  }
  let deadline: number | null = null;
  for (const { stack, index, batch } of stock) {
    if (!quantity) break;
    // A mixed input can qualify if any of the units actually consumed is still eligible.
    if (batch.deadline !== null && (deadline === null || batch.deadline > deadline)) deadline = batch.deadline;
    const removed = Math.min(batch.quantity, quantity);
    batch.quantity -= removed;
    quantity -= removed;
    if (!batch.quantity) stack.batches.splice(stack.batches.indexOf(batch), 1);
    if (stack.batches.length) continue;
    game.bag[index] = null;
    if (game.equippedSlot === index) equipSlot(game, null);
  }
  return deadline;
}

export function hasRoom(game: Game, item: Item, removing?: number) {
  const outgoing = removing === undefined ? null : game.bag[removing];
  return count(game, item) > 0 || game.bag.includes(null) ||
    (outgoing?.kind === 'item' && stackCount(outgoing) === 1);
}
