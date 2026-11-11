/* receipt.js - Order placed page (/receipt) */
ready.then(async()=>{let o=null;try{o=JSON.parse(sessionStorage.getItem('padali_receipt'))}catch{}
  if(!o)o=((await api('/api/orders')).orders||[])[0];
  if(!o){location.href='/menu';return}
  $('#v-receipt').innerHTML=`<div class="card receipt"><img class="plogo" src="/static/img/logo-full.png" alt="Padali"><div class="check-big">${ic('check')}</div><h2>Order placed!</h2><p class="meta">${o.id} · ${new Date(o.date).toLocaleString('en-PH')} · ${o.otype} · ${esc(o.method)}</p>${track(o)}${trackCard(o)}${o.otype==='Delivery'&&o.addr?`<p class="meta">${ic('map-pin')} Delivering to ${esc(o.addr)}</p>`:''}${breakdown(o)}${o.notify?`<div class="msg ok">A confirmation was sent to ${esc(o.email)}.</div>`:''}<div class="actions"><a class="btn" href="/menu">Order again</a><a class="btn ghost" href="/orders">View my orders</a><button class="btn ghost" onclick="window.print()">${ic('printer')} Print receipt</button></div></div>`});
