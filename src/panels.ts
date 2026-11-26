import {
  COMMISSIONS, CROPS, CROP_IDS, ENTRIES, HOTBAR_COLUMNS, INVENTORY_INFO, ITEMS, KILN_COST, LIUWAN_ROWS, RECIPES, RESOURCES, SOUTH_PASS, STATIONS, TRADE, WAREHOUSE_SLOTS, WATER_CAPACITY,
  type CommissionId, type EntryId, type Point, type Recipe, type RecipeId, type Station,
} from './content';
import {
  canBuild, canSubmit, canTravel, claimJob, claimPakChoiSeeds, claimSeed, commissionStatus, costs, deliverCommission, expandStorage,
  hasMaterials, jobMeter, needsSeed, saveSeed, startJob, storageUpgrade, submit, trade, tradeLimit, warnSale, type Game, type TradeItem,
} from './game';
import type { World } from './scene';
import { makeSlotRow, stackIcon } from './hotbar';
import { bindInventoryDrag } from './inventory-drag';
import { count, stackCount, stackName, type SlotAddress, type Stack, type Storage } from './inventory';

export function node<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const child = document.createElement(tag);
  if (text) child.textContent = text;
  if (className) child.className = className;
  return child;
}

export function button(label: string, action: () => void, disabled = false, primary = false) {
  const control = element('button', label, primary ? 'primary' : undefined);
  control.type = 'button';
  control.disabled = disabled;
  control.addEventListener('click', action);
  return control;
}

function listRow(label: string, ...actions: HTMLElement[]) {
  const row = element('li', undefined, 'sheet-row');
  row.append(element('span', label), ...actions);
  return row;
}

function setPressed(control: HTMLElement, pressed: boolean) {
  control.setAttribute('aria-pressed', String(pressed));
  return control;
}

function renderItemCard(card: HTMLElement, game: Game, item: Stack) {
  const [category, description] = INVENTORY_INFO[item.id];
  const heading = element('div', undefined, 'item-card-heading');
  const picture = element('div', undefined, 'item-card-icon');
  picture.append(stackIcon(item));
  const identity = element('div');
  const amount = item.kind === 'item' ? ' · ×' + stackCount(item) :
    item.id === 'can' ? ' · 水量 ' + game.water + '/' + WATER_CAPACITY : '';
  identity.append(element('p', category + amount, 'item-card-meta'), element('h3', stackName(item)));
  heading.append(picture, identity);
  card.replaceChildren(heading, element('p', description, 'item-card-description'));
}

function positionItemCard(card: HTMLElement, anchor: HTMLElement, preferAbove = false) {
  const rect = anchor.getBoundingClientRect();
  const screen = document.documentElement;
  const padding = 10, gap = 8;
  const { offsetWidth: width, offsetHeight: height } = card;
  const left = Math.max(padding, Math.min(rect.left, screen.clientWidth - width - padding));
  const above = rect.top - height - gap, below = rect.bottom + gap;
  const fitsBelow = below + height <= screen.clientHeight - padding;
  const top = (preferAbove && above >= padding) || !fitsBelow ? above : below;
  card.style.left = left + 'px';
  card.style.top = Math.max(padding, Math.min(top, screen.clientHeight - height - padding)) + 'px';
}

export function bindHotbarItemCard(hotbar: HTMLElement, current: () => Game) {
  const card = element('section', undefined, 'item-card hotbar-item-card');
  card.setAttribute('popover', 'manual');
  card.setAttribute('aria-label', '快捷栏物品信息');
  hotbar.append(card);
  let anchor: HTMLButtonElement | null = null;
  let previewKey = '';
  let touch = false;
  let lastTouch = -Infinity;
  function dismiss() {
    if (card.matches(':popover-open')) card.hidePopover();
    anchor = null;
    previewKey = '';
  }
  function update() {
    if (!anchor) return;
    const game = current();
    const item = game.bag[Number(anchor.dataset.index)];
    if (!item || anchor.closest('[hidden]')) return dismiss();
    const key = item.id + ':' + (item.kind === 'item' ? stackCount(item) : game.water);
    if (key === previewKey) return;
    previewKey = key;
    renderItemCard(card, game, item);
    if (!card.matches(':popover-open')) card.showPopover();
    positionItemCard(card, anchor, true);
  }
  function preview(target: EventTarget | null) {
    if (!(target instanceof Element)) return;
    const slot = target.closest<HTMLButtonElement>('.inventory-slot');
    if (!slot) return dismiss();
    if (anchor !== slot) previewKey = '';
    anchor = slot;
    update();
  }
  hotbar.addEventListener('pointerover', event => {
    if (event.pointerType === 'mouse' && !event.buttons && performance.now() - lastTouch > 500) preview(event.target);
  });
  hotbar.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse' && performance.now() - lastTouch > 500) dismiss();
  });
  hotbar.addEventListener('focusin', event => {
    if (event.target instanceof Element && event.target.matches(':focus-visible')) preview(event.target);
  });
  hotbar.addEventListener('focusout', event => {
    if (event.relatedTarget instanceof Node && !hotbar.contains(event.relatedTarget)) dismiss();
  });
  document.addEventListener('pointerdown', event => {
    touch = event.pointerType === 'touch';
    if (event.target instanceof Node && !hotbar.contains(event.target)) dismiss();
  });
  hotbar.addEventListener('click', event => {
    if (!touch) return;
    lastTouch = performance.now();
    preview(event.target);
  });
  window.addEventListener('resize', () => { if (anchor) positionItemCard(card, anchor, true); });
  return { dismiss, update };
}

