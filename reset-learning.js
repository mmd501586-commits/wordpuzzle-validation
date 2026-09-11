// A reset generation prevents another open page from saving its old round.
const RESET_GENERATION_KEY='wp_trial_v741:wp_reset_generation';
let storageGeneration=null,staleReloadScheduled=false,resetPreviousPaused=false,resetIncomplete=false;
function currentStorageGeneration(){return localStorage.getItem(RESET_GENERATION_KEY)||'initial';}
function stopStaleSession(){
  if(staleReloadScheduled)return;
  staleReloadScheduled=true;roundState=null;storageFailed=true;
  clearTimeout(reviewTimer);reviewBusy=false;closeWordSound();closeTimePrompt();
  setTimeout(()=>location.reload(),0);
}
function storageIsCurrent(){
  const current=currentStorageGeneration();
  if(storageGeneration===null)storageGeneration=current;
  if(current!==storageGeneration){stopStaleSession();return false;}
  return true;
}
window.addEventListener('storage',event=>{
  if(event.key===RESET_GENERATION_KEY&&event.newValue!==storageGeneration)stopStaleSession();
});

const resetDialog=document.createElement('dialog');
resetDialog.setAttribute('aria-labelledby','reset-title');
resetDialog.innerHTML='<h2 id="reset-title">清空学习记录</h2><p>将清除待攻克、已掌握和本轮进度。词库保留，所有词恢复为新词。</p><p>此操作不可恢复。</p><p id="reset-error" role="alert"></p><button type="button" class="btn-confirm" id="confirm-reset">确认清空</button><p><button type="button" class="btn-sm" id="cancel-reset">取消</button></p>';
document.body.append(resetDialog);
function openResetDialog(){
  if(resetDialog.open)return;
  if(!storageIsCurrent())return;
  syncLearningClock(false);closeWordSound();closeTimePrompt();
  resetPreviousPaused=roundState?.paused||false;
  if(roundState){
    roundState.paused=true;clearTimeout(reviewTimer);
    if(reviewBusy)showReviewCard();
    roundState.paused=true;
  }
  document.getElementById('reset-error').textContent='';
  document.getElementById('cancel-reset').disabled=false;
  resetDialog.showModal();document.getElementById('cancel-reset').focus();
}
resetDialog.addEventListener('close',()=>{
  if(resetIncomplete)return;
  if(roundState){roundState.paused=resetPreviousPaused;resetClockReference();saveSession();}
});
resetDialog.addEventListener('cancel',event=>{if(resetIncomplete)event.preventDefault();});
document.getElementById('cancel-reset').onclick=()=>{if(!resetIncomplete)resetDialog.close();};
document.getElementById('confirm-reset').onclick=()=>{
  const previousRound=roundState;
  const previousStorageFailed=storageFailed,previousSaveFailed=saveFailed;
  try{
    if(!storageIsCurrent())return;
    const nextGeneration=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Establish the barrier before any page can re-save a stale snapshot.
    localStorage.setItem(RESET_GENERATION_KEY,nextGeneration);
    resetIncomplete=true;
    storageGeneration=nextGeneration;
    roundState=null;clearTimeout(reviewTimer);reviewBusy=false;
    for(const key of ['wp_trial_v741:entry_backup','wp_trial_v741:entry_pending','wp_trial_v741:transfer_backup','wp_trial_v741:transfer_pending','wp_trial_v741:transfer_receipt','wp_trial_v741:wp_round_v71','wp_trial_v741:wp_wrong','wp_trial_v741:wp_correct','wp_trial_v741:pet_wrong_final','wp_trial_v741:pet_correct_final'])localStorage.removeItem(key);
    localStorage.setItem('wp_trial_v741:wp_version','mvp-v1');
    location.reload();
  }catch(error){
    // Never claim a successful reset after a storage failure.
    if(resetIncomplete){
      roundState=null;storageFailed=true;
      document.getElementById('cancel-reset').disabled=true;
      document.getElementById('reset-error').textContent='清空中断，旧学习已停止。请点击“确认清空”重试。';
    }else{
      roundState=previousRound;storageFailed=previousStorageFailed;saveFailed=previousSaveFailed;
      document.getElementById('reset-error').textContent='暂时无法清空，尚未删除记录。可重试或取消后继续学习。';
    }
  }
};
