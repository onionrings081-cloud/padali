const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
const peso=n=>'₱'+Number(n).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const ic=n=>`<svg class="i" aria-hidden="true"><use href="/static/icons.svg#i-${n}"/></svg>`;
const BYNAME={'Chicken Adobo Rice':'drumstick','Sinigang na Baboy':'soup','Pork Sisig':'beef','Beef Tapa Silog':'egg-fried','Pancit Canton':'utensils-crossed','Lumpiang Shanghai':'cookie','Turon':'banana','Iced Coffee':'coffee','Calamansi Juice':'citrus','Mango Shake':'cup-soda','Halo-halo':'ice-cream-bowl','Leche Flan':'cake-slice'},BYCAT={Meals:'utensils',Snacks:'cookie',Drinks:'cup-soda',Desserts:'cake-slice'};
const dish=i=>ic(BYNAME[i.n]||BYCAT[i.c]||'utensils');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let MENU=[],user=null,cart=LS.get('oms_cart',{}),favs=new Set(),cat='All',q='',method='Cash',otype='Pickup',promo={code:'',discount:0},view='home',OD={};
const FEE={'Dine-in':0,Pickup:0,Delivery:49},TITLE={home:'Overview',menu:'Menu',favs:'Favorites',orders:'My orders',profile:'Profile',checkout:'Checkout',receipt:'Order placed'};
const lines=()=>Object.entries(cart).map(([id,n])=>({...MENU.find(m=>m.id==id),q:n})).filter(l=>l.n);
const sub=()=>lines().reduce((s,l)=>s+l.p*l.q,0),count=()=>Object.values(cart).reduce((a,b)=>a+b,0);
function saveCart(){LS.set('oms_cart',cart);const b=$('#badge');b.textContent=count();b.hidden=!count();b.classList.remove('bump');void b.offsetWidth;b.classList.add('bump')}
const api=async(url,body,m)=>{const r=await fetch(url,{method:m||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});let j={};try{j=await r.json()}catch{}return{ok:r.ok,...j}};
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;e.style.animation='none';void e.offsetWidth;e.style.animation='';clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,2600)}
function showMsg(id,t,ok){const e=$(id);e.textContent=t;e.hidden=!t;e.className='msg '+(ok?'ok':'err')}

