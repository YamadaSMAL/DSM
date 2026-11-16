/* Self-contained offline viewer: no imports, fetch, external assets or analysis. */
(() => {
  'use strict';
  const data=JSON.parse(document.getElementById('report-data').textContent),N=data.n,SIZE=620,MARGIN=95,AREA=SIZE-MARGIN;
  let zoom=1;
  const max=data.original.reduce((a,b)=>Math.max(a,b),0);
  const panes=['original','result'].map(id=>({id,canvas:document.getElementById(id),detail:document.getElementById(id+'-detail'),order:id==='original'?Array.from({length:N},(_,i)=>i):data.order,values:id==='original'?data.original:data.result,pan:{x:0,y:0},selected:{r:0,c:0},drag:null}));
  function draw(pane,print=false){
    const {canvas,values,order}=pane,dpr=window.devicePixelRatio||1,cell=AREA/N*(print?1:zoom),pan=print?{x:0,y:0}:pane.pan;
    canvas.width=SIZE*dpr;canvas.height=SIZE*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#fffefa';ctx.fillRect(0,0,SIZE,SIZE);
    const firstR=Math.max(0,Math.floor(pan.y/cell)),lastR=Math.min(N,Math.ceil((pan.y+AREA)/cell)),firstC=Math.max(0,Math.floor(pan.x/cell)),lastC=Math.min(N,Math.ceil((pan.x+AREA)/cell));
    ctx.save();ctx.beginPath();ctx.rect(MARGIN,MARGIN,AREA,AREA);ctx.clip();
    for(let r=firstR;r<lastR;r++)for(let c=firstC;c<lastC;c++){
      const v=values[r*N+c],strength=max?(data.color.log?Math.log1p(v)/Math.log1p(max):v/max):0,x=MARGIN+c*cell-pan.x,y=MARGIN+r*cell-pan.y;
      ctx.fillStyle=r===c?'#d9dfd6':v>0?data.color.alternative?`rgb(${240-180*strength},${235-150*strength},${250-50*strength})`:`rgb(${220-195*strength},${240-130*strength},${223-150*strength})`:'#f5f6f0';
      const px=Math.round(x*dpr)/dpr,py=Math.round(y*dpr)/dpr,gap=cell>5?1:0;ctx.fillRect(px,py,Math.max(1/dpr,Math.round((x+cell)*dpr)/dpr-px-gap),Math.max(1/dpr,Math.round((y+cell)*dpr)/dpr-py-gap));
      const scale=SIZE/(canvas.clientWidth||SIZE);
      if(cell/scale>=28){ctx.fillStyle=strength>.7&&v>0?'white':'#17352e';ctx.font=`${12*scale}px system-ui`;ctx.fillText(String(v).slice(0,7),x+4,y+cell/2+4);}
    }
    if(pane.id==='result'){
      let start=0;ctx.strokeStyle='#17352e';ctx.lineWidth=2;
      for(let end=1;end<=N;end++)if(end===N||data.membership[order[start]]!==data.membership[order[end]]){ctx.strokeRect(MARGIN+start*cell-pan.x,MARGIN+start*cell-pan.y,(end-start)*cell,(end-start)*cell);if((end-start)*cell>24){ctx.fillStyle='#17352e';ctx.font='12px system-ui';ctx.fillText((data.kind==='structure'?'C':'S')+(data.membership[order[start]]+1),MARGIN+start*cell-pan.x+4,MARGIN+start*cell-pan.y+16);}start=end;}
    }
    if(!print){ctx.strokeStyle='#b46925';ctx.lineWidth=2;ctx.strokeRect(MARGIN+pane.selected.c*cell-pan.x,MARGIN+pane.selected.r*cell-pan.y,cell,cell);}ctx.restore();
    ctx.fillStyle='#17352e';ctx.font='11px system-ui';const step=Math.max(1,Math.ceil(18/cell));
    for(let r=firstR;r<lastR;r++)if(r%step===0)ctx.fillText(data.elements[order[r]].label.slice(0,11),3,MARGIN+r*cell-pan.y+12);
    for(let c=firstC;c<lastC;c++)if(c%step===0){ctx.save();ctx.translate(MARGIN+c*cell-pan.x+10,MARGIN-6);ctx.rotate(-Math.PI/2);ctx.fillText(data.elements[order[c]].label.slice(0,11),0,0);ctx.restore();}
    const {r,c}=pane.selected,i=order[r],j=order[c],a=data.elements[i],b=data.elements[j];
    pane.detail.textContent=`行: ${a.label} (${a.id}) / 列: ${b.label} (${b.id}) / 値: ${values[r*N+c]} / 元値: ${data.original[i*N+j]} / 元順位: ${i+1},${j+1} / 表示順位: ${r+1},${c+1} / `+(pane.id==='result'&&data.kind==='structure'?'構造用の無向mean重み。':`${a.label} が ${b.label} に依存するセル（${b.label} → ${a.label}）。`)+(pane.id==='result'?` 所属: ${data.kind==='structure'?'構造C':'SCC'}${data.membership[i]+1},${data.membership[j]+1}`+(data.bands?` / Band: ${data.bands[i]},${data.bands[j]}`:''):'');
  }
  function render(){panes.forEach(p=>draw(p));}
  function reveal(pane,r,c){const cell=AREA/N*zoom;pane.selected={r,c};pane.pan={x:Math.max(0,Math.min(Math.max(pane.pan.x,(c+1)*cell-AREA),c*cell)),y:Math.max(0,Math.min(Math.max(pane.pan.y,(r+1)*cell-AREA),r*cell))};draw(pane);}
  for(const pane of panes){const {canvas}=pane;
    const point=e=>{const box=canvas.getBoundingClientRect();return{x:(e.clientX-box.left)*SIZE/box.width,y:(e.clientY-box.top)*SIZE/box.height};};
    canvas.addEventListener('pointerdown',e=>{const p=point(e);pane.drag={...p,panX:pane.pan.x,panY:pane.pan.y,moved:false};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!pane.drag)return;const p=point(e),d=pane.drag;if(Math.abs(p.x-d.x)+Math.abs(p.y-d.y)>4)d.moved=true;if(d.moved){const limit=AREA*(zoom-1);pane.pan={x:Math.max(0,Math.min(limit,d.panX+d.x-p.x)),y:Math.max(0,Math.min(limit,d.panY+d.y-p.y))};draw(pane);}});
    canvas.addEventListener('pointerup',e=>{const p=point(e),cell=AREA/N*zoom,r=Math.floor((p.y-MARGIN+pane.pan.y)/cell),c=Math.floor((p.x-MARGIN+pane.pan.x)/cell);if(pane.drag&&!pane.drag.moved&&p.x>=MARGIN&&p.y>=MARGIN&&r<N&&c<N){pane.selected={r,c};draw(pane);}pane.drag=null;});
    canvas.addEventListener('pointercancel',()=>{pane.drag=null;});
    canvas.addEventListener('keydown',e=>{const dirs={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]},d=dirs[e.key];if(!d)return;e.preventDefault();reveal(pane,Math.max(0,Math.min(N-1,pane.selected.r+d[0])),Math.max(0,Math.min(N-1,pane.selected.c+d[1])));});
  }
  document.getElementById('search').addEventListener('input',e=>{const query=e.target.value.toLocaleLowerCase(),matches=document.getElementById('matches');matches.replaceChildren();if(!query)return;const found=data.elements.filter(x=>x.label.toLocaleLowerCase().includes(query)||x.id.includes(query));const count=document.createElement('p');count.textContent=found.length+'件';matches.append(count);for(const element of found){const button=document.createElement('button');button.textContent=element.label+' · '+element.id;button.addEventListener('click',()=>{for(const pane of panes){const position=pane.order.indexOf(element.originalIndex);reveal(pane,position,position);}});matches.append(button);}});
  document.getElementById('zoom').addEventListener('input',e=>{zoom=Number(e.target.value);document.getElementById('zoom-value').textContent=zoom+'倍';for(const pane of panes){const maxPan=AREA*(zoom-1);pane.pan.x=Math.min(pane.pan.x,maxPan);pane.pan.y=Math.min(pane.pan.y,maxPan);}render();});
  document.getElementById('reset').addEventListener('click',()=>{zoom=1;document.getElementById('zoom').value='1';document.getElementById('zoom-value').textContent='1倍';panes.forEach(p=>{p.pan={x:0,y:0};});render();});
  function printImages(){for(const pane of panes){draw(pane,true);document.getElementById(pane.id+'-print').src=pane.canvas.toDataURL('image/png');draw(pane);}}
  printImages();window.addEventListener('beforeprint',printImages);window.addEventListener('resize',render);
})();
