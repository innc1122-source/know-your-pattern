# PATTERNA reflection proxy

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) that holds
your Anthropic API key and turns one captured moment into a short reflective note.
The app calls this Worker; **the key never reaches the browser.**

The app works completely without it. This is opt-in: until you set it up in the
app's settings, no reflection button appears and nothing ever leaves your device.

> **Just want it working for yourself?** You don't need this Worker at all. The
> app's settings also take an Anthropic key directly — it stays in your browser
> and calls the model itself, nothing to deploy. This Worker is the sturdier path
> for **hiding the key** once other people use it; it's the first step toward the
> multi-user / end-to-end phase.

## What leaves your device when you tap "reflect"

Only the current moment plus a small window of recent moments — each as
text + the plain-language labels you picked (what it was about, your reaction,
what you did). **Your "bright" light notes are never sent**, and nothing is
stored or logged, here or upstream.

## Deploy (about 5 minutes)

You need a [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is
fine) and an [Anthropic API key](https://console.anthropic.com/).

```sh
npm install -g wrangler
cd worker
wrangler login

# your key — stored as an encrypted secret, never in the repo
wrangler secret put ANTHROPIC_API_KEY

# optional soft guard (see note below)
# wrangler secret put APP_TOKEN

wrangler deploy
```

`wrangler deploy` prints a URL like `https://patterna-reflect.<you>.workers.dev`.
Open the app → **Me / 我** → **AI reflection**, paste that URL (and the token if you
set one), Save. Capture a moment and the reflect option appears.

## Configuration

Set in `wrangler.toml` under `[vars]` (redeploy to apply):

| name | what it does |
| --- | --- |
| `ALLOWED_ORIGIN` | Comma-separated origins allowed to call the Worker. Point it at wherever the app is served (e.g. your GitHub Pages origin, later your custom domain). Leaving it `*` lets **anyone** who finds the URL spend your key. |
| `MODEL` | Any Claude model id. Default `claude-sonnet-5`; drop to `claude-haiku-4-5-20251001` for cheaper/faster. |

Secrets (via `wrangler secret put`, never in the repo):

| name | what it does |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required. Your Anthropic key. |
| `APP_TOKEN` | Optional. If set, the Worker requires a matching `x-app-token` header, which the app sends from the token field in settings. |

## A note on protecting the endpoint

`ALLOWED_ORIGIN` and `APP_TOKEN` are **soft** guards: a static web app can't keep a
real secret, so a determined person reading the page source could copy the token
and call the Worker. For a personal, single-user setup that's an acceptable trade.
Before this is shared more widely, put real protection in front of it —
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/),
a rate limit, or moving auth to a real login — which is exactly the multi-user /
end-to-end phase this Worker is the first step toward.

## Cost

One reflection is a small prompt and a ≤320-token reply — cents at most for
personal use. Set a spend cap in the Anthropic console if you want a hard ceiling.