/* auth */
function tab(n){$$('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===n));$('#loginForm').hidden=n!=='login';$('#regForm').hidden=n!=='register';$('#loginForm').reset();$('#regForm').reset();showMsg('#loginMsg','');showMsg('#regMsg','')}
$('#regForm').onsubmit=async e=>{e.preventDefault();const r=await api('/api/register',Object.fromEntries(new FormData(e.target)));
  if(!r.ok)return showMsg('#regMsg',r.error||'Could not create the account.');
  e.target.reset();user=r.user;await boot();toast('Account created. Welcome, '+user.name.split(' ')[0]+'!')};
$('#loginForm').onsubmit=async e=>{e.preventDefault();const r=await api('/api/login',Object.fromEntries(new FormData(e.target)));
  if(!r.ok)return showMsg('#loginMsg',r.error||'Could not log in.');e.target.reset();user=r.user;boot()};
$('#logout').onclick=async()=>{await api('/api/logout',{});user=null;cart={};promo={code:'',discount:0};saveCart();boot()};
async function boot(){
  if(!MENU.length)MENU=(await api('/api/menu')).items||[];
  if(!user){const r=await api('/api/me');user=r.ok?r.user:null}
  $('#auth').hidden=!!user;$('#app').hidden=!user;
  if(user){favs=new Set((await api('/api/favorites')).ids||[]);$('#avatar').textContent=user.name.trim()[0].toUpperCase();saveCart();go('home')}}

/* navigation */
function go(v){view=v;$$('.view').forEach(e=>e.hidden=e.id!=='v-'+v);$$('.nv').forEach(b=>b.classList.toggle('on',b.dataset.view===v));$('#title').textContent=TITLE[v];
  ({home:rHome,menu:rMenu,favs:rFavs,orders:rOrders,profile:rProfile,checkout:rCheckout})[v]?.();scrollTo(0,0)}

/* home */
async function rHome(){
  const [s,o]=await Promise.all([api('/api/stats'),api('/api/orders')]);const O=(o.orders||[]).slice(0,2);
  $('#v-home').innerHTML=`<div class="card hero-card"><div><h2>Hi, ${esc(user.name.split(' ')[0])}</h2><p>What are you craving today?</p></div><button class="btn lg" data-view="menu">Order now</button></div>
  <div class="stats">${[['receipt-text',s.orders||0,'Orders placed'],['wallet',peso(s.spent||0),'Total spent'],['heart',favs.size,'Favorite dishes']].map(([i,v,l],n)=>`<div class="stat" style="animation:rise .5s ${n*80}ms both"><span class="ico">${ic(i)}</span><b>${v}</b><small>${l}</small></div>`).join('')}</div>
  <h3 class="sec">Recent orders</h3>${O.length?O.map(orderCard).join(''):`<div class="empty">No orders yet. Your first one is a tap away.</div>`}
  <h3 class="sec">Promo codes</h3><div class="promos"><div class="promo-card"><b>WELCOME10</b><span>10% off your order</span></div><div class="promo-card"><b>SAVE50</b><span>₱50 off orders of ₱300 or more</span></div></div>`}

/* menu + favorites */
function card(i,n){return `<article class="item" style="--i:${n}"><div class="thumb ${i.c}">${dish(i)}<button class="heart${favs.has(i.id)?' on':''}" data-fav="${i.id}" aria-label="Favorite">${ic('heart')}</button></div><div class="info"><h3>${i.n}</h3><p>${i.d}</p></div><div class="buy"><b>${peso(i.p)}</b><button class="btn sm" data-add="${i.id}">Add</button></div></article>`}
function rMenu(){const cats=['All',...new Set(MENU.map(i=>i.c))];
  $('#v-menu').innerHTML=`<div class="tools"><div class="search"><span class="s-ic">${ic('search')}</span><input id="q" placeholder="Search the menu" autocomplete="off" value="${esc(q)}"></div><div class="chips">${cats.map(c=>`<button class="chip${c===cat?' on':''}" data-cat="${c}">${c}</button>`).join('')}</div></div><div class="items" id="items"></div>`;
  $('#q').oninput=e=>{q=e.target.value;rItems()};rItems()}
function rItems(){const t=q.trim().toLowerCase(),L=MENU.filter(i=>(cat==='All'||i.c===cat)&&(!t||(i.n+i.d).toLowerCase().includes(t)));$('#items').innerHTML=L.length?L.map(card).join(''):`<div class="empty">No dishes match your search.</div>`}
function rFavs(){const L=MENU.filter(i=>favs.has(i.id));$('#v-favs').innerHTML=`<div class="items">${L.length?L.map(card).join(''):`<div class="empty">No favorites yet. Tap the heart on any dish to save it here.</div>`}</div>`}

/* cart drawer */
function rCart(){const L=lines();
  $('#cartBody').innerHTML=L.length?L.map(l=>`<div class="line"><div class="em">${dish(l)}</div><div><b>${l.n}</b><small>${peso(l.p)}</small><div class="qty"><button data-q="${l.id}" data-d="-1" aria-label="Decrease">${ic('minus')}</button><span>${l.q}</span><button data-q="${l.id}" data-d="1" aria-label="Increase">${ic('plus')}</button></div></div><div class="rt"><b>${peso(l.p*l.q)}</b><button class="link" data-rm="${l.id}">Remove</button></div></div>`).join(''):`<div class="empty">Your cart is empty.<br>Add something tasty from the menu.</div>`;
  $('#cartTotal').textContent=peso(sub());$('#cartGo').disabled=!L.length}
const openCart=o=>{$('#drawer').classList.toggle('open',o);if(o)rCart()};
function cartChanged(){saveCart();rCart();if(view==='checkout')rCheckout()}

/* checkout */
const totals=()=>{const s=sub(),d=promo.discount||0,f=FEE[otype];return{s,d,f,t:Math.max(0,s-d)+f}};
function payFields(){
  if(method==='Cash')return`<label>Cash on hand (₱)<input name="cash" type="number" min="0" step="0.01" required autocomplete="off"></label>`;
  if(method==='Card')return`<label>Name on card<input name="cn" required autocomplete="off"></label><label>Card number<input name="num" inputmode="numeric" placeholder="16 digits" required autocomplete="off"></label><div class="row2"><label>Expiry<input name="exp" placeholder="MM/YY" required autocomplete="off"></label><label>CVV<input name="cvv" inputmode="numeric" maxlength="3" required autocomplete="off"></label></div>`;
  return`<label>E-wallet<select name="w"><option>GCash</option><option>Maya</option><option>ShopeePay</option></select></label><label>Mobile number<input name="mob" inputmode="tel" placeholder="09XXXXXXXXX" required autocomplete="off"></label>`}
function rSum(){const T=totals();$('#sum').innerHTML=`<h3>Order summary</h3>${lines().map(l=>`<div class="rl"><span>${l.q} × ${l.n}</span><span>${peso(l.p*l.q)}</span></div>`).join('')}<div class="rl"><span>Subtotal</span><span>${peso(T.s)}</span></div>${T.d?`<div class="rl ok"><span>Promo ${esc(promo.code)}</span><span>−${peso(T.d)}</span></div>`:''}${T.f?`<div class="rl"><span>Delivery fee</span><span>${peso(T.f)}</span></div>`:''}<div class="sum"><span>Total</span><b>${peso(T.t)}</b></div>`;const b=$('#payBtn');if(b)b.textContent='Pay '+peso(T.t)}
function rCheckout(){if(!lines().length)return go('menu');
  $('#v-checkout').innerHTML=`<div class="co"><div class="card panel"><p class="step">1. How do you want your order?</p>
  <div class="methods">${Object.keys(FEE).map(m=>`<button class="method${m===otype?' on':''}" data-ot="${m}">${m}${FEE[m]?`<small>+${peso(FEE[m])}</small>`:'<small>Free</small>'}</button>`).join('')}</div>
  <p class="step">2. Promo code</p><div class="promo-row"><input id="pcode" placeholder="Enter a code" value="${esc(promo.code)}" autocomplete="off"><button class="btn ghost" type="button" data-promo>Apply</button></div><div class="msg" id="promoMsg" hidden></div>
  <p class="step">3. Payment method</p><div class="methods">${['Cash','Card','E-Wallet'].map(m=>`<button class="method${m===method?' on':''}" data-m="${m}">${m}</button>`).join('')}</div>
  <form id="payForm" class="form">${payFields()}<label class="check"><input type="checkbox" name="notify" checked> Send order confirmation to ${esc(user.email)}</label><div class="msg err" id="payMsg" hidden></div><button class="btn block lg" id="payBtn"></button></form></div>
  <aside class="card cart-sum" id="sum"></aside></div>`;
  rSum();$('#payForm').onsubmit=pay}
async function pay(e){e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
  const r=await api('/api/orders',{items:Object.entries(cart).map(([id,n])=>({id:+id,q:n})),method,details:f,notify:!!f.notify,promo:promo.code,otype});
  if(!r.ok)return showMsg('#payMsg','Payment failed. '+(r.error||'Try again.')+' Review your details and try again.');
  cart={};promo={code:'',discount:0};saveCart();receipt(r.order)}
const STEP=o=>['Preparing',o.otype==='Delivery'?'Out for delivery':o.otype==='Dine-in'?'Being served':'Ready for pickup','Completed'];
const track=o=>`<div class="track">${STEP(o).map((l,i)=>`<div class="tk${i<=o.status?' on':''}${i===o.status&&o.status<2?' cur':''}"><i></i><span>${l}</span></div>`).join('')}</div>`;
const breakdown=o=>`${o.items.map(l=>`<div class="rl"><span>${l.q} × ${esc(l.n)}</span><span>${peso(l.p*l.q)}</span></div>`).join('')}<div class="rl"><span>Subtotal</span><span>${peso(o.sub)}</span></div>${o.discount?`<div class="rl ok"><span>Promo ${esc(o.promo||'')}</span><span>−${peso(o.discount)}</span></div>`:''}${o.fee?`<div class="rl"><span>Delivery fee</span><span>${peso(o.fee)}</span></div>`:''}<div class="sum"><span>Total paid</span><b>${peso(o.total)}</b></div>`;
function receipt(o){OD[o.id]=o;$('#v-receipt').innerHTML=`<div class="card receipt"><div class="check-big">${ic('check')}</div><h2>Order placed!</h2><p class="meta">${o.id} · ${new Date(o.date).toLocaleString('en-PH')} · ${o.otype} · ${esc(o.method)}</p>${track(o)}${breakdown(o)}${o.notify?`<div class="msg ok">A confirmation was sent to ${esc(o.email)}.</div>`:''}<div class="actions"><button class="btn" data-view="menu">Order again</button><button class="btn ghost" data-view="orders">View my orders</button></div></div>`;go('receipt')}

/* orders + profile */
function orderCard(o,n){OD[o.id]=o;return `<div class="card order" style="--i:${n||0}"><header><span>${o.id}</span><span>${peso(o.total)}</span></header><p class="meta">${new Date(o.date).toLocaleString('en-PH')} · ${o.otype} · ${esc(o.method)}</p>${track(o)}<p>${o.items.map(l=>l.q+' × '+esc(l.n)).join(', ')}</p><button class="btn ghost sm" data-re="${o.id}">Order again</button></div>`}
async function rOrders(){const O=(await api('/api/orders')).orders||[];$('#v-orders').innerHTML=O.length?O.map(orderCard).join(''):`<div class="empty">You have no orders yet. Place your first order from the menu.</div>`}
async function rProfile(){const p=(await api('/api/profile')).profile||{};
  const f=(l,n,v,t='text')=>`<label>${l}<input name="${n}" type="${t}" value="${esc(v||'')}" required autocomplete="off"></label>`;
  $('#v-profile').innerHTML=`<form class="card panel form prof" id="pf"><div class="av-lg">${esc((p.name||'?')[0])}</div><p class="mu" style="text-align:center">@${esc(p.u||'')}</p>${f('Full name','name',p.name)}<div class="row2">${f('Email','email',p.email,'email')}${f('Phone','phone',p.phone)}</div>${f('Address','addr',p.addr)}<div class="msg" id="pfMsg" hidden></div><button class="btn lg">Save changes</button></form>`;
  $('#pf').onsubmit=async e=>{e.preventDefault();const r=await api('/api/profile',Object.fromEntries(new FormData(e.target)),'PUT');
    if(!r.ok)return showMsg('#pfMsg',r.error||'Could not save.');user=r.user;$('#avatar').textContent=user.name.trim()[0].toUpperCase();showMsg('#pfMsg','Profile saved.',true);toast('Profile updated')}}

/* events */
document.addEventListener('click',async e=>{const t=e.target.closest('button,a');if(!t)return;const d=t.dataset;
  if(d.tab){e.preventDefault();tab(d.tab)}
  else if(d.view){openCart(false);go(d.view)}
  else if('cart' in d)openCart(true);
  else if('close' in d)openCart(false);
  else if('checkout' in d){openCart(false);go('checkout')}
  else if(d.cat){cat=d.cat;rMenu()}
  else if(d.add){cart[d.add]=(cart[d.add]||0)+1;saveCart();toast('Added to cart')}
  else if(d.q){const n=(cart[d.q]||0)+ +d.d;if(n<1)delete cart[d.q];else cart[d.q]=n;cartChanged()}
  else if(d.rm){delete cart[d.rm];cartChanged()}
  else if(d.fav){const r=await api('/api/favorites/'+d.fav,{});favs=new Set(r.ids||[]);$$(`[data-fav="${d.fav}"]`).forEach(h=>h.classList.toggle('on',favs.has(+d.fav)));if(view==='favs')rFavs()}
  else if(d.ot){otype=d.ot;rCheckout()}
  else if(d.m){method=d.m;rCheckout()}
  else if('promo' in d){const code=$('#pcode').value.trim(),r=await api('/api/promo',{code,subtotal:sub()});
    if(!r.ok||!code){promo={code:'',discount:0};showMsg('#promoMsg',code?r.error:'Enter a promo code first.')}else{promo={code:code.toUpperCase(),discount:r.discount};showMsg('#promoMsg',`Promo applied. You saved ${peso(r.discount)}.`,true)}rSum()}
  else if(d.re){OD[d.re].items.forEach(l=>{const m=MENU.find(x=>x.n===l.n);if(m)cart[m.id]=(cart[m.id]||0)+l.q});saveCart();toast('Items added to your cart');openCart(true)}});
$$('#auth input').forEach(i=>{i.readOnly=true;i.addEventListener('focus',()=>i.readOnly=false)});
if(location.hash==='#register')tab('register');
boot();
