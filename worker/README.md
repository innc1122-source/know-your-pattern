# PATTERNA reflection backend

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) that holds
one **Google Gemini** API key and turns a captured moment into a short reflective
note. The app calls this Worker; **the key never reaches the browser**, so nobody
using the app needs a key of their own.

This is what makes AI reflection a product feature rather than a setting: you
deploy this once, point the app at it, and it works for everyone — capped at a
few reflections per person per day.

## What reaches the model

Only the current moment plus a small window of recent moments — each as
text + the plain-language labels the person picked (what it was about, their
reaction, what they did). **"Bright" light notes are never sent**, and nothing is
stored or logged, here or by this Worker.

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
the site — the reflect button then appears for everyone, no key-pasting.

## Configuration

Set in `wrangler.toml` under `[vars]` (redeploy to apply):

| name | what it does |
| --- | --- |
| `ALLOWED_ORIGIN` | Comma-separated origins allowed to call the Worker. Point it at wherever the app is served. Leaving it `*` lets **anyone** who finds the URL spend your key. |
| `MODEL` | Any Gemini model id. Default `gemini-2.0-flash` — free-tier eligible and fast. |

Secrets (via `wrangler secret put`, never in the repo):

| name | what it does |
| --- | --- |
| `GEMINI_API_KEY` | Required. Your free Google AI Studio key. |
| `APP_TOKEN` | Optional. If set, the Worker requires a matching `x-app-token` header. |

## The daily cap — enable server-side enforcement

The app limits each person to `5` reflections a day, but that count lives in the
browser and a determined user can reset it. This Worker enforces the same cap
**server-side**, keyed by client IP, so the shared key can't be drained — it turns
on the moment a [KV namespace](https://developers.cloudflare.com/kv/) named `RL` is
bound:

```sh
wrangler kv namespace create RL
# paste the printed id into wrangler.toml (uncomment the [[kv_namespaces]] block)
wrangler deploy
```

With `RL` bound, a person over the cap gets a `429` and the app shows
"come back tomorrow". Notes:

- The counter is **eventually consistent**, so a rapid burst can slip a couple over
  `5` — fine for an abuse cap, not a hard boundary.
- KV's free tier allows ~1k writes/day (≈ 200 people/day at 5 each); enable a paid
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
