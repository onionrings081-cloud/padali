/* admin_feedback.js - /admin/feedback : every customer comment in three separate lists (store, food, delivery time),
   what needs attention, reply / delete, and when customers order (peak hours). Refreshes every 20 seconds. */
let D=null,tab='store',only='all';
const KIND={store:['Store','store'],food:['Food','utensils'],delivery:['Delivery time','bike']};
const SP={fast:'Faster than expected',ontime:'On time',late:'Took a while'};
const dayN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const sc=(k,v)=>`<div class="stat"><span class="ico">${ic(KIND[k][1])}</span><b>${v.n?v.avg.toFixed(1)+' ★':'–'}</b><small>${KIND[k][0]} comments · ${v.n}</small><em class="sub-s">${v.low} low · ${v.open} waiting for a reply</em></div>`;
function heat(){const h=D.heat,mx=Math.max(1,...h.flat());
  return `<div class="heat"><div class="hrow hh"><span></span>${Array.from({length:24},(_,i)=>`<small>${i%3===0?i:''}</small>`).join('')}</div>${h.map((r,d)=>`<div class="hrow"><span>${dayN[d]}</span>${r.map((n,i)=>`<i title="${dayN[d]} ${i}:00 · ${n} order${n===1?'':'s'}" style="--a:${n?(.15+.85*n/mx).toFixed(2):0}"></i>`).join('')}</div>`).join('')}</div>`}
const rank=(L,empty)=>L.length?L.map((t,i)=>`<div class="rank"><span class="no">${i+1}</span><div><b>${esc(t.n)}</b><small>${esc(t.s||'')} · ${t.c} comments</small></div><b>${t.a.toFixed(1)} ★</b></div>`).join(''):`<div class="empty">${empty}</div>`;
function list(){const L=(D.feedback[tab]||[]).filter(v=>only==='all'||(only==='low'?v.rating<=2:!v.reply));
  return L.length?L.map(v=>`<div class="fbrow"><div class="who">${avt(v.name,v.av)}<span><b>${esc(v.name)}</b><small>${when(v.d)}</small></span></div>
   <div class="fbmain"><p class="fbt"><span class="stars">${ic('star')} ${v.rating}</span> <span class="tag">${esc(v.target||'')}</span>${v.speed?` <span class="tag am">${SP[v.speed]||''}</span>`:''}</p><p>${esc(v.comment||'No comment.')}</p>
   <div class="rpl"><input data-rp="${v.id}" maxlength="240" placeholder="Reply as Padali…" value="${esc(v.reply||'')}"><button class="btn sm" data-save="${v.id}">${v.reply?'Update':'Reply'}</button></div></div>
   <button class="icon-btn danger" data-del="${v.id}" aria-label="Delete comment" title="Delete comment">${ic('trash')}</button></div>`).join(''):`<div class="empty">No comments here.</div>`}
function draw(){const s=D.summary,t=D.tags,tt=(t.fast||0)+(t.ontime||0)+(t.late||0),ok=tt?Math.round(((t.fast||0)+(t.ontime||0))/tt*100):0;
  if(document.activeElement&&document.activeElement.dataset.rp)return;   // don't redraw while typing a reply
  $('#v-fb').innerHTML=`<div class="stats kp">${['store','food','delivery'].map(k=>sc(k,s[k])).join('')}</div>
  <div class="grid3">
   <div class="card pad"><h3 class="sec-sm">${ic('trending-up')} Delivery on time</h3><p class="bignum">${tt?ok+'%':'–'}</p><p class="note">of rated deliveries were on time or faster</p>${Object.keys(SP).map(k=>`<div class="dist"><span>${SP[k]}</span><div class="meter"><i style="width:${tt?Math.round((t[k]||0)/tt*100):0}%"></i></div><b>${t[k]||0}</b></div>`).join('')}</div>
   <div class="card pad"><h3 class="sec-sm">Needs attention</h3>${rank(D.worst,'Not enough dish comments yet.')}</div>
   <div class="card pad"><h3 class="sec-sm">Customer favorites</h3>${rank(D.best,'Not enough dish comments yet.')}</div></div>
  <div class="card pad heat-c"><h3 class="sec-sm">${ic('chart')} When customers order <small class="mu">(all orders, by weekday and hour)</small></h3>${heat()}</div>
  <div class="head-row"><h3 class="sec">Customer comments</h3></div>
  <div class="tools"><div class="chips">${Object.entries(KIND).map(([k,v])=>`<button class="chip${k===tab?' on':''}" data-tab="${k}">${v[0]} (${s[k].n})</button>`).join('')}</div>
   <div class="chips">${[['all','All'],['low','Low rated (1-2★)'],['new','No reply yet']].map(([k,l])=>`<button class="chip${k===only?' on':''}" data-only="${k}">${l}</button>`).join('')}</div></div>
  <div class="card fblist">${list()}</div>`;stamp()}
async function load(){const r=await api('/api/admin/feedback?tz='+TZ);if(!r.feedback)return;D=r;draw()}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.tab){tab=d.tab;draw()}else if(d.only){only=d.only;draw()}
  else if(d.save){const t=$(`[data-rp="${d.save}"]`).value,r=await api(`/api/admin/feedback/${tab}/${d.save}/reply`,{reply:t},'PUT');toast(r.ok?(t?'Reply saved':'Reply removed'):'Could not save');await load()}
  else if(d.del&&b.classList.contains('icon-btn')){if(!confirm('Delete this comment? This cannot be undone.'))return;await api(`/api/admin/feedback/${tab}/${d.del}`,null,'DELETE');toast('Comment deleted');load()}});
adminReady.then(()=>{load();poll(load,20000)});
