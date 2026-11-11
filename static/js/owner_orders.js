/* owner_orders.js - /owner/orders : orders that include your dishes (only your items and your total). Refreshes every 10 seconds. */
let OR=[],of='active';
const TABS=[['active','Active'],['done','Completed'],['cancelled','Cancelled'],['all','All']];
const inT=o=>of==='all'||(of==='active'?o.status>=0&&o.status<2:of==='done'?o.status===2:o.status<0);
const cn=k=>OR.filter(o=>k==='all'||(k==='active'?o.status>=0&&o.status<2:k==='done'?o.status===2:o.status<0)).length;
function draw(){const L=OR.filter(inT);
  $('#v-orders').innerHTML=`<p class="note">You see your own dishes only. Customer contact details and payment are not shown. The Padali team handles the delivery.</p>
   <div class="tools"><div class="chips">${TABS.map(([k,l])=>`<button class="chip${k===of?' on':''}" data-t="${k}">${l} (${cn(k)})</button>`).join('')}</div></div>
   <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Your items</th><th>Your total</th><th>Status</th></tr></thead><tbody>
   ${L.length?L.map(o=>`<tr><td><b>${o.id}</b><small>${when(o.date)}${o.sched?' · scheduled':''}</small></td><td>${esc(o.customer)}${o.other?'<small>Also ordered from other stores</small>':''}</td>
    <td class="oitems">${o.items.map(i=>`${i.q}× ${esc(i.n)}`).join('<br>')}</td><td><b>${peso(o.mine)}</b></td><td>${stPill(o)}${o.ret?`<small>Return / refund: ${esc(o.ret)}</small>`:''}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty">No orders here.</div></td></tr>`}
   </tbody></table></div>`;stamp()}
async function load(){const r=await api('/api/owner/orders');if(!r.orders)return;OR=r.orders;draw()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(b){of=b.dataset.t;draw()}});
adminReady.then(()=>{load();poll(load,10000)});
