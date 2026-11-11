/* rider_account.js - /rider/account : profile photo (from the gallery), contact + vehicle, change password. The username can only be changed by the admin. */
let ME=null,P=null;
const big=()=>ME.av?`<img src="${esc(ME.av)}" alt="Your photo">`:esc(ME.name.trim()[0].toUpperCase());
const VEH=['Motorcycle','E-bike','Scooter','Bicycle'];
function draw(){
  $('#v-acct').innerHTML=`<div class="prof">
   <div class="card panel photo"><div class="av-lg" id="avBig">${big()}</div><div><h3>${esc(ME.name)}</h3><p class="mu">@${esc(ME.u)} · Rider</p>
    <div class="photo-btns"><label class="btn sm" for="avFile">${ic('camera')} Choose from gallery</label><input id="avFile" type="file" accept="image/*" hidden><button class="btn ghost sm danger" id="avDel" type="button"${ME.av?'':' hidden'}>${ic('trash')} Remove</button></div>
    <p class="meta left">Your photo is cropped to a square. Customers see it on the delivery map.</p></div></div>
   <form class="card panel form" id="pf" autocomplete="off"><h3 class="sec-sm">Your details</h3>
    <div class="row2"><label>Full name<input name="name" required maxlength="60" value="${esc(P.name)}"></label><label>Mobile number<input name="phone" required maxlength="11" inputmode="tel" value="${esc(P.phone)}"></label></div>
    <div class="row2"><label>Vehicle<select name="vehicle">${VEH.map(v=>`<option${v===P.vehicle?' selected':''}>${v}</option>`).join('')}</select></label><label>Plate number<input name="plate" maxlength="20" value="${esc(P.plate||'')}"></label></div>
    <div class="msg" id="pfMsg" hidden></div><button class="btn lg">Save changes</button></form>
   <form class="card panel form" id="pw" autocomplete="off"><h3 class="sec-sm">Change password</h3>
    <label>Current password<input name="current" type="password" required autocomplete="current-password"></label><label>New password (6+ characters)<input name="new" type="password" required minlength="6" autocomplete="new-password"></label>
    <div class="msg" id="pwMsg" hidden></div><button class="btn lg">Change password</button></form></div>`;
  $('#avFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(!file.type.startsWith('image/'))return toast('Please choose an image');
    let img;try{img=await toJpeg(file)}catch{return toast('That picture could not be opened. Try a JPG or PNG.')}
    const r=await api('/api/profile/avatar',{image:img});if(!r.ok)return toast(r.error||'Could not save your photo');ME=r.user;paintAvatar(ME);draw();toast('Profile photo updated')};
  $('#avDel').onclick=async()=>{const r=await api('/api/profile/avatar',null,'DELETE');if(r.ok){ME=r.user;paintAvatar(ME);draw();toast('Photo removed')}};
  $('#pf').onsubmit=async e=>{e.preventDefault();const r=await api('/api/rider/profile',Object.fromEntries(new FormData(e.target)),'PUT');
    if(!r.ok)return showMsg('#pfMsg',r.error||'Could not save.');ME=r.user;await loadP();paintAvatar(ME);showMsg('#pfMsg','Saved.',true);toast('Details updated')};
  $('#pw').onsubmit=async e=>{e.preventDefault();const f=e.target,r=await api('/api/rider/password',Object.fromEntries(new FormData(f)));
    if(!r.ok)return showMsg('#pwMsg',r.error||'Could not change the password.');f.reset();showMsg('#pwMsg','Password changed.',true);toast('Password changed')}}
async function loadP(){P=(await api('/api/rider/deliveries')).profile}
adminReady.then(async u=>{ME=u;await loadP();if(!P)return;draw()});
