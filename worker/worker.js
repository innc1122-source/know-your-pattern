/* =====================================================================
   PATTERNA reflection backend — a tiny Cloudflare Worker.

   It holds a Google Gemini API key server-side and turns one captured
   moment (plus a little recent context) into a short, reflective note.
   The app calls this; the key never reaches the browser.

   What it deliberately does NOT do: store anything, log the content,
   or accept anything other than a single reflection request.

   The app also caps each person at a few reflections a day on its side.
   That cap is client-side and bypassable — before this serves real
   traffic, add server-side rate limiting here (Cloudflare KV / Durable
   Objects / Rate Limiting) so the shared key can't be drained.

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
const MAX_RECENT = 12;    // most recent moments we'll consider
const DAILY_CAP = 5;      // reflections per person per day (kept in step with the app's AI_DAILY_CAP)
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

The person has just recorded a moment. You are given that moment and a few recent ones. Reflect, briefly.

Hard rules:
- Mirror, don't diagnose. Never label who they are ("you're anxious", "you're a people-pleaser"). Stay with what THEY wrote.
- Be specific to their actual words. Generic comfort is worse than saying nothing.
- Only connect this moment to earlier ones when there is a real thread. If there isn't, don't manufacture one.
- No advice, no fixes, no action items. At most one gentle, genuine question — and only if it opens something.
- Short: 2 to 4 sentences. Plain language. No therapy-speak, no mysticism, no emojis, no headings.
- They decide what is true. Offer, never assert: "it looks like…", "maybe…", not "you clearly…".
- Write ONLY in ${tongue}.

You are reflecting, not storing. This is theirs.`;
}

function userMessage(p) {
  const cur = p.current || {};
  const lines = [];
  lines.push('This moment:');
  if (cur.text) lines.push(`  What happened: ${cur.text}`);
  if (cur.reaction) lines.push(`  First reaction: ${cur.reaction}`);
  if (cur.signal) lines.push(`  What it was about: ${cur.signal}`);
  if (cur.response) lines.push(`  What they did: ${cur.response}`);

  const recent = Array.isArray(p.recent) ? p.recent : [];
  if (recent.length) {
    lines.push('', 'A few recent moments (most recent first):');
    recent.forEach(m => {
      const when = typeof m.daysAgo === 'number' ? `${m.daysAgo}d ago` : 'earlier';
      const about = m.signal ? ` [${m.signal}]` : '';
      const did = m.response ? ` → ${m.response}` : '';
      lines.push(`  - (${when})${about} ${m.text || ''}${did}`.trimEnd());
    });
  }

  if (p.picture && p.picture.signal) {
    const k = p.picture.kind === 'pattern' ? 'a possible pattern' : 'something just starting to form';
    lines.push('', `The picture so far: ${k} around "${p.picture.signal}" — not a conclusion, and not to be stated as fact.`);
  }

  lines.push('', 'Reflect on this moment now, following every rule.');
  return lines.join('\n');
}

// keep only the fields we expect, bounded — never trust the client to be small or well-shaped
function clean(p) {
  const s = v => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');
  const m = o => ({
    text: s(o && o.text), signal: s(o && o.signal),
    reaction: s(o && o.reaction), response: s(o && o.response),
    daysAgo: o && typeof o.daysAgo === 'number' ? o.daysAgo : undefined,
  });
  return {
    lang: p && p.lang === 'en' ? 'en' : 'zh',
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

    if (!body.current.text)
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
    const text = (Array.isArray(parts) ? parts.map(p => p.text || '').join('') : '').trim();

    if (!text) return json({ error: 'empty reflection' }, 502, cors);

    // count this successful reflection against today's allowance
    if (env.RL && rlk) await env.RL.put(rlk, String(used + 1), { expirationTtl: RL_TTL });

    return json({ reflection: text }, 200, cors);
  },
};
