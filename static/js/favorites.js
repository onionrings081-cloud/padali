/* favorites.js - Favorites page (/favorites) */
function rFavs(){const L=MENU.filter(i=>favs.has(i.id));$('#v-favs').innerHTML=`<div class="items">${L.length?L.map(card).join(''):`<div class="empty">No favorites yet. Tap the heart on any dish to save it here.</div>`}</div>`}
window.onFavChange=rFavs;
ready.then(rFavs);
