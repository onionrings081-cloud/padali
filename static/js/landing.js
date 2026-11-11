fetch('/api/me').then(r=>{if(r.ok)document.querySelectorAll('[data-auth]').forEach(a=>{a.href='/app';a.textContent='Open app'})});
