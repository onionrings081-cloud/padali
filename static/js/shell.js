/* shell.js - shared by every logged-in page: user, menu, cart drawer, favorites, logout.
   Page scripts wait for `ready` before drawing. */
const BYNAME={'Chicken Adobo Rice':'drumstick','Sinigang na Baboy':'soup','Pork Sisig':'beef','Beef Tapa Silog':'egg-fried','Pancit Canton':'utensils-crossed','Lumpiang Shanghai':'cookie','Turon':'banana','Iced Coffee':'coffee','Calamansi Juice':'citrus','Mango Shake':'cup-soda','Halo-halo':'ice-cream-bowl','Leche Flan':'cake-slice'},BYCAT={Meals:'utensils',Snacks:'cookie',Drinks:'cup-soda',Desserts:'cake-slice'};
const dish=i=>ic(i.e||BYNAME[i.n]||BYCAT[i.c]||'utensils');
/* real photo laid over the icon; if the photo is missing or fails to load it removes itself and the icon shows */
const pic=i=>i.img?`<img class="ph" src="${esc(i.img)}" alt="${esc(i.n)}" loading="lazy" onerror="this.remove()">`:'';
let MENU=[],STORES=[],AREA='',CENTER={lat:9.3356,lng:125.9769},RADIUS=15,user=null,cart=LS.get('oms_cart',{}),ccart=LS.get('oms_custom',[]),favs=new Set(),OD={};
const storeOf=id=>STORES.find(s=>s.id==id)||{n:''};
const stars=(r,n)=>r?`<span class="stars">${ic('star')} ${Number(r).toFixed(1)} <small>(${n})</small></span>`:`<span class="tag am">${ic('star')} New</span>`;
const mins=s=>parseInt((s.eta||'').match(/\d+/)?.[0]||99,10);          // first number in "20-30 min", used to sort by fastest
const ago=iso=>{const m=Math.max(0,Math.round((Date.now()-new Date(iso))/60000));return m<1?'just now':m<60?m+' min ago':m<2880?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago'};
/* cart = dishes picked from stores ({dishId:qty}); ccart = "other order" lines the customer typed in [{k,n,s,q,p,no}] */
const lines=()=>Object.entries(cart).map(([id,n])=>{const m=MENU.find(m=>m.id==id);return m&&{...m,q:n,sn:storeOf(m.s).n}}).filter(Boolean);
const clines=()=>ccart.map(c=>({...c,sn:c.s||'Special request',custom:1}));
const sub=()=>lines().reduce((s,l)=>s+l.p*l.q,0)+ccart.reduce((s,c)=>s+c.p*c.q,0);
const count=()=>Object.values(cart).reduce((a,b)=>a+b,0)+ccart.reduce((a,c)=>a+c.q,0);
const storeCount=()=>new Set([...lines(),...clines()].map(l=>l.sn)).size;
const byStore=L=>{const g={};L.forEach(l=>(g[l.sn]=g[l.sn]||[]).push(l));return Object.entries(g)};
function addCustom(c){const k='c'+Date.now()+Math.random().toString(36).slice(2,6);ccart.push({k,...c});saveCart()}
function saveCart(){LS.set('oms_cart',cart);LS.set('oms_custom',ccart);if(MENU.length){refreshBuy();refreshBar()}const b=$('#badge');b.textContent=count();b.hidden=!count();}

/* profile picture (from the gallery) or the first letter of the name */
const paintAvatar=()=>{const a=$('#avatar');if(a)a.innerHTML=user.av?`<img src="${esc(user.av)}" alt="">`:esc(user.name.trim()[0].toUpperCase())};
const avt=(n,av)=>`<span class="avt">${av?`<img src="${esc(av)}" alt="">`:esc((n||'?').trim()[0].toUpperCase())}</span>`;
const SPEED={fast:'Faster than expected',ontime:'On time',late:'Took a while'};
/* one comment (store, food or delivery time) */
const revItem=(v,tag)=>`<div class="rev"><header><span class="who">${avt(v.name,v.av)}<span><b>${esc(v.name)}</b><small>${ago(v.d)}</small></span></span><span class="stars">${ic('star')} ${v.rating}</span></header>${tag?`<p class="rtag">${tag}</p>`:''}<p>${esc(v.comment||'No comment.')}</p>${v.reply?`<p class="reply">${ic('corner-down-right')} <b>Padali:</b> ${esc(v.reply)}</p>`:''}</div>`;
/* pop-up window (no animation) */
const openModal=h=>{$('#mbody').innerHTML=h;$('#modal').hidden=false};
const closeModal=()=>{$('#modal').hidden=true};
document.addEventListener('click',e=>{if(e.target.closest('[data-mclose]'))closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
async function showDish(id){const m=MENU.find(x=>x.id==id);if(!m)return;
  openModal(`<h3>${esc(m.n)}</h3><p class="meta">Loading comments…</p>`);
  const r=await api('/api/dishes/reviews?name='+encodeURIComponent(m.n)+'&store='+m.s);
  openModal(`<h3>${esc(m.n)}</h3><p class="meta">${ic('store')} ${esc(storeOf(m.s).n)} · food comments only (not the store, not the delivery)</p><div class="sumline">${stars(r.avg,r.n)}</div>
   <div class="revs one">${(r.reviews||[]).map(v=>revItem(v)).join('')||`<div class="empty">No comments on this dish yet. Order it and be the first.</div>`}</div>`)}

/* boot: must be logged in, then load menu + favorites */
const ready=(async()=>{
  const me=await api('/api/me');
  if(!me.ok){location.href='/login';return new Promise(()=>{})}
  user=me.user;
  MENU=(await api('/api/menu')).items||[];
  const st=await api('/api/stores');STORES=st.stores||[];AREA=st.area||'';CENTER=st.center||CENTER;RADIUS=st.radius||RADIUS;
  Object.keys(cart).forEach(id=>{if(!MENU.find(m=>m.id==id))delete cart[id]});   // dish switched off or removed
  favs=new Set((await api('/api/favorites')).ids||[]);
  paintAvatar();
  saveCart();refreshBar();return true})();

$('#logout').onclick=async()=>{await api('/api/logout',{});cart={};ccart=[];saveCart();location.href='/login'};

/* cart drawer */
const cline=l=>`<div class="line"><div class="em">${l.custom?ic('pencil'):dish(l)+pic(l)}</div><div><b>${esc(l.n)}</b><small>${peso(l.p)}${l.custom?' (estimate)':''}</small>${l.no?`<small>${esc(l.no)}</small>`:''}<div class="qty"><button data-q="${l.custom?l.k:l.id}" data-d="-1" data-cu="${l.custom||''}" aria-label="Decrease">${ic('minus')}</button><span>${l.q}</span><button data-q="${l.custom?l.k:l.id}" data-d="1" data-cu="${l.custom||''}" aria-label="Increase">${ic('plus')}</button></div></div><div class="rt"><b>${peso(l.p*l.q)}</b><button class="link" data-rm="${l.custom?l.k:l.id}" data-cu="${l.custom||''}">Remove</button></div></div>`;
function rCart(){const L=[...lines(),...clines()];
  $('#cartBody').innerHTML=L.length?byStore(L).map(([s,ls])=>`<h4 class="grp">${ic('store')} ${esc(s)}</h4>${ls.map(cline).join('')}`).join(''):`<div class="empty">Your cart is empty.<br>Add something tasty from the stores.</div>`;
  $('#cartTotal').textContent=peso(sub());$('#cartGo').disabled=!L.length;
  const h=$('#cartHint'),s=sub();h.hidden=!s;if(s)h.innerHTML=s<300?`${ic('tag')} Add <b>${peso(300-s)}</b> more to use <b>SAVE50</b> (₱50 off)`:`${ic('tag')} You can use <b>SAVE50</b> at checkout`}
const openCart=o=>{$('#drawer').classList.toggle('open',o);if(o)rCart()};
function cartChanged(){saveCart();rCart();window.onCartChange&&window.onCartChange()}

/* shared card builders (menu, favorites, home, orders, receipt) */
function card(i,n){return `<article class="item" style="--i:${n}"><div class="thumb ${i.c}">${dish(i)}${pic(i)}<button class="heart${favs.has(i.id)?' on':''}" data-fav="${i.id}" aria-label="Favorite">${ic('heart')}</button></div><div class="info"><h3>${i.n}</h3><button class="rvl" data-dr="${i.id}">${i.fc?`${ic('star')} ${Number(i.fr).toFixed(1)} <small>(${i.fc}) · read comments</small>`:'<small>No comments yet</small>'}</button><p class="from">${ic('store')} ${esc(storeOf(i.s).n)}</p><p>${i.d}</p></div><div class="buy"><b class="price">${peso(i.p)}</b><span class="act" data-buy="${i.id}">${buy(i)}</span></div></article>`}
/* Add button turns into a - 1 + stepper once the dish is in the cart */
const buy=i=>storeOf(i.s).open===0?`<button class="btn sm" disabled>Closed</button>`:cart[i.id]?`<span class="qty step"><button data-q="${i.id}" data-d="-1" aria-label="Less">${ic('minus')}</button><span>${cart[i.id]}</span><button data-q="${i.id}" data-d="1" aria-label="More">${ic('plus')}</button></span>`:`<button class="btn sm add" data-add="${i.id}">Add</button>`;
function refreshBuy(){$$('[data-buy]').forEach(e=>{const i=MENU.find(m=>m.id==e.dataset.buy);if(i)e.innerHTML=buy(i)})}
/* floating cart bar (shows whenever the cart has something, except on checkout / receipt) */
function refreshBar(){let b=$('#cartbar');if(!b){b=document.createElement('button');b.id='cartbar';b.className='cartbar';b.dataset.cart='';document.body.appendChild(b)}
  const n=count(),hide=!n||['/checkout','/receipt'].includes(location.pathname);b.hidden=hide;if(hide)return;
  b.innerHTML=`<span class="cb-n">${ic('shopping-cart')} ${n} item${n>1?'s':''} · ${storeCount()} store${storeCount()>1?'s':''}</span><b>${peso(sub())}</b><span class="cb-go">View cart ${ic('arrow-right')}</span>`}
const STEP=o=>[o.sched&&Date.now()<new Date(o.sched)?'Scheduled':'Preparing',o.otype==='Delivery'?'Out for delivery':o.otype==='Dine-in'?'Being served':'Ready for pickup','Completed'];
const track=o=>o.status<0?`<div class="msg err">This order was cancelled.</div>`:`<div class="track">${STEP(o).map((l,i)=>`<div class="tk${i<=o.status?' on':''}${i===o.status&&o.status<2?' cur':''}"><i></i><span>${l}</span></div>`).join('')}</div>`;
const breakdown=o=>`${o.items.map(l=>`<div class="rl"><span>${l.q} × ${esc(l.n)}${l.s?` <small class="from-s">· ${esc(l.s)}${l.cu?' (special request)':''}</small>`:''}</span><span>${peso(l.p*l.q)}</span></div>`).join('')}<div class="rl"><span>Subtotal</span><span>${peso(o.sub)}</span></div>${o.discount?`<div class="rl ok"><span>Promo ${esc(o.promo||'')}</span><span>−${peso(o.discount)}</span></div>`:''}${o.fee?`<div class="rl"><span>Delivery fee</span><span>${peso(o.fee)}</span></div>`:''}${o.tip?`<div class="rl"><span>Rider tip</span><span>${peso(o.tip)}</span></div>`:''}${o.pts?`<div class="rl ok"><span>Rewards points (${o.pts} pts)</span><span>−${peso(o.pts/10)}</span></div>`:''}<div class="sum"><span>Total paid</span><b>${peso(o.total)}</b></div>${o.earn?`<p class="meta">${ic('star')} You earned ${o.earn} reward points from this order.</p>`:''}${o.items.some(l=>l.cu)?`<p class="meta">Special requests are charged at your estimated price. The rider confirms the actual price with you.</p>`:''}`;
function orderCard(o,n){OD[o.id]=o;return `<div class="card order" style="--i:${n||0}"><header><span>${o.id}</span><span>${peso(o.total)}</span></header><p class="meta">${new Date(o.date).toLocaleString('en-PH')} · ${o.otype} · ${payText(o.method)}</p>${o.sched?`<p class="meta">${ic('clock')} Scheduled for ${new Date(o.sched).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'})}</p>`:''}${track(o)}${o.status<2&&!o.noMap?trackCard(o):''}<p>${o.items.map(l=>l.q+' × '+esc(l.n)).join(', ')}</p>${retBox(o)}<div class="rates" data-oid="${o.id}">${rateBoxes(o)}</div><div class="oact"><button class="btn ghost sm" data-re="${o.id}">${ic('repeat')} Order again</button>${canReturn(o)?`<button class="btn ghost sm" data-ret="${o.id}">${ic('corner-down-right')} Return / Refund</button>`:''}${o.status===0?`<button class="btn ghost sm danger" data-cancel="${o.id}">${ic('x')} Cancel order</button>`:''}</div></div>`}
/* return / refund: a completed order can be returned or refunded within 7 days of ordering */
const RET_REASONS=['Wrong item received','Missing item','Item is damaged or spilled','Food quality problem','Order arrived too late','Other'],RET_DAYS=7;
const canReturn=o=>o.status===2&&!o.ret&&Date.now()-new Date(o.date)<RET_DAYS*864e5;
const RET_ST={requested:['Waiting for review','am'],approved:['Approved','ok'],refunded:['Refunded','ok'],rejected:['Not approved','er']};
function retBox(o){const r=o.ret;if(!r)return '';const [lbl,tone]=RET_ST[r.status]||[r.status,''];
  const msg={requested:'Padali is reviewing your request. We will update this page.',
    approved:r.kind==='Return and refund'?'Approved. Give the items back to the rider or store, then your refund is sent.':'Approved. Your refund is being processed.',
    refunded:`${peso(r.amount)} was sent back to your ${payText(r.to)}.`,rejected:'Sorry, we could not approve this request.'}[r.status];
  return `<div class="retbox"><div class="rb-h"><b>${ic('corner-down-right')} ${esc(r.kind)}</b><span class="pill-st ${tone==='ok'?'s2':tone==='am'?'s1':'sx'}">${lbl}</span></div>
   <p>${msg}</p><p class="meta">Reason: ${esc(r.reason)}${r.detail?' · “'+esc(r.detail)+'”':''}</p>${r.note?`<p class="meta">Padali: ${esc(r.note)}</p>`:''}
   <div class="rsteps">${[['requested','Requested'],['approved','Approved'],['refunded','Refunded']].map(([k,l],i)=>{const at=['requested','approved','refunded'].indexOf(r.status===('rejected')?'requested':r.status);return `<span class="${i<=at?'on':''}">${l}</span>`}).join('')}</div></div>`}
function openReturn(o){if(!o)return;
  openModal(`<h3>Return / Refund</h3><p class="meta">${o.id} · ${peso(o.total)} · paid with ${payText(o.method)}</p>
   <form id="retForm" class="form" data-oid="${o.id}">
    <p class="lbl2">What do you need?</p>
    <label class="radio"><input type="radio" name="kind" value="Refund only" checked><span><b>Refund only</b><small>Keep the order, get your money back (missing item, spilled, late…)</small></span></label>
    <label class="radio"><input type="radio" name="kind" value="Return and refund"><span><b>Return and refund</b><small>Give the items back, then get your money back</small></span></label>
    <label>Reason<select name="reason">${RET_REASONS.map(r=>`<option>${r}</option>`).join('')}</select></label>
    <label>Tell us more (optional, required for “Other”)<textarea name="detail" rows="3" maxlength="300" placeholder="Example: kulang ng isang order ng fries"></textarea></label>
    <p class="meta refund-to">Refund of <b>${peso(o.total)}</b> goes back to your ${payText(o.method)}.</p>
    <div class="msg err" id="retMsg" hidden></div><button class="btn block lg">Send request</button></form>`)}
document.addEventListener('submit',async e=>{const f=e.target.closest('#retForm');if(!f)return;e.preventDefault();
  const r=await api('/api/orders/'+f.dataset.oid+'/return',{kind:f.kind.value,reason:f.reason.value,detail:f.detail.value});
  if(!r.ok)return showMsg('#retMsg',r.error||'Could not send your request.');
  closeModal();toast('Request sent. We will review it soon.');setTimeout(()=>location.reload(),700)});
/* live delivery map: a pretend rider moves from the store to the customer along a route */
const ROUTE=[[50,168],[50,70],[250,70],[250,140],[545,140]];
function pointAt(t){const len=[];let tot=0;for(let i=1;i<ROUTE.length;i++){const d=Math.hypot(ROUTE[i][0]-ROUTE[i-1][0],ROUTE[i][1]-ROUTE[i-1][1]);len.push(d);tot+=d}
  let r=t*tot;for(let i=0;i<len.length;i++){if(r<=len[i]||i===len.length-1){const k=Math.min(1,r/len[i]),a=ROUTE[i],b=ROUTE[i+1];return{x:a[0]+(b[0]-a[0])*k,y:a[1]+(b[1]-a[1])*k,seg:i}}r-=len[i]}}
/* status seen by the customer right now: the saved status, or the demo timeline (2 min preparing, 3 min on the way) if that is further along */
const effS=o=>{if(o.status<0||o.status>=2)return o.status;const m=(Date.now()-new Date(o.start))/60000;return Math.max(o.status,m<2?0:m<5?1:2)};
const progress=o=>{const s=effS(o);if(s<=0)return 0;if(s>=2)return 1;const m=(Date.now()-new Date(o.start))/60000;return Math.min(.92,Math.max(.1,(m-2)/3))};
function trackSvg(o){if(o.otype!=='Delivery'||o.status<0||!o.rider)return '';
  const p=progress(o),pt=pointAt(p),m=(Date.now()-new Date(o.start))/60000,early=o.sched&&Date.now()<new Date(o.sched);
  const eta=o.status>=2?'Delivered':early?'Starts '+new Date(o.sched).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'}):o.status===0?'Preparing your food':`Arriving in about ${Math.max(1,Math.ceil(5-m))} min`;
  const done=[...ROUTE.slice(0,pt.seg+1),[pt.x,pt.y]].map(q=>q.join(',')).join(' '),all=ROUTE.map(q=>q.join(',')).join(' '),ico=(n,x,y,s)=>`<use href="/static/icons.svg#i-${n}" x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" class="mi"/>`;
  const R=o.rider,ini=R.n.split(' ').map(w=>w[0]).join('').slice(0,2);
  return `<div class="trk"><svg class="map" viewBox="0 0 600 210" role="img" aria-label="Rider location"><g class="grid">${[30,90,150,210].map(y=>`<line x1="0" y1="${y}" x2="600" y2="${y}"/>`).join('')}${[110,190,330,420,510].map(x=>`<line x1="${x}" y1="0" x2="${x}" y2="210"/>`).join('')}</g>
   <polyline class="road" points="${all}"/><polyline class="done" points="${done}"/>
   <g class="pin"><circle cx="${ROUTE[0][0]}" cy="${ROUTE[0][1]}" r="19"/>${ico('store',ROUTE[0][0],ROUTE[0][1],20)}<circle cx="${ROUTE[4][0]}" cy="${ROUTE[4][1]}" r="19"/>${ico('map-pin',ROUTE[4][0],ROUTE[4][1],20)}</g>
   ${o.status<2?`<g class="rider-dot"><circle cx="${pt.x}" cy="${pt.y}" r="21"/>${ico('bike',pt.x,pt.y,24)}</g>`:''}</svg>
   <div class="rider"><span class="av-r">${ini}</span><div><b>${esc(R.n)}</b><small>${esc(R.v)} · ${esc(R.p)} · ★ ${R.r.toFixed(1)}</small></div><span class="eta-pill">${eta}</span></div></div>`}

/* real map (OpenStreetMap) when the order has a pin, otherwise the simple drawn map above */
const TR={};
function trackCard(o){const h=trackSvg(o);if(!h||!(o.dest&&o.from&&window.PMap))return h;TR[o.id]=o;
  return h.replace(/<svg class="map"[\s\S]*?<\/svg>/,`<div class="pm-track" data-track="${o.id}"></div>`)}
const hav=(a,b)=>{const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return 12742*Math.asin(Math.sqrt(x))};   // km
function pointOn(pts,t){const seg=[];let tot=0;for(let i=1;i<pts.length;i++){const d=hav(pts[i-1],pts[i]);seg.push(d);tot+=d}
  let r=t*tot;for(let i=0;i<seg.length;i++){if(r<=seg[i]||i===seg.length-1){const k=seg[i]?Math.min(1,r/seg[i]):0,a=pts[i],b=pts[i+1];return{lat:a.lat+(b.lat-a.lat)*k,lng:a.lng+(b.lng-a.lng)*k}}r-=seg[i]}return pts[0]}
/* road route from the free OSRM service; if it can't be reached we use a straight line */
async function routeFor(a,b){const key='rt:'+[a.lat,a.lng,b.lat,b.lng].map(v=>v.toFixed(5)).join(',');
  try{const c=sessionStorage.getItem(key);if(c)return JSON.parse(c)}catch(e){}
  const line={pts:[a,b],km:hav(a,b),real:false};
  try{const j=await(await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`,{signal:AbortSignal.timeout(6000)})).json(),R=j.routes&&j.routes[0];
    if(R){const rt={pts:R.geometry.coordinates.map(([lng,lat])=>({lat,lng})),km:R.distance/1000,min:R.duration/60,real:true};try{sessionStorage.setItem(key,JSON.stringify(rt))}catch(e){}return rt}}catch(e){}
  return line}
function mountMaps(){$$('.pm-track:not([data-on])').forEach(async el=>{el.dataset.on=1;const o=TR[el.dataset.track];if(!o)return;
  const a=o.from,b=o.dest,m=new PMap(el,{lat:a.lat,lng:a.lng,zoom:15});
  m.addMarker(a.lat,a.lng,ic('store'),'pm-pin');m.addMarker(b.lat,b.lng,ic('map-pin'),'pm-pin home');m.fit([a,b],50);
  const rt=await routeFor(a,b);m.setLine('r',rt.pts,'pm-route');m.fit(rt.pts,50);
  const rd=m.addMarker(a.lat,a.lng,ic('bike'),'pm-rider'),upd=()=>{const p=pointOn(rt.pts,progress(o));rd.set(p.lat,p.lng)};upd();
  const t=setInterval(()=>{if(!document.body.contains(el))return clearInterval(t);upd()},4000)})}
new MutationObserver(mountMaps).observe(document.body,{childList:true,subtree:true});
/* rate an order after it is completed: THREE separate comments (delivery time, each dish, each store) */
function rateBoxes(o){if(o.status!==2)return '';
  const stores=[...new Set(o.items.filter(l=>!l.cu&&l.s).map(l=>l.s))].filter(x=>!(o.reviewed||[]).includes(x)),
    foods=o.items.filter(l=>!l.cu&&l.s&&!(o.rv_food||[]).includes(l.n+'||'+l.s)),del=o.otype==='Delivery'&&!o.rv_del;
  const pick=()=>`<div class="pick">${[1,2,3,4,5].map(n=>`<button type="button" class="sb" data-star="${n}" aria-label="${n} stars">${ic('star')}</button>`).join('')}</div>`;
  const box=(kind,label,attrs,ph,extra)=>`<div class="ratebox"><button type="button" class="btn ghost sm rbtn" data-rate>${ic('star')} ${label}</button><form class="rform" hidden data-kind="${kind}" data-r="0" ${attrs}>${extra||''}${pick()}<input name="c" maxlength="200" placeholder="${ph}" autocomplete="off"><button class="btn sm">Send</button></form></div>`;
  const sec=(t,h,body)=>body?`<div class="fbsec"><h4>${t}<small>${h}</small></h4>${body}</div>`:'';
  const html=sec('Delivery time','How fast did it arrive?',del?box('delivery','Rate the delivery','','Example: dumating bago mag-30 minutes',`<div class="speed">${Object.entries(SPEED).map(([k,l])=>`<button type="button" class="chip" data-speed="${k}">${l}</button>`).join('')}</div>`):'')
    +sec('The food','Taste, serving size, how it looked',foods.map(l=>box('food',esc(l.n),`data-name="${esc(l.n)}" data-store="${esc(l.s)}"`,'Example: malasa, sakto ang luto')).join(''))
    +sec('The store','Service, packaging, how it is run',stores.map(x=>box('store',esc(x),`data-store="${esc(x)}"`,'Example: maayos ang packaging')).join(''));
  return html?`<div class="fb"><p class="fb-t">${ic('message')} Rate this order · each part has its own comment</p>${html}</div>`:`<p class="meta done">${ic('check')} Thanks for rating this order.</p>`}
document.addEventListener('submit',async e=>{const f=e.target.closest('.rform');if(!f)return;e.preventDefault();
  const r=+f.dataset.r,host=f.closest('.rates'),o=OD[host.dataset.oid],k=f.dataset.kind;if(!r)return toast('Tap the stars first');
  let url='/api/reviews',body={order:o.id,rating:r,comment:f.c.value};
  if(k==='store')body.store=f.dataset.store;
  else if(k==='food'){url='/api/reviews/food';body.store=f.dataset.store;body.name=f.dataset.name}
  else{url='/api/reviews/delivery';body.speed=f.dataset.speed;if(!body.speed)return toast('Choose how the delivery time was')}
  const x=await api(url,body);if(!x.ok)return toast(x.error||'Could not save your rating');
  if(k==='store')(o.reviewed=o.reviewed||[]).push(f.dataset.store);else if(k==='food')(o.rv_food=o.rv_food||[]).push(f.dataset.name+'||'+f.dataset.store);else o.rv_del=true;
  host.innerHTML=rateBoxes(o);toast('Thanks for your comment!')});
function reorder(o){let miss=0;o.items.forEach(l=>{
    if(l.cu){addCustom({n:l.n,s:l.s==='Special request'?'':l.s,q:l.q,p:l.p,no:l.no||''});return}
    const m=MENU.find(x=>x.n===l.n&&(!l.s||storeOf(x.s).n===l.s))||MENU.find(x=>x.n===l.n);
    if(m)cart[m.id]=(cart[m.id]||0)+l.q;else miss++});
  saveCart();toast(miss?'Some items are no longer available':'Items added to your cart');openCart(true)}

/* store helpers shared by Overview and Menu */
const dishesOf=id=>MENU.filter(m=>m.s===id);
const coverOf=s=>s.img?{img:s.img,n:s.n}:dishesOf(s.id).find(m=>m.img);   // the store's own photo first, else a dish photo
const isOpen=s=>s.open!==0;
const badge=s=>`<span class="bdg ${isOpen(s)?'open':'closed'}">${isOpen(s)?'Open':'Closed'}</span>`;
const storeCard=s=>{const L=dishesOf(s.id),c=coverOf(s);
  return `<button class="store${isOpen(s)?'':' closed'}" data-store="${s.id}"><span class="cover">${badge(s)}${ic('store')}${c?pic(c):''}</span><span class="srow"><span class="nm">${esc(s.n)}</span>${stars(s.rating,s.rc)}</span><span class="sub">${esc(s.cu)}</span><span class="eta">${ic('clock')} ${esc(s.eta)} · ${L.length} dishes</span></button>`};

/* global clicks: cart, favorites, reorder, rating */
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
  if('cart' in d)openCart(true);
  else if('close' in d)openCart(false);
  else if('checkout' in d)location.href='/checkout';
  else if(d.add){cart[d.add]=(cart[d.add]||0)+1;saveCart()}
  else if(d.q&&d.cu){const c=ccart.find(x=>x.k===d.q),n=c.q+ +d.d;if(n<1)ccart=ccart.filter(x=>x!==c);else if(n<=20)c.q=n;cartChanged()}
  else if(d.q){const n=(cart[d.q]||0)+ +d.d;if(n<1)delete cart[d.q];else cart[d.q]=n;cartChanged()}
  else if(d.rm&&d.cu){ccart=ccart.filter(x=>x.k!==d.rm);cartChanged()}
  else if(d.rm){delete cart[d.rm];cartChanged()}
  else if(d.fav){const r=await api('/api/favorites/'+d.fav,{});favs=new Set(r.ids||[]);$$(`[data-fav="${d.fav}"]`).forEach(h=>h.classList.toggle('on',favs.has(+d.fav)));window.onFavChange&&window.onFavChange()}
  else if(d.re)reorder(OD[d.re]);
  else if(d.cancel){if(confirm('Cancel '+d.cancel+'? Any reward points you used will be returned.'))api('/api/orders/'+d.cancel+'/cancel',{}).then(r=>{toast(r.ok?'Order cancelled':r.error||'Could not cancel');if(r.ok)setTimeout(()=>location.reload(),700)})}
  else if(d.ret)openReturn(OD[d.ret])
  else if(d.dr)showDish(d.dr)
  else if(d.speed){const f=t.closest('.rform');f.dataset.speed=d.speed;$$('[data-speed]',f).forEach(b=>b.classList.toggle('on',b===t))}
  else if('rate' in d){const f=t.nextElementSibling;f.hidden=!f.hidden}
  else if(d.star){const f=t.closest('.rform');f.dataset.r=d.star;$$('.sb',f).forEach(b=>b.classList.toggle('on',+b.dataset.star<=+d.star))}});
