(() => {
  'use strict';

  const E = window.GroundEngine;
  const G = window.LiuwanGame;
  const {TILE} = E;
  const D = window.DepthAssets;
  const ground = window.GroundPainter;
  const world = E.createWorld();
  const W = world.cols * TILE;
  const H = world.rows * TILE;
  const BED_HEIGHT = 4;
  const images = {};

  const element = id => document.getElementById(id);
  const canvas = element('depth-scene');
  const ctx = canvas.getContext('2d', {alpha: false});
  const stage = element('depth-stage');
  const status = element('depth-status');
  const zoom = {level: 0, overview: false, scales: [1, 1.4, 2, 3]};
  const view = {x: 0, y: 0, left: 0, top: 0, width: W, height: H};
  let painter;
  let previousGround = '';
  let previousFrame = '';
  let previousView = '';

  function layer() {
    const buffer = document.createElement('canvas');
    buffer.width = W;
    buffer.height = H;
    const context = buffer.getContext('2d', {alpha: false});
    context.imageSmoothingEnabled = false;
    return context;
  }

  const base = layer();
  const groundLayer = layer();
  const scene = layer();
  const sprites = {
    figure: {...window.GroundAssets.figure, contact: 18},
    cottage: D.cottage,
    crate: {...D.crate, contact: 28},
    seedBox: {...D.crate, contact: 28},
    jar: {...D.jar, contact: 16},
    willow: {file: 'assets/willow/willow-imported.png', anchor: [48, 122], contact: 13},
    salt: {file: 'assets/rock/rock-ore-salt.png', anchor: [24, 44], contact: 28},
    stone: {file: 'assets/rock/rock-atlas.png', anchor: [24, 44], frameSize: 48, frames: 3, contact: 26},
  };
  const bedColors = {
    dry: '#754a24',
    wet: '#503322',
  };

  const at = (kind, x, y, details = {}) => ({
    kind, x: Math.round(x * TILE), y: Math.round(y * TILE), level: 0, ...details,
  });
  const cropFiles = Object.fromEntries(G.CROP_STAGES.filter(stage => stage.file)
    .map(stage => [stage.id, 'assets/cherry-radish/' + stage.file]));
  const fixedActors = [
    at('cottage', 6.2, 5.65), at('crate', 8.25, 5.4),
    at('mark', 10.15, 3.9, {hint: '□□萝卜入瓮', text: '樱桃萝卜入瓮'}),
    at('seedBox', 16.4, 4.8),
    at('salt', 21.2, 5.25), at('mark', 19.6, 5.6, {hint: '□坑', text: '盐坑'}),
    at('stone', 1.6, 7.2), at('stone', 7.4, 17.1), at('stone', 13.7, 2),
    at('stone', 14.7, 13.8), at('stone', 23.6, 3.9),
    at('stone', 23.3, 13.7), at('stone', 2.8, 15.8),
    at('willow', 15.05, 3.1), at('willow', 17.9, 4.1),
    at('willow', 26.95, 2.45), at('willow', 24.85, 4.25),
    at('willow', 25.45, 6.25), at('willow', 23.85, 8.2),
    at('willow', 26.25, 12.45), at('willow', 24.65, 14.45),
    at('willow', 25.25, 16.2), at('willow', 23.95, 18.2),
    at('willow', 21.85, 19.3, {forgotten: true}),
    at('jar', 19.9, 16.5, {forgotten: true}),
  ];
  let actors = fixedActors;

  function bedColor(cells, x, y) {
    return bedColors[cells[Math.floor(y / TILE) * world.cols + Math.floor(x / TILE)]];
  }

  function drawBeds(game) {
    const cells = [...world.cells];
    for (const plot of world.plots) {
      const status = game.plots[plot.id];
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = (plot.y / TILE + dy) * world.cols + plot.x / TILE + dx;
          cells[i] = status.tilled ? status.watered === null ? 'dry' : 'wet' : 'grass';
        }
      }
    }
    const signature = cells.join(',');
    if (signature === previousGround) return;
    previousGround = signature;
    groundLayer.drawImage(base.canvas, 0, 0);
    for (const plot of world.plots) {
      if (!game.plots[plot.id].tilled) continue;
      const colors = bedColor(cells, plot.x, plot.y);
      groundLayer.fillStyle = colors;
      groundLayer.fillRect(plot.x + 5, plot.y + 54, 54, 6);
    }
    painter.field(groundLayer, {...world, cells}, BED_HEIGHT);
    groundLayer.fillStyle = '#526a3690';
    for (const plot of world.plots) {
      if (game.plots[plot.id].tilled) continue;
      for (const [dx, dy, turnX, turnY] of [[3, 3, 1, 1], [60, 3, -1, 1], [3, 60, 1, -1], [60, 60, -1, -1]]) {
        groundLayer.fillRect(plot.x + dx, plot.y + dy, turnX * 7, 1);
        groundLayer.fillRect(plot.x + dx, plot.y + dy, 1, turnY * 7);
      }
    }
  }

  function pixelProp(actor, game) {
    const {kind, x, y} = actor;
    scene.save();
    scene.translate(x, y);
    const rect = (color, left, top, width, height) => {
      scene.fillStyle = color;
      scene.fillRect(left, top, width, height);
    };
    if (kind === 'kiln') {
      rect('#665949', -16, -20, 33, 20);
      rect('#aa8b6d', -15, -19, 29, 4);
      rect('#8b6f54', -16, -6, 33, 4);
      rect('#3d4139', -15, -24, 31, 6);
      rect('#798078', -12, -26, 25, 4);
      rect('#d1b898', -6, -15, 13, 11);
      rect('#50382a', -4, -13, 9, 9);
    } else if (kind === 'mark') {
      const label = game.submitted ? actor.text : actor.hint;
      const width = label.length * 10 + 8;
      rect('#654d36', -2, -22, 4, 22);
      rect('#71523b', -width / 2 - 1, -29, width + 2, 17);
      rect('#d9bb87', -width / 2, -28, width, 14);
      scene.fillStyle = '#614e38';
      scene.textAlign = 'center';
      scene.font = '10px system-ui, sans-serif';
      scene.fillText(label, 0, -17);
    }
    scene.restore();
  }

  function shadow(actor) {
    const {kind, x, level} = actor;
    const y = actor.y - level;
    const projected = D.shadows[kind];
    if (projected) {
      scene.drawImage(images[kind + 'Shadow'], x - projected.anchor[0], y - projected.anchor[1]);
    }
    const width = sprites[kind]?.contact;
    if (!width) return;
    if (kind === 'willow') {
      scene.fillStyle = '#3043322b';
      scene.fillRect(x - 9, y - 2, 27, 4);
      scene.fillRect(x - 4, y + 2, 27, 3);
      scene.fillRect(x + 9, y + 5, 10, 1);
    }
    scene.fillStyle = '#30433249';
    scene.fillRect(Math.round(x - width / 2), y - 2, width, 4);
  }

  function drawCrop(plot, stage) {
    const x = plot.x + 32, y = plot.y + 34 - BED_HEIGHT;
    const image = images[stage];
    if (image) {
      scene.drawImage(image, x - 24, y - 66);
    } else {
      scene.fillStyle = '#563d2a';
      scene.fillRect(x - 3, y - 1, 7, 3);
    }
  }

  function drawScene(game, position, hovered, placement) {
    drawBeds(game);
    scene.drawImage(groundLayer.canvas, 0, 0);

    const tileX = Math.floor(position[0] + .5), tileY = Math.floor(position[1] + .5);
    const x = Math.round((position[0] + .5) * TILE);
    const y = Math.round((position[1] + .55) * TILE);
    const plot = E.plotAt(world, (tileX + .5) * TILE, (tileY + .5) * TILE);
    const level = plot && game.plots[plot.id].tilled ? BED_HEIGHT : 0;
    const person = {kind: 'figure', x, y, level};
    const visible = actors.filter(actor => (game.submitted || !actor.forgotten) &&
      (actor.kind !== 'salt' || game.minute >= game.mineReady));
    visible.push(person);
    for (const plot of world.plots) {
      const stage = G.cropStage(game, game.plots[plot.id]);
      if (stage === 'ground' || stage === 'tilled') continue;
      visible.push({kind: 'crop', plot, stage, y: plot.y + 34});
    }
    for (const actor of visible) shadow(actor);
    if (hovered?.kind === 'plot') {
      const plot = world.plots[hovered.id];
      scene.strokeStyle = '#fff7bb';
      scene.strokeRect(plot.x + 2.5, plot.y + 2.5, 59, 59);
    }
    for (const actor of visible.sort((a, b) => a.y - b.y)) {
      if (actor.kind === 'crop') {
        drawCrop(actor.plot, actor.stage);
        continue;
      }
      const sprite = sprites[actor.kind];
      if (!sprite) {
        pixelProp(actor, game);
        continue;
      }
      const image = images[actor.kind];
      const x = actor.x - sprite.anchor[0], y = actor.y - sprite.anchor[1] - actor.level;
      if (sprite.frameSize) {
        const size = sprite.frameSize;
        const column = E.hash(actor.x, actor.y) % sprite.frames;
        scene.drawImage(image, column * size, 0, size, size, x, y, size, size);
      } else {
        scene.drawImage(image, x, y);
      }
    }
    for (const actor of actors) {
      if (!game.jobs[actor.kind]) continue;
      const recipe = G.RECIPES[actor.kind];
      const progress = 1 - (game.jobs[actor.kind].at - game.minute) / recipe.duration;
      scene.fillStyle = '#354639';
      scene.fillRect(actor.x - 12, actor.y + 4, 24, 4);
      scene.fillStyle = '#edd48b';
      scene.fillRect(actor.x - 11, actor.y + 5, Math.round(progress * 22), 2);
    }
    if (placement?.tile) {
      const [px, py] = placement.tile.map(value => value * TILE);
      scene.fillStyle = placement.allowed ? '#c3ee7780' : '#df656b90';
      scene.fillRect(px, py, TILE, TILE);
      scene.strokeStyle = placement.allowed ? '#eef8ba' : '#f6bab6';
      scene.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
      const ghost = at(placement.kind, placement.tile[0] + .5, placement.tile[1] + .6);
      scene.globalAlpha = .6;
      if (placement.kind === 'jar') {
        scene.drawImage(images.jar, ghost.x - D.jar.anchor[0], ghost.y - D.jar.anchor[1]);
      } else {
        pixelProp(ghost, game);
      }
      scene.globalAlpha = 1;
    }
  }

  function draw(game, position, hovered, placement) {
    const signature = JSON.stringify([position, hovered?.id, game.stations, placement, game.submitted, game.minute >= game.mineReady,
      game.plots.map(plot => G.cropStage(game, plot)), Object.entries(game.jobs).map(([station, job]) => [station, Math.ceil(job.at - game.minute)])]);
    const changed = signature !== previousFrame;
    if (changed) {
      previousFrame = signature;
      drawScene(game, position, hovered, placement);
    }

    const width = stage.clientWidth, height = stage.clientHeight;
    if (width < 1 || height < 1) return;
    const scale = zoom.overview
      ? Math.min(width / W, height / H)
      : Math.max(width / W, height / H) * zoom.scales[zoom.level];
    const pixelsWide = zoom.overview ? Math.ceil(width / scale) : Math.max(1, Math.floor(width / scale));
    const pixelsHigh = zoom.overview ? Math.ceil(height / scale) : Math.max(1, Math.floor(height / scale));
    view.width = Math.min(W, pixelsWide);
    view.height = Math.min(H, pixelsHigh);
    view.left = Math.floor((pixelsWide - view.width) / 2);
    view.top = Math.floor((pixelsHigh - view.height) / 2);
    view.x = Math.round(Math.max(0, Math.min(W - view.width, (position[0] + .5) * TILE - view.width / 2)));
    view.y = Math.round(Math.max(0, Math.min(H - view.height, (position[1] + .5) * TILE - view.height / 2)));
    const viewport = [pixelsWide, pixelsHigh, view.x, view.y].join('/');
    if (!changed && viewport === previousView) return;
    previousView = viewport;
    if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
    if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
    ctx.imageSmoothingEnabled = false;
    if (view.left || view.top || view.width !== pixelsWide || view.height !== pixelsHigh) {
      ctx.fillStyle = '#222b21';
      ctx.fillRect(0, 0, pixelsWide, pixelsHigh);
    }
    ctx.drawImage(scene.canvas, view.x, view.y, view.width, view.height,
                  view.left, view.top, view.width, view.height);
  }

  const targets = [
    {kind: 'archive', site: 'archive', actor: 'cottage', label: '提交物志', points: [[6, 6], [7, 6]]},
    {kind: 'kiln', actor: 'kiln', label: '制粗盐', points: []},
    {kind: 'jar', actor: 'jar', label: '腌菜', points: []},
    {kind: 'salt', site: 'salt', actor: 'salt', label: '敲岩盐', points: [[21, 6], [22, 5]]},
    {kind: 'forage', site: 'woods', actor: 'seedBox', label: '收集种子', points: [[16, 5]]},
    ...world.plots.map(plot => {
      const x = plot.x / TILE, y = plot.y / TILE;
      return {kind: 'plot', id: plot.id, points: [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]};
    }),
  ];
  const blocked = new Set();
  const scenery = new Set();
  const restoredScenery = new Set();
  const index = ([x, y]) => y * world.cols + x;
  for (let y = 3; y <= 5; y++) {
    for (let x = 4; x <= 7; x++) scenery.add(index([x, y]));
  }
  for (const actor of fixedActors) {
    if (actor.kind === 'cottage') continue;
    const cell = index([Math.floor(actor.x / TILE), Math.floor(actor.y / TILE)]);
    (actor.forgotten ? restoredScenery : scenery).add(cell);
  }

  function adjacent([x, y]) {
    return [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]];
  }

  function obstacles(stations, submitted) {
    return [...scenery, ...(submitted ? restoredScenery : []), ...Object.values(stations).map(index)];
  }

  function setStations(game) {
    actors = [...fixedActors, ...Object.entries(game.stations).map(([kind, [x, y]]) => at(kind, x + .5, y + .6))];
    blocked.clear();
    for (const cell of obstacles(game.stations, game.submitted)) blocked.add(cell);
    for (const target of targets) {
      if (game.stations[target.kind]) target.points = adjacent(game.stations[target.kind]);
    }
  }

  function canPlace(game, kind, tile) {
    if (!G.passable(world, scenery, ...tile) || restoredScenery.has(index(tile))) return false;
    if (index(tile) === index(game.position)) return false;
    if (E.family(world.cells[index(tile)]) === 'tilled') return false;
    if (Object.entries(game.stations).some(([id, point]) => id !== kind && index(tile) === index(point))) return false;

    const stations = {...game.stations, [kind]: tile};
    const occupied = new Set(obstacles(stations, game.submitted));
    return targets.filter(target => target.kind !== 'plot').every(target => {
      const points = stations[target.kind] ? adjacent(stations[target.kind]) : target.points;
      return G.routeTo(world, occupied, game.position, points) !== null;
    });
  }

  function pick(x, y) {
    for (const target of targets) {
      if (!target.actor) continue;
      const actor = actors.find(item => item.kind === target.actor && !item.forgotten);
      const sprite = sprites[actor.kind];
      const image = images[actor.kind];
      if (sprite) {
        const inset = actor.kind === 'jar' || actor.kind === 'salt' ? 9 : 4;
        const left = actor.x - sprite.anchor[0] + inset;
        const top = actor.y - sprite.anchor[1] + (actor.kind === 'salt' ? 20 : 6);
        if (x >= left && x < left + image.width - inset * 2 && y >= top && y <= actor.y) return target;
      } else if (x >= actor.x - 16 && x <= actor.x + 17 && y >= actor.y - 26 && y <= actor.y) {
        return target;
      }
    }
    const plot = E.plotAt(world, x, y);
    return plot ? targets.find(target => target.kind === 'plot' && target.id === plot.id) : null;
  }

  const files = {...ground.files, ...cropFiles};
  for (const [key, sprite] of Object.entries(sprites)) files[key] = sprite.file;
  for (const [key, shadow] of Object.entries(D.shadows)) {
    if (sprites[key]) files[key + 'Shadow'] = shadow.file;
  }
  Promise.all(Object.entries(files).map(([key, file]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { images[key] = image; resolve(); };
    image.onerror = () => reject(new Error('未能加载 ' + file));
    image.src = file;
  }))).then(() => {
    painter = ground.create(images);
    painter.base(base, world);
    window.createLiuwanControls({world, canvas, view, zoom, targets, blocked, draw, pick, setStations, canPlace});
  }).catch(error => {
    status.textContent = error.message;
    status.setAttribute('role', 'alert');
  });
})();