export function inventoryPanel(game: Game, warehouse: { page: number; turn: (page: number) => void } | null, source: SlotAddress | null,
  select: (address: SlotAddress | null) => void, move: (from: SlotAddress, to: SlotAddress) => void,
  equip: (index: number | null) => void, update: (message: string) => void, placement: (station: Station) => void) {
  const storageNames = { bag: '背包', warehouse: '仓库' };
  const layout = element('div', undefined, 'inventory-layout');
  const grids = element('div', undefined, warehouse ? 'storage-grids storage-pair' : 'storage-grids');
  const card = element('section', undefined, 'item-card');
  card.setAttribute('aria-label', '物品信息');
  card.hidden = true;
  layout.append(element('p', '钱袋 ' + game.coins + ' 文', 'sheet-note'), grids, card);
  const desktop = matchMedia('(hover: hover) and (pointer: fine)');
  let chosen = source;
  let displayed: SlotAddress | null = null;
  let highlighted: HTMLButtonElement | null = null;
  let dismissTimer = 0;

  function closeFloatingCard() {
    if (card.matches(':popover-open')) card.hidePopover();
  }

  function positionCard() {
    if (!highlighted || !card.isConnected || !card.hasAttribute('popover')) return;
    if (!card.matches(':popover-open')) card.showPopover();
    positionItemCard(card, highlighted);
  }

  function showCard(address: SlotAddress | null, floating = desktop.matches) {
    window.clearTimeout(dismissTimer);
    const item = address && game[address.storage][address.index];
    if (!item || !address) {
      highlighted?.setAttribute('aria-pressed', 'false');
      highlighted = null;
      displayed = null;
      closeFloatingCard();
      card.hidden = true;
      return;
    }
    card.hidden = false;
    if (floating) card.setAttribute('popover', 'manual');
    else {
      closeFloatingCard();
      card.removeAttribute('popover');
    }
    if (displayed?.storage === address.storage && displayed.index === address.index) {
      positionCard();
      return;
    }
    displayed = address;
    highlighted?.setAttribute('aria-pressed', 'false');
    highlighted = grids.querySelector('[data-storage="' + address.storage + '"][data-index="' + address.index + '"]');
    highlighted?.setAttribute('aria-pressed', 'true');
    renderItemCard(card, game, item);
    const crop = CROP_IDS.find(id => id === item.id);
    if (address.storage === 'bag' && crop) {
      const actions = element('div', undefined, 'sheet-actions');
      actions.append(button('留种 ×' + CROPS[crop].seedYield, () => update(saveSeed(game, address.index))));
      card.append(actions);
    }
    positionCard();
  }

  function inspect(address: SlotAddress, floating = desktop.matches) {
    chosen = game[address.storage][address.index] ? address : null;
    select(chosen);
    if (address.storage === 'bag') {
      equip(chosen?.index ?? null);
      if (!layout.closest('dialog')?.open) return;
      for (const slot of grids.querySelectorAll<HTMLButtonElement>('[data-storage="bag"]')) {
        slot.classList.toggle('slot-equipped', Number(slot.dataset.index) === game.equippedSlot);
      }
      for (const row of grids.querySelectorAll('.inventory-grid:has([data-storage="bag"]) .slot-row')) {
        row.classList.toggle('active-inventory-row', Math.floor(Number(row.querySelector('button')?.dataset.index) / HOTBAR_COLUMNS) === game.hotbarRow);
      }
    }
    showCard(chosen, floating);
  }

  for (const storage of (warehouse ? ['warehouse', 'bag'] : ['bag']) as Storage[]) {
    const section = element('section', undefined, 'inventory-grid');
    section.setAttribute('aria-label', storageNames[storage] + '格子');
    const slots = game[storage];
    const heading = element('h3', storageNames[storage] + ' ' + slots.filter(Boolean).length + ' / ' + slots.length, 'inventory-heading');
    const toolbar = element('div', undefined, 'inventory-toolbar');
    toolbar.append(heading);
    const offer = storageUpgrade(game, storage);
    if (offer) {
      toolbar.append(button('扩至 ' + offer.slots + ' 格 · ' + offer.price + ' 文',
        () => update(expandStorage(game, storage, offer.slots)), game.coins < offer.price));
    } else {
      toolbar.append(element('span', '已扩至上限', 'sheet-note'));
    }
    section.append(toolbar);
    const page = storage === 'warehouse' ? warehouse : null;
    const first = page ? page.page * WAREHOUSE_SLOTS : 0;
    const end = page ? first + WAREHOUSE_SLOTS : slots.length;
    for (let start = first; start < end; start += HOTBAR_COLUMNS) {
      const row = makeSlotRow(storage, start, address => inspect(address), storage === 'bag');
      row.row.classList.toggle('active-inventory-row', storage === 'bag' && start / HOTBAR_COLUMNS === game.hotbarRow);
      row.update(game, null, true);
      section.append(row.row);
    }
    if (page && slots.length > WAREHOUSE_SLOTS) {
      const pages = slots.length / WAREHOUSE_SLOTS;
      const pager = element('div', undefined, 'warehouse-pages');
      pager.setAttribute('role', 'group');
      pager.setAttribute('aria-label', '仓库分页');
      const previous = button('上一页', () => page.turn(page.page - 1), page.page === 0);
      const next = button('下一页', () => page.turn(page.page + 1), page.page === pages - 1);
      previous.dataset.direction = 'previous';
      next.dataset.direction = 'next';
      pager.append(previous, element('span', '第 ' + (page.page + 1) + ' / ' + pages + ' 页'), next);
      section.append(pager);
    }
    grids.append(section);
  }

  bindInventoryDrag(grids, game, move, address => showCard(address, true), address => inspect(address, false));
  layout.addEventListener('pointerout', event => {
    if (event.pointerType !== 'mouse' || !card.hasAttribute('popover') || !(event.target instanceof Element)) return;
    if (!event.target.closest('.inventory-slot, .item-card')) return;
    const next = event.relatedTarget;
    if (next instanceof Element && layout.contains(next) && next.closest('.inventory-slot, .item-card')) return;
    dismissTimer = window.setTimeout(() => {
      if (card.contains(document.activeElement)) return;
      showCard(chosen);
    }, 180);
  });
  card.addEventListener('pointerenter', () => window.clearTimeout(dismissTimer));
  layout.addEventListener('wheel', () => {
    if (card.hasAttribute('popover')) showCard(null);
  }, { passive: true });
  if (source) queueMicrotask(() => { if (layout.isConnected) showCard(source); });
  if (warehouse) return [layout];
  const crafting = element('ul', undefined, 'sheet-list');
  crafting.append(
    listRow('盐灶 · ' + costs(KILN_COST),
      button(game.stations.kiln ? '已摆放' : count(game, 'kiln') || count(game, 'kiln', 'warehouse') ? '已收起' : '选址',
        () => placement('kiln'), !canBuild(game, 'kiln'))),
    listRow('腌菜缸 · 在盐灶烧制', button(game.stations.jar ? '已摆放' : '摆放', () => placement('jar'), !canBuild(game, 'jar'))),
  );
  return [layout, element('h3', '制作与摆放', 'section-title'), crafting];
}

