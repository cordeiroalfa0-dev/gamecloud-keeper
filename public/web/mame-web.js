/* Bridge de carregamento do launcher web e do controle por celular. */
(()=>{
const nativeFetch=window.fetch.bind(window);let loaded=false,resolveReady,rejectReady;
const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
window.fetch=(...args)=>loaded?nativeFetch(...args):ready.then(()=>window.fetch(...args));
const script=document.createElement('script');script.src='/web/mame-web-base.js?v=20261024-remote-bridge-v3';script.onload=()=>{loaded=true;resolveReady();};script.onerror=()=>{loaded=true;window.fetch=nativeFetch;rejectReady(new Error('Não foi possível carregar a biblioteca.'));};document.head.appendChild(script);
})();
