const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/patterna.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://local.test/', pretendToBeVisual: true,
  beforeParse(w){
    w.addEventListener('error', e => errors.push('window error: ' + e.message));
    const oe = w.console.error;
    w.console.error = (...a) => { errors.push('console.error: ' + a.join(' ')); oe(...a); };
    w.confirm = () => true;
    w.alert = m => errors.push('alert: ' + m);
  }
});
const w = dom.window, doc = w.document;
const DAY = 86400000;
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d ? '  → ' + String(d).slice(0, 190) : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const txt = () => doc.getElementById('view').textContent.replace(/\s+/g, ' ').trim();
const ftxt = () => doc.getElementById('flowbox').textContent.replace(/\s+/g, ' ').trim();
const btns = () => [...doc.getElementById('flowbox').querySelectorAll('button')];
const fc = async s => {
  const b = btns().find(x => x.textContent.includes(s));
  if (!b) throw new Error(`no button "${s}" — saw: ${btns().map(x => x.textContent.trim()).join(' | ')}`);
  b.click(); await wait(230);
};
const SIG = { autonomy: '我没有选择', heard: '没人听我说', capacity: '事情太多' };
const RES = { react_now: '当场就反应了', held_in: '忍住没说', paused: '先停了一下' };

function seed(daysAgo, signal, response, text) {
  w.__kyp.D.moments.push({ id: 'seed' + Math.random().toString(36).slice(2, 7),
    ts: Date.now() - daysAgo * DAY, text, reaction: 'irritated', signal,
    intensity:'medium', iv:2, response, secs: 40, note: '' });
  w.__kyp.D.moments.sort((a, b) => a.ts - b.ts);
}
const wipe = () => { w.doClear(); w.__kyp.D.onboarded = true; };

async function capture(text, signal, response) {
  w.startFlow();
  const a = doc.getElementById('fWhat');
  a.value = text; a.dispatchEvent(new w.Event('input', { bubbles: true }));
  await fc('下一步'); await fc('不是吧'); await fc(SIG[signal]);
  await fc('当时挺明显的'); await fc(RES[response]);
}
async function drain() {
  let g = 0;
  while (doc.getElementById('overlay').classList.contains('on') && g++ < 12) {
    const b = btns().find(x => /完成|继续观察它|看看吧|保存|跳过|太像了|放下/.test(x.textContent));
    if (!b) break; b.click(); await wait(230);
  }
}

const otxt = () => doc.getElementById('obbox').textContent.replace(/\s+/g,' ').trim();
const obtn = s => { const b=[...doc.getElementById('obbox').querySelectorAll('button')].find(x=>x.textContent.includes(s));
  if(!b) throw new Error(`no onboard button "${s}" — saw: ${[...doc.getElementById('obbox').querySelectorAll('button')].map(x=>x.textContent.trim()).join(' | ')}`);
  b.click(); };

