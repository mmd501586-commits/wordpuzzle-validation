// Keep the established profile while retiring old code before the first root handover.
const ENTRY_PREFIX='wp_trial_v741:', ENTRY_READY=ENTRY_PREFIX+'entry_unified', ENTRY_PENDING=ENTRY_PREFIX+'entry_pending';
const ENTRY_KEYS=['wp_wrong','wp_correct','wp_round_v71','wp_version'].map(key=>ENTRY_PREFIX+key);
function entryMessage(worker,message,timeout=1200){return new Promise(resolve=>{
  if(!worker){resolve(null);return;}const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(null);},timeout);
  channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};worker.postMessage(message,[channel.port2]);
});}
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type==='UNIFIED_DOCUMENT_CHECK')event.ports[0]?.postMessage({version:'V7.6'});
});
async function waitEntryWorker(registration,kind){
  const paused=new Set();const deadline=Date.now()+45000;
  while(Date.now()<deadline){
    if(registration.installing||registration.waiting){
      if(registration.active&&!paused.has(registration.active)&&await caches.has('wordpuzzle-trial-audio-v1')){registration.active.postMessage({type:'PAUSE_AUDIO'});paused.add(registration.active);}
      registration.waiting?.postMessage({type:'ACTIVATE_UPDATE'});await new Promise(r=>setTimeout(r,250));continue;
    }
    const status=await entryMessage(registration.active,{type:'GET_UPDATE_STATUS'});
    if(registration.active?.state==='activated'&&(kind==='bridge'?status?.entry==='root':status?.version==='V7.6'))return;
    await new Promise(r=>setTimeout(r,250));
  }
  throw Error('entry worker not ready');
}
async function prepareEntryWorkers(){
  if(!('serviceWorker' in navigator))return;
  const root=new URL('./',location.href),trial=new URL('trial-v741/',root);
  const registrations=await navigator.serviceWorker.getRegistrations();
  const oldTrial=registrations.find(reg=>reg.scope===trial.href);
  if(oldTrial){
    const status=await entryMessage(oldTrial.active,{type:'GET_UPDATE_STATUS'});
    if(status?.entry!=='root'){
      const bridge=await navigator.serviceWorker.register(new URL('sw.js',trial).href,{scope:trial.href,updateViaCache:'none'});
      await bridge.update();await waitEntryWorker(bridge,'bridge');
    }
  }
}
function handoverEntryProfile(){
  let journal=JSON.parse(localStorage.getItem(ENTRY_PENDING)||'null');
  if(!journal&&localStorage.getItem(ENTRY_READY))return;
  if(!journal){
    const original=Object.fromEntries(ENTRY_KEYS.map(key=>[key,localStorage.getItem(key)]));
    const oldGeneration=currentStorageGeneration();
    const useLegacy=!original[ENTRY_PREFIX+'wp_version']&&!original[ENTRY_PREFIX+'wp_wrong']&&!original[ENTRY_PREFIX+'wp_correct']&&!localStorage.getItem(RESET_GENERATION_KEY)&&(localStorage.getItem('wp_wrong')||localStorage.getItem('wp_correct'));
    const generation=`entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const values={...original};
    for(const key of ['wp_wrong','wp_correct']){
      const raw=useLegacy?localStorage.getItem(key):original[ENTRY_PREFIX+key];
      const items=JSON.parse(raw||'[]');if(!Array.isArray(items))throw Error('invalid profile');
      values[ENTRY_PREFIX+key]=JSON.stringify(items.filter(item=>useLegacy||oldGeneration==='initial'||item._wpResetGeneration===oldGeneration).map(item=>({...item,_wpResetGeneration:generation})));
    }
    if(useLegacy)normalizeTransfer({poolWrong:JSON.parse(values[ENTRY_PREFIX+'wp_wrong']),poolCorrect:JSON.parse(values[ENTRY_PREFIX+'wp_correct'])});
    const snapshot=JSON.parse(original[ENTRY_PREFIX+'wp_round_v71']||'null');
    if(snapshot&&snapshot.generation===oldGeneration){snapshot.generation=generation;for(const key of ['poolWrong','poolCorrect'])if(Array.isArray(snapshot[key]))snapshot[key]=snapshot[key].map(item=>({...item,_wpResetGeneration:generation}));values[ENTRY_PREFIX+'wp_round_v71']=JSON.stringify(snapshot);}
    values[ENTRY_PREFIX+'wp_version']='mvp-v1';
    journal={schema:1,generation,values};
    localStorage.setItem(ENTRY_PREFIX+'entry_backup',JSON.stringify({time:new Date().toISOString(),generation:oldGeneration,values:original}));
    localStorage.setItem(ENTRY_PENDING,JSON.stringify(journal));
  }
  if(journal.schema!==1||typeof journal.generation!=='string'||!journal.values||ENTRY_KEYS.some(key=>journal.values[key]!==null&&typeof journal.values[key]!=='string'))throw Error('invalid handover');
  // Old trial documents understand this barrier and cannot save their previous round.
  localStorage.setItem(RESET_GENERATION_KEY,journal.generation);
  for(const key of ENTRY_KEYS){const value=journal.values[key];if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}
  localStorage.setItem(ENTRY_READY,'V7.6');localStorage.removeItem(ENTRY_PENDING);storageGeneration=journal.generation;
}
async function initializeUnifiedApplication(start){
  const loading=document.createElement('div');loading.id='entry-loading';loading.setAttribute('role','status');loading.textContent='正在接续学习页面…';document.body.append(loading);
  byId('game').style.display='none';
  try{await prepareEntryWorkers();recoverLearningTransfer();handoverEntryProfile();loading.remove();byId('game').style.display='';start();}
  catch(error){
    storageFailed=true;loading.textContent='入口接续暂未完成，已保留存档并停止学习。请保持联网后重试，不要清除网站数据。';
    if(localStorage.getItem(TRANSFER_PENDING)){loading.remove();byId('ended').style.display='flex';showTransferRecoveryActions();return;}
    const retry=document.createElement('button');retry.textContent='重试打开';retry.className='btn-confirm';retry.onclick=()=>location.reload();loading.append(retry);
  }
}
