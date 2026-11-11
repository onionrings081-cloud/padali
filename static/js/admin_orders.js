/* admin_orders.js - /admin/orders : monitor every order, change status, cancel. Refreshes every 10 seconds. */
let ALL=[],filter='all',q='',maxSeen=null;
const FILTERS=[['all','All'],['active','Active'],['0','Preparing'],['1','Ready / out'],['2','Completed'],['-1','Cancelled'],['ret','Return / refund']];
const match=o=>(filter==='all'||(filter==='ret'?!!o.ret:filter==='active'?o.status===0||o.status===1:String(o.status)===filter))&&(!q||(o.id+o.customer+o.phone).toLowerCase().includes(q));
const opts=o=>[0,1,2,-1].map(s=>`<option value="${s}"${s===o.status?' selected':''}>${stLabel({...o,status:s})}</option>`).join('');
const RS={requested:'Waiting for review',approved:'Approved',refunded:'Refunded',rejected:'Rejected'};
function retAdmin(o){const r=o.ret;if(!r)return '';const open=r.status==='requested',appr=r.status==='approved';
  return `<div class="retadm"><span class="pill-st ${r.status==='refunded'?'s2':r.status==='rejected'?'sx':'s1'}">${esc(r.kind)} · ${RS[r.status]}</span>
   <small>${esc(r.reason)}${r.detail?': '+esc(r.detail):''}</small>${r.note?`<small>Reply: ${esc(r.note)}</small>`:''}
   ${open||appr?`<div class="racts">${open?`<button class="btn ghost sm" data-ra="approve" data-n="${o.num}">Approve</button>`:''}<button class="btn sm" data-ra="refund" data-n="${o.num}">Mark refunded ${peso(o.total)}</button><button class="btn ghost sm danger" data-ra="reject" data-n="${o.num}">Reject</button></div>`:''}</div>`}
function rRows(){const L=ALL.filter(match);
  $('#rows').innerHTML=L.length?L.map(o=>`<tr><td><b>${o.id}</b><small>${when(o.date)}</small></td>
   <td>${esc(o.customer)}<small>${esc(o.phone)}</small>${o.otype==='Delivery'?`<small>${esc(o.addr)}</small>`:''}${o.rider?`<small>Rider: ${esc(o.rider)}${o.tip?' · tip '+peso(o.tip):''}</small>`:''}${o.sched?`<small>Scheduled ${new Date(o.sched).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'})}</small>`:''}</td>
   <td>${itemsText(o)}</td><td>${o.otype}<small>${payText(o.method)}${o.promo?' · '+esc(o.promo):''}</small></td><td><b>${peso(o.total)}</b></td>
   <td><select class="st" data-oid="${o.num}" aria-label="Order status">${opts(o)}</select>${retAdmin(o)}</td></tr>`).join(''):`<tr><td colspan="6"><div class="empty">No orders match.</div></td></tr>`;
  $$('[data-f]').forEach(b=>b.classList.toggle('on',b.dataset.f===filter));
  $('#count').textContent=L.length+' of '+ALL.length+' orders'}
function shell(){$('#v-orders').innerHTML=`<div class="tools"><div class="search"><span class="s-ic">${ic('search')}</span><input id="q" placeholder="Search order, customer, phone" autocomplete="off"></div>
  <div class="chips">${FILTERS.map(([k,l])=>`<button class="chip" data-f="${k}">${l}</button>`).join('')}</div></div>
  <p class="note" id="count"></p>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Type / payment</th><th>Total</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  $('#q').oninput=e=>{q=e.target.value.trim().toLowerCase();rRows()}}
async function load(){const r=await api('/api/admin/orders');if(!r.orders)return;ALL=r.orders;
  const top=ALL.reduce((m,o)=>Math.max(m,o.num),0);
  if(maxSeen!==null&&top>maxSeen)toast('New order received: ORD-'+(1000+top));
  maxSeen=top;
  if(document.activeElement&&document.activeElement.classList.contains('st'))return;   // don't redraw while changing a status
  rRows();stamp()}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-f]');if(b){filter=b.dataset.f;rRows();return}
  const a=e.target.closest('[data-ra]');if(!a)return;const o=ALL.find(x=>x.num==a.dataset.n),act=a.dataset.ra;let note='';
  if(act==='reject'){note=prompt('Why is this request rejected? The customer will see it.','');if(note===null)return}
  else if(act==='refund'&&!confirm('Mark '+o.id+' as refunded? '+peso(o.total)+' goes back to the customer ('+o.method+'). Rewards points from this order are removed.'))return;
  const r=await api('/api/admin/orders/'+o.num+'/return',{action:act,note},'PUT');
  if(!r.ok)return toast(r.error||'Could not update.');toast(o.id+(act==='approve'?' return approved':act==='refund'?' marked as refunded':' return rejected'));load()});
document.addEventListener('change',async e=>{const s=e.target.closest('select.st');if(!s)return;
  const st=+s.value,o=ALL.find(x=>x.num==s.dataset.oid);
  if(st===-1&&!confirm('Cancel '+o.id+'? The customer will see it as cancelled.')){s.value=o.status;return}
  const r=await api('/api/admin/orders/'+o.num+'/status',{status:st},'PUT');
  if(!r.ok){toast(r.error||'Could not update.');s.value=o.status;return}
  s.blur();toast(o.id+' set to '+stLabel({...o,status:st}));load()});
adminReady.then(()=>{shell();load();poll(load,10000)});
