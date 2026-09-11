// V7.1: a fixed round shrinks only after an independent test, never after practice.
const ROUND_KEY='wp_trial_v741:wp_round_v71';
let roundState=null,reviewBusy=false,reviewTimer=null,lastGridSize=0,islandMode=false;
let restoring=false,storageFailed=false,saveFailed=false;
const byId=id=>document.getElementById(id);
const wordKey=w=>(typeof w==='string'?w:w.w).toLowerCase();
function generateIslands(words){
  placedWords=words.map((w,i)=>({...w,num:i+1,row:i*100,col:i*100,
    dir:w.w.length<=8&&i%2===1?'down':'across'}));
  renderIslands(placedWords);
}
function renderIslands(words){
  islandMode=true;lastGridSize=0;
  const box=byId('grid');box.replaceChildren();box.classList.add('islands');box.style.gridTemplateColumns='';
  words.forEach((w,index)=>{
    const island=document.createElement('div');island.className=`word-island ${w.dir}`;
    island.style.setProperty('--offset',`${index%3*12}px`);
    const cells=document.createElement('div');cells.className='island-cells';
    cells.style.gridTemplateColumns=`repeat(${w.dir==='across'?w.w.length:1},32px)`;
    for(let i=0;i<w.w.length;i++){
      const r=w.row+(w.dir==='down'?i:0),c=w.col+(w.dir==='across'?i:0);
      const d={inAcross:w.dir==='across',inDown:w.dir==='down'};
      const cell=document.createElement('div');cell.className='cell';
      cell.dataset.r=r;cell.dataset.c=c;cell.dataset.ha=d.inAcross;cell.dataset.hd=d.inDown;
      if(!i){const n=document.createElement('span');n.className='cell-num';n.textContent=w.num;cell.append(n);}
      const input=document.createElement('input');input.maxLength=1;input.autocomplete='off';input.spellcheck=false;
      input.setAttribute('autocapitalize','off');input.setAttribute('autocorrect','off');
      input.setAttribute('aria-label',`${w.c} 第${i+1}个字母`);
      input.onclick=e=>handleCellClick(e,r,c,d);input.onfocus=()=>updateDirection(r,c,d);
      input.onkeydown=e=>handleKey(e,r,c);input.oninput=e=>handleInput(e,r,c);
      cell.append(input);cells.append(cell);
    }
    island.append(cells);box.append(island);
  });
  inputDirection='across';renderClues();
}
function remainingWords(){return roundState.original.filter(w=>!roundState.passed.includes(wordKey(w)));}
function targetCount(){return Math.ceil(roundState.original.length*.7);}
function canFinish(){return roundState.passed.length>=targetCount();}
function updateRoundProgress(){
  if(!roundState)return;
  byId('round-progress').textContent=`已通过 ${roundState.passed.length}/${roundState.original.length} · 本轮目标 ${targetCount()} 个`;
  byId('phase-label').textContent=roundState.phase==='review'?'补漏洞 · 练习后再独立检验':roundState.phase==='test'?(roundState.testCount?'独立复测 · 只测本批待通过词':'初测 · 找到需要加强的词'):'本轮结算';
}
function saveSession(){
  if(restoring||!roundState||storageFailed)return;
  if(!storageIsCurrent())return;
  syncLearningClock(false);
  const values={};
  document.querySelectorAll('#grid .cell input').forEach(el=>{values[`${el.parentElement.dataset.r},${el.parentElement.dataset.c}`]=el.value;});
  const focus=document.activeElement?.closest('.cell');
  const snapshot={schema:1,generation:storageGeneration,round:roundState,poolWrong,poolCorrect,view:{
    sessionWords,pages,currentPage,allCorrectList,allWrongList,pageSubmitted,placedWords,
    gridSize:lastGridSize,islandMode,values,inputDirection,
    focus:focus?`${focus.dataset.r},${focus.dataset.c}`:null,
    reviewQueue,nextRoundQueue,reviewRound,reviewBusy,reviewInput:byId('rv-input').value
  }};
  try{localStorage.setItem(ROUND_KEY,JSON.stringify(snapshot));saveFailed=false;byId('save-status').textContent='已自动保存';}
  catch(e){saveFailed=true;byId('save-status').textContent='保存失败，请先导出记录并保留此页面';}
  document.querySelectorAll('.save-warning').forEach(el=>{el.textContent=saveFailed?'保存失败，请保留此页面并先导出记录。':'';});
}
function hidePanels(){closeTimePrompt();closeWordSound();['result','review','paused','ended'].forEach(id=>byId(id).style.display='none');}
function hideKeyboard(){if(document.activeElement instanceof HTMLElement)document.activeElement.blur();}
function startRound(words){
  clearTimeout(reviewTimer);reviewBusy=false;
  const unique=deduplicate(words.map(w=>({...w})));
  if(!unique.length){showEmpty();return;}
  roundState={id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,original:unique,passed:[],
    phase:'test',testWords:[],reviewBatch:[],testCount:0,elapsed:0,paused:false,startedAt:Date.now()};
  const selected=new Set(unique.map(wordKey));
  poolWrong.forEach(w=>w.sessionsSinceSeen=selected.has(wordKey(w))?0:(w.sessionsSinceSeen||0)+1);
  beginTest(unique);updateDashboard();saveSession();
}
function startNewGame(){startRound(selectWords());}
function beginTest(words){
  hidePanels();byId('game').style.display='flex';
  roundState.phase='test';roundState.paused=false;roundState.testWords=words.map(w=>({...w}));
  resetTestClock();
  sessionWords=roundState.testWords;pages=[];
  for(let i=0;i<sessionWords.length;i+=4)pages.push(sessionWords.slice(i,i+4));
  allCorrectList=[];allWrongList=[];currentPage=0;
  showCurrentPage();updateRoundProgress();saveSession();
}
function showCurrentPage(){
  pageSubmitted=false;
  generateGrid(pages[currentPage]);renderPageNav();
  byId('btn-submit').textContent='提交';byId('btn-submit').disabled=false;
  byId('btn-skip').style.display=currentPage<pages.length-1?'inline':'none';
  saveSession();
}
function renderPageNav(){
  byId('page-nav').replaceChildren();
  pages.forEach((words,i)=>{
    const dot=document.createElement('span');dot.className='page-dot';
    if(i===currentPage)dot.classList.add('active');
    else if(i<currentPage)dot.classList.add(words.some(w=>allWrongList.some(x=>x.w===w.w))?'wrong':'done');
    byId('page-nav').append(dot);
  });
}
function recordTest(w,correct){
  const key=wordKey(w);
  const obj=poolWrong.find(x=>wordKey(x)===key)||poolCorrect.find(x=>wordKey(x)===key);
  if(!obj)return;
  if(correct){
    if(!roundState.passed.includes(key))roundState.passed.push(key);
    poolWrong=poolWrong.filter(x=>wordKey(x)!==key);
    if(!poolCorrect.some(x=>wordKey(x)===key))poolCorrect.push(obj);
    // Same-day retries cannot repeatedly inflate the long-term interval.
    if(!obj.lastPassedAt||!obj.repetitions||Date.now()-obj.lastPassedAt>=864e5)sm2OnCorrect(obj);
    obj.lastPassedAt=Date.now();obj.priorityNext=false;
  }else{
    poolCorrect=poolCorrect.filter(x=>wordKey(x)!==key);
    if(!poolWrong.some(x=>wordKey(x)===key))poolWrong.push(obj);
    sm2OnWrong(obj);obj.weight=(obj.weight||0)+10;obj.lastFailedAt=Date.now();obj.nextReview=Date.now();
  }
}
function submitPage(fromTimeout=false){
  if(pageSubmitted||roundState.phase!=='test'||roundState.paused||(!fromTimeout&&roundState.countdown?.expired))return;
  pageSubmitted=true;
  pages[currentPage].forEach(w=>{
    const pw=placedWords.find(p=>p.w===w.w);let right=!!pw;
    if(pw)for(let i=0;i<pw.w.length;i++){
      const r=pw.row+(pw.dir==='down'?i:0),c=pw.col+(pw.dir==='across'?i:0);
      const input=document.querySelector(`#grid div[data-r='${r}'][data-c='${c}'] input`);
      if(!input||input.value.toLowerCase()!==pw.w[i].toLowerCase())right=false;
    }
    recordTest(w,right);(right?allCorrectList:allWrongList).push(w);
    if(pw)flashWord(pw,right?'correct-flash':'wrong-flash');
  });
  document.querySelectorAll('#grid input').forEach(inp=>inp.disabled=true);
  byId('btn-skip').style.display='none';
  byId('btn-submit').textContent=currentPage<pages.length-1?'下一页 →':'查看结果 →';
  updateDashboard();renderPageNav();updateRoundProgress();saveSession();
}
function skipPage(){if(roundState.countdown?.expired){syncLearningClock();return;}submitPage();currentPage++;if(currentPage<pages.length)showCurrentPage();else showFinalResults();}
function showFinalResults(){
  roundState.phase='result';hideKeyboard();hidePanels();byId('game').style.display='none';
  const remaining=remainingWords();
  byId('result').style.display='flex';
  byId('r-icon').textContent=canFinish()?'🎉':'🌱';
  byId('r-title').textContent=remaining.length?(canFinish()?'本轮完成，继续由你决定':'找到漏洞，一起再试试'):'这轮全部通过！';
  byId('r-correct').textContent=roundState.passed.length;byId('r-wrong').textContent=remaining.length;
  byId('r-time').textContent=fmt(roundState.elapsed);
  byId('r-list').style.display=remaining.length?'block':'none';
  byId('r-list').replaceChildren();
  remaining.forEach(w=>byId('r-list').append(renderWrongWordSound(w)));
  byId('r-btn').style.display=remaining.length?'block':'none';
  byId('r-btn').textContent=canFinish()?`再练这 ${remaining.length} 个词`:(roundState.testCount?'继续巩固':'开始复习');
  byId('end-btn').style.display=canFinish()?'block':'none';
  updateRoundProgress();saveSession();
}
function onResultNext(){if(remainingWords().length)startReview(remainingWords());}
function startReview(list){
  clearTimeout(reviewTimer);reviewBusy=false;
  hidePanels();byId('game').style.display='none';byId('review').style.display='flex';
  roundState.phase='review';roundState.reviewBatch=list.map(w=>({w:w.w,c:w.c}));
  reviewQueue=roundState.reviewBatch.map(w=>({...w}));nextRoundQueue=[];reviewRound=1;
  showReviewCard();updateRoundProgress();saveSession();
}
function showReviewCard(){
  reviewBusy=false;
  if(!reviewQueue.length){endReviewRound();return;}
  const w=reviewQueue[0];byId('rv-round').textContent=reviewRound;
  byId('rv-badge').textContent=`本批 ${roundState.reviewBatch.length} 词 · 此遍还剩 ${reviewQueue.length} 词`;
  byId('rv-cn').textContent=w.c||'—';byId('rv-input').value='';byId('rv-input').disabled=false;
  byId('rv-fb').textContent='';byId('review-confirm').disabled=false;
  if(!roundState.paused)byId('rv-input').focus();saveSession();
}
function checkReview(){
  if(reviewBusy||roundState.phase!=='review'||roundState.paused||!reviewQueue.length)return;
  reviewBusy=true;const w=reviewQueue.shift();
  const correct=byId('rv-input').value.toLowerCase().trim()===w.w.toLowerCase();
  if(!correct&&!nextRoundQueue.some(x=>x.w===w.w))nextRoundQueue.push(w);
  byId('rv-fb').textContent=correct?'✓ 正确！':`✗ 答案: ${w.w}`;
  byId('rv-input').disabled=true;byId('review-confirm').disabled=true;
  saveSession();
  reviewTimer=setTimeout(()=>showReviewCard(),correct?650:1800);
}
function endReviewRound(){
  if(!nextRoundQueue.length||reviewRound>=3){finishReview();return;}
  reviewRound++;reviewQueue=[...nextRoundQueue];nextRoundQueue=[];showReviewCard();
}
function finishReview(){
  clearTimeout(reviewTimer);reviewBusy=false;
  roundState.testCount++;beginTest(roundState.reviewBatch);
}
function pauseRound(){
  syncLearningClock(false);closeTimePrompt();closeWordSound();
  if(!roundState||roundState.phase==='ended')return;
  roundState.paused=true;clearTimeout(reviewTimer);
  // Feedback has already advanced the queue; never score it a second time.
  if(reviewBusy)showReviewCard();
  roundState.paused=true;
  hideKeyboard();byId('paused').style.display='flex';
  byId('pause-summary').textContent=`已通过 ${roundState.passed.length}/${roundState.original.length}，还有 ${remainingWords().length} 个待加强。`;
  byId('pause-end-btn').style.display=canFinish()?'block':'none';saveSession();
  byId('resume-btn').focus();
}
function resumeRound(){
  roundState.paused=false;resetClockReference();byId('paused').style.display='none';
  if(roundState.phase==='review')byId('rv-input').focus();saveSession();
}
function endRound(){
  if(!roundState||!canFinish())return;
  clearTimeout(reviewTimer);reviewBusy=false;
  remainingWords().forEach(w=>{const obj=poolWrong.find(x=>wordKey(x)===wordKey(w))||poolCorrect.find(x=>wordKey(x)===wordKey(w));if(obj){obj.priorityNext=true;obj.nextReview=Date.now();}});
  roundState.phase='ended';roundState.paused=false;
  hideKeyboard();hidePanels();byId('game').style.display='none';byId('ended').style.display='flex';
  byId('end-summary').textContent=`本轮通过 ${roundState.passed.length} 个词。${remainingWords().length?'剩余 '+remainingWords().length+' 个已安排优先复习。':'下次按到期时间复习。'}`;
  updateDashboard();saveSession();
}
function showEmpty(){
  hidePanels();byId('game').style.display='none';byId('ended').style.display='flex';
  byId('end-summary').textContent='当前没有待学或到期词，休息一下，下次再来。';
}
function restoreSession(){
  let snapshot;
  try{const raw=localStorage.getItem(ROUND_KEY);if(!raw)return false;snapshot=JSON.parse(raw);
    if(snapshot.schema!==1||!Array.isArray(snapshot.round?.original)||!Array.isArray(snapshot.round?.passed)||!snapshot.view||!Array.isArray(snapshot.poolWrong)||!Array.isArray(snapshot.poolCorrect))throw Error('invalid snapshot');
  }catch(e){storageFailed=true;byId('save-status').textContent='上次现场无法读取，已保留原数据；请先导出记录。';return false;}
  const generation=currentStorageGeneration();
  if(generation!=='initial'&&snapshot.generation!==generation)return false;
  restoring=true;
  roundState=snapshot.round;resetClockReference();poolWrong=snapshot.poolWrong.map(ensureSm2Fields);poolCorrect=snapshot.poolCorrect.map(ensureSm2Fields);
  const v=snapshot.view;
  sessionWords=v.sessionWords;pages=v.pages;currentPage=v.currentPage;allCorrectList=v.allCorrectList;allWrongList=v.allWrongList;pageSubmitted=v.pageSubmitted;
  reviewQueue=v.reviewQueue;nextRoundQueue=v.nextRoundQueue;reviewRound=v.reviewRound;
  updateDashboard();
  if(roundState.phase==='ended'){restoring=false;return false;}
  hidePanels();
  if(roundState.phase==='test'){
    byId('game').style.display='flex';placedWords=v.placedWords;
    if(v.islandMode)renderIslands(placedWords);
    else{const grid=Array.from({length:v.gridSize},()=>Array(v.gridSize).fill(null));placedWords.forEach(w=>placeWord(grid,w,w.row,w.col,w.dir,w.num));renderBoard(grid,v.gridSize);}
    document.querySelectorAll('#grid input').forEach(el=>{el.value=v.values[`${el.parentElement.dataset.r},${el.parentElement.dataset.c}`]||'';el.disabled=pageSubmitted;});
    inputDirection=v.inputDirection;renderPageNav();
    byId('btn-submit').textContent=pageSubmitted?(currentPage<pages.length-1?'下一页 →':'查看结果 →'):'提交';
    byId('btn-skip').style.display=!pageSubmitted&&currentPage<pages.length-1?'inline':'none';
  }else if(roundState.phase==='review'){
    byId('game').style.display='none';byId('review').style.display='flex';showReviewCard();
    if(!v.reviewBusy&&roundState.phase==='review')byId('rv-input').value=v.reviewInput||'';
  }else if(roundState.phase==='result')showFinalResults();
  restoring=false;updateRoundProgress();
  if(roundState.paused)pauseRound();else saveSession();return true;
}
function flashWord(w,cls){
  for(let i=0;i<w.w.length;i++){
    const r=w.row+(w.dir==='down'?i:0),c=w.col+(w.dir==='across'?i:0);
    const el=document.querySelector(`#grid div[data-r='${r}'][data-c='${c}']`);
    if(el){el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),1200);}
  }
}
byId('btn-submit').addEventListener('click',()=>{
  if(roundState.countdown?.expired&&!pageSubmitted){syncLearningClock();return;}
  if(!pageSubmitted)submitPage();else{currentPage++;if(currentPage<pages.length)showCurrentPage();else showFinalResults();}
});
byId('btn-skip').addEventListener('click',skipPage);
byId('rv-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();checkReview();}});
document.addEventListener('input',saveSession);
document.addEventListener('keyup',saveSession);
window.addEventListener('pagehide',saveSession);
document.addEventListener('visibilitychange',saveSession);
setInterval(()=>{syncLearningClock();saveSession();},1000);
// Keep overlays inside the visual viewport when a soft keyboard is open.
function fitViewport(){
  const v=window.visualViewport;
  document.documentElement.style.setProperty('--view-height',`${v?v.height:innerHeight}px`);
  document.documentElement.style.setProperty('--view-top',`${v?v.offsetTop:0}px`);
}
window.visualViewport?.addEventListener('resize',fitViewport);window.visualViewport?.addEventListener('scroll',fitViewport);fitViewport();
document.querySelectorAll('.result-card,.review-card').forEach(card=>{const warning=document.createElement('p');warning.className='save-warning';warning.setAttribute('role','alert');card.prepend(warning);});
try{loadData();updateDashboard();if(!restoreSession()&&!storageFailed)startNewGame();}
catch(e){storageFailed=true;byId('save-status').textContent='学习记录暂时无法读取，已停止初始化；请保留页面和原数据。';}
if(storageFailed){byId('game').style.display='none';byId('ended').style.display='flex';byId('end-summary').textContent='存档暂时无法读取。请先在设置中导出记录，原存档未被覆盖。';byId('start-next').disabled=true;}
