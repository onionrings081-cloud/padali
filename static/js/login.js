/* login.js - only for /login */
$$('input').forEach(i=>{i.readOnly=true;i.addEventListener('focus',()=>i.readOnly=false)});
$('#loginForm').onsubmit=async e=>{e.preventDefault();
  const r=await api('/api/login',Object.fromEntries(new FormData(e.target)));
  if(!r.ok)return showMsg('#loginMsg',r.error||'Could not log in.');
  location.href=r.user.role==='admin'?'/admin':r.user.role==='owner'?'/owner':'/app'};
