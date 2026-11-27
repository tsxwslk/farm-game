import {
  BUILD_COSTS, COMMISSIONS, CROPS, CROP_FAMILIES, CROP_IDS, ENTRIES, HOTBAR_COLUMNS, INVENTORY_INFO, ITEMS, LIUWAN_ROWS, QUALITIES, QUALITY_LABELS,
  RECIPES, RESOURCES, SOUTH_PASS, STATIONS, TRACE_IDS, TRACES, TRADE, WAREHOUSE_SLOTS, WATER_CAPACITY, isCrop, isSeedTradeItem,
  type CommissionId, type EntryId, type Point, type Quality, type Recipe, type RecipeId, type Station,
} from './content';
import {
  canBuild, canSubmit, canTravel, claimJob, claimTraceSeed, claimPakChoiSeeds, claimSeed, commissionStatus, costs, deliverCommission, expandStorage,
  growthStatus, hasMaterials, jobMeter, needsSeed, restoreTrace, saveSeed, seedStockFor, startJob, storageUpgrade, submit, traceVisible, trade, tradeLimit, tradePrice, warnSale,
  type Game, type TradeItem,
} from './game';
import type { Plot, World } from './scene';
import { makeSlotRow, stackIcon } from './hotbar';
import { bindInventoryDrag } from './inventory-drag';
import { count, equippedStack, stackCount, stackName, type SlotAddress, type Stack, type Storage } from './inventory';
import { FORECAST_DAYS, liuwanWeather, WEATHER_LABELS } from './weather';
import { compostGain, cropStreak, harvestQuality, QUALITY_THRESHOLDS } from './soil';

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
  const grade = item.kind === 'item' && isCrop(item.id) ? ' · ' + QUALITY_LABELS[item.quality ?? 'normal'] : '';
  identity.append(element('p', category + amount + grade, 'item-card-meta'), element('h3', stackName(item)));
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
    const key = item.id + ':' + (item.kind === 'item' ? stackCount(item) + ':' + (item.quality ?? '') : game.water);
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
  for (const station of Object.keys(STATIONS) as Station[]) {
    const materials = BUILD_COSTS[station];
    const placed = Object.values(game.stations).filter(({ kind }) => kind === station).length;
    const detail = materials ? costs(materials) : '在火灶烧制';
    crafting.append(listRow(STATIONS[station] + ' · ' + detail + (placed ? ' · 已摆放 ' + placed : ''),
      button(materials ? '选址' : '摆放',
        () => placement(station), !canBuild(game, station))));
  }
  return [layout, element('h3', '制作与摆放', 'section-title'), crafting];
}

export function soilPanel(game: Game, plot: Plot) {
  const { soil } = plot;
  const rows = element('dl', undefined, 'soil-readings');
  const add = (label: string, value: string) => rows.append(element('dt', label), element('dd', value));
  add('主养分', soil.nutrients + ' / 100');
  add('菌群健康', soil.microbes + ' / 100');
  add('地表湿润', liuwanWeather(game.day) === 'rain' || plot.watered !== null ? '湿润' : '干燥');
  add('上一茬', soil.lastCrop ? ITEMS[soil.lastCrop] + ' · ' + CROP_FAMILIES[CROPS[soil.lastCrop].family] : '暂无记录');
  add('同科连续茬数', String(soil.streak));
  const held = equippedStack(game);
  const crop = plot.crop ?? CROP_IDS.find(id => CROPS[id].seed === held?.id);
  if (crop) {
    add(plot.crop ? '当前作物' : '准备播种', ITEMS[crop] + ' · ' + CROP_FAMILIES[CROPS[crop].family]);
    add('预计品质', QUALITY_LABELS[harvestQuality(soil, crop)] + (cropStreak(soil, crop) >= 2 ? ' · 同科连作' : ''));
  }
  const growth = plot.crop && plot.watered === null ? '等待浇水。' : growthStatus(game, plot);
  const gain = compostGain(soil);
  const hint = element('p', plot.crop ? '收获后可换科、休耕或施堆肥。' :
    '留空一整天可恢复土壤并解除连作。选中堆肥再操作这格地，可恢复主养分 ' + gain.nutrients + '、菌群 ' + gain.microbes + '。', 'sheet-note');
  const grades = element('p', '两项土壤读数都达到 ' + QUALITY_THRESHOLDS.fine + ' 才能收获优质。任一低于 ' +
    QUALITY_THRESHOLDS.good + ' 时为普通。同科连作最高为良好。', 'sheet-note');
  return growth ? [rows, element('p', growth, 'sheet-note'), grades, hint] : [rows, grades, hint];
}

