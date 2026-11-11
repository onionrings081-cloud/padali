/* admin_dashboard.js - /admin : live overview of sales, orders and best sellers. Refreshes every 15 seconds. */
const kpi=(icon,val,label)=>`<div class="stat"><span class="ico">${ic(icon)}</span><b>${val}</b><small>${label}</small></div>`;
const dist=(title,obj,labels)=>{const tot=Object.values(obj).reduce((a,b)=>a+b,0)||1;
  return `<div class="card pad"><h3 class="sec-sm">${title}</h3>${Object.keys(labels).map(k=>{const n=obj[k]||0;return `<div class="dist"><span>${labels[k]}</span><div class="meter"><i style="width:${Math.round(n/tot*100)}%"></i></div><b>${n}</b></div>`}).join('')}</div>`};

async function load(){
  const s=await api('/api/admin/summary?tz='+TZ); if(!s.kpi)return;
  const k=s.kpi,mx=Math.max(1,...s.days.map(d=>d.revenue));
  $('#v-dash').innerHTML=`
  <div class="stats kp">${[
    ['wallet',peso(k.today_revenue),'Revenue today'],['receipt-text',k.today_orders,'Orders today'],['clock',k.active,'Active orders'],
    ['trending-up',peso(k.revenue),'Total revenue'],['store',peso(k.avg),'Average order'],['users',k.customers,'Customers']].map(a=>kpi(...a)).join('')}</div>

  <div class="grid2">
    <div class="card pad"><h3 class="sec-sm">Sales, last 7 days</h3>
      <div class="bars">${s.days.map(d=>{const dt=new Date(d.d+'T00:00');return `<div class="col"><small>${d.revenue?peso(d.revenue).replace('.00',''):'–'}</small><div class="well"><i style="height:${d.revenue?Math.max(3,Math.round(d.revenue/mx*100)):0}%"></i></div><b>${dt.toLocaleDateString('en-PH',{weekday:'short'})}</b><small>${d.orders} order${d.orders===1?'':'s'}</small></div>`}).join('')}</div></div>
    <div class="card pad"><h3 class="sec-sm">Best sellers</h3>${s.top.length?s.top.map((t,i)=>`<div class="rank"><span class="no">${i+1}</span><div><b>${esc(t.n)}</b><small>${t.q} sold</small></div><b>${peso(t.r)}</b></div>`).join(''):`<div class="empty">No sales yet.</div>`}</div>
  </div>

  <div class="grid2 eq"><div class="card pad"><h3 class="sec-sm">Sales by store</h3>${s.by_store.length?(()=>{const m=Math.max(1,...s.by_store.map(x=>x.r));return s.by_store.map(x=>`<div class="dist wide"><span>${esc(x.n)}</span><div class="meter"><i style="width:${Math.round(x.r/m*100)}%"></i></div><b>${peso(x.r).replace('.00','')}</b></div>`).join('')})():`<div class="empty">No sales yet.</div>`}</div>
    <div class="card pad"><h3 class="sec-sm">Store network</h3><div class="dist"><span>Stores</span><div></div><b>${k.stores}</b></div><div class="dist"><span>Dishes</span><div></div><b>${k.menu_items}</b></div><div class="dist"><span>Switched off</span><div></div><b>${k.unavailable}</b></div><p class="note" style="margin:10px 0 0"><a href="/admin/stores">Manage stores</a></p></div></div>

  <div class="grid3">
    ${dist('Order status',s.by_status,{0:'Preparing',1:'Ready / out',2:'Completed','-1':'Cancelled'})}
    ${dist('Order type',s.by_type,{Delivery:'Delivery',Pickup:'Pickup','Dine-in':'Dine-in'})}
    ${dist('Payment method',s.by_method,{Cash:'Cash',Card:'Card','E-Wallet':'E-Wallet'})}
  </div>

  <div class="head-row"><h3 class="sec">Recent orders</h3><a class="btn ghost sm" href="/admin/orders">View all</a></div>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>
  ${s.recent.length?s.recent.map(o=>`<tr><td><b>${o.id}</b><small>${when(o.date)}</small></td><td>${esc(o.customer)}<small>${o.otype} · ${esc(o.method)}</small></td><td>${itemsText(o)}</td><td><b>${peso(o.total)}</b></td><td>${stPill(o)}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty">No orders yet.</div></td></tr>`}
  </tbody></table></div>
  ${k.unavailable?`<p class="note">${k.unavailable} dish${k.unavailable>1?'es are':' is'} switched off on the menu. <a href="/admin/menu">Manage menu</a></p>`:''}`;
  stamp()}
adminReady.then(()=>{load();poll(load,15000)});
