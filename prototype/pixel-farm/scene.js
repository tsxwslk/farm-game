'use strict';

window.startLiuwanScene = function ({layout, jobMeter, assetUrl = file => file, createControls = window.createLiuwanControls} = {}) {

  const E = window.GroundEngine;
  const G = window.LiuwanGame;
  const {TILE} = E;
  const D = window.DepthAssets;
  const ground = window.GroundPainter;
  const world = E.createWorld({untouchedFields: Boolean(layout)});
  const W = world.cols * TILE;
  const H = world.rows * TILE;
  const BED_HEIGHT = 4;
  const images = {};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const element = id => document.getElementById(id);
  const canvas = element('depth-scene');
  const ctx = canvas.getContext('2d', {alpha: false});
  const stage = element('depth-stage');
  const status = element('depth-status');
  const zoom = {level: 0, overview: false, scales: layout ? [1, 1.15, 1.33, 1.55, 1.8, 2.1, 2.45, 2.85] : [1, 1.4, 2, 3]};
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
    kiln: {file: 'assets/kiln/salt-stove-scene-48x48.png', anchor: [24, 44], contact: 25},
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
  const demoActors = [
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
    at('willow', 26.95, 12.95, {scale: .625}), at('willow', 24.65, 14.45),
    at('willow', 25.25, 16.2), at('willow', 23.95, 18.2),
    at('willow', 21.85, 19.3, {forgotten: true}),
    at('jar', 19.9, 16.5, {forgotten: true}),
  ];
  const fixedActors = layout ? [
    ...demoActors.filter(actor => actor.kind === 'cottage' || actor.kind === 'crate' ||
      (actor.kind === 'willow' && actor.x >= 23 * TILE)),
    ...Object.entries(layout.resources).map(([id, resource]) =>
      at(resource.actor, resource.tile[0] + .5, resource.tile[1] + .62, {id, resource})),
  ] : demoActors;
  const mudPatches = fixedActors.filter(actor => actor.kind === 'clay');
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
    if (layout) return;
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
    if (kind === 'mark') {
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

  function drawWater(phase) {
    const lastRow = Math.min(world.rows, Math.ceil((view.y + view.height) / TILE));
    const lastCol = Math.min(world.cols, Math.ceil((view.x + view.width) / TILE));
    for (let row = Math.floor(view.y / TILE); row < lastRow; row++) {
      const shore = world.shoreColumns[row];
      for (let col = Math.max(shore + 1, Math.floor(view.x / TILE)); col < lastCol; col++) {
        const pattern = E.hash(col, row);
        const cycle = (phase + pattern % 42) % 42 / 42;
        const x = col * TILE + 2 + pattern % 12 + Math.round(cycle * 5);
        const y = row * TILE + 3 + pattern % 12 + Math.round(cycle * 10);
        const length = 5 + Math.round(Math.sin(cycle * Math.PI) * (6 + pattern % 5));
        scene.globalAlpha = .7 * Math.sin(cycle * Math.PI);
        scene.fillStyle = '#c3e0cd';
        scene.fillRect(x, y, length, 1);
        scene.fillRect(x + 3, y + 4, 3 + pattern % 4, 1);
        scene.fillStyle = '#518b8c';
        scene.fillRect(x + 2, y + 1, length - 2, 1);
      }
    }
    scene.globalAlpha = 1;
  }

  function drawFigure(actor, image, x, y, motion) {
    const moving = motion.step !== null && !reducedMotion.matches;
    const stride = moving ? Math.round(Math.sin(motion.step * Math.PI) * 4) : 0;
    const lead = (actor.x + actor.y) % (2 * TILE) < TILE ? 1 : -1;
    scene.save();
    scene.translate(x + image.width / 2, y);
    const [dx, dy] = motion.facing;
    if (dx) scene.scale(dx, 1);
    const left = -image.width / 2;
    if (!stride) {
      scene.drawImage(image, left, 0);
    } else {
      const sway = dx ? stride * lead : 0;
      scene.drawImage(image, 0, 0, image.width, 58, left + Math.round(sway / 2), -Math.round(stride / 2), image.width, 58);
      scene.drawImage(image, 0, 58, 20, 19, left - sway, 58 - Math.max(0, stride * lead * (dy || 1)), 20, 19);
      scene.drawImage(image, 20, 58, 20, 19, sway, 58 - Math.max(0, -stride * lead * (dy || 1)), 20, 19);
    }
    scene.restore();
  }

  function drawWorkImpact(impact, hitFrame) {
    const {point: [x, y], tool} = impact;
    const travel = Math.min(1, hitFrame / 8);
    const colors = {hoe: ['#d1a573', '#735233'], pick: ['#ddd9bd', '#847d62'],
      axe: ['#e2bb7c', '#9b6a3f'], can: ['#d5eeee', '#629f9f']};
    scene.globalAlpha = 1 - travel * .85;
    for (let i = 0; i < 7; i++) {
      const dx = (i - 3) * (4 + travel * 7);
      const dy = Math.sin(travel * Math.PI) * (5 + (i % 3) * 5);
      scene.fillStyle = colors[tool][i % 2];
      scene.fillRect(Math.round(x + dx), Math.round(y - dy - i % 2 * 5), i % 2 + 2, 2);
    }
    scene.globalAlpha = 1;
  }

  function drawStationStatus(actor, game, phase) {
    const job = game.jobs[actor.kind];
    const {x, y} = actor;
    const {remaining, elapsed, duration} = jobMeter(job, game.minute);
    if (actor.kind === 'kiln' && !job.ready && !reducedMotion.matches) {
      scene.fillStyle = phase % 5 < 3 ? '#ffb567' : '#d98145';
      scene.fillRect(x - 7, y - 8, 7, 3);
      for (let i = 0; i < 3; i++) {
        const rise = (phase + i * 6) % 18;
        scene.globalAlpha = (1 - rise / 18) * .7;
        scene.fillStyle = '#f8e7bb';
        scene.fillRect(x + Math.round(Math.sin(rise / 3) * 5), y - 27 - rise, 3 + (rise >> 3), 2);
      }
      scene.globalAlpha = 1;
    }
    const text = job.ready ? '可领取' : '剩 ' + remaining + ' 分';
    const width = 62;
    const top = y + 9;
    scene.fillStyle = '#302d23ef';
    scene.fillRect(x - width / 2, top, width, 19);
    scene.fillStyle = '#f3d692';
    scene.textAlign = 'center';
    scene.font = 'bold 11px system-ui, sans-serif';
    scene.fillText(text, x, top + 11);
    scene.fillStyle = '#645640';
    scene.fillRect(x - 27, top + 14, 54, 3);
    scene.fillStyle = '#e6bd6d';
    scene.fillRect(x - 27, top + 14, Math.round(54 * elapsed / duration), 3);
  }

  function drawScene(game, position, hovered, placement, motion, phase, hitFrame) {
    drawBeds(game);
    scene.drawImage(groundLayer.canvas, view.x, view.y, view.width, view.height, view.x, view.y, view.width, view.height);
    if (layout && !reducedMotion.matches) drawWater(phase);
    for (const patch of mudPatches) {
      const [col, row] = patch.resource.tile;
      const image = game.depleted[patch.id] ? images.mudDug : images.mud;
      scene.drawImage(image, col * TILE, row * TILE);
    }

    const tileX = Math.floor(position[0] + .5), tileY = Math.floor(position[1] + .5);
    const x = Math.round((position[0] + .5) * TILE);
    const y = Math.round((position[1] + .55) * TILE);
    const plot = E.plotAt(world, (tileX + .5) * TILE, (tileY + .5) * TILE);
    const level = plot && game.plots[plot.id].tilled ? BED_HEIGHT : 0;
    const person = {kind: 'figure', x, y, level};
    const visible = actors.filter(actor => actor.kind !== 'clay' && (game.submitted || !actor.forgotten) &&
      (layout || actor.kind !== 'salt' || game.minute >= game.mineReady) &&
      actor.x + 128 > view.x && actor.x - 128 < view.x + view.width &&
      actor.y + 32 > view.y && actor.y - 128 < view.y + view.height);
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
      const kind = actor.kind === 'salt' && layout && !game.strikes[actor.id] && !game.entries.rockSalt ? 'stone' : actor.kind;
      const sprite = sprites[kind];
      if (!sprite) {
        pixelProp(actor, game);
        continue;
      }
      const image = images[kind];
      const scale = actor.scale ?? 1;
      const x = actor.x - Math.round(sprite.anchor[0] * scale);
      const y = actor.y - Math.round(sprite.anchor[1] * scale) - actor.level;
      if (sprite.frameSize) {
        const size = sprite.frameSize;
        const column = E.hash(actor.x, actor.y) % sprite.frames;
        scene.drawImage(image, column * size, 0, size, size, x, y, size, size);
      } else if (layout && kind === 'figure') {
        drawFigure(actor, image, x, y, motion);
      } else {
        scene.drawImage(image, x, y, image.width * scale, image.height * scale);
      }
    }
    if (layout && game.action) {
      const swing = Math.max(0, Math.min(3, Math.floor((game.action.at - game.minute) * 22)));
      scene.save();
      scene.translate(person.x + 5, person.y - person.level - 9);
      scene.rotate(reducedMotion.matches ? 0 : swing * -.58 + .24);
      scene.fillStyle = '#754728';
      scene.fillRect(-1, -12, 2, 13);
      scene.fillStyle = '#77766a';
      scene.fillRect(-4, -13, 8, 3);
      scene.restore();
    }
    if (layout && motion?.hit && !reducedMotion.matches) {
      drawWorkImpact(motion.hit, hitFrame);
    }
    for (const actor of visible) {
      const job = game.jobs[actor.kind];
      if (!job) continue;
      if (layout) {
        drawStationStatus(actor, game, phase);
        continue;
      }
      const progress = 1 - (job.at - game.minute) / G.RECIPES[actor.kind].duration;
      scene.fillStyle = '#354639';
      scene.fillRect(actor.x - 12, actor.y + 4, 24, 4);
      scene.fillStyle = '#edd48b';
      scene.fillRect(actor.x - 11, actor.y + 5, Math.round(progress * 22), 2);
    }
    if (layout && hovered && motion.progress) {
      const {done, total} = motion.progress;
      if (done) {
        const plot = hovered.kind === 'plot' ? world.plots[hovered.id] : null;
        const actor = actors.find(candidate => candidate.id === hovered.id);
        const px = plot ? plot.x + TILE : actor?.x;
        const py = plot ? plot.y + TILE + 14 : actor?.y;
        if (px !== undefined && py !== undefined) {
          scene.fillStyle = '#352e20';
          scene.fillRect(px - total * 5 - 1, py + 6, total * 10 + 2, 6);
          for (let i = 0; i < total; i++) {
            scene.fillStyle = i < done ? '#f0d798' : '#887750';
            scene.fillRect(px - total * 5 + i * 10 + 1, py + 7, 8, 4);
          }
        }
      }
    }
    if (placement?.tile) {
      const [px, py] = placement.tile.map(value => value * TILE);
      scene.fillStyle = placement.allowed ? '#c3ee7780' : '#df656b90';
      scene.fillRect(px, py, TILE, TILE);
      scene.strokeStyle = placement.allowed ? '#eef8ba' : '#f6bab6';
      scene.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
      const ghost = at(placement.kind, placement.tile[0] + .5, placement.tile[1] + .6);
      const {anchor} = sprites[ghost.kind];
      scene.globalAlpha = .6;
      scene.drawImage(images[ghost.kind], ghost.x - anchor[0], ghost.y - anchor[1]);
      scene.globalAlpha = 1;
    }
  }

  function draw(game, position, hovered, placement, motion) {
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
    const phase = layout && !reducedMotion.matches ? Math.floor(game.minute * 12) : 0;
    const hitFrame = motion?.hit ? Math.floor((game.minute - motion.hit.minute) * 20) : 0;
    const swingFrame = layout && game.action ? Math.floor((game.action.at - game.minute) * 22) : 0;
    const signature = JSON.stringify([position, hovered?.kind, hovered?.id, game.stations, placement, game.submitted,
      layout ? [game.strikes, game.depleted, Boolean(game.entries.rockSalt), game.action?.key, swingFrame,
        phase, reducedMotion.matches, motion.facing, motion.hit, hitFrame] : game.minute >= game.mineReady,
      game.plots.map(plot => G.cropStage(game, plot)), Object.entries(game.jobs).map(([station, job]) =>
        [station, Math.ceil(job.at - game.minute), job.ready, layout ? Math.floor((game.minute - job.started) * 12) : null])]);
    if (signature === previousFrame && viewport === previousView) return;
    previousFrame = signature;
    previousView = viewport;
    drawScene(game, position, hovered, placement, motion, phase, hitFrame);
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

  const archive = {kind: 'archive', site: 'archive', actor: 'cottage', label: '田记所', points: [[6, 6], [7, 6]]};
  const stations = [
    {kind: 'kiln', actor: 'kiln', label: '盐灶', points: []},
    {kind: 'jar', actor: 'jar', label: '腌菜缸', points: []},
  ];
  const plots = world.plots.map(plot => {
    const x = plot.x / TILE, y = plot.y / TILE;
    return {kind: 'plot', id: plot.id, points: [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]};
  });
  const waterRows = layout ? world.shoreColumns.map((shore, y) => {
    const points = [];
    for (let x = world.bankStarts[y]; x < shore; x++) {
      if (adjacent([x, y]).some(([nx, ny]) => nx >= world.shoreColumns[ny])) points.push([x, y]);
    }
    return {kind: 'water', id: 'river-' + y, label: '河流', points};
  }) : [];
  const river = {kind: 'water', id: 'river', label: '河流', points: waterRows.flatMap(target => target.points)};
  const targets = layout ? [
    archive, ...stations,
    {kind: 'chest', actor: 'crate', label: '仓库', points: adjacent([8, 5])},
    river,
    ...Object.entries(layout.resources).map(([id, resource]) => ({
      kind: 'resource', id, actor: resource.actor, tile: resource.tile,
      label: resource.actor === 'clay' ? '黏土' : resource.actor === 'willow' ? '柳树' : '岩石',
      points: resource.actor === 'clay' ? [resource.tile] : adjacent(resource.tile),
    })),
    ...plots,
  ] : [
    {...archive, label: '提交物志'},
    {kind: 'kiln', actor: 'kiln', label: '制粗盐', points: []},
    {kind: 'jar', actor: 'jar', label: '腌菜', points: []},
    {kind: 'salt', site: 'salt', actor: 'salt', label: '敲岩盐', points: [[21, 6], [22, 5]]},
    {kind: 'forage', site: 'woods', actor: 'seedBox', label: '收集种子', points: [[16, 5]]},
    ...plots,
  ];
  const blocked = new Set();
  const scenery = new Set();
  const restoredScenery = new Set();
  const index = ([x, y]) => y * world.cols + x;
  for (let y = 3; y <= 5; y++) {
    for (let x = 4; x <= 7; x++) scenery.add(index([x, y]));
  }
  for (const actor of fixedActors) {
    if (actor.kind === 'cottage' || actor.resource) continue;
    const cell = index([Math.floor(actor.x / TILE), Math.floor(actor.y / TILE)]);
    (actor.forgotten ? restoredScenery : scenery).add(cell);
  }

  function adjacent([x, y]) {
    return [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]];
  }

  function obstacles(stations, game) {
    const resources = layout ? fixedActors.filter(actor => actor.resource && actor.kind !== 'clay' && !game.depleted[actor.id])
      .map(actor => index(actor.resource.tile)) : [];
    return [...scenery, ...(game.submitted ? restoredScenery : []), ...resources, ...Object.values(stations).map(index)];
  }

  function setStations(game) {
    actors = [
      ...fixedActors.filter(actor => !actor.resource || actor.kind === 'clay' || !game.depleted[actor.id]),
      ...Object.entries(game.stations).map(([kind, [x, y]]) => at(kind, x + .5, y + .6)),
    ];
    blocked.clear();
    for (const cell of obstacles(game.stations, game)) blocked.add(cell);
    for (const target of targets) {
      if (game.stations[target.kind]) target.points = adjacent(game.stations[target.kind]);
      else if (layout && ['kiln', 'jar'].includes(target.kind)) target.points = [];
    }
  }

  function canPlace(game, kind, tile) {
    if (!G.passable(world, scenery, ...tile) || restoredScenery.has(index(tile))) return false;
    if (index(tile) === index(game.position)) return false;
    if (layout) {
      const plot = E.plotAt(world, tile[0] * TILE, tile[1] * TILE);
      if (plot && game.plots[plot.id].tilled) return false;
      if (fixedActors.some(actor => actor.resource &&
        (actor.resource.renews || !game.depleted[actor.id]) && index(actor.resource.tile) === index(tile))) return false;
      if (archive.points.some(point => index(point) === index(tile))) return false;
    } else if (E.family(world.cells[index(tile)]) === 'tilled') return false;
    if (Object.entries(game.stations).some(([id, point]) => id !== kind && index(tile) === index(point))) return false;

    const stations = {...game.stations, [kind]: tile};
    const occupied = new Set(obstacles(stations, game));
    return targets.filter(target => target.kind !== 'plot' &&
      (!layout || target.kind !== 'resource' || !game.depleted[target.id]) &&
      (!layout || target.points.length || stations[target.kind])).every(target => {
      const points = stations[target.kind] ? adjacent(stations[target.kind]) : target.points;
      return G.routeTo(world, occupied, game.position, points) !== null;
    });
  }

  function pick(x, y, tool) {
    if (layout) {
      const col = Math.floor(x / TILE), row = Math.floor(y / TILE);
      const water = waterRows[row];
      if (water && (col >= world.shoreColumns[row] ||
        (tool === 'can' && water.points.some(([bank]) => bank === col)))) return water;
    }
    for (const target of targets) {
      if (!target.actor) continue;
      if (target.actor === 'clay') {
        const [col, row] = target.tile;
        if (Math.floor(x / TILE) === col && Math.floor(y / TILE) === row) return target;
        continue;
      }
      const actor = actors.find(item => item.kind === target.actor && !item.forgotten &&
        (target.kind !== 'resource' || item.id === target.id));
      if (!actor) continue;
      const sprite = sprites[actor.kind];
      const image = images[actor.kind];
      if (sprite) {
        const rock = actor.kind === 'salt' || actor.kind === 'stone';
        const inset = rock ? 7 : actor.kind === 'jar' ? 9 : actor.kind === 'kiln' ? 8 : 4;
        const topInset = rock ? 23 : actor.kind === 'willow' ? 45 : actor.kind === 'kiln' ? 14 : 6;
        const left = actor.x - sprite.anchor[0] + inset;
        const top = actor.y - sprite.anchor[1] + topInset;
        if (x >= left && x < left + (sprite.frameSize ?? image.width) - inset * 2 && y >= top && y <= actor.y) return target;
      } else if (x >= actor.x - 16 && x <= actor.x + 17 && y >= actor.y - 26 && y <= actor.y) {
        return target;
      }
    }
    const plot = E.plotAt(world, x, y);
    return plot ? targets.find(target => target.kind === 'plot' && target.id === plot.id) : null;
  }

  const files = {...ground.files, ...cropFiles};
  if (mudPatches.length) {
    files.mud = 'assets/mud/bank-mud-32x32.png';
    files.mudDug = 'assets/mud/bank-mud-dug-32x32.png';
  }
  for (const [key, sprite] of Object.entries(sprites)) files[key] = sprite.file;
  for (const [key, shadow] of Object.entries(D.shadows)) {
    if (sprites[key]) files[key + 'Shadow'] = shadow.file;
  }
  Promise.all(Object.entries(files).map(([key, file]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { images[key] = image; resolve(); };
    image.onerror = () => reject(new Error('未能加载 ' + file));
    image.src = assetUrl(file);
  }))).then(() => {
    painter = ground.create(images);
    painter.base(base, world);
    return createControls({world, canvas, view, zoom, targets, blocked, draw, pick, setStations, canPlace});
  }).catch(error => {
    status.textContent = error.message;
    status.setAttribute('role', 'alert');
  });
};

if (window.createLiuwanControls) window.startLiuwanScene();
