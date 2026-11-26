/* Native pixel masks. Cardinal joins and concave corners share one engine. */
((root) => {
  'use strict';
  const TILE=32;
  const directions=[[0,-1,1],[1,0,2],[0,1,4],[-1,0,8],[-1,-1,16],[1,-1,32],[1,1,64],[-1,1,128]];
  const family=kind=>kind==='dry'||kind==='wet'?'tilled':kind;
  function hash(x,y,seed=0){let n=Math.imul(x+101,374761393)^Math.imul(y+73,668265263)^Math.imul(seed+1,1274126177);n=Math.imul(n^(n>>>13),1274126177);return(n^(n>>>16))>>>0}
  function maskAt(cells,cols,rows,x,y){
    const kind=family(cells[y*cols+x]);let mask=0;
    for(const [dx,dy,bit] of directions){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<cols&&yy>=0&&yy<rows&&family(cells[yy*cols+xx])===kind)mask|=bit}
    return mask;
  }
  function coverage(mask){
    const result=new Uint8Array(TILE*TILE);
    const n=!!(mask&1),e=!!(mask&2),s=!!(mask&4),w=!!(mask&8);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
      if((!n&&y<3)||(!e&&x>28)||(!s&&y>28)||(!w&&x<3))continue;
      // Pixel stairs at exposed convex corners.
      if(!n&&!w&&x+y<9||!n&&!e&&(31-x)+y<9||!s&&!e&&(31-x)+(31-y)<9||!s&&!w&&x+(31-y)<9)continue;
      // Both sides join, but the diagonal is empty: preserve the inner corner.
      if(n&&w&&!(mask&16)&&x+y<5||n&&e&&!(mask&32)&&(31-x)+y<5||s&&e&&!(mask&64)&&(31-x)+(31-y)<5||s&&w&&!(mask&128)&&x+(31-y)<5)continue;
      result[y*TILE+x]=1;
    }
    return result;
  }
  function createWorld({untouchedFields = false} = {}) {
    const cols = untouchedFields ? 48 : 34, rows = untouchedFields ? 30 : 20;
    const cells = Array(cols * rows).fill('grass');
    function rect(x, y, width, height, kind) {
      for (let row = y; row < y + height; row++) {
        for (let col = x; col < x + width; col++) cells[row * cols + col] = kind;
      }
    }
    function courtyard(y, spans) {
      for (const [offset, [left, right]] of spans.entries()) {
        rect(left, y + offset, right - left + 1, 1, 'bare');
      }
    }
    courtyard(3, [[4, 8], [3, 10], [3, 11], [4, 10]]);
    if (!untouchedFields) {
      courtyard(3, [[20, 21], [19, 22], [19, 22], [20, 21]]);
      courtyard(15, [[19, 20], [18, 21], [18, 22], [19, 22]]);
    }

    rect(0, 11, 24, 1, 'path');
    rect(11, 5, 1, 7, 'path');
    rect(11, 8, 3, 1, 'path');
    rect(13, 8, 1, 4, 'path');
    if (untouchedFields) {
      courtyard(3, [[34, 36], [33, 37], [33, 38], [34, 38]]);
      rect(14, 6, 1, 6, 'path');
      rect(14, 6, 10, 1, 'path');
      rect(23, 6, 1, 3, 'path');
      rect(23, 8, 9, 1, 'path');
      rect(31, 6, 1, 3, 'path');
      rect(31, 6, 7, 1, 'path');
      rect(36, 6, 1, 5, 'path');
      rect(34, 10, 3, 1, 'path');
      rect(34, 10, 1, 3, 'path');
      rect(21, 11, 1, 3, 'path');
      rect(21, 13, 11, 1, 'path');
      rect(31, 12, 4, 1, 'path');
      rect(25, 13, 1, 4, 'path');
      rect(25, 16, 4, 1, 'path');
      rect(27, 16, 1, 4, 'path');
      rect(27, 19, 3, 1, 'path');
      rect(29, 19, 1, 2, 'path');
      rect(29, 20, 4, 1, 'path');
      rect(11, 11, 1, 9, 'path');
      rect(5, 19, 7, 1, 'path');
      rect(5, 19, 1, 7, 'path');
    } else {
      rect(16, 6, 1, 6, 'path');
      rect(16, 6, 6, 1, 'path');
      rect(21, 5, 1, 2, 'path');
      rect(23, 10, 3, 1, 'path');
      rect(23, 10, 1, 2, 'path');
      rect(17, 11, 1, 5, 'path');
      rect(17, 15, 3, 1, 'path');
      rect(21, 16, 1, 4, 'path');
      rect(3, 7, 8, 4, 'dry');
      rect(6, 14, 8, 2, 'dry');
    }

    const shoreColumns = untouchedFields
      ? [43, 43, 42, 41, 41, 40, 41, 41, 40, 39, 38, 36, 35, 33, 31,
         30, 29, 29, 30, 31, 33, 34, 34, 35, 36, 37, 38, 40, 41, 42]
      : [29, 29, 28, 28, 27, 27, 26, 26, 26, 26, 27, 27, 28, 28, 28, 27, 27, 26, 25, 24];
    const bankStarts = shoreColumns.map((shore, y) => {
      const north = shoreColumns[y - 1] ?? shore;
      const south = shoreColumns[y + 1] ?? shore;
      return Math.min(north, shore, south) - 1;
    });
    for (let y = 0; y < rows; y++) {
      const shore = shoreColumns[y];
      for (let x = bankStarts[y]; x < shore; x++) {
        const index = y * cols + x;
        if (cells[index] === 'grass') cells[index] = 'bare';
      }
      rect(shore, y, cols - shore, 1, 'water');
    }

    // Sample the four cells around each tile junction. The visual tiles are
    // offset by half a tile so transitions follow the terrain grid boundaries.
    function cellAt(x, y) {
      const col = Math.max(0, Math.min(x, cols - 1));
      const row = Math.max(0, Math.min(y, rows - 1));
      return cells[row * cols + col];
    }
    const surfaces = Array.from({length: (cols + 1) * (rows + 1)}, (_, index) => {
      const x = index % (cols + 1), y = Math.floor(index / (cols + 1));
      const corners = [cellAt(x - 1, y - 1), cellAt(x, y - 1), cellAt(x, y), cellAt(x - 1, y)];
      let grass = 0, water = 0;
      for (const [corner, kind] of corners.entries()) {
        if (kind === 'water') water |= 1 << corner;
        else if (kind !== 'bare' && kind !== 'path') grass |= 1 << corner;
      }
      return {grass, water};
    });
    const legacyPlots = [];
    const fields = [[3, 7, 2], [6, 14, 1]];
    if (untouchedFields) fields.push([6, 21, 2]);
    for (const [left, top, height] of fields) {
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < 4; col++) {
          legacyPlots.push({id: legacyPlots.length, col, row, x: (left + col * 2) * TILE,
                            y: (top + row * 2) * TILE, size: TILE * 2, wet: (col + row) % 3 === 0});
        }
      }
    }
    const plots = untouchedFields ? [] : legacyPlots;
    const plotIds = Array(cells.length).fill(-1);
    if (untouchedFields) {
      for (const [index, terrain] of cells.entries()) {
        if (terrain !== 'grass') continue;
        const col = index % cols, row = Math.floor(index / cols);
        plotIds[index] = plots.length;
        plots.push({id: plots.length, col, row, x: col * TILE, y: row * TILE, size: TILE, wet: (col + row) % 3 === 0});
      }
    } else {
      for (const plot of plots) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) plotIds[(plot.y / TILE + dy) * cols + plot.x / TILE + dx] = plot.id;
        }
      }
    }
    const sites = [
      {id: 'archive', label: '田记所旧址', x: 6.25, y: 5.65},
      {id: 'farm', label: '菜畦', x: 7, y: 10.75},
      {id: 'salt', label: '旧盐坑', x: 21, y: 5.35},
      {id: 'woods', label: '林缘', x: 16.5, y: 4.75},
      {id: 'bank', label: '河岸', x: 26.65, y: 10.45},
      {id: 'exit', label: '山道出口', x: 21.5, y: 18.85},
    ];
    const landmarks = [
      {id: 'farm', label: '起步菜畦', tile: [6, 8], mark: '田'},
      {id: 'woods', label: '北侧林缘', tile: [21, 6], mark: '林'},
      {id: 'bank', label: '柳湾河 · 取水岸', tile: [31, 13], mark: '水'},
      {id: 'expansion', label: '南侧扩垦地', tile: [9, 23], mark: '地'},
    ];
    return {cols, rows, cells, plots, plotIds, legacyPlots, surfaces, shoreColumns, bankStarts, sites, landmarks};
  }
  function cellsWithMoisture(world,mode){
    const cells=[...world.cells];
    for (const [index, id] of world.plotIds.entries()) {
      if (id >= 0) cells[index] = mode === 'wet' || (mode === 'mixed' && world.plots[id].wet) ? 'wet' : 'dry';
    }
    return cells;
  }
  function plotAt(world, x, y) {
    const col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    if (col < 0 || col >= world.cols || row < 0 || row >= world.rows) return null;
    return world.plots[world.plotIds[row * world.cols + col]] ?? null;
  }
  function fixture(){
    const cols=14,rows=5,cells=Array(cols*rows).fill('grass');
    const put=(x,y,kind='dry')=>cells[y*cols+x]=kind;
    put(1,1);put(1,2);put(1,3); // Narrow strip.
    for(const [x,y] of [[3,1],[3,2],[3,3],[4,3],[5,3]])put(x,y); // L.
    for(let y=1;y<=3;y++)for(let x=7;x<=9;x++)if(x!==8||y!==2)put(x,y,x===9?'wet':'dry'); // Hole and dry/wet join.
    put(12,2,'bare'); // Isolated patch.
    return{cols,rows,cells};
  }
  const api={TILE,directions,family,hash,maskAt,coverage,createWorld,cellsWithMoisture,plotAt,fixture};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GroundEngine=api;
})(typeof window!=='undefined'?window:globalThis);
