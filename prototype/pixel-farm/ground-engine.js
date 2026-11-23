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
  function createWorld(){
    const cols=14,rows=12,cells=Array(cols*rows).fill('grass');
    const rect=(x,y,w,h,kind)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)cells[yy*cols+xx]=kind};
    rect(1,1,9,2,'bare');
    rect(11,0,1,12,'path');rect(0,10,14,1,'path');
    rect(2,4,8,6,'dry');
    const plots=[];
    for(let row=0;row<3;row++)for(let col=0;col<4;col++)plots.push({id:row*4+col,col,row,x:64+col*64,y:128+row*64,wet:(col+row)%3===0});
    return{cols,rows,cells,plots};
  }
  function cellsWithMoisture(world,mode){
    const cells=[...world.cells];
    for(const plot of world.plots){const wet=mode==='wet'||mode==='mixed'&&plot.wet;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)cells[(plot.y/32+dy)*world.cols+plot.x/32+dx]=wet?'wet':'dry'}
    return cells;
  }
  function plotAt(world,x,y){return world.plots.find(p=>x>=p.x&&x<p.x+64&&y>=p.y&&y<p.y+64)||null}
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
