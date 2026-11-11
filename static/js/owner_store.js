/* owner_store.js - /owner/store : your store details, the map pin and the open / closed switch. The store name is locked (orders and comments are linked to it). */
let S=null,pos=null,pin=null,map=null;
function draw(){
  $('#v-store').innerHTML=`<div class="banner ok">${ic('circle-check')}<div><h3>${esc(S.name)} <span class="pill-st s2">Approved</span></h3><p>Your store is live on Padali${S.since?' since '+dt(S.since):''}. ${S.rc?`Customers rate it ${S.rating.toFixed(1)} ★ (${S.rc} comment${S.rc===1?'':'s'}).`:'It has no ratings yet.'}</p></div></div>
   <div class="card pad head-row" style="margin-bottom:22px"><div><b>Open for orders</b><p class="note" style="margin:4px 0 0">Switch off when you are closed. Customers still see the store but can not order.</p></div><label class="tgl"><input type="checkbox" id="opn"${S.open?' checked':''} aria-label="Open for orders"><span></span></label></div>
   <form class="card pad form dish-form" id="sf" autocomplete="off"><h3>Store details</h3>
    <div class="row2"><label>Store name<input name="name" readonly title="The name can not be changed"></label><label>What do you sell?<input name="cuisine" required maxlength="60"></label></div>
    <label>Store description<input name="description" required maxlength="140"></label>
    <div class="row2"><label>Store address<input name="address" required maxlength="80"></label><label>Store contact number<input name="phone" required maxlength="11" inputmode="tel" placeholder="09XXXXXXXXX"></label></div>
    <div class="row2"><label>Delivery time<input name="eta" maxlength="20" placeholder="20-30 min"></label><label>Business permit / registration no.<input name="permit" maxlength="40"></label></div>
    <p class="note">Tap the map to move your store pin. This is where the rider picks up the order.</p><div class="pm pick" id="spick"></div>
    <div class="msg err" id="sfMsg" hidden></div><div class="actions left"><button class="btn" id="sfGo">Save changes</button></div></form>`;
  const f=$('#sf');['name','cuisine','description','address','phone','eta','permit'].forEach(k=>f[k].value=S[k]||'');
  pos=S.lat!=null?{lat:S.lat,lng:S.lng}:null;pin=null;
  if(window.PMap){const c=pos||{lat:9.3356,lng:125.9769};map=new PMap($('#spick'),{lat:c.lat,lng:c.lng,zoom:pos?17:15,onClick:ll=>{pos={lat:ll.lat,lng:ll.lng};if(pin)pin.set(ll.lat,ll.lng);else pin=map.addMarker(ll.lat,ll.lng,ic('store'),'pm-pin')}});
    if(pos)pin=map.addMarker(pos.lat,pos.lng,ic('store'),'pm-pin')}
  f.onsubmit=async e=>{e.preventDefault();const g=$('#sfGo');g.disabled=true;const r=await api('/api/owner/store',{...Object.fromEntries(new FormData(f)),lat:pos&&pos.lat,lng:pos&&pos.lng},'PUT');g.disabled=false;
    if(!r.ok)return showMsg('#sfMsg',r.error||'Could not save.');toast('Store details saved');await load()};
  const o=$('#opn');o.onchange=async()=>{const r=await api('/api/owner/store',{open:o.checked},'PUT');toast(r.ok?(o.checked?'Your store is open':'Your store is closed'):(r.error||'Could not change.'));load()}}
async function load(){const r=await api('/api/owner/store');if(!r.store)return;S=r.store;draw()}
adminReady.then(()=>{$('#v-store').innerHTML='<div class="empty">Loading…</div>';load()});
