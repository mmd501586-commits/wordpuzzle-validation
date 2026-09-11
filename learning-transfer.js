// Persistent profile identity: the historical prefix is intentionally NOT a release number.
// All future releases at the fixed trial URL must continue using these storage keys.
const PROFILE_PREFIX='wp_trial_v741:';
const TRANSFER_PENDING=PROFILE_PREFIX+'transfer_pending';
const TRANSFER_BACKUP=PROFILE_PREFIX+'transfer_backup';
const TRANSFER_RECEIPT=PROFILE_PREFIX+'transfer_receipt';
const profileKeys=[PROFILE_PREFIX+'wp_wrong',PROFILE_PREFIX+'wp_correct',PROFILE_PREFIX+'wp_round_v71',PROFILE_PREFIX+'wp_version',RESET_GENERATION_KEY];
let transferSource=null,transferPlan=null,transferFingerprint=null,legacyFingerprint=null;
let transferPaused=false,transferReading=0;
const transferDialog=document.createElement('dialog');
transferDialog.id='transfer-dialog';transferDialog.setAttribute('aria-labelledby','transfer-title');
transferDialog.innerHTML=`<h2 id="transfer-title">接续学习进度</h2>
  <p>保留已掌握、待攻克和复习安排。旧版数据不删除；接续后从新一轮练习开始。</p>
  <button class="btn-confirm" id="read-legacy" type="button">读取本浏览器的 V7 进度</button>
  <p>换了浏览器或设备？先在原版设置中下载学习记录，再选择该文件。</p>
  <label class="transfer-file">导入学习记录文件<input id="import-file" type="file" accept=".json,application/json"></label>
  <p id="transfer-error" role="alert"></p>
  <section id="transfer-preview" hidden aria-live="polite">
    <h3 id="transfer-source-title"></h3>
    <p id="transfer-current"></p><p id="transfer-incoming"></p>
    <div id="transfer-conflict-options" hidden>
      <label for="transfer-policy">同一个词的状态有冲突时</label>
      <select id="transfer-policy"><option value="review">优先复习冲突词（推荐）</option><option value="current">保留当前状态</option><option value="incoming">采用导入状态</option></select>
      <details><summary id="transfer-conflict-count"></summary><ul id="transfer-conflicts"></ul></details>
    </div>
    <p id="transfer-after" class="transfer-after"></p><p id="transfer-notes"></p>
    <p>两边独有的学习成果都会保留；同为已掌握或待攻克的词，保留当前复习安排。确认前会保存一份当前进度备份。</p>
    <p>本次只接续单词进度，当前未完成的填字题会结束，不搬入旧版题目。</p>
  </section>
  <button id="confirm-transfer" class="btn-confirm" type="button" disabled>确认接续并开始新一轮</button>
  <button id="download-transfer-backup" class="btn-sm" type="button" hidden>下载最近一次接续前的备份</button>
  <button id="cancel-transfer" class="btn-sm" type="button">取消</button>`;
