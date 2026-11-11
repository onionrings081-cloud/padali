/* checkout.js - Checkout page (/checkout) */
let aSt='',aBr='',aNote='',geoT,manualPin=false,method='Cash',wallet='GCash',otype='Delivery',promo={code:'',discount:0},addr='',dest=null,picker=null,tip=0,usePts=false,sched=0,REW={balance:0};
const FEE={Delivery:49},WALLETS=['GCash','Maya','PayPal'];
const totals=()=>{const s=sub(),d=promo.discount||0,f=FEE[otype]*storeCount(),base=Math.max(0,s-d),pts=usePts?Math.min(REW.balance,Math.floor(base*10)):0,tp=otype==='Delivery'?tip:0;
  return{s,d,f,pts,tp,t:Math.round((base-pts/10+f+tp)*100)/100}};   // delivery fee is per store
function payFields(){
  if(method==='Cash')return`<label>Cash on hand (₱)<input name="cash" type="number" min="0" step="0.01" required autocomplete="off"></label>`;
  if(method==='Card')return`<div class="cbrands"><span>We accept</span>${['Visa','Mastercard','JCB'].map(b=>payLogo(b,'md')).join('')}</div>
  <div class="ccard" id="ccard"><div class="cc-top"><span class="cc-chip"></span><span class="cc-brand" id="ccBrand"></span></div><div class="cc-num" id="ccNum">•••• •••• •••• ••••</div><div class="cc-bot"><span id="ccName">YOUR NAME</span><span id="ccExp">MM/YY</span></div></div>
  <label>Name on card<input name="cn" required autocomplete="off"></label><label>Card number<input name="num" inputmode="numeric" placeholder="16 digits" maxlength="19" required autocomplete="off"></label><div class="row2"><label>Expiry<input name="exp" placeholder="MM/YY" required autocomplete="off"></label><label>CVV<input name="cvv" inputmode="numeric" maxlength="3" required autocomplete="off"></label></div>`;
  return`<p class="lbl2">Choose your e-wallet</p><input type="hidden" name="w" value="${wallet}"><div class="wallets">${WALLETS.map(w=>`<button type="button" class="wallet${w===wallet?' on':''}" data-w="${w}" aria-label="${w}" aria-pressed="${w===wallet}">${payLogo(w,'lg')}</button>`).join('')}</div><div id="wfield">${walletField()}</div>`}
