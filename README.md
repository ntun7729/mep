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
npm run secrets:bulk
npm run deploy
```

After deployment, Wrangler prints the Worker URL.

## Cloudflare secrets from `.env`

Keep your real values in `.env`. The file is already ignored by Git and can be uploaded to Cloudflare in one step:

```bash
npm run secrets:bulk
```

That script runs:

```bash
wrangler secret bulk .env
```

Example `.env` values:

```bash
DEFAULT_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=your_openai_compatible_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

Only include the values you need. Do not commit `.env`.

## Configuration

Copy `.env.example` to `.env` and fill in the values you want to use for the Node.js server and Cloudflare secrets.

### Gemini

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

### OpenAI-compatible

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

The browser settings panel can override these values for the current device.