export function stationPanel(game: Game, station: Station, update: (message: string) => void,
  pack: () => void) {
  const list = element('ul', undefined, 'sheet-list');
  const job = game.jobs[station];
  if (job) {
    const recipe = RECIPES[job.recipe];
    const remaining = element('p', undefined, 'sheet-note');
    remaining.id = 'job-remaining';
    if (job.ready) {
      remaining.textContent = '成品待领取';
      return [remaining, button('领取' + ITEMS[recipe.output] + ' ×' + recipe.outputQuantity,
        () => update(claimJob(game, station)), false, true)];
    }
    const meter = element('progress', undefined, 'job-progress');
    meter.id = 'job-progress';
    meter.setAttribute('aria-label', recipe.label + '进度');
    const { remaining: minutes, elapsed, duration } = jobMeter(job, game.minute);
    meter.max = duration;
    meter.value = elapsed;
    remaining.textContent = recipe.label + ' · 剩 ' + minutes + ' 游戏分钟';
    return [remaining, meter];
  }
  for (const id of Object.keys(RECIPES) as RecipeId[]) {
    const recipe: Recipe = RECIPES[id];
    if (recipe.station !== station || (id === 'fishSoup' && !game.entries.crucian) ||
      (recipe.requiresArchive && !game.submitted)) continue;
    list.append(listRow(recipe.label + ' · ' + costs(recipe.inputs) + ' → ' + ITEMS[recipe.output] + ' ×' + recipe.outputQuantity,
      button('开工', () => update(startJob(game, id)), !hasMaterials(game, recipe.inputs), true)));
  }
  const actions = element('div', undefined, 'sheet-actions');
  actions.append(button('收起' + STATIONS[station], pack));
  return [list, element('p', '可长按空闲设施收进背包。', 'sheet-note'), actions];
}

