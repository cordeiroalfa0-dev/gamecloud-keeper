/* TV-only entrypoint; preserve the existing mobile/desktop launcher. */
(()=>{
const nativeFetch=window.fetch.bind(window);let loaded=false,resolveReady,rejectReady;
const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
window.fetch=(...args)=>loaded?nativeFetch(...args):ready.then(()=>window.fetch(...args));
const tv=new URLSearchParams(location.search).get('tv')==='1'||/SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|BRAVIA|Android TV|GoogleTV|Google TV|AFT[A-Z]|CrKey|HbbTV|Roku|Viera|AQUOS/i.test(navigator.userAgent);
if(tv)new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;const frames=node.tagName==='IFRAME'?[node]:node.querySelectorAll('iframe');for(const frame of frames){const url=new URL(frame.src,location.origin);if(url.origin===location.origin&&url.pathname==='/web/player.html'){url.pathname='/web/tv-player.html';url.searchParams.set('tv','1');frame.src=url.href;}}}}).observe(document.body,{childList:true,subtree:true});
const script=document.createElement('script');script.src='/web/mame-web-base.js?v=tv-wifi-20261021';script.onload=()=>{loaded=true;resolveReady();};script.onerror=()=>{loaded=true;window.fetch=nativeFetch;rejectReady(new Error('Não foi possível carregar a biblioteca.'));};document.head.appendChild(script);
})();