// Explicit, word-specific correspondences. Never infer sounds from spelling alone.
// SOUND_HINTS is loaded from the reviewed fixed lexicon in sound-map.js.
// The legacy grid removes spaces from phrases; speech must keep their word boundaries.
const SPOKEN_FORMS = Object.fromEntries([
  'cell phone','mobile phone','social media','pass an exam','take an exam','primary school',
  'nature studies','make progress','hand in homework','classical music','science fiction',
  'jazz music','climate change','traffic jam','public transport','main course','keep fit',
  'sore throat','ice skates','alarm clock','washing machine','shopping centre','police station',
  'post office','railway station','sports centre','city centre','bus station','shop assistant',
  'changing room','ice hockey','table tennis','car park','film star'
].map(text=>[text.replaceAll(' ',''),text]));
let soundRequest = 0, soundTimeout = null, activeWordAudio = null;
function stopWordSound() {
  soundRequest++;clearTimeout(soundTimeout);
  if(activeWordAudio){activeWordAudio.pause();activeWordAudio=null;}
  if(window.speechSynthesis)window.speechSynthesis.cancel();
  document.querySelectorAll('.sound-status').forEach(el=>el.textContent='');
}
function playWordSound(word, rate, status) {
  stopWordSound();
  const key=word.toLowerCase();
  if(AUDIO_WORDS.includes(key)){
    const token=soundRequest;
    const audio=new Audio('./audio/'+encodeURIComponent(key)+'.mp3');
    activeWordAudio=audio;audio.playbackRate=rate<.8?.72:1;
    const failed=()=>{if(token===soundRequest){clearTimeout(soundTimeout);audio.pause();status.textContent='读音暂时无法播放，请重试。';}};
    status.textContent='准备播放…';
    audio.onplaying=()=>{if(token===soundRequest){clearTimeout(soundTimeout);status.textContent='正在播放整词读音…';}};
    audio.onended=()=>{if(token===soundRequest){clearTimeout(soundTimeout);status.textContent='播放结束';activeWordAudio=null;}};
    audio.onerror=failed;
    soundTimeout=setTimeout(failed,8000);
    audio.play().catch(failed);return;
  }
  if(!window.speechSynthesis || !window.SpeechSynthesisUtterance){
    status.textContent='此浏览器暂不支持朗读，可继续练习。';return;
  }
  const synth=window.speechSynthesis;
  const voices=synth.getVoices().filter(v=>/^en(?:[-_]|$)/i.test(v.lang));
  const voice=voices.find(v=>/^en[-_]US/i.test(v.lang)&&v.localService)||voices.find(v=>v.localService)||voices.find(v=>/^en[-_]US/i.test(v.lang))||voices[0];
  if(!voice){status.textContent='未找到设备英语语音，请启用英语语音后重试。可继续练习。';return;}
  const token=soundRequest;
  const utterance=new SpeechSynthesisUtterance(SPOKEN_FORMS[word.toLowerCase()]||word);
  utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=rate;
  status.textContent='准备播放…';
  utterance.onstart=()=>{if(token===soundRequest){clearTimeout(soundTimeout);status.textContent='正在播放整词读音…';}};
  utterance.onend=()=>{if(token===soundRequest){clearTimeout(soundTimeout);status.textContent='播放结束';}};
  utterance.onerror=()=>{if(token===soundRequest){clearTimeout(soundTimeout);status.textContent='读音暂时无法播放，可重试或继续练习。';}};
  try{
    soundTimeout=setTimeout(()=>{if(token===soundRequest){stopWordSound();status.textContent='读音未能启动，请重试或检查设备英语语音。';}},8000);
    synth.speak(utterance);
  }catch(e){clearTimeout(soundTimeout);status.textContent='读音暂时无法播放，可继续练习。';}
}
function createWordSoundContent(word) {
  const row=document.createElement('div');row.className='sound-content';
  const hint=SOUND_HINTS[word.w.toLowerCase()];
  const heading=document.createElement('div');heading.className='sound-heading';heading.lang='en';
  heading.setAttribute('aria-label',SPOKEN_FORMS[word.w.toLowerCase()]||word.w);
  if(hint){
    hint[1].forEach(([letters],index)=>{
      if(index){const dot=document.createElement('i');const boundary=/^\s/.test(letters);dot.className=boundary?'sound-word-boundary':'sound-divider';dot.textContent=boundary?' ':'·';dot.setAttribute('aria-hidden','true');heading.append(dot);}
      const segment=document.createElement('span');segment.className=`sound-segment sound-color-${index%3}`;segment.textContent=letters.trim();
      heading.append(segment);
    });
  }else heading.textContent=SPOKEN_FORMS[word.w.toLowerCase()]||word.w;
  row.append(heading);
  if(hint){
    const ipa=document.createElement('p');ipa.className='sound-ipa';ipa.textContent=`美式 /${hint[0]}/`;row.append(ipa);
  }
  const meaning=document.createElement('p');meaning.className='sound-meaning';meaning.textContent=word.c;row.append(meaning);
  if(hint){
    const parts=document.createElement('div');parts.className='sound-parts';parts.setAttribute('aria-label','按顺序对应上方拼写片段的读音');
    hint[1].forEach(([letters,sound],index)=>{
      const part=document.createElement('span');part.className=`sound-color-${index%3}`;
      const label=document.createElement('small');label.className='sound-part-letters';label.textContent=letters.trim();
      const ipa=document.createElement('b');ipa.className='sound-part-ipa';ipa.textContent=sound?`/${sound}/`:'不发音';
      part.append(label,ipa);
      part.setAttribute('aria-label',sound?`${letters.trim()} 对应 /${sound}/`:`${letters.trim()} 不发音`);parts.append(part);
    });row.append(parts);
    const note=document.createElement('p');note.className='sound-note';note.textContent=hint[1].some(part=>!part[1])?'看相同颜色连起来读；标注“不发音”的字母仍要记住。':'看相同颜色，边听整词边连起来读。';row.append(note);
  }
  const controls=document.createElement('div');controls.className='sound-controls';
  const status=document.createElement('p');status.className='sound-status';status.setAttribute('role','status');
  [['听整词',.9],['慢速听',.65]].forEach(([label,rate])=>{
    const button=document.createElement('button');button.type='button';button.className='btn-sm';button.textContent=label;
    button.setAttribute('aria-label',`${label} ${word.w}`);button.onclick=()=>playWordSound(word.w,rate,status);controls.append(button);
  });row.append(controls,status);return row;
}
window.addEventListener('pagehide',stopWordSound);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopWordSound();});

const soundDialog=document.createElement('dialog');
soundDialog.className='word-sound-dialog';soundDialog.setAttribute('aria-label','错词读音');
document.body.append(soundDialog);
soundDialog.addEventListener('close',stopWordSound);
soundDialog.addEventListener('cancel',stopWordSound);
function closeWordSound(){stopWordSound();if(soundDialog.open)soundDialog.close();}
function openWordSound(word){
  stopWordSound();soundDialog.replaceChildren(createWordSoundContent(word));
  const close=document.createElement('button');close.type='button';close.className='btn-confirm';close.textContent='关闭读音';
  close.onclick=closeWordSound;soundDialog.append(close);soundDialog.showModal();
  playWordSound(word.w,.9,soundDialog.querySelector('.sound-status'));
}
function renderWrongWordSound(word){
  const row=document.createElement('div');row.className='wrong-word-sound';
  const text=document.createElement('div');text.className='sound-word';text.textContent=`${word.c} → ${word.w}`;
  const button=document.createElement('button');button.type='button';button.className='sound-trigger';
  button.textContent='🔊';button.setAttribute('aria-label',`读音 ${word.w}`);button.title='听读音';
  button.onclick=()=>openWordSound(word);row.append(text,button);return row;
}
