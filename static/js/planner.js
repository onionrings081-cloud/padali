/* planner.js - "Kain Tayo" budget planner (/planner)
   Type your budget, how many people and what you crave. Padali builds the best combos from the stores that are open right now
   (cheapest, best rated, and a mixed "barkada" order), counts the delivery fee per store, and adds everything to your cart in one tap. */
const FEE=49;
const MOODS={full:{n:'Kumpleto',d:'Ulam + inumin + extra',i:'utensils',main:['Meals'],side:['Drinks'],extra:['Desserts','Snacks']},
  meals:{n:'Ulam lang',d:'Meals na busog',i:'drumstick',main:['Meals'],side:[],extra:['Snacks']},
  merienda:{n:'Merienda',d:'Snacks + inumin',i:'cookie',main:['Snacks'],side:['Drinks'],extra:['Desserts']},
  sweet:{n:'Matamis',d:'Dessert + inumin',i:'cake-slice',main:['Desserts'],side:['Drinks'],extra:['Snacks']}};
const PLAN_T={cheap:['Pinaka-tipid','Lowest total that still feeds everyone','tag'],top:['Pinaka-masarap','Best rated dishes from the best rated store','star'],mix:['Barkada mix','Different dishes for everyone, can mix two stores','users']};
let inp=LS.get('oms_planner',{budget:500,people:2,mood:'full'}),res=null,PL=[];
const dscore=m=>(m.fc?m.fr:4)+((storeOf(m.s).rating||4)/10);

function makePlan(mainIds,sideIds,strat,people,budget,mood){
  const M=MOODS[mood],by=(cats,ids)=>MENU.filter(m=>isOpen(storeOf(m.s))&&cats.includes(m.c)&&ids.includes(m.s));
  const sorter=strat==='cheap'?(a,b)=>a.p-b.p:(a,b)=>dscore(b)-dscore(a)||a.p-b.p;
  const mains=by(M.main,mainIds).sort(sorter);if(!mains.length)return null;
  const both=[...new Set([...mainIds,...sideIds])],sides=by(M.side,sideIds).sort(sorter),extras=by(M.extra,both).sort(sorter),cart={};
  const get=id=>MENU.find(x=>x.id==id),fee=()=>FEE*new Set(Object.keys(cart).map(id=>get(id).s)).size,total=()=>Object.entries(cart).reduce((t,[id,q])=>t+get(id).p*q,0)+fee();
  const add=m=>cart[m.id]=(cart[m.id]||0)+1,tryAdd=m=>{add(m);if(total()>budget){if(!--cart[m.id])delete cart[m.id];return false}return true};
  for(let i=0;i<people;i++)add(strat==='cheap'?mains[0]:strat==='top'?mains[i%Math.min(2,mains.length)]:mains[i%mains.length]);
  if(total()>budget)return{over:true,total:total()};
  for(let i=0;i<people&&sides.length;i++)if(!tryAdd(strat==='cheap'?sides[0]:sides[i%Math.min(strat==='mix'?sides.length:2,sides.length)]))break;
  if(strat!=='cheap')for(let i=0;i<Math.ceil(people/2)&&extras.length;i++)if(!tryAdd(extras[i%Math.min(2,extras.length)]))break;
  const lines=Object.entries(cart).map(([id,q])=>({m:get(id),q})),t=total();
  return{lines,total:t,fee:fee(),stores:[...new Set(lines.map(l=>storeOf(l.m.s).n))],left:budget-t,
    score:lines.reduce((a,l)=>a+dscore(l.m)*l.q,0)+lines.length*(strat==='mix'?2:.8)+(strat==='top'?0:0),key:lines.map(l=>l.m.id+'x'+l.q).sort().join()}}

function buildPlans(){const {budget,people,mood}=inp,open=STORES.filter(isOpen).map(s=>s.id);let minNeed=Infinity;
  const singles=open.map(id=>[[id],[id]]),pairs=[];open.forEach(a=>open.forEach(b=>{if(a!==b)pairs.push([[a],[b]])}));
  const best=(strat,cands)=>{let b=null;for(const [a,c] of cands){const p=makePlan(a,c,strat,people,budget,mood);if(!p)continue;if(p.over){minNeed=Math.min(minNeed,p.total);continue}
    const sc=strat==='cheap'?-p.total+p.lines.length*.01:p.score;if(!b||sc>b.sc){b=p;b.sc=sc}}return b};
  const out=[],seen=new Set();
  for(const [k,c] of [['cheap',singles],['top',singles],['mix',[...singles,...pairs]]]){const p=best(k,c);if(p&&!seen.has(p.key)){seen.add(p.key);out.push({k,...p})}}
  return{plans:out,minNeed:isFinite(minNeed)?minNeed:null}}

