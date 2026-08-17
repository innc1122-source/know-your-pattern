/* =====================================================================
   PATTERNA reflection backend — a tiny Cloudflare Worker.

   It holds a Google Gemini API key server-side and answers one captured
   moment. Two kinds, matching the app's two doors: a snagged moment
   (kind 'moment' — that moment plus a little recent context, mirrored
   back) and a kept one (kind 'note' — the single line they wanted to
   hold on to, answered with one appreciative-inquiry question).
   The app calls this; the key never reaches the browser.

   What it deliberately does NOT do: store anything, log the content,
   or accept anything other than a single reflection request. The two
   kinds never mix: a kept line travels alone, with no signals and no
   history, and a moment read never carries kept lines.

   The app also caps each person at a few reads a day on its side. That
   cap is client-side and bypassable, so it is enforced again below,
   keyed by client IP, whenever a KV namespace named RL is bound.

   Secrets / vars (set with `wrangler secret put` and wrangler.toml):
     GEMINI_API_KEY  (secret, required — a free Google AI Studio key)
     ALLOWED_ORIGIN  (var, strongly recommended — comma-separated list of
                      origins allowed to call this Worker. Unset = "*",
                      which lets anyone spend your key.)
     MODEL           (var, optional — defaults below)
     APP_TOKEN       (secret, optional — a soft shared guard; see README)
   ===================================================================== */

// prefer a "-latest" alias: dated model ids get retired and start 404ing
const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const MAX_TOKENS = 320;
const MAX_TEXT = 320;     // per-field character cap we accept from the client
const MAX_RECENT = 12;    // most recent moments we'll consider alongside this one
const DAILY_CAP = 3;      // reflections per person per day (kept in step with the app's AI_DAILY_CAP)
const RL_TTL = 172800;    // rate-limit counters expire after 2 days

// per-person key for the daily counter: Cloudflare gives us the real client IP
const rlKey = (request, day) => 'rl:' + (request.headers.get('CF-Connecting-IP') || 'anon') + ':' + day;

function corsHeaders(request, env) {
  const allow = (env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  let allowed = '*';
  if (!(allow.length === 1 && allow[0] === '*')) {
    allowed = allow.includes(origin) ? origin : allow[0] || '';
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-app-token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'content-type': 'application/json' }, headers),
  });

/* Two doors, two jobs. A snagged moment wants a mirror; a kept one wants an
   appreciative question. Same voice, opposite gravity — so they get separate
   prompts rather than one prompt with a mode switch buried in it. */
function systemPrompt(lang, kind) {
  const tongue = lang === 'en' ? 'English' : 'Chinese';
  const common = `You are the quiet, reflective voice of PATTERNA — a private tool where someone notes the moments they react to, and slowly comes to see their own patterns. You are not a therapist, a coach, or an oracle. You are a mirror with a memory.`;
  const close = `- Write ONLY in ${tongue}, with no words from any other language.

You are reflecting, not storing. This is theirs.`;

  if (kind === 'note') {
    return `${common}

They have just kept something that moved them. They were not asked whether it was good — keeping it already said that. Answer with ONE appreciative inquiry: a question or a statement that turns toward what gave this moment its life.

Hard rules:
- Appreciative INQUIRY, not praise. Never compliment them ("that's wonderful", "you're so thoughtful") and never evaluate the moment. Inquire into it.
- Go for what made it possible: the conditions, the small thing they did, what they noticed, what they would want more of. Stay entirely inside what they wrote.
- Never turn it into a problem, a lesson, or something to work on. Nothing here needs fixing.
- Do not analyse them, name their traits, or connect it to any pattern. This side of the app is never analysed.
- ONE sentence, two at the very most. A question is usually stronger than a statement. Plain language, no therapy-speak, no mysticism, no emojis.
${close}`;
  }

  return `${common}

They have just recorded a moment they reacted to. You are given that moment and a few recent ones. Reflect, briefly.

Hard rules:
- Mirror, don't diagnose. Never label who they are ("you're anxious", "you're a people-pleaser"). Stay with what THEY wrote.
- Be specific to their actual words. Generic comfort is worse than saying nothing.
- Only connect this moment to earlier ones when there is a real thread. If there isn't, don't manufacture one.
- If no earlier moments are given, this is the first thing they have ever recorded. Never imply recurrence: no "again", "as usual", "another time", "you tend to", "this keeps happening". There is nothing yet to keep happening.
- No advice, no fixes, no action items. At most one gentle, genuine question — and only if it opens something.
- Short: 2 to 3 sentences, ONE paragraph, no blank lines.
- Plain spoken, the way a level-headed friend talks. Concrete nouns, ordinary verbs. Never write a line you would be embarrassed to say out loud to them.
- Banned: therapy-speak and lyrical filler. No "sit with", "hold space", "let it breathe", "a part of you", "that quiet sting", "the room feels smaller", "carries a piece of your". No metaphors about containers, weight, rooms, doors, or space unless they used one first.
- Do not narrate their feelings back at them in prettier words. If you are describing their emotion rather than what they wrote or did, cut the sentence.
- They decide what is true. Offer, never assert: "it looks like…", "maybe…", not "you clearly…".
${close}`;
}

