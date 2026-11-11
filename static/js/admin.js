/* admin.js - shared by every /admin page: admin guard, logout, small helpers. */
const TZ=new Date().getTimezoneOffset();   // minutes; lets the server work out "today" for the admin's clock
const stLabel=o=>({'-1':'Cancelled',0:'Preparing',1:o.otype==='Delivery'?'Out for delivery':o.otype==='Dine-in'?'Being served':'Ready for pickup',2:'Completed'})[o.status];
const stPill=o=>`<span class="pill-st s${o.status<0?'x':o.status}">${stLabel(o)}</span>`;
const when=iso=>new Date(iso).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const itemsText=o=>o.items.map(l=>`${l.q}× ${esc(l.n)}${l.s?` <small>${esc(l.s)}${l.cu?' · special request':''}</small>`:''}`).join('<br>');

const adminReady=(async()=>{
  const r=await api('/api/me');
  if(!r.ok||r.user.role!=='admin'){location.href='/login';return new Promise(()=>{})}
  return r.user})();

$('#logout').onclick=async()=>{await api('/api/logout',{});location.href='/login'};

/* auto-refresh: runs fn every `ms` while the tab is visible; shows the last refresh time in the header */
function poll(fn,ms){setInterval(()=>{if(!document.hidden)fn()},ms)}
function stamp(){const e=$('#live');if(e)e.textContent='Live · '+new Date().toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',second:'2-digit'})}

const avt=(n,av)=>`<span class="avt">${av?`<img src="${esc(av)}" alt="">`:esc((n||'?').trim()[0].toUpperCase())}</span>`;
/* dish icon (same mapping as the customer app) */
const BYNAME={'Chicken Adobo Rice':'drumstick','Sinigang na Baboy':'soup','Pork Sisig':'beef','Beef Tapa Silog':'egg-fried','Pancit Canton':'utensils-crossed','Lumpiang Shanghai':'cookie','Turon':'banana','Iced Coffee':'coffee','Calamansi Juice':'citrus','Mango Shake':'cup-soda','Halo-halo':'ice-cream-bowl','Leche Flan':'cake-slice'},BYCAT={Meals:'utensils',Snacks:'cookie',Drinks:'cup-soda',Desserts:'cake-slice'};
const dish=i=>ic(i.e||BYNAME[i.n]||BYCAT[i.c]||'utensils');
const pic=i=>i.img?`<img class="ph" src="${esc(i.img)}" alt="" loading="lazy" onerror="this.remove()">`:'';
