'use strict';

window.startLiuwanScene = function ({layout, jobMeter, cropStage, cropArt, assetUrl = file => file, createControls = window.createLiuwanControls} = {}) {

  const E = window.GroundEngine;
  const G = window.LiuwanGame;
  const {TILE} = E;
  const D = window.DepthAssets;
  const ground = window.GroundPainter;
  const southPass = layout?.southPass;
  const world = E.createWorld({untouchedFields: Boolean(layout), southPass});
  const liuwan = {x: 0, y: 0, width: world.cols, height: southPass ? southPass.bounds.y - 1 : world.rows};
  const regionAt = ([, y]) => southPass && y >= southPass.bounds.y ? southPass.bounds : liuwan;
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
  let trailRevealed = false;

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
  const shadowMasks = new Map();
  const sprites = {
    figure: {...window.GroundAssets.figure, contact: 18},
    cottage: D.cottage,
    crate: {...D.crate, contact: 28},
    seedBox: {...D.crate, contact: 28},
    kiln: {file: 'assets/kiln/salt-stove-scene-48x48.png', anchor: [24, 44], contact: 25},
    jar: {...D.jar, contact: 16},
    willow: {file: 'assets/willow/willow-repaint.png', anchor: [48, 122], contact: 13},
    salt: {file: 'assets/rock/rock-ore-salt.png', anchor: [24, 44], contact: 28},
    stone: {file: 'assets/rock/rock-atlas.png', anchor: [24, 44], frameSize: 48, frames: 3, contact: 26},
  };
  if (layout) {
    sprites.oak = {file: 'assets/oak/oak-96x128.png', anchor: [48, 122], contact: 13};
    sprites.ruin = {file: 'assets/salt-ruins/salt-ruins-64x64.png', anchor: [32, 58], contact: 30};
    const stump = 'assets/stump/stump-48x48.png';
    if (assetUrl(stump)) {
      sprites.stump = {file: stump, anchor: [24, 44], contact: 24};
    }
    const waystone = 'assets/south-pass/waystone-48x48.png';
    if (assetUrl(waystone)) sprites.waystone = {file: waystone, anchor: [24, 43], contact: 25};
  }
  const bedColors = {
    dry: '#754a24',
    wet: '#503322',
  };

  const at = (kind, x, y, details = {}) => ({
    kind, x: Math.round(x * TILE), y: Math.round(y * TILE), level: 0, ...details,
  });
  const stageFor = cropStage ?? G.cropStage;
  const cropFiles = Object.fromEntries(Object.entries(cropArt ?? {radish: {art: 'cherry-radish'}})
    .flatMap(([crop, {art}]) => G.CROP_STAGES.filter(stage => stage.file)
      .map(stage => [crop + '-' + stage.id, 'assets/' + art + '/' + stage.file]))
    .filter(([, file]) => assetUrl(file)));
  const chestTile = [9, 5];
  const chestPassage = [8, 5];
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
    demoActors[0],
    at('crate', chestTile[0] + .5, chestTile[1] + .4),
    at('ruin', layout.saltRuin[0] + .5, layout.saltRuin[1] + .6),
    ...Object.entries(layout.resources).map(([id, resource]) =>
      at(resource.actor, resource.tile[0] + .5, resource.tile[1] + .62, {id, resource})),
  ] : demoActors;
  if (southPass) {
    const [x, y] = southPass.waystone;
    fixedActors.push(at('waystone', x + .5, y + .6),
      at('oak', 3.5, 36.5), at('oak', 11.5, 35.5), at('oak', 12.5, 40.5),
      at('stone', 2.5, 39.5), at('stone', 10.5, 40.5), at('stone', 12.5, 37.5));
  }
  const mudPatches = fixedActors.filter(actor => actor.kind === 'clay');
  let actors = fixedActors;
  let plotStates = [];

  function bedColor(cells, x, y) {
    return bedColors[cells[Math.floor(y / TILE) * world.cols + Math.floor(x / TILE)]];
  }

  function drawBeds(game) {
    const signature = game.plots.map(plot => !plot.tilled ? 0 : plot.watered === null ? 1 : 2).join('');
    if (signature === previousGround) return;
    previousGround = signature;
    const cells = [...world.cells];
    for (const plot of world.plots) {
      const status = game.plots[plot.id];
      if (!status.tilled && layout) continue;
      for (let dy = 0; dy < plot.size / TILE; dy++) {
        for (let dx = 0; dx < plot.size / TILE; dx++) {
          const i = (plot.y / TILE + dy) * world.cols + plot.x / TILE + dx;
          cells[i] = status.tilled ? status.watered === null ? 'dry' : 'wet' : 'grass';
        }
      }
    }
    groundLayer.drawImage(base.canvas, 0, 0);
    for (const plot of world.plots) {
      if (!game.plots[plot.id].tilled) continue;
      const colors = bedColor(cells, plot.x, plot.y);
      groundLayer.fillStyle = colors;
      groundLayer.fillRect(plot.x + 3, plot.y + plot.size - 7, plot.size - 6, BED_HEIGHT);
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
    if (kind === 'stump') {
      rect('#513c2b', -15, -4, 30, 4);
      rect('#765238', -10, -12, 20, 10);
      rect('#b88f61', -9, -14, 18, 6);
      rect('#8f6947', -5, -12, 11, 2);
    } else if (kind === 'waystone') {
      rect('#504b42', -12, -6, 24, 6);
      rect('#776f59', -9, -24, 18, 20);
      rect('#b0a483', -7, -25, 12, 4);
      rect('#a49876', -7, -21, 13, 12);
      rect('#56634d', -10, -7, 8, 3);
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

  function shadow(actor, sun) {
    const {kind, x, level} = actor;
    const y = actor.y - level;
    if (sun) {
      if (sun.strength) drawSunShadow(actor, sun);
    } else {
      const projected = D.shadows[kind];
      if (projected) {
        scene.drawImage(images[kind + 'Shadow'], x - projected.anchor[0], y - projected.anchor[1]);
      }
    }
    const width = sprites[kind]?.contact;
    if (!width) return;
    if (!sun && isTree(kind)) {
      scene.fillStyle = '#3043322b';
      scene.fillRect(x - 9, y - 2, 27, 4);
      scene.fillRect(x - 4, y + 2, 27, 3);
      scene.fillRect(x + 9, y + 5, 10, 1);
    }
    scene.fillStyle = '#30433249';
    scene.fillRect(Math.round(x - width / 2), y - 2, width, 4);
  }

  function drawSunShadow(actor, sun) {
    const crop = actor.kind === 'crop';
    const key = crop ? actor.crop + '-' + actor.stage : actor.kind;
    const sprite = crop ? {anchor: [24, 66]} : sprites[key];
    const mask = shadowMasks.get(key);
    if (!mask || !sprite) return;
    const scale = actor.scale ?? 1;
    const [ax, ay] = sprite.anchor;
    const x = crop ? actor.plot.x + actor.plot.size / 2 : actor.x;
    const y = crop ? actor.y - BED_HEIGHT : actor.y - actor.level;
    const size = sprite.frameSize ?? mask.width;
    const column = sprite.frameSize ? E.hash(actor.x, actor.y) % sprite.frames : 0;
    scene.save();
    scene.globalAlpha = sun.strength;
    scene.translate(x, y);
    const spread = isTree(key) ? .62 : .86;
    scene.transform(spread * scale, 0, -sun.dx * scale, -sun.dy * scale, 0, 0);
    scene.drawImage(mask, column * size, 0, size, mask.height, -ax, -ay, size, mask.height);
    scene.restore();
  }

  function drawCrop(plot, stage, crop) {
    const x = plot.x + plot.size / 2, y = plot.y + plot.size / 2 + 2 - BED_HEIGHT;
    const image = images[crop + '-' + stage];
    if (image) {
      const scale = layout ? .67 : 1;
      scene.drawImage(image, x - Math.round(24 * scale), y - Math.round(66 * scale),
        Math.round(image.width * scale), Math.round(image.height * scale));
    } else if (crop === 'pakChoi' && ['sprout', 'seedling', 'bulking', 'ripe'].includes(stage)) {
      const size = {sprout: 4, seedling: 7, bulking: 10, ripe: 13}[stage];
      scene.fillStyle = '#355840';
      scene.fillRect(x - size, y - size, size * 2, Math.ceil(size * .65));
      scene.fillRect(x - size + 2, y - size - 3, size * 2 - 4, 4);
      scene.fillStyle = '#64894b';
      scene.fillRect(x - size + 2, y - size - 1, size - 2, 4);
      scene.fillRect(x + 2, y - size + 1, size - 4, 4);
      scene.fillStyle = '#d5dcb7';
      scene.fillRect(x - 2, y - size + 3, 4, size - 1);
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

  const daylight = [
    [0, 136, 138, 170, .35],
    [90, 238, 207, 151, .15],
    [360, 255, 240, 191, .08],
    [540, 255, 226, 169, .09],
    [660, 236, 149, 76, .32],
    [735, 139, 84, 115, .43],
    [840, 21, 34, 68, .67],
    [960, 16, 26, 56, .73],
    [1080, 13, 22, 49, .76],
  ];

  function sunAt(minute) {
    // East is right on the map. The shadow points away from the sun.
    const angle = Math.PI * Math.min(minute / 720, 1);
    const height = Math.sin(angle);
    const strength = .24 * Math.min(1, .35 + minute / 55, Math.max(0, (750 - minute) / 50));
    return {dx: -.81 * Math.cos(angle), dy: .48 - height * .32, strength};
  }

  function drawDaylight(minute, sun) {
    const index = daylight.findIndex(frame => frame[0] >= minute);
    const start = daylight[Math.max(0, index - 1)];
    const end = daylight[index];
    const progress = start === end ? 0 : (minute - start[0]) / (end[0] - start[0]);
    const [, r, g, b, alpha] = start.map((value, i) => value + (end[i] - value) * progress);
    scene.fillStyle = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
    scene.fillRect(view.x, view.y, view.width, view.height);
    if (sun.strength && Math.abs(sun.dx) > .02) {
      const east = sun.dx < 0;
      const light = scene.createLinearGradient(east ? W : 0, 0, east ? 0 : W, 0);
      light.addColorStop(0, `rgba(255, 202, 117, ${Math.abs(sun.dx) * .28 * sun.strength / .24})`);
      light.addColorStop(1, 'rgba(255, 202, 117, 0)');
      scene.fillStyle = light;
      scene.fillRect(view.x, view.y, view.width, view.height);
    }
  }

  function drawFishing(person, motion, phase) {
    const ripple = reducedMotion.matches ? 6 : 5 + phase % 12 / 2;
    scene.strokeStyle = '#d0ede0';
    for (const [col, row] of motion.ripples) {
      const x = col * TILE + TILE / 2, y = row * TILE + TILE / 2;
      const inner = Math.max(2, ripple - 2);
      scene.beginPath();
      scene.ellipse(x, y, ripple + 2, 3, 0, 0, Math.PI * 2);
      scene.moveTo(x + inner, y);
      scene.ellipse(x, y, inner, 1, 0, 0, Math.PI * 2);
      scene.stroke();
    }
    if (!motion.fishing) return;
    const [x, y] = motion.fishing.tile.map(tile => tile * TILE + TILE / 2);
    const direction = Math.sign(x - person.x) || 1;
    const rod = [person.x + direction * 13, person.y - 27];
    scene.strokeStyle = '#745438';
    scene.beginPath();
    scene.moveTo(person.x + direction * 5, person.y - 14);
    scene.lineTo(...rod);
    scene.stroke();
    scene.strokeStyle = '#ddd9bd';
    scene.beginPath();
    scene.moveTo(...rod);
    scene.lineTo(x, y);
    scene.stroke();
    scene.fillStyle = motion.fishing.hooked ? '#f7cf60' : '#cc7659';
    const size = motion.fishing.hooked ? 7 : 4;
    scene.fillRect(x - 2, y - size, 4, size);
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

  function drawPackingRing(actor, progress) {
    const x = actor.x;
    const y = Math.max(view.y + 15, actor.y - sprites[actor.kind].anchor[1] - 5);
    const radius = 9;
    const start = -Math.PI / 2;
    scene.beginPath();
    scene.arc(x, y, radius + 4, 0, 2 * Math.PI);
    scene.fillStyle = '#302d23ef';
    scene.fill();
    scene.beginPath();
    scene.arc(x, y, radius, 0, 2 * Math.PI);
    scene.lineWidth = 3;
    scene.strokeStyle = '#837152';
    scene.stroke();
    scene.beginPath();
    scene.arc(x, y, radius, start, start + 2 * Math.PI * progress);
    scene.strokeStyle = '#ffe5a6';
    scene.stroke();
    scene.lineWidth = 1;
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
    if (southPass && game.submitted) {
      const inPass = regionAt(position) === southPass.bounds;
      const [x, y] = inPass ? southPass.returnGate : southPass.gate;
      const text = inPass ? '柳湾' : southPass.name;
      visible.push(at('mark', x + .5, y + .55, {text, hint: text}));
    }
    visible.push(person);
    for (const plot of world.plots) {
      if (game.plots[plot.id].planted === null || plot.x < view.x - TILE || plot.x > view.x + view.width ||
        plot.y < view.y - TILE || plot.y > view.y + view.height + TILE * 2) continue;
      const state = game.plots[plot.id];
      const stage = stageFor(game, state);
      visible.push({kind: 'crop', plot, stage, crop: state.crop ?? 'radish', y: plot.y + plot.size / 2 + 2, scale: layout ? .67 : 1});
    }
    const dayMinute = Math.floor(Math.min(G.DAY, Math.max(0, game.minute - (game.day - 1) * G.DAY)));
    const sun = layout ? sunAt(dayMinute) : null;
    for (const actor of visible) shadow(actor, sun);
    if (hovered?.kind === 'plot') {
      const plot = world.plots[hovered.id];
      scene.strokeStyle = '#fff7bb';
      scene.strokeRect(plot.x + 2.5, plot.y + 2.5, plot.size - 5, plot.size - 5);
    }
    for (const actor of visible.sort((a, b) => a.y - b.y)) {
      if (actor.kind === 'crop') {
        drawCrop(actor.plot, actor.stage, actor.crop);
        continue;
      }
      const kind = actor.kind;
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
    if (layout) {
      drawDaylight(dayMinute, sun);
      drawFishing(person, motion, phase);
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
        const px = plot ? plot.x + plot.size / 2 : actor?.x;
        const py = plot ? plot.y + plot.size / 2 + (layout ? 2 : 14) : actor?.y;
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
    if (layout && motion.packing) {
      const actor = visible.find(candidate => candidate.kind === motion.packing.kind);
      if (actor) drawPackingRing(actor, motion.packing.progress);
    }
  }

  function draw(game, position, hovered, placement, motion) {
    trailRevealed = game.submitted;
    const width = stage.clientWidth, height = stage.clientHeight;
    if (width < 1 || height < 1) return;
    const region = regionAt(position);
    const regionWidth = region.width * TILE, regionHeight = region.height * TILE;
    const referenceWidth = layout ? 34 * TILE : W;
    const referenceHeight = layout ? 20 * TILE : H;
    const scale = zoom.overview
      ? Math.min(width / regionWidth, height / regionHeight)
      : Math.max(width / referenceWidth, height / referenceHeight) * zoom.scales[zoom.level];
    const pixelsWide = zoom.overview ? Math.ceil(width / scale) : Math.max(1, Math.floor(width / scale));
    const pixelsHigh = zoom.overview ? Math.ceil(height / scale) : Math.max(1, Math.floor(height / scale));
    view.width = Math.min(regionWidth, pixelsWide);
    view.height = Math.min(regionHeight, pixelsHigh);
    view.left = Math.floor((pixelsWide - view.width) / 2);
    view.top = Math.floor((pixelsHigh - view.height) / 2);
    const left = region.x * TILE, top = region.y * TILE;
    view.x = Math.round(Math.max(left, Math.min(left + regionWidth - view.width, (position[0] + .5) * TILE - view.width / 2)));
    view.y = Math.round(Math.max(top, Math.min(top + regionHeight - view.height, (position[1] + .5) * TILE - view.height / 2)));
    const viewport = [pixelsWide, pixelsHigh, view.x, view.y].join('/');
    const phase = layout && !reducedMotion.matches ? Math.floor(game.minute * 12) : 0;
    const hitFrame = motion?.hit ? Math.floor((game.minute - motion.hit.minute) * 20) : 0;
    const swingFrame = layout && game.action ? Math.floor((game.action.at - game.minute) * 22) : 0;
    const signature = JSON.stringify([position, hovered?.kind, hovered?.id, game.stations, placement, game.submitted,
      layout ? [game.strikes, game.depleted, Boolean(game.entries.rockSalt), game.action?.key, swingFrame,
        phase, game.day, Math.floor(game.minute), reducedMotion.matches, motion.facing, motion.hit, hitFrame,
        motion.fishing, motion.ripples, motion.packing] : game.minute >= game.mineReady,
      game.plots.map(plot => plot.crop ? plot.crop + '-' + stageFor(game, plot) : stageFor(game, plot)), Object.entries(game.jobs).map(([station, job]) =>
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

  const archiveBounds = {left: 4, right: 7, top: 3, bottom: 5};
  const archiveDoor = [[6, 6], [7, 6]];
  const archiveFootprint = [];
  const archiveApproaches = [];
  for (let x = archiveBounds.left; x <= archiveBounds.right; x++) {
    archiveApproaches.push([x, archiveBounds.bottom + 1]);
    for (let y = archiveBounds.top; y <= archiveBounds.bottom; y++) archiveFootprint.push([x, y]);
  }
  for (let y = archiveBounds.top; y <= archiveBounds.bottom; y++) {
    archiveApproaches.push([archiveBounds.left - 1, y], [archiveBounds.right + 1, y]);
  }
  const archive = {
    kind: 'archive', site: 'archive', actor: 'cottage', label: '田记所',
    points: layout ? archiveApproaches : archiveDoor,
    footprint: archiveFootprint,
  };
  const stations = [
    {kind: 'kiln', actor: 'kiln', label: '盐灶', points: []},
    {kind: 'jar', actor: 'jar', label: '腌菜缸', points: []},
  ];
  const plotTargets = world.plots.map(plot => {
    const x = plot.x / TILE, y = plot.y / TILE;
    if (layout) return {kind: 'plot', id: plot.id, tile: [x, y], points: [[x, y], ...adjacent([x, y])]};
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
  const fishingByTile = new Map();
  for (const point of river.points) {
    for (const tile of adjacent(point)) {
      const [x, y] = tile;
      const shore = world.shoreColumns[y];
      if (shore === undefined || x < shore || x >= world.cols) continue;
      const key = tile.join(',');
      if (!fishingByTile.has(key)) fishingByTile.set(key, {kind: 'fishing', tile, points: []});
      fishingByTile.get(key).points.push(point);
    }
  }
  const fishingSpots = [...fishingByTile.values()];
  const targets = layout ? [
    archive, ...stations,
    {kind: 'chest', actor: 'crate', label: '仓库', tile: chestTile, points: adjacent(chestTile)},
    {kind: 'ruin', actor: 'ruin', label: '旧制盐台', tile: layout.saltRuin, points: adjacent(layout.saltRuin)},
    river,
    ...Object.entries(layout.resources).map(([id, resource]) => ({
      kind: 'resource', id, actor: resource.actor, tile: resource.tile,
      label: {clay: '黏土', willow: '柳树', oak: '橡树', stump: '树桩', salt: '白纹岩石'}[resource.actor] ?? '岩石',
      points: resource.actor === 'clay' ? [resource.tile] : adjacent(resource.tile),
    })),
  ] : [
    {...archive, label: '提交物志'},
    {kind: 'kiln', actor: 'kiln', label: '制粗盐', points: []},
    {kind: 'jar', actor: 'jar', label: '腌菜', points: []},
    {kind: 'salt', site: 'salt', actor: 'salt', label: '敲岩盐', points: [[21, 6], [22, 5]]},
    {kind: 'forage', site: 'woods', actor: 'seedBox', label: '收集种子', points: [[16, 5]]},
    ...plotTargets,
  ];
  if (southPass) {
    const trailTargets = [
      ['trail', southPass.gate, '南山道入口'],
      ['return', southPass.returnGate, '返回柳湾'],
      ['waystone', southPass.waystone, '路碑'],
    ];
    for (const [kind, tile, label] of trailTargets) {
      targets.push({kind, id: kind, label, tile, points: kind === 'waystone' ? adjacent(tile) : [tile, ...adjacent(tile)]});
    }
  }
  const blocked = new Set();
  const scenery = new Set();
  const restoredScenery = new Set();
  const index = ([x, y]) => y * world.cols + x;
  for (const tile of archiveFootprint) scenery.add(index(tile));
  if (southPass) {
    for (let y = liuwan.height; y < world.rows; y++) {
      for (let x = 0; x < world.cols; x++) {
        if (y < southPass.bounds.y || x >= southPass.bounds.x + southPass.bounds.width) scenery.add(index([x, y]));
      }
    }
  }
  for (const actor of fixedActors) {
    if (actor.kind === 'cottage' || actor.resource) continue;
    const cell = index([Math.floor(actor.x / TILE), Math.floor(actor.y / TILE)]);
    (actor.forgotten ? restoredScenery : scenery).add(cell);
  }

  function adjacent([x, y]) {
    return [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]];
  }

  function isTree(kind) {
    return kind === 'willow' || kind === 'oak';
  }

  function obstacles(stations, game) {
    const resources = layout ? fixedActors.filter(actor => actor.resource && actor.kind !== 'clay' && !game.depleted[actor.id])
      .map(actor => index(actor.resource.tile)) : [];
    return [...scenery, ...(game.submitted ? restoredScenery : []), ...resources, ...Object.values(stations).map(index)];
  }

  function setStations(game) {
    plotStates = game.plots;
    actors = [
      ...fixedActors.filter(actor => !actor.resource || actor.kind === 'clay' || !game.depleted[actor.id]),
      ...Object.entries(game.stations).map(([kind, [x, y]]) => at(kind, x + .5, y + .6)),
    ];
    blocked.clear();
    for (const cell of obstacles(game.stations, game)) blocked.add(cell);
    for (const target of targets) {
      if (target.kind !== 'kiln' && target.kind !== 'jar') continue;
      target.tile = game.stations[target.kind];
      target.points = target.tile ? adjacent(target.tile) : [];
    }
  }

  function canPlace(game, kind, tile) {
    if (regionAt(tile) !== liuwan) return false;
    if (!G.passable(world, scenery, ...tile) || restoredScenery.has(index(tile))) return false;
    if (index(tile) === index(game.position)) return false;
    if (layout) {
      if (index(tile) === index(chestPassage)) return false;
      if (southPass && index(tile) === index(southPass.gate) && index(tile) !== index(game.stations[kind] ?? [-1, -1])) return false;
      const plot = E.plotAt(world, tile[0] * TILE, tile[1] * TILE);
      if (plot && game.plots[plot.id].tilled) return false;
      if (fixedActors.some(actor => actor.resource &&
        (actor.resource.renews || !game.depleted[actor.id]) && index(actor.resource.tile) === index(tile))) return false;
      if (archiveDoor.some(point => index(point) === index(tile))) return false;
    } else if (E.family(world.cells[index(tile)]) === 'tilled') return false;
    if (Object.entries(game.stations).some(([id, point]) => id !== kind && index(tile) === index(point))) return false;

    const stations = {...game.stations, [kind]: tile};
    const occupied = new Set(obstacles(stations, game));
    const origin = regionAt(game.position) === liuwan ? game.position : archiveDoor[0];
    return targets.filter(target => target.kind !== 'plot' && target.kind !== 'return' && target.kind !== 'waystone' &&
      (!layout || target.kind !== 'resource' || !game.depleted[target.id]) &&
      (!layout || target.points.length || stations[target.kind])).every(target => {
      const points = stations[target.kind] ? adjacent(stations[target.kind]) : target.points;
      return G.routeTo(world, occupied, origin, points) !== null;
    });
  }

  function pick(x, y, tool) {
    const plot = E.plotAt(world, x, y);
    if (layout) {
      const col = Math.floor(x / TILE), row = Math.floor(y / TILE);
      if (tool === 'rod' && col >= world.shoreColumns[row]) {
        const spot = fishingByTile.get([col, row].join(','));
        const accessible = candidate => candidate.points.some(point => G.passable(world, blocked, ...point));
        if (spot && accessible(spot)) return spot;
        // A click in deeper water uses the closest castable shoreline tile.
        return fishingSpots.reduce((best, candidate) => {
          const distance = ({tile: [x, y]}) => Math.abs(x - col) + Math.abs(y - row);
          return accessible(candidate) && (!best || distance(candidate) < distance(best)) ? candidate : best;
        }, null);
      }
      const facility = targets.find(target => target.kind !== 'resource' &&
        (target.kind !== 'trail' || trailRevealed) &&
        target.tile?.[0] === col && target.tile[1] === row);
      if (facility) return facility;
      const sign = targets.find(target => (target.kind === 'return' || target.kind === 'trail' && trailRevealed) &&
        target.tile[0] === col && target.tile[1] === row + 1);
      if (sign && y % TILE >= 20) return sign;
      const water = waterRows[row];
      if (water && (col >= world.shoreColumns[row] ||
        (tool === 'can' && water.points.some(([bank]) => bank === col)))) return water;
      const tree = actors.find(actor => actor.resource && isTree(actor.kind) &&
        actor.resource.tile[0] === col && actor.resource.tile[1] === row);
      if (tree) return targets.find(target => target.kind === 'resource' && target.id === tree.id);
      if (plot && !blocked.has(index([col, row])) &&
        (tool === 'hoe' || (plotStates[plot.id]?.tilled && [undefined, 'pick', 'can'].includes(tool)))) {
        return plotTargets[plot.id];
      }
      if (tool === 'rod') {
        const spot = fishingSpots.find(candidate => candidate.points.some(([x, y]) => x === col && y === row));
        if (spot) return spot;
      }
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
        const topInset = rock ? 23 : isTree(actor.kind) ? 45 : actor.kind === 'kiln' ? 14 : 6;
        const left = actor.x - sprite.anchor[0] + inset;
        const top = actor.y - sprite.anchor[1] + topInset;
        if (x >= left && x < left + (sprite.frameSize ?? image.width) - inset * 2 && y >= top && y <= actor.y) return target;
      } else if (x >= actor.x - 16 && x <= actor.x + 17 && y >= actor.y - 26 && y <= actor.y) {
        return target;
      }
    }
    return plot && !layout ? plotTargets[plot.id] : null;
  }

  const files = {...ground.files, ...cropFiles};
  if (mudPatches.length) {
    files.mud = 'assets/mud/bank-mud-32x32.png';
    files.mudDug = 'assets/mud/bank-mud-dug-32x32.png';
  }
  for (const [key, sprite] of Object.entries(sprites)) files[key] = sprite.file;
  if (!layout) {
    for (const [key, shadow] of Object.entries(D.shadows)) {
      if (sprites[key]) files[key + 'Shadow'] = shadow.file;
    }
  }
  Promise.all(Object.entries(files).map(([key, file]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { images[key] = image; resolve(); };
    image.onerror = () => reject(new Error('未能加载 ' + file));
    image.src = assetUrl(file);
  }))).then(() => {
    if (layout) {
      for (const key of [...Object.keys(sprites), ...Object.keys(cropFiles)]) {
        const image = images[key];
        const mask = document.createElement('canvas');
        mask.width = image.width;
        mask.height = image.height;
        const context = mask.getContext('2d');
        context.drawImage(image, 0, 0);
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = '#1c2525';
        context.fillRect(0, 0, mask.width, mask.height);
        shadowMasks.set(key, mask);
      }
    }
    painter = ground.create(images);
    painter.base(base, world);
    return createControls({world, canvas, view, zoom, targets, plotTargets, fishingSpots, blocked, draw, pick, setStations, canPlace});
  }).catch(error => {
    status.textContent = error.message;
    status.setAttribute('role', 'alert');
  });
};

if (window.createLiuwanControls) window.startLiuwanScene();
