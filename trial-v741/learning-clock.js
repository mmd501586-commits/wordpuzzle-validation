// Two minutes per test batch, shared across its pages. Review is not timed.
let learningClockLastAt=Date.now();
const timePrompt=document.createElement('dialog');
timePrompt.setAttribute('aria-labelledby','time-prompt-title');
timePrompt.innerHTML='<h2 id="time-prompt-title">时间到了</h2><p>要再试一会儿吗？</p><button type="button" class="btn-confirm" id="extend-time">增加 60 秒</button><p><button type="button" class="btn-sm" id="submit-timed-test">直接提交</button></p>';
document.body.append(timePrompt);
timePrompt.addEventListener('cancel',event=>event.preventDefault());
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
function closeTimePrompt(){if(timePrompt.open)timePrompt.close();}
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
    hideKeyboard();timePrompt.showModal();byId('extend-time').focus();
  }
}
byIdClock('extend-time').onclick=()=>{
  if(!roundState||roundState.phase!=='test'||!roundState.countdown?.expired)return;
  roundState.countdown={remainingMs:60000,expired:false};
  learningClockLastAt=Date.now();closeTimePrompt();renderCountdown();saveSession();
};
byIdClock('submit-timed-test').onclick=()=>{
  if(!roundState||roundState.phase!=='test'||!roundState.countdown?.expired)return;
  closeTimePrompt();
  // Already submitted pages keep their scores; the current page keeps its letters.
  if(!pageSubmitted)submitPage(true);
  for(let i=currentPage+1;i<pages.length;i++){
    pages[i].forEach(word=>{recordTest(word,false);allWrongList.push(word);});
  }
  updateDashboard();showFinalResults();
};
function byIdClock(id){return document.getElementById(id);}
document.addEventListener('visibilitychange',resetClockReference);
window.addEventListener('pageshow',resetClockReference);