export class TradingBook {
  private side: 'sell' | 'buy' = 'sell';
  private showCommissions = false;
  private item: TradeItem = 'radish';
  refresh = () => {};
  focus = () => {};

  render(parent: HTMLElement, game: Game, report: (message: string) => void) {
    if (!game.submitted && (this.item === 'pakChoi' || this.item === 'pakChoiPickle')) this.item = 'radish';
    if (!game.submitted) this.showCommissions = false;
    const redraw = () => {
      this.render(parent, game, report);
      this.focus();
    };
    const tabs = element('div', undefined, 'sheet-tabs');
    for (const side of ['sell', 'buy'] as const) {
      tabs.append(setPressed(button(side === 'sell' ? '出售' : '买入', () => {
        this.showCommissions = false;
        this.side = side;
        this.item = side === 'sell' ? 'radish' : 'seeds';
        redraw();
      }), side === this.side && !this.showCommissions));
    }
    const boardTab = setPressed(button('委托簿', () => {
      this.showCommissions = true;
      redraw();
    }), this.showCommissions);
    boardTab.hidden = !game.submitted;
    tabs.append(boardTab);
    if (this.showCommissions && game.submitted) {
      this.focus = () => boardTab.focus({ preventScroll: true });
      const clue = element('p', canTravel(game)
        ? '南山道已开放。从南侧扩垦地西边沿小径向南，至入口按 F。'
        : '旧档一行「南山道行粮，盐菜一瓮。」从委托簿领种，交付一份还在期限内的盐渍小白菜。', 'sheet-note');
      const seed = button('领小白菜种子 ×2', () => {
        report(claimPakChoiSeeds(game));
        this.refresh();
      });
      const list = element('ul', undefined, 'sheet-list');
      const rows = (Object.keys(COMMISSIONS) as CommissionId[]).map(id => {
        const { name, item, quantity, reward } = COMMISSIONS[id];
        const details = element('div');
        const status = element('small', undefined, 'sheet-note');
        details.append(element('strong', name), element('p', ITEMS[item] + ' ×' + quantity + ' · ' + reward + ' 文'), status);
        const deliver = button('交付' + name, () => {
          report(deliverCommission(game, id));
          if (canTravel(game)) clue.textContent = '南山道已开放。从南侧扩垦地西边沿小径向南，至入口按 F。';
          this.refresh();
        });
        const row = element('li', undefined, 'sheet-row');
        row.append(details, deliver);
        list.append(row);
        return { id, status, deliver };
      });
      this.refresh = () => {
        seed.hidden = !needsSeed(game, 'pakChoi');
        for (const { id, status, deliver } of rows) {
          const reason = commissionStatus(game, id);
          const caption = reason || '可交付';
          if (status.textContent !== caption) status.textContent = caption;
          deliver.disabled = Boolean(reason);
        }
      };
      parent.replaceChildren(tabs, clue, seed, list);
      this.refresh();
      return;
    }
    const balance = element('p', undefined, 'trade-summary');
    const list = element('ul', undefined, 'sheet-list');
    const stock: [TradeItem, HTMLElement][] = [];
    const headings = element('div', undefined, 'trade-grid trade-grid-header');
    headings.append(element('span', '物品'), element('span', '单价'), element('span', this.side === 'sell' ? '可出售' : '今日库存'));
    for (const [id, price] of Object.entries(TRADE[this.side]) as [TradeItem, number][]) {
      if (!game.submitted && (id === 'pakChoi' || id === 'pakChoiPickle')) continue;
      const row = element('li', undefined, 'trade-grid');
      const available = element('span');
      stock.push([id, available]);
      row.append(setPressed(button(ITEMS[id], () => { this.item = id; redraw(); }), id === this.item),
        element('span', price + ' 文'), available);
      list.append(row);
    }
    const id = this.item;
    const price = id === 'seeds' ? TRADE.buy.seeds : TRADE.sell[id];
    const form = element('form', undefined, 'trade-form');
    const label = element('label', '数量');
    const quantity = element('input');
    quantity.inputMode = 'numeric';
    quantity.autocomplete = 'off';
    quantity.value = tradeLimit(game, id) ? '1' : '';
    quantity.setAttribute('aria-describedby', 'trade-limit');
    label.htmlFor = quantity.id = 'trade-quantity';
    const valueOf = () => {
      const text = quantity.value.normalize('NFKC').trim();
      return /^\d+$/.test(text) ? Number(text) : NaN;
    };
    const adjust = (delta: number) => {
      const value = valueOf();
      const limit = tradeLimit(game, id);
      if (!limit) return;
      quantity.value = String(Math.min(limit, Math.max(1, (Number.isSafeInteger(value) ? value : 0) + delta)));
      this.refresh();
    };
    const subtract = button('−', () => adjust(-1));
    subtract.setAttribute('aria-label', '减少数量');
    const add = button('+', () => adjust(1));
    add.setAttribute('aria-label', '增加数量');
    const stepper = element('div', undefined, 'quantity-stepper');
    stepper.append(label, subtract, quantity, add);
    const total = element('output');
    const confirm = element('button', this.side === 'sell' ? '确认出售' : '确认买入', 'primary');
    confirm.type = 'submit';
    const warning = element('p', '这份还可用于首条用途。', 'trade-warning');
    const limitNote = element('p', undefined, 'sheet-note');
    limitNote.id = 'trade-limit';
    const seed = button('领取补种种子', () => { report(claimSeed(game)); this.refresh(); });
    const archive = button('归档柳湾第一卷', () => { report(submit(game)); this.refresh(); });
    const updateText = (node: HTMLElement, text: string) => {
      if (node.textContent !== text) node.textContent = text;
    };
    this.refresh = () => {
      const value = valueOf();
      const hasQuote = Number.isSafeInteger(value) && Number.isSafeInteger(value * price) && value >= 1;
      const limit = tradeLimit(game, id);
      const valid = hasQuote && value <= limit;
      confirm.disabled = !valid;
      subtract.disabled = !limit || !hasQuote || value <= 1;
      add.disabled = !limit || (hasQuote && value >= limit);
      updateText(total, '合计 ' + (hasQuote ? value * price : 0) + ' 文');
      warning.hidden = !valid || !warnSale(game, id, value);
      updateText(limitNote, id === 'seeds'
        ? limit ? '当前最多可买 ' + limit + ' 粒。' : '当前无可买数量，请查看库存、钱袋或背包。'
        : limit ? '当前最多可卖 ' + limit + ' 份。' : '背包无可出售的此物。');
      updateText(balance, '钱袋 ' + game.coins + ' 文');
      for (const [item, available] of stock) {
        updateText(available, String(item === 'seeds' ? game.seedStock : count(game, item)));
      }
      seed.hidden = !needsSeed(game);
      updateText(archive, game.submitted ? '第一卷已归档' : '归档柳湾第一卷');
      archive.disabled = game.submitted || !canSubmit(game);
      boardTab.hidden = !game.submitted;
    };
    this.focus = () => {
      quantity.focus({ preventScroll: true });
      quantity.select();
    };
    quantity.addEventListener('input', this.refresh);
    quantity.addEventListener('keydown', event => {
      const digit = /^Numpad([0-9])$/.exec(event.code)?.[1];
      if (!digit || event.key === digit || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const end = quantity.selectionEnd ?? quantity.value.length;
      quantity.setRangeText(digit, quantity.selectionStart ?? end, end, 'end');
      this.refresh();
    });
    form.append(stepper, total, confirm);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (confirm.disabled) return;
      const result = trade(game, id, valueOf());
      if (result.ok) quantity.value = '';
      this.refresh();
      report(result.message);
      this.focus();
    });
    const actions = element('div', undefined, 'sheet-actions');
    actions.append(seed, archive);
    parent.replaceChildren(tabs, balance, headings, list, form, limitNote, warning,
      element('h3', '田记所', 'section-title'), actions);
    this.refresh();
  }
}

