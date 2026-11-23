(() => {
  const tile = 40;
  const columns = 32;
  const rows = 20;
  const terrain = {
    grass: 'grass_short_variant',
    path: 'path_packed_earth',
    soil: 'soil_bare',
    tilled: 'soil_tilled_dark',
    water: 'water_calm_teal'
  };
  const spriteNames = [
    'cabbage_seedling', 'cabbage_mid', 'cabbage_mature', 'char_front', 'char_back',
    'char_side', 'reeds', 'rock_ore_vein', 'stone_plain', 'watermill', 'willow_canopy',
    'willow_trunk', 'wooden_dock'
  ];
  const layouts = {
    farm: {
      shore: [[0,24],[3,26],[6,25],[8,23],[11,24],[14,22],[17,23]],
      paths: [[0,10,20,2],[19,9,5,2],[7,3,2,8],[12,7,2,4],[16,11,2,9],[19,7,2,3]],
      plots: [[3,5,4,4],[9,13,5,4]],
      spawn: [9,10],
      mill: [13,6], dock: [23,9], ore: [19,5],
      willows: [[3,3],[5,12],[10,3],[16,4],[19,13],[21,16],[28,18],[2,18],[29,3]],
      stones: [[2,7],[7,14],[15,5],[18,2],[20,15],[10,18],[21,7],[26,4],[31,13]]
    },
    bend: {
      shore: [[0,21],[3,23],[6,24],[9,26],[12,24],[15,22],[18,21]],
      paths: [[0,12,23,2],[22,11,4,2],[7,10,2,3],[10,8,2,5],[15,3,2,10],[19,13,2,7]],
      plots: [[3,6,4,4],[13,15,4,3]],
      spawn: [10,12],
      mill: [10,7], dock: [26,11], ore: [17,4],
      willows: [[4,3],[2,15],[9,3],[13,8],[18,8],[23,13],[24,18],[29,2],[8,17]],
      stones: [[2,5],[7,15],[14,2],[20,5],[21,10],[21,16],[24,8],[4,18],[30,14]]
    }
  };
  const id = (x,y) => y * columns + x;
  const inside = (x,y) => x >= 0 && y >= 0 && x < columns && y < rows;
  const center = (x,y) => ({x:(x+.5)*tile, y:(y+.5)*tile});
  const pointCell = point => [Math.floor(point.x/tile), Math.floor(point.y/tile)];
  const neighbors = [[1,0],[-1,0],[0,1],[0,-1]];
  const landImage = document.createElement('canvas');

  function newMap(key) {
    const layout = layouts[key];
    const cells = Array.from({length:columns*rows}, () => 'grass');
    for (const [x,y,w,h] of layout.paths) {
      for (let yy=y; yy<y+h; yy++) for (let xx=x; xx<x+w; xx++) cells[id(xx,yy)] = 'path';
    }
    for (const [x,y,w,h] of layout.plots) {
      for (let yy=y; yy<y+h; yy++) for (let xx=x; xx<x+w; xx++) cells[id(xx,yy)] = 'soil';
    }
    let shore = 0;
    for (let y=0; y<rows; y++) {
      if (layout.shore[shore+1]?.[0] === y) shore++;
      for (let x=layout.shore[shore][1]; x<columns; x++) cells[id(x,y)] = 'water';
    }

    const [mx,my] = layout.mill;
    const [dx,dy] = layout.dock;
    const [ox,oy] = layout.ore;
    const [fx,fy] = layout.plots[0];
    const props = [
      {kind:'mill', sprite:'watermill', cell:[mx,my], size:3.45, blocked:[[mx-1,my-1],[mx,my-1],[mx-1,my],[mx,my]], point:[mx,my+1], label:'磨坊', offsetX:-.25},
      {kind:'dock', sprite:'wooden_dock', cell:[dx,dy], size:2.18, point:[dx-1,dy], label:'钓点', offsetX:.12},
      {kind:'ore', sprite:'rock_ore_vein', cell:[ox,oy], size:1.38, blocked:[[ox,oy]], point:[ox,oy+1], label:'矿点'},
      ...layout.willows.filter(([x,y]) => cells[id(x,y)] !== 'water').map(cell => ({kind:'willow',sprite:'willow_trunk',cell,size:3.25,blocked:[cell]})),
      ...layout.stones.filter(([x,y]) => cells[id(x,y)] !== 'water').map((cell,index) => ({kind:'stone',sprite:'stone_plain',cell,size:.5+index%3*.12,blocked:[cell]}))
    ];
    const field = {kind:'field', cell:[fx+1,fy+3], point:[fx+1,fy+4], label:'菜畦'};
    const reeds = [];
    for (let y=1; y<rows; y++) {
      const x = cells.slice(y*columns,(y+1)*columns).indexOf('water')-1;
      if ((x !== dx-1 || Math.abs(y-dy)>2) && Math.abs(y-dy)>1 && y%3!==0) {
        reeds.push({kind:'reeds',sprite:'reeds',cell:[x,y],size:.68+y%3*.18,offsetX:.45});
      }
    }
    props.push(...reeds);
    const obstacles = new Set(props.flatMap(prop => (prop.blocked ?? []).map(cell => id(...cell))));
    const sites = [field,...props.filter(prop=>prop.label)];
    const protectedCells = new Set([...obstacles,...sites.flatMap(site=>[id(...site.cell),id(...site.point)]),id(...layout.spawn)]);
    const crops = new Map();
    const initialPlants = [[fx,fy],[fx+1,fy],[fx,fy+1],[fx+1,fy+1],[fx+2,fy+1],[fx,fy+2]];
    initialPlants.forEach(([x,y],index) => {
      cells[id(x,y)] = 'tilled';
      crops.set(id(x,y), {cell:[x,y], plantedAt:index<3 ? -80 : index<5 ? -43 : -7});
    });
    return {cells,props,obstacles,sites,protectedCells,crops,spawn:layout.spawn};
  }

  function passable(world,x,y) {
    return inside(x,y) && world.cells[id(x,y)] !== 'water' && !world.obstacles.has(id(x,y));
  }

  function pathTo(world,start,end) {
    if (!passable(world,...end)) return null;
    const startId = id(...start);
    const endId = id(...end);
    const visited = new Int16Array(world.cells.length).fill(-1);
    const queue = [startId];
    visited[startId] = startId;
    for (let i=0; i<queue.length && visited[endId] === -1; i++) {
      const current = queue[i];
      const x = current % columns;
      const y = Math.floor(current/columns);
      for (const [dx,dy] of neighbors) {
        const nx=x+dx, ny=y+dy;
        if (!passable(world,nx,ny)) continue;
        const next = id(nx,ny);
        if (visited[next] !== -1) continue;
        visited[next] = current;
        queue.push(next);
      }
    }
    if (visited[endId] === -1) return null;
    const route = [];
    for (let current=endId; current!==startId; current=visited[current]) {
      route.push(center(current%columns,Math.floor(current/columns)));
    }
    return route.reverse();
  }

  async function loadArt() {
    const edges = ['dirt','shallow'].flatMap(material =>
      ['straight','corner_in','corner_out'].map(shape => 'edge_'+material+'_grass_'+shape));
    const keys = [...Object.values(terrain),'grass_short',...edges,...spriteNames];
    return Object.fromEntries(await Promise.all(keys.map(async key => {
      const image = new Image();
      image.src = 'assets/'+key+'.png';
      await image.decode();
      return [key,image];
    })));
  }

  function edgeImage(mask) {
    for (let turn=0; turn<4; turn++) {
      if (mask === 8) return ['corner_in',turn];
      if (mask === 7) return ['corner_out',turn];
      if (mask === 12) return ['straight',turn];
      mask = ((mask >> 1) | (mask << 3)) & 15;
    }
    return null;
  }

  function material(ctx,world,art,name,scale) {
    ctx.beginPath();
    for (let y=0; y<rows; y++) {
      let x=0;
      while (x<columns) {
        const start=x;
        if (world.cells[id(x,y)] !== name) {
          x++;
          continue;
        }
        while (x<columns && world.cells[id(x,y)] === name) x++;
        ctx.rect(start*tile,y*tile,(x-start)*tile,tile);
      }
    }
    const image=art[terrain[name]];
    const pattern=ctx.createPattern(image,'repeat');
    pattern.setTransform(new DOMMatrix().scale(scale/image.width));
    ctx.fillStyle=pattern;
    ctx.fill();
  }

  function roundTerrain(ctx,world,art,name,scale,radius) {
    const same = (x,y) => world.cells[id(
      Math.max(0,Math.min(columns-1,x)),Math.max(0,Math.min(rows-1,y))
    )]===name;
    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
    ctx.beginPath();
    for (let y=0; y<rows; y++) for (let x=0; x<columns; x++) {
      const vertices=corners.map(([dx,dy])=>({
        x:(x+Number(dx>0))*tile,
        y:(y+Number(dy>0))*tile,
        dx,dy,
        adjacentX:same(x+dx,y),
        adjacentY:same(x,y+dy)
      }));
      if (same(x,y)) {
        vertices.forEach((vertex,index)=>{
          const {x:px,y:py,dx,dy,adjacentX,adjacentY}=vertex;
          const bend=adjacentX || adjacentY ? 0 : radius;
          const previous=index%2===0 ? [px,py-dy*bend] : [px-dx*bend,py];
          const next=index%2===0 ? [px-dx*bend,py] : [px,py-dy*bend];
          if (index===0) ctx.moveTo(...previous);
          else ctx.lineTo(...previous);
          ctx.quadraticCurveTo(px,py,...next);
        });
        ctx.closePath();
      } else {
        for (const {x:px,y:py,dx,dy,adjacentX,adjacentY} of vertices) {
          if (!adjacentX || !adjacentY || !same(x+dx,y+dy)) continue;
          ctx.moveTo(px,py);
          ctx.lineTo(px-dx*radius,py);
          ctx.quadraticCurveTo(px,py,px,py-dy*radius);
          ctx.closePath();
        }
      }
    }
    const image=art[terrain[name]];
    const pattern=ctx.createPattern(image,'repeat');
    pattern.setTransform(new DOMMatrix().scale(scale/image.width));
    ctx.fillStyle=pattern;
    ctx.fill();
  }

  function drawEdges(ctx,world,art,name) {
    const same = (x,y) => world.cells[id(Math.max(0,Math.min(columns-1,x)),Math.max(0,Math.min(rows-1,y)))]===name;
    const prefix = name==='path' ? 'dirt' : 'shallow';
    for (let y=0; y<=rows; y++) for (let x=0; x<=columns; x++) {
      const mask = Number(same(x-1,y-1)) + 2*Number(same(x,y-1)) + 4*Number(same(x,y)) + 8*Number(same(x-1,y));
      const edge = edgeImage(mask);
      if (!edge) continue;
      const [shape,turn] = edge;
      ctx.save();
      ctx.translate(x*tile,y*tile);
      ctx.rotate(turn*Math.PI/2);
      ctx.drawImage(art['edge_'+prefix+'_grass_'+shape],-tile/2,-tile/2,tile,tile);
      ctx.restore();
    }
  }

  function bake(world,art,density) {
    const width=columns*tile;
    const height=rows*tile;
    landImage.width=Math.ceil(width*density);
    landImage.height=Math.ceil(height*density);
    const ctx=landImage.getContext('2d');
    ctx.setTransform(landImage.width/width,0,0,landImage.height/height,0,0);
    ctx.imageSmoothingQuality='high';
    const grass=art[terrain.grass];
    const grassPattern=ctx.createPattern(grass,'repeat');
    grassPattern.setTransform(new DOMMatrix().scale(130/grass.width));
    ctx.fillStyle=grassPattern;
    ctx.fillRect(0,0,width,height);
    for (const [name,scale] of [['soil',100],['tilled',128]]) {
      material(ctx,world,art,name,scale);
    }
    roundTerrain(ctx,world,art,'path',112,15);
    roundTerrain(ctx,world,art,'water',158,18);
    drawEdges(ctx,world,art,'path');
    drawEdges(ctx,world,art,'water');

    const variant=ctx.createPattern(art.grass_short,'repeat');
    variant.setTransform(new DOMMatrix().scale(142/art.grass_short.width));
    ctx.fillStyle=variant;
    ctx.globalAlpha=.27;
    for (let y=0; y<rows; y++) for (let x=0; x<columns; x++) {
      if (world.cells[id(x,y)]!=='grass' || (x*83+y*127)%11>2) continue;
      const px=(x+.51)*tile, py=(y+.56)*tile;
      const soften=ctx.createRadialGradient(px,py,2,px,py,18);
      soften.addColorStop(0,'#a19440');
      soften.addColorStop(1,'#a1944000');
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(px,py,18,14,0,0,2*Math.PI);
      ctx.clip();
      ctx.fillRect(px-18,py-14,36,28);
      ctx.fillStyle=soften;
      ctx.fillRect(px-18,py-14,36,28);
      ctx.restore();
    }
    ctx.globalAlpha=1;
  }

  window.LiuwanMap = {tile,columns,rows,id,inside,center,pointCell,newMap,passable,pathTo,loadArt,bake,landImage};
})();