async function main() {

console.log('\n0. onboarding runs on first open');
t('onboarding shown on a fresh install', doc.getElementById('onboard').classList.contains('on'));
t('language choice offered first', otxt().includes('中文') && otxt().includes('English'), otxt().slice(0,70));
t('promise stated', otxt().includes('看见重复'), otxt().slice(0,90));
t('mark shown on the opening screen', !!doc.querySelector('#obbox .logomark'));
t('wordmark shown', otxt().includes('PATTERNA'), otxt().slice(0,60));
obtn('开始');
t('screen 2: not a journal', otxt().includes('这不是一本日记'), otxt().slice(0,80));
obtn('继续');
t('screen 3: you decide what is true', otxt().includes('由你判断'), otxt().slice(0,80));
t('no-diagnosis promise present', otxt().includes('不诊断你'));
obtn('继续');
obtn('记录一个瞬间');
t('onboarding dismissed', !doc.getElementById('onboard').classList.contains('on'));
t('onboarded flag persisted', w.__kyp.D.onboarded === true);

console.log('\n1. boots clean');
t('no script errors', errors.length === 0, errors.join(' ; '));
t('tab bar rendered', doc.getElementById('tabbar').children.length === 4);
t('primary CTA present', txt().includes('记录一个瞬间'));
t('empty state', txt().includes('这里还是空的'));

console.log('\n2. all tabs render on empty data');
for (const tb of ['patterns', 'changes', 'me', 'home']) {
  const b = errors.length; w.go(tb);
  t(tb + ' renders', errors.length === b && doc.getElementById('view').innerHTML.length > 40, errors.slice(b).join(';'));
}
w.go('changes');
t('empty state explains what it takes', txt().includes('先记几个瞬间') && /\d/.test(txt()), txt().slice(0, 140));

console.log('\n3. one moment, end to end');
w.go('home');
await capture('领导没问我就加了任务', 'autonomy', 'react_now');
t('mirror shown', ftxt().includes('刚刚注意到'), ftxt().slice(0, 80));
t('mirror restates only', ftxt().includes('我没有选择') && !ftxt().includes('你可能并不是'), ftxt().slice(0,140));
t('mirror pairs signal and intensity', ftxt().includes('我没有选择') && ftxt().includes('当时挺明显的'), ftxt().slice(0,160));
t('mirror reads as a sentence, not two orphan labels', ftxt().includes('你选择了') && ftxt().includes('以及'), ftxt().slice(0,160));
t('their words are quoted as theirs', ftxt().includes('「我没有选择」'), ftxt().slice(0,160));
t('forward promise given', ftxt().includes('我们记下了'));
t('moment saved', w.__kyp.D.moments.length === 1);
await fc('完成');
t('letting-go coda shows the recorded words', ftxt().includes('领导没问我就加了任务'), ftxt().slice(0, 120));
t('coda offers a quiet, minimal close', btns().some(b=>b.textContent.includes('放下')) && !ftxt().includes('先放在这里'));
await fc('放下');
t('overlay closed', !doc.getElementById('overlay').classList.contains('on'));
t('listed on home', txt().includes('领导没问我就加了任务'));

console.log('\n4. second occurrence → connection');
wipe(); seed(6, 'autonomy', 'react_now', '朋友临时改了约的时间');
await capture('有人替我答应了周末', 'autonomy', 'held_in');
await fc('完成');
t('connection screen', ftxt().includes('这个地方你来过'), ftxt().slice(0, 90));
t('shows the earlier moment', ftxt().includes('朋友临时改了约的时间'));
await drain();

console.log('\n5. third across three days → glimpse, hypothesis, prediction');
wipe();
seed(9, 'autonomy', 'react_now', '朋友临时改了约的时间');
seed(4, 'autonomy', 'held_in', '有人替我答应了周末');
await capture('排期被调整没人先说', 'autonomy', 'paused');
await fc('完成');
t('glimpse screen', ftxt().includes('正在出现'), ftxt().slice(0, 110));
t('glimpse hedges', ftxt().includes('还太早'));
t('glimpse cites counts', /最近 \d+ 次记录里/.test(ftxt()), ftxt().slice(0, 110));
t('hypothesis asked on the same screen', !!doc.getElementById('fNote'), ftxt().slice(0, 140));
const note = doc.getElementById('fNote');
note.value = '我可能不是怕事情多，是讨厌别人替我决定。';
note.dispatchEvent(new w.Event('input', { bubbles: true }));
await fc('继续观察它');
t('prediction screen', ftxt().includes('我们猜一下'), ftxt().slice(0, 100));
t('prediction demands nothing', ftxt().includes('你什么都不用做'));
t('open prediction stored', w.__kyp.D.predictions.filter(p => p.status === 'open').length === 1);
t('hypothesis saved', w.__kyp.D.moments.some(m => m.note && m.note.length > 5));
await drain();

console.log('\n6. next same-signal moment → prediction check');
await capture('会议时间被直接改掉', 'autonomy', 'paused');
await fc('完成');
t('check appears', ftxt().includes('还记得我们上次的猜测'), ftxt().slice(0, 100));
await fc('不是');
t('miss handled gracefully', ftxt().includes('调整接下来观察的方向'), ftxt().slice(0, 100));
t('closed as miss', w.__kyp.D.predictions.some(p => p.status === 'closed' && p.result === 'no'));
await drain();
t('flow closed', !doc.getElementById('overlay').classList.contains('on'));

console.log('\n6b. predictions become a home hook + a guesses view');
{
  wipe();
  w.__kyp.D.predictions.push(
    { id:'pt1', signal:'autonomy', createdTs: Date.now()-20*DAY, status:'closed', result:'yes' },
    { id:'pt2', signal:'autonomy', createdTs: Date.now()-10*DAY, status:'closed', result:'no' },
    { id:'pt3', signal:'autonomy', createdTs: Date.now()- 2*DAY, status:'open',   result:null });
  w.go('home');
  t('home surfaces the open guess as a re-entry loop', txt().includes('开着的猜测'), txt().slice(0,160));
  t('home shows the knowing-you number', /次里猜中了/.test(txt()), txt().slice(0,160));
  w.go('guesses');
  t('guesses view frames it as knowing you, not a score', txt().includes('它有多懂你'), txt().slice(0,160));
  t('guesses view says rejection is what teaches it', txt().includes('更懂你'), txt().slice(0,160));
  t('guesses view surfaces the open bet', txt().includes('我们猜一下'), txt().slice(0,200));
  t('guesses keeps the home tab lit', doc.querySelectorAll('#tabbar .tb.on').length === 1);
  w.go('home');
}

console.log('\n6c. a change can be developed into a keepsake card');
{
  wipe();
  [80,72,64].forEach((dd,i)=>seed(dd,'autonomy','react_now','早 '+i));
  [30,20, 5].forEach((dd,i)=>seed(dd,'autonomy','paused','近 '+i));
  w.go('changes');
  t('a real then→now shows', txt().includes('变化的是你'), txt().slice(0,160));
  t('a keepsake card is offered', txt().includes('洗成一张照片'), txt().slice(0,200));
  let er=null; try{ w.saveChangeCard('autonomy'); }catch(e){ er=e; }
  t('developing the card never throws', !er, er && er.message);
  w.go('home');
}

console.log('\n6d. the light lane keeps a note without touching the engine');
{
  wipe();
  w.startNote();
  const nt = doc.getElementById('nText');
  t('light-note screen opens', !!nt && doc.getElementById('overlay').classList.contains('on'));
  nt.value = '路边的花开了'; nt.dispatchEvent(new w.Event('input',{bubbles:true}));
  const bright = btns().find(b=>b.textContent.includes('这是好的'));
  t('a good-mark is offered', !!bright); if(bright) bright.click(); await wait(60);
  const save = btns().find(b=>b.textContent.includes('保存'));
  t('save appears once there is text', !!save); if(save) save.click(); await wait(60);
  t('stored in notes, not moments', w.__kyp.D.notes.length===1 && w.__kyp.D.moments.length===0, JSON.stringify(w.__kyp.D.notes));
  t('kept the good mark', w.__kyp.D.notes[0].bright===true);
  t('note carries no signal — engine never sees it', !('signal' in w.__kyp.D.notes[0]));
  t('the light coda offers a quiet close', btns().some(b=>b.textContent.includes('放下')));
  btns().find(b=>b.textContent.includes('放下')).click(); await wait(60);
  t('overlay closed after the note', !doc.getElementById('overlay').classList.contains('on'));
  w.go('home');
  t('the note shows on home', txt().includes('路边的花开了'), txt().slice(0,160));
}

console.log('\n6e. off-list moments are received warmly, not left empty');
{
  wipe();
  w.startFlow();
  const a = doc.getElementById('fWhat');
  a.value = '一种说不清的别扭'; a.dispatchEvent(new w.Event('input',{bubbles:true}));
  await fc('下一步'); await fc('不是吧');
  await fc('都不是');
  const ot = doc.getElementById('fOther_signal');
  t('off-list opens a custom field', !!ot);
  ot.value = '插不上话'; ot.dispatchEvent(new w.Event('input',{bubbles:true}));
  await fc('下一步');
  await fc('当时挺明显的'); await fc('先停了一下');
  t('off-list mirror is warm, not empty', ftxt().includes('不在我的词表里'), ftxt().slice(0,160));
  t('off-list keeps the typed word', ftxt().includes('插不上话'), ftxt().slice(0,160));
  t('no empty-quote bug', !/「」/.test(ftxt()), ftxt().slice(0,160));
  await fc('完成'); await fc('放下');
  t('off-list moment saved', w.__kyp.D.moments.some(m=>m.signal==='other'));
}

console.log('\n6f. a bright note surfaces in the weekly review');
{
  wipe();
  seed(9,'autonomy','react_now','上上周');
  seed(3,'autonomy','held_in','这周甲');
  seed(1,'autonomy','paused','这周乙');
  w.__kyp.D.notes.push({id:'bn1', ts:Date.now()-2*DAY, text:'今天被夸了', bright:true});
  w.__kyp.D.seen = {glimpse:{},pattern:{}};
  w.go('home');
  t('weekly card shows', txt().includes('你这一周的观察'), txt().slice(0,120));
  t('bright note surfaces in the week', txt().includes('这周你也留下过一个亮的时刻'), txt().slice(0,200));
  t('and it quotes the bright note', txt().includes('今天被夸了'), txt().slice(0,200));
  t('no duplicate standalone echo when the week card carries it', !txt().includes('这周，有一个亮的时刻'), txt().slice(0,200));
}

console.log('\n6g. a quiet, notes-only week still echoes the bright moment');
{
  wipe();
  // old moments only: a week of history exists, but nothing recent — the engine cards nothing
  seed(15,'autonomy','react_now','很久以前');
  seed(12,'autonomy','held_in','也很久以前');
  w.__kyp.D.notes.push({id:'bn2', ts:Date.now()-DAY, text:'路上有人帮了我一把', bright:true});
  w.__kyp.D.seen = {glimpse:{},pattern:{}};
  w.go('home');
  t('no moment-based week card this week', !txt().includes('你这一周的观察'), txt().slice(0,140));
  t('but the bright moment still echoes', txt().includes('这周，有一个亮的时刻'), txt().slice(0,160));
  t('and it quotes the note', txt().includes('路上有人帮了我一把'), txt().slice(0,160));
  const db = doc.getElementById('view').querySelector('.wdismiss');
  t('the echo can be dismissed', !!db);
  db.click(); await wait(60);
  t('once dismissed it stays quiet', !txt().includes('这周，有一个亮的时刻'), txt().slice(0,160));
  t('the note stays out of the engine', w.__kyp.D.notes.length===1 && !('signal' in w.__kyp.D.notes[0]) && w.__kyp.D.moments.length===2);
}

console.log('\n7. a real pattern arrives, with calibration');
wipe();
[30, 23, 16, 9].forEach((d, i) => seed(d, 'autonomy', i < 2 ? 'react_now' : 'held_in', '记录' + i));
await capture('排期又被改了', 'autonomy', 'paused');
await fc('完成');
t('pattern card', ftxt().includes('可信度'), ftxt().slice(0, 130));
t('the turn is rendered as a contrast', ftxt().includes('你可能不是最在意') && ftxt().includes('而是更在意'), ftxt().slice(0,180));
t('pattern hedged', ftxt().includes('不是关于你这个人的结论'));
t('calibration offered', ftxt().includes('太像了') && ftxt().includes('不太对'));
await fc('太像了');
t('confirmation recorded', w.__kyp.D.moments.some(m => m.confirm === 'yes'));
await drain();

console.log('\n7b. escape hatches and the example empty state');
wipe();
w.startFlow();
{ const a = doc.getElementById('fWhat'); a.value='说不上来的一件事'; a.dispatchEvent(new w.Event('input',{bubbles:true})); }
await fc('下一步');
t('reaction list has an out', ftxt().includes('都不是'), ftxt().slice(0,120));
await fc('都不是');
t('reaction other opens a field', !!doc.getElementById('fOther_reaction'), ftxt().slice(-120));
await fc('下一步');
t('signal list has an out', ftxt().includes('都不是'), ftxt().slice(-90));
await fc('都不是');
t('own-words field appears', !!doc.getElementById('fOther_signal'), ftxt().slice(-110));
{ const o = doc.getElementById('fOther_signal'); o.value='被当成透明人'; o.dispatchEvent(new w.Event('input',{bubbles:true})); }
await fc('下一步'); await fc('当时挺明显的'); await fc('忍住没说');
t('mirror echoes their own word', ftxt().includes('被当成透明人'), ftxt().slice(0,140));
await drain();
t('off-list signal never drives a pattern', w.__kyp.KYP.pattern(w.__kyp.D.moments) === null);
t('off-list signal not ranked', !w.__kyp.KYP.ranked(w.__kyp.D.moments).some(x=>x.signal==='other'));
w.go('changes');
t('empty changes shows a labelled example', txt().includes('示例') && /%/.test(txt()), txt().slice(0,160));

console.log('\n7c. keyword ordering surfaces the likely option first');
wipe();
w.startFlow();
{ const a = doc.getElementById('fWhat'); a.value='领导没问我就直接改了我的排期';
  a.dispatchEvent(new w.Event('input',{bubbles:true})); }
await fc('下一步'); await fc('不是吧');
{
  const labels = [...doc.getElementById('flowbox').querySelectorAll('.pill')].map(x=>x.textContent.trim());
  t('list folded to a short set', labels.length <= 5, labels.join(' | '));
  t('likely option ranked first', labels[0] === '我没有选择', labels.join(' | '));
  t('escape hatch still present', labels.some(x=>x.includes('都不是')), labels.join(' | '));
  t('expander offered', ftxt().includes('其他可能'), ftxt().slice(-120));
}
w.toggleSignals();
{
  const labels = [...doc.getElementById('flowbox').querySelectorAll('.pill')].map(x=>x.textContent.trim());
  t('expanding reveals the full list', labels.length >= 11, String(labels.length));
  t('wording unchanged when expanded', labels.includes('不公平') && labels.includes('我被质疑了'), labels.join(' | '));
}
await fc('我没有选择');
{
  const pills = [...doc.getElementById('flowbox').querySelectorAll('.pill')];
  t('one option per row', pills.length && pills.every(p=>p.classList.contains('stack')),
    pills.map(x=>x.className).join(' | '));
}
await fc('当时挺明显的'); await fc('当场就反应了');
t('intensity stored numerically', w.__kyp.D.moments.slice(-1)[0].iv === 2, String(w.__kyp.D.moments.slice(-1)[0].iv));
await drain();

console.log('\n7d. softening intensity shows as a second kind of change');
wipe();
const IV = {light:1, medium:2, strong:3};
[[80,'strong'],[70,'strong'],[58,'strong'],[30,'medium'],[16,'light'],[4,'light']]
  .forEach(([d,k],i)=>{ seed(d,'autonomy', i<3?'react_now':'paused','记录'+i);
    const m=w.__kyp.D.moments[w.__kyp.D.moments.length-1]; m.intensity=k; m.iv=IV[k]; });
w.go('changes');
t('softening surfaced', txt().includes('没那么疼了'), txt().slice(0,220));
t('frequency caveat shown', txt().includes('频率没有变'));

console.log('\n7e. the first week is not an empty room');
wipe();
seed(5,'autonomy','react_now','排期被改了'); seed(3,'autonomy','react_now','又被改了'); seed(1,'autonomy','held_in','第三次了');
w.go('changes');
t('current picture shown from 3 moments', txt().includes('现在的你'), txt().slice(0,220));
t('the pending half is labelled honestly', txt().includes('历史还不够'), txt().slice(0,240));
t('says exactly what is still missing', txt().includes('要做对比，还差') && /\d/.test(txt()), txt().slice(0,300));
t('does not claim a change yet', !txt().includes('变化的是你'));

console.log('\n7f. weekly snapshot appears on day 7');
wipe();
seed(9,'autonomy','react_now','第一条'); seed(5,'autonomy','react_now','第二条');
seed(3,'heard','held_in','第三条'); seed(1,'autonomy','paused','第四条');
w.__kyp.D.moments.forEach(m=>m.reaction='irritated');
w.__kyp.D.moments[3].note = '我可能不是怕事情多，是讨厌别人替我决定。';
w.go('home');
t('week card shown', txt().includes('你这一周的观察'), txt().slice(0,200));
t('counts only this week', txt().includes('你记录了 3 个瞬间'), txt().slice(0,220));
t('names what came up most', txt().includes('我没有选择'), txt().slice(0,260));
t('reflects their own words back', txt().includes('讨厌别人替我决定'), txt().slice(0,340));
t('carries a question forward', txt().includes('下周可以留意的一件事'), txt().slice(0,400));
{
  const b=[...doc.getElementById('view').querySelectorAll('button')].find(x=>x.textContent.includes('知道了'));
  t('dismissable', !!b); if(b) b.click();
}
t('stays dismissed', !txt().includes('你这一周的观察'), txt().slice(0,120));

console.log('\n7g. the escape hatch is reviewable');
wipe();
w.go('gaps');
t('empty state before anyone goes off-list', txt().includes('还没有用过'), txt().slice(0,120));
w.startFlow();
{ const a=doc.getElementById('fWhat'); a.value='会上我插不上话'; a.dispatchEvent(new w.Event('input',{bubbles:true})); }
await fc('下一步'); await fc('不是吧'); await fc('都不是');
{ const o=doc.getElementById('fOther_signal'); o.value='插不上话'; o.dispatchEvent(new w.Event('input',{bubbles:true})); }
await fc('下一步'); await fc('当时挺明显的'); await fc('忍住没说');
await drain();
w.go('gaps');
t('the word is listed', txt().includes('插不上话'), txt().slice(0,220));
t('which question it came from', txt().includes('哪一点最戳你'), txt().slice(0,220));
t('off-list rate shown', /%/.test(txt()) && txt().includes('都不是'), txt().slice(0,220));
t('states it never feeds pattern detection', txt().includes('不参与模式判断'), txt().slice(-200));
t('still excluded from the engine', w.__kyp.KYP.ranked(w.__kyp.D.moments).every(x=>x.signal!=='other'));
{
  const rep = w.__kyp.KYP.offListReport(w.__kyp.D.moments);
  t('report reaches the export payload', rep.list.length === 1 && rep.list[0].text === '插不上话', JSON.stringify(rep.list));
}
w.go('me');
t('reachable from Me', txt().includes('看看词表漏了什么'), txt().slice(-220));
t('mark shown on Me', !!doc.querySelector('#view .logomark'));

console.log('\n8. demo data lights up Patterns and Changes');
const b8 = errors.length;
w.loadDemo();
t('demo loads clean', errors.length === b8, errors.slice(b8).join(';'));
t('demo volume', w.__kyp.D.moments.length >= 12, String(w.__kyp.D.moments.length));
w.go('patterns');
t('pattern rendered', txt().includes('可信度'), txt().slice(0, 120));
t('evidence shown', txt().includes('我们为什么这么说'));
t('competing explanation shown', txt().includes('另一种可能'));
t('user hypothesis surfaced', txt().includes('你自己写的'), txt().slice(-200));
t('prediction accuracy shown', txt().includes('猜得怎么样'));
w.go('changes');
t('then→now rendered', txt().includes('那时') && txt().includes('现在'), txt().slice(0, 150));
t('headline present', txt().includes('变化的是你'));
t('demo also shows softening', txt().includes('没那么疼了'), txt().slice(0,240));
t('no NaN/undefined leaked', !/NaN|undefined/.test(doc.getElementById('view').innerHTML));

console.log('\n8b. the Chinese build has no English leaking through');
w.setLang('zh'); w.loadDemo();
{
  const strip = h => h.replace(/<[^>]*>/g,' ');
  // the brand name and the language switcher stay untranslated by design
  const allow = /^(PATTERNA|English|KYP|JSON|localStorage|AI|OK|·|\d+|%|→|—)$/;
  const leaks = [];
  ['home','patterns','changes','me'].forEach(tb=>{
    w.go(tb);
    const words = strip(doc.getElementById('view').innerHTML).match(/[A-Za-z][A-Za-z' ]{2,}/g) || [];
    words.forEach(x=>{ const t=x.trim(); if(t && !allow.test(t)) leaks.push(tb+': '+t); });
  });
  t('no English in the Chinese tabs', leaks.length === 0, leaks.slice(0,6).join(' | '));
}
w.startFlow();
{
  const a = doc.getElementById('fWhat'); a.value='领导没问我就改了排期';
  a.dispatchEvent(new w.Event('input',{bubbles:true}));
}
await fc('下一步'); await fc('不是吧'); await fc('我没有选择');
await fc('当时挺明显的'); await fc('当场就反应了');
{
  const strip = h => h.replace(/<[^>]*>/g,' ');
  const words = strip(doc.getElementById('flowbox').innerHTML).match(/[A-Za-z][A-Za-z' ]{2,}/g) || [];
  t('no English on the mirror screen', words.length === 0, words.join(' | '));
  t('speaker label is in Chinese', ftxt().includes('我们注意到'), ftxt().slice(0,120));
}
await drain();

console.log('\n9. language switch redraws everything');
const b9 = errors.length; w.setLang('en');
t('EN switch clean', errors.length === b9, errors.slice(b9).join(';'));
for (const tb of ['home', 'patterns', 'changes', 'me']) {
  const e = errors.length; w.go(tb);
  const bad = (doc.getElementById('view').innerHTML.match(/undefined|NaN/g) || []);
  t('EN ' + tb, errors.length === e && !bad.length, bad.join(','));
}
t('EN copy applied', txt().includes('Language') || txt().includes('Your data'), txt().slice(0, 90));
w.setLang('zh');

console.log('\n10. persistence and round-trip');
const snap = JSON.stringify(w.__kyp.D);
t('written to localStorage', !!w.localStorage.getItem('kyp.v1'));
w.doClear();
t('clear empties store', w.__kyp.D.moments.length === 0);
t('intro can be replayed', typeof w.startOnboard === 'function');
t('localStorage cleared', !w.localStorage.getItem('kyp.v1'));
w.__kyp.D = JSON.parse(snap); w.render();
t('restore works', w.__kyp.D.moments.length > 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) { console.log('\nruntime errors:'); errors.forEach(e => console.log('  - ' + e)); }
console.log('');
process.exit(fail || errors.length ? 1 : 0);
}
main().catch(e => { console.error('\nSUITE THREW: ' + e.message); process.exit(1); });