export function stationPanel(game: Game, key: string, update: (message: string) => void,
  pack: () => void) {
  const list = element('ul', undefined, 'sheet-list');
  const { kind, job } = game.stations[key];
  if (job) {
    const recipe = RECIPES[job.recipe];
    const remaining = element('p', undefined, 'sheet-note');
    remaining.id = 'job-remaining';
    if (job.ready) {
      remaining.textContent = '成品待领取';
      return [remaining, button('领取' + ITEMS[recipe.output] + ' ×' + recipe.outputQuantity,
        () => update(claimJob(game, key)), false, true)];
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
    if (recipe.station !== kind || (id === 'fishSoup' && !game.entries.crucian) ||
      (recipe.requiresTrace && game.traces[recipe.requiresTrace] !== 'restored') ||
      (recipe.requiresArchive && !game.submitted)) continue;
    list.append(listRow(recipe.label + ' · ' + costs(recipe.inputs) + ' → ' + ITEMS[recipe.output] + ' ×' + recipe.outputQuantity,
      button('开工', () => update(startJob(game, key, id)), !hasMaterials(game, recipe.inputs), true)));
  }
  const actions = element('div', undefined, 'sheet-actions');
  actions.append(button('收起' + STATIONS[kind], pack));
  return [list, element('p', '可长按空闲设施收进背包。', 'sheet-note'), actions];
}

export class TradingBook {
  private side: 'sell' | 'buy' = 'sell';
  private page: 'trade' | 'commissions' | 'restore' = 'trade';
  private item: TradeItem = 'radish';
  refresh = () => {};
  focus = () => {};

  render(parent: HTMLElement, game: Game, report: (message: string) => void) {
    if (!game.submitted && (this.item === 'pakChoi' || this.item === 'pakChoiPickle' || this.item === 'pakChoiSeeds')) {
      this.item = this.side === 'sell' ? 'radish' : 'seeds';
    }
    if (!game.submitted && this.page === 'commissions') this.page = 'trade';
    const redraw = () => {
      this.render(parent, game, report);
      this.focus();
    };
    const tabs = element('div', undefined, 'sheet-tabs');
    for (const side of ['sell', 'buy'] as const) {
      tabs.append(setPressed(button(side === 'sell' ? '出售' : '买入', () => {
        this.page = 'trade';
        this.side = side;
        this.item = side === 'sell' ? 'radish' : 'seeds';
        redraw();
      }), side === this.side && this.page === 'trade'));
    }
    const boardTab = setPressed(button('委托簿', () => {
      this.page = 'commissions';
      redraw();
    }), this.page === 'commissions');
    boardTab.hidden = !game.submitted;
    const restoreTab = setPressed(button('复原种源', () => {
      this.page = 'restore';
      redraw();
    }), this.page === 'restore');
    tabs.append(boardTab, restoreTab);
    if (this.page === 'restore') {
      const list = element('ul', undefined, 'sheet-list');
      for (const id of TRACE_IDS) {
        const { item, seedQuantity, inSouthPass } = TRACES[id];
        if (inSouthPass && !canTravel(game)) continue;
        const restored = game.traces[id] === 'restored';
        const held = count(game, item) > 0;
        const { seed } = CROPS[id];
        const description = restored ? ITEMS[id] + '种源已复原，收获后可留种。' :
          held ? '背包里的' + ITEMS[item] + '可复原为种子。' :
          count(game, item, 'warehouse') ? ITEMS[item] + '在仓库里，先取到背包。' : ENTRIES[id].clue;
        const row = element('li');
        row.append(element('strong', ITEMS[id]), element('p', description, 'sheet-note'));
        if (restored && needsSeed(game, id)) {
          row.append(button('补领' + ITEMS[seed] + ' ×1', () => { report(claimTraceSeed(game, id)); redraw(); }));
        } else if (!restored) {
          row.append(button('复原' + ITEMS[seed] + ' ×' + seedQuantity, () => { report(restoreTrace(game, id)); redraw(); }, !held));
        }
        list.append(row);
      }
      this.refresh = () => {};
      this.focus = () => restoreTab.focus({ preventScroll: true });
      parent.replaceChildren(tabs, list);
      return;
    }
    if (this.page === 'commissions') {
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
      if (!game.submitted && (id === 'pakChoi' || id === 'pakChoiPickle' || id === 'pakChoiSeeds')) continue;
      const row = element('li', undefined, 'trade-grid');
      const available = element('span');
      stock.push([id, available]);
      row.append(setPressed(button(ITEMS[id], () => { this.item = id; redraw(); }), id === this.item),
        element('span', price + ' 文' + (isCrop(id) ? '起' : '')), available);
      list.append(row);
    }
    const id = this.item;
    const buying = isSeedTradeItem(id);
    const graded = isCrop(id);
    const grade = element('select');
    grade.id = 'trade-quality';
    let quality: Quality = graded ? QUALITIES.find(value => count(game, id, 'bag', value) > 0) ?? 'normal' : 'normal';
    if (graded) {
      for (const value of QUALITIES) {
        const option = element('option', QUALITY_LABELS[value] + ' · ' + tradePrice(id, value) + ' 文/份');
        option.value = value;
        grade.append(option);
      }
      grade.value = quality;
    }
    const form = element('form', undefined, 'trade-form');
    const label = element('label', '数量');
    const quantity = element('input');
    quantity.inputMode = 'numeric';
    quantity.autocomplete = 'off';
    quantity.value = tradeLimit(game, id, quality) ? '1' : '';
    quantity.setAttribute('aria-describedby', 'trade-limit');
    label.htmlFor = quantity.id = 'trade-quantity';
    const valueOf = () => {
      const text = quantity.value.normalize('NFKC').trim();
      return /^\d+$/.test(text) ? Number(text) : NaN;
    };
    const adjust = (delta: number) => {
      const value = valueOf();
      const limit = tradeLimit(game, id, quality);
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
    const archive = button('归档柳湾第一卷', () => { report(submit(game)); redraw(); });
    const updateText = (node: HTMLElement, text: string) => {
      if (node.textContent !== text) node.textContent = text;
    };
    this.refresh = () => {
      const value = valueOf();
      const price = tradePrice(id, quality);
      const hasQuote = Number.isSafeInteger(value) && Number.isSafeInteger(value * price) && value >= 1;
      const limit = tradeLimit(game, id, quality);
      const valid = hasQuote && value <= limit;
      confirm.disabled = !valid;
      subtract.disabled = !limit || !hasQuote || value <= 1;
      add.disabled = !limit || (hasQuote && value >= limit);
      updateText(total, '合计 ' + (hasQuote ? value * price : 0) + ' 文');
      warning.hidden = !valid || !warnSale(game, id, value, quality);
      updateText(limitNote, buying
        ? limit ? '当前最多可买 ' + limit + ' 粒。' : '当前无可买数量，请查看库存、钱袋或背包。'
        : limit ? '当前最多可卖 ' + limit + ' 份。' : '背包无可出售的此物。');
      updateText(balance, '钱袋 ' + game.coins + ' 文');
      for (const [item, available] of stock) {
        updateText(available, String(isSeedTradeItem(item) ? seedStockFor(game, item) : count(game, item)));
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
    if (graded) {
      const gradeLabel = element('label', '品质', 'trade-quality');
      gradeLabel.append(grade);
      form.append(gradeLabel);
      grade.addEventListener('change', () => {
        quality = grade.value as Quality;
        quantity.value = tradeLimit(game, id, quality) ? '1' : '';
        this.refresh();
      });
    }
    form.append(stepper, total, confirm);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (confirm.disabled) return;
      const result = trade(game, id, valueOf(), quality);
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

export function forecastPanel(game: Game) {
  const list = element('ul', undefined, 'sheet-list');
  for (let offset = 0; offset < FORECAST_DAYS; offset++) {
    const date = game.day + offset;
    const row = element('li', undefined, 'sheet-row');
    const weather = liuwanWeather(date);
    row.append(element('span', offset === 0 ? '今天 · 第 ' + date + ' 天' : '第 ' + date + ' 天'),
      element('strong', WEATHER_LABELS[weather]));
    list.append(row);
  }
  const hint = game.traces.mustard === 'unfound' ? '霾天沿林缘到旧制盐台西侧，可以寻找芥菜余绪。' : '';
  return [list, element('p', '雨天会浇湿菜畦。' + hint, 'sheet-note')];
}

const ledgerIds = Object.keys(ENTRIES) as EntryId[];
const ledgerSections = [...new Set(ledgerIds.map(id => ENTRIES[id].section))];

function ledgerStatus(game: Game, id: EntryId) {
  const entry = game.entries[id];
  if (ENTRIES[id].section === '加工品册') return entry?.lit ? '已制成' : '待制成';
  return entry?.lit ? '已上锚' : entry ? '待上锚' : '未发现';
}

function ledgerIllustration(game: Game, id: EntryId) {
  const picture = element('span', undefined, 'ledger-illustration');
  picture.classList.toggle('ledger-unlit', !game.entries[id]?.lit);
  picture.setAttribute('aria-hidden', 'true');
  picture.append(stackIcon({ kind: 'item', id, batches: [] }));
  return picture;
}

export function ledgerPanel(game: Game, selected: EntryId, select: (id: EntryId) => void) {
  const book = element('div', undefined, 'ledger-book');
  const tabs = element('nav', undefined, 'ledger-tabs');
  tabs.setAttribute('aria-label', '物志分册');
  const rule = ENTRIES[selected];
  for (const section of ledgerSections) {
    tabs.append(setPressed(button(section, () => {
      const first = ledgerIds.find(id => ENTRIES[id].section === section);
      if (first && section !== rule.section) select(first);
    }), section === rule.section));
  }
  const ids = ledgerIds.filter(id => ENTRIES[id].section === rule.section);
  const lit = ids.filter(id => game.entries[id]?.lit).length;
  const progress = element('p', '已点亮 ' + lit + ' / ' + ids.length, 'ledger-count');
  const grid = element('div', undefined, 'ledger-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', rule.section + '条目');
  for (const id of ids) {
    const cell = button('', () => select(id));
    cell.className = 'ledger-cell';
    cell.classList.toggle('ledger-cell-unlit', !game.entries[id]?.lit);
    cell.setAttribute('aria-label', ITEMS[id] + '，' + ledgerStatus(game, id));
    setPressed(cell, selected === id);
    cell.append(ledgerIllustration(game, id), element('span', ITEMS[id], 'ledger-cell-name'));
    grid.append(cell);
  }

  const entry = game.entries[selected];
  const detail = element('article', undefined, 'ledger-detail');
  detail.setAttribute('aria-label', '条目详情');
  const description = element('div', undefined, 'ledger-description');
  const status = element('p', ledgerStatus(game, selected), 'ledger-status');
  status.classList.toggle('ledger-status-lit', Boolean(entry?.lit));
  description.append(element('h3', ITEMS[selected]), status,
    element('p', entry ? rule.use : rule.clue));
  if (isCrop(selected)) {
    const grades = QUALITIES.filter(grade => entry?.qualities?.includes(grade)).map(grade => QUALITY_LABELS[grade]);
    if (grades.length) description.append(element('p', '已收获品质 · ' + grades.join('、'), 'ledger-status'));
  }
  if (entry?.lit && rule.reward) description.append(element('p', '已结稿酬 ' + rule.reward + ' 文', 'ledger-status'));
  if (entry?.deadline !== null && entry?.deadline !== undefined && !entry.lit) {
    const remaining = element('p', undefined, 'ledger-status');
    remaining.id = 'ledger-remaining';
    description.append(remaining);
  }
  detail.append(ledgerIllustration(game, selected), description);
  book.append(tabs, progress, grid, detail);
  if (game.submitted) book.append(element('p', '柳湾第一卷已归档。', 'sheet-note'));
  return book;
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
    const perillaClue = {
      unfound: traceVisible(game, 'perilla') ? '现在可采紫苏余绪' : '霾天或 18:00 后可寻紫苏余绪',
      collected: '紫苏余绪已采集，可回田记所复原',
      restored: '紫苏种源已复原',
    }[game.traces.perilla];
    marker('石阶药圃 · ' + perillaClue, ...SOUTH_PASS.herbTerrace, '圃');
    for (const [id, { tile, actor }] of Object.entries(RESOURCES)) {
      if (tile[1] < bounds.y || tile[1] >= bounds.y + bounds.height || game.depleted[id]) continue;
      marker(actor === 'oak' ? '山道橡树' : '可采岩石', ...tile, actor === 'oak' ? '木' : '石');
    }
  } else {
    marker('田记所', 6, 5, '所');
    for (const { label, tile, mark } of world.landmarks) marker(label, ...tile, mark);
    for (const tile of ripples) marker('涟漪钓点', ...tile, '钓');
    if (game.entries.rockSalt) marker('岩盐发现处', ...RESOURCES['buried-salt'].tile, '盐');
    if (traceVisible(game, 'mustard')) marker('旧制盐台西侧 · 芥菜余绪', ...TRACES.mustard.tile, '绪');
    if (game.submitted) marker(canTravel(game) ? '南山道入口' : '南山道 · 备齐行粮后开放', ...SOUTH_PASS.gate, '道');
    for (const { kind, tile } of Object.values(game.stations)) {
      marker(STATIONS[kind], ...tile, { kiln: '灶', jar: '缸', compostShed: '肥' }[kind]);
    }
  }
  marker('当前位置', ...game.position, '●', 'map-player');
  return [map, caption];
}
