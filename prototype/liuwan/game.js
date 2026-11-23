(() => {
  const {id,inside,center,pointCell,newMap,passable,pathTo,loadArt} = window.LiuwanMap;
  const renderer=window.LiuwanRenderer;
  const el=name=>document.getElementById(name);
  const status=message=>{el('status').textContent=message;};
  const speed=185;
  const minutesPerDay=1080;
  const demoRate=8;
  const destinations=el('destinations');
  const layouts=[...document.querySelectorAll('[data-layout]')];
  const brushes=[...document.querySelectorAll('[data-brush]')];
  const keyDirections={
    w:[0,-1], arrowup:[0,-1], s:[0,1], arrowdown:[0,1],
    a:[-1,0], arrowleft:[-1,0], d:[1,0], arrowright:[1,0]
  };
  const stockLabels={seed:'菜种',cabbage:'小白菜',grain:'小麦',flour:'面粉',fish:'鲫鱼',ore:'矿石'};
  const sessions=new Map();

  let art;
  let layout='farm';
  let world;
  let state;
  let editing=false;
  let brush='grass';
  let hover=null;
  let pending=null;
  let keys=new Set();
  let lastFrame=0;
  let interfaceTime=-1;
  let lastActionText='';

  function makeSession(name) {
    const map=newMap(name);
    const player={...center(...map.spawn),facing:'front',flip:false,moving:false};
    return {world:map,player,route:[],time:0,day:1,review:false,output:0,oreSpent:false,
      stock:{seed:6,cabbage:0,grain:2,flour:0,fish:0,ore:0},millUntil:null,fishing:null,mining:null};
  }

  function switchLayout(name) {
    if (!sessions.has(name)) sessions.set(name,makeSession(name));
    state=sessions.get(name);
    world=state.world;
    layout=name;
    state.route=[];
    pending=null;
    keys.clear();
    hover=null;
    renderer.setMap(world);
    renderer.frame(art,{...state,editing,hover},true);
    destinations.replaceChildren(...world.sites.map(site=>{
      const button=document.createElement('button');
      button.type='button';
      button.textContent=site.label;
      button.dataset.site=site.kind;
      return button;
    }));
    layouts.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layout===name)));
    updateStock();
    updateHud();
    status(name==='farm'?'点击地面移动，或选一个目的地。':'同一套地面和物件，换了一种河岸和田地布局。');
  }

  function updateStock() {
    el('stock').replaceChildren(...Object.entries(stockLabels).flatMap(([key,name])=>{
      const label=document.createElement('dt');
      label.textContent=name;
      const number=document.createElement('dd');
      number.dataset.item=key;
      number.textContent=state.stock[key];
      return [label,number];
    }));
  }
  function harvestItem(item,count,message) {
    state.stock[item]+=count;
    state.output+=count;
    updateStock();
    status(message);
  }

  const cellDistance=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
  function walk(point,action=null) {
    const start=pointCell(state.player);
    const route=pathTo(world,start,point);
    if (route===null) {
      status('这里走不到。可以换个落脚点。');
      return;
    }
    const origin=center(...start);
    if (Math.hypot(state.player.x-origin.x,state.player.y-origin.y)>1) route.unshift(origin);
    state.route=route;
    pending=action;
    if (!route.length) arrive();
  }
  function arrive() {
    const action=pending;
    pending=null;
    if (action) action();
  }

  function fieldState(cell) {
    const [x,y]=cell;
    const crop=world.crops.get(id(x,y));
    if (!crop) return {label:'翻土播种',detail:'消耗 1 粒菜种。'};
    if (state.time-crop.plantedAt>=65) return {label:'收小白菜',detail:'已成熟，可以采收。'};
    return {label:null,detail:'正在生长，还需约 '+Math.ceil(65-state.time+crop.plantedAt)+' 活动分钟。'};
  }

  function useField(cell) {
    if (!inside(...cell) || cellDistance(pointCell(state.player),cell)>1) return;
    const key=id(...cell);
    const crop=world.crops.get(key);
    if (crop) {
      if (state.time-crop.plantedAt<65) return status('这株小白菜还没长好。');
      world.crops.delete(key);
      harvestItem('cabbage',1,'收下 1 棵小白菜。');
    } else {
      if (state.stock.seed===0) return status('菜种用完了。');
      state.stock.seed--;
      world.cells[key]='tilled';
      world.crops.set(key,{cell,plantedAt:state.time});
      updateStock();
      renderer.invalidateTerrain();
      status('小白菜已种下，去河边时它也会继续长。');
    }
    updateHud();
  }

  function work(site) {
    if (state.review || editing || state.mining || state.fishing) return;
    switch(site.kind) {
      case 'mill':
        if (state.millUntil!==null) return status('磨坊正在加工。');
        if (!state.stock.grain) return status('磨坊需要 1 份小麦。');
        state.stock.grain--;
        state.millUntil=state.time+52;
        updateStock();
        status('磨坊已开工。离开这块田，加工仍会继续。');
        break;
      case 'dock':
        state.fishing={biteAt:state.time+14,endsAt:state.time+38,biting:false};
        status('抛竿了。等浮标下沉，再点「收竿」。');
        break;
      case 'ore':
        if (state.oreSpent) return status('今天的矿点已经采完。');
        state.mining={site,endsAt:state.time+6};
        status('正在敲击矿脉。');
        break;
      case 'field':
        useField(site.cell);
        return;
    }
    updateHud();
  }

  function goToSite(kind) {
    if (editing || state.review || state.fishing || state.mining) return;
    const site=world.sites.find(item=>item.kind===kind);
    if (!site) return;
    status('正前往'+site.label+'。');
    walk(site.point,()=>status('到了'+site.label+'。'));
  }
  function useNearby() {
    if (editing || state.review || state.route.length || keys.size) return;
    if (state.fishing?.biting) {
      state.fishing=null;
      harvestItem('fish',1,'收竿，上来一条鲫鱼。');
    } else if (!state.fishing && !state.mining) {
      const cell=pointCell(state.player);
      const site=world.sites.find(item=>id(...item.point)===id(...cell));
      if (site) work(site);
      else if (['soil','tilled'].includes(world.cells[id(...cell)])) useField(cell);
    }
    updateHud();
  }

  function paint(cell) {
    const index=id(...cell);
    if (world.protectedCells.has(index) || world.crops.has(index) || cellDistance(cell,pointCell(state.player))===0) {
      status('这里有作物、地物或交互点，先选旁边的空地。');
      return;
    }
    if (world.cells[index]===brush) return;
    world.cells[index]=brush;
    renderer.invalidateTerrain();
    status('地块已更新。退出编辑后试着走一走。');
  }

  renderer.canvas.addEventListener('pointermove',event=>{hover=pointCell(renderer.screenPoint(event));});
  renderer.canvas.addEventListener('pointerleave',()=>{hover=null;});
  renderer.canvas.addEventListener('click',event=>{
    if (!state || state.review) return;
    const cell=pointCell(renderer.screenPoint(event));
    if (!inside(...cell)) return;
    if (editing) return paint(cell);
    if (state.fishing || state.mining) return;
    const key=id(...cell);
    const site=world.sites.find(item=>item.kind!=='field' && id(...item.cell)===key);
    if (site) return goToSite(site.kind);
    const farm=world.cells[key]==='soil' || world.cells[key]==='tilled';
    walk(cell,farm?()=>status('到了这格菜地，可以操作。'):null);
  });
  function selectSite(event) {
    const kind=event.target.closest('[data-site]')?.dataset.site;
    if (kind && state) goToSite(kind);
  }
  renderer.markers.addEventListener('click',selectSite);
  destinations.addEventListener('click',selectSite);
  el('action').addEventListener('click',useNearby);

  layouts.forEach(button=>button.addEventListener('click',()=>{
    if (state && !state.review && !state.fishing && !state.mining && button.dataset.layout!==layout) switchLayout(button.dataset.layout);
  }));
  brushes.forEach(button=>button.addEventListener('click',()=>{
    brush=button.dataset.brush;
    brushes.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  }));
  el('edit').addEventListener('click',()=>{
    if (!state || state.review || state.fishing || state.mining) return;
    editing=!editing;
    state.route=[];
    pending=null;
    keys.clear();
    el('edit').textContent=editing?'完成编辑':'编辑地块';
    el('edit').setAttribute('aria-pressed',String(editing));
    el('palette').hidden=!editing;
    status(editing?'选择草地、土路、可耕土或水面，再点空地。':'退出编辑，可以沿新布局移动。');
    updateHud();
  });

  window.addEventListener('keydown',event=>{
    const key=event.key.toLowerCase();
    if (!state || !keyDirections[key] || state.review || editing || state.fishing || state.mining || event.altKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    keys.add(key);
    state.route=[];
    pending=null;
  });
  window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur',()=>keys.clear());

  function face(dx,dy) {
    if (Math.abs(dx)>Math.abs(dy)) {
      state.player.facing='side';
      state.player.flip=dx<0;
    } else if (dy!==0) {
      state.player.facing=dy<0?'back':'front';
      state.player.flip=false;
    }
  }
  function canStand(x,y) {
    const radius=7;
    return [[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]]
      .every(([dx,dy])=>passable(world,...pointCell({x:x+dx,y:y+dy})));
  }
  function move(dt) {
    const player=state.player;
    player.moving=false;
    if (state.fishing || state.mining) return;
    if (keys.size) {
      const directions=[...keys].map(key=>keyDirections[key]);
      const dx=Math.sign(directions.reduce((total,vector)=>total+vector[0],0));
      const dy=Math.sign(directions.reduce((total,vector)=>total+vector[1],0));
      if (!dx && !dy) return;
      const amount=dt*speed/Math.hypot(dx,dy);
      const x=player.x+dx*amount,y=player.y+dy*amount;
      if (dx && canStand(x,player.y)) {player.x=x;player.moving=true;}
      if (dy && canStand(player.x,y)) {player.y=y;player.moving=true;}
      face(dx,dy);
      return;
    }
    let distance=dt*speed;
    while (state.route.length && distance>0) {
      const next=state.route[0];
      const dx=next.x-player.x,dy=next.y-player.y;
      const remaining=Math.hypot(dx,dy);
      player.moving=true;
      face(dx,dy);
      if (remaining<=distance) {
        player.x=next.x;
        player.y=next.y;
        state.route.shift();
        distance-=remaining;
        if (!state.route.length) arrive();
      } else {
        player.x+=dx*distance/remaining;
        player.y+=dy*distance/remaining;
        distance=0;
      }
    }
  }

  function updateHud() {
    const minute=Math.min(1440,360+Math.floor(state.time%minutesPerDay));
    const stamp=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
    el('clock').textContent='春 · 第 '+state.day+' 天　'+(state.review?'日结':stamp);
    const busy=state.review || editing || state.fishing || state.mining;
    for (const button of destinations.querySelectorAll('button')) button.disabled=Boolean(busy);
    el('dusk').disabled=Boolean(busy);
    el('edit').disabled=Boolean(state.review || state.fishing || state.mining);
    for (const button of layouts) button.disabled=Boolean(state.review || state.fishing || state.mining);

    let hint='先走到菜畦、磨坊、栈桥或矿点。';
    let action=null;
    if (editing) hint='正在编辑地块。';
    else if (state.review) hint='活动和加工暂停。';
    else if (state.fishing) {
      hint=state.fishing.biting?'鱼咬钩了。':'等浮标下沉。';
      if (state.fishing.biting) action='收竿';
    } else if (state.mining) hint='正在敲击。';
    else if (state.route.length || keys.size) hint='正在移动。';
    else {
      const cell=pointCell(state.player);
      const site=world.sites.find(item=>id(...item.point)===id(...cell));
      if (site?.kind==='mill') {
        hint=state.millUntil===null?'1 份小麦可磨成面粉。':'正在加工，约剩 '+Math.ceil(state.millUntil-state.time)+' 活动分钟。';
        if (state.millUntil===null && state.stock.grain) action='磨小麦';
      } else if (site?.kind==='dock') {
        hint='可从栈桥旁向河里抛竿。';
        action='抛竿';
      } else if (site?.kind==='ore') {
        hint=state.oreSpent?'矿脉已采空。':'岩面露出了矿脉。';
        if (!state.oreSpent) action='敲矿';
      } else if (site?.kind==='field' || ['soil','tilled'].includes(world.cells[id(...cell)])) {
        const field=fieldState(site?.cell ?? cell);
        hint=field.detail;
        action=field.label;
      }
    }
    if (el('nearby').textContent!==hint) el('nearby').textContent=hint;
    if (lastActionText!==action) {
      lastActionText=action;
      el('action').textContent=action ?? '';
      el('action').hidden=!action;
    }
  }

  function reviewDay() {
    state.review=true;
    state.player.moving=false;
    keys.clear();
    el('review-title').textContent='第 '+state.day+' 天 · 日结';
    el('review-summary').textContent='今天取得 '+state.output+' 份产出。作物、加工和动作已暂停。';
    el('review').hidden=false;
    updateHud();
    el('dawn').focus({preventScroll:true});
  }
  function advance(minutes) {
    const boundary=state.day*minutesPerDay;
    state.time=Math.min(boundary,state.time+minutes);
    if (state.millUntil!==null && state.millUntil<=state.time) {
      state.millUntil=null;
      harvestItem('flour',1,'磨坊已磨好 1 份面粉。');
    }
    if (state.mining && state.mining.endsAt<=state.time) {
      state.mining=null;
      state.oreSpent=true;
      harvestItem('ore',1,'挖到 1 块矿石。');
      updateHud();
    }
    if (state.fishing && state.fishing.endsAt<=state.time) {
      state.fishing=null;
      status('鱼溜走了，可以再抛一竿。');
      updateHud();
    } else if (state.fishing && !state.fishing.biting && state.fishing.biteAt<=state.time) {
      state.fishing.biting=true;
      status('浮标下沉了，点「收竿」。');
      updateHud();
    }
    if (state.time===boundary) reviewDay();
  }

  el('dusk').addEventListener('click',()=>{
    if (state && !el('dusk').disabled) advance(state.day*minutesPerDay-state.time);
  });
  el('dawn').addEventListener('click',()=>{
    if (!state?.review) return;
    state.review=false;
    state.day++;
    state.output=0;
    state.oreSpent=false;
    el('review').hidden=true;
    status('天亮了。未完成的工作继续推进。');
    updateHud();
    el('dusk').focus({preventScroll:true});
  });

  function frame(now) {
    const dt=lastFrame ? Math.min(.05,(now-lastFrame)/1000) : 0;
    lastFrame=now;
    if (!state.review && !editing && !document.hidden && document.hasFocus()) {
      move(dt);
      advance(dt*demoRate);
    }
    renderer.frame(art,{...state,editing,hover});
    if (now-interfaceTime>=140) {
      interfaceTime=now;
      updateHud();
    }
    requestAnimationFrame(frame);
  }

  loadArt().then(loaded=>{
    art=loaded;
    switchLayout(layout);
    requestAnimationFrame(frame);
  }).catch(error=>{
    status('素材加载失败。请确认 assets 目录与本页面在一起。');
    console.error(error);
  });
})();
