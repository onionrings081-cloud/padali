/* rider_shell.js - shared by every /rider page: rider guard, logout, small helpers (same names as owner.js / admin.js, so page scripts wait the same way). */
const TZ=new Date().getTimezoneOffset();   // minutes; lets the server work out "today" for the rider's clock
const when=iso=>new Date(iso).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const SPEED={fast:'Faster than expected',ontime:'On time',late:'Took a while'};
const toJpeg=file=>new Promise((ok,no)=>{const url=URL.createObjectURL(file),im=new Image();      // square 320 px JPEG (about 30 KB), same as profile photos
  im.onload=()=>{const s=Math.min(im.width,im.height),c=document.createElement('canvas');c.width=c.height=320;
    c.getContext('2d').drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,320,320);URL.revokeObjectURL(url);ok(c.toDataURL('image/jpeg',.86))};
  im.onerror=()=>{URL.revokeObjectURL(url);no()};im.src=url});
const paintAvatar=u=>{const a=$('#avatar');if(a)a.innerHTML=u.av?`<img src="${esc(u.av)}" alt="">`:esc(u.name.trim()[0].toUpperCase())};
const adminReady=(async()=>{
  const r=await api('/api/me');
  if(!r.ok||r.user.role!=='rider'){location.href=!r.ok?'/login':r.user.role==='admin'?'/admin':r.user.role==='owner'?'/owner':'/app';return new Promise(()=>{})}
  paintAvatar(r.user);return r.user})();
$('#logout').onclick=async()=>{await api('/api/logout',{});location.href='/login'};
function poll(fn,ms){setInterval(()=>{if(!document.hidden)fn()},ms)}
function stamp(){const e=$('#live');if(e)e.textContent='Live · '+new Date().toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',second:'2-digit'})}