const walletField=()=>wallet==='PayPal'?`<label>PayPal email<input name="pp" type="email" placeholder="you@email.com" required autocomplete="off"></label>`:`<label>Mobile number<input name="mob" inputmode="tel" placeholder="09XXXXXXXXX" required autocomplete="off"></label>`;
function rSum(){const T=totals();$('#sum').innerHTML=`<h3>Order summary</h3>${byStore([...lines(),...clines()]).map(([s,ls])=>`<h4 class="grp">${ic('store')} ${esc(s)}</h4>${ls.map(l=>`<div class="rl"><span>${l.q} × ${esc(l.n)}${l.custom?' <small class="from-s">(estimate)</small>':''}</span><span>${peso(l.p*l.q)}</span></div>`).join('')}`).join('')}<div class="rl"><span>Subtotal</span><span>${peso(T.s)}</span></div>${T.d?`<div class="rl ok"><span>Promo ${esc(promo.code)}</span><span>−${peso(T.d)}</span></div>`:''}${T.f?`<div class="rl"><span>Delivery fee${storeCount()>1?' ('+storeCount()+' stores)':''}</span><span>${peso(T.f)}</span></div>`:''}${T.tp?`<div class="rl"><span>Rider tip</span><span>${peso(T.tp)}</span></div>`:''}${T.pts?`<div class="rl ok"><span>Rewards points (${T.pts} pts)</span><span>−${peso(T.pts/10)}</span></div>`:''}<div class="sum"><span>Total</span><b>${peso(T.t)}</b></div>`;const b=$('#payBtn');if(b)b.textContent='Pay '+peso(T.t)}
function rCheckout(){if(!lines().length&&!ccart.length){location.href='/menu';return}
  $('#v-checkout').innerHTML=`<div class="co"><div class="card panel"><p class="step">1. Delivery details <small class="meta">· +${peso(FEE.Delivery)} per store</small></p>
  ${otype==='Delivery'?`<p class="lbl2">Delivery address <small class="meta">(type it yourself, or skip it and use the map pin / GPS below)</small></p>
  <label class="addr">House no. / Street / Purok<input id="aSt" value="${esc(aSt)}" placeholder="e.g. 123 Rizal St., Purok 2" autocomplete="street-address"></label>
  <label class="addr">Barangay<input id="aBr" value="${esc(aBr)}" placeholder="e.g. Poblacion" autocomplete="off"></label>
  <label class="addr">Landmark / note for the rider <small class="meta">(optional)</small><input id="aNote" value="${esc(aNote)}" placeholder="e.g. beside the barangay hall, blue gate" autocomplete="off"></label>
  <p class="lbl2">Map pin <small class="meta">(optional) · we place it from your address, or tap the map to set it yourself</small></p><div class="pm pick" id="pick"></div>
  <div class="pick-bar"><button type="button" class="btn ghost sm" data-loc>${ic('map-pin')} Use my location</button><span class="meta" id="pickInfo"></span></div>
  <p class="lbl2">Tip your rider</p><div class="tips">${[0,10,20,50].map(v=>`<button type="button" class="chip${v===tip?' on':''}" data-tip="${v}">${v?peso(v).replace('.00',''):'No tip'}</button>`).join('')}</div>`:''}
  ${`<label class="addr">Deliver when?<select id="sched">${[[0,'As soon as possible'],[30,'In 30 minutes'],[60,'In 1 hour'],[120,'In 2 hours']].map(([v,l])=>`<option value="${v}"${v===sched?' selected':''}>${l}</option>`).join('')}</select></label>`}
  <p class="step">2. Promo code and rewards</p><div class="promo-row"><input id="pcode" placeholder="Enter a code" value="${esc(promo.code)}" autocomplete="off"><button class="btn ghost" type="button" data-promo>Apply</button></div><div class="msg" id="promoMsg" hidden></div>
  <label class="check pts"><input type="checkbox" id="usePts"${usePts?' checked':''}${REW.balance?'':' disabled'}> Use my Padali Rewards points (${REW.balance} pts = ${peso(REW.balance/10)})</label>
  <p class="step">3. Payment method</p><div class="methods">${[['Cash','banknote'],['Card','credit-card'],['E-Wallet','smartphone']].map(([m,i])=>`<button class="method${m===method?' on':''}" data-m="${m}">${ic(i)}<span>${m}</span></button>`).join('')}</div>
  <form id="payForm" class="form">${payFields()}<label class="check"><input type="checkbox" name="notify" checked> Send order confirmation to ${esc(user.email)}</label><div class="msg err" id="payMsg" hidden></div><button class="btn block lg" id="payBtn"></button></form></div>
  <aside class="card cart-sum" id="sum"></aside></div>`;
  rSum();$('#payForm').onsubmit=pay;if($('#aSt')){$('#aSt').oninput=e=>{aSt=e.target.value;addrChanged()};$('#aBr').oninput=e=>{aBr=e.target.value;addrChanged()};$('#aNote').oninput=e=>aNote=e.target.value}
  mountPicker();$('#usePts').onchange=e=>{usePts=e.target.checked;rCheckout()};if($('#sched'))$('#sched').onchange=e=>sched=+e.target.value}
const syncAddr=()=>{addr=[aSt,aBr].map(x=>x.trim()).filter(Boolean).join(', ')};
const fullAddr=()=>addr+(addr&&aNote.trim()?' ('+aNote.trim()+')':'');
function addrChanged(){syncAddr();clearTimeout(geoT);geoT=setTimeout(()=>picker&&picker.fromAddr(),900)}
async function pay(e){syncAddr();e.preventDefault();if(addr.trim().length<5&&!dest)return showMsg('#payMsg','Type your delivery address or drop a pin on the map (or tap Use my location).');const f=Object.fromEntries(new FormData(e.target));
  const r=await api('/api/orders',{items:Object.entries(cart).map(([id,n])=>({id:+id,q:n})),method,details:f,notify:!!f.notify,promo:promo.code,otype,addr:fullAddr(),lat:otype==='Delivery'&&dest?dest.lat:undefined,lng:otype==='Delivery'&&dest?dest.lng:undefined,tip:otype==='Delivery'?tip:0,points:totals().pts,sched,custom:ccart.map(c=>({name:c.n,store:c.s,q:c.q,p:c.p,note:c.no}))});
  if(!r.ok)return showMsg('#payMsg','Payment failed. '+(r.error||'Try again.')+' Review your details and try again.');
  cart={};ccart=[];saveCart();sessionStorage.setItem('padali_receipt',JSON.stringify(r.order));location.href='/receipt'}
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
  if(d.tip){tip=+d.tip;rCheckout()}
  else if('loc' in d){if(!navigator.geolocation)return toast('Your browser can not share its location');navigator.geolocation.getCurrentPosition(p=>picker&&picker.set({lat:p.coords.latitude,lng:p.coords.longitude},true),()=>toast('Could not get your location. Tap the map instead.'))}
  else if(d.m){method=d.m;rCheckout()}
  else if(d.w){wallet=d.w;$$('.wallet').forEach(b=>{const on=b.dataset.w===wallet;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});const h=$('input[name="w"]');if(h)h.value=wallet;$('#wfield').innerHTML=walletField()}
  else if('promo' in d){const code=$('#pcode').value.trim(),r=await api('/api/promo',{code,subtotal:sub()});
    if(!r.ok||!code){promo={code:'',discount:0};showMsg('#promoMsg',code?r.error:'Enter a promo code first.')}else{promo={code:code.toUpperCase(),discount:r.discount};showMsg('#promoMsg',`Promo applied. You saved ${peso(r.discount)}.`,true)}rSum()}});
