/* register.js - only for /register */
$$('input').forEach(i=>{i.readOnly=true;i.addEventListener('focus',()=>i.readOnly=false)});
$('#regForm').onsubmit=async e=>{e.preventDefault();
  const f=Object.fromEntries(new FormData(e.target)),r=await api('/api/register',f);
  if(!r.ok)return showMsg('#regMsg',r.error||'Could not create the account.');
  sessionStorage.setItem('padali_toast','Account created. Welcome, '+r.user.name.split(' ')[0]+'!');
  location.href='/app'};
