/* rider.js - /rider : the rider's OWN assigned deliveries. Steps: Assigned -> Picked up -> Delivered. The server checks every step. Refreshes every 10 seconds. */
let RDATA=null;
const STEPS=['Assigned','Picked up','Delivered'];
const sbar=d=>`<div class="stepbar">${STEPS.map((l,i)=>`<span class="${i<=STEPS.indexOf(d.state)?'on':''}">${l}</span>`).join('')}</div>`;
const maps=(a,b)=>a&&a.lat!=null?`<a href="https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=18/${a.lat}/${a.lng}" target="_blank" rel="noopener">map</a>`:'';
function card(d){const done=d.status===2||d.status<0;
  return `<article class="card dcard"><header class="dhead"><div><b>${d.id}</b> <small class="mu">${when(d.date)}${d.sched?' · scheduled '+new Date(d.sched).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'}):''}</small></div><span class="pill-st ${d.status<0?'sx':d.status===2?'s2':d.status===1?'s1':'s0'}">${d.state}</span></header>
  ${d.status<0?'':sbar(d)}
  <div class="dgrid"><div class="kv"><small>1 · Pick up at</small>${d.stores.length?d.stores.map(s=>`<span>${esc(s.n)} ${maps(s)}</span>`).join(''):'<span>–</span>'}</div>
   <div class="kv"><small>2 · Deliver to</small><span>${esc(d.customer)} · ${esc(d.phone)}<br>${esc(d.addr||'No address')} ${maps(d.dest)}</span></div></div>
  <div class="dlist">${d.items.map(i=>`<div class="it">${i.q}× ${esc(i.n)} <small class="mu">${i.s?esc(i.s):''}${i.cu?' · special request: buy it for the customer'+(i.no?' ('+esc(i.no)+')':''):''}</small></div>`).join('')}</div>
  <p class="note" style="margin:0">${d.collect?`<span class="collect">Collect ${peso(d.collect)} in cash</span>`:`Paid by ${esc(d.method)}, nothing to collect`}${d.tip?` · tip ${peso(d.tip)}`:''}</p>
  ${done?'':d.status===0?`<button class="btn" data-go="pickup" data-n="${d.num}">${ic('check')} Mark picked up</button>`:`<button class="btn" data-go="deliver" data-n="${d.num}">${ic('circle-check')} Mark delivered</button>`}</article>`}
function draw(){const r=RDATA,p=r.profile,act=r.deliveries.filter(d=>d.status===0||d.status===1),old=r.deliveries.filter(d=>!(d.status===0||d.status===1));
  $('#v-rider').innerHTML=`<div class="stats kp"><div class="stat"><span class="ico">${ic('bike')}</span><b>${act.length}</b><small>Active deliveries</small></div><div class="stat"><span class="ico">${ic('circle-check')}</span><b>${r.stats.delivered}</b><small>Delivered</small></div><div class="stat"><span class="ico">${ic('wallet')}</span><b>${peso(r.stats.tips)}</b><small>Tips from delivered orders</small></div></div>
   <div class="card pad head-row" style="margin-bottom:22px"><div><b>${p.active?'You are available':'You are offline'}</b><p class="note" style="margin:4px 0 0">${esc(p.vehicle||'')} · ${esc(p.plate||'')}. Stores can only assign orders to riders who are available. Orders already assigned to you stay yours.</p></div><label class="tgl"><input type="checkbox" id="avail"${p.active?' checked':''} aria-label="Available for deliveries"><span></span></label></div>
   <div class="head-row"><h3 class="sec" style="margin-top:0">Active deliveries</h3></div><div class="dlist">${act.length?act.map(card).join(''):`<div class="empty">No delivery is assigned to you right now. Stay available and the stores will assign you orders.</div>`}</div>
   ${old.length?`<div class="head-row"><h3 class="sec">Recent</h3></div><div class="dlist">${old.map(card).join('')}</div>`:''}`;
  $('#avail').onchange=async e=>{const r=await api('/api/rider/profile',{active:e.target.checked},'PUT');toast(r.ok?(e.target.checked?'You are available':'You are offline'):'Could not change');load()};stamp()}
async function load(){const r=await api('/api/rider/deliveries');if(!r.deliveries)return;RDATA=r;draw()}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-go]');if(!b)return;
  if(b.dataset.go==='deliver'&&!confirm('Mark this order as delivered? The customer will see it as completed.'))return;
  b.disabled=true;const r=await api(`/api/rider/deliveries/${b.dataset.n}/${b.dataset.go}`,{});
  toast(r.ok?(b.dataset.go==='pickup'?'Marked as picked up':'Delivered. Nice work!'):(r.error||'Could not update'));await load()});
adminReady.then(()=>{$('#v-rider').innerHTML='<div class="empty">Loading deliveries…</div>';load();poll(load,10000)});
