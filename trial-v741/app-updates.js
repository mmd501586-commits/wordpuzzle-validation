// Update only application resources. Learning records remain in the fixed profile.
const CURRENT_APP_VERSION='V7.5.1';
function getWorkerStatus(worker){
  return new Promise(resolve=>{
    if(!worker){resolve(null);return;}
    const channel=new MessageChannel();const timeout=setTimeout(()=>{channel.port1.close();resolve(null);},1200);
    channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();resolve(event.data);};
    worker.postMessage({type:'GET_UPDATE_STATUS'},[channel.port2]);
  });
}
function showAudioCache(state){
  const el=document.getElementById('audio-cache-status');if(!el||!state)return;
  el.textContent=`离线读音 ${state.ready}/${state.total}`+(state.running?' · 正在保存':state.failed?' · 部分未完成，联网后可重试':'');
}
function showAvailableUpdate(version){
  if(version===CURRENT_APP_VERSION)return;
  document.getElementById('update-status').textContent=`${version} 已就绪，可保存并刷新。`;
  document.getElementById('apply-update').hidden=false;
}
function watchUpdate(registration){
  const pause=async()=>{if(await caches.has('wordpuzzle-trial-audio-v1'))registration.active?.postMessage({type:'PAUSE_AUDIO'});};
  registration.addEventListener('updatefound',pause);
  if(registration.installing||registration.waiting)pause();
}
async function checkAppUpdate(){
  const status=document.getElementById('update-status');status.textContent='正在检查更新…';
  try{
    const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});watchUpdate(registration);await registration.update();
    const info=await getWorkerStatus(registration.active);
    if(info&&info.version!==CURRENT_APP_VERSION)showAvailableUpdate(info.version);
    else status.textContent=registration.installing?'正在准备新版，完成后会提示。':`当前 ${CURRENT_APP_VERSION}，已检查更新。`;
    if(!registration.installing&&!registration.waiting)registration.active?.postMessage({type:'WARM_AUDIO'});
  }catch(error){status.textContent='暂时无法检查更新，学习记录保留；联网后可重试。';}
}
document.getElementById('check-update').onclick=checkAppUpdate;
document.getElementById('apply-update').onclick=()=>{saveData();saveSession();if(!storageFailed&&!saveFailed)location.reload();};
document.getElementById('retry-audio-cache').onclick=()=>navigator.serviceWorker.controller?.postMessage({type:'WARM_AUDIO'});
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type==='APP_UPDATE_READY')showAvailableUpdate(event.data.version);
    if(event.data?.type==='AUDIO_CACHE_PROGRESS')showAudioCache(event.data.audio);
  });
  navigator.serviceWorker.addEventListener('controllerchange',async()=>{
    const worker=navigator.serviceWorker.controller;const status=await getWorkerStatus(worker);
    if(status)showAvailableUpdate(status.version);worker?.postMessage({type:'WARM_AUDIO'});
  });
  window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      watchUpdate(registration);
      await navigator.serviceWorker.ready;
      const status=await getWorkerStatus(registration.active);if(status){showAudioCache(status.audio);showAvailableUpdate(status.version);}
      if(!registration.installing&&!registration.waiting)registration.active?.postMessage({type:'WARM_AUDIO'});
    }catch(error){document.getElementById('update-status').textContent='离线缓存暂未准备好，联网后可重试；学习记录保留。';}
  });
}
