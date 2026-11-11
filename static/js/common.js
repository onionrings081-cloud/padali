/* common.js - helpers shared by EVERY page (landing excluded). */
const $=s=>document.querySelector(s),$$=(s,r)=>[...(r||document).querySelectorAll(s)];
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
const peso=n=>'₱'+Number(n).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const ic=n=>`<svg class="i" aria-hidden="true"><use href="/static/icons.svg#i-${n}"/></svg>`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(url,body,m)=>{const r=await fetch(url,{method:m||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});let j={};try{j=await r.json()}catch{}return{ok:r.ok,...j}};
function toast(t){const e=$('#toast');if(!e)return;e.textContent=t;e.hidden=false;e.style.animation='none';void e.offsetWidth;e.style.animation='';clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,2600)}
function showMsg(id,t,ok){const e=$(id);e.textContent=t;e.hidden=!t;e.className='msg '+(ok?'ok':'err')}
/* a message saved before a page redirect (example: "Account created") */
(function(){const t=sessionStorage.getItem('padali_toast');if(t){sessionStorage.removeItem('padali_toast');toast(t)}})();

/* payment logos. Official logo files go in static/img/pay/<key>.svg (or .png), see static/img/pay/README.txt.
   If a file is missing the name shows as a neat badge instead, so nothing looks broken. */
const PAYKEY={GCash:'gcash',Maya:'maya',PayPal:'paypal',Visa:'visa',Mastercard:'mastercard',JCB:'jcb'};
function payImgErr(i){if(!i.dataset.png){i.dataset.png=1;i.src='/static/img/pay/'+i.dataset.k+'.png'}else{const s=document.createElement('span');s.className='pfb';s.textContent=i.alt;i.replaceWith(s)}}
const payLogo=(n,c)=>PAYKEY[n]?`<span class="plg ${c||''}" data-pay="${PAYKEY[n]}"><img src="/static/img/pay/${PAYKEY[n]}.svg" data-k="${PAYKEY[n]}" alt="${esc(n)}" onerror="payImgErr(this)"></span>`:'';
const payText=m=>PAYKEY[m]?`${payLogo(m,'sm')} ${esc(m)}`:esc(m);
