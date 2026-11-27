(() => {
  'use strict';

  const G = window.LiuwanGame;
  const {TILE} = window.GroundEngine;
  const SPEED = 6;
  const WALK_SPEED = 6;
  const MOVES = {w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0]};
  const plotLabels = {
    ground: '翻地', tilled: '播种', seed: '浇水', ripe: '收获',
  };

  window.createLiuwanControls = function ({world, canvas, view, zoom, targets, blocked, draw, pick, setStations, canPlace}) {
    const node = id => document.getElementById(id);
    const game = load();
    setStations(game);
    if (!G.passable(world, blocked, ...game.position)) game.position = G.newGame(world).position;
    const keys = new Set();
    let route = [];
    let pending = null;
    let step = null;
    let previous = performance.now();
    let previousSave = previous;
    let panel = null;
    let message = '点击田块翻地，或用 WASD 走过去按 E。翻地后可播种、浇水。';
    let storageAvailable = true;
    let lastHud = '';
    let hovered = null;
    let placement = null;
    const stationNames = {kiln: '火灶', jar: '腌菜缸'};
    const menu = node('game-menu');
    const review = node('game-review');
    const siteList = node('map-sites');
    const actionButton = node('game-action');
    const menuTitles = {bag: '背包', ledger: '物志', sites: '地点'};

    function showMenu(name) {
      panel = panel === name ? null : name;
      menu.hidden = !panel;
      if (panel) node('game-menu-title').textContent = menuTitles[panel];
      siteList.hidden = panel !== 'sites';
      node('game-panel').hidden = panel === 'sites';
      node('game-build').hidden = panel !== 'bag';
      for (const item of Object.keys(menuTitles)) {
        node('game-' + item).setAttribute('aria-expanded', String(item === panel));
      }
      renderHud();
    }

    function updateZoom() {
      node('zoom-map').setAttribute('aria-pressed', String(zoom.overview));
      node('zoom-in').disabled = !zoom.overview && zoom.level === zoom.scales.length - 1;
      node('zoom-out').disabled = zoom.overview;
    }

    function changeZoom(direction) {
      if (zoom.overview) {
        if (direction > 0) zoom.overview = false;
      } else if (direction < 0 && zoom.level === 0) {
        zoom.overview = true;
      } else {
        zoom.level = Math.max(0, Math.min(zoom.scales.length - 1, zoom.level + direction));
      }
      updateZoom();
    }

    function load() {
      try {
        const saved = JSON.parse(localStorage.getItem(G.SAVE_KEY));
        if (saved?.version === 1 && saved.plots?.length === world.plots.length &&
            Number.isFinite(saved.minute) && saved.bag && saved.entries && saved.jobs && Array.isArray(saved.log) &&
            G.passable(world, blocked, ...saved.position)) {
          saved.stations ??= G.newGame(world).stations;
          return saved;
        }
      } catch {
        // A missing or unreadable save starts a new demo.
      }
      return G.newGame(world);
    }

    function save() {
      try {
        localStorage.setItem(G.SAVE_KEY, JSON.stringify(game));
      } catch {
        storageAvailable = false;
      }
    }

    function isNear(target) {
      return target.points.some(([x, y]) => x === game.position[0] && y === game.position[1]);
    }

    function nearby() {
      return targets.find(isNear) ?? null;
    }

    function operate(target) {
      if (!target || game.review) return;
      const wasSubmitted = game.submitted;
      message = G.interact(game, target);
      if (game.submitted !== wasSubmitted) setStations(game);
      hovered = target;
      save();
      renderHud();
    }

    function go(points, action = null) {
      if (game.review) return;
      keys.clear();
      const destination = G.routeTo(world, blocked, step?.to ?? game.position, points);
      route = destination ?? [];
      pending = destination && (step || route.length) ? action : null;
      if (pending) return;
      if (!route.length && action && isNear(action)) operate(action);
      else if (!route.length && !points.some(([x, y]) => x === game.position[0] && y === game.position[1])) {
        message = '这里走不过去。';
      }
    }

    function fill(parent, values) {
      if (parent.dataset.text === JSON.stringify(values)) return;
      parent.dataset.text = JSON.stringify(values);
      parent.replaceChildren(...values.map(value => {
        const child = document.createElement(parent.tagName === 'UL' ? 'li' : 'p');
        child.textContent = value;
        if (panel === 'bag' && parent.id === 'game-panel' && value.startsWith('樱桃萝卜 ×')) {
          const icon = document.createElement('img');
          icon.src = 'assets/cherry-radish/05-inventory.png';
          icon.alt = '';
          icon.width = 24;
          icon.height = 24;
          child.prepend(icon);
        }
        return child;
      }));
    }

    function renderHud() {
      const minute = game.review ? 1440 : 360 + Math.floor(game.minute % G.DAY);
      const pad = number => String(number).padStart(2, '0');
      const clock = pad(Math.floor(minute / 60)) + ':' + pad(minute % 60);
      const action = hovered && isNear(hovered) ? hovered : nearby();
      const plot = action?.kind === 'plot' ? game.plots[action.id] : null;
      const actionText = plot ? plotLabels[G.cropStage(game, plot)] ?? '查看长势' : action?.label;
      const growth = plot && !placement ? G.describeGrowth(game, plot) : '';
      const stateText = JSON.stringify([clock, game.day, actionText, growth, message, Boolean(placement), game.review, game.submitted, panel, game.coins, game.bag, game.entries, game.jobs, storageAvailable]);
      if (stateText === lastHud) return;
      lastHud = stateText;
      node('game-clock').textContent = clock;
      node('game-date').textContent = '春 · 第 ' + game.day + ' 天';
      node('game-coins').textContent = game.coins + ' 文';
      node('game-objective').textContent = game.submitted ? '柳湾第一卷 · 已归档' : '柳湾第一卷';
      node('game-line').textContent = game.submitted ? '田记所与旧盐坑的字迹已恢复。仍可继续耕作。' :
        Object.keys(G.ENTRIES).every(id => game.entries[id]?.lit) ? '到田记所提交这页物志。' :
        game.jobs.jar ? '腌制中。完工后到田记所提交物志。' :
        G.count(game, 'radish') && G.count(game, 'salt') ? '原料齐了，去腌菜缸做盐渍樱桃萝卜。' :
        '种樱桃萝卜 · 采岩盐制粗盐 · 腌菜 · 提交物志';
      node('depth-status').textContent = message + (storageAvailable ? '' : ' 当前浏览器无法保存进度。');
      node('depth-status').hidden = !node('depth-status').textContent;
      node('crop-context').textContent = growth;
      node('crop-context').hidden = !growth || game.review;
      if (placement) actionButton.textContent = '取消摆放 · Esc';
      else if (action) {
        const key = document.createElement('kbd');
        key.textContent = 'E';
        actionButton.replaceChildren(actionText + ' ', key);
      }
      actionButton.hidden = (!action && !placement) || game.review;
      actionButton.disabled = game.review;
      node('game-speed').disabled = game.review;
      if (game.review) {
        fill(node('review-log'), game.log.length ? game.log.slice(-5) : ['今日没有新记录。']);
        if (!review.open) review.showModal();
      } else if (review.open) {
        review.close();
      }
      if (!panel || panel === 'sites') return;
      fill(node('game-panel'), panel === 'bag'
        ? Object.entries(G.ITEMS).map(([id, label]) => label + ' ×' + G.count(game, id))
        : Object.entries(G.ENTRIES).map(([id, rule]) => {
          const entry = game.entries[id];
          if (entry?.lit) return G.ITEMS[id] + ' · 已上锚';
          if (!entry) return G.ITEMS[id] + ' · 待发现';
          const left = Math.max(0, Math.ceil(entry.deadline - game.minute));
          return G.ITEMS[id] + ' · ' + (left ? '剩 ' + left + ' 游戏分钟' : '本轮已超时') + '。' + rule.hint;
        }));
    }

    function timePassing(minutes) {
      const notes = G.advance(game, minutes);
      if (notes.length) message = notes.at(-1);
      if (notes.length || game.review) save();
      if (game.review) {
        route = [];
        pending = null;
        step = null;
        keys.clear();
        placement = null;
      }
    }

    function frame(now) {
      const dt = Math.min(.15, (now - previous) / 1000);
      previous = now;
      if (!document.hidden && document.hasFocus() && !game.review) {
        timePassing(dt * SPEED);
        if (!game.review) move(dt);
      }
      const position = step ? [
        game.position[0] + (step.to[0] - game.position[0]) * step.progress,
        game.position[1] + (step.to[1] - game.position[1]) * step.progress,
      ] : game.position;
      draw(game, position, hovered, placement);
      renderHud();
      if (!document.hidden && now - previousSave >= 2000) {
        previousSave = now;
        save();
      }
      requestAnimationFrame(frame);
    }

    function move(dt) {
      if (!step) {
        const direction = MOVES[[...keys].at(-1)];
        const next = direction ? game.position.map((value, i) => value + direction[i]) : route.shift();
        if (!next || !G.passable(world, blocked, ...next)) return;
        step = {to: next, progress: 0};
      }
      step.progress += dt * WALK_SPEED;
      if (step.progress < 1) return;
      game.position = step.to;
      step = null;
      if (route.length || !pending) return;
      const target = pending;
      pending = null;
      if (isNear(target)) operate(target);
    }

    function interactNearby() {
      if (game.review) return;
      if (placement) {
        placement = null;
        message = '已取消摆放。';
        renderHud();
        return;
      }
      route = [];
      pending = null;
      const target = hovered && isNear(hovered) ? hovered : nearby();
      if (target) operate(target);
      else message = '走近田块或设施后再操作。';
    }

    function mapPoint(event) {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * canvas.width / rect.width - view.left;
      const y = (event.clientY - rect.top) * canvas.height / rect.height - view.top;
      return x >= 0 && y >= 0 && x < view.width && y < view.height ? [view.x + x, view.y + y] : null;
    }

    canvas.addEventListener('pointermove', event => {
      const point = mapPoint(event);
      if (placement) {
        const tile = point?.map(pixel => Math.floor(pixel / TILE));
        if (!tile || placement.tile?.some((value, i) => value !== tile[i]) || !placement.tile) {
          placement.tile = tile ?? null;
          placement.allowed = Boolean(tile && canPlace(game, placement.kind, tile));
        }
      } else {
        hovered = point ? pick(...point) : null;
      }
    });
    canvas.addEventListener('pointerleave', () => {
      hovered = null;
      if (placement) placement.tile = null;
    });
    canvas.addEventListener('click', event => {
      const point = mapPoint(event);
      if (!point) return;
      if (placement) {
        const tile = point.map(pixel => Math.floor(pixel / TILE));
        const kind = placement.kind;
        if (!canPlace(game, kind, tile)) {
          message = '这里不能摆放。请选有空地且走得到的一格。';
          return;
        }
        game.stations[kind] = tile;
        setStations(game);
        placement = null;
        message = '已摆放' + stationNames[kind] + '。';
        save();
        renderHud();
        return;
      }
      if (panel) showMenu(null);
      const target = pick(...point);
      hovered = target;
      if (target) go(target.points, target);
      else go([point.map(pixel => Math.floor(pixel / TILE))]);
      canvas.focus({preventScroll: true});
    });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      if (event.deltaY) changeZoom(Math.sign(-event.deltaY));
    }, {passive: false});
    node('zoom-in').addEventListener('click', () => changeZoom(1));
    node('zoom-out').addEventListener('click', () => changeZoom(-1));
    node('zoom-map').addEventListener('click', () => {
      zoom.overview = !zoom.overview;
      updateZoom();
    });
    updateZoom();

    const fullscreen = node('fullscreen');
    const stage = canvas.parentElement;
    if (document.fullscreenEnabled && stage.requestFullscreen) {
      fullscreen.hidden = false;
      fullscreen.addEventListener('click', async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await stage.requestFullscreen();
        } catch {
          message = '这个浏览器窗口无法进入全屏。';
        }
      });
      document.addEventListener('fullscreenchange', () => {
        const label = document.fullscreenElement ? '退出全屏' : '全屏';
        fullscreen.textContent = document.fullscreenElement ? '退出' : label;
        fullscreen.setAttribute('aria-label', label);
      });
    }

    document.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('select, input, textarea')) return;
      const key = event.key.toLowerCase();
      if (!game.review && !event.repeat) {
        if (key === 'b') showMenu('bag');
        if (key === 'j') showMenu('ledger');
        if (key === 'escape' && placement) interactNearby();
        else if (key === 'escape' && panel) showMenu(null);
      }
      if (key === 'e') {
        if (!event.repeat) interactNearby();
        return;
      }
      if (!MOVES[key] || game.review || placement) return;
      event.preventDefault();
      route = [];
      pending = null;
      keys.add(key);
    });
    document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => {
      keys.clear();
      save();
    });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => {
      previous = performance.now();
      if (document.hidden) save();
    });
    actionButton.addEventListener('click', interactNearby);
    node('game-speed').addEventListener('click', () => {
      timePassing(60);
      save();
      canvas.focus({preventScroll: true});
    });
    node('next-day').addEventListener('click', () => {
      G.nextDay(game);
      previous = performance.now();
      message = '新的一天开始了。';
      save();
      renderHud();
      canvas.focus({preventScroll: true});
    });
    review.addEventListener('cancel', event => event.preventDefault());
    for (const name of Object.keys(menuTitles)) {
      node('game-' + name).addEventListener('click', () => showMenu(name));
    }
    for (const kind of Object.keys(stationNames)) {
      node('place-' + kind).addEventListener('click', () => {
        if (game.review) return;
        if (game.jobs[kind]) {
          message = stationNames[kind] + '正在加工，完工后可移动。';
          renderHud();
          return;
        }
        route = [];
        pending = null;
        step = null;
        keys.clear();
        hovered = null;
        placement = {kind, tile: null, allowed: false};
        message = '点击空地摆放' + stationNames[kind] + '。';
        showMenu(null);
        canvas.focus({preventScroll: true});
      });
    }
    node('close-menu').addEventListener('click', () => {
      const opener = node('game-' + panel);
      showMenu(null);
      opener?.focus();
    });

    for (const site of world.sites) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = site.label;
      button.addEventListener('click', () => {
        const target = targets.find(candidate => candidate.site === site.id);
        const point = [Math.floor(site.x), Math.floor(site.y)];
        go(target?.points ?? [point]);
        showMenu(null);
        canvas.focus({preventScroll: true});
      });
      node('map-sites').append(button);
    }
    save();
    renderHud();
    requestAnimationFrame(frame);
  };
})();
