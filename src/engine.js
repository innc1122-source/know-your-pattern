/* =====================================================================
   KYP ENGINE — pure functions, no DOM. Portable to Python later.
   A moment: {id, ts, text, reaction, signal, protecting, response, note}
   ===================================================================== */

const KYP = (() => {

  const DAY = 86400000;
  const dayKey = ts => new Date(ts).toISOString().slice(0,10);
  const weekKey = ts => { const d=new Date(ts); const o=new Date(d); o.setDate(d.getDate()-((d.getDay()+6)%7)); return o.toISOString().slice(0,10); };

  /* ---- thresholds: the only numbers worth tuning after real data ---- */
  const TH = {
    connectMin:   2,   // 2nd time a signal appears -> connection
    glimpseCount: 3,   // occurrences needed for a glimpse
    glimpseDays:  2,   // across at least this many distinct days
    glimpseWindow:8,   // looking at the last N moments
    patternCount: 5,   // occurrences needed to call it a pattern
    patternWeeks: 3,   // spread across this many distinct weeks
    patternShare: 0.30,// must be at least this share of all signals
    patternLead:  1.5, // and must lead the runner-up by this factor
    changeMin:    6,   // moments on one signal before comparing responses
    changeSpanDays:21, // and this much elapsed time
  };

  /* ---------- helpers ---------- */
  const bySignal = (ms, s) => ms.filter(m => m.signal === s);
  const distinct = arr => [...new Set(arr)];

  function counts(ms){
    const c = {};
    ms.forEach(m => { if(m.signal && m.signal !== 'other') c[m.signal] = (c[m.signal]||0)+1; });
    return c;
  }

  function ranked(ms){
    const c = counts(ms);
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([signal,n])=>({signal,n}));
  }

  /* ---------- 1. connection: has this signal been here before? ---------- */
  function connection(ms, current){
    if(!current.signal) return null;
    const prior = ms.filter(m => m.id !== current.id && m.signal === current.signal);
    if(prior.length < TH.connectMin - 1) return null;
    const last = prior[prior.length-1];
    return { signal: current.signal, priorCount: prior.length, withMoment: last };
  }

  /* ---------- 2. glimpse: a signal starting to show, not a conclusion ---------- */
  function glimpse(ms){
    const recent = ms.slice(-TH.glimpseWindow);
    const r = ranked(recent);
    if(!r.length) return null;
    const top = r[0];
    if(top.n < TH.glimpseCount) return null;
    const days = distinct(bySignal(recent, top.signal).map(m=>dayKey(m.ts)));
    if(days.length < TH.glimpseDays) return null;
    // already a full pattern? then glimpse is redundant
    if(pattern(ms)) return null;
    return { signal: top.signal, hits: top.n, of: recent.length, days: days.length };
  }

  /* ---------- 3. prediction: the product puts itself on the line ---------- */
  function makePrediction(ms, signal){
    return { id:'p'+Date.now(), signal, createdTs:Date.now(), status:'open', result:null };
  }
  // a prediction becomes checkable when a new moment carries the same signal
  function checkablePrediction(preds, moment){
    return preds.find(p => p.status==='open' && p.signal===moment.signal && moment.ts > p.createdTs) || null;
  }
  function predictionScore(preds){
    const done = preds.filter(p=>p.status==='closed');
    if(!done.length) return null;
    const hit = done.filter(p=>p.result==='yes').length;
    const part = done.filter(p=>p.result==='kind of').length;
    return { total:done.length, hit, part, miss:done.length-hit-part };
  }

  /* ---------- 4. pattern: earned, with a confidence that can go down ---------- */
  function pattern(ms){
    const r = ranked(ms);
    if(!r.length) return null;
    const top = r[0];
    const total = ms.filter(m=>m.signal && m.signal!=='other').length;
    if(top.n < TH.patternCount) return null;
    if(total && top.n/total < TH.patternShare) return null;
    // two signals neck and neck is not one pattern, it's two things
    if(r[1] && top.n < r[1].n * TH.patternLead) return null;
    const rows = bySignal(ms, top.signal);
    const weeks = distinct(rows.map(m=>weekKey(m.ts)));
    if(weeks.length < TH.patternWeeks) return null;

    // confidence 1-5: volume + spread + user confirmation, minus rejections
    let conf = 1;
    if(top.n >= TH.patternCount) conf++;
    if(weeks.length >= 4) conf++;
    if(total && top.n/total >= 0.45) conf++;
    const confirmed = rows.filter(m=>m.confirm==='yes').length;
    const rejected  = rows.filter(m=>m.confirm==='no').length;
    if(confirmed >= 2) conf++;
    if(rejected  >= 2) conf--;
    conf = Math.max(1, Math.min(5, conf));

    const runner = r[1] ? r[1].signal : null;
    return { signal: top.signal, hits: top.n, total, weeks: weeks.length, confidence: conf, alternative: runner };
  }

  /* ---------- 5. change: same trigger, different response ---------- */
  function change(ms, signal){
    const rows = bySignal(ms, signal).filter(m=>m.response);
    if(rows.length < TH.changeMin) return null;
    const span = rows[rows.length-1].ts - rows[0].ts;
    if(span < TH.changeSpanDays*DAY) return null;
    const half = Math.floor(rows.length/2);
    const dist = set => {
      const c={}; set.forEach(m=>c[m.response]=(c[m.response]||0)+1);
      const n=set.length; const out={};
      Object.entries(c).forEach(([k,v])=>out[k]=Math.round(v/n*100));
      return out;
    };
    const then = dist(rows.slice(0,half)), now = dist(rows.slice(half));
    const keys = distinct([...Object.keys(then),...Object.keys(now)]);
    const moves = keys.map(k=>({response:k, then:then[k]||0, now:now[k]||0, delta:(now[k]||0)-(then[k]||0)}))
                      .sort((a,b)=> Math.abs(b.delta)-Math.abs(a.delta) || b.delta-a.delta);

    // intensity: same trigger, does it still hit as hard?
    const iv = set => { const v = set.map(m=>m.iv).filter(n=>typeof n==='number');
                        return v.length ? v.reduce((s,n)=>s+n,0)/v.length : null; };
    const withI = bySignal(ms, signal).filter(m=>typeof m.iv==='number');
    let intensity = null;
    if(withI.length >= TH.changeMin){
      const h = Math.floor(withI.length/2);
      const a2 = iv(withI.slice(0,h)), b2 = iv(withI.slice(h));
      if(a2 !== null && b2 !== null)
        intensity = { then:Math.round(a2*10)/10, now:Math.round(b2*10)/10,
                      delta:Math.round((b2-a2)*10)/10, softer:(a2-b2) >= 0.4 };
    }

    return { signal, n:rows.length, spanDays:Math.round(span/DAY), then, now, moves, intensity,
             headline: moves[0] && Math.abs(moves[0].delta)>=12 ? moves[0] : null };
  }

  function changesAll(ms){
    return distinct(ms.map(m=>m.signal).filter(Boolean))
      .map(s=>change(ms,s)).filter(Boolean).sort((a,b)=>b.n-a.n);
  }

  /* precisely what is still missing before a comparison is honest */
  function unlockProgress(ms){
    const r = ranked(ms);
    if(!r.length) return {signal:null, needCount:TH.changeMin, needDays:TH.changeSpanDays};
    const top = r[0];
    const rows = bySignal(ms, top.signal);
    const span = rows.length ? (rows[rows.length-1].ts - rows[0].ts)/DAY : 0;
    return {
      signal: top.signal,
      have: top.n,
      needCount: Math.max(0, TH.changeMin - top.n),
      needDays: Math.max(0, Math.ceil(TH.changeSpanDays - span))
    };
  }

  /* the current picture — honest from 3 moments, because it claims no trend */
  function snapshotNow(ms, signal){
    const rows = bySignal(ms, signal).filter(m=>m.response);
    if(rows.length < 3) return null;
    const c = {}; rows.forEach(m=>c[m.response]=(c[m.response]||0)+1);
    const mix = Object.entries(c).map(([response,n])=>({response, pct:Math.round(n/rows.length*100)}))
                      .sort((a,b)=>b.pct-a.pct);
    return { signal, n:rows.length, mix };
  }

  /* ---------- vocabulary gaps: what the closed list failed to catch ----------
     The escape hatch is where the word list tells you it is wrong. These entries
     never feed pattern detection — they are evidence for revising the list. */
  function offListReport(ms){
    const fields = ['reaction','signal','response'];
    const rate = {}, words = {};
    fields.forEach(f=>{
      const answered = ms.filter(m => m[f]);
      const off = answered.filter(m => m[f] === 'other');
      rate[f] = { total: answered.length, off: off.length,
                  pct: answered.length ? Math.round(off.length/answered.length*100) : 0 };
    });
    ms.forEach(m=>{
      const o = m.other || {};
      fields.forEach(f=>{
        const raw = (o[f]||'').trim();
        if(!raw) return;
        const key = raw.toLowerCase();
        if(!words[key]) words[key] = { text: raw, field: f, n: 0, first: m.ts, last: m.ts };
        words[key].n++;
        words[key].first = Math.min(words[key].first, m.ts);
        words[key].last  = Math.max(words[key].last,  m.ts);
      });
    });
    const list = Object.values(words).sort((a,b)=> b.n-a.n || b.last-a.last);
    const answered = ms.filter(m=>m.signal).length;
    const offSignal = ms.filter(m=>m.signal==='other').length;
    const pct = answered ? Math.round(offSignal/answered*100) : 0;
    // the verdict the word list is being judged on
    const verdict = !answered ? 'none' : pct < 10 ? 'fits' : pct <= 30 ? 'gaps' : 'wrong';
    return { rate, list, signalOffPct: pct, verdict };
  }
  function weekOf(ms, endTs){
    const end = endTs || Date.now(), start = end - 7*DAY;
    return ms.filter(m => m.ts > start && m.ts <= end);
  }
  function weeklySnapshot(ms, endTs){
    if(!ms.length) return null;
    const end = endTs || Date.now();
    if(end - ms[0].ts < 7*DAY) return null;      // needs a week of history
    const rows = weekOf(ms, end);
    if(rows.length < 2) return null;             // a quiet week gets no card, and no nagging
    const sc = counts(rows);
    const top = Object.entries(sc).sort((a,b)=>b[1]-a[1])[0] || null;
    const rc = {}; rows.forEach(m=>{ if(m.reaction) rc[m.reaction]=(rc[m.reaction]||0)+1; });
    const topReaction = Object.entries(rc).sort((a,b)=>b[1]-a[1])[0] || null;
    const wrote = rows.filter(m=>m.note && m.note.trim().length>4).slice(-1)[0] || null;
    return { n:rows.length, weekKey: weekKey(end),
             topSignal: top ? top[0] : null, topSignalN: top ? top[1] : 0,
             topReaction: topReaction ? topReaction[0] : null,
             wrote: wrote ? wrote.note : null };
  }

  return { TH, counts, ranked, connection, glimpse, pattern, change, changesAll,
           makePrediction, checkablePrediction, predictionScore,
           unlockProgress, snapshotNow, weeklySnapshot, weekOf, offListReport, dayKey, weekKey };
})();

if (typeof module !== 'undefined') module.exports = KYP;
