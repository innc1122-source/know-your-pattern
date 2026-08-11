const KYP = require('./engine.js');
const DAY = 86400000;
let id = 0;
const now = Date.now();
// daysAgo, signal, response
const M = (daysAgo, signal, response, extra={}) =>
  ({ id:'m'+(++id), ts: now - daysAgo*DAY, signal, response, text:'', ...extra });

let pass = 0, fail = 0;
const t = (name, cond, detail='') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')); }
};

console.log('\n1. cold start — nothing should fire');
{
  const ms = [M(0,'autonomy','react_now')];
  t('no glimpse on one moment', KYP.glimpse(ms) === null);
  t('no pattern on one moment', KYP.pattern(ms) === null);
  t('no connection on first ever', KYP.connection(ms, ms[0]) === null);
}

console.log('\n2. connection fires on the 2nd occurrence, not the 1st');
{
  const a = M(3,'autonomy','react_now'), b = M(1,'autonomy','held_in');
  t('2nd same-signal moment connects', KYP.connection([a,b], b) !== null);
  const c = M(1,'fairness','paused');
  t('different signal does not connect', KYP.connection([a,c], c) === null);
}

console.log('\n3. glimpse needs count AND day-spread');
{
  const sameDay = [M(1,'autonomy','react_now'),M(1,'autonomy','held_in'),M(1,'autonomy','paused')];
  t('3 hits on one day → no glimpse', KYP.glimpse(sameDay) === null, JSON.stringify(KYP.glimpse(sameDay)));
  const spread = [M(5,'autonomy','react_now'),M(3,'autonomy','held_in'),M(1,'autonomy','paused')];
  const g = KYP.glimpse(spread);
  t('3 hits across 3 days → glimpse', g !== null);
  t('glimpse names the right signal', g && g.signal === 'autonomy');
  t('glimpse reports hits/of', g && g.hits === 3 && g.of === 3);
}

console.log('\n4. pattern needs volume, share, and week-spread');
{
  // 5 hits but all inside one week → not yet a pattern
  const tight = [M(6,'autonomy','react_now'),M(5,'autonomy','react_now'),M(4,'autonomy','held_in'),
                 M(3,'autonomy','paused'),M(2,'autonomy','react_now')];
  t('5 hits in one week → no pattern', KYP.pattern(tight) === null);

  // 5 hits across 4+ weeks → pattern
  const wide = [M(30,'autonomy','react_now'),M(22,'autonomy','react_now'),M(15,'autonomy','held_in'),
                M(8,'autonomy','paused'),M(1,'autonomy','react_now')];
  const p = KYP.pattern(wide);
  t('5 hits across weeks → pattern', p !== null);
  t('pattern signal correct', p && p.signal === 'autonomy');
  t('confidence within 1-5', p && p.confidence >= 1 && p.confidence <= 5, p && String(p.confidence));

  // one clear leader among many singletons → still a pattern
  const leader = [...wide,
    M(29,'fairness','paused'),M(21,'heard','held_in'),M(14,'standards','paused'),
    M(9,'capacity','avoided'),M(6,'certainty','react_now')];
  t('clear leader among singletons → pattern', KYP.pattern(leader) !== null);

  // runner-up neck and neck → two things, not one pattern
  const tied = [...wide,
    M(31,'fairness','paused'),M(24,'fairness','paused'),M(17,'fairness','held_in'),M(10,'fairness','paused')];
  const pt = KYP.pattern(tied);
  t('5 vs 4 → no pattern', pt === null, pt ? JSON.stringify(pt) : '');
}

console.log('\n5. user rejection pulls confidence down');
{
  const base = [M(30,'autonomy','react_now'),M(22,'autonomy','react_now'),M(15,'autonomy','held_in'),
                M(8,'autonomy','paused'),M(1,'autonomy','react_now')];
  const yes = base.map((m,i)=> i<2 ? {...m, confirm:'yes'} : m);
  const no  = base.map((m,i)=> i<2 ? {...m, confirm:'no'}  : m);
  const cy = KYP.pattern(yes).confidence, cn = KYP.pattern(no).confidence;
  t('confirmed > rejected confidence', cy > cn, `yes=${cy} no=${cn}`);
}

console.log('\n6. glimpse yields to a full pattern');
{
  const wide = [M(30,'autonomy','react_now'),M(22,'autonomy','react_now'),M(15,'autonomy','held_in'),
                M(8,'autonomy','paused'),M(1,'autonomy','react_now')];
  t('pattern exists', KYP.pattern(wide) !== null);
  t('glimpse suppressed once pattern exists', KYP.glimpse(wide) === null);
}