/* The scaffolding is written in the answer's own language on purpose. English
   labels here get echoed verbatim into a Chinese answer — "competing explanation"
   turned up mid-sentence — and no amount of instruction reliably stops that. */
const SCAFFOLD = {
  zh: {
    kept: t => `他们刚刚留住的一句：「${t}」`,
    keptGo: '现在给出那一句欣赏式探寻，遵守上面每一条规则。',
    now: '这一条：',
    what: t => `  发生了什么：${t}`,
    first: t => `  第一反应：${t}`,
    about: t => `  这是关于什么：${t}`,
    did: t => `  他们做了什么：${t}`,
    recent: '最近的几条（从近到远）：',
    alone: '这是他们记下的第一条，之前没有任何东西可以比对。不要出现「又一次」「还是」「总是」「老是」这类说法——目前没有任何重复存在。',
    ago: d => `${d} 天前`, earlier: '更早',
    pic: (k, s) => `目前的画面：围绕「${s}」，${k === 'pattern' ? '可能是一个模式' : '刚刚开始成形'}——这不是结论，也不要当成事实说出来。`,
    go: '现在回应这一条，遵守上面每一条规则。',
  },
  en: {
    kept: t => `The line they just kept: "${t}"`,
    keptGo: 'Give that one appreciative inquiry now, following every rule.',
    now: 'This moment:',
    what: t => `  What happened: ${t}`,
    first: t => `  First reaction: ${t}`,
    about: t => `  What it was about: ${t}`,
    did: t => `  What they did: ${t}`,
    recent: 'A few recent moments (most recent first):',
    alone: 'This is the first moment they have recorded; there is nothing earlier to compare it with. Do not say "again", "as usual", "you tend to" — no repetition exists yet.',
    ago: d => `${d}d ago`, earlier: 'earlier',
    pic: (k, s) => `The picture so far: ${k === 'pattern' ? 'a possible pattern' : 'something just starting to form'} around "${s}" — not a conclusion, and not to be stated as fact.`,
    go: 'Reflect on this moment now, following every rule.',
  },
};

function userMessage(p) {
  const T = SCAFFOLD[p.lang] || SCAFFOLD.zh;
  const lines = [];

  if (p.kind === 'note') {
    lines.push(T.kept(p.note.text), '', T.keptGo);
    return lines.join('\n');
  }

  const cur = p.current || {};
  lines.push(T.now);
  if (cur.text) lines.push(T.what(cur.text));
  if (cur.reaction) lines.push(T.first(cur.reaction));
  if (cur.signal) lines.push(T.about(cur.signal));
  if (cur.response) lines.push(T.did(cur.response));

  const recent = Array.isArray(p.recent) ? p.recent : [];
  if (!recent.length) {
    lines.push('', T.alone);
  } else {
    lines.push('', T.recent);
    recent.forEach(m => {
      const when = typeof m.daysAgo === 'number' ? T.ago(m.daysAgo) : T.earlier;
      const about = m.signal ? ` [${m.signal}]` : '';
      const did = m.response ? ` → ${m.response}` : '';
      lines.push(`  - (${when})${about} ${m.text || ''}${did}`.trimEnd());
    });
  }

  if (p.picture && p.picture.signal) lines.push('', T.pic(p.picture.kind, p.picture.signal));

  lines.push('', T.go);
  return lines.join('\n');
}

