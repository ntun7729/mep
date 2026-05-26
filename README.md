# MEPT Listening Simulator

Mobile-first Node.js web app for MEPT Section IV listening practice.

## Features

- Four listening task modes plus a summary screen
- Continuous playback flow using browser speech synthesis
- Local provider settings saved in the browser
- Server-side AI exam generation for:
  - Gemini
  - OpenAI-compatible chat completion APIs
- Environment fallbacks for API keys and model settings
- Cloudflare Workers deployment support with Wrangler

## Run locally with Node.js

```bash
npm start
```

Open `http://localhost:3000`.

## Run locally with Wrangler

```bash
npm install
npm run worker:dev
```

Wrangler serves the static files in `public/` and the Worker API from `src/worker.js`.

## Deploy to Cloudflare Workers

```bash
npm install
npx wrangler login
npm run deploy
```

After deployment, Wrangler prints the Worker URL.

## Cloudflare secrets

Use Wrangler secrets for server-side provider defaults:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_BASE_URL
npx wrangler secret put GEMINI_MODEL
npx wrangler secret put OPENAI_MODEL
```

Only set the secrets you need. The browser settings panel can still override provider values for the current device.

## Configuration

Copy `.env.example` to `.env` and fill in the values you want to use for the Node.js server.

### Gemini

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

### OpenAI-compatible

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

The browser settings panel can override these values for the current device.
