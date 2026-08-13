/* =====================================================================
   PATTERNA reflection proxy — a tiny Cloudflare Worker.

   It holds your Anthropic API key server-side and turns one captured
   moment (plus a little recent context) into a short, reflective note.
   The app calls this; the key never reaches the browser.

   What it deliberately does NOT do: store anything, log the content,
   or accept anything other than a single reflection request.

   Secrets / vars (set with `wrangler secret put` and wrangler.toml):
     ANTHROPIC_API_KEY  (secret, required)
     ALLOWED_ORIGIN     (var, strongly recommended — comma-separated
                         list of origins allowed to call this Worker.
                         Unset = "*", which lets anyone spend your key.)
     MODEL              (var, optional — defaults below)
     APP_TOKEN          (secret, optional — a soft shared guard; see README)
   ===================================================================== */

const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 320;
const MAX_TEXT = 320;     // per-field character cap we accept from the client
const MAX_RECENT = 12;    // most recent moments we'll consider

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

    if (!env.ANTHROPIC_API_KEY)
      return json({ error: 'server missing ANTHROPIC_API_KEY' }, 500, cors);

    let body;
    try { body = clean(await request.json()); }
    catch (e) { return json({ error: 'bad request' }, 400, cors); }

    if (!body.current.text)
      return json({ error: 'nothing to reflect on' }, 400, cors);

    let upstream;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.MODEL || DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0.7,
          system: systemPrompt(body.lang),
          messages: [{ role: 'user', content: userMessage(body) }],
        }),
      });
    } catch (e) {
      return json({ error: 'upstream unreachable' }, 502, cors);
    }

    if (!upstream.ok) {
      // surface the status, never the key or full upstream body
      return json({ error: `model error ${upstream.status}` }, 502, cors);
    }

    let data;
    try { data = await upstream.json(); } catch (e) { return json({ error: 'bad upstream' }, 502, cors); }
    const text = (data && Array.isArray(data.content) ? data.content : [])
      .filter(b => b && b.type === 'text').map(b => b.text).join('').trim();

    if (!text) return json({ error: 'empty reflection' }, 502, cors);
    return json({ reflection: text }, 200, cors);
  },
};
