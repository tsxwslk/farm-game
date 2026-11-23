(() => {
  const {tile,columns,rows,center,landImage,bake,inside,id} = window.LiuwanMap;
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', {alpha:false});
  const markers = document.getElementById('markers');
  const camera = {x:0,y:0,scale:1,width:0,height:0,pixels:1};
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let world;
  let markerNodes = [];
  let terrainDensity = 0;

  function invalidateTerrain() {
    terrainDensity=0;
  }

  function resize() {
    camera.width=canvas.clientWidth;
    camera.height=canvas.clientHeight;
    camera.pixels=Math.min(devicePixelRatio || 1,2);
    camera.scale=Math.max(camera.width/1060,camera.height/780,.62);
    canvas.width=Math.ceil(camera.width*camera.pixels);
    canvas.height=Math.ceil(camera.height*camera.pixels);
    ctx.imageSmoothingQuality='high';
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function setMap(next) {
    world=next;
    invalidateTerrain();
    markerNodes=world.sites.map(site => {
      const marker=document.createElement('button');
      marker.type='button';
      marker.className='marker';
      marker.textContent=site.label;
      marker.dataset.site=site.kind;
      return {marker,site};
    });
    markers.replaceChildren(...markerNodes.map(({marker})=>marker));
  }

  function screenPoint(event) {
    const box=canvas.getBoundingClientRect();
    return {x:(event.clientX-box.left)/camera.scale+camera.x,y:(event.clientY-box.top)/camera.scale+camera.y};
  }

  function follow(player, instant) {
    const visibleWidth=camera.width/camera.scale;
    const visibleHeight=camera.height/camera.scale;
    const goalX=Math.max(0,Math.min(columns*tile-visibleWidth,player.x-visibleWidth*.5));
    const goalY=Math.max(0,Math.min(rows*tile-visibleHeight,player.y-visibleHeight*.60));
    const amount=instant || reducedMotion.matches ? 1 : .13;
    camera.x+=(goalX-camera.x)*amount;
    camera.y+=(goalY-camera.y)*amount;
  }

  function sprite(image,x,y,height,flip=false,angle=0) {
    const width=image.width/image.height*height;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle);
    if (flip) ctx.scale(-1,1);
    ctx.drawImage(image,-width/2,-height,width,height);
    ctx.restore();
  }

  function shadow(x,y,width,height,alpha=.17) {
    ctx.fillStyle='rgba(52,49,31,'+alpha+')';
    ctx.beginPath();
    ctx.ellipse(x,y,width,height,0,0,Math.PI*2);
    ctx.fill();
  }

  function shimmer(clock) {
    ctx.lineWidth=1.2;
    ctx.lineCap='round';
    for(let y=0; y<rows; y++) for(let x=0; x<columns; x++) {
      if (world.cells[id(x,y)]!=='water' || (y*13+x*5)%7>1) continue;
      const px=(x+.4)*tile;
      const py=(y+.44)*tile;
      const offset=Math.sin(clock/16+x*.8+y)*3;
      const light=.13+Math.sin(clock/20+x+y*.9)*.08;
      ctx.strokeStyle='rgba(239,235,182,'+light+')';
      ctx.beginPath();
      ctx.moveTo(px-11+offset,py);
      ctx.quadraticCurveTo(px-5+offset,py+2,px+10+offset,py-.3);
      ctx.stroke();
    }
  }

  function draw(actor,art,time) {
    if (actor.kind==='player') {
      shadow(actor.x,actor.y-1,9,3);
      const walking=actor.moving && !reducedMotion.matches;
      const bounce=walking ? Math.abs(Math.sin(time*.9))*2.8 : 0;
      sprite(art['char_'+actor.facing],actor.x,actor.y-bounce,51,actor.flip);
      return;
    }
    if (actor.kind==='crop') {
      const age=time-actor.plantedAt;
      const stage=age<20 ? 'seedling' : age<65 ? 'mid' : 'mature';
      sprite(art['cabbage_'+stage],actor.x,actor.y+3,38);
      return;
    }
    const h=actor.size*tile;
    if (actor.kind==='willow') shadow(actor.x+5,actor.y-4,24,8,.22);
    if (actor.kind==='mill') shadow(actor.x-2,actor.y-4,40,11,.2);
    const sway=actor.kind==='reeds' && !reducedMotion.matches ? Math.sin(time*.1+actor.y)*.027 : 0;
    sprite(art[actor.sprite],actor.x,actor.y,h,false,sway);
  }

  function frame(art,state,instant=false) {
    if (!world || !canvas.width) return;
    follow(state.player,instant);
    const scale=camera.scale*camera.pixels;
    const density=Math.max(1,Math.ceil(scale*4)/4);
    if (density!==terrainDensity) {
      bake(world,art,density);
      terrainDensity=density;
    }
    ctx.setTransform(scale,0,0,scale,-camera.x*scale,-camera.y*scale);
    ctx.drawImage(landImage,0,0,columns*tile,rows*tile);
    const motionTime=reducedMotion.matches ? 0 : state.time;
    shimmer(motionTime);
    if (state.route.length) {
      ctx.setLineDash([3,7]);
      ctx.lineWidth=2;
      ctx.strokeStyle='#ffeec0';
      ctx.beginPath();
      ctx.moveTo(state.player.x,state.player.y);
      state.route.forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const actors = world.props.map(prop => {
      const position=center(...prop.cell);
      position.x+=(prop.offsetX ?? 0)*tile;
      if (prop.kind==='ore' && state.oreSpent) return {...prop,...position,sprite:'stone_plain'};
      return {...prop,...position};
    });
    for (const crop of world.crops.values()) actors.push({...crop,...center(...crop.cell),kind:'crop'});
    actors.push({...state.player,kind:'player'});
    actors.sort((a,b)=>a.y-b.y);
    for (const actor of actors) {
      draw(actor,art,state.time);
      if (actor.kind==='willow' && state.player.y>actor.y) {
        sprite(art.willow_canopy,actor.x,actor.y,actor.size*tile);
      }
    }
    for (const actor of actors) {
      if (actor.kind==='willow' && state.player.y<=actor.y) {
        sprite(art.willow_canopy,actor.x,actor.y,actor.size*tile);
      }
    }
    if (state.fishing) {
      const dock=world.sites.find(site=>site.kind==='dock');
      const bobber=center(dock.cell[0]+1,dock.cell[1]);
      ctx.strokeStyle='#f4edcd';
      ctx.lineWidth=1.2;
      ctx.beginPath();
      ctx.moveTo(state.player.x+12,state.player.y-25);
      ctx.quadraticCurveTo(bobber.x-22,bobber.y-14,bobber.x,bobber.y);
      ctx.stroke();
      const radius=state.fishing.biting ? 10+Math.sin(motionTime)*2 : 3.6;
      ctx.strokeStyle=state.fishing.biting ? '#fff0b9' : '#d78052';
      ctx.fillStyle='#a74d3d';
      ctx.beginPath();
      ctx.arc(bobber.x,bobber.y,radius,0,Math.PI*2);
      if (!state.fishing.biting) ctx.fill();
      ctx.stroke();
    }
    if (state.mining) {
      const {x,y}=center(...state.mining.site.cell);
      ctx.strokeStyle='#f1d08b';
      for(let i=0;i<5;i++) {
        const angle=(i*.7-2.8);
        ctx.beginPath();
        ctx.moveTo(x,y-17);
        ctx.lineTo(x+16*Math.cos(angle),y-17+16*Math.sin(angle));
        ctx.stroke();
      }
    }
    if (state.hover && inside(...state.hover)) {
      const [x,y]=state.hover;
      ctx.fillStyle=state.editing?'#eee8b357':'#fff3bb22';
      ctx.fillRect(x*tile,y*tile,tile,tile);
      ctx.lineWidth=1.5;
      ctx.strokeStyle=state.editing?'#fff2c2':'#f6e6b29c';
      ctx.strokeRect(x*tile+.75,y*tile+.75,tile-1.5,tile-1.5);
    }
    for (const {marker,site} of markerNodes) {
      const anchor=center(...site.cell);
      const x=(anchor.x-camera.x)*camera.scale;
      const y=(anchor.y-camera.y)*camera.scale;
      marker.style.left=x+'px';
      marker.style.top=(y-8)+'px';
      marker.hidden=state.editing || x<32 || x>camera.width-32 || y<66 || y>camera.height-5;
    }
  }

  window.LiuwanRenderer = {canvas,markers,screenPoint,setMap,invalidateTerrain,frame};
})();