export function ledgerPanel(game: Game, selected: EntryId, select: (id: EntryId) => void) {
  const spread = element('div', undefined, 'ledger-spread');
  const index = element('nav', undefined, 'ledger-index');
  index.setAttribute('aria-label', '物志分册');
  let section = '';
  for (const [id, rule] of Object.entries(ENTRIES) as [EntryId, typeof ENTRIES[EntryId]][]) {
    if (rule.section !== section) {
      section = rule.section;
      index.append(element('h3', section, 'section-title'));
    }
    index.append(setPressed(button(game.entries[id] ? ITEMS[id] : '待发现 · ' + ITEMS[id], () => select(id)), selected === id));
  }
  const entry = game.entries[selected];
  const rule = ENTRIES[selected];
  const page = element('article', undefined, 'ledger-page');
  page.append(element('p', rule.section, 'sheet-note'), element('h3', ITEMS[selected]));
  if (entry) {
    const illustration = element('div', undefined, 'ledger-illustration');
    illustration.append(stackIcon({ kind: 'item', id: selected, batches: [] }));
    page.append(illustration);
  }
  page.append(element('p', entry?.lit ? '已上锚' : entry ? '已发现' : '未发现', 'sheet-note'));
  page.append(element('p', entry ? rule.use : rule.clue));
  if (entry?.lit && rule.reward) page.append(element('p', '已结稿酬 ' + rule.reward + ' 文'));
  if (entry?.deadline !== null && entry?.deadline !== undefined && !entry.lit) {
    const remaining = element('p', undefined, 'sheet-note');
    remaining.id = 'ledger-remaining';
    page.append(remaining);
  }
  if (game.submitted) page.append(element('p', '柳湾第一卷已归档。', 'sheet-note'));
  spread.append(index, page);
  return spread;
}

