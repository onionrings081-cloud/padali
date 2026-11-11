/* orders.js - My orders page (/orders): tabs To pay / To ship / To receive / Completed / Return-Refund / Cancelled */
const OTABS=[['pay','To pay','wallet'],['ship','To ship','store'],['receive','To receive','truck'],['done','Completed','circle-check'],['return','Return/Refund','corner-down-right'],['cancel','Cancelled','x']];
const EMPTY={pay:'Nothing to pay. Cash orders waiting for the rider show up here.',ship:'No paid orders are being prepared right now.',receive:'No orders on the way.',done:'No completed orders yet.',return:'No return or refund requests.',cancel:'No cancelled orders.'};
/* where an order belongs: cash is paid on arrival (To pay), card / e-wallet are already paid (To ship) */
const tabOf=o=>o.ret?'return':o.status<0?'cancel':o.status===2?'done':o.status===1?'receive':o.method==='Cash'?'pay':'ship';
let ORD=[],otab=(location.hash||'').slice(1);
function rTabs(){const n=k=>ORD.filter(o=>tabOf(o)===k).length;if(!OTABS.some(t=>t[0]===otab))otab='pay';
  $('#v-orders').innerHTML=`<div class="otabs" role="tablist">${OTABS.map(([k,l,i])=>`<button class="otab${k===otab?' on':''}" role="tab" aria-selected="${k===otab}" data-otab="${k}">${ic(i)}<span>${l}</span>${n(k)?`<em>${n(k)}</em>`:''}</button>`).join('')}</div>
  <div id="olist">${(()=>{const L=ORD.filter(o=>tabOf(o)===otab);return L.length?L.map(orderCard).join(''):`<div class="empty">${ORD.length?EMPTY[otab]:'You have no orders yet. Place your first order from the menu.'}</div>`})()}</div>`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-otab]');if(!b)return;otab=b.dataset.otab;history.replaceState(null,'','#'+otab);rTabs()});
ready.then(async()=>{ORD=(await api('/api/orders')).orders||[];
  if(!location.hash){const f=OTABS.find(t=>ORD.some(o=>tabOf(o)===t[0]));otab=f?f[0]:'pay'}   // open on the first tab that has orders
  rTabs()});