/* map where the customer drops the delivery pin */
function mountPicker(){const el=$('#pick');picker=null;if(!el||!window.PMap){if(el)el.outerHTML='<p class="meta">The map needs an internet connection.</p>';return}
  const sts=[...new Set(lines().map(l=>l.s))].map(storeOf).filter(s=>s.lat),c=dest||(sts[0]?{lat:sts[0].lat,lng:sts[0].lng}:CENTER);
  const map=new PMap(el,{lat:c.lat,lng:c.lng,zoom:dest?16:15,onClick:ll=>{set(ll,false,true);fillAddr(ll)}});sts.forEach(s=>map.addMarker(s.lat,s.lng,ic('store'),'pm-pin'));
  let pin=dest?map.addMarker(dest.lat,dest.lng,ic('map-pin'),'pm-pin home'):null;
  const info=m=>{const e=$('#pickInfo');if(!e)return;if(m)e.textContent=m;else if(!dest)e.textContent='Tap the map to drop your delivery pin.';
    else{const s=sts[0];if(!s)e.textContent='Pin saved.';else{const km=hav(dest,s);e.textContent=`${km.toFixed(1)} km from ${s.n} · about ${Math.max(5,Math.round(km/20*60))} min by motorcycle`}}};
  function set(ll,pan,byUser){if(byUser)manualPin=true;if(hav(ll,CENTER)>RADIUS)return info(`Sorry, that spot is outside our delivery area (${AREA}).`);
    dest={lat:ll.lat,lng:ll.lng};if(pin)pin.set(dest.lat,dest.lng);else pin=map.addMarker(dest.lat,dest.lng,ic('map-pin'),'pm-pin home');if(pan)map.setView(dest.lat,dest.lng,16);info()}
  async function fromAddr(){const a=addr.trim();if(manualPin||a.length<5)return;info('Finding your address on the map…');const r=await api('/api/geocode',{q:a});if(addr.trim()!==a||manualPin)return;
    if(r.ok)set({lat:r.lat,lng:r.lng},true);else{dest=null;if(pin){pin.remove();pin=null}info(r.error||'Could not find that address. Tap the map to place your pin.')}}
  async function fillAddr(ll){if(addr.trim().length>=5)return;const r=await api('/api/geocode',ll);if(r.ok&&r.addr&&addr.trim().length<5){aSt=r.addr;aBr='';syncAddr();const i=$('#aSt');if(i)i.value=aSt;const b=$('#aBr');if(b)b.value=''}}
  picker={set:(ll,pan)=>{set(ll,pan,true);fillAddr(ll)},fromAddr};info();if(!dest&&addr.trim().length>=5)fromAddr()}
/* live card preview: shows the card brand logo as the customer types the number */
const cardBrand=n=>/^4/.test(n)?'Visa':/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(n)?'Mastercard':/^35/.test(n)?'JCB':'';
document.addEventListener('input',e=>{const i=e.target;if(!i.closest||!i.closest('#payForm')||!$('#ccard'))return;
  if(i.name==='num'){const d=i.value.replace(/\D/g,'').slice(0,16);i.value=d.replace(/(.{4})(?=.)/g,'$1 ');const p=(d+'•'.repeat(16)).slice(0,16).replace(/(.{4})/g,'$1 ').trim();$('#ccNum').textContent=p;const b=cardBrand(d);$('#ccBrand').innerHTML=b?payLogo(b,'md'):'';$$('.cbrands .plg').forEach(x=>x.classList.toggle('dim',!!b&&x.dataset.pay!==PAYKEY[b]))}
  else if(i.name==='cn')$('#ccName').textContent=i.value.trim().toUpperCase()||'YOUR NAME';
  else if(i.name==='exp')$('#ccExp').textContent=i.value.trim()||'MM/YY'});
window.onCartChange=rCheckout;
ready.then(async()=>{aSt=((await api('/api/profile')).profile||{}).addr||'';syncAddr();REW=await api('/api/rewards');rCheckout()});
