(() => {
  'use strict';
  const E = window.GroundEngine;
  const {TILE} = E;
  const files = {
    grass: 'assets/grass/grass-lawn-atlas.png',
    bare: 'assets/soil/soil-bare-atlas.png',
    dry: 'assets/tilled/tilled-dry-atlas.png',
    wet: 'assets/tilled/tilled-wet-atlas.png',
    water: 'assets/water/water-atlas.png',
    shoreStraight: 'assets/shore/shore-soilwater-straight-atlas.png',
    shoreInner: 'assets/shore/shore-soilwater-inner-atlas.png',
    shoreOuter: 'assets/shore/shore-soilwater-outer-atlas.png',
    straight: 'assets/edge/edge-grasssoil-straight-atlas.png',
    inner: 'assets/edge/edge-grasssoil-inner-atlas.png',
    outer: 'assets/edge/edge-grasssoil-outer-atlas.png',
    bevelOuter: 'assets/edge/edge-grasssoil-bevel-outer-atlas.png',
    bevelInner: 'assets/edge/edge-grasssoil-bevel-inner-atlas.png',
  };
  const borderColors = {dry: '#7c4420', wet: '#573622'};
  // Set bits mark the grass (or shore soil) corners, clockwise from top left.
  const groundEdges = {
    1: ['outer', 0], 2: ['outer', 1], 4: ['outer', 2], 8: ['outer', 3],
    3: ['straight', 0], 6: ['straight', 1], 12: ['straight', 2], 9: ['straight', 3],
    11: ['inner', 0], 7: ['inner', 1], 14: ['inner', 2], 13: ['inner', 3],
  };

  const shoreShapes = {straight: 'shoreStraight', inner: 'shoreInner', outer: 'shoreOuter'};

  function create(images) {
    const cache = new Map();

    function texture(ctx, kind, variant, x, y) {
      const atlas = images[kind];
      const column = variant % (atlas.width / TILE);
      ctx.drawImage(atlas, column * TILE, 0, TILE, TILE, x, y, TILE, TILE);
    }

    function drawGround(ctx, surface, variant, x, y) {
      if (surface.water === 15) {
        texture(ctx, 'water', variant, x, y);
        return;
      }
      const shore = surface.water !== 0;
      const corners = shore ? 15 ^ surface.water : surface.grass;
      const edge = groundEdges[corners];
      if (!edge) {
        texture(ctx, corners === 0 ? 'bare' : 'grass', variant, x, y);
        return;
      }
      let [shape, turns] = edge;
      if (shore) {
        shape = shoreShapes[shape];
      } else if (variant % 5 < 3) {
        // The bevels have the same seam midpoints, with different base rotations.
        if (shape === 'outer') {
          shape = 'bevelOuter';
          turns = (turns + 1) % 4;
        } else if (shape === 'inner') {
          shape = 'bevelInner';
          turns = (turns + 3) % 4;
        }
      }
      const center = TILE / 2;
      ctx.save();
      ctx.translate(x + center, y + center);
      ctx.rotate(turns * Math.PI / 2);
      texture(ctx, shape, variant, -center, -center);
      ctx.restore();
    }

    function maskedTile(kind, variant, mask) {
      const key = [kind, variant, mask].join('/');
      if (cache.has(key)) return cache.get(key);

      const tile = document.createElement('canvas');
      tile.width = tile.height = TILE;
      const ctx = tile.getContext('2d');
      const cover = E.coverage(mask);
      ctx.fillStyle = '#fff';
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE;) {
          if (!cover[y * TILE + x]) {
            x++;
            continue;
          }
          const start = x;
          while (x < TILE && cover[y * TILE + x]) x++;
          ctx.fillRect(start, y, x - start, 1);
        }
      }

      ctx.globalCompositeOperation = 'source-in';
      texture(ctx, kind, variant, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = borderColors[kind];
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const p = y * TILE + x;
          if (cover[p] && ((y > 0 && !cover[p - TILE]) || (x > 0 && !cover[p - 1]))) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      cache.set(key, tile);
      return tile;
    }

    function base(ctx, map) {
      ctx.imageSmoothingEnabled = false;
      for (let y = 0; y <= map.rows; y++) {
        for (let x = 0; x <= map.cols; x++) {
          const surface = map.surfaces[y * (map.cols + 1) + x];
          drawGround(ctx, surface, E.hash(x, y), x * TILE - TILE / 2, y * TILE - TILE / 2);
        }
      }
    }

    function field(ctx, map, height) {
      for (let y = 0; y < map.rows; y++) {
        for (let x = 0; x < map.cols; x++) {
          const kind = map.cells[y * map.cols + x];
          if (E.family(kind) !== 'tilled') continue;
          const mask = E.maskAt(map.cells, map.cols, map.rows, x, y);
          ctx.drawImage(maskedTile(kind, E.hash(x, y) % 4, mask), x * TILE, y * TILE - height);
        }
      }
    }

    return {base, field};
  }

  window.GroundPainter = {files, create};
})();
