/* admin_riders.js - /admin/riders : the admin creates the rider accounts (riders can not sign up on their own), edits them,
   switches them off / on, resets a password, or deletes an account that has no deliveries yet. Refreshes every 15 seconds. */
let RD=[],VEH=[],editId=null,q='';
const pwBox=()=>`<label>Password<input name="p" type="text" autocomplete="off" minlength="6" placeholder="At least 6 characters" required></label>`;
function form(){return `<form class="card pad form dish-form" id="rf" hidden autocomplete="off"><h3 id="rfTitle">New rider account</h3>
  <div class="row2"><label>Full name<input name="name" required maxlength="60"></label><label>Mobile number<input name="phone" required maxlength="11" inputmode="tel" placeholder="09XXXXXXXXX"></label></div>
  <div class="row2"><label>Vehicle<select name="vehicle">${VEH.map(v=>`<option>${v}</option>`).join('')}</select></label><label>Plate number (optional)<input name="plate" maxlength="20" placeholder="ABC 1234"></label></div>
  <div class="row2" id="cred"><label>Username<input name="u" maxlength="30" autocomplete="off" placeholder="Letters and numbers, 3+ characters"></label><div id="pwSlot">${pwBox()}</div></div>
  <p class="note" id="rfNote">Give the username and password to the rider. They log in on the normal login page and are sent to the Rider portal. The rider can change the password later.</p>
  <div class="msg err" id="rfMsg" hidden></div>
  <div class="actions left"><button class="btn" id="rfGo">Create account</button><button class="btn ghost" type="button" id="rfCancel">Cancel</button></div></form>`}
function status(r){return r.disabled?'<span class="pill-st sx">Switched off</span>':r.busy?'<span class="pill-st s1">On delivery</span>':r.active?'<span class="pill-st s2">Available</span>':'<span class="pill-st s0">Offline</span>'}
function draw(){const L=RD.filter(r=>!q||(r.n+r.u+r.p+(r.pl||'')).toLowerCase().includes(q));
  $('#v-riders').innerHTML=`<div class="head-row"><p class="note">${RD.length} rider${RD.length===1?'':'s'} · ${RD.filter(r=>r.active&&!r.disabled).length} available now · ${RD.reduce((a,r)=>a+r.busy,0)} active deliveries</p><button class="btn" id="addBtn">${ic('plus')} New rider account</button></div>
   ${form()}
   <div class="tools"><div class="search"><span class="s-ic">${ic('search')}</span><input id="q" value="${esc(q)}" placeholder="Search name, username, phone, plate" autocomplete="off"></div></div>
   <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Rider</th><th>Contact</th><th>Vehicle</th><th>Status</th><th>Deliveries</th><th>Rating</th><th></th></tr></thead><tbody>
   ${L.length?L.map(r=>`<tr class="${r.disabled?'off':''}"><td><div class="dn"><span class="av-sm">${r.av?`<img src="${esc(r.av)}" alt="">`:esc(r.n[0].toUpperCase())}</span><div><b>${esc(r.n)}</b><small>@${esc(r.u)}</small></div></div></td>
    <td>${esc(r.p)}</td><td>${esc(r.v||'–')}<small>${esc(r.pl||'No plate')}</small></td><td>${status(r)}</td>
    <td><b>${r.done}</b> done<small>${r.busy} active</small></td><td>${r.rc?`<span class="stars">${ic('star')} ${r.rating.toFixed(1)} <small>(${r.rc})</small></span>`:'<small>No ratings</small>'}</td>
    <td class="acts"><div class="racts" style="margin:0;justify-content:flex-end"><button class="icon-btn" data-edit="${r.id}" aria-label="Edit rider" title="Edit">${ic('pencil')}</button><button class="btn ghost sm" data-pw="${r.id}" type="button">Reset password</button><button class="btn ghost sm" data-off="${r.id}" type="button">${r.disabled?'Switch on':'Switch off'}</button><button class="icon-btn danger" data-del="${r.id}" aria-label="Delete rider" title="Delete">${ic('trash')}</button></div></td></tr>`).join(''):`<tr><td colspan="7"><div class="empty">${RD.length?'No riders found.':'No rider accounts yet. Tap "New rider account" to make the first one.'}</div></td></tr>`}
   </tbody></table></div>
   <div class="card pad" style="margin-top:18px"><p class="note" style="margin:0">Orders are given to the available rider with the fewest deliveries. When no rider is available the order uses the demo rider, so customers can still order.</p></div>`;
  $('#addBtn').onclick=()=>open(null);$('#rfCancel').onclick=()=>$('#rf').hidden=true;$('#rf').onsubmit=save;
  $('#q').oninput=e=>{q=e.target.value.trim().toLowerCase();const p=e.target.selectionStart;draw();const n=$('#q');n.focus();n.setSelectionRange(p,p)};stamp()}
function open(r){editId=r?r.id:null;const f=$('#rf');f.hidden=false;$('#rfTitle').textContent=r?'Edit rider':'New rider account';$('#cred').hidden=!!r;$('#rfNote').hidden=!!r;$('#rfGo').textContent=r?'Save changes':'Create account';showMsg('#rfMsg','');
  f.name.value=r?r.n:'';f.phone.value=r?r.p:'';f.vehicle.value=r?r.v||VEH[0]:VEH[0];f.plate.value=r?r.pl||'':'';f.u.required=!r;f.p.required=!r;f.scrollIntoView({block:'center'});f.name.focus()}
async function save(e){e.preventDefault();const f=e.target,b={name:f.name.value,phone:f.phone.value,vehicle:f.vehicle.value,plate:f.plate.value};
  if(!editId){b.u=f.u.value;b.p=f.p.value}
  const g=$('#rfGo');g.disabled=true;const r=editId?await api('/api/admin/riders/'+editId,b,'PUT'):await api('/api/admin/riders',b);g.disabled=false;
  if(!r.ok)return showMsg('#rfMsg',r.error||'Could not save.');toast(editId?'Rider updated':'Rider account created');f.hidden=true;await load()}
async function load(){const r=await api('/api/admin/riders');if(!r.riders)return;RD=r.riders;VEH=r.vehicles;if($('#rf')&&!$('#rf').hidden)return;draw()}   // do not redraw while the form is open
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.edit)return open(RD.find(r=>r.id==b.dataset.edit));
  const r=RD.find(x=>x.id==(b.dataset.pw||b.dataset.off||b.dataset.del));if(!r)return;
  if(b.dataset.pw){const p=prompt('New password for '+r.n+' (6+ characters):');if(p===null)return;const x=await api('/api/admin/riders/'+r.id,{password:p},'PUT');toast(x.ok?'Password changed. Tell the rider.':(x.error||'Could not change'))}
  else if(b.dataset.off){const x=await api('/api/admin/riders/'+r.id,{disabled:!r.disabled},'PUT');toast(x.ok?(r.disabled?'Account switched on':'Account switched off. The rider can not log in.'):(x.error||'Could not change'));load()}
  else if(b.dataset.del){if(!confirm('Delete the rider account of '+r.n+'?'))return;const x=await api('/api/admin/riders/'+r.id,null,'DELETE');toast(x.ok?'Rider account deleted':(x.error||'Could not delete'));load()}});
adminReady.then(()=>{$('#v-riders').innerHTML='<div class="empty">Loading…</div>';load();poll(load,15000)});
