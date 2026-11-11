/* sell.js - /sell : a customer applies to put their store on Padali, then follows the status here.
   Admin approves -> the account becomes a Store Owner (the next page load sends them to /owner). */
const dt=iso=>new Date(iso).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
let A=null,H=[],pos=null,pin=null,map=null;
const PILL={pending:['s1','Pending review'],approved:['s2','Approved'],rejected:['sx','Rejected'],closed:['sx','Store removed'],withdrawn:['s0','Withdrawn']};
const pill=s=>{const p=PILL[s]||['s0',s];return `<span class="pill-st ${p[0]}">${p[1]}</span>`};
const STEPS=[['Send your application','Tell us about your store and drop its pin on the map.'],['Admin reviews it','The Padali admin checks your details. You will see the result here.'],['Open your store','When approved, your account becomes a Store Owner with your own dashboard.']];
const steps=on=>`<div class="sell-steps">${STEPS.map((s,i)=>`<div class="st${i<=on?' on':''}"><b><span>${i+1}</span>${s[0]}</b><p>${s[1]}</p></div>`).join('')}</div>`;
const FORM=a=>`<form class="card pad form dish-form" id="sf" autocomplete="off"><h3>Store application</h3>
  <div class="row2"><label>Store name<input name="name" required maxlength="60"></label><label>What do you sell?<input name="cuisine" required maxlength="60" placeholder="Filipino · Grill"></label></div>
  <label>Store description<input name="description" required maxlength="140" placeholder="Tell customers about your store (at least 10 characters)"></label>
  <div class="row2"><label>Store address<input name="address" required maxlength="80"></label><label>Store contact number<input name="phone" required maxlength="11" inputmode="tel" placeholder="09XXXXXXXXX"></label></div>
  <div class="row2"><label>Delivery time (optional)<input name="eta" maxlength="20" placeholder="20-30 min"></label><label>Business permit / registration no. (optional)<input name="permit" maxlength="40"></label></div>
  <p class="note">Tap the map to place your store pin. This is where the rider picks up the order.</p><div class="pm pick" id="spick"></div>
  <div class="msg err" id="sfMsg" hidden></div>
  <div class="actions left"><button class="btn" id="sfGo">Submit application</button></div></form>`;
function fill(a){const f=$('#sf');if(!a)return;['name','cuisine','description','address','phone','eta','permit'].forEach(k=>f[k].value=a[k]||'')}
function mount(a){pos=a&&a.lat!=null?{lat:a.lat,lng:a.lng}:null;pin=null;if(!window.PMap)return;const c=pos||{lat:CENTER.lat,lng:CENTER.lng};
  map=new PMap($('#spick'),{lat:c.lat,lng:c.lng,zoom:pos?17:15,onClick:ll=>{pos={lat:ll.lat,lng:ll.lng};if(pin)pin.set(ll.lat,ll.lng);else pin=map.addMarker(ll.lat,ll.lng,ic('store'),'pm-pin')}});
  if(pos)pin=map.addMarker(pos.lat,pos.lng,ic('store'),'pm-pin')}
function bind(){const f=$('#sf');if(f)f.onsubmit=async e=>{e.preventDefault();const g=$('#sfGo');g.disabled=true;
    const b={...Object.fromEntries(new FormData(f)),lat:pos&&pos.lat,lng:pos&&pos.lng};
    const r=await api('/api/store-application',b);g.disabled=false;
    if(!r.ok)return showMsg('#sfMsg',r.error||'Could not send your application.');
    toast('Application sent. The admin will review it.');await load()};
  const w=$('#wd');if(w)w.onclick=async()=>{if(!confirm('Withdraw your application?'))return;const r=await api('/api/store-application',null,'DELETE');toast(r.ok?'Application withdrawn':(r.error||'Could not withdraw.'));await load()}}
const kv=(l,v)=>`<div class="kv"><small>${l}</small><span>${v?esc(v):'–'}</span></div>`;
function draw(){
  const perks=`<div class="card pad"><h3 class="sec-sm">What you get as a Store Owner</h3><div class="perks">
    <span>${ic('check')}Your own dashboard with sales and best sellers</span><span>${ic('check')}Add and edit your own menu and prices</span>
    <span>${ic('check')}See and reply to what customers say about your store, food and delivery time</span><span>${ic('check')}Open or close your store anytime</span>
    <span>${ic('check')}See the orders for your dishes and the hours customers order most</span><span>${ic('check')}You can still order food like a normal customer</span></div></div>`;
  if(!A){$('#v-sell').innerHTML=`${steps(0)}${FORM(null)}${perks}`;mount(null);return bind()}
  if(A.status==='pending'){$('#v-sell').innerHTML=`${steps(1)}<div class="banner wait">${ic('clock')}<div><h3>${esc(A.name)} ${pill('pending')}</h3><p>Your application was sent on ${dt(A.created_at)}. The admin has not decided yet. This page shows the result as soon as there is one.</p>
    <p style="margin-top:12px"><button class="btn ghost sm danger" id="wd" type="button">Withdraw application</button></p></div></div>
    <div class="card pad"><h3 class="sec-sm">What you sent</h3><div class="vgrid">${kv('Store name',A.name)}${kv('Type of food',A.cuisine)}${kv('Delivery time',A.eta)}${kv('Description',A.description)}${kv('Address',A.address)}${kv('Contact number',A.phone)}${kv('Permit / registration no.',A.permit)}</div></div>`;return bind()}
  const rej=A.status==='rejected',closed=A.status==='closed';
  $('#v-sell').innerHTML=`${steps(0)}<div class="banner bad">${ic('shield-check')}<div><h3>${esc(A.name)} ${pill(A.status)}</h3>
    <p>${rej?'The admin could not approve this application yet. Read the reason, fix the details and send it again.':closed?'Your store was removed by the admin and your account is a normal customer account again. You can apply again.':'You withdrew this application. You can send a new one anytime.'}</p>
    ${A.reason?`<p class="msg err">Reason from the admin: ${esc(A.reason)}</p>`:''}</div></div>${FORM(A)}${perks}`;
  fill(A);mount(A);bind()}
async function load(){const r=await api('/api/store-application');if(r.latest===undefined)return;
  if(r.role==='owner'){location.href='/owner';return}
  A=r.latest;H=r.history||[];if(A&&A.status==='approved')A=null;draw()}
ready.then(()=>{$('#v-sell').innerHTML='<div class="empty">Loading…</div>';load()});
