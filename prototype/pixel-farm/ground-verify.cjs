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
console.log('PASS: 256 masks rotate consistently; inner corners, joined interiors, 12 plots, hit boundaries, 2×2 moisture atomicity and dry/wet continuity.');
