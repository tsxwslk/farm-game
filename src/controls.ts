import { assetUrl } from './assets';
import { BAG_SLOTS, HOTBAR_COLUMNS, ITEMS, RECIPES, STATIONS, TOOLS, type EntryId, type Point, type Station } from './content';
import {
  advance, canBuild, formatClock, jobMeter, newGame, nextDay, operate, place,
  renewResources, targetAction, targetKey, targetProgress,
  type Game,
} from './game';
import { createHotbar } from './hotbar';
import { equipSlot, equippedTool, moveStack, type SlotAddress } from './inventory';
import { TradingBook, element, inventoryPanel, ledgerPanel, mapPanel, node, stationPanel } from './panels';
import { createSaveControls } from './save-controls';
import type { Motion, Placement, Scene, Target } from './scene';

const TILE = 32;
const WALK_SPEED = 6;
const MOVES: Record<string, Point> = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };
type Panel = 'bag' | 'warehouse' | 'ledger' | 'map' | 'saves' | 'archive' | Station;

export async function createControls(scene: Scene) {
  const { world, canvas, view, zoom, targets, blocked, draw, pick, setStations, canPlace } = scene;
  const river = targets.find(target => target.kind === 'water');
  const { passable, routeTo, describeGrowth } = window.LiuwanGame;
  const sheet = node<HTMLDialogElement>('game-sheet');
  const review = node<HTMLDialogElement>('game-review');
  const body = node('sheet-body');
  const message = node('depth-status');
  const sheetMessage = node('sheet-status');
  const actionButton = node<HTMLButtonElement>('game-action');
  const nextButton = node<HTMLButtonElement>('next-day');
  const tradingBook = new TradingBook();
  const keys = new Set<string>();
  let game = newGame(world);
  let previous = performance.now();
  let previousSave = previous;
  let route: Point[] = [];
  let pendingTarget: Target | null = null;
  let step: { to: Point; progress: number } | null = null;
  let facing: Point = [0, 1];
  let selected: Target | null = null;
  let hovered: Target | null = null;
  let placement: Placement | null = null;
  let hit: Motion['hit'] = null;
  let panel: Panel | null = null;
  let selectedStack: SlotAddress | null = null;
  let selectedEntry: EntryId = 'radish';
  let renderedMinute = -1;
  let savedReviewDay = 0;
  let messageExpires = 0;

  const renderHotbar = createHotbar(index => {
    if (canSwitchSlots()) {
      selectSlot(game.equippedSlot === index ? null : index);
      canvas.focus({ preventScroll: true });
    }
  });
  const saves = createSaveControls(scene, body, () => game, restore, () => panel === 'saves',
    text => report(text, sheet.open ? sheetMessage : message));
  game = await saves.load();
  setStations(game);
  if (!message.textContent || message.textContent === '正在加载柳湾…') {
    report(game.chestOpened ? '' : '田记所门旁的仓库里留有种子。');
  }

  function restore(saved: Game) {
    game = saved;
    stopMovement();
    selected = hovered = placement = null;
    hit = null;
    setStations(game);
    renderedMinute = -1;
    previous = performance.now();
    savedReviewDay = game.review ? game.day : 0;
    closePanel();
    if (review.open) review.close();
    if (game.review) showReview();
  }

  function report(text: string, status = message) {
    status.textContent = text;
    status.hidden = !text;
    if (status === message) messageExpires = performance.now() + 6500;
  }

  function stopMovement() {
    keys.clear();
    route = [];
    step = null;
    pendingTarget = null;
  }

  function isNear(target: Target) {
    return target.points.some(([x, y]) => x === game.position[0] && y === game.position[1]);
  }

  function activeTarget() {
    const tool = equippedTool(game);
    if (tool === 'can') {
      const aimed = selected ?? hovered;
      if (aimed && isNear(aimed) && targetAction(game, aimed).tool === 'can') return aimed;
      if (river && isNear(river)) return river;
    }
    if (selected) return isNear(selected) ? selected : undefined;
    if (hovered && isNear(hovered)) return hovered;
    const nearby = targets.filter(target => isNear(target) &&
      (target.kind !== 'resource' || !game.depleted[targetKey(target)]));
    return nearby.find(target => tool && targetAction(game, target).tool === tool) ??
      nearby.find(target => target.kind === 'archive' || target.kind === 'chest' || target.kind === 'kiln' || target.kind === 'jar') ??
      nearby[0];
  }

  function clearPlot(target: Target) {
    return target.points.every(([x, y]) => !blocked.has(y * world.cols + x));
  }

  function gameAction() {
    if (game.review || saves.busy || sheet.open) return;
    if (placement) {
      placement = null;
      report('已取消摆放。');
      return;
    }
    interact(activeTarget());
  }

  function impactPoint(target: Target): Point {
    if (target.kind === 'plot') {
      const plot = world.plots[Number(target.id)];
      return [plot.x + TILE, plot.y + TILE];
    }
    if (target.kind === 'water') {
      const [x, y] = game.position;
      const water = [[x + 1, y], [x, y + 1], [x, y - 1]]
        .find(([col, row]) => world.cells[row * world.cols + col] === 'water');
      if (water) return [(water[0] + .5) * TILE, (water[1] + .5) * TILE];
    }
    const [x, y] = target.tile ?? game.position;
    return [(x + .5) * TILE, (y + .6) * TILE];
  }

  function interact(target: Target | undefined) {
    if (!target) {
      report('先走到目标旁边。');
      return;
    }
    if (!isNear(target) || game.action?.key === targetKey(target)) return;
    stopMovement();
    game.action = null;
    selected = target;
    if (target.kind === 'chest') {
      game.chestOpened = true;
      openPanel('warehouse');
      void saves.save();
      return;
    }
    if (target.kind === 'archive' || target.kind === 'kiln' || target.kind === 'jar') {
      openPanel(target.kind);
      return;
    }
    const result = operate(game, target, clearPlot);
    if (equippedTool(game) === 'can' && (result === '浇过水了。' || result === '水壶已装满。')) {
      hit = { tool: 'can', point: impactPoint(target), minute: game.minute };
    }
    report(result);
    void saves.save();
  }

  function applyTime(amount: number) {
    let landed = false;
    const notes = advance(game, amount, action => {
      const target = targets.find(candidate => targetKey(candidate) === action.key);
      if (!target || !isNear(target) || equippedTool(game) !== action.tool) return;
      const result = operate(game, target, clearPlot, true);
      landed = !result || (target.kind === 'plot' && game.plots[Number(target.id)].tilled) || Boolean(game.depleted[action.key]);
      if ((action.tool === 'hoe' || action.tool === 'pick' || action.tool === 'axe') &&
        landed) {
        hit = { tool: action.tool, point: impactPoint(target), minute: game.minute };
      }
      if (game.depleted[action.key]) {
        setStations(game);
        if (selected === target && target.label !== '黏土') selected = null;
        if (hovered === target && target.label !== '黏土') hovered = null;
      }
      return result;
    });
    if (notes.length) {
      if (panel && panel !== 'map' && panel !== 'saves') {
        if (panel === 'archive') tradingBook.refresh();
        else renderPanel();
        report(notes.at(-1)!, sheetMessage);
      } else report(notes.at(-1)!);
    }
    if (!game.review && (notes.length || landed)) void saves.save();
    if (game.review && savedReviewDay !== game.day) {
      savedReviewDay = game.day;
      stopMovement();
      placement = null;
      closePanel();
      showReview();
      void saves.save();
    }
  }

  function showReview() {
    node('review-title').textContent = '第 ' + game.day + ' 天 · 午夜日结';
    const { income, expenses, royalties } = game.account;
    const log = element('ul', undefined, 'sheet-list');
    for (const entry of game.log.slice(-8)) log.append(element('li', entry));
    node('review-body').replaceChildren(
      element('p', '出售 ' + income + ' 文 · 买入 ' + expenses + ' 文 · 稿酬 ' + royalties + ' 文'),
      element('p', '钱袋 ' + game.coins + ' 文', 'sheet-note'),
      log.children.length ? log : element('p', '今天没有新记录。', 'sheet-note'),
    );
    if (!review.open) review.showModal();
  }

  function go(destinations: Point[], target: Target | null) {
    if (target && isNear(target)) {
      interact(target);
      return;
    }
    keys.clear();
    game.action = null;
    const from = step?.to ?? game.position;
    let found = routeTo(world, blocked, from, destinations);
    if (!found && target?.kind === 'water' && river) {
      found = routeTo(world, blocked, from, river.points);
      target = selected = river;
    }
    route = found ?? [];
    pendingTarget = found ? target : null;
    if (!found) report('这里走不过去。');
    else if (!step && !route.length && pendingTarget) interact(pendingTarget);
  }

  function move(dt: number) {
    if (!step) {
      const direction = MOVES[[...keys].at(-1) ?? ''];
      const next: Point | undefined = direction
        ? [game.position[0] + direction[0], game.position[1] + direction[1]] : route.shift();
      if (!next) return;
      if (!passable(world, blocked, ...next)) {
        route = [];
        pendingTarget = null;
        return;
      }
      game.action = null;
      facing = [next[0] - game.position[0], next[1] - game.position[1]];
      step = { to: next, progress: 0 };
    }
    step.progress += dt * WALK_SPEED;
    if (step.progress < 1) return;
    game.position = step.to;
    step = null;
    if (renewResources(game)) setStations(game);
    if (!route.length && pendingTarget) {
      const target = pendingTarget;
      pendingTarget = null;
      if (isNear(target)) interact(target);
    }
  }

  function showText(target: HTMLElement, value: string) {
    if (target.textContent !== value) target.textContent = value;
    target.hidden = !value;
  }

  function showButton(control: HTMLButtonElement, text: string, key: string) {
    if (control.dataset.label === text + key) return;
    control.dataset.label = text + key;
    control.replaceChildren(text + ' ', element('kbd', key));
  }

  function updateHud(now: number) {
    const target = activeTarget() ?? hovered ?? selected;
    const action = target && targetAction(game, target);
    const progress = target ? targetProgress(game, target) : null;
    const name = action?.label === '播种' ? ITEMS.seeds + ' · ' : action?.tool ? TOOLS[action.tool].name + ' · ' : '';
    const suffix = (progress ? ' ' + progress.done + '/' + progress.total : '') +
      (target && isNear(target) ? ' · 点击 / F' : '');
    const growth = target?.kind === 'plot' && action?.label === '查看长势' ? describeGrowth(game, game.plots[Number(target.id)]) : '';
    showText(node('target-hint'), placement ? '点击空地确认，Esc 取消' : growth || (action ? name + action.label + suffix : ''));
    if (!message.hidden && now > messageExpires) message.hidden = true;
    renderHotbar(game);
    showButton(actionButton, placement ? '取消' : '操作', placement ? 'Esc' : 'F');
    showText(node('game-coins'), game.coins + ' 文');
    const minute = Math.floor(game.minute);
    if (minute !== renderedMinute) {
      renderedMinute = minute;
      showText(node('game-date'), '春 · 第 ' + game.day + ' 天');
      showText(node('game-clock'), formatClock(game));
      tickPanel();
    }
  }

  function tickPanel() {
    if (panel === 'archive') tradingBook.refresh();
    if (panel === 'ledger') {
      const item = document.getElementById('ledger-remaining');
      const deadline = game.entries[selectedEntry]?.deadline;
      if (item && deadline !== null && deadline !== undefined) {
        const remain = Math.max(0, Math.ceil(deadline - game.minute));
        showText(item, remain ? '剩余 ' + remain + ' 活动分钟' : '本轮已超时，可重新取得原料。');
      }
    }
  }

  function updateJobPanel() {
    if (panel !== 'kiln' && panel !== 'jar') return;
    const job = game.jobs[panel];
    const meter = body.querySelector<HTMLProgressElement>('#job-progress');
    const label = body.querySelector<HTMLElement>('#job-remaining');
    if (!job || job.ready || !meter || !label) return;
    const { remaining, elapsed } = jobMeter(job, game.minute);
    const fraction = Math.round(elapsed * 100) / 100;
    if (meter.value !== fraction) meter.value = fraction;
    showText(label, RECIPES[job.recipe].label + ' · 剩 ' + remaining + ' 游戏分钟');
  }

  function frame(now: number) {
    const dt = Math.min(.25, Math.max(0, (now - previous) / 1000));
    previous = now;
    if (!saves.busy && !document.hidden && document.hasFocus() && !game.review) {
      applyTime(dt);
      if (!game.review && !panel && !placement) move(dt);
    }
    const position: Point = step ? [
      game.position[0] + (step.to[0] - game.position[0]) * step.progress,
      game.position[1] + (step.to[1] - game.position[1]) * step.progress,
    ] : game.position;
    if (hit && game.minute - hit.minute >= .42) hit = null;
    const target = activeTarget() ?? hovered ?? selected;
    draw(game, position, target, placement, {
      step: step?.progress ?? null, facing, progress: target ? targetProgress(game, target) : null, hit,
    });
    updateJobPanel();
    updateHud(now);
    if (!saves.busy && !game.review && !document.hidden && now - previousSave >= 180000) {
      previousSave = now;
      void saves.save();
    }
    requestAnimationFrame(frame);
  }

  function openPanel(name: Panel) {
    if (saves.busy || (game.review && name !== 'saves')) return;
    if (panel === name) {
      closePanel();
      return;
    }
    stopMovement();
    panel = name;
    selectedStack = null;
    sheet.classList.toggle('warehouse-sheet', name === 'warehouse');
    report('', sheetMessage);
    renderPanel();
    if (!sheet.open) sheet.showModal();
    if (name === 'archive') tradingBook.focus();
  }

  function closePanel() {
    panel = null;
    selectedStack = null;
    if (sheet.open) sheet.close();
  }

  function renderPanel() {
    if (!panel) return;
    const titles = { bag: '背包', warehouse: '仓库', ledger: '物志', map: '柳湾地图', saves: '存档', archive: '田记所账面', ...STATIONS };
    node('sheet-title').textContent = titles[panel];
    const update = (text: string) => {
      renderPanel();
      report(text, sheetMessage);
      void saves.save();
    };
    if (panel === 'archive') {
      tradingBook.render(body, game, text => {
        report(text, sheetMessage);
        void saves.save();
      });
    } else if (panel === 'ledger') {
      body.replaceChildren(ledgerPanel(game, selectedEntry, id => { selectedEntry = id; renderPanel(); }, assetUrl));
    } else if (panel === 'map') {
      body.replaceChildren(...mapPanel(world, game));
    } else if (panel === 'bag' || panel === 'warehouse') {
      const scroll = sheet.scrollTop;
      body.replaceChildren(...inventoryPanel(game, panel === 'warehouse', selectedStack, selectStack, transferStack,
        index => {
          selectSlot(index);
          closePanel();
          canvas.focus({ preventScroll: true });
        }, update, beginPlacement));
      sheet.scrollTop = scroll;
    } else if (panel === 'saves') {
      void saves.render();
    } else {
      const station = panel;
      body.replaceChildren(...stationPanel(game, station, update, () => beginPlacement(station, true)));
    }
    tickPanel();
    updateJobPanel();
  }

  function focusStack({ storage, index }: SlotAddress) {
    body.querySelector<HTMLButtonElement>('[data-storage="' + storage + '"][data-index="' + index + '"]')
      ?.focus({ preventScroll: true });
  }

  function selectStack(address: SlotAddress) {
    const from = selectedStack;
    if (from && game[from.storage][from.index] && (from.index !== address.index || from.storage !== address.storage)) {
      transferStack(from, address);
      return;
    }
    selectedStack = !from && game[address.storage][address.index] ? address : null;
    renderPanel();
    focusStack(address);
  }

  function transferStack(from: SlotAddress, to: SlotAddress) {
    if (saves.busy || (panel !== 'bag' && panel !== 'warehouse') ||
      (panel !== 'warehouse' && (from.storage !== 'bag' || to.storage !== 'bag'))) return;
    if (!moveStack(game, from, to)) return;
    selectedStack = null;
    renderHotbar(game);
    renderPanel();
    focusStack(to);
    void saves.save();
  }

  function beginPlacement(kind: Station, moving = false) {
    if (moving ? !game.stations[kind] || game.jobs[kind] : !canBuild(game, kind)) return;
    placement = { kind, moving, tile: null, allowed: false };
    selected = hovered = null;
    closePanel();
    report('选择一格空地' + (moving ? '搬移' : '摆放') + STATIONS[kind] + '。');
  }

  function canSwitchSlots() {
    return !game.review && !panel && !placement && !saves.busy;
  }

  function selectSlot(index: number | null, row?: number) {
    if (!equipSlot(game, index, row)) return;
    pendingTarget = null;
    renderHotbar(game);
    void saves.save();
  }

  function cycleRow() {
    const row = (game.hotbarRow + 1) % (BAG_SLOTS / HOTBAR_COLUMNS);
    selectSlot(game.equippedSlot === null ? null : row * HOTBAR_COLUMNS + game.equippedSlot % HOTBAR_COLUMNS, row);
  }

  function cycleSlot(direction: number) {
    const rowStart = game.hotbarRow * HOTBAR_COLUMNS;
    const column = game.equippedSlot === null ? (direction > 0 ? -1 : HOTBAR_COLUMNS) : game.equippedSlot % HOTBAR_COLUMNS;
    for (let offset = 1; offset <= HOTBAR_COLUMNS; offset++) {
      const index = rowStart + (column + direction * offset + HOTBAR_COLUMNS) % HOTBAR_COLUMNS;
      if (game.bag[index]) {
        selectSlot(index);
        return;
      }
    }
  }

  function worldPoint(event: MouseEvent): Point | null {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width - view.left;
    const y = (event.clientY - rect.top) * canvas.height / rect.height - view.top;
    return x >= 0 && y >= 0 && x < view.width && y < view.height ? [view.x + x, view.y + y] : null;
  }

  function tileAt([x, y]: Point): Point {
    return [Math.floor(x / TILE), Math.floor(y / TILE)];
  }

  canvas.addEventListener('pointermove', event => {
    const point = worldPoint(event);
    if (placement) {
      const tile = point && tileAt(point);
      if (tile?.join() === placement.tile?.join()) return;
      placement.tile = tile;
      placement.allowed = Boolean(tile && canPlace(game, placement.kind, tile));
    } else hovered = point ? pick(...point, equippedTool(game)) ?? null : null;
  });
  canvas.addEventListener('pointerleave', () => { hovered = null; });
  canvas.addEventListener('click', event => {
    if (saves.busy || game.review || panel) return;
    const point = worldPoint(event);
    if (!point) return;
    const tile = tileAt(point);
    if (placement) {
      if (!canPlace(game, placement.kind, tile)) {
        report('此处不可摆放。请选可到达的空地。');
        return;
      }
      const result = place(game, placement.kind, tile, placement.moving);
      if (!result) return;
      setStations(game);
      placement = null;
      report(result);
      void saves.save();
    } else {
      canvas.focus({ preventScroll: true });
      selected = pick(...point, equippedTool(game)) ?? null;
      go(selected?.points ?? [tile], selected);
    }
  });

  function changeZoom(direction: number) {
    zoom.level = Math.max(0, Math.min(zoom.scales.length - 1, zoom.level + direction));
    node<HTMLButtonElement>('zoom-in').disabled = zoom.level === zoom.scales.length - 1;
    node<HTMLButtonElement>('zoom-out').disabled = zoom.level === 0;
  }
  let scroll = 0;
  let lastScroll = -Infinity;
  let lastWheelStep = -Infinity;
  let zoomGesture = false;
  function handleWheel(event: WheelEvent) {
    if (event.ctrlKey) return;
    event.preventDefault();
    const zooming = event.shiftKey || Boolean(placement);
    if (!zooming && !canSwitchSlots()) return;
    const now = performance.now();
    if (now - lastScroll > 160 || zooming !== zoomGesture) scroll = 0;
    zoomGesture = zooming;
    lastScroll = now;
    const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 100 : 1);
    if (scroll && Math.sign(scroll) !== Math.sign(delta)) scroll = 0;
    scroll += delta;
    if (Math.abs(scroll) >= (zooming ? 65 : 32) && now - lastWheelStep >= 115) {
      if (zooming) changeZoom(-Math.sign(scroll));
      else cycleSlot(Math.sign(scroll));
      scroll = 0;
      lastWheelStep = now;
    }
  }
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  node('hotbar').addEventListener('wheel', handleWheel, { passive: false });
  node('hotbar-page').addEventListener('click', () => {
    if (!canSwitchSlots()) return;
    cycleRow();
    canvas.focus({ preventScroll: true });
  });
  node('zoom-in').addEventListener('click', () => changeZoom(1));
  node('zoom-out').addEventListener('click', () => changeZoom(-1));
  changeZoom(0);

  document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.ctrlKey || event.metaKey || event.altKey ||
        (target instanceof HTMLElement && target.closest('input, textarea, select'))) return;
    const key = event.key.toLowerCase();
    const panels = { b: 'bag', j: 'ledger', m: 'map' } as const;
    if (!event.repeat && Object.hasOwn(panels, key)) {
      openPanel(panels[key as keyof typeof panels]);
      return;
    }
    if (panel || game.review || saves.busy) return;
    const digit = /^(?:Digit|Numpad)([1-8])$/.exec(event.code);
    if (digit && canSwitchSlots() && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) {
        const index = game.hotbarRow * HOTBAR_COLUMNS + Number(digit[1]) - 1;
        selectSlot(game.equippedSlot === index ? null : index);
      }
      return;
    }
    if (key === 'tab' && !event.shiftKey && canSwitchSlots() && (target === canvas || target === document.body)) {
      event.preventDefault();
      if (!event.repeat) cycleRow();
      return;
    }
    if (key === 'escape') {
      if (placement) gameAction();
      else selectSlot(null);
    } else if (key === 'f' && !event.repeat) {
      event.preventDefault();
      gameAction();
    } else if (Object.hasOwn(MOVES, key) && !placement) {
      event.preventDefault();
      route = [];
      pendingTarget = null;
      selected = null;
      keys.add(key);
    }
  });
  document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  const directions = node('direction-pad');
  node('directions').addEventListener('click', event => {
    directions.hidden = !directions.hidden;
    (event.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!directions.hidden));
  });
  for (const control of directions.querySelectorAll('button')) {
    const direction = control.dataset.direction!;
    control.addEventListener('pointerdown', event => {
      event.preventDefault();
      control.setPointerCapture(event.pointerId);
      route = [];
      pendingTarget = null;
      selected = null;
      keys.add(direction);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      control.addEventListener(name, () => keys.delete(direction));
    }
  }
  actionButton.addEventListener('click', gameAction);
  for (const name of ['bag', 'ledger', 'map', 'saves'] as const) {
    node('game-' + name).addEventListener('click', () => openPanel(name));
  }
  node('sheet-close').addEventListener('click', closePanel);
  sheet.addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
  review.addEventListener('cancel', event => event.preventDefault());
  node('review-saves').addEventListener('click', () => openPanel('saves'));
  nextButton.addEventListener('click', async () => {
    if (saves.busy || !game.review) return;
    const next = structuredClone(game);
    if (!nextDay(next, savedReviewDay)) return;
    renewResources(next);
    nextButton.disabled = true;
    try {
      if (await saves.transition(next)) {
        restore(next);
        report('新的一天开始了。');
      } else {
        node('review-body').append(element('p', '保存失败，请重新确认次日。'));
      }
    } finally {
      nextButton.disabled = false;
    }
  });

  function refreshFrameClock() {
    previous = performance.now();
    if (!saves.busy && (document.hidden || !document.hasFocus())) void saves.save(false);
  }
  document.addEventListener('visibilitychange', refreshFrameClock);
  window.addEventListener('focus', refreshFrameClock);
  window.addEventListener('blur', () => {
    keys.clear();
    refreshFrameClock();
  });
  window.addEventListener('pagehide', () => { if (!saves.busy) void saves.save(false); });

  if (import.meta.env.DEV && new URLSearchParams(location.search).has('playtest')) {
    const speed = node('game-speed');
    speed.hidden = false;
    speed.addEventListener('click', () => { if (!saves.busy) applyTime(60); });
  }
  if (game.review) {
    savedReviewDay = game.day;
    showReview();
  }
  void saves.save();
  requestAnimationFrame(frame);
}