console.log('\n7. change needs volume AND elapsed time');
{
  const fast = Array.from({length:8},(_,i)=>M(8-i,'autonomy', i<4?'react_now':'paused'));
  t('8 moments in 8 days → no change reading', KYP.change(fast,'autonomy') === null);

  const slow = [M(80,'autonomy','react_now'),M(72,'autonomy','react_now'),M(64,'autonomy','react_now'),
                M(30,'autonomy','paused'),M(20,'autonomy','paused'),M(5,'autonomy','paused')];
  const c = KYP.change(slow,'autonomy');
  t('6 moments over 75 days → change reading', c !== null);
  t('headline detects the shift', c && c.headline && c.headline.response === 'paused' && c.headline.delta > 0,
     c && JSON.stringify(c.headline));
  t('then/now are percentages', c && c.then.react_now === 100 && c.now.paused === 100,
     c && JSON.stringify([c.then,c.now]));
}

console.log('\n7b. intensity: same trigger, does it still hit as hard');
{
  const M2 = (d,iv) => ({...M(d,'autonomy','react_now'), iv});
  const softening = [M2(80,3),M2(70,3),M2(60,3),M2(30,2),M2(18,1),M2(4,1)];
  const c = KYP.change(softening,'autonomy');
  t('intensity computed', c && c.intensity !== null, JSON.stringify(c && c.intensity));
  t('softening detected', c && c.intensity.softer === true, JSON.stringify(c && c.intensity));
  const steady = [M2(80,2),M2(70,2),M2(60,2),M2(30,2),M2(18,2),M2(4,2)];
  const c2 = KYP.change(steady,'autonomy');
  t('steady intensity not flagged as softer', c2 && c2.intensity.softer === false, JSON.stringify(c2 && c2.intensity));
  const none = [M(80,'autonomy','react_now'),M(70,'autonomy','react_now'),M(60,'autonomy','react_now'),
                M(30,'autonomy','paused'),M(18,'autonomy','paused'),M(4,'autonomy','paused')];
  t('no intensity data → null, not a crash', KYP.change(none,'autonomy').intensity === null);
}

console.log('\n8. flat responses produce no false headline');
{
  const flat = [M(80,'autonomy','react_now'),M(70,'autonomy','react_now'),M(60,'autonomy','react_now'),
                M(40,'autonomy','react_now'),M(20,'autonomy','react_now'),M(2,'autonomy','react_now')];
  const c = KYP.change(flat,'autonomy');
  t('no change → headline null', c && c.headline === null, c && JSON.stringify(c.headline));
}

console.log('\n9. predictions open, match, and score');
{
  const p = KYP.makePrediction([], 'autonomy');
  t('prediction starts open', p.status === 'open');
  const later = M(-1,'autonomy','paused'); // ts in the future relative to now
  t('same-signal later moment is checkable', KYP.checkablePrediction([p], later) !== null);
  const other = M(-1,'fairness','paused');
  t('different signal is not checkable', KYP.checkablePrediction([p], other) === null);
  const closed = [{...p,status:'closed',result:'yes'},{...p,id:'p2',status:'closed',result:'no'}];
  const sc = KYP.predictionScore(closed);
  t('score counts hits and misses', sc.total===2 && sc.hit===1 && sc.miss===1, JSON.stringify(sc));
  t('no score before anything closes', KYP.predictionScore([p]) === null);
}

console.log('\n11. weekly snapshot — the day 7 payoff');
{
  t('nothing in the first week', KYP.weeklySnapshot([M(2,'autonomy','react_now')]) === null);
  const wk = [M(9,'autonomy','react_now'),M(5,'autonomy','held_in'),M(3,'heard','held_in'),M(1,'autonomy','paused')];
  wk[3].note = 'I mind not being asked.';
  wk.forEach(m=>m.reaction='irritated');
  const s = KYP.weeklySnapshot(wk);
  t('fires once a week of history exists', s !== null);
  t('counts only the last 7 days', s.n === 3, String(s && s.n));
  t('names the top signal', s.topSignal === 'autonomy', s && s.topSignal);
  t('surfaces their own words', s.wrote === 'I mind not being asked.', s && s.wrote);
  const quiet = [M(30,'autonomy','react_now'),M(1,'autonomy','paused')];
  t('a quiet week produces no card', KYP.weeklySnapshot(quiet) === null, JSON.stringify(KYP.weeklySnapshot(quiet)));
}

