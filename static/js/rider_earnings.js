/* rider_earnings.js - /rider/earnings : delivery fees + tips of delivered orders (today, this week, all time), cash collected, 7-day chart,
   and what customers said about the delivery time of the rider's orders. Refreshes every 30 seconds. */
let E=null;
const tot=b=>b.fees+b.tips;
const stat=(ico,v,l,s)=>`<div class="stat"><span class="ico">${ic(ico)}</span><b>${v}</b><small>${l}</small>${s?`<em class="sub-s">${s}</em>`:''}</div>`;
function draw(){const t=E.tags,tt=(t.fast||0)+(t.ontime||0)+(t.late||0),ok=tt?Math.round(((t.fast||0)+(t.ontime||0))/tt*100):0,mx=Math.max(1,...E.days.map(tot));
  $('#v-earn').innerHTML=`<p class="note">Earnings here are the delivery fees and tips of orders you delivered. Cash is what customers paid you on delivery (cash orders), so you can hand it over.</p>
   <div class="stats kp k4">${stat('wallet',peso(tot(E.today)),'Earned today',`${E.today.n} deliver${E.today.n===1?'y':'ies'} · fees ${peso(E.today.fees)} · tips ${peso(E.today.tips)}`)}
    ${stat('trending-up',peso(tot(E.week)),'Last 7 days',`${E.week.n} deliveries`)}${stat('circle-check',peso(tot(E.all)),'All time',`${E.all.n} deliveries`)}${stat('banknote',peso(E.today.cash),'Cash collected today',`all time ${peso(E.all.cash)}`)}</div>
   <div class="grid21">
    <div class="card pad"><h3 class="sec-sm">Earnings, last 7 days</h3><div class="bars">${E.days.map(d=>{const t0=new Date(d.d+'T00:00');return `<div class="col"><small>${tot(d)?peso(tot(d)).replace('.00',''):'–'}</small><div class="well"><i style="height:${tot(d)?Math.max(3,Math.round(tot(d)/mx*100)):0}%"></i></div><b>${t0.toLocaleDateString('en-PH',{weekday:'short'})}</b><small>${d.n} deliver${d.n===1?'y':'ies'}</small></div>`}).join('')}</div></div>
    <div class="card pad"><h3 class="sec-sm">${ic('star')} Your rating</h3><p class="bignum">${E.rating.n?E.rating.avg.toFixed(1)+' ★':'–'}</p><p class="note">${E.rating.n?`from ${E.rating.n} delivery comment${E.rating.n===1?'':'s'} · ${ok}% on time or faster`:'No customer has rated a delivery yet.'}</p>
     ${Object.keys(SPEED).map(k=>`<div class="dist"><span>${SPEED[k]}</span><div class="meter"><i style="width:${tt?Math.round((t[k]||0)/tt*100):0}%"></i></div><b>${t[k]||0}</b></div>`).join('')}</div></div>
   <div class="head-row"><h3 class="sec">What customers said about your deliveries</h3></div>
   <div class="card fblist">${E.reviews.length?E.reviews.map(v=>`<div class="fbrow"><div class="who">${avt(v.name)}<span><b>${esc(v.name)}</b><small>${when(v.d)}</small></span></div><div class="fbmain"><p class="fbt"><span class="stars">${ic('star')} ${v.rating}</span> <span class="tag am">${SPEED[v.speed]||''}</span></p><p>${esc(v.comment||'No comment.')}</p></div></div>`).join(''):`<div class="empty">No comments yet. They show here after customers rate their delivery.</div>`}</div>`;stamp()}
async function load(){const r=await api('/api/rider/earnings?tz='+TZ);if(!r.days)return;E=r;draw()}
adminReady.then(()=>{$('#v-earn').innerHTML='<div class="empty">Loading…</div>';load();poll(load,30000)});