export function mapPanel(world: World, game: Game, ripples: Point[]) {
  const map = element('div', undefined, 'regional-map');
  const canvas = element('canvas');
  const inPass = game.position[1] >= SOUTH_PASS.bounds.y;
  const bounds = inPass ? SOUTH_PASS.bounds : { x: 0, y: 0, width: world.cols, height: LIUWAN_ROWS };
  canvas.width = bounds.width * 8;
  canvas.height = bounds.height * 8;
  const ctx = canvas.getContext('2d')!;
  const colors: Record<string, string> = { grass: '#85985c', bare: '#c9a777', path: '#d0af7c', water: '#639c9c' };
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      ctx.fillStyle = colors[world.cells[(y + bounds.y) * world.cols + x + bounds.x]];
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  map.append(canvas);
  const caption = element('p', '点击标注查看地点。', 'sheet-note');
  function marker(name: string, x: number, y: number, mark: string, className?: string) {
    const pin = button(mark, () => { caption.textContent = name; });
    if (className) pin.className = className;
    pin.setAttribute('aria-label', name);
    pin.title = name;
    pin.style.left = (x - bounds.x + .5) / bounds.width * 100 + '%';
    pin.style.top = (y - bounds.y + .5) / bounds.height * 100 + '%';
    map.append(pin);
  }
  if (inPass) {
    marker('返回柳湾', ...SOUTH_PASS.returnGate, '返');
    marker('山道路碑', ...SOUTH_PASS.waystone, '碑');
  } else {
    marker('田记所', 6, 5, '所');
    for (const { label, tile, mark } of world.landmarks) marker(label, ...tile, mark);
    for (const tile of ripples) marker('涟漪钓点', ...tile, '钓');
    if (game.entries.rockSalt) marker('岩盐发现处', ...RESOURCES['buried-salt'].tile, '盐');
    if (game.submitted) marker(canTravel(game) ? '南山道入口' : '南山道 · 备齐行粮后开放', ...SOUTH_PASS.gate, '道');
    for (const [station, position] of Object.entries(game.stations) as [Station, [number, number]][]) {
      marker(STATIONS[station], ...position, station === 'kiln' ? '灶' : '缸');
    }
  }
  marker('当前位置', ...game.position, '●', 'map-player');
  return [map, caption];
}
