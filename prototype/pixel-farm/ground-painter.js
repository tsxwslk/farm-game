/* Shared terrain painting for the depth experiment; native 32px masks. */
(() => {
  'use strict';
  const E=window.GroundEngine,A=window.GroundAssets;
  window.createGroundPainter = (atlas,theme='riverside') => {
    const cache=new Map();
    function tile(kind,variant,mask){
      const key=[kind,variant,mask].join('/');if(cache.has(key))return cache.get(key);
      const off=document.createElement('canvas');off.width=32;off.height=32;
      const c=off.getContext('2d');c.imageSmoothingEnabled=false;
      const cover=kind==='grass'?null:E.coverage(mask);
      if(cover){
        c.fillStyle='#fff';
        for(let y=0;y<32;y++)for(let x=0;x<32;){if(!cover[y*32+x]){x++;continue}const start=x;while(x<32&&cover[y*32+x])x++;c.fillRect(start,y,x-start,1)}
        c.globalCompositeOperation='source-in';
      }
      c.drawImage(atlas,variant*32,A.materials.indexOf(kind)*32,32,32,0,0,32,32);
      c.globalCompositeOperation='source-over';
      if(cover){c.fillStyle=A.themes[theme][kind][2];for(let y=0;y<32;y++)for(let x=0;x<32;x++){const p=y*32+x;if(cover[p]&&(y>0&&!cover[p-32]||x>0&&!cover[p-1]))c.fillRect(x,y,1,1)}}
      cache.set(key,off);return off;
    }
    function base(ctx,map){
      ctx.imageSmoothingEnabled=false;
      for(let y=0;y<map.rows;y++)for(let x=0;x<map.cols;x++){
        const variant=E.hash(x,y)%4,kind=map.cells[y*map.cols+x];
        ctx.drawImage(tile('grass',variant,255),x*32,y*32);
        if(kind!=='grass'&&E.family(kind)!=='tilled')ctx.drawImage(tile(kind,variant,E.maskAt(map.cells,map.cols,map.rows,x,y)),x*32,y*32);
      }
    }
    function field(ctx,map,height=0){
      for(let y=0;y<map.rows;y++)for(let x=0;x<map.cols;x++){
        const kind=map.cells[y*map.cols+x];if(E.family(kind)!=='tilled')continue;
        ctx.drawImage(tile(kind,E.hash(x,y)%4,E.maskAt(map.cells,map.cols,map.rows,x,y)),x*32,y*32-height);
      }
    }
    return {tile,base,field};
  };
})();
