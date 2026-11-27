((root) => {
  'use strict';

  const DAY = 1080;
  const CROP_STAGES = [
    {id: 'germinating', label: '种子吸水', from: 0},
    {id: 'sprout', label: '刚出土', from: 35, file: '01-sprout.png'},
    {id: 'seedling', label: '幼苗', from: 90, file: '02-seedling.png'},
    {id: 'bulking', label: '根部膨大', from: 180, file: '03-bulking.png'},
    {id: 'ripe', label: '成熟', from: 300, file: '04-mature.png'},
  ];
  const START = [13, 11];
  const SAVE_KEY = 'wu-zhi-liuwan-demo-v1';
  const ITEMS = {
    seeds: '樱桃萝卜种子', radish: '樱桃萝卜', rockSalt: '岩盐',
    salt: '粗盐', pickle: '盐渍樱桃萝卜',
  };
  const RECIPES = {
    kiln: {label: '制粗盐', inputs: ['rockSalt'], output: 'salt', duration: 45},
    jar: {label: '腌樱桃萝卜', inputs: ['radish', 'salt'], output: 'pickle', duration: 75},
  };
  const ENTRIES = {
    radish: {reward: 55, duration: 360, hint: '收获后在菜瓮里腌成盐渍樱桃萝卜。'},
    rockSalt: {reward: 45, duration: 720, hint: '先用火灶制成粗盐，再用这批粗盐腌菜。'},
    pickle: {reward: 30, hint: '用樱桃萝卜和粗盐制成。'},
  };

  function newGame(world) {
    return {
      version: 1, day: 1, minute: 0, review: false, position: [...START], coins: 0,
      plots: world.plots.map(() => ({tilled: false, planted: null, watered: null})),
      stations: {kiln: [9, 5], jar: [10, 6]},
      bag: {seeds: 3, radish: [], rockSalt: [], salt: [], pickle: []},
      entries: {}, jobs: {}, hits: 0, mineReady: 0, lastForage: 0, submitted: false, log: [],
    };
  }

  function record(game, message) {
    game.log.push(message);
    if (game.log.length > 24) game.log.shift();
    return message;
  }

  function count(game, id) {
    return id === 'seeds' ? game.bag.seeds : game.bag[id].length;
  }

  function acquire(game, id) {
    const rule = ENTRIES[id];
    const entry = game.entries[id] ??= {lit: false, deadline: null};
    if (!entry.lit && !(entry.deadline > game.minute)) {
      entry.deadline = game.minute + rule.duration;
    }
    game.bag[id].push(entry.deadline);
  }

  function light(game, id) {
    const entry = game.entries[id] ??= {lit: false, deadline: null};
    if (entry.lit) return;
    entry.lit = true;
    game.coins += ENTRIES[id].reward;
    record(game, ITEMS[id] + '已上锚，稿酬 +' + ENTRIES[id].reward + ' 文');
  }

  function cropStage(game, plot) {
    if (!plot.tilled) return 'ground';
    if (plot.planted === null) return 'tilled';
    if (plot.watered === null) return 'seed';
    const age = game.minute - plot.watered;
    return CROP_STAGES.findLast(stage => age >= stage.from)?.id ?? 'germinating';
  }

  function describeGrowth(game, plot) {
    const index = CROP_STAGES.findIndex(stage => stage.id === cropStage(game, plot));
    if (index < 0) return '';
    const stage = CROP_STAGES[index], next = CROP_STAGES[index + 1];
    if (!next) return '樱桃萝卜已成熟，可以收获。';
    const wait = Math.ceil(plot.watered + next.from - game.minute);
    return '樱桃萝卜 · ' + stage.label + ' · 距' + next.label + ' ' + wait + ' 游戏分钟';
  }

  function tend(game, id) {
    const plot = game.plots[id];
    switch (cropStage(game, plot)) {
      case 'ground':
        plot.tilled = true;
        return record(game, '翻好一块地。再操作一次播种。');
      case 'tilled':
        if (!game.bag.seeds) return '种子用完了，可以到林缘收集。';
        game.bag.seeds--;
        plot.planted = game.minute;
        return record(game, '播下了樱桃萝卜。再操作一次浇水。');
      case 'seed':
        plot.watered = game.minute;
        return record(game, '浇过水了。等待生长时可以去旧盐坑采盐。');
      case 'ripe':
        acquire(game, 'radish');
        plot.planted = null;
        plot.watered = null;
        return record(game, '收获樱桃萝卜 ×1，已记下发现。');
      default:
        return '';
    }
  }

  function mine(game) {
    if (game.minute < game.mineReady) return '岩盐还没刷新，再等 ' + Math.ceil(game.mineReady - game.minute) + ' 游戏分钟。';
    game.hits++;
    if (game.hits < 3) return '敲击岩盐 ' + game.hits + '/3。';
    game.hits = 0;
    game.mineReady = game.minute + 45;
    acquire(game, 'rockSalt');
    return record(game, '采得岩盐 ×1，已记下发现。');
  }

  function startJob(game, station) {
    const recipe = RECIPES[station];
    if (game.jobs[station]) return recipe.label + '进行中，剩 ' + Math.ceil(game.jobs[station].at - game.minute) + ' 游戏分钟。';
    if (recipe.inputs.some(id => count(game, id) === 0)) {
      return '需要 ' + recipe.inputs.map(id => ITEMS[id] + ' ×1').join('、') + '。';
    }
    const inputs = recipe.inputs.map(id => {
      const stock = game.bag[id];
      const fresh = stock.findIndex(deadline => deadline > game.minute + recipe.duration);
      return stock.splice(fresh < 0 ? 0 : fresh, 1)[0];
    });
    game.jobs[station] = {at: game.minute + recipe.duration, inputs};
    return record(game, '开始' + recipe.label + '。可以先去做别的事。');
  }

  function advance(game, minutes) {
    if (game.review) return [];
    const end = Math.min(game.day * DAY, game.minute + minutes);
    const finished = Object.keys(game.jobs).filter(id => game.jobs[id].at <= end);
    finished.sort((a, b) => game.jobs[a].at - game.jobs[b].at);
    const messages = [];
    for (const station of finished) {
      const job = game.jobs[station];
      const output = RECIPES[station].output;
      delete game.jobs[station];
      if (station === 'kiln') {
        game.bag.salt.push(job.inputs[0]);
      } else {
        game.bag.pickle.push(null);
        for (const [index, id] of ['radish', 'rockSalt'].entries()) {
          if (job.inputs[index] > job.at) light(game, id);
        }
        light(game, 'pickle');
      }
      messages.push(record(game, '制成' + ITEMS[output] + ' ×1，已放入背包。'));
      if (station === 'jar' && (!game.entries.radish?.lit || !game.entries.rockSalt?.lit)) {
        messages.push(record(game, '有原料批次已超时。重新收获或采盐，再用新批次腌制。'));
      }
    }
    game.minute = end;
    if (end === game.day * DAY) game.review = true;
    return messages;
  }

  function nextDay(game) {
    if (!game.review) return;
    game.day++;
    game.review = false;
    game.log = [];
  }

  function interact(game, target) {
    if (game.review) return '请先确认日结。';
    if (target.kind === 'plot') return tend(game, target.id);
    if (target.kind === 'salt') return mine(game);
    if (RECIPES[target.kind]) return startJob(game, target.kind);
    if (target.kind === 'forage') {
      if (game.lastForage === game.day) return '今天的种子已经收集，明早再来。';
      game.lastForage = game.day;
      game.bag.seeds += 3;
      return record(game, '在林缘的旧种匣找到樱桃萝卜种子 ×3。');
    }
    if (target.kind === 'archive') {
      if (game.submitted) return '这一页物志已经归档。';
      if (!Object.keys(ENTRIES).every(id => game.entries[id]?.lit)) {
        return '田记所等着这一页记录。先用新鲜樱桃萝卜和岩盐完成腌制。';
      }
      game.submitted = true;
      return record(game, '物志已归档。田记所和旧盐坑的牌子恢复了字迹。');
    }
    return '';
  }

  function passable(world, blocked, x, y) {
    return x >= 0 && x < world.cols && y >= 0 && y < world.rows &&
      world.cells[y * world.cols + x] !== 'water' && !blocked.has(y * world.cols + x);
  }

  function routeTo(world, blocked, from, destinations) {
    const index = ([x, y]) => y * world.cols + x;
    const goal = new Set(destinations.filter(point => passable(world, blocked, ...point)).map(index));
    const start = index(from);
    const queue = [start], parents = new Int16Array(world.cells.length).fill(-1);
    parents[start] = start;
    for (const cell of queue) {
      if (goal.has(cell)) {
        const route = [];
        for (let current = cell; current !== start; current = parents[current]) {
          route.push([current % world.cols, Math.floor(current / world.cols)]);
        }
        return route.reverse();
      }
      const x = cell % world.cols, y = Math.floor(cell / world.cols);
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const next = index([x + dx, y + dy]);
        if (!passable(world, blocked, x + dx, y + dy) || parents[next] !== -1) continue;
        parents[next] = cell;
        queue.push(next);
      }
    }
    return null;
  }

  const api = {DAY, SAVE_KEY, ITEMS, ENTRIES, RECIPES, CROP_STAGES, ripeAfter: CROP_STAGES.at(-1).from,
    newGame, count, cropStage, describeGrowth, advance, nextDay, interact, passable, routeTo};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LiuwanGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
