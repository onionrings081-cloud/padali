/* pmap.js - a tiny OpenStreetMap viewer (no library needed).
   Shows map tiles from tile.openstreetmap.org, markers, a route line, drag to move, + / - to zoom, click to drop a pin.
   Needs internet to show the tiles. Markers and routes are still drawn without it. */
(()=>{
const T=256,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const proj=(lat,lng,z)=>{const s=T*2**z,sn=Math.sin(clamp(lat,-85,85)*Math.PI/180);return{x:(lng+180)/360*s,y:(.5-Math.log((1+sn)/(1-sn))/(4*Math.PI))*s}};
const unproj=(x,y,z)=>{const s=T*2**z,n=Math.PI-2*Math.PI*y/s;return{lat:180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n))),lng:x/s*360-180}};

class PMap{
  constructor(el,o={}){
    this.el=el;this.z=o.zoom||15;this.c={lat:o.lat??9.3356,lng:o.lng??125.9769};this.onClick=o.onClick||null;
    this.tiles=new Map();this.marks=[];this.lines={};
    el.classList.add('pm');
    el.innerHTML='<div class="pm-tiles"></div><svg class="pm-svg"></svg><div class="pm-marks"></div><div class="pm-ctl"><button type="button" data-z="1" aria-label="Zoom in">+</button><button type="button" data-z="-1" aria-label="Zoom out">&minus;</button></div><span class="pm-attr">&copy; OpenStreetMap contributors</span>';
    this.tl=el.querySelector('.pm-tiles');this.svg=el.querySelector('.pm-svg');this.ml=el.querySelector('.pm-marks');
    this.bind();this.render();
    if(window.ResizeObserver)new ResizeObserver(()=>this.render()).observe(el);
  }
  get size(){return{w:this.el.clientWidth||300,h:this.el.clientHeight||200}}
  toPx(lat,lng){const{w,h}=this.size,c=proj(this.c.lat,this.c.lng,this.z),p=proj(lat,lng,this.z);return{x:p.x-c.x+w/2,y:p.y-c.y+h/2}}
  toLL(px,py){const{w,h}=this.size,c=proj(this.c.lat,this.c.lng,this.z);return unproj(c.x+px-w/2,c.y+py-h/2,this.z)}
  setView(lat,lng,z){this.c={lat,lng};if(z)this.z=clamp(z,3,18);this.render()}
  zoom(d){this.z=clamp(this.z+d,3,18);this.render()}
  fit(pts,pad=40){                                         // zoom so that every point is visible
    if(!pts.length)return;const{w,h}=this.size;
    for(let z=17;z>=3;z--){
      const ps=pts.map(p=>proj(p.lat,p.lng,z)),x0=Math.min(...ps.map(p=>p.x)),x1=Math.max(...ps.map(p=>p.x)),y0=Math.min(...ps.map(p=>p.y)),y1=Math.max(...ps.map(p=>p.y));
      if((x1-x0<=w-2*pad&&y1-y0<=h-2*pad)||z===3){this.z=z;this.c=unproj((x0+x1)/2,(y0+y1)/2,z);break}}
    this.render()}
  addMarker(lat,lng,html,cls=''){
    const el=document.createElement('div');el.className='pm-mk '+cls;el.innerHTML=html;this.ml.appendChild(el);
    const m={lat,lng,el,set:(a,b)=>{m.lat=a;m.lng=b;this.draw()},remove:()=>{el.remove();this.marks=this.marks.filter(x=>x!==m)}};
    this.marks.push(m);this.draw();return m}
  setLine(id,pts,cls=''){this.lines[id]={pts,cls};this.draw()}
  render(){                                                // tiles
    const{w,h}=this.size,c=proj(this.c.lat,this.c.lng,this.z),tlx=c.x-w/2,tly=c.y-h/2,n=2**this.z,need=new Set();
    for(let y=Math.floor(tly/T);y<=Math.floor((tly+h)/T);y++){if(y<0||y>=n)continue;
      for(let x=Math.floor(tlx/T);x<=Math.floor((tlx+w)/T);x++){
        const xx=((x%n)+n)%n,key=this.z+'/'+x+'/'+y;need.add(key);let im=this.tiles.get(key);
        if(!im){im=new Image();im.className='pm-t';im.alt='';im.draggable=false;im.onerror=()=>im.style.visibility='hidden';
          im.src='https://tile.openstreetmap.org/'+this.z+'/'+xx+'/'+y+'.png';this.tl.appendChild(im);this.tiles.set(key,im)}
        im.style.transform='translate('+Math.round(x*T-tlx)+'px,'+Math.round(y*T-tly)+'px)'}}
    for(const[k,im]of this.tiles)if(!need.has(k)){im.remove();this.tiles.delete(k)}
    this.draw()}
  draw(){                                                  // markers + route lines
    const{w,h}=this.size;this.svg.setAttribute('viewBox','0 0 '+w+' '+h);
    this.svg.innerHTML=Object.values(this.lines).map(l=>'<polyline class="'+l.cls+'" points="'+l.pts.map(p=>{const q=this.toPx(p.lat,p.lng);return q.x.toFixed(1)+','+q.y.toFixed(1)}).join(' ')+'"/>').join('');
    this.marks.forEach(m=>{const q=this.toPx(m.lat,m.lng);m.el.style.transform='translate('+q.x.toFixed(1)+'px,'+q.y.toFixed(1)+'px)'})}
  bind(){
    const el=this.el;let d=null;
    el.addEventListener('pointerdown',e=>{if(e.target.closest('.pm-ctl'))return;d={x:e.clientX,y:e.clientY,moved:0};try{el.setPointerCapture(e.pointerId)}catch(_){}});
    el.addEventListener('pointermove',e=>{if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;d.moved+=Math.abs(dx)+Math.abs(dy);
      if(d.moved>4){const c=proj(this.c.lat,this.c.lng,this.z);this.c=unproj(c.x-dx,c.y-dy,this.z);this.render();el.classList.add('moving')}});
    el.addEventListener('pointerup',e=>{if(!d)return;const was=d;d=null;el.classList.remove('moving');
      if(was.moved<=4&&this.onClick&&!e.target.closest('.pm-ctl')){const r=el.getBoundingClientRect();this.onClick(this.toLL(e.clientX-r.left,e.clientY-r.top))}});
    el.addEventListener('wheel',e=>{if(!this.onClick&&!el.classList.contains('pm-zoomable'))return;e.preventDefault();this.zoom(e.deltaY<0?1:-1)},{passive:false});
    el.querySelector('.pm-ctl').addEventListener('click',e=>{const b=e.target.closest('button');if(b)this.zoom(+b.dataset.z)});
  }
}
window.PMap=PMap;
})();
