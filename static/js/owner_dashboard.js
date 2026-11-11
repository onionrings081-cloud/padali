/* owner_dashboard.js - /owner : your store's numbers (sales, orders, best sellers, rating) and what needs your attention. Refreshes every 15 seconds. */
const kp=(icon,val,label)=>`<div class="stat"><span class="ico">${ic(icon)}</span><b>${val}</b><small>${label}</small></div>`;
async function load(){
  const r=await api('/api/owner/summary?tz='+TZ);if(!r.store)return;
  const s=r.store,k=r.kpi,mx=Math.max(1,...r.days.map(d=>d.revenue)),dn=Object.values(r.dist).reduce((a,b)=>a+b,0)||1;
  $('#v-od').innerHTML=`
  <div class="card pad head-row" style="margin-bottom:22px"><div class="dn"><span class="em">${ic('store')}</span><div><b>${esc(s.name)}</b><small>${esc(s.cuisine||'')} · ${esc(s.address||'')}</small></div></div>
    <label class="check" style="display:flex;gap:12px;align-items:center"><span>${s.open?'Open for orders':'Closed'}</span><label class="tgl"><input type="checkbox" id="opn"${s.open?' checked':''} aria-label="Open for orders"><span></span></label></label></div>
  ${r.tips.length?`<div class="tips">${r.tips.map(t=>`<p>${ic('bell')}<span>${esc(t)}</span></p>`).join('')}</div>`:''}
  <div class="stats kp">${[['wallet',peso(k.today_sales),'Your sales today'],['receipt-text',k.today_orders,'Orders today'],['clock',k.active,'Active orders'],
    ['trending-up',peso(k.sales),'Total sales'],['store',peso(k.avg),'Average order'],['star',k.rc?k.rating.toFixed(1)+' ★':'–','Store rating · '+k.rc+' comment'+(k.rc===1?'':'s')]].map(a=>kp(...a)).join('')}</div>
  <div class="grid2">
    <div class="card pad"><h3 class="sec-sm">Sales, last 7 days</h3><div class="bars">${r.days.map(d=>{const t=new Date(d.d+'T00:00');return `<div class="col"><small>${d.revenue?peso(d.revenue).replace('.00',''):'–'}</small><div class="well"><i style="height:${d.revenue?Math.max(3,Math.round(d.revenue/mx*100)):0}%"></i></div><b>${t.toLocaleDateString('en-PH',{weekday:'short'})}</b><small>${d.orders} order${d.orders===1?'':'s'}</small></div>`}).join('')}</div></div>
    <div class="card pad"><h3 class="sec-sm">Best sellers</h3>${r.top.length?r.top.map((t,i)=>`<div class="rank"><span class="no">${i+1}</span><div><b>${esc(t.n)}</b><small>${t.q} sold</small></div><b>${peso(t.r)}</b></div>`).join(''):`<div class="empty">No sales yet.</div>`}</div>
  </div>
  <div class="grid2 eq" style="margin-top:22px">
    <div class="card pad"><h3 class="sec-sm">Store rating</h3>${[5,4,3,2,1].map(n=>`<div class="dist"><span>${n} ★</span><div class="meter"><i style="width:${Math.round(r.dist[n]/dn*100)}%"></i></div><b>${r.dist[n]}</b></div>`).join('')}
      ${k.unanswered?`<p class="note" style="margin:12px 0 0"><a href="/owner/feedback">${k.unanswered} comment${k.unanswered>1?'s':''} waiting for your reply</a></p>`:''}</div>
    <div class="card pad"><h3 class="sec-sm">Your menu</h3><div class="dist"><span>Dishes</span><div></div><b>${k.dishes}</b></div><div class="dist"><span>Switched off</span><div></div><b>${k.unavailable}</b></div><p class="note" style="margin:10px 0 0"><a href="/owner/menu">Manage menu</a></p></div>
  </div>
  <div class="head-row"><h3 class="sec">Recent orders</h3><a class="btn ghost sm" href="/owner/orders">View all</a></div>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Your items</th><th>Your total</th><th>Status</th></tr></thead><tbody>${r.recent.length?r.recent.map(o=>`<tr><td><b>${o.id}</b><small>${when(o.date)}</small></td><td>${o.items.map(i=>`${i.q}× ${esc(i.n)}`).join('<br>')}</td><td><b>${peso(o.mine)}</b></td><td>${stPill({status:o.status,otype:'Delivery'})}</td></tr>`).join(''):`<tr><td colspan="4"><div class="empty">No orders yet.</div></td></tr>`}</tbody></table></div>`;
  const o=$('#opn');o.onchange=async()=>{const x=await api('/api/owner/store',{open:o.checked},'PUT');toast(x.ok?(o.checked?'Your store is open':'Your store is closed. Customers can not order'):(x.error||'Could not change.'));load()};
  stamp()}
adminReady.then(()=>{$('#v-od').innerHTML='<div class="empty">Loading…</div>';load();poll(load,15000)});
