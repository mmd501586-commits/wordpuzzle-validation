// V7.7: local append-only history. The profile and learning algorithm stay unchanged.
(() => {
  const PREFIX='wp_trial_v741:history:', DB='wp_trial_v741:learning_history';
  const uniqueId=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const tabId=uniqueId(), outboxKey=PREFIX+'outbox:'+tabId;
  let pending=[], summaries=new Map(), dbPromise=null, running=null, retryTimer=null;
  let failure='', journalFailure=false, clearing=false, historyPaused=false;
  const epoch=()=>localStorage.getItem(PREFIX+'epoch')||'initial';
  let ownEpoch;
  try{ownEpoch=epoch();}catch(error){ownEpoch='unavailable';}
  const el=id=>document.getElementById(id);
  const labels={round_started:'开始新一轮',round_ended:'结束本轮',round_restored:'恢复本轮',round_paused:'暂停',round_resumed:'继续',test_started:'开始独立检验',test_completed:'检验结算',page_shown:'显示题页',page_submitted:'提交题页',word_result:'单词检验结果',practice_started:'开始练习',practice_pass_started:'开始一遍练习',practice_answer:'练习作答',practice_completed:'练习结束',time_expired:'时间到',time_extended:'增加时间',timeout_submitted:'到时直接提交',cell_edit:'修改字母',review_edit:'修改练习答案',focus_changed:'焦点变化',click:'点击',viewport_changed:'可视区域变化',visibility_changed:'页面可见性变化',page_hidden:'离开页面',page_shown_browser:'返回页面',history_opened:'查看记录',history_closed:'关闭记录'};
  function status(){
    const node=el('history-status');if(!node)return;
    node.textContent=failure||journalFailure?'过程记录未完整保存；请保留页面并导出 JSON。'+failure:pending.length?'过程记录正在保存…':'过程记录已保存在本机';
    node.classList.toggle('history-warning',!!failure||journalFailure);
    const alert=el('history-alert');if(alert){alert.hidden=!failure&&!journalFailure;alert.textContent=node.textContent;}
  }
  function persist(){
    try{
      if(pending.length)localStorage.setItem(outboxKey,JSON.stringify({epoch:ownEpoch,events:pending,rounds:[...summaries.values()]}));
      else localStorage.removeItem(outboxKey);
      journalFailure=false;
    }catch(error){journalFailure=true;}
    status();
  }
  function openDB(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      let request,settled=false;
      const fail=error=>{if(!settled){settled=true;reject(error);}};
      try{request=indexedDB.open(DB,1);}catch(error){fail(error);return;}
      request.onupgradeneeded=()=>{
        const db=request.result;
        const events=db.createObjectStore('events',{keyPath:'seq',autoIncrement:true});
        events.createIndex('id','id',{unique:true});events.createIndex('roundId','roundId');
        db.createObjectStore('rounds',{keyPath:'id'});
      };
      request.onerror=()=>fail(request.error);request.onblocked=()=>fail(Error('数据库被其他页面占用'));
      request.onsuccess=()=>{
        if(settled){request.result.close();return;}settled=true;
        request.result.onversionchange=()=>{request.result.close();dbPromise=null;};resolve(request.result);
      };
    }).catch(error=>{dbPromise=null;throw error;});
    return dbPromise;
  }
  function context(){
    try{
      if(clearing||restoring||!roundState||storageFailed||!storageIsCurrent()||epoch()!==ownEpoch)return null;
      return roundState;
    }catch(error){return null;}
  }
  function record(layer,type,data={}){
    const round=context();if(!round)return;
    try{
      const now=Date.now();
      // An upgraded unfinished round has no invented history for its earlier part.
      round.historyCoverage=round.historyCoverage||(type==='round_started'?'from_start':'partial');
      const event={id:uniqueId(),at:new Date(now).toISOString(),tabId,roundId:round.id,
        generation:storageGeneration,version:'V7.7',layer,type,phase:round.phase,
        batchId:round.id+':'+(round.phase==='review'?'practice:'+((round.testCount||0)+1):'test:'+(round.testCount||0)),
        page:typeof currentPage==='number'?currentPage:null,elapsedMs:round.elapsedMs??round.elapsed*1000,data};
      pending.push(event);
      summaries.set(round.id,{id:round.id,startedAt:round.startedAt,original:round.original.map(w=>({w:w.w,c:w.c})),passed:[...round.passed],phase:round.phase,elapsedMs:event.elapsedMs,coverage:round.historyCoverage,updatedAt:now,lastEventAt:event.at});
      persist();
      if(!retryTimer)retryTimer=setTimeout(()=>{retryTimer=null;flush();},100);
    }catch(error){failure='记录暂时不可用。';status();}
  }
  function journals(){
    const result=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key?.startsWith(PREFIX+'outbox:'))continue;
      const raw=localStorage.getItem(key),value=JSON.parse(raw);
      if(value.epoch===ownEpoch)result.push({key,...value});
    }
    result.push({key:outboxKey,epoch:ownEpoch,events:[...pending],rounds:[...summaries.values()]});
    return result;
  }
  async function flush(){
    if(running){await running;return pending.length?flush():!failure;}
    if(clearing)return false;
    running=(async()=>{
      try{
        if(epoch()!==ownEpoch)return false;
        const boxes=journals(),events=new Map(),rounds=new Map();
        for(const box of boxes){
          for(const e of box.events)events.set(e.id,e);
          for(const r of box.rounds){if(!rounds.has(r.id)||rounds.get(r.id).updatedAt<=r.updatedAt)rounds.set(r.id,r);}
        }
        const db=await openDB();
        if(clearing||epoch()!==ownEpoch)return false;
        if(events.size)await new Promise((resolve,reject)=>{
          const tx=db.transaction(['events','rounds'],'readwrite'),store=tx.objectStore('events'),rs=tx.objectStore('rounds');
          tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('写入中断'));tx.onerror=()=>{};
          for(const event of events.values()){
            const found=store.index('id').getKey(event.id);
            found.onsuccess=()=>{if(found.result===undefined)store.add(event);};
          }
          for(const summary of rounds.values()){
            const found=rs.get(summary.id);found.onsuccess=()=>{if(!found.result||found.result.updatedAt<=summary.updatedAt)rs.put(summary);};
          }
        });
        pending=pending.filter(e=>!events.has(e.id));
        // Remove only acknowledged entries; another tab may have appended while we awaited IDB.
        for(const key of new Set(boxes.map(b=>b.key))){
          const raw=localStorage.getItem(key);if(!raw)continue;
          const value=JSON.parse(raw);value.events=value.events.filter(e=>!events.has(e.id));
          if(value.events.length)localStorage.setItem(key,JSON.stringify(value));else localStorage.removeItem(key);
        }
        failure='';persist();return true;
      }catch(error){failure='数据库写入或读取失败。';status();return false;}
    })();
    const success=await running;running=null;return success;
  }
  async function exportAll(roundId){
    await flush();let events=[],rounds=[];
    try{
      const db=await openDB();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(['events','rounds'],'readonly');
        tx.objectStore('events').getAll().onsuccess=e=>{events=e.target.result;};
        tx.objectStore('rounds').getAll().onsuccess=e=>{rounds=e.target.result;};
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
      });
    }catch(error){failure='数据库写入或读取失败。';}
    let boxes=[];try{boxes=journals();}catch(error){failure='待保存记录读取失败。';}
    const ids=new Set(events.map(e=>e.id)),pendingMap=new Map(),roundMap=new Map(rounds.map(r=>[r.id,r]));
    for(const box of boxes){for(const e of box.events)if(!ids.has(e.id))pendingMap.set(e.id,e);
      for(const r of box.rounds)if(!roundMap.has(r.id)||roundMap.get(r.id).updatedAt<=r.updatedAt)roundMap.set(r.id,r);}
    for(const e of pending)if(!ids.has(e.id))pendingMap.set(e.id,e);
    for(const r of summaries.values())if(!roundMap.has(r.id)||roundMap.get(r.id).updatedAt<=r.updatedAt)roundMap.set(r.id,r);
    const keep=e=>!roundId||e.roundId===roundId;
    status();
    return {schema:1,scope:'this_browser_profile',complete:!failure&&!journalFailure&&!pendingMap.size,
      notice:'仅包含启用记录后的过程；partial 轮次从中途开始。可视区域变化不能证明系统键盘状态。历史不会随普通新一轮删除，清除网站数据或清空学习记录会删除。',
      rounds:[...roundMap.values()].filter(r=>!roundId||r.id===roundId).sort((a,b)=>b.startedAt-a.startedAt),
      events:events.filter(keep),pendingEvents:[...pendingMap.values()].filter(keep),error:failure||null};
  }
  async function clear(){
    clearing=true;clearTimeout(retryTimer);retryTimer=null;
    if(running)await running;
    try{
      // A persistent reset marker fences recovered outboxes and other tabs too.
      ownEpoch=uniqueId();localStorage.setItem(PREFIX+'epoch',ownEpoch);
      const db=await openDB();await new Promise((resolve,reject)=>{
        const tx=db.transaction(['events','rounds'],'readwrite');tx.objectStore('events').clear();tx.objectStore('rounds').clear();
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
      });
      const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(PREFIX+'outbox:'))keys.push(key);}
      keys.forEach(key=>localStorage.removeItem(key));pending=[];summaries.clear();failure='';
    }finally{clearing=false;}
  }
  window.LearningHistory={record,flush,exportAll,clear};
  window.recordLearning=(type,data)=>record('learning',type,data);
  const dialog=document.createElement('dialog');dialog.id='history-dialog';dialog.setAttribute('aria-labelledby','history-title');
  dialog.innerHTML='<h2 id="history-title">每轮学习记录</h2><p>保存在当前浏览器；开始新一轮会保留旧记录。设置中的“下载 JSON”包含全部记录。</p><label>轮次 <select id="history-round-select"></select></label><p id="history-summary"></p><label>记录类型 <select id="history-layer"><option value="all">全部</option><option value="learning">学习流程</option><option value="interaction">页面操作</option></select></label><ol id="history-events"></ol><button type="button" class="btn-sm" id="history-more">再显示 50 条</button><p><button type="button" class="btn-confirm" id="history-export-round">导出这一轮 JSON</button></p><form method="dialog"><button class="btn-sm">返回学习</button></form>';
  document.body.append(dialog);let loaded=null,visible=50;
  function detail(event){
    const d=event.data;
    if(event.type==='word_result'||event.type==='practice_answer')return `${d.word} · ${d.correct?'正确':'未通过'} · 输入：${d.answer||'空白'}${d.reason?' · '+d.reason:''}`;
    if(d.words)return d.words.join('、');
    if(event.type==='cell_edit'||event.type==='review_edit')return `${d.target}：${d.before||'空白'} → ${d.after||'空白'}`;
    if(event.type==='focus_changed')return `${d.from||'无'} → ${d.to||'无'}`;
    return d.target||d.reason||'';
  }
  function render(){
    if(!loaded)return;const id=el('history-round-select').value,r=loaded.rounds.find(r=>r.id===id);
    el('history-export-round').disabled=!r;
    el('history-summary').textContent=r?`${new Date(r.startedAt).toLocaleString()} · 已通过 ${r.passed.length} / ${r.original.length} · ${r.phase==='ended'?'已结束':'当前/未结束'} · ${r.coverage==='partial'?'过程记录从中途开始':'从本轮开始记录'}${loaded.complete?'':' · 部分过程尚未保存'}`:'暂无可读取的轮次';
    const layer=el('history-layer').value;
    const rows=[...loaded.events,...loaded.pendingEvents].filter(e=>e.roundId===id&&(layer==='all'||e.layer===layer));
    el('history-events').replaceChildren(...rows.slice(0,visible).map(event=>{
      const li=document.createElement('li'),details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');
      summary.textContent=`${new Date(event.at).toLocaleTimeString()} · ${labels[event.type]||event.type} ${detail(event)}`;
      pre.textContent=JSON.stringify(event,null,2);details.append(summary,pre);li.append(details);return li;
    }));el('history-more').hidden=visible>=rows.length;
  }
  window.openLearningHistory=el('open-history').onclick=async()=>{
    if(dialog.open||storageFailed)return;
    syncLearningClock(false);historyPaused=roundState?.paused||false;closeWordSound();closeTimePrompt();
    if(roundState){roundState.paused=true;clearTimeout(reviewTimer);if(reviewBusy)showReviewCard();roundState.paused=true;saveSession();}
    record('interaction','history_opened');dialog.showModal();el('history-summary').textContent='正在读取…';
    loaded=await exportAll();el('history-round-select').replaceChildren(...loaded.rounds.map(r=>{
      const option=document.createElement('option');option.value=r.id;option.textContent=`${new Date(r.startedAt).toLocaleString()} · ${r.passed.length}/${r.original.length}`;return option;
    }));visible=50;render();
  };
  dialog.addEventListener('close',()=>{
    if(roundState){roundState.paused=historyPaused;resetClockReference();record('interaction','history_closed');saveSession();}
  });
  el('history-round-select').onchange=el('history-layer').onchange=()=>{visible=50;render();};
  el('history-more').onclick=()=>{visible+=50;render();};
  el('history-export-round').onclick=async()=>{
    saveSession();const id=el('history-round-select').value;
    downloadLearningJSON({...buildLearningExport(),history:await exportAll(id)},`wordpuzzle-round-${id}.json`);
  };
  function target(node){
    if(!(node instanceof Element))return null;
    const cell=node.closest('#grid .cell');if(cell)return `cell:${cell.dataset.r},${cell.dataset.c}`;
    if(node.id)return node.id;
    const clue=node.closest('#clues .clue');if(clue)return 'clue:'+clue.textContent.trim();
    const button=node.closest('button');if(button)return button.textContent.trim();return null;
  }
  const values=new WeakMap();
  function editable(node){return node instanceof HTMLInputElement&&node.matches('#grid input,#rv-input');}
  function edit(node,source,before){
    if(!editable(node))return;
    const old=before??values.get(node)??'',after=node.value;values.set(node,after);
    if(old!==after)record('interaction',node.id==='rv-input'?'review_edit':'cell_edit',{target:target(node),before:old,after,source,direction:inputDirection});
  }
  document.addEventListener('beforeinput',e=>{if(editable(e.target))values.set(e.target,e.target.value);},true);
  document.addEventListener('input',e=>edit(e.target,e.inputType||'input'));
  const keyValues=new WeakMap();
  document.addEventListener('keydown',e=>{if(editable(e.target))keyValues.set(e,e.target.value);},true);
  // The grid handles physical keys without emitting input. Read after its target handler.
  document.addEventListener('keydown',e=>{if(keyValues.has(e))edit(e.target,'key:'+e.key,keyValues.get(e));});
  document.addEventListener('focusin',e=>{
    if(editable(e.target))values.set(e.target,e.target.value);
    record('interaction','focus_changed',{from:target(e.relatedTarget),to:target(e.target),direction:inputDirection});
  });
  document.addEventListener('focusout',e=>{if(!e.relatedTarget)record('interaction','focus_changed',{from:target(e.target),to:null,direction:inputDirection});});
  document.addEventListener('click',e=>{
    if(e.target.closest('#history-dialog'))return;const name=target(e.target);if(name)record('interaction','click',{target:name,direction:inputDirection});
  },true);
  let viewportTimer;
  window.visualViewport?.addEventListener('resize',()=>{
    clearTimeout(viewportTimer);viewportTimer=setTimeout(()=>record('interaction','viewport_changed',{height:Math.round(visualViewport.height),width:Math.round(visualViewport.width),offsetTop:Math.round(visualViewport.offsetTop),focus:target(document.activeElement),interpretation:'viewport_only'}),100);
  });
  document.addEventListener('visibilitychange',()=>{record('interaction','visibility_changed',{visible:!document.hidden});flush();});
  window.addEventListener('pagehide',()=>{record('interaction','page_hidden');persist();flush();});
  window.addEventListener('pageshow',e=>record('interaction','page_shown_browser',{fromCache:e.persisted}));
  status();
})();
