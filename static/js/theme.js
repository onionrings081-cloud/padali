/* theme.js - light/dark switch (checkbox: checked = light). Saved in localStorage "padali-theme". */
(function(){
var K="padali-theme",r=document.documentElement;
var isDark=function(){return r.getAttribute("data-theme")==="dark"};
function paint(){document.querySelectorAll("[data-theme-toggle]").forEach(function(b){b.checked=!isDark()})}
document.addEventListener("change",function(e){
 if(!e.target.matches("[data-theme-toggle]"))return;
 var n=e.target.checked?"light":"dark";r.setAttribute("data-theme",n);
 try{localStorage.setItem(K,n)}catch(x){}paint()});
paint();
})();
