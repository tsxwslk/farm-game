(() => {
  'use strict';
  const E=window.GroundEngine,A=window.GroundAssets,D=window.DepthAssets;
  const canvas=document.getElementById('depth-scene'),ctx=canvas.getContext('2d',{alpha:false});
  const stage=document.getElementById('depth-stage'),status=document.getElementById('depth-status');
  const W=448,H=384,images={};
  const BED_HEIGHT=4;
  const state={crops:true,personInField:false,moisture:'mixed',zoom:2,pan:.5};
  const buffer=document.createElement('canvas');buffer.width=W;buffer.height=H;
  const scene=buffer.getContext('2d',{alpha:false});
  let ready=false,painter,viewWidth=W,cameraX=0;
  const world=E.createWorld();
  const shape=fieldShape();

  function fieldShape(){
    const pixels=new Uint8Array(W*H),covers=new Map();
    for(let y=0;y<world.rows;y++)for(let x=0;x<world.cols;x++){
      if(E.family(world.cells[y*world.cols+x])!=='tilled')continue;
      const mask=E.maskAt(world.cells,world.cols,world.rows,x,y);
      if(!covers.has(mask))covers.set(mask,E.coverage(mask));const cover=covers.get(mask);
      for(let yy=0;yy<32;yy++)for(let xx=0;xx<32;xx++)if(cover[yy*32+xx])pixels[(y*32+yy)*W+x*32+xx]=1;
    }
    const front=[],top=[];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(pixels[y*W+x]){
      if(y===H-1||!pixels[(y+1)*W+x])front.push([x,y]);
      if(y===0||!pixels[(y-1)*W+x])top.push([x,y]);
    }
    return{pixels,front,top};
  }

  function water(){
    scene.fillStyle='#6faaa6';scene.fillRect(400,0,48,H);
    scene.fillStyle='#8dbbb0';
    for(let y=12;y<H;y+=27){const x=410+E.hash(y,7)%17;scene.fillRect(x,y,9,1);scene.fillRect(x+3,y+2,6,1)}
    scene.fillStyle='#5e9796';for(let y=25;y<H;y+=41)scene.fillRect(429,y,12,1);
    scene.fillStyle='#7c9a6b';scene.fillRect(399,0,1,H);
  }

  function bedSides(height,cells){
    scene.fillStyle='#33453230';
    for(const [x,y] of shape.front)scene.fillRect(x+2,y+1,1,2);
    for(const [x,y] of shape.front){
      const kind=cells[Math.floor(y/32)*world.cols+Math.floor(x/32)];
      scene.fillStyle=kind==='wet'?'#574939':'#796043';scene.fillRect(x,y-height+1,1,height);
      if((x+y)%11===0){scene.fillStyle='#ac8b5c';scene.fillRect(x,y-height+2,1,1)}
    }
  }

  function bedLip(height,cells){
    for(const [x,y] of shape.top){const kind=cells[Math.floor(y/32)*world.cols+Math.floor(x/32)];scene.fillStyle=kind==='wet'?'#998162':'#c4a079';scene.fillRect(x,y-height,1,1)}
  }

  function cast(key,x,y){
    const shadow=D.shadows[key];scene.drawImage(images[key+'Shadow'],x-shadow.anchor[0],y-shadow.anchor[1]);
  }

  function contact(x,y,width){
    scene.fillStyle='#30433238';scene.fillRect(x-width/2,y-1,width,3);
    scene.fillStyle='#30433248';scene.fillRect(x-width/2+3,y,width-6,1);
  }

  function fence(){
    scene.fillStyle='#30433228';for(let x=38;x<132;x+=24){scene.fillRect(x+2,61,12,3);scene.fillRect(x+7,58,1,6)}
    for(let x=36;x<132;x+=24){scene.fillStyle='#725b40';scene.fillRect(x,45,4,19);scene.fillStyle='#cab083';scene.fillRect(x,45,2,16)}
    for(const y of [50,58]){scene.fillStyle='#9b784e';scene.fillRect(36,y,96,3);scene.fillStyle='#dac199';scene.fillRect(36,y,96,1)}
  }

  function render(){
    if(!ready)return;
    const bedHeight=BED_HEIGHT,cells=E.cellsWithMoisture(world,state.moisture);
    painter.base(scene,world);water();bedSides(bedHeight,cells);painter.field(scene,{...world,cells},bedHeight);bedLip(bedHeight,cells);
    const person=state.personInField?{kind:'figure',x:224,y:274,level:bedHeight}:{kind:'figure',x:368,y:297,level:0};
    const actors=[{kind:'cottage',x:224,y:108,level:0},person];
    if(state.crops)for(const p of world.plots)actors.push({kind:'cabbage',x:p.x+32,y:p.y+54,level:bedHeight});
    // All projected shadows are painted on the receiving surfaces, before sprites.
    for(const actor of actors){cast(actor.kind,actor.x,actor.y-actor.level);if(actor.kind!=='cottage')contact(actor.x,actor.y-actor.level,actor.kind==='cabbage'?20:18)}
    fence();
    actors.sort((a,b)=>a.y-b.y);
    for(const actor of actors){
      const anchor=actor.kind==='cabbage'?[24,66]:actor.kind==='figure'?[20,76]:D.cottage.anchor;
      const x=actor.x-anchor[0],y=actor.y-anchor[1]-actor.level;
      // Reveal the player through foreground leaves.
      const coversPerson=actor.kind==='cabbage'&&state.personInField&&actor.y>person.y&&Math.abs(actor.x-person.x)<30&&y<person.y-person.level;
      scene.globalAlpha=coversPerson?.68:1;scene.drawImage(images[actor.kind],x,y);scene.globalAlpha=1;
    }
    ctx.imageSmoothingEnabled=false;ctx.drawImage(buffer,cameraX,0,viewWidth,H,0,0,viewWidth,H);
    status.textContent='光影田畦 · '+({mixed:'局部干湿',dry:'全部干土',wet:'全部湿土'}[state.moisture])+'。';
    if(state.personInField)status.textContent+=' 人物在田间，前景叶片轻微透显。';
  }

  function resize(){
    viewWidth=Math.min(W,Math.max(128,Math.floor(stage.clientWidth/state.zoom)));cameraX=Math.round((W-viewWidth)*state.pan);
    canvas.width=viewWidth;canvas.height=H;canvas.style.width=viewWidth*state.zoom+'px';canvas.style.height=H*state.zoom+'px';
    document.getElementById('depth-pan-row').hidden=viewWidth>=W;
    document.getElementById('depth-scale').textContent=`${state.zoom} 倍 · 64 像素株行距`;
    render();
  }

  document.getElementById('depth-crops').addEventListener('click',event=>{state.crops=!state.crops;event.currentTarget.setAttribute('aria-pressed',String(state.crops));render()});
  document.getElementById('depth-person').addEventListener('click',event=>{state.personInField=!state.personInField;event.currentTarget.setAttribute('aria-pressed',String(state.personInField));render()});
  document.getElementById('moisture').addEventListener('change',event=>{state.moisture=event.target.value;render()});
  document.getElementById('depth-zoom').addEventListener('change',event=>{state.zoom=Number(event.target.value);resize()});
  document.getElementById('depth-pan').addEventListener('input',event=>{state.pan=Number(event.target.value)/100;resize()});
  new ResizeObserver(resize).observe(stage);
  const files={atlas:A.themes.riverside.file,cabbage:'assets/ai-cabbage/cabbage-mature-48x72.png',figure:A.figure.file,cottage:D.cottage.file};
  for(const [key,shadow] of Object.entries(D.shadows))files[key+'Shadow']=shadow.file;
  Promise.all(Object.entries(files).map(([key,file])=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[key]=im;resolve()};im.onerror=()=>reject(new Error('未能加载：'+file));im.src=file}))).then(()=>{painter=window.createGroundPainter(images.atlas);ready=true;resize()}).catch(error=>{status.textContent=error.message;status.setAttribute('role','alert')});
})();