// keep only the fields we expect, bounded — never trust the client to be small or well-shaped
function clean(p) {
  const s = v => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');
  const lang = p && p.lang === 'en' ? 'en' : 'zh';
  if (p && p.kind === 'note') {
    return { lang, kind: 'note', note: { text: s(p.note && p.note.text) } };
  }
  const m = o => ({
    text: s(o && o.text), signal: s(o && o.signal),
    reaction: s(o && o.reaction), response: s(o && o.response),
    daysAgo: o && typeof o.daysAgo === 'number' ? o.daysAgo : undefined,
  });
  return {
    lang,
    kind: 'moment',
    current: m(p && p.current),
    recent: Array.isArray(p && p.recent) ? p.recent.slice(-MAX_RECENT).map(m) : [],
    picture: p && p.picture && p.picture.signal
      ? { signal: s(p.picture.signal), kind: p.picture.kind === 'pattern' ? 'pattern' : 'forming' }
      : null,
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN)
      return json({ error: 'unauthorized' }, 401, cors);

    if (!env.GEMINI_API_KEY)
      return json({ error: 'server missing GEMINI_API_KEY' }, 500, cors);

    let body;
    try { body = clean(await request.json()); }
    catch (e) { return json({ error: 'bad request' }, 400, cors); }

    const seed = body.kind === 'note' ? body.note.text : body.current.text;
    if (!seed) return json({ error: 'nothing to reflect on' }, 400, cors);

    // server-side daily cap — only active when a KV namespace named RL is bound.
    // Eventually consistent, so a fast burst can slip a couple over; that's fine
    // for an abuse cap, not a hard boundary. See README to enable it.
    const day = new Date().toISOString().slice(0, 10);
    let rlk = null, used = 0;
    if (env.RL) {
      rlk = rlKey(request, day);
      used = parseInt((await env.RL.get(rlk)) || '0', 10) || 0;
      if (used >= DAILY_CAP)
        return json({ error: 'daily limit reached', limited: true }, 429, cors);
    }

    const model = env.MODEL || DEFAULT_MODEL;
    let upstream;
    try {
      upstream = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model +
        ':generateContent?key=' + encodeURIComponent(env.GEMINI_API_KEY),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt(body.lang, body.kind) }] },
            contents: [{ role: 'user', parts: [{ text: userMessage(body) }] }],
            generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.7 },
          }),
        }
      );
    } catch (e) {
      return json({ error: 'upstream unreachable' }, 502, cors);
    }

    if (!upstream.ok) {
      // surface the status, never the key or full upstream body
      return json({ error: `model error ${upstream.status}` }, 502, cors);
    }

    let data;
    try { data = await upstream.json(); } catch (e) { return json({ error: 'bad upstream' }, 502, cors); }
    const parts = data && data.candidates && data.candidates[0] &&
                  data.candidates[0].content && data.candidates[0].content.parts;
    // the app renders this as one quiet paragraph; collapse any stray breaks
    const text = (Array.isArray(parts) ? parts.map(p => p.text || '').join('') : '')
      .replace(/\s*\n+\s*/g, ' ').trim();

    if (!text) return json({ error: 'empty reflection' }, 502, cors);

    // count this successful reflection against today's allowance
    if (env.RL && rlk) await env.RL.put(rlk, String(used + 1), { expirationTtl: RL_TTL });

    return json({ reflection: text }, 200, cors);
  },
};
