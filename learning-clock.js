// Two minutes per test batch, shared across its pages. Review is not timed.
let learningClockLastAt=Date.now();
// A nonmodal prompt must not blur the editable cell or make it inert.
const timePrompt=document.createElement('div');
timePrompt.id='time-prompt';timePrompt.hidden=true;timePrompt.setAttribute('role','dialog');
Object.defineProperty(timePrompt,'open',{get:()=>!timePrompt.hidden});
timePrompt.setAttribute('aria-labelledby','time-prompt-title');
timePrompt.innerHTML='<h2 id="time-prompt-title" aria-live="polite">时间到了</h2><p>要再试一会儿吗？已填的字母会保留。</p><div class="time-prompt-actions"><button type="button" class="btn-confirm" id="extend-time">增加 60 秒</button><button type="button" class="btn-sm" id="submit-timed-test">直接提交</button></div>';
document.body.append(timePrompt);
timePrompt.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});
function ensureCountdown(){
  if(!roundState)return;
  const clock=roundState.countdown;
  if(!clock||!Number.isFinite(clock.remainingMs)||clock.remainingMs<0){
    roundState.countdown={remainingMs:120000,expired:false};
  }
}
function renderCountdown(){
  if(!roundState)return;
  ensureCountdown();
  const seconds=Math.ceil(roundState.countdown.remainingMs/1000);
  byId('timer').textContent=fmt(seconds);
  byId('timer').classList.toggle('warn',roundState.phase==='test'&&seconds<=30);
}
function closeTimePrompt(){timePrompt.hidden=true;}
function resetTestClock(){
  roundState.countdown={remainingMs:120000,expired:false};
  learningClockLastAt=Date.now();closeTimePrompt();renderCountdown();
}
function resetClockReference(){learningClockLastAt=Date.now();renderCountdown();}
function syncLearningClock(showPrompt=true){
  const now=Date.now(),delta=Math.max(0,now-learningClockLastAt);learningClockLastAt=now;
  if(!roundState)return;
  ensureCountdown();
  const active=!roundState.paused&&!document.hidden;
  const testFinished=pageSubmitted&&currentPage===pages.length-1;
  const clock=roundState.countdown;
  let spent=0;
  if(active&&roundState.phase==='test'&&!testFinished&&!clock.expired){
    spent=Math.min(delta,clock.remainingMs);clock.remainingMs-=spent;
    if(clock.remainingMs<=0){clock.remainingMs=0;clock.expired=true;}
  }else if(active&&roundState.phase==='review'){spent=delta;}
  roundState.elapsedMs=(roundState.elapsedMs??roundState.elapsed*1000)+spent;
  roundState.elapsed=Math.floor(roundState.elapsedMs/1000);
  renderCountdown();
  if(showPrompt&&active&&roundState.phase==='test'&&!testFinished&&clock.expired&&!timePrompt.open){
    if(!clock.historyExpiredRecorded){recordLearning('time_expired',{remainingMs:0,page:currentPage+1,focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.id||null});clock.historyExpiredRecorded=true;}
    const cell=document.activeElement?.closest('#grid .cell');
    if(cell){clock.resumeCell=`${cell.dataset.r},${cell.dataset.c}`;clock.resumeDirection=inputDirection;
      clock.resumeWord=activeGridWord?{num:activeGridWord.num,dir:activeGridWord.dir}:null;}
    timePrompt.hidden=false;
  }
}
byIdClock('extend-time').onclick=()=>{
  if(!roundState||roundState.phase!=='test'||!roundState.countdown?.expired)return;
  const {resumeCell,resumeDirection,resumeWord}=roundState.countdown;
  roundState.countdown={remainingMs:60000,expired:false};
  recordLearning('time_extended',{seconds:60});
  learningClockLastAt=Date.now();closeTimePrompt();renderCountdown();
  if(resumeCell){
    const [r,c]=resumeCell.split(',');
    const input=document.querySelector(`#grid .cell[data-r="${r}"][data-c="${c}"] input`);
    if(input&&!input.disabled){inputDirection=resumeDirection||inputDirection;
      activeGridWord=placedWords.find(w=>w.num===resumeWord?.num&&w.dir===resumeWord?.dir)||
        placedWords.find(w=>w.dir===inputDirection&&wordContainsCell(w,Number(r),Number(c)))||null;
      input.focus({preventScroll:true});input.select();}
  }
  saveSession();
};
byIdClock('submit-timed-test').onclick=()=>{
  if(!roundState||roundState.phase!=='test'||!roundState.countdown?.expired)return;
  closeTimePrompt();
  recordLearning('timeout_submitted',{page:currentPage+1});
  // Already submitted pages keep their scores; the current page keeps its letters.
  if(!pageSubmitted)submitPage(true);
  for(let i=currentPage+1;i<pages.length;i++){
    pages[i].forEach(word=>{recordTest(word,false,'','timeout_unshown');allWrongList.push(word);});
  }
  updateDashboard();showFinalResults();
};
function byIdClock(id){return document.getElementById(id);}
document.addEventListener('visibilitychange',resetClockReference);
window.addEventListener('pageshow',resetClockReference);
