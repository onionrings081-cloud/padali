/* admin_stores.js - /admin/stores : add, edit, delete stores and switch them open / closed. */
let ST=[],editId=null,spos=null;
const stars2=s=>s.rc?`<span class="stars">${ic('star')} ${s.rating.toFixed(1)} <small>(${s.rc})</small></span>`:'<small>No ratings</small>';
function rStores(){$('#v-stores').innerHTML=`
  <div class="head-row"><p class="note">${ST.length} stores · ${ST.filter(s=>!s.open).length} closed</p><button class="btn" id="addBtn">${ic('plus')} Add store</button></div>
  <form class="card pad form dish-form" id="sf" hidden><h3 id="sfTitle">Add store</h3>
    <div class="row2"><label>Store name<input name="name" required maxlength="60" autocomplete="off"></label><label>Cuisine / type<input name="cuisine" maxlength="60" autocomplete="off" placeholder="Filipino · Grill"></label></div>
    <label>Short description<input name="description" maxlength="140" autocomplete="off"></label>
    <div class="row2"><label>Address<input name="address" maxlength="80" autocomplete="off"></label><label>Delivery time<input name="eta" maxlength="20" autocomplete="off" placeholder="20-30 min"></label></div>
    <p class="note">Tap the map to place the store pin (this is where the rider starts).</p><div class="pm pick" id="spick"></div>
    <label class="check"><input type="checkbox" name="open" checked> Open for orders</label>
    <div class="msg err" id="sfMsg" hidden></div>
    <div class="actions left"><button class="btn">Save store</button><button class="btn ghost" type="button" id="sfCancel">Cancel</button></div></form>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Store</th><th>Rating</th><th>Dishes</th><th>Sales</th><th>Open</th><th></th></tr></thead><tbody>
  ${ST.map(s=>`<tr class="${s.open?'':'off'}"><td><div class="dn"><span class="em">${ic('store')}</span><div><b>${esc(s.n)}</b><small>${esc(s.cu||'')} · ${esc(s.eta)}${s.owner?' · Owner: '+esc(s.owner):''}</small></div></div></td><td>${stars2(s)}</td><td>${s.dishes}</td><td><b>${peso(s.sales)}</b></td>
   <td><label class="tgl"><input type="checkbox" data-op="${s.id}"${s.open?' checked':''} aria-label="Open"><span></span></label></td>
   <td class="acts"><button class="icon-btn" data-edit="${s.id}" aria-label="Edit">${ic('pencil')}</button><button class="icon-btn danger" data-del="${s.id}" aria-label="Delete">${ic('trash')}</button></td></tr>`).join('')}
  </tbody></table></div>`;
  $('#addBtn').onclick=()=>openForm(null);$('#sfCancel').onclick=()=>$('#sf').hidden=true;$('#sf').onsubmit=save}
function openForm(s){editId=s?s.id:null;const f=$('#sf');f.hidden=false;$('#sfTitle').textContent=s?'Edit store':'Add store';showMsg('#sfMsg','');
  f.name.value=s?s.n:'';f.cuisine.value=s?s.cu||'':'';f.description.value=s?s.d||'':'';f.address.value=s?s.a||'':'';f.eta.value=s?s.eta||'':'';f.open.checked=s?!!s.open:true;f.scrollIntoView({block:'center'});f.name.focus();
  spos=s&&s.lat?{lat:s.lat,lng:s.lng}:null;const c=spos||{lat:9.3356,lng:125.9769};
  if(window.PMap){let pin=null;const map=new PMap($('#spick'),{lat:c.lat,lng:c.lng,zoom:spos?17:15,onClick:ll=>{spos={lat:ll.lat,lng:ll.lng};if(pin)pin.set(ll.lat,ll.lng);else pin=map.addMarker(ll.lat,ll.lng,ic('store'),'pm-pin')}});
    if(spos)pin=map.addMarker(spos.lat,spos.lng,ic('store'),'pm-pin')}}
async function save(e){e.preventDefault();const f=e.target;
  const b={name:f.name.value,cuisine:f.cuisine.value,description:f.description.value,address:f.address.value,eta:f.eta.value,open:f.open.checked,lat:spos&&spos.lat,lng:spos&&spos.lng};
  const r=editId?await api('/api/admin/stores/'+editId,b,'PUT'):await api('/api/admin/stores',b);
  if(!r.ok)return showMsg('#sfMsg',r.error||'Could not save.');toast(editId?'Store updated':'Store added');await load()}
async function load(){ST=(await api('/api/admin/stores')).stores||[];rStores()}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.edit)openForm(ST.find(s=>s.id==b.dataset.edit));
  else if(b.dataset.del){const s=ST.find(x=>x.id==b.dataset.del);if(!confirm('Delete "'+s.n+'"?'))return;
    const r=await api('/api/admin/stores/'+s.id,null,'DELETE');toast(r.ok?'Store deleted':r.error);load()}});
document.addEventListener('change',async e=>{const c=e.target.closest('[data-op]');if(!c)return;
  await api('/api/admin/stores/'+c.dataset.op,{open:c.checked},'PUT');toast(c.checked?'Store is now open':'Store closed. Customers can no longer order from it');load()});
adminReady.then(load);
