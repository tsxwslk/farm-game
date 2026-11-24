/* Run: node prototype/pixel-farm/ground-verify.cjs */
const assert=require('node:assert/strict');
const E=require('./ground-engine.js');

// Rotation invariance catches swapped diagonals and mismatched corner distances.
function rotateMask(mask){let result=0;for(const [oldBit,newBit] of [[1,2],[2,4],[4,8],[8,1],[16,32],[32,64],[64,128],[128,16]])if(mask&oldBit)result|=newBit;return result}
for(let mask=0;mask<256;mask++){
  const before=E.coverage(mask),after=E.coverage(rotateMask(mask));
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.equal(before[y*32+x],after[x*32+31-y],`rotation: mask=${mask},pixel=${x},${y}`);
  assert.equal(before[16*32+16],1,'Every connected piece retains a solid center.');
}
assert(E.coverage(255).every(value=>value===1),'Interior tiles have no transparent seams.');
assert.equal(E.coverage(15)[0],0,'Missing diagonal cuts an inner corner.');
assert.equal(E.coverage(31)[0],1,'Present northwest diagonal fills that corner.');

const world=E.createWorld();
assert.equal(world.plots.length,12);
for(const plot of world.plots){
  assert.equal(E.plotAt(world,plot.x,plot.y),plot);
  assert.equal(E.plotAt(world,plot.x+63.99,plot.y+63.99),plot);
  const dry=E.cellsWithMoisture(world,'dry'),wet=E.cellsWithMoisture(world,'wet');
  const mixed=E.cellsWithMoisture(world,'mixed');
  let wetCount=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
    const x=plot.x/32+dx,y=plot.y/32+dy,i=y*world.cols+x;
    assert.equal(dry[i],'dry');assert.equal(wet[i],'wet');
    if(mixed[i]==='wet')wetCount++;
    assert.equal(E.maskAt(dry,world.cols,world.rows,x,y),E.maskAt(mixed,world.cols,world.rows,x,y),'Moisture never adds a grass border.');
  }
  assert.equal(wetCount,plot.wet?4:0,'All four base tiles share one plot moisture.');
}
assert.equal(E.plotAt(world,0,0),null);
assert.equal(E.plotAt(world,world.plots[0].x+64,world.plots[0].y),world.plots[1],'Right boundary belongs to next plot.');
const fixtures=E.fixture();
assert.equal(fixtures.cells[2*14+8],'grass','Hole remains empty.');
assert.equal(fixtures.cells[3*14+8],'dry');
assert.equal(fixtures.cells[3*14+9],'wet');

assert.equal(world.shoreColumns.length, world.rows);
const surfaceWidth = world.cols + 1;
assert.equal(world.surfaces.length, surfaceWidth * (world.rows + 1));
for (const {grass, water} of world.surfaces) {
  assert(grass !== 5 && grass !== 10, 'Grass-to-soil tiles have matching sprites.');
  assert(water !== 5 && water !== 10, 'Soil-to-water tiles have matching sprites.');
  assert(water === 0 || grass === 0, 'Water tiles meet bare soil only, including around corners.');
}
const shorelineMasks = world.surfaces.filter(tile => tile.water > 0 && tile.water < 15).map(tile => tile.water);
for (const water of [2, 4, 6, 7, 14]) assert(shorelineMasks.includes(water));
// A one-cell road has a transition on both shoulders, all the way to the map edge.
assert.equal(world.surfaces[11 * surfaceWidth].grass, 3);
assert.equal(world.surfaces[12 * surfaceWidth].grass, 12);
// Path and courtyard are part of the same dirt surface at the salt pit entrance.
assert.equal(world.surfaces[6 * surfaceWidth + 21].grass, 0);

for (let y = 0; y < world.rows; y++) {
  const bank = world.shoreColumns[y];
  for (let x = 0; x < world.cols; x++) {
    const kind = world.cells[y * world.cols + x];
    assert.equal(kind === 'water', x >= bank);
    if (x >= world.bankStarts[y] && x < bank) assert(kind === 'bare' || kind === 'path');
  }
}

// The main dirt road and bare courtyards should connect all six destinations.
const start = 11 * world.cols + 13;
const queue = [start];
const reached = new Set(queue);
for (const index of queue) {
  const x = index % world.cols, y = Math.floor(index / world.cols);
  for (const [dx, dy] of E.directions.slice(0, 4)) {
    const nextX = x + dx, nextY = y + dy;
    if (nextX < 0 || nextX >= world.cols || nextY < 0 || nextY >= world.rows) continue;
    const next = nextY * world.cols + nextX;
    const kind = world.cells[next];
    if (reached.has(next) || kind === 'water') continue;
    if (kind !== 'path' && kind !== 'bare') continue;
    reached.add(next);
    queue.push(next);
  }
}
for (const [x, y] of [[6, 5], [7, 11], [21, 5], [16, 6], [25, 10], [21, 18]]) {
  assert(reached.has(y * world.cols + x), `Dirt path to destination at (${x}, ${y})`);
}
console.log('PASS: terrain masks, 12 plots, moisture continuity, river boundary and paths to six destinations.');
