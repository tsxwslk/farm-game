import { assetUrl } from './assets';
import { CROPS, CROP_IDS, HOTBAR_COLUMNS, MAX_BAG_SLOTS, WATER_CAPACITY, type Item, type Tool } from './content';
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
const pixels: Partial<Record<Item, Pixel[]>> = {
  wood: [[wood, 2, 7, 11, 5], [lightWood, 3, 7, 8, 2], [wood, 4, 5, 10, 3], [lightWood, 5, 4, 7, 2],
    ['#e3b87b', 11, 8, 3, 3], ['#e3b87b', 12, 5, 2, 2]],
  stone: [[shadow, 2, 8, 12, 5], ['#797b6f', 3, 7, 10, 5], ['#a9aa95', 5, 5, 6, 4], ['#c2bdaa', 5, 5, 4, 1]],
  clay: [[wood, 2, 9, 12, 4], ['#ae8067', 3, 7, 10, 5], ['#c59c83', 5, 6, 5, 3], ['#885d51', 7, 10, 5, 2]],
  rockSalt: [[shadow, 2, 8, 12, 5], ['#81786f', 3, 7, 10, 5], ['#e0c3b8', 5, 6, 3, 4],
    ['#fff0dd', 6, 5, 2, 3], ['#f5dbc7', 9, 8, 3, 2]],
  salt: [[shadow, 2, 9, 12, 4], ['#a99c83', 3, 8, 10, 4], ['#e8dcca', 4, 7, 8, 3], ['#fbefdb', 6, 5, 4, 3]],
  mustardTrace: [['#3a625e', 4, 7, 8, 5], ['#6ea695', 5, 6, 6, 5], ['#b8d6aa', 6, 5, 4, 5],
    ['#e4e5b0', 7, 6, 2, 3], ['#a5c8a1', 3, 4, 2, 2], ['#c5d6a5', 11, 11, 2, 2]],
};

function imageIcon(file: string) {
  const image = document.createElement('img');
  image.src = assetUrl(file);
  image.alt = '';
  return image;
}

function pixelIcon(pixels: Pixel[]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d')!;
  for (const [color, x, y, width, height] of pixels) {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  }
  return canvas;
}

export function stackIcon(stack: Stack) {
  const crop = CROP_IDS.find(id => id === stack.id || CROPS[id].seed === stack.id || CROPS[id].pickle === stack.id);
  if (crop) {
    const harvest = imageIcon('assets/' + CROPS[crop].art + '/05-inventory.png');
    if (crop === stack.id) return harvest;
    const isSeed = CROPS[crop].seed === stack.id;
    const container = document.createElement('span');
    container.className = 'stack-composite ' + (isSeed ? 'seed-packet' : 'pickled-crop');
    container.setAttribute('aria-hidden', 'true');
    harvest.className = 'stack-crop';
    container.append(imageIcon(isSeed ? 'assets/seed-bags/base-32x32.png' : 'assets/pickles/base-32x32.png'), harvest);
    if (!isSeed) container.append(imageIcon('assets/pickles/rim-32x32.png'));
    return container;
  }
  const file = iconFiles[stack.id];
  if (!file) return pixelIcon((stack.kind === 'item' && pixels[stack.id]) || []);
  const image = imageIcon(file);
  if (stack.kind === 'tool') image.className = 'tool-icon';
  return image;
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
  const rows = Array.from({ length: MAX_BAG_SLOTS / HOTBAR_COLUMNS }, (_, row) => {
    const item = makeSlotRow('bag', row * HOTBAR_COLUMNS, ({ index }) => select(index), true);
    item.row.hidden = true;
    return item;
  });
  const page = document.getElementById('hotbar-page-number')!;
  const label = document.getElementById('hotbar-selection')!;
  document.getElementById('hotbar-rows')!.append(...rows.map(item => item.row));
  let previous = '';
  return (game: Game) => {
    const index = game.equippedSlot;
    const activeRow = game.hotbarRow;
    const totalRows = game.bag.length / HOTBAR_COLUMNS;
    const visible = game.bag.slice(activeRow * HOTBAR_COLUMNS, (activeRow + 1) * HOTBAR_COLUMNS);
    const signature = [activeRow, totalRows, index, game.water, ...visible.map(stack => stack &&
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
