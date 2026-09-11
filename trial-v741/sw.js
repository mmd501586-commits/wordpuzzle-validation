// Compatibility bridge: no learning storage is read or written here.
const CACHE='wordpuzzle-entry-bridge-v76';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.add(new Request(new URL('./index.html',self.registration.scope),{cache:'reload'}))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await self.clients.claim();const root=new URL('../',self.registration.scope);const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const rootOpen=clients.some(c=>{const u=new URL(c.url);return u.pathname===root.pathname||u.pathname===root.pathname+'index.html';});
  for(const client of clients)if(client.url.startsWith(self.registration.scope))client.navigate(rootOpen?self.registration.scope+'?unified=1':root.href+'update.html?from=trial').catch(()=>{});
})()));
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_STATUS')event.ports[0]?.postMessage({version:'V7.6',entry:'root'});
  if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate')event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(new URL('./index.html',self.registration.scope))||fetch(event.request);})());
});
