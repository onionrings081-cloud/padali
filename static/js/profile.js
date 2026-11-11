/* profile.js - Profile page (/profile): change your photo from the gallery + your details */
const bigAv=()=>user.av?`<img src="${esc(user.av)}" alt="Your photo">`:esc(user.name.trim()[0].toUpperCase());
/* crop the picked picture to a square and shrink it to 320 px, so the upload is small (about 30 KB) */
const toJpeg=file=>new Promise((ok,no)=>{const url=URL.createObjectURL(file),im=new Image();
  im.onload=()=>{const s=Math.min(im.width,im.height),c=document.createElement('canvas');c.width=c.height=320;
    c.getContext('2d').drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,320,320);URL.revokeObjectURL(url);ok(c.toDataURL('image/jpeg',.86))};
  im.onerror=()=>{URL.revokeObjectURL(url);no()};im.src=url});
ready.then(async()=>{const p=(await api('/api/profile')).profile||{};
  const f=(l,n,v,t='text')=>`<label>${l}<input name="${n}" type="${t}" value="${esc(v||'')}" required autocomplete="off"></label>`;
  $('#v-profile').innerHTML=`<div class="prof">
   <div class="card panel photo"><div class="av-lg" id="avBig">${bigAv()}</div>
     <div><h3>${esc(p.name||'')}</h3><p class="mu">@${esc(p.u||'')}</p>
     <div class="photo-btns"><label class="btn sm" for="avFile">${ic('camera')} Choose from gallery</label><input id="avFile" type="file" accept="image/*" hidden>
     <button class="btn ghost sm danger" id="avDel" type="button"${user.av?'':' hidden'}>${ic('trash')} Remove</button></div>
     <p class="meta left">Your photo is cropped to a square. It shows in the header, the sidebar and next to your comments.</p></div></div>
   <form class="card panel form" id="pf">${f('Full name','name',p.name)}<div class="row2">${f('Email','email',p.email,'email')}${f('Phone','phone',p.phone)}</div>${f('Address','addr',p.addr)}<div class="msg" id="pfMsg" hidden></div><button class="btn lg">Save changes</button></form></div>`;
  const refresh=()=>{$('#avBig').innerHTML=bigAv();$('#avDel').hidden=!user.av;paintAvatar()};
  $('#avFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;
    if(!file.type.startsWith('image/'))return toast('Please choose an image');
    let img;try{img=await toJpeg(file)}catch{return toast('That picture could not be opened. Try a JPG or PNG.')}
    const r=await api('/api/profile/avatar',{image:img});if(!r.ok)return toast(r.error||'Could not save your photo');
    user=r.user;refresh();toast('Profile photo updated')};
  $('#avDel').onclick=async()=>{const r=await api('/api/profile/avatar',null,'DELETE');if(r.ok){user=r.user;refresh();toast('Photo removed')}};
  $('#pf').onsubmit=async e=>{e.preventDefault();const r=await api('/api/profile',Object.fromEntries(new FormData(e.target)),'PUT');
    if(!r.ok)return showMsg('#pfMsg',r.error||'Could not save.');user=r.user;paintAvatar();showMsg('#pfMsg','Profile saved.',true);toast('Profile updated')}});
