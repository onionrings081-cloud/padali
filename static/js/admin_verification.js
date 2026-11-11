/* admin_verification.js - /admin/applications : the admin reviews store applications (approve / reject).
   Approving creates the store and turns the applicant's account into a Store Owner. Refreshes every 15 seconds. */
const dt=iso=>new Date(iso).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
let AP=[],CT={},vf='pending';
const FIL=[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['all','All']];
const PILLS={pending:['s1','Pending'],approved:['s2','Approved'],rejected:['sx','Rejected'],closed:['sx','Store removed'],withdrawn:['s0','Withdrawn']};
const vPill=s=>{const p=PILLS[s]||['s0',s];return `<span class="pill-st ${p[0]}">${p[1]}</span>`};
const kv=(l,v)=>`<div class="kv"><small>${l}</small><span>${v?esc(v):'–'}</span></div>`;
const inF=a=>vf==='all'||a.status===vf;
const cnt=k=>AP.filter(a=>k==='all'||a.status===k).length;
function acts(a){
  if(a.status==='pending')return `<div class="vact"><div class="rpl"><input data-why="${a.id}" maxlength="300" placeholder="Reason (required to reject, the applicant will read it)" autocomplete="off"><div class="racts"><button class="btn sm" data-do="approve" data-id="${a.id}">Approve</button><button class="btn ghost sm danger" data-do="reject" data-id="${a.id}">Reject</button></div></div></div>`;
  if(a.status==='rejected')return `<div class="vact"><p class="note" style="margin:0">Rejected. The applicant can correct the details and apply again.</p></div>`;
  return '';}
const card=a=>{const u=a.applicant||{};return `<article class="card vcard" id="a${a.id}">
  <header class="vhead"><div class="dn"><span class="em">${ic('store')}</span><div><b>${esc(a.name)}</b><small>${esc(a.cuisine||'')}</small></div></div>${vPill(a.status)}</header>
  <div class="vcols"><div>
    <div class="vgrid">${kv('Description',a.description)}${kv('Address',a.address)}${kv('Store contact',a.phone)}${kv('Delivery time',a.eta)}${kv('Permit / registration no.',a.permit)}${kv('Sent',dt(a.created_at))}${a.decided_at?kv('Decided',dt(a.decided_at)):''}</div>
    <div class="who-box">${avt(u.name,u.av)}<div><b>${esc(u.name||'Unknown')} <small style="display:inline">@${esc(u.username||'')}</small></b><small>${esc(u.email||'')} · ${esc(u.phone||'')}</small><small>${u.orders||0} completed order${u.orders===1?'':'s'} as a customer · ${peso(u.spent||0)} spent</small></div></div>
  </div><div class="pm" id="m${a.id}"></div></div>
  ${a.checks.length?`<div class="chk">${a.checks.map(c=>`<p class="${c.ok?'y':'n'}">${ic(c.ok?'circle-check':'bell')}<span>${esc(c.t)}</span></p>`).join('')}</div>`:''}
  ${a.reason?`<p class="msg err vreason">Rejected: ${esc(a.reason)}</p>`:''}${acts(a)}</article>`};
function maps(L){if(!window.PMap)return;L.forEach(a=>{const el=$('#m'+a.id);if(!el||a.lat==null)return;const m=new PMap(el,{lat:a.lat,lng:a.lng,zoom:16});m.addMarker(a.lat,a.lng,ic('store'),'pm-pin')})}
function draw(){
  if(document.activeElement&&/INPUT|SELECT/.test(document.activeElement.tagName))return;       // don't redraw while typing a reason
  const L=AP.filter(inF);
  $('#v-apps').innerHTML=`<p class="note">Customers send these from <b>My Store</b>. Only you can approve or reject. When you approve, the store appears for customers and the applicant's account becomes a Store Owner.</p>
   <div class="tools"><div class="chips">${FIL.map(([k,l])=>`<button class="chip${k===vf?' on':''}" data-f="${k}">${l} (${cnt(k)})</button>`).join('')}</div></div>
   <div class="vlist">${L.length?L.map(card).join(''):`<div class="empty">${vf==='pending'?'No applications are waiting for review.':'Nothing here.'}</div>`}</div>`;
  maps(L);stamp()}
async function load(){const r=await api('/api/admin/applications');if(!r.applications)return;AP=r.applications;CT=r.counts||{};draw()}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.f){vf=b.dataset.f;draw();return}
  if(b.dataset.do){const id=b.dataset.id,act=b.dataset.do,why=($(`[data-why="${id}"]`)||{}).value||'';
    if(act==='reject'&&why.trim().length<5)return toast('Write a reason of at least 5 characters first.');
    const a=AP.find(x=>x.id==id);if(act==='approve'&&!confirm('Approve "'+a.name+'"? The store goes live and '+((a.applicant||{}).name||'the applicant')+' becomes a Store Owner.'))return;
    b.disabled=true;const r=await api(`/api/admin/applications/${id}/${act}`,{reason:why.trim()});b.disabled=false;
    toast(r.ok?(act==='approve'?'Approved. The store is live and the account is now a Store Owner.':'Application rejected. The applicant can read your reason.'):(r.error||'Could not save the decision.'));
    document.activeElement.blur();await load()}});
adminReady.then(()=>{$('#v-apps').innerHTML='<div class="empty">Loading applications…</div>';load();poll(load,15000)});
