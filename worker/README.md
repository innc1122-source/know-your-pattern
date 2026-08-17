# PATTERNA reflection backend

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) that holds
one **Google Gemini** API key and answers a moment the person just recorded. The app calls this Worker; **the key never reaches the browser**, so nobody
using the app needs a key of their own.

This is what makes AI reflection a product feature rather than a setting: you
deploy this once, point the app at it, and it works for everyone — three free
reflections per person per day.

## Two kinds, matching the app's two doors

| `kind` | door | what it gets | what it does |
| --- | --- | --- | --- |
| `moment` | 被绊到的瞬间 — the ones that snag you | that moment, its labels, and a few recent moments | mirrors it back, at most one gentle question |
| `note` | 被打动的瞬间 — the ones that move you | **only** the single line they just kept | one appreciative-inquiry question or statement |

The two never mix. A kept line travels alone — no signals, no history, nothing to
pattern it against — because that side of the app is never analysed. A moment read
never carries kept lines.

The reflection is always opt-in and never automatic: it exists only if the person
taps for it, and on the snag door it sits *beside* "done" rather than in front of
it, so setting the moment down without asking stays a first-class choice.

Nothing is stored or logged, here or by this Worker.

## Deploy (about 5 minutes)

You need a [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is
fine) and a **free** [Google AI Studio API key](https://aistudio.google.com/apikey).

```sh
npm install -g wrangler
cd worker
wrangler login

# your Gemini key — stored as an encrypted secret, never in the repo
wrangler secret put GEMINI_API_KEY

# optional soft guard (see note below)
# wrangler secret put APP_TOKEN

wrangler deploy
```

`wrangler deploy` prints a URL like `https://patterna-reflect.<you>.workers.dev`.
Put that URL into the app's `AI_ENDPOINT` constant (in `src/ui.js`) and redeploy
the site — the reflect button then appears on both doors for everyone, no
key-pasting.

## Configuration

Set in `wrangler.toml` under `[vars]` (redeploy to apply):

| name | what it does |
| --- | --- |
| `ALLOWED_ORIGIN` | Comma-separated origins allowed to call the Worker. Point it at wherever the app is served. Leaving it `*` lets **anyone** who finds the URL spend your key. |
| `MODEL` | Any Gemini model id. Default `gemini-flash-lite-latest`. Prefer a `-latest` alias: dated ids get retired and start 404ing. |

Secrets (via `wrangler secret put`, never in the repo):

| name | what it does |
| --- | --- |
| `GEMINI_API_KEY` | Required. Your free Google AI Studio key. |
| `APP_TOKEN` | Optional. If set, the Worker requires a matching `x-app-token` header. |

## The daily cap — enable server-side enforcement

The app limits each person to `3` reflections a day, but that count lives in the
browser and a determined user can reset it. This Worker enforces the same cap
**server-side**, keyed by client IP, so the shared key can't be drained — it turns
on the moment a [KV namespace](https://developers.cloudflare.com/kv/) named `RL` is
bound:

Already done for this deployment — the namespace is created and bound in
`wrangler.toml`. To set it up again elsewhere:

```sh
wrangler kv namespace create RL
# paste the printed id into the [[kv_namespaces]] block in wrangler.toml
wrangler deploy
```

With `RL` bound, a person over the cap gets a `429` and the app shows
"come back tomorrow". Notes:

- The counter is **eventually consistent**, so a rapid burst can slip a couple over
  `3` — fine for an abuse cap, not a hard boundary.
- KV's free tier allows ~1k writes/day (≈ 330 people/day at 3 each); enable a paid
  plan or move to Durable Objects to go beyond that.
- `DAILY_CAP` in `worker.js` is kept in step with the app's `AI_DAILY_CAP`.

The `ALLOWED_ORIGIN` / `APP_TOKEN` guards are still soft (a static site can't keep
a real secret); [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
is the sturdier gate for locking the endpoint down.

## Cost

On Gemini's **free tier** this is $0, within Google's per-key rate limits. Note:
on the free tier Google may use the content to improve its models — fine for a
reflective aside, but say so honestly if you productize it. Enabling billing lifts
the limits and stops that data use.
