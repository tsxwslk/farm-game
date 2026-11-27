import { type Game, formatClock, newGame } from './game';
import { button, element, node } from './panels';
import { openSaves, snapshot, validateSave, type Save } from './saves';
import type { Scene } from './scene';
import type { Point, Station } from './content';

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function label(saved: Game) {
  return '第 ' + saved.day + ' 天 · ' + formatClock(saved) + (saved.review ? ' 午夜日结' : '');
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : '无法读取或保存存档。';
}

export function createSaveControls(scene: Scene, body: HTMLElement, current: () => Game,
  restore: (game: Game) => void, visible: () => boolean, report: (message: string) => void) {
  const { world, blocked, setStations, canPlace } = scene;
  const { passable } = window.LiuwanGame;
  const picker = node<HTMLInputElement>('save-file');
  let store: Awaited<ReturnType<typeof openSaves>> | undefined;
  let gameId = newId();
  let busy = false;

  function relocateForNewMap(game: Game) {
    const tiles = world.cells.map<Point>((_, index) => [index % world.cols, Math.floor(index / world.cols)]);
    const nearest = ([ox, oy]: Point, available: (tile: Point) => boolean) => {
      const distance = ([x, y]: Point) => Math.abs(x - ox) + Math.abs(y - oy);
      return tiles.slice().sort((a, b) => distance(a) - distance(b)).find(available);
    };
    if (!passable(world, blocked, ...game.position)) {
      const landing = nearest(game.position, tile => passable(world, blocked, ...tile));
      if (!landing) throw new Error('地图上没有可恢复的角色位置。');
      game.position = landing;
      game.action = null;
    }
    for (const [kind, point] of Object.entries(game.stations) as [Station, Point][]) {
      if (canPlace(game, kind, point)) continue;
      const space = nearest(point, tile => canPlace(game, kind, tile));
      if (!space) throw new Error('地图上没有可恢复的设施位置。');
      game.stations[kind] = space;
      setStations(game);
    }
  }

  function check(data: unknown) {
    const version = (data as Partial<Save> | null)?.game?.schemaVersion;
    const save = validateSave(data, world);
    try {
      setStations(save.game);
      if (typeof version === 'number' && version < 5) relocateForNewMap(save.game);
      for (const [kind, point] of Object.entries(save.game.stations) as [Station, Point][]) {
        if (!canPlace(save.game, kind, point)) throw new Error('存档里的设施位置不可用。');
      }
      if (!passable(world, blocked, ...save.game.position)) throw new Error('存档里的角色位置不可用。');
    } finally {
      setStations(current());
    }
    return save;
  }

  async function load() {
    try {
      store = await openSaves();
      const data = await store.active();
      if (data !== undefined) {
        const save = check(data);
        gameId = save.id;
        return save.game;
      }
    } catch (error) {
      report(store ? errorText(error) : '无法打开本地存档。');
    }
    return newGame(world);
  }

  async function save(showError = true) {
    if (!store || busy) return false;
    try {
      await store.write(snapshot(current(), gameId), true);
      return true;
    } catch {
      if (showError) report('本地保存失败。');
      return false;
    }
  }

  async function transition(game: Game) {
    if (busy) return false;
    busy = true;
    try {
      if (store) await store.write(snapshot(game, gameId), true);
      return true;
    } catch {
      return false;
    } finally {
      busy = false;
    }
  }

  async function render() {
    const controls = element('div', undefined, 'sheet-actions');
    controls.append(
      button('立即保存', async () => {
        if (await save()) report('已保存当前进度。');
      }, !store, true),
      button('导出 JSON', exportSave),
      button('导入 JSON', () => picker.click(), !store),
    );
    const slots = element('ul', undefined, 'sheet-list');
    body.replaceChildren(controls, element('h3', '本机档位', 'section-title'), slots);
    if (!store) {
      slots.append(element('li', '本地存档不可用。'));
      return;
    }
    try {
      const saves = (await store.list()).map(({ id, data }): { id: string; save?: Save } => {
        try {
          const save = check(data);
          return save.id === id ? { id, save } : { id };
        } catch {
          return { id };
        }
      }).sort((a, b) => (b.save?.savedAt ?? '').localeCompare(a.save?.savedAt ?? ''));
      for (const { id, save } of saves) {
        const active = id === gameId;
        const title = active ? label(current()) : save ? label(save.game) : '无法读取的存档';
        const date = save ? new Date(save.savedAt).toLocaleString() : '档位 ' + id.slice(-8);
        const line = element('li', undefined, 'sheet-row');
        const details = element('div');
        details.append(element('div', title), element('small', date, 'sheet-note'));
        const actions = element('div', undefined, 'sheet-actions');
        if (active) actions.append(element('span', '当前档位', 'sheet-note'));
        else {
          if (save) actions.append(button('读取此档', () => confirmSave(save, false)));
          actions.append(button('删除', () => confirmDelete(id, title, date)));
        }
        line.append(details, actions);
        slots.append(line);
      }
      if (!slots.children.length) slots.append(element('li', '暂无已保存的进度。'));
    } catch {
      report('无法读取本机档位。');
    }
  }

  async function exportSave() {
    if (busy) return;
    busy = true;
    const save = snapshot(current(), gameId);
    try {
      if (store) await store.write(save, true);
      const url = URL.createObjectURL(new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' }));
      const link = element('a');
      link.href = url;
      link.download = '柳湾-第' + save.game.day + '天-' + save.savedAt.replaceAll(':', '-') + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      report('已导出存档。');
    } catch {
      report('未能导出存档。');
    } finally {
      busy = false;
    }
  }

  function confirmSave(save: Save, importing: boolean) {
    const details = element('div', undefined, 'save-preview');
    details.append(element('p', label(save.game)),
      element('p', '保存时间 ' + new Date(save.savedAt).toLocaleString(), 'sheet-note'));
    const controls = element('div', undefined, 'sheet-actions');
    controls.append(button('返回', render), button(importing ? '导入为新档位' : '确认读取',
      () => void activateSave(save, importing), false, true));
    body.replaceChildren(details, controls);
    report('');
  }

  function confirmDelete(id: string, title: string, date: string) {
    if (!store || busy || id === gameId) return;
    const details = element('div', undefined, 'save-preview');
    details.append(element('p', title), element('p', date, 'sheet-note'),
      element('p', '永久删除这个本机档位？'));
    const actions = element('div', undefined, 'sheet-actions');
    const confirm = button('确认删除', () => void deleteSave(id, confirm), false, true);
    actions.append(button('取消', render), confirm);
    body.replaceChildren(details, actions);
    report('');
  }

  async function deleteSave(id: string, confirm: HTMLButtonElement) {
    if (!store || busy || !visible() || id === gameId) return;
    busy = true;
    confirm.disabled = true;
    try {
      const removed = await store.remove(id);
      if (visible()) {
        await render();
        report(removed ? '已删除存档。' : '这个档位正在使用，请先切换档位。');
      }
    } catch {
      if (visible()) report('未能删除存档，请重试。');
    } finally {
      confirm.disabled = false;
      busy = false;
    }
  }

  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file || busy) return;
    picker.value = '';
    try {
      const save = check(JSON.parse(await file.text()));
      if (visible()) confirmSave(save, true);
    } catch (error) {
      report(errorText(error));
    }
  });

  async function activateSave(save: Save, importing: boolean) {
    if (!store || busy || !visible()) return;
    busy = true;
    try {
      const verified = check(save);
      await store.write(snapshot(current(), gameId));
      const id = importing ? newId() : verified.id;
      await store.write({ ...verified, id }, true);
      gameId = id;
      restore(verified.game);
      report('已启用所选存档。');
    } catch (error) {
      report(errorText(error));
    } finally {
      busy = false;
    }
  }

  return { load, save, transition, render, get busy() { return busy; } };
}
