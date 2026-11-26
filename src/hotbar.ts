import { assetUrl } from './assets';
import { BAG_SLOTS, CROPS, CROP_IDS, HOTBAR_COLUMNS, WATER_CAPACITY, type Item, type Tool } from './content';
import type { Game } from './game';
import { equippedStack, stackCount, stackName, type SlotAddress, type Stack, type Storage } from './inventory';
type Pixel = [color: string, x: number, y: number, width: number, height: number];

const wood = '#8e5c3c';
const lightWood = '#d1a26b';
const shadow = '#465650';
const iconFiles: Partial<Record<Tool | Item, string>> = {
  hoe: 'assets/tools/hoe-16x16.png',
  pick: 'assets/tools/pick-16x16.png',
  can: 'assets/tools/can-16x16.png',
  axe: 'assets/tools/axe-16x16.png',
  rod: 'assets/tools/rod-16x16.png',
  crock: 'assets/jar/jar-crock-48x48.png',
  kiln: 'assets/kiln/salt-stove-inventory-16x16.png',
  crucian: 'assets/fish/crucian-32x32.png',
  fishSoup: 'assets/fish/crucian-soup-32x32.png',
};
const seedPacket: Pixel[] = [
  [wood, 2, 1, 12, 14], ['#d1ab72', 3, 2, 10, 12], ['#e8cb91', 3, 3, 10, 1], ['#ecd4a1', 4, 4, 8, 9],
];
const pickleJar: Pixel[] = [
  ['#745035', 2, 6, 12, 8], ['#9c6448', 3, 7, 10, 6], ['#6b472e', 1, 5, 14, 3],
  ['#ddb271', 2, 5, 12, 2], ['#ae7952', 4, 6, 8, 2], ['#bb8659', 4, 10, 3, 3],
];
const pickleRim: Pixel[] = [
  ['#744c31', 1, 8, 14, 2], ['#dfa871', 2, 8, 12, 1], ['#a96e49', 3, 9, 10, 1],
];
const pixels: Partial<Record<Tool | Item, Pixel[]>> = {
  wood: [[wood, 2, 7, 11, 5], [lightWood, 3, 7, 8, 2], [wood, 4, 5, 10, 3], [lightWood, 5, 4, 7, 2],
    ['#e3b87b', 11, 8, 3, 3], ['#e3b87b', 12, 5, 2, 2]],
  stone: [[shadow, 2, 8, 12, 5], ['#797b6f', 3, 7, 10, 5], ['#a9aa95', 5, 5, 6, 4], ['#c2bdaa', 5, 5, 4, 1]],
  clay: [[wood, 2, 9, 12, 4], ['#ae8067', 3, 7, 10, 5], ['#c59c83', 5, 6, 5, 3], ['#885d51', 7, 10, 5, 2]],
  rockSalt: [[shadow, 2, 8, 12, 5], ['#81786f', 3, 7, 10, 5], ['#e0c3b8', 5, 6, 3, 4],
    ['#fff0dd', 6, 5, 2, 3], ['#f5dbc7', 9, 8, 3, 2]],
  salt: [[shadow, 2, 9, 12, 4], ['#a99c83', 3, 8, 10, 4], ['#e8dcca', 4, 7, 8, 3], ['#fbefdb', 6, 5, 4, 3]],
  crucian: [[shadow, 3, 6, 10, 5], ['#a3b0a7', 5, 5, 7, 7], ['#cbd0b5', 6, 7, 7, 3],
    ['#74867b', 2, 5, 3, 7], [shadow, 11, 7, 1, 1]],
  fishSoup: [[wood, 2, 8, 12, 4], ['#dc9e5f', 3, 7, 10, 3], ['#ede1b2', 4, 8, 8, 2], ['#b68251', 4, 12, 8, 2]],
  pakChoi: [['#355840', 3, 4, 10, 6], ['#729657', 5, 3, 6, 5], ['#b5c6a0', 5, 8, 6, 5],
    ['#e1e2c1', 7, 8, 3, 6]],
};

function icon(file: string | undefined, fallback: Pixel[]) {
  const url = file && assetUrl(file);
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    return image;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d')!;
  for (const [color, x, y, width, height] of fallback) {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  }
  return canvas;
}

