/* owner_menu.js - /owner/menu : add, edit, delete your own dishes and switch them on/off. Only your store's dishes are shown. */
let ITEMS=[],editId=null;
const CATS=['Meals','Snacks','Drinks','Desserts'];
function rMenu(){$('#v-menu').innerHTML=`
  <div class="head-row"><p class="note">${ITEMS.length} dish${ITEMS.length===1?'':'es'} · ${ITEMS.filter(i=>!i.a).length} switched off</p><button class="btn" id="addBtn">${ic('plus')} Add dish</button></div>
  <form class="card pad form dish-form" id="df" hidden><h3 id="dfTitle">Add dish</h3>
    <div class="row2"><label>Name<input name="name" required maxlength="60" autocomplete="off"></label><label>Price (₱)<input name="price" type="number" min="1" step="0.01" required autocomplete="off"></label></div>
    <label>Description<input name="description" maxlength="140" autocomplete="off"></label>
    <div class="row2"><label>Category<select name="category">${CATS.map(c=>`<option>${c}</option>`).join('')}</select></label><label>Photo link (optional)<input name="image" maxlength="400" autocomplete="off" placeholder="https://... leave empty to use a drawn picture"></label></div>
    <label class="check"><input type="checkbox" name="available" checked> Available to customers</label>
    <div class="msg err" id="dfMsg" hidden></div>
    <div class="actions left"><button class="btn">Save dish</button><button class="btn ghost" type="button" id="dfCancel">Cancel</button></div></form>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Dish</th><th>Category</th><th>Price</th><th>Available</th><th></th></tr></thead><tbody>
  ${ITEMS.length?ITEMS.map(i=>`<tr class="${i.a?'':'off'}"><td><div class="dn"><span class="em">${dish(i)}${pic(i)}</span><div><b>${esc(i.n)}</b><small>${esc(i.d||'')}</small></div></div></td><td>${i.c}</td><td><b>${peso(i.p)}</b></td>
   <td><label class="tgl"><input type="checkbox" data-av="${i.id}"${i.a?' checked':''} aria-label="Available"><span></span></label></td>
   <td class="acts"><button class="icon-btn" data-edit="${i.id}" aria-label="Edit">${ic('pencil')}</button><button class="icon-btn danger" data-del="${i.id}" aria-label="Delete">${ic('trash')}</button></td></tr>`).join(''):`<tr><td colspan="5"><div class="empty">Your menu is empty. Tap “Add dish” to add your first dish.</div></td></tr>`}
  </tbody></table></div>`;
  $('#addBtn').onclick=()=>openForm(null);$('#dfCancel').onclick=()=>$('#df').hidden=true;$('#df').onsubmit=save}
function openForm(i){editId=i?i.id:null;const f=$('#df');f.hidden=false;$('#dfTitle').textContent=i?'Edit dish':'Add dish';showMsg('#dfMsg','');
  f.name.value=i?i.n:'';f.price.value=i?i.p:'';f.description.value=i?i.d||'':'';f.category.value=i?i.c:'Meals';f.image.value=i?i.im||'':'';f.available.checked=i?!!i.a:true;f.scrollIntoView({block:'center'});f.name.focus()}
async function save(e){e.preventDefault();const f=e.target,b={name:f.name.value,price:f.price.value,description:f.description.value,category:f.category.value,image:f.image.value,available:f.available.checked};
  const r=editId?await api('/api/owner/menu/'+editId,b,'PUT'):await api('/api/owner/menu',b);
  if(!r.ok)return showMsg('#dfMsg',r.error||'Could not save.');toast(editId?'Dish updated':'Dish added');await load()}
async function load(){const r=await api('/api/owner/menu');if(!r.items)return;ITEMS=r.items;rMenu()}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.edit)openForm(ITEMS.find(i=>i.id==b.dataset.edit));
  else if(b.dataset.del){const i=ITEMS.find(x=>x.id==b.dataset.del);if(!confirm('Delete "'+i.n+'" from your menu?'))return;await api('/api/owner/menu/'+i.id,null,'DELETE');toast('Dish deleted');load()}});
document.addEventListener('change',async e=>{const c=e.target.closest('[data-av]');if(!c)return;
  await api('/api/owner/menu/'+c.dataset.av,{available:c.checked},'PUT');toast(c.checked?'Dish is now available':'Dish switched off');load()});
adminReady.then(load);
