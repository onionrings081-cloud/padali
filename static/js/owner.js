/* owner.js - shared by every /owner page: store owner guard, logout, small helpers. */
const TZ=new Date().getTimezoneOffset();   // minutes; lets the server work out "today" for the owner's clock
const stLabel=o=>({'-1':'Cancelled',0:'Preparing',1:o.otype==='Dine-in'?'Being served':'Out for delivery',2:'Completed'})[o.status];
const stPill=o=>`<span class="pill-st s${o.status<0?'x':o.status}">${stLabel(o)}</span>`;
const when=iso=>new Date(iso).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const dt=iso=>new Date(iso).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});

const adminReady=(async()=>{                      // same name as on the admin pages, so every page script waits the same way
  const r=await api('/api/me');
  if(!r.ok||r.user.role!=='owner'){location.href=r.ok&&r.user.role==='admin'?'/admin':r.ok?'/sell':'/login';return new Promise(()=>{})}
  const a=$('#avatar');if(a)a.innerHTML=r.user.av?`<img src="${esc(r.user.av)}" alt="">`:esc(r.user.name.trim()[0].toUpperCase());
  return r.user})();

$('#logout').onclick=async()=>{await api('/api/logout',{});location.href='/login'};

/* auto-refresh: runs fn every `ms` while the tab is visible; shows the last refresh time in the header */
function poll(fn,ms){setInterval(()=>{if(!document.hidden)fn()},ms)}
function stamp(){const e=$('#live');if(e)e.textContent='Live · '+new Date().toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',second:'2-digit'})}

const avt=(n,av)=>`<span class="avt">${av?`<img src="${esc(av)}" alt="">`:esc((n||'?').trim()[0].toUpperCase())}</span>`;
const BYCAT={Meals:'utensils',Snacks:'cookie',Drinks:'cup-soda',Desserts:'cake-slice'};
const dish=i=>ic(i.e||BYCAT[i.c]||'utensils');
const pic=i=>i.img?`<img class="ph" src="${esc(i.img)}" alt="" loading="lazy" onerror="this.remove()">`:'';
