// A complete app shell activates independently of optional offline audio downloads.
importScripts('./audio-index.js');
const APP_VERSION='V7.6';
const CACHE='wordpuzzle-main-v76-20260912';
const AUDIO_CACHE='wordpuzzle-trial-audio-v1';
const CORE=['./','./index.html','./update.html','./app-updates.js','./entry-continuity.js','./round.js','./reset-learning.js','./learning-transfer.js','./learning-clock.js','./word-sounds.js','./sound-map.js','./CMUDICT-LICENSE.txt','./audio-index.js','./word-sounds.css','./iteration.css','./version.json','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png'];
const AUDIO_URLS=AUDIO_WORDS.map(w=>new URL('./audio/'+encodeURIComponent(w)+'.mp3',self.registration.scope).href);
const audioSet=new Set(AUDIO_URLS);
let audioFlight=null,audioState={ready:0,total:AUDIO_URLS.length,failed:0,running:false};
let audioPaused=false;const audioControllers=new Set();
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE.map(url=>new Request(new URL(url,self.registration.scope),{cache:'reload'})))).then(()=>self.skipWaiting()));
});
async function broadcast(type){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients)if(client.url.startsWith(self.registration.scope))client.postMessage({type,version:APP_VERSION,audio:audioState});
}
self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim().then(async()=>{
    await broadcast('APP_UPDATE_READY');
    const root=new URL(self.registration.scope);
    for(const client of await self.clients.matchAll({type:'window'})){
      const path=new URL(client.url).pathname;
      if(path!==root.pathname&&path!==root.pathname+'index.html')continue;
      const current=await new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(false);},700);channel.port1.onmessage=()=>{clearTimeout(timer);channel.port1.close();resolve(true);};client.postMessage({type:'UNIFIED_DOCUMENT_CHECK'},[channel.port2]);});
      if(!current)client.navigate(root.href).catch(()=>{});
    }
  }));
});
async function warmAudio(){
  if(audioFlight)return audioFlight;
  audioFlight=(async()=>{
    audioPaused=false;
    const cache=await caches.open(AUDIO_CACHE);audioState={ready:0,total:AUDIO_URLS.length,failed:0,running:true};
    let next=0;
    async function run(){
      while(next<AUDIO_URLS.length&&!audioPaused){
        const url=AUDIO_URLS[next++];
        try{
          // Reuse unchanged audio from prior trial caches before fetching again.
          let response=await cache.match(url);
          if(!response){response=await caches.match(url)||await caches.match(url.replace(self.registration.scope+'audio/',self.registration.scope+'trial-v741/audio/'));if(response?.ok)await cache.put(url,response.clone());}
          if(!response?.ok){
            if(audioPaused)break;
            const controller=new AbortController();audioControllers.add(controller);const timeout=setTimeout(()=>controller.abort(),12000);
            try{response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('audio unavailable');await cache.put(url,response.clone());}
            finally{clearTimeout(timeout);audioControllers.delete(controller);}
          }
          audioState.ready++;
        }catch(error){audioState.failed++;}
        if((audioState.ready+audioState.failed)%24===0)await broadcast('AUDIO_CACHE_PROGRESS');
      }
    }
    await Promise.all(Array.from({length:4},()=>run()));audioState.running=false;
    if(audioState.ready===audioState.total){
      const keys=await caches.keys();await Promise.all(keys.filter(k=>(k.startsWith('wordpuzzle-main-')||k.startsWith('wordpuzzle-v741-trial-')||k==='wordpuzzle-v7')&&k!==CACHE).map(k=>caches.delete(k)));
    }
    await broadcast('AUDIO_CACHE_PROGRESS');
  })().finally(()=>{audioFlight=null;});
  return audioFlight;
}
self.addEventListener('message',event=>{
  if(event.data?.type==='PAUSE_AUDIO'){audioPaused=true;for(const controller of audioControllers)controller.abort();}
  if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
  if(event.data?.type==='GET_UPDATE_STATUS')event.ports[0]?.postMessage({version:APP_VERSION,entry:'root',cache:CACHE,audio:audioState});
  if(event.data?.type==='WARM_AUDIO')event.waitUntil(warmAudio());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=event.request.url;
  if(event.request.mode==='navigate'&&url.startsWith(new URL('trial-v741/',self.registration.scope).href)){event.respondWith(Response.redirect(self.registration.scope));return;}
  if(audioSet.has(url)){
    event.respondWith((async()=>{
      const cache=await caches.open(AUDIO_CACHE);
      const cached=await cache.match(event.request)||await caches.match(event.request);
      if(cached?.ok)return cached;
      const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;
    })());return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);const cached=await cache.match(event.request,{ignoreSearch:event.request.mode==='navigate'});if(cached)return cached;
    try{return await fetch(event.request);}
    catch(error){if(event.request.mode==='navigate')return await cache.match(new URL('./index.html',self.registration.scope));throw error;}
  })());
});