export function stackIcon(stack: Stack) {
  const crop = CROP_IDS.find(id => id === stack.id || CROPS[id].seed === stack.id || CROPS[id].pickle === stack.id);
  if (crop) {
    const harvest = icon('assets/' + CROPS[crop].art + '/05-inventory.png', pixels[crop] ?? []);
    if (crop === stack.id) return harvest;
    const isSeed = CROPS[crop].seed === stack.id;
    const container = document.createElement('span');
    container.className = 'stack-composite ' + (isSeed ? 'seed-packet' : 'pickled-crop');
    container.setAttribute('aria-hidden', 'true');
    harvest.className = 'stack-crop';
    container.append(isSeed ? icon('assets/seed-bags/base-32x32.png', seedPacket)
      : icon('assets/pickles/base-32x32.png', pickleJar), harvest);
    if (!isSeed) container.append(icon('assets/pickles/rim-32x32.png', pickleRim));
    return container;
  }
  const picture = icon(iconFiles[stack.id], pixels[stack.id] ?? []);
  if (stack.kind === 'tool' && picture instanceof HTMLImageElement) picture.className = 'tool-icon';
  return picture;
}

export function describeSlot(game: Game, stack: Stack) {
  if (stack.id === 'can') return stackName(stack) + ' ' + game.water + '/' + WATER_CAPACITY;
  return stackName(stack) + (stack.kind === 'item' ? ' ×' + stackCount(stack) : '');
}

function slotButton(address: SlotAddress, select: (address: SlotAddress) => void, shortcut: boolean) {
  const { storage, index } = address;
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'inventory-slot';
  control.dataset.storage = storage;
  control.dataset.index = String(index);
  const key = document.createElement('span');
  key.className = 'slot-key';
  key.textContent = shortcut ? String(index % HOTBAR_COLUMNS + 1) : '';
  key.setAttribute('aria-hidden', 'true');
  const picture = document.createElement('span');
  picture.className = 'slot-icon';
  const quantity = document.createElement('span');
  quantity.className = 'slot-quantity';
  quantity.setAttribute('aria-hidden', 'true');
  control.append(key, picture, quantity);
  control.addEventListener('click', () => select(address));
  let previous: Tool | Item | null = null;
  return { control, update(game: Game, selection: SlotAddress | null, draggable: boolean) {
    const stack = game[storage][index];
    const id = stack?.id ?? null;
    if (id !== previous) {
      picture.replaceChildren(...(stack ? [stackIcon(stack)] : []));
      previous = id;
    }
    const label = stack ? describeSlot(game, stack) : '空格';
    control.setAttribute('aria-label', '第 ' + (shortcut ? index % HOTBAR_COLUMNS + 1 : index + 1) + ' 格 · ' + label);
    control.setAttribute('aria-pressed', String(selection?.storage === storage && selection.index === index));
    control.classList.toggle('slot-equipped', storage === 'bag' && game.equippedSlot === index);
    control.draggable = draggable && Boolean(stack);
    quantity.textContent = stack?.kind === 'item' ? String(stackCount(stack)) : id === 'can' ? String(game.water) : '';
  } };
}

export function makeSlotRow(storage: Storage, start: number, select: (address: SlotAddress) => void, shortcut = false) {
  const row = document.createElement('div');
  row.className = 'slot-row';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', '第 ' + (Math.floor(start / HOTBAR_COLUMNS) + 1) + ' 排');
  const slots = Array.from({ length: HOTBAR_COLUMNS }, (_, i) => slotButton({ storage, index: start + i }, select, shortcut));
  row.append(...slots.map(slot => slot.control));
  return { row, update(game: Game, selected: SlotAddress | null, draggable = false) {
    for (const slot of slots) slot.update(game, selected, draggable);
  } };
}

export function createHotbar(select: (index: number) => void) {
  const totalRows = BAG_SLOTS / HOTBAR_COLUMNS;
  const rows = Array.from({ length: totalRows }, (_, row) =>
    makeSlotRow('bag', row * HOTBAR_COLUMNS, ({ index }) => select(index), true));
  const page = document.getElementById('hotbar-page-number')!;
  const label = document.getElementById('hotbar-selection')!;
  document.getElementById('hotbar-rows')!.append(...rows.map(item => item.row));
  let previous = '';
  return (game: Game) => {
    const index = game.equippedSlot;
    const activeRow = game.hotbarRow;
    const visible = game.bag.slice(activeRow * HOTBAR_COLUMNS, (activeRow + 1) * HOTBAR_COLUMNS);
    const signature = [activeRow, index, game.water, ...visible.map(stack => stack &&
      (stack.kind === 'item' ? stack.id + ':' + stackCount(stack) : stack.id))].join('/');
    if (signature === previous) return;
    previous = signature;
    rows.forEach(({ row, update }, i) => {
      row.hidden = i !== activeRow;
      if (i === activeRow) update(game, index === null ? null : { storage: 'bag', index });
    });
    page.textContent = (activeRow + 1) + '/' + totalRows;
    const equipped = equippedStack(game);
    label.textContent = equipped ? describeSlot(game, equipped) : '未选中物品';
  };
}
