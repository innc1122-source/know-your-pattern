/* =====================================================================
   PATTERNA reflection backend — a tiny Cloudflare Worker.

   It holds a Google Gemini API key server-side and reads the moments
   behind one pattern — several notes the person wrote over time, grouped
   under one signal — into a short, reflective note. Not a fresh capture:
   the app deliberately keeps this out of the recording flow, where the
   model would have one just-written line and nothing to read across.
   The app calls this; the key never reaches the browser.

   What it deliberately does NOT do: store anything, log the content,
   or accept anything other than a single pattern read.

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
const MAX_MOMENTS = 8;    // moments behind one pattern that we'll read
const DAILY_CAP = 3;      // reads per person per day (kept in step with the app's AI_DAILY_CAP)
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

function systemPrompt(lang) {
  const tongue = lang === 'en' ? 'English' : 'Chinese';
  return `You are the quiet, reflective voice of PATTERNA — a private tool where someone notes moments they reacted to, and slowly comes to see their own patterns. You are not a therapist, a coach, or an oracle. You are a mirror with a memory.

This is not a fresh moment. The app has grouped several moments the person recorded over time under one signal, and is showing them a tentative pattern with a confidence and one competing explanation. They came back and asked you to read it.

The app itself only sees the labels they tapped. You can see what they actually wrote. That gap is the only reason you are here: say what the labels miss — a recurring word, a shift between the earlier and later ones, something the grouping flattens.

Hard rules:
- Mirror, don't diagnose. Never label who they are ("you're anxious", "you're a people-pleaser"). Stay with what THEY wrote.
- Quote or closely echo their own wording at least once. Generic comfort is worse than saying nothing.
- The pattern is a hypothesis, not a fact, and the competing explanation may be the better one. If what they wrote fits it better, say so.
- If these moments don't actually hold together, say that plainly. Manufacturing a thread is the worst thing you can do here.
- No advice, no fixes, no action items. At most one gentle, genuine question — and only if it opens something.
- Short: 2 to 4 sentences, ONE paragraph, no blank lines. Plain language. No therapy-speak, no mysticism, no emojis, no headings.
- They decide what is true. Offer, never assert: "it looks like…", "maybe…", not "you clearly…".
- Write ONLY in ${tongue}, with no words from any other language.

You are reflecting, not storing. This is theirs.`;
}

/* The scaffolding is written in the answer's own language on purpose. English
   labels here get echoed verbatim into a Chinese answer — "competing explanation"
   turned up mid-sentence — and no amount of instruction reliably stops that. */
const SCAFFOLD = {
  zh: {
    hypo: s => `应用的假设：这件事反复出现，都是关于「${s}」。`,
    sure: (c, h, t) => `  它有多确定：5 分里给了 ${c} 分${h && t ? `（最近 ${t} 个瞬间里有 ${h} 个）` : ''}。`,
    alt: a => `  它同时给对方看的另一种可能：${a}`,
    wrote: '对方自己写下的，从近到远：',
    ago: d => `${d} 天前`, earlier: '更早',
    own: n => `对方自己的猜测，原话：「${n}」`,
    go: '现在读这几条，遵守上面每一条规则。',
  },
  en: {
    hypo: s => `The app's hypothesis: this keeps being about "${s}".`,
    sure: (c, h, t) => `  How sure it is: ${c} out of 5${h && t ? ` (${h} of the last ${t} moments)` : ''}.`,
    alt: a => `  The other possibility it also shows them: ${a}`,
    wrote: 'What they actually wrote, most recent first:',
    ago: d => `${d}d ago`, earlier: 'earlier',
    own: n => `Their own guess, in their words: "${n}"`,
    go: 'Read these now, following every rule.',
  },
};

function userMessage(p) {
  const pat = p.pattern || {};
  const T = SCAFFOLD[p.lang] || SCAFFOLD.zh;
  const lines = [];
  lines.push(T.hypo(pat.signal));
  if (typeof pat.confidence === 'number') lines.push(T.sure(pat.confidence, pat.hits, pat.total));
  if (pat.alternative) lines.push(T.alt(pat.alternative));

  const ms = Array.isArray(pat.moments) ? pat.moments : [];
  if (ms.length) {
    lines.push('', T.wrote);
    ms.forEach(m => {
      const when = typeof m.daysAgo === 'number' ? T.ago(m.daysAgo) : T.earlier;
      const did = m.response ? ` → ${m.response}` : '';
      lines.push(`  - (${when}) ${m.text || ''}${did}`.trimEnd());
    });
  }

  if (pat.note) lines.push('', T.own(pat.note));

  lines.push('', T.go);
  return lines.join('\n');
}

// keep only the fields we expect, bounded — never trust the client to be small or well-shaped
function clean(p) {
  const s = v => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');
  const n = v => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const pat = (p && p.pattern) || {};
  return {
    lang: p && p.lang === 'en' ? 'en' : 'zh',
    pattern: {
      signal: s(pat.signal),
      confidence: n(pat.confidence),
      hits: n(pat.hits),
      total: n(pat.total),
      alternative: s(pat.alternative),
      note: s(pat.note),
      moments: Array.isArray(pat.moments) ? pat.moments.slice(0, MAX_MOMENTS).map(o => ({
        text: s(o && o.text),
        response: s(o && o.response),
        daysAgo: n(o && o.daysAgo),
      })) : [],
    },
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

    if (!body.pattern.moments.some(m => m.text))
      return json({ error: 'nothing to reflect on' }, 400, cors);

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
            systemInstruction: { parts: [{ text: systemPrompt(body.lang) }] },
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
