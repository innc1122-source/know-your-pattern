/* =====================================================================
   UI
   ===================================================================== */
let D = Store.load();
let L = D.lang || 'zh';
let tab = 'home';
let flow = null;          // active capture flow state
const $ = id => document.getElementById(id);
const c = () => C[L];
const sig = k => SIGNALS[k] ? SIGNALS[k][L] : null;
const esc = s => (s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const uid = () => 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

function persist(){ D.lang = L; Store.save(D); }
function fmtDate(ts){
  const d=new Date(ts), n=new Date(), diff=Math.floor((n-d)/86400000);
  if(diff===0) return L==='zh'?'今天':'Today';
  if(diff===1) return L==='zh'?'昨天':'Yesterday';
  if(diff<7)   return L==='zh'?diff+' 天前':diff+' days ago';
  return L==='zh' ? (d.getMonth()+1)+'月'+d.getDate()+'日'
                  : d.toLocaleDateString('en',{month:'short',day:'numeric'});
}

/* ---------- chrome ---------- */
function render(){
  $('tabbar').innerHTML = ['home','patterns','changes','me'].map(t=>
    `<button class="tb ${t===tab||(tab==='gaps'&&t==='me')||(tab==='guesses'&&t==='home')?'on':''}" onclick="go('${t}')">${c()[t]}</button>`).join('');
  const v = {home:viewHome,patterns:viewPatterns,changes:viewChanges,me:viewMe,gaps:viewGaps,guesses:viewGuesses}[tab];
  $('view').innerHTML = v();
  $('view').scrollTop = 0;
  $('storagewarn').classList.toggle('hidden', Store.persistent);
  $('storagewarn').textContent = c().storageWarn;
}
function go(t){ tab=t; render(); }
function setLang(l){ L=l; persist(); render(); if(flow) renderFlow(); }

/* ---------- home ---------- */
function viewHome(){
  const ms = D.moments;
  const r = KYP.ranked(ms).slice(0,4);
  const max = r.length ? r[0].n : 1;
  const wk = KYP.weeklySnapshot(ms);
  const showWeek = wk && (D.seen||{}).week !== wk.weekKey;
  return `
  <div class="pad">
    ${showWeek ? weekCard(wk) : ''}
    <div class="eyebrow">${ms.length ? c().momentsCount(ms.length) : ''}</div>
    <h1 class="lede">${c().somethingHappened}</h1>
    <button class="cta" onclick="startFlow()">${c().catchOne}</button>
    ${predHook()}

    <div class="rule"></div>
    <div class="eyebrow mb">${c().showingUp}</div>
    ${r.length ? `<p class="note">${c().homeHintSignal}</p>` + r.map(x=>`
      <div class="meterrow">
        <span class="nm">${sig(x.signal).n}</span>
        <div class="meter"><i style="width:${Math.round(x.n/max*100)}%"></i></div>
        <span class="ct">${x.n}</span>
      </div>`).join('') : `<p class="note">${c().noSignals}<br>${c().homeHintSignal}</p>`}

    <div class="rule"></div>
    <div class="eyebrow mb">${c().recent}</div>
    ${ms.length ? ms.slice().reverse().slice(0,6).map(m=>`
      <div class="evline">
        <div class="d">${fmtDate(m.ts)} · ${sig(m.signal)?sig(m.signal).n:''}</div>
        <div class="t">${esc(m.text)}</div>
      </div>`).join('') : `<p class="note">${c().nothingYet}</p>`}
  </div>`;
}

function weekCard(wk){
  const s = wk.topSignal ? sig(wk.topSignal) : null;
  return `<div class="weekcard">
    <div class="wtitle">${c().weekTitle}</div>
    <p class="wcount">${c().weekCount(wk.n)}</p>
    ${s ? `<div class="wrow"><span class="wlab">${c().weekTop}</span><span class="wval">${s.s} · ${wk.topSignalN}</span></div>`:''}
    ${wk.topReaction && REACTIONS[wk.topReaction] ? `<div class="wrow"><span class="wlab">${c().weekReact}</span><span class="wval">${REACTIONS[wk.topReaction][L]}</span></div>`:''}
    ${wk.wrote ? `<div class="wrow col"><span class="wlab">${c().weekWrote}</span><span class="wquote">“${esc(wk.wrote)}”</span></div>`:''}
    ${s ? `<div class="wcarry"><span class="wlab">${c().weekCarry}</span><p>${s.q}</p></div>`:''}
    <button class="wdismiss" onclick="dismissWeek('${wk.weekKey}')">${c().weekDismiss}</button>
  </div>`;
}
function dismissWeek(k){ D.seen = D.seen||{glimpse:{},pattern:{}}; D.seen.week = k; persist(); render(); }

/* ---------- prediction as the product's game: it bets, you judge ----------
   The hit-rate is framed as "how well it knows you", never a score to optimise.
   An open guess is a re-entry loop, not a nudge to record. */
function predHook(){
  const open = D.predictions.filter(p=>p.status==='open');
  const score = KYP.predictionScore(D.predictions);
  if(!open.length && !score) return '';
  const lead = open.length ? c().openGuessLead(open.length) : c().knowingYou;
  const sub  = score ? c().guessesRight(score.hit, score.total) : c().guessPeek;
  return `<button class="guesshook" onclick="go('guesses')">
    <div class="ghmain"><div class="ghlead">${lead}</div><div class="ghsub">${sub}</div></div>
    <div class="gharrow">&rarr;</div>
  </button>`;
}

function viewGuesses(){
  const open = D.predictions.filter(p=>p.status==='open').slice().reverse();
  const score = KYP.predictionScore(D.predictions);
  let out = `<div class="pad">
    <button class="more" style="text-align:left;padding-left:0" onclick="go('home')">&larr; ${c().home}</button>
    <div class="eyebrow">${c().guessesTitle}</div>`;
  if(score){
    out += `<h1 class="lede sm">${c().guessesScoreLead}</h1>
      <div class="saidcard"><div class="who">${c().speaker}</div><p>${c().guessesRight(score.hit,score.total)}</p></div>
      <p class="note">${c().guessRejectHelps}</p>`;
  } else {
    out += `<p class="body">${c().guessesIntro}</p>`;
  }
  out += `<div class="rule"></div><div class="eyebrow mb">${c().openGuessesHead}</div>`;
  if(open.length){
    out += open.map(p=>{
      const s = sig(p.signal);
      return `<div class="saidcard"><div class="who">${c().ourGuess}</div><p>${s?s.p:''}</p></div>
        <p class="note" style="margin:-8px 0 18px">${c().guessWaiting} · ${fmtDate(p.createdTs)}</p>`;
    }).join('');
  } else {
    out += `<p class="note">${c().noOpenGuesses}</p>`;
  }
  return out + '</div>';
}

function patternSentence(s){
  return `<div class="contrast">
    <div class="lab">${c().notSoMuch}</div>
    <div class="side dim">${s.t1}</div>
    <div class="lab">${c().soMuchAs}</div>
    <div class="side hot">${s.t2}</div>
  </div>`;
}

/* ---------- patterns ---------- */
function viewPatterns(){
  const ms = D.moments;
  const p = KYP.pattern(ms);
  const score = KYP.predictionScore(D.predictions);
  let out = '<div class="pad">';

  if(p){
    const s = sig(p.signal);
    out += `
    <div class="eyebrow">${c().possiblePattern}</div>
    <div class="saidcard"><div class="who">${c().speaker}</div>${patternSentence(s)}</div>
    <div class="meterrow"><span class="nm">${c().confidence}</span>
      <div class="meter"><i style="width:${p.confidence*20}%"></i></div><span class="ct">${p.confidence} / 5</span></div>
    <p class="note">${c().basedOn(p.hits,p.total)}</p>
    <div class="rule"></div>
    <div class="eyebrow mb">${c().whyWeThink}</div>
    ${ms.filter(m=>m.signal===p.signal).slice(-4).reverse().map(m=>`
      <div class="evline"><div class="d">${fmtDate(m.ts)}</div><div class="t">${esc(m.text)}</div></div>`).join('')}
    ${ms.filter(m=>m.note).slice(-1).map(m=>`
      <div class="evline"><div class="d">${c().inYourWords}</div><div class="t">“${esc(m.note)}”</div></div>`).join('')}
    <div class="rule"></div>
    <div class="eyebrow mb">${c().otherPossibility}</div>
    <p class="body ink">${p.alternative ? sig(p.alternative).g : s.a}</p>
    <p class="note">${c().needMore}</p>`;
  } else {
    out += `<div class="eyebrow">${c().patterns}</div>
      <h1 class="lede sm">${c().noPatternYet}</h1>
      <p class="body">${c().noPatternB(KYP.TH.patternCount)}</p>`;
  }

  const r = KYP.ranked(ms);
  if(r.length){
    const max=r[0].n;
    out += `<div class="rule"></div><div class="eyebrow mb">${c().showingUp}</div>` +
      r.map(x=>`<div class="meterrow"><span class="nm">${sig(x.signal).n}</span>
        <div class="meter"><i style="width:${Math.round(x.n/max*100)}%"></i></div>
        <span class="ct">${x.n}</span></div>`).join('');
  }
  if(score){
    out += `<div class="rule"></div><div class="eyebrow mb">${c().predAccuracy}</div>
      <p class="body ink">${c().guessesRight(score.hit,score.total)}</p>`;
  }
  return out + '</div>';
}

/* ---------- changes ---------- */
function viewChanges(){
  const all = KYP.changesAll(D.moments);
  let out = '<div class="pad">';
  if(!all.length){
    const up = KYP.unlockProgress(D.moments);
    const snap = up.signal ? KYP.snapshotNow(D.moments, up.signal) : null;
    const need = up.needCount && up.needDays ? c().unlockBoth(up.needCount, up.needDays)
               : up.needCount ? c().unlockCount(up.needCount)
               : up.needDays ? c().unlockDays(up.needDays) : '';
    out += `<div class="eyebrow">${c().changes}</div>
      <h1 class="lede sm">${c().changesEmpty}</h1>
      <p class="body">${c().changesEmptyB}</p>`;
    if(snap){
      const s = sig(snap.signal);
      out += `<div class="chcard">
        <div class="chname">${s.n}</div>
        <div class="halfrow">
          <div class="half pending">
            <div class="mono">${c().thenPending}</div>
            <div class="bignum dim">— —</div>
            <div class="exlab">${c().thenPendingB}</div>
          </div>
          <div class="arrow">&rarr;</div>
          <div class="half">
            <div class="mono">${c().nowPicture}</div>
            <div class="bignum">${snap.mix[0].pct}%</div>
            <div class="exlab">${RESPONSES[snap.mix[0].response]?RESPONSES[snap.mix[0].response][L]:''}</div>
          </div>
        </div>
        <p class="note" style="margin:14px 0 0">${c().unlockLead} ${need}</p>
      </div>`;
    } else {
      out += `<div class="ghostbox">
        <div class="extag">${c().exampleTag}</div>
        <div class="mono mb">${c().thenNow}</div>
        <div class="exrow">
          <div><div class="mono">${c().then}</div><div class="exnum">67%</div><div class="exlab">${c().exThen}</div></div>
          <div class="arrow">&rarr;</div>
          <div><div class="mono">${c().now}</div><div class="exnum">46%</div><div class="exlab">${c().exNow}</div></div>
        </div>
      </div>
      <p class="mono">${up.signal ? c().unlockLead+' '+need : c().unlockFresh(KYP.TH.changeMin)}</p>`;
    }
  } else {
    out += `<div class="eyebrow mb">${c().thenNow}</div>`;
    all.forEach(ch=>{
      const s=sig(ch.signal), h=ch.headline;
      out += `<div class="chcard">
        <div class="chname">${s.n}</div>
        <div class="mono mb">${c().overDays(ch.n,ch.spanDays)}</div>`;
      if(h){
        out += `<div class="thenrow">
            <div><div class="mono">${c().then}</div><div class="bignum">${h.then}%</div></div>
            <div class="arrow">&rarr;</div>
            <div><div class="mono">${c().now}</div><div class="bignum">${h.now}%</div></div>
            <div class="respname">${RESPONSES[h.response]?RESPONSES[h.response][L]:''}</div>
          </div>
          <p class="body ink" style="margin-top:12px">${c().triggerSame}<br><strong>${c().responseChanged}</strong></p>
          <button class="savecard" onclick="saveChangeCard('${ch.signal}')">${c().saveCard}</button>`;
      } else {
        out += `<div class="body">${Object.entries(ch.now).map(([k,v])=>
          `${RESPONSES[k]?RESPONSES[k][L]:k} ${v}%`).join(' · ')}</div>`;
      }
      if(ch.intensity && ch.intensity.softer){
        out += `<div class="intbar">
          <div class="intside"><div class="mono">${c().intThen}</div>${intDots(ch.intensity.then)}</div>
          <div class="arrow">&rarr;</div>
          <div class="intside"><div class="mono">${c().intNow}</div>${intDots(ch.intensity.now)}</div>
        </div>
        <p class="body ink">${c().sameOften}<br><strong>${c().softerNow}</strong></p>`;
      }
      out += `</div>`;
    });
  }
  return out+'</div>';
}

function intDots(v){
  return `<div class="intdots">${[1,2,3].map(i=>
    `<i class="${v>=i-0.25?'on':''}"></i>`).join('')}</div>`;
}

/* ---------- Then → Now, developed into a keepsake photo ----------
   A memento, not a boast: it carries the shape of the change, never the words
   behind it — which is exactly why it is safe to share. */
function saveChangeCard(signal){
  const ch = KYP.change(D.moments, signal);
  if(!ch || !ch.headline) return;
  const s = sig(signal), h = ch.headline;
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350;
  const x = cv.getContext('2d'); if(!x) return;
  const W = cv.width, H = cv.height, cx = W/2;
  const css = getComputedStyle(document.documentElement);
  const k = (n,f) => (css.getPropertyValue(n).trim() || f);
  const bg=k('--bg','#0B0913'), ink=k('--ink','#F3F0FF'), ink2=k('--ink2','#ABA0CC'),
        ink3=k('--ink3','#8A80AC'), accent=k('--accent','#9B6BFF'),
        soft=k('--accent-soft','rgba(155,107,255,.16)'), line=k('--line2','rgba(243,240,255,.16)');
  const SERIF='"Newsreader","Noto Serif SC",Georgia,serif';
  const SANS='"Plus Jakarta Sans","Noto Sans SC",system-ui,sans-serif';
  const T = (str,px,py,w,sz,fam,col,al) => { x.font=w+' '+sz+'px '+fam; x.fillStyle=col;
    x.textAlign=al||'left'; x.textBaseline='alphabetic'; x.fillText(str,px,py); };

  x.fillStyle=bg; x.fillRect(0,0,W,H);
  const g=x.createRadialGradient(cx,H*0.16,0,cx,H*0.16,W*0.95);
  g.addColorStop(0,soft); g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  x.strokeStyle=line; x.lineWidth=2; rr(x,44,44,W-88,H-88,40); x.stroke();

  try{ x.letterSpacing='8px'; }catch(e){}
  T('PATTERNA',96,152,'700',30,SANS,accent,'left');
  try{ x.letterSpacing='0px'; }catch(e){}
  T(s.n,96,268,'500',78,SERIF,ink,'left');

  T(c().then,cx-230,500,'600',30,SANS,ink3,'center');
  T(c().now, cx+230,500,'600',30,SANS,ink3,'center');
  T(h.then+'%',cx-230,632,'500',104,SERIF,ink2,'center');
  T(h.now+'%', cx+230,632,'500',104,SERIF,accent,'center');
  T('→',cx,604,'400',60,SERIF,ink3,'center');
  const resp = RESPONSES[h.response] ? RESPONSES[h.response][L] : '';
  if(resp) T(resp,cx,724,'600',34,SANS,ink2,'center');

  T(c().triggerSame,cx,918,'500',46,SERIF,ink2,'center');
  T(c().responseChanged,cx,992,'600',54,SERIF,accent,'center');

  let foot = c().overDays(ch.n,ch.spanDays);
  if(ch.intensity && ch.intensity.softer) foot += ' · ' + c().softerNow;
  T(foot,cx,H-116,'600',28,SANS,ink3,'center');

  cv.toBlob(b => { if(b) shareCard(b,'patterna-'+signal+'.png'); }, 'image/png');
}
function rr(x,px,py,w,h,r){ x.beginPath(); x.moveTo(px+r,py);
  x.arcTo(px+w,py,px+w,py+h,r); x.arcTo(px+w,py+h,px,py+h,r);
  x.arcTo(px,py+h,px,py,r); x.arcTo(px,py,px+w,py,r); x.closePath(); }
function shareCard(blob,name){
  try{
    const file = new File([blob],name,{type:'image/png'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      navigator.share({files:[file]}).catch(()=>{}); return;
    }
  }catch(e){}
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function viewGaps(){
  const r = KYP.offListReport(D.moments);
  const verdictLine = {fits:c().gapsFits, gaps:c().gapsGaps, wrong:c().gapsWrong}[r.verdict] || '';
  let out = `<div class="pad">
    <button class="more" style="text-align:left;padding-left:0" onclick="go('me')">← ${c().me}</button>
    <div class="eyebrow">${c().gapsTitle}</div>`;
  if(!r.list.length && r.verdict === 'none'){
    return out + `<p class="body">${c().gapsNone}</p></div>`;
  }
  out += `<h1 class="lede sm">${verdictLine}</h1>
    <p class="body">${c().gapsRate(r.rate.signal.off, r.rate.signal.total, r.signalOffPct)}</p>`;
  if(!r.list.length){
    return out + `<p class="note">${c().gapsHint}</p></div>`;
  }
  out += r.list.map(x=>`
    <div class="evline">
      <div class="d">${c().gapsField[x.field]} · ${c().gapsTimes(x.n)} · ${fmtDate(x.last)}</div>
      <div class="t">${esc(x.text)}</div>
    </div>`).join('');
  return out + `<p class="note" style="margin-top:18px">${c().gapsHint}</p></div>`;
}

/* ---------- me ---------- */
function viewMe(){
  return `<div class="pad">
    <div class="logomark sm"></div>
    <div class="brand sm">${c().brand}</div>
    <div class="brandline sm">${c().brandLine}</div>
    <div class="rule"></div>
    <div class="eyebrow">${c().aboutT}</div>
    <p class="body">${c().aboutB}</p>
    <div class="rule"></div>
    <div class="eyebrow mb">${c().lang}</div>
    <div class="seg">
      <button class="${L==='zh'?'on':''}" onclick="setLang('zh')">中文</button>
      <button class="${L==='en'?'on':''}" onclick="setLang('en')">English</button>
    </div>
    <div class="rule"></div>
    <button class="btn" onclick="go('gaps')">${c().seeGaps}</button>
    <button class="btn" onclick="startOnboard()">${c().obAgain}</button>
    <div class="rule"></div>
    <div class="eyebrow mb">${c().yourData}</div>
    <button class="btn" onclick="doExport()">${c().exportB}</button>
    <button class="btn" onclick="openImport()">${c().importB}</button>
    <button class="btn" onclick="loadDemo()">${c().demoLoad}</button>
    <button class="btn danger" onclick="doClear()">${c().clearB}</button>
    <p class="note">${D.moments.length} · ${Store.persistent?'localStorage':'memory only'}</p>
  </div>`;
}

/* =====================================================================
   CAPTURE FLOW
   ===================================================================== */
function startFlow(){
  showAllSignals = false;
  flow = {step:0, started:Date.now(), m:{id:uid(), ts:Date.now(), text:'', reaction:'', signal:'', protecting:'', intensity:'', response:'', note:'', other:{}},
          queue:[], qi:0, checkPred:null};
  $('overlay').classList.add('on');
  renderFlow();
}
function closeFlow(){ flow=null; $('overlay').classList.remove('on'); render(); }


/* Order the options by what they wrote. Wording never changes — only sequence.
   A miss costs nothing: the rest of the list is one tap away. */
function rankSignals(text){
  const t = (text||'').toLowerCase();
  const scored = SIGNAL_KEYS.map((k,i)=>{
    let hits = 0;
    (KEYWORDS[k]||[]).forEach(w=>{ if(w && t.includes(String(w).toLowerCase())) hits++; });
    return {k, hits, i};
  });
  const any = scored.some(s=>s.hits>0);
  scored.sort((a,b)=> b.hits-a.hits || a.i-b.i);
  return {order:scored.map(s=>s.k), guessed:any};
}
let showAllSignals = false;
function toggleSignals(){ showAllSignals = !showAllSignals; renderFlow(); }

/* short words wrap; long sentences take a row each */
function optionLayout(){ return 'stack'; }

const STEPS = ['what','reaction','signal','intensity','response'];

function renderFlow(){
  const f = flow; if(!f) return;
  const box = $('flowbox');
  if(f.finishing){ box.innerHTML = letgoView(); box.scrollTop = 0; return; }
  if(f.step < STEPS.length){ box.innerHTML = stepView(STEPS[f.step]); }
  else { box.innerHTML = revealView(); }
  box.scrollTop = 0;
  micUp(); micReady();
}

function stepView(k){
  const m = flow.m;
  const prog = `<div class="prog">${STEPS.map((_,i)=>`<i class="${i<=flow.step?'on':''}"></i>`).join('')}</div>`;
  const head = (h,b='') => prog + `<h1 class="lede sm">${h}</h1>${b?`<p class="body">${b}</p>`:''}`;
  const other = field => m[field]==='other' ? `
    <textarea id="fOther_${field}" rows="2" placeholder="${c().otherPh}"
      oninput="setOther('${field}',this.value)">${esc((m.other||{})[field]||'')}</textarea>
    <button class="cta" onclick="stepNext()">${c().next}</button>` : '';
  const opts = (obj,field) => {
    const entries = Object.entries(obj);
    const mode = optionLayout(entries.map(([,v])=>v[L]||v));
    const inner = entries.map(([key,v])=>
      `<button class="pill ${mode} ${m[field]===key?'sel':''}" onclick="pick('${field}','${key}')">${v[L]||v}</button>`).join('');
    return (mode==='wrap' ? `<div class="wrap">${inner}</div>` : inner) + other(field);
  };

  if(k==='what') return head(c().whatHappened, c().oneSentence) +
    `<textarea id="fWhat" rows="4" placeholder="${c().whatPh}" oninput="setText(this.value)">${esc(m.text)}</textarea>
     <button id="micBtn" class="mic hidden" onpointerdown="micDown(event)" onpointerup="micUp()" onpointercancel="micUp()" onpointerleave="micUp()">
       <span class="dot"></span><span id="micLabel">${c().holdTalk}</span></button>
     <div class="grow"></div>
     <button class="cta" id="fNext" ${m.text.trim().length<2?'disabled':''} onclick="stepNext()">${c().next}</button>
     <button class="cta ghost" onclick="closeFlow()">${c().cancel}</button>`;

  if(k==='reaction') return head(c().firstReaction) + opts(REACTIONS,'reaction') + backOnly();
  if(k==='signal'){
    const r = rankSignals(m.text);
    const showN = (r.guessed && !showAllSignals) ? 3 : SIGNAL_KEYS.length;
    const shown = r.order.slice(0, showN);
    const rest  = r.order.length - showN;
    const cell = key => `<button class="pill stack ${m.signal===key?'sel':''}" onclick="pick('signal','${key}')">${SIGNALS[key][L].s}</button>`;
    return head(c().whatGot, c().closest) +
      shown.map(cell).join('') +
      (rest > 0
        ? `<button class="more" onclick="toggleSignals()">${c().moreOptions} · ${rest}</button>`
        : (r.guessed ? `<button class="more" onclick="toggleSignals()">${c().fewerOptions}</button>` : '')) +
      `<button class="pill stack ${m.signal==='other'?'sel':''}" onclick="pick('signal','other')">${REACTIONS.other[L]}</button>` +
      other('signal') + backOnly();
  }

  if(k==='intensity') return head(c().intensityH) + opts(INTENSITY,'intensity') + backOnly();
  if(k==='response') return head(c().whatDid) + opts(RESPONSES,'response') + backOnly();
}
function backOnly(){ return `<div class="grow"></div><button class="cta ghost" onclick="stepBack()">${c().back}</button>`; }

function pick(field,key){
  flow.m[field]=key;
  renderFlow();
  if(key==='other'){ setTimeout(()=>{const t=$('fOther_'+field); if(t) t.focus();},60); return; }
  setTimeout(stepNext,140);
}
function stepBack(){ if(flow.step>0){flow.step--; renderFlow();} }
function stepNext(){
  flow.step++;
  if(flow.step === STEPS.length) commit();
  renderFlow();
}

/* ---------- commit: save, then build the reveal queue ---------- */
function commit(){
  const f = flow, m = f.m;
  m.ts = Date.now();
  m.secs = Math.max(8, Math.round((Date.now()-f.started)/1000));
  if(m.intensity && INTENSITY[m.intensity]) m.iv = INTENSITY[m.intensity].v;
  D.moments.push(m);

  const q = ['mirror'];

  // a guess waiting to be checked comes before anything new
  const cp = KYP.checkablePrediction(D.predictions, m);
  if(cp){ f.checkPred = cp; q.push('predcheck'); }

  D.seen = D.seen || {glimpse:{}, pattern:{}};
  const g = KYP.glimpse(D.moments);
  const p = KYP.pattern(D.moments);

  if(p && D.seen.pattern[p.signal] !== p.confidence){
    q.push('pattern'); D.seen.pattern[p.signal] = p.confidence;
  } else if(g && (D.seen.glimpse[g.signal]||0) < g.hits){
    q.push('glimpse');
    D.seen.glimpse[g.signal] = g.hits;
    if(!D.predictions.some(x=>x.status==='open' && x.signal===g.signal)){
      D.predictions.push(KYP.makePrediction(D.moments, g.signal));
      q.push('prediction');
    }
  } else {
    const conn = KYP.connection(D.moments, m);
    if(conn) q.push('connection');
  }

  f.queue = q; f.qi = 0;
  persist();
}

function revealView(){
  const f = flow, m = f.m, k = f.queue[f.qi];
  const s = sig(m.signal);
  const last = f.qi >= f.queue.length-1;
  const nextBtn = t => `<div class="grow"></div><button class="cta" onclick="${last?'finishFlow()':'qNext()'}">${t}</button>`;

  if(k==='mirror'){
    return `<div class="eyebrow">${c().seconds(m.secs)}</div>
      <h1 class="lede sm">${c().mirrorH}</h1>
      <p class="body">${c().mirrorB}</p>
      <div class="chose">
        <div class="lab">${c().youChose}</div>
        <div class="quote">「${m.signal==='other'? esc((m.other||{}).signal||'') : s.s}」</div>
        <div class="lab">${c().andAlso}</div>
        <div class="quote">「${m.intensity?INTENSITY[m.intensity][L]:''}」</div>
      </div>
      <div class="saidcard"><div class="who">${c().speaker}</div>
        <p>${c().mirrorPromise(m.signal==='other' ? (m.otherText||'') : s.n)}</p></div>
      ${nextBtn(c().done)}`;
  }

  if(k==='predcheck'){
    const ps = sig(f.checkPred.signal);
    return `<div class="eyebrow">${c().ourGuess}</div>
      <h1 class="lede sm">${c().rememberGuess}</h1>
      <div class="saidcard"><div class="who">${c().speaker}</div><p>${ps.p}</p></div>
      <p class="body">${c().wasItTrue}</p>
      <button class="btn" onclick="closePred('yes')">${c().yes}</button>
      <button class="btn" onclick="closePred('kind of')">${c().kindOf}</button>
      <button class="btn" onclick="closePred('no')">${c().no}</button>
      <div class="grow"></div>`;
  }

  if(k==='predresult'){
    return `<div class="eyebrow">${c().ourGuess}</div>
      <h1 class="lede sm">${f.predResult==='no' ? c().adjusted : c().noted}</h1>
      ${nextBtn(c().done)}`;
  }

  if(k==='connection'){
    const conn = KYP.connection(D.moments, m);
    return `<div class="eyebrow">${c().connH}</div>
      <div class="saidcard"><div class="who">${c().speaker}</div>
        <p><span class="hl on">${s.g}</span></p></div>
      <p class="body">${c().connB((conn?conn.priorCount:1)+1)}</p>
      ${D.moments.filter(x=>x.signal===m.signal).slice(-2).reverse().map(x=>`
        <div class="evline"><div class="d">${fmtDate(x.ts)}</div><div class="t">${esc(x.text)}</div></div>`).join('')}
      ${nextBtn(c().done)}`;
  }

  if(k==='glimpse'){
    const g = KYP.glimpse(D.moments) || {hits:0,of:0,signal:m.signal};
    const gs = sig(g.signal);
    return `<h1 class="lede sm">${c().glimpseH}</h1>
      <p class="body">${c().glimpseB(g.hits,g.of)}</p>
      <div class="saidcard"><div class="who">${c().speaker}</div>
        <p><span class="hl on">${gs.g}</span></p></div>
      <p class="note">${c().tooEarly}</p>
      <div class="rule"></div>
      <div class="eyebrow">${c().yourRead}</div>
      <textarea id="fNote" rows="3" placeholder="${c().yourReadPh}" oninput="setNote(this.value)"></textarea>
      <div class="grow"></div>
      <button class="cta" onclick="saveNote()">${c().keepWatching}</button>
      <button class="cta ghost" onclick="${last?'finishFlow()':'qNext()'}">${c().skip}</button>`;
  }

  if(k==='prediction'){
    const op = D.predictions.filter(x=>x.status==='open').slice(-1)[0];
    const os = sig(op ? op.signal : m.signal);
    return `<div class="eyebrow">${c().ourGuess}</div>
      <div class="saidcard"><div class="who">${c().ourGuess}</div><p>${os.p}</p></div>
      <p class="note">${c().seeIfRight}</p>
      ${nextBtn(c().wellSee)}`;
  }

  if(k==='pattern'){
    const p = KYP.pattern(D.moments);
    const ps = sig(p.signal);
    return `<div class="eyebrow">${c().possiblePattern}</div>
      <div class="saidcard"><div class="who">${c().speaker}</div>${patternSentence(ps)}</div>
      <div class="meterrow"><span class="nm">${c().confidence}</span>
        <div class="meter"><i style="width:${p.confidence*20}%"></i></div><span class="ct">${p.confidence} / 5</span></div>
      <p class="note">${c().basedOn(p.hits,p.total)}</p>
      <div class="rule"></div>
      <div class="eyebrow mb">${c().feelTrue}</div>
      <button class="btn" onclick="confirmPattern('yes')">${c().thatsMe}</button>
      <button class="btn" onclick="confirmPattern('maybe')">${c().maybe}</button>
      <button class="btn" onclick="confirmPattern('no')">${c().notReally}</button>
      <div class="grow"></div>`;
  }
  return nextBtn(c().done);
}

/* ---------- the letting-go beat: an immediate exhale, before the moment is filed ---------- */
function finishFlow(){
  if(!flow) return;
  flow.finishing = true;
  D.seen = D.seen || {glimpse:{}, pattern:{}};
  D.seen.letgo = (D.seen.letgo || 0) + 1;   // the ritual decays after the first few
  const pool = c().letgoLines, n = pool.length;   // rotate the closing line, never the same twice running
  let i = Math.floor(Math.random()*n);
  if(n > 1 && i === D.seen.letgoLast) i = (i+1) % n;
  D.seen.letgoLast = i; flow.letgoIdx = i;
  persist();
  renderFlow();
}
function letgoView(){
  const m = flow.m, s = sig(m.signal);
  const full = (D.seen.letgo || 0) <= 3;
  const label = m.signal==='other' ? esc((m.other||{}).signal||'') : (s ? s.s : '');
  const pool = c().letgoLines;
  const line = pool[(flow.letgoIdx || 0) % pool.length];
  return `<div class="letgo${full?'':' compressed'}">
    <div class="lgcard">
      <div class="lgtext">${esc(m.text)}</div>
      ${label ? `<div class="lgsig">「${label}」</div>` : ''}
    </div>
    ${full ? `<div class="lgbreath"><i></i></div>` : ''}
    <p class="lgline">${line}</p>
    <div class="grow"></div>
    <button class="cta ghost" onclick="closeFlow()">${c().letgoDone}</button>
  </div>`;
}

function qNext(){ flow.qi++; if(flow.qi>=flow.queue.length) finishFlow(); else renderFlow(); }
function saveNote(){ const v=$('fNote').value.trim(); flow.m.note=v; persist();
  if(flow.qi>=flow.queue.length-1) finishFlow(); else qNext(); }
function closePred(result){
  const p = flow.checkPred;
  p.status='closed'; p.result=result; p.closedTs=Date.now();
  flow.predResult=result;
  flow.queue.splice(flow.qi+1,0,'predresult');
  persist(); qNext();
}
function confirmPattern(v){
  flow.m.confirm = v;
  persist();
  if(flow.qi>=flow.queue.length-1) finishFlow(); else qNext();
}

/* =====================================================================
   DATA
   ===================================================================== */
function doExport(){
  const payload = { ...D, _offList: KYP.offListReport(D.moments) };
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'know-your-pattern-'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(a.href);
}
function doImport(file){
  const r = new FileReader();
  r.onload = () => { try{
    const j = JSON.parse(r.result);
    if(!j.moments) throw 0;
    D = j; L = D.lang||L; persist(); render();
  }catch(e){ alert('Not a valid backup file.'); } };
  r.readAsText(file);
}
function doClear(){ if(confirm(c().clearConfirm)){ D = Store.reset(); L=D.lang; render(); } }

function loadDemo(){
  if(D.moments.length && !confirm(c().demoWarn)) return;
  D = Store.reset(); D.lang = L;
  const DAY = 86400000, now = Date.now();
  const texts = {
    zh:{autonomy:['领导没问我就加了任务','朋友临时改了约的时间','有人替我答应了周末','排期被调整没人先说','会议时间被直接改掉'],
        heard:['我的提议在会上被跳过','说了两次还是没人接','群里的问题没人回'],
        capacity:['手上还没做完又来一件','这周第三次加需求']},
    en:{autonomy:['A task was added without asking me','A friend moved our plan last minute','Someone said yes for me','The schedule shifted, nobody told me','My meeting got moved without a word'],
        heard:['My suggestion got skipped in the meeting','Said it twice, nobody picked it up','My question in the group went unanswered'],
        capacity:['Another thing arrived before I finished','Third scope change this week']}
  }[L];
  const add = (daysAgo, signal, response, i, intensity) => D.moments.push({
    id:uid(), ts: now - daysAgo*DAY, text: texts[signal][i % texts[signal].length],
    reaction:'irritated', signal, intensity, iv: INTENSITY[intensity].v, response, secs:38, note:''
  });
  // autonomy: reacting early on, pausing lately -> a real Then→Now
  [88,81,74,66,59].forEach((d,i)=>add(d,'autonomy','react_now',i,'strong'));
  [45,38].forEach((d,i)=>add(d,'autonomy','held_in',i,'medium'));
  [24,15,6,2].forEach((d,i)=>add(d,'autonomy','paused',i,'light'));
  [70,40,12].forEach((d,i)=>add(d,'heard','held_in',i,'medium'));
  [55,20].forEach((d,i)=>add(d,'capacity','complied',i,'medium'));
  D.moments.sort((a,b)=>a.ts-b.ts);
  D.moments[9].note = L==='zh' ? '我可能不是怕事情多，是讨厌别人替我决定。'
                               : "I don't think I mind the work. I mind not being asked.";
  D.predictions = [{id:'p1',signal:'autonomy',createdTs:now-50*DAY,status:'closed',result:'yes'},
                   {id:'p2',signal:'autonomy',createdTs:now-30*DAY,status:'closed',result:'kind of'},
                   {id:'p3',signal:'heard',   createdTs:now-25*DAY,status:'closed',result:'no'}];
  D.seen = {glimpse:{},pattern:{}};
  persist(); go('changes');
}

/* =====================================================================
   ONBOARDING — the contract, before anything is recorded
   ===================================================================== */
let ob = 0;
function startOnboard(){ ob = 0; $('onboard').classList.add('on'); renderOb(); }
function obNext(){ ob++; if(ob > 3) finishOb(); else renderOb(); }
function finishOb(){ D.onboarded = true; persist(); $('onboard').classList.remove('on'); render(); }
function obLang(l){ L = l; persist(); renderOb(); }

function renderOb(){
  const box = $('obbox');
  if(ob === 0){
    box.innerHTML = `<div class="grow"></div>
      <div class="logomark"></div>
      <div class="brand">${c().brand}</div>
      <div class="brandline">${c().brandLine.replace('\n','<br>')}</div>
      <p class="body" style="margin-top:20px">${c().ob1B}</p>
      <div class="grow"></div>
      <div class="eyebrow">${c().obLang}</div>
      <div class="seg" style="margin-bottom:10px">
        <button class="${L==='zh'?'on':''}" onclick="obLang('zh')">中文</button>
        <button class="${L==='en'?'on':''}" onclick="obLang('en')">English</button>
      </div>
      <button class="btn" onclick="obLang(followSystem())">${c().followSystem}</button>
      <p class="note">${c().privacyLine}</p>
      <button class="cta" onclick="obNext()">${c().obStart}</button>`;
  } else if(ob === 1){
    box.innerHTML = `<div class="eyebrow">${c().ob2E}</div><div class="grow"></div>
      <h1 class="lede">${c().ob2H}</h1><p class="body">${c().ob2B}</p>
      <div class="grow"></div><div class="obdots">${[0,1,2].map(i=>`<i class="${i===0?'on':''}"></i>`).join('')}</div>
      <button class="cta" onclick="obNext()">${c().obNext}</button>`;
  } else if(ob === 2){
    box.innerHTML = `<div class="eyebrow">${c().ob3E}</div><div class="grow"></div>
      <h1 class="lede">${c().ob3H}</h1><p class="body">${c().ob3B}</p>
      <div class="grow"></div><div class="obdots">${[0,1,2].map(i=>`<i class="${i===1?'on':''}"></i>`).join('')}</div>
      <button class="cta" onclick="obNext()">${c().obNext}</button>`;
  } else {
    box.innerHTML = `<div class="eyebrow">${c().aboutT}</div><div class="grow"></div>
      <h1 class="lede sm">${c().somethingHappened}</h1><p class="body">${c().aboutB}</p>
      <div class="grow"></div><div class="obdots">${[0,1,2].map(i=>`<i class="${i===2?'on':''}"></i>`).join('')}</div>
      <button class="cta" onclick="finishOb()">${c().catchOne}</button>`;
  }
}

/* ---------- handler shims: inline attributes only see function declarations ---------- */
function setText(v){ if(flow){ flow.m.text=v; const b=$('fNext'); if(b) b.disabled = v.trim().length<2; } }
function setNote(v){ if(flow) flow.m.note=v; }
function setOther(field,v){ if(flow){ flow.m.other = flow.m.other||{}; flow.m.other[field]=v; } }
function openImport(){ $('importFile').click(); }
function followSystem(){ return (navigator.language||'en').toLowerCase().startsWith('zh') ? 'zh' : 'en'; }


/* ---------- voice capture ---------- */
const SR = typeof window!=='undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
let rec = null, recBase = '';
function micReady(){
  const b = $('micBtn'); if(!b) return;
  if(SR) b.classList.remove('hidden');
}
function micDown(e){
  if(e && e.preventDefault) e.preventDefault();
  if(!SR || rec) return;
  try{
    rec = new SR();
    rec.lang = L==='zh' ? 'zh-CN' : 'en-US';
    rec.continuous = true; rec.interimResults = true;
    recBase = ($('fWhat').value || '').trim();
    rec.onresult = ev => {
      let s='';
      for(let i=0;i<ev.results.length;i++) s += ev.results[i][0].transcript;
      const v = (recBase ? recBase+' ' : '') + s;
      const ta = $('fWhat'); if(ta){ ta.value = v; setText(v); }
    };
    rec.onerror = () => micUp();
    rec.onend = () => { rec = null; const l=$('micLabel'); if(l) l.textContent = c().holdTalk;
      const b=$('micBtn'); if(b) b.classList.remove('rec'); };
    rec.start();
    $('micLabel').textContent = c().listening;
    $('micBtn').classList.add('rec');
  }catch(err){ rec = null; }
}
function micUp(){ if(rec){ try{ rec.stop(); }catch(e){} rec = null; }
  const l=$('micLabel'); if(l) l.textContent = c().holdTalk;
  const b=$('micBtn'); if(b) b.classList.remove('rec'); }

/* ---------- boot ---------- */
render();
if(!D.onboarded) startOnboard();
if(typeof window!=='undefined'){
  Object.defineProperty(window,'__kyp',{value:{
    get D(){return D}, set D(v){D=v}, get L(){return L}, get flow(){return flow}, KYP, Store
  }});
}
