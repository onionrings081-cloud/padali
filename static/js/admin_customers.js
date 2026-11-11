/* admin_customers.js - /admin/customers : everyone who registered, with their order totals. */
let CUS=[],q='';
function rRows(){const L=CUS.filter(c=>!q||(c.n+c.u+c.e+c.p).toLowerCase().includes(q));
  $('#rows').innerHTML=L.length?L.map(c=>`<tr><td><div class="dn"><span class="av-sm">${c.av?`<img src="${esc(c.av)}" alt="">`:esc(c.n[0].toUpperCase())}</span><div><b>${esc(c.n)}</b><small>@${esc(c.u)}</small></div></div></td>
   <td>${esc(c.e)}<small>${esc(c.p)}</small></td><td>${esc(c.a)}</td><td><b>${c.orders}</b></td><td><b>${peso(c.spent)}</b></td><td>${c.last?when(c.last):'–'}</td></tr>`).join(''):`<tr><td colspan="6"><div class="empty">No customers found.</div></td></tr>`;
  $('#count').textContent=L.length+' of '+CUS.length+' customers'}
adminReady.then(async()=>{CUS=(await api('/api/admin/customers')).customers||[];
  $('#v-customers').innerHTML=`<div class="tools"><div class="search"><span class="s-ic">${ic('search')}</span><input id="q" placeholder="Search name, username, email, phone" autocomplete="off"></div></div><p class="note" id="count"></p>
  <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Contact</th><th>Address</th><th>Orders</th><th>Spent</th><th>Last order</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  $('#q').oninput=e=>{q=e.target.value.trim().toLowerCase();rRows()};rRows()});