document.body.append(transferDialog);
const transferEl=id=>document.getElementById(id);
const transferStatus=s=>({fresh:'新词',hard:'待攻克',correct:'已掌握'})[s];
function transferStats(records){
  const counts={fresh:0,hard:0,correct:0};for(const r of records.values())counts[r.status]++;
  return `新词 ${counts.fresh} · 待攻克 ${counts.hard} · 已掌握 ${counts.correct}`;
}
function normalizeTransfer(data){
  if(!data||typeof data!=='object'||!Array.isArray(data.poolWrong)||!Array.isArray(data.poolCorrect))throw Error('文件不是 WordPuzzle 学习记录，请选择设置中导出的 JSON 文件。');
  if(data.format!==undefined&&(data.format!=='wordpuzzle-learning'||data.schema!==1))throw Error('暂不支持该存档格式，原记录未修改。');
  if(data.poolWrong.length+data.poolCorrect.length>2000)throw Error('记录数量异常，未导入。');
  const vocabulary=new Map(FULL_DB.map(x=>[x.w.toLowerCase(),x]));
  const records=new Map(),seen=new Set();let ignored=0;
  const defaults={weight:0,interval:1,repetitions:0,easeFactor:2.5,nextReview:0,sessionsSinceSeen:0,lastPassedAt:0,lastFailedAt:0};
  for(const [pool,status] of [[data.poolWrong,'wrong'],[data.poolCorrect,'correct']])for(const raw of pool){
    if(!raw||typeof raw!=='object'||typeof raw.w!=='string'||!raw.w.trim())throw Error('记录中有无效单词，未导入。');
    const key=raw.w.trim().toLowerCase();
    if(seen.has(key))throw Error(`记录中单词 ${key} 重复或同时出现在两个词池，未导入。`);
    seen.add(key);
    const item={};
    for(const [field,fallback] of Object.entries(defaults)){
      const value=raw[field]===undefined?fallback:raw[field];
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)throw Error(`单词 ${key} 的复习数据无效，未导入。`);
      item[field]=value;
    }
    if(raw.priorityNext!==undefined&&typeof raw.priorityNext!=='boolean')throw Error(`单词 ${key} 的复习标记无效，未导入。`);
    item.priorityNext=raw.priorityNext===true;
    if(!vocabulary.has(key)){ignored++;continue;}
    const canonical=vocabulary.get(key);item.w=canonical.w;item.c=canonical.c;
    records.set(key,{item,status:status==='correct'?'correct':item.weight>0?'hard':'fresh'});
  }
  return {records,ignored};
}
function transferData(records){
  const poolWrong=[],poolCorrect=[];
  for(const {item,status} of records.values())(status==='correct'?poolCorrect:poolWrong).push({...item});
  return {poolWrong,poolCorrect};
}
function mergeTransfer(current,incoming,policy){
  const merged=new Map(current.records),conflicts=[];
  for(const [key,source] of incoming.records){
    const existing=merged.get(key);
    if(!existing||existing.status==='fresh'){merged.set(key,source);continue;}
    if(source.status==='fresh')continue;
    if(existing.status!==source.status){
      const chosen=policy==='current'?existing:policy==='incoming'?source:existing.status==='hard'?existing:source;
      conflicts.push({key,current:existing.status,incoming:source.status,after:chosen.status});merged.set(key,chosen);
    }
  }
  return {records:merged,conflicts};
}
function currentProfileFingerprint(){return JSON.stringify([localStorage.getItem(RESET_GENERATION_KEY),localStorage.getItem(PROFILE_PREFIX+'wp_wrong'),localStorage.getItem(PROFILE_PREFIX+'wp_correct')]);}
function oldProfileFingerprint(){return JSON.stringify([localStorage.getItem('wp_wrong'),localStorage.getItem('wp_correct')]);}
function invalidateTransfer(message){
  transferSource=null;transferPlan=null;transferFingerprint=null;legacyFingerprint=null;
  transferEl('transfer-preview').hidden=true;transferEl('confirm-transfer').disabled=true;
  transferEl('transfer-error').textContent=message||'';
}
function showTransferPreview(){
  if(!transferSource)return;
  const current=normalizeTransfer({poolWrong,poolCorrect});
  transferPlan=mergeTransfer(current,transferSource,transferEl('transfer-policy').value);
  transferEl('transfer-current').textContent='当前：'+transferStats(current.records);
  transferEl('transfer-incoming').textContent='来源：'+transferStats(transferSource.records);
  transferEl('transfer-after').textContent='接续后：'+transferStats(transferPlan.records);
  transferEl('transfer-conflict-options').hidden=!transferPlan.conflicts.length;
  transferEl('transfer-conflict-count').textContent=`查看 ${transferPlan.conflicts.length} 个冲突词及处理结果`;
  transferEl('transfer-conflicts').replaceChildren(...transferPlan.conflicts.map(c=>{
    const li=document.createElement('li');li.textContent=`${c.key}：当前${transferStatus(c.current)} / 来源${transferStatus(c.incoming)} → ${transferStatus(c.after)}`;return li;
  }));
  transferEl('transfer-notes').textContent=transferSource.ignored?`来源中有 ${transferSource.ignored} 条不属于当前词库，已排除，不增加或修改词库。`:'当前词库保持不变。';
  transferEl('transfer-preview').hidden=false;transferEl('confirm-transfer').disabled=false;
}
function acceptTransferSource(data,title,legacy=false){
  if(storageFailed||!storageIsCurrent())throw Error('当前存档不可用，请保留页面并先导出记录。');
  transferSource=normalizeTransfer(data);transferFingerprint=currentProfileFingerprint();
  legacyFingerprint=legacy?oldProfileFingerprint():null;
  transferEl('transfer-source-title').textContent=title;transferEl('transfer-policy').value='review';
  transferEl('transfer-error').textContent='';showTransferPreview();
}
function openTransferDialog(){
  if(transferDialog.open)return;
  if(storageFailed||!storageIsCurrent())return;
  syncLearningClock(false);closeWordSound();closeTimePrompt();
  transferPaused=roundState?.paused||false;
  if(roundState){roundState.paused=true;clearTimeout(reviewTimer);if(reviewBusy)showReviewCard();roundState.paused=true;saveSession();}
  invalidateTransfer();transferEl('import-file').value='';
  transferEl('download-transfer-backup').hidden=!localStorage.getItem(TRANSFER_BACKUP);
  transferDialog.showModal();transferEl('read-legacy').focus();
}
transferEl('read-legacy').onclick=()=>{
  transferReading++;invalidateTransfer();
  try{
    const wrong=localStorage.getItem('wp_wrong'),correct=localStorage.getItem('wp_correct');
    if(wrong===null&&correct===null)throw Error('本浏览器没有找到 V7 记录。请在原来使用 V7 的浏览器导出，再选择文件导入。');
    acceptTransferSource({poolWrong:wrong===null?[]:JSON.parse(wrong),poolCorrect:correct===null?[]:JSON.parse(correct)},'来源：本浏览器的 V7',true);
  }catch(error){invalidateTransfer(error instanceof SyntaxError?'V7 记录无法解析，原数据未修改。':error.message);}
};
transferEl('import-file').onchange=async event=>{
  const token=++transferReading;invalidateTransfer();const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>2*1024*1024)throw Error('文件超过 2 MB，未读取。请选择 WordPuzzle 导出的学习记录。');
    const data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));
    if(token!==transferReading||!transferDialog.open)return;
    acceptTransferSource(data,'来源文件：'+file.name);
  }catch(error){if(token===transferReading)invalidateTransfer(error instanceof SyntaxError?'文件不是有效 JSON，原记录未修改。':error.message);}
};
transferEl('transfer-policy').onchange=showTransferPreview;
function buildLearningExport(){
  return {format:'wordpuzzle-learning',schema:1,version:'v7.5.1',exported:new Date().toISOString(),
    poolWrong,poolCorrect,session:localStorage.getItem(ROUND_KEY)};
}
function downloadLearningJSON(data,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// A durable journal allows a partial multi-key write to finish before app initialization.
// Keep the original V7 keys untouched; fence older tabs with the existing reset generation.
function recoverLearningTransfer(){
  const raw=localStorage.getItem(TRANSFER_PENDING);if(!raw)return false;
  const journal=JSON.parse(raw);
  if(journal.schema!==1||typeof journal.generation!=='string'||!journal.generation||journal.generation.length>160)throw Error('invalid transfer journal');
  const normalized=normalizeTransfer(journal.data);
  if(normalized.ignored||normalized.records.size!==new Set(FULL_DB.map(w=>w.w.toLowerCase())).size)throw Error('incomplete transfer journal');
  const data=transferData(normalized.records);
  const tag=items=>JSON.stringify(items.map(item=>({...item,_wpResetGeneration:journal.generation})));
  localStorage.setItem(RESET_GENERATION_KEY,journal.generation);
  localStorage.setItem(PROFILE_PREFIX+'wp_wrong',tag(data.poolWrong));
  localStorage.setItem(PROFILE_PREFIX+'wp_correct',tag(data.poolCorrect));
  localStorage.removeItem(PROFILE_PREFIX+'wp_round_v71');
  localStorage.setItem(PROFILE_PREFIX+'wp_version','mvp-v1');
  localStorage.setItem(TRANSFER_RECEIPT,JSON.stringify({time:journal.time,summary:transferStats(normalized.records)}));
  localStorage.removeItem(TRANSFER_PENDING);
  return true;
}
transferEl('confirm-transfer').onclick=()=>{
  if(!transferPlan)return;
  try{
    if(transferFingerprint!==currentProfileFingerprint()||(legacyFingerprint!==null&&legacyFingerprint!==oldProfileFingerprint())){
      invalidateTransfer('预览后学习记录发生了变化，请刷新页面，再重新读取并核对。');return;
    }
    if(!storageIsCurrent())return;
    const backup={...buildLearningExport(),rawStorage:Object.fromEntries(profileKeys.map(k=>[k,localStorage.getItem(k)]))};
    localStorage.setItem(TRANSFER_BACKUP,JSON.stringify(backup));
    const journal={schema:1,generation:`transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`,time:new Date().toISOString(),data:transferData(transferPlan.records)};
    localStorage.setItem(TRANSFER_PENDING,JSON.stringify(journal));
    storageFailed=true;roundState=null;clearTimeout(reviewTimer);reviewBusy=false;
    recoverLearningTransfer();location.reload();
  }catch(error){
    if(localStorage.getItem(TRANSFER_PENDING)){
      storageFailed=true;roundState=null;clearTimeout(reviewTimer);reviewBusy=false;
      transferEl('download-transfer-backup').hidden=false;
      transferEl('confirm-transfer').disabled=true;transferEl('read-legacy').disabled=true;transferEl('import-file').disabled=true;transferEl('cancel-transfer').disabled=true;
      transferEl('transfer-error').textContent='接续写入中断，已停止学习并保留备份。请刷新页面重试恢复；不要清除浏览器数据。';
    }else transferEl('transfer-error').textContent='无法保存迁移备份，学习记录未修改。请释放浏览器存储空间后重试。';
  }
};
transferEl('download-transfer-backup').onclick=()=>{
  try{const raw=localStorage.getItem(TRANSFER_BACKUP);if(!raw)throw Error();downloadLearningJSON(JSON.parse(raw),'wordpuzzle-before-transfer.json');}
  catch(error){transferEl('transfer-error').textContent='备份暂时无法读取，请保留浏览器数据。';}
};
function showTransferRecoveryActions(){
  if(!localStorage.getItem(TRANSFER_PENDING))return;
  const card=document.querySelector('#ended .result-card');
  transferEl('end-summary').textContent='进度接续尚未完成，已停止学习。可先下载接续前的备份，释放其他存储空间后重试；不要清除此网站的数据。';
  const backup=document.createElement('button');backup.className='btn-confirm';backup.id='recover-transfer-backup';backup.textContent='下载接续前备份';
  backup.onclick=()=>{
    try{const raw=localStorage.getItem(TRANSFER_BACKUP);if(!raw)throw Error();downloadLearningJSON(JSON.parse(raw),'wordpuzzle-before-transfer.json');}
    catch(error){transferEl('end-summary').textContent='备份暂时无法读取，请保留此网站的数据。';}
  };
  const retry=document.createElement('button');retry.className='btn-sm end-choice';retry.id='retry-transfer';retry.textContent='重试恢复';retry.onclick=()=>location.reload();
  card.append(backup,retry);
}
transferEl('cancel-transfer').onclick=()=>{if(!storageFailed)transferDialog.close();};
transferDialog.addEventListener('cancel',event=>{if(storageFailed)event.preventDefault();});
transferDialog.addEventListener('close',()=>{
  transferReading++;
  if(!storageFailed&&roundState){roundState.paused=transferPaused;resetClockReference();saveSession();}
});