console.log('\n12. honest intermediate content before a comparison unlocks');
{
  t('two moments give no snapshot', KYP.snapshotNow([M(3,'autonomy','react_now'),M(1,'autonomy','paused')],'autonomy') === null);
  const three = [M(5,'autonomy','react_now'),M(3,'autonomy','react_now'),M(1,'autonomy','paused')];
  const sn = KYP.snapshotNow(three,'autonomy');
  t('three moments give a current picture', sn !== null && sn.n === 3);
  t('mix is sorted and adds up', sn.mix[0].pct === 67 && sn.mix[1].pct === 33, JSON.stringify(sn.mix));
  const up = KYP.unlockProgress(three);
  t('unlock reports both gaps', up.needCount === 3 && up.needDays === 17, JSON.stringify(up));
  const long = [M(40,'autonomy','react_now'),M(30,'autonomy','react_now'),M(2,'autonomy','paused')];
  const up2 = KYP.unlockProgress(long);
  t('time satisfied, count still short', up2.needDays === 0 && up2.needCount === 3, JSON.stringify(up2));
}

console.log('\n12b. order-independence — records may arrive out of sequence');
{
  // same three moments as section 12 but shuffled: array order must not skew the span
  const scrambled = [M(1,'autonomy','paused'), M(5,'autonomy','react_now'), M(3,'autonomy','react_now')];
  const up = KYP.unlockProgress(scrambled);
  t('needDays never exceeds the threshold', up.needDays <= KYP.TH.changeSpanDays, JSON.stringify(up));
  t('scrambled unlock matches the sorted result', up.needCount === 3 && up.needDays === 17, JSON.stringify(up));

  // and the change reading must survive a scrambled array (it went null before the fix)
  const scrambledSlow = [M(20,'autonomy','paused'), M(80,'autonomy','react_now'), M(5,'autonomy','paused'),
                         M(64,'autonomy','react_now'), M(30,'autonomy','paused'), M(72,'autonomy','react_now')];
  const c = KYP.change(scrambledSlow,'autonomy');
  t('change still reads despite scrambled input', c !== null);
  t('change span stays non-negative', c && c.spanDays >= 0, c && String(c.spanDays));
  t('then = earliest half, now = latest half', c && c.then.react_now === 100 && c.now.paused === 100,
     c && JSON.stringify([c && c.then, c && c.now]));
}

console.log('\n13. off-list report — the word list judging itself');
{
  const mk = (d,sig,other) => ({...M(d,sig,'react_now'), reaction:'irritated', other:other||{}});
  const clean = [mk(9,'autonomy'),mk(7,'autonomy'),mk(5,'heard'),mk(3,'autonomy'),mk(1,'fairness')];
  const r1 = KYP.offListReport(clean);
  t('a fitting list reports 0%', r1.signalOffPct === 0 && r1.verdict === 'fits', JSON.stringify(r1.rate.signal));
  t('nothing to review when nobody went off-list', r1.list.length === 0);

  const gappy = [mk(9,'other',{signal:'被当成透明人'}), mk(7,'autonomy'),
                 mk(5,'other',{signal:'被当成透明人'}), mk(3,'other',{signal:'插不上话'}), mk(1,'heard')];
  const r2 = KYP.offListReport(gappy);
  t('off-list rate computed', r2.signalOffPct === 60, String(r2.signalOffPct));
  t('a high rate says the list is wrong', r2.verdict === 'wrong', r2.verdict);
  t('repeated words rank first', r2.list[0].text === '被当成透明人' && r2.list[0].n === 2, JSON.stringify(r2.list[0]));
  t('every distinct word is kept', r2.list.length === 2, String(r2.list.length));
  t('the field is recorded', r2.list.every(x=>x.field==='signal'));
  t('first and last seen tracked', r2.list[0].first < r2.list[0].last);

  const mixed = [ {...mk(4,'autonomy'), reaction:'other', other:{reaction:'说不上来'}},
                  {...mk(2,'autonomy'), response:'other', other:{response:'先走开了'}} ];
  const r3 = KYP.offListReport(mixed);
  t('all three fields are covered', r3.list.map(x=>x.field).sort().join(',') === 'reaction,response',
    JSON.stringify(r3.list.map(x=>x.field)));
  t('per-field rates reported', r3.rate.reaction.pct === 50 && r3.rate.response.pct === 50,
    JSON.stringify(r3.rate));

  t('empty history is safe', KYP.offListReport([]).verdict === 'none');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
