/* home.js - Overview page (/app): greeting, live order tracking, popular dishes, top stores, recent orders */
const hello=()=>{const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'};
const liveOf=O=>O.find(o=>o.status>=0&&o.status<2);
const liveCard=o=>{const st=[...new Set(o.items.map(l=>l.s).filter(Boolean))].join(', ');
  return `<div class="card live-card"><header><h3><span class="dotlive"></span>Live order · ${o.id}</h3><span class="pill-st s${o.status}">${STEP(o)[o.status]}</span></header>
  <p class="big">${STEP(o)[o.status]}</p><p class="meta">${o.otype} · placed ${ago(o.date)} · ${peso(o.total)}${st?' · '+esc(st):''}</p>${track(o)}${trackCard(o)}<p class="meta">${o.items.map(l=>l.q+' × '+esc(l.n)).join(', ')}</p>
  ${o.otype==='Delivery'&&o.addr?`<p class="meta">${ic('map-pin')} Delivering to ${esc(o.addr)}</p>`:''}</div>`};

ready.then(async()=>{
  const [s,o,p,rw]=await Promise.all([api('/api/stats'),api('/api/orders'),api('/api/popular'),api('/api/rewards')]);
  let O=o.orders||[];const recent=()=>O.slice(0,2).map(x=>orderCard({...x,noMap:1})).join('')||`<div class="empty">No orders yet. Your first one is a tap away.</div>`;
  /* popular right now: real best sellers first, then the best dish of the top-rated open stores */
  let pop=(p.items||[]).map(x=>MENU.find(m=>m.n===x.n&&storeOf(m.s).n===x.s)).filter(m=>m&&isOpen(storeOf(m.s)));
  for(const st of [...STORES].sort((a,b)=>b.rating-a.rating)){if(pop.length>=6)break;if(!isOpen(st))continue;
    const m=dishesOf(st.id).find(d=>!pop.includes(d));if(m)pop.push(m)}
  pop=pop.slice(0,6);
  const top=[...STORES].filter(isOpen).sort((a,b)=>b.rating-a.rating).slice(0,3);
  $('#v-home').innerHTML=`<div class="card hero-card"><div><h2>${hello()}, ${esc(user.name.split(' ')[0])}</h2><p>What are you craving today? ${STORES.length} stores in ${esc(AREA)} are ready for you.</p></div>
    <div class="hero-act"><a class="btn lg" href="/menu">${ic('store')} Browse stores</a><a class="btn ghost lg" href="/menu" data-surp>${ic('shuffle')} Surprise me</a></div></div>
  <div class="duo"><a class="card nudge" href="/planner"><span class="pi">${ic('sparkles')}</span><div><b>Kain Tayo Planner</b><small>Budget + number of people in, a full order plan out. Delivery fees included.</small></div>${ic('arrow-right')}</a>
   ${(()=>{const n=O.filter(o=>o.status===2&&((o.otype==='Delivery'&&!o.rv_del)||o.items.some(l=>!l.cu&&l.s&&!(o.rv_food||[]).includes(l.n+'||'+l.s)||!l.cu&&l.s&&!(o.reviewed||[]).includes(l.s)))).length;
     return n?`<a class="card nudge" href="/orders"><span class="pi">${ic('message')}</span><div><b>${n} order${n>1?'s':''} waiting for your comments</b><small>Rate the delivery time, the food and the store separately.</small></div>${ic('arrow-right')}</a>`:`<a class="card nudge" href="/profile"><span class="pi">${ic('camera')}</span><div><b>Add your profile photo</b><small>Pick one from your gallery. It shows beside your comments.</small></div>${ic('arrow-right')}</a>`})()}</div>
  <div id="liveBox">${liveOf(O)?liveCard(liveOf(O)):''}</div>
  <div class="card rew"><div class="rew-h"><span class="tier t-${rw.tier}">${ic('star')} ${rw.tier}</span><div><b>${rw.balance}</b><small>reward points · worth ${peso(rw.balance/10)}</small></div></div>
    <div class="bar2"><i style="width:${rw.next?Math.min(100,Math.round((rw.earned-rw.tier_at)/(rw.next_at-rw.tier_at)*100)):100}%"></i></div>
    <p class="meta">${rw.next?`${rw.to_next} more points to reach <b>${rw.next}</b>. `:'You reached the top tier. '}Earn 1 point for every ₱10 on completed orders. 100 points = ₱10 off at checkout.</p></div>
  <div class="stats">${[['receipt-text',s.orders||0,'Orders placed'],['wallet',peso(s.spent||0),'Total spent'],['heart',favs.size,'Favorite dishes']].map(([i,v,l])=>`<div class="stat"><span class="ico">${ic(i)}</span><b>${v}</b><small>${l}</small></div>`).join('')}</div>
  <h3 class="sec"><span>${ic('flame')} Popular right now</span><a href="/menu">See all</a></h3><div class="items">${pop.map(card).join('')}</div>
  <h3 class="sec"><span>${ic('star')} Top rated stores</span><a href="/menu">All stores</a></h3><div class="stores">${top.map(storeCard).join('')}</div>
  <h3 class="sec"><span>Recent orders</span><a href="/orders">View all</a></h3><div id="recent">${recent()}</div>
  <h3 class="sec"><span>${ic('tag')} Promo codes</span></h3><div class="promos"><div class="promo-card"><b>WELCOME10</b><span>10% off your order</span></div><div class="promo-card"><b>SAVE50</b><span>₱50 off orders of ₱300 or more</span></div></div>`;
  /* keep the live order up to date without reloading (status moves on its own) */
  setInterval(async()=>{if(document.hidden)return;const r=await api('/api/orders');if(!r.orders)return;O=r.orders;
    const l=liveOf(O);$('#liveBox').innerHTML=l?liveCard(l):'';
    $('#recent').innerHTML=recent()},10000)});

document.addEventListener('click',e=>{const t=e.target.closest('button,a');if(!t)return;
  if('surp' in t.dataset)sessionStorage.setItem('padali_surprise','1');
  if(t.dataset.store){sessionStorage.setItem('padali_store',t.dataset.store);location.href='/menu'}});