const planCard=(p,i)=>`<article class="card plan"><header><span class="pi">${ic(PLAN_T[p.k][2])}</span><div><h3>${PLAN_T[p.k][0]}</h3><small>${PLAN_T[p.k][1]}</small></div></header>
  <p class="plan-st">${p.stores.map(s=>`<span class="tag">${ic('store')} ${esc(s)}</span>`).join('')}</p>
  <div class="plan-l">${p.lines.map(l=>`<div class="rl"><span>${l.q} × ${esc(l.m.n)}${l.m.fc?` <small class="from-s">★ ${Number(l.m.fr).toFixed(1)}</small>`:''}</span><span>${peso(l.m.p*l.q)}</span></div>`).join('')}
   <div class="rl"><span>Delivery fee (${p.stores.length} store${p.stores.length>1?'s':''})</span><span>${peso(p.fee)}</span></div></div>
  <div class="sum"><span>Total</span><b>${peso(p.total)}</b></div>
  <p class="meta left">${peso(p.total/inp.people)} per person · ${p.left>=1?`${peso(p.left)} left from your budget`:'right on budget'}</p>
  <button class="btn block" data-plan="${i}">${ic('shopping-cart')} Add all to cart</button></article>`;

function rPlanner(){const m=MOODS[inp.mood];
  $('#v-planner').innerHTML=`<div class="card hero-card plan-hero"><div><h2>Kain Tayo Planner</h2><p>Tell us your budget and how many are eating. We plan the whole order for you: the best combos from stores that are open right now, delivery fees included.</p></div><span class="pi big">${ic('sparkles')}</span></div>
  <div class="card panel plan-form"><div class="row2"><label>Budget (₱)<input id="pb" type="number" min="50" max="20000" step="10" value="${inp.budget}" inputmode="numeric"></label><label>How many people?<input id="pp" type="number" min="1" max="30" value="${inp.people}" inputmode="numeric"></label></div>
   <div class="chips">${[150,300,500,1000,2000].map(v=>`<button class="chip${v===inp.budget?' on':''}" data-bud="${v}">${peso(v).replace('.00','')}</button>`).join('')}</div>
   <p class="lbl2">What are you craving?</p><div class="cats four">${Object.entries(MOODS).map(([k,v])=>`<button class="cat${k===inp.mood?' on':''}" data-mood="${k}">${ic(v.i)}<span>${v.n}</span><small>${v.d}</small></button>`).join('')}</div>
   <div class="msg err" id="plMsg" hidden></div><button class="btn lg" id="plGo">${ic('sparkles')} Plan my order</button></div>
  <div id="plOut">${res?out():''}</div>`;
  $('#pb').oninput=e=>{inp.budget=+e.target.value;$$('[data-bud]').forEach(b=>b.classList.toggle('on',+b.dataset.bud===inp.budget))};
  $('#pp').oninput=e=>inp.people=+e.target.value}
function out(){if(!res.plans.length)return `<div class="empty">${res.minNeed?`That budget is too small for ${inp.people} ${inp.people>1?'people':'person'}. The cheapest plan needs about <b>${peso(res.minNeed)}</b>.`:'No open store has what you are craving right now. Try another craving.'}</div>`;
  return `<h3 class="sec"><span>${ic('sparkles')} Your plans for ${inp.people} ${inp.people>1?'people':'person'} · ${peso(inp.budget)}</span></h3><div class="plans">${res.plans.map(planCard).join('')}</div>`}
function go(){inp.budget=Math.round(+$('#pb').value);inp.people=Math.round(+$('#pp').value);
  if(!(inp.budget>=50&&inp.budget<=20000))return showMsg('#plMsg','Enter a budget from ₱50 to ₱20,000.');
  if(!(inp.people>=1&&inp.people<=30))return showMsg('#plMsg','Enter 1 to 30 people.');
  showMsg('#plMsg','');LS.set('oms_planner',inp);res=buildPlans();PL=res.plans;$('#plOut').innerHTML=out()}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.bud){inp.budget=+d.bud;$('#pb').value=inp.budget;$$('[data-bud]').forEach(x=>x.classList.toggle('on',x===b))}
  else if(d.mood){inp.mood=d.mood;$$('[data-mood]').forEach(x=>x.classList.toggle('on',x===b))}
  else if(b.id==='plGo')go();
  else if(d.plan!==undefined){PL[+d.plan].lines.forEach(l=>cart[l.m.id]=(cart[l.m.id]||0)+l.q);saveCart();toast('Plan added to your cart');openCart(true)}});
ready.then(rPlanner);
