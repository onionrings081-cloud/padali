/* menu.js - Stores & menu page (/menu)
   browse stores (sort, categories) · open a store (dishes + reviews) · search any store or dish · "Surprise me" · special request */
let rvKind='store',store=null,cat='All',gcat='All',sort='rec',q='',sur=null;
const GC=[['All','grid'],['Meals','utensils'],['Snacks','cookie'],['Drinks','cup-soda'],['Desserts','cake-slice']];

const storeHead=s=>{const c=coverOf(s);
  return `<div class="card store-head"><span class="cover">${badge(s)}${ic('store')}${c?pic(c):''}</span><div><h2>${esc(s.n)}</h2><p class="sub">${esc(s.cu)} · ${esc(s.d||'')}</p><div class="meta2">${stars(s.rating,s.rc)}<span class="eta" style="margin:0">${ic('map-pin')} ${esc(s.a)}, ${esc(AREA)}</span><span class="eta" style="margin:0">${ic('clock')} ${esc(s.eta)}</span></div>${isOpen(s)?'':`<p class="msg err" style="margin-top:12px">This store is closed right now. You can look around but can't order yet.</p>`}</div></div>`};
const sorted=L=>[...L].sort((a,b)=>(isOpen(b)-isOpen(a))||(sort==='top'?b.rating-a.rating:sort==='fast'?mins(a)-mins(b):a.id-b.id));
const surCard=m=>`<div class="card surprise"><span class="cover">${dish(m)}${pic(m)}</span><div><span class="tag am">${ic('shuffle')} Today's pick</span><h3 style="margin-top:8px">${esc(m.n)}</h3><p>${esc(storeOf(m.s).n)} · <b>${peso(m.p)}</b></p><p>${esc(m.d)}</p></div><div class="acts2"><button class="btn" data-add="${m.id}">Add to cart</button><button class="btn ghost" data-sur>${ic('shuffle')} Another one</button></div></div>`;

const REQ=`<div class="card req"><div class="req-h"><div><h3>Can't find what you want?</h3><p>Request any food from any store or restaurant, even if it's not listed here. A rider will buy it for you.</p></div><button class="btn ghost" data-req>${ic('plus')} Special request</button></div>
    <form id="reqForm" class="form" hidden>
      <label>What do you want to order?<input name="n" required minlength="2" maxlength="80" autocomplete="off" placeholder="Example: 2-pc chicken with spaghetti"></label>
      <div class="row2"><label>From which store / restaurant? (optional)<input name="s" maxlength="60" autocomplete="off" placeholder="Example: the fried chicken place near the plaza"></label><label>Quantity<input name="q" type="number" min="1" max="20" value="1" required></label></div>
      <div class="row2"><label>Estimated price each (₱)<input name="p" type="number" min="1" max="5000" step="0.01" required autocomplete="off"></label><label>Notes for the rider (optional)<input name="no" maxlength="140" autocomplete="off" placeholder="No onions, extra gravy..."></label></div>
      <p class="note">You are charged the estimated price. The rider confirms the actual price with you.</p>
      <div class="msg err" id="reqMsg" hidden></div><button class="btn">Add to cart</button></form></div>`;
function rMenu(){const S=store&&STORES.find(s=>s.id===store);if(store&&!S)store=null;
  const cats=S?['All',...new Set(dishesOf(S.id).map(i=>i.c))]:[];
  $('#v-menu').innerHTML=`<div class="tools"><div class="search"><span class="s-ic">${ic('search')}</span><input id="q" placeholder="${S?'Search in '+esc(S.n):'Search any store or food in '+esc(AREA)}" autocomplete="off" value="${esc(q)}"></div>${S?`<button class="btn ghost" data-store="">← All stores</button>`:`<button class="btn ghost" data-sur>${ic('shuffle')} Surprise me</button>`}</div>
  <div id="sur">${sur?surCard(sur):''}</div>
  ${S?'':REQ}
  ${S?storeHead(S)+`<div class="chips sp">${cats.map(c=>`<button class="chip${c===cat?' on':''}" data-cat="${c}">${c}</button>`).join('')}</div>`
     :`<div class="cats">${GC.map(([c,i])=>`<button class="cat${c===gcat?' on':''}" data-gcat="${c}">${ic(i)}<span>${c==='All'?'All stores':c}</span></button>`).join('')}</div>`}
  <div id="body"></div>${S?REQ:''}`;
  $('#v-menu').classList.toggle('in-store',!!S);
  $('#q').oninput=e=>{q=e.target.value;rBody()};
  $('#reqForm').onsubmit=request;rBody();
}

/* three kinds of comments, each in its own tab: about the store, about the food, about the delivery time */
const RV={store:['Store','/reviews','Service, packaging and how the store is run'],food:['Food','/food-reviews','Taste and serving size of the dishes'],delivery:['Delivery time','/delivery-reviews','How fast orders with this store arrived']};
async function loadRevs(){const e=$('#revs');if(!e||!store)return;const k=rvKind,r=await api('/api/stores/'+store+RV[k][1]);if(!$('#revs')||k!==rvKind)return;
  e.innerHTML=`<h3 class="sec">What customers say</h3><div class="chips sp">${Object.entries(RV).map(([id,v])=>`<button class="chip${id===k?' on':''}" data-rv="${id}">${v[0]}</button>`).join('')}</div>
   <p class="meta left">${RV[k][2]}</p><div class="sumline">${stars(r.avg,r.n)}</div>
   <div class="revs">${(r.reviews||[]).map(v=>revItem(v,k==='food'?esc(v.item_name):k==='delivery'?esc(SPEED[v.speed]||''):'')).join('')||`<div class="empty">No comments here yet.</div>`}</div>`}
function rBody(){const t=q.trim().toLowerCase(),b=$('#body');
  if(store){const L=dishesOf(store).filter(i=>(cat==='All'||i.c===cat)&&(!t||(i.n+i.d).toLowerCase().includes(t)));
    b.innerHTML=`<div class="items">${L.length?L.map(card).join(''):`<div class="empty">No dishes match your search.</div>`}</div><div id="revs"></div>`;loadRevs();return}
  const sortBar=`<div class="sortrow"><span class="lbl">Sort by</span><div class="chips">${[['rec','Recommended'],['top','Top rated'],['fast','Fastest']].map(([k,l])=>`<button class="chip${k===sort?' on':''}" data-sort="${k}">${l}</button>`).join('')}</div></div>`;
  if(!t&&gcat==='All'){b.innerHTML=`<h3 class="sec">Stores in ${esc(AREA)}</h3>${sortBar}<div class="stores">${sorted(STORES).map(storeCard).join('')||`<div class="empty">No stores yet.</div>`}</div>`;return}
  const S=gcat==='All'?STORES.filter(s=>(s.n+s.cu).toLowerCase().includes(t)):[],
        L=MENU.filter(i=>(gcat==='All'||i.c===gcat)&&(!t||(i.n+i.d+storeOf(i.s).n).toLowerCase().includes(t)));
  b.innerHTML=(S.length?`<h3 class="sec">Stores</h3><div class="stores">${sorted(S).map(storeCard).join('')}</div>`:'')+
    (L.length?`<h3 class="sec">${gcat==='All'?'Dishes':gcat+' from every store'}</h3><div class="items">${L.map(card).join('')}</div>`:'')+
    (S.length||L.length?'':`<div class="empty">Nothing matches "${esc(q)}". Try a special request above.</div>`)}

function request(e){e.preventDefault();const f=e.target,p=parseFloat(f.p.value),n=parseInt(f.q.value,10);
  if(f.n.value.trim().length<2||!(p>0&&p<=5000)||!(n>=1&&n<=20))return showMsg('#reqMsg','Enter what you want, a quantity of 1-20 and an estimated price.');
  addCustom({n:f.n.value.trim(),s:f.s.value.trim(),q:n,p,no:f.no.value.trim()});
  f.reset();f.q.value=1;f.hidden=true;showMsg('#reqMsg','');toast('Special request added to your cart');openCart(true)}

function surprise(){const pool=MENU.filter(m=>isOpen(storeOf(m.s)));if(!pool.length)return toast('No stores are open right now');
  let m;do{m=pool[Math.floor(Math.random()*pool.length)]}while(pool.length>1&&sur&&m.id===sur.id);
  sur=m;$('#sur').innerHTML=surCard(m)}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.rv){rvKind=d.rv;loadRevs()}
  else if(d.cat){cat=d.cat;rMenu()}
  else if(d.gcat){gcat=d.gcat;rMenu()}
  else if(d.sort){sort=d.sort;rBody();$$('[data-sort]').forEach(x=>x.classList.toggle('on',x.dataset.sort===sort))}
  else if('sur' in d)surprise();
  else if('store' in d){store=d.store?+d.store:null;rvKind='store';cat='All';q='';sur=null;rMenu();window.scrollTo(0,0)}
  else if('req' in d){const f=$('#reqForm');f.hidden=!f.hidden;if(!f.hidden)f.n.focus()}});
{const pre=sessionStorage.getItem('padali_store');if(pre){sessionStorage.removeItem('padali_store');store=+pre}}
ready.then(()=>{rMenu();if(sessionStorage.getItem('padali_surprise')){sessionStorage.removeItem('padali_surprise');surprise()}});
