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

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## Configuration

Copy `.env.example` to `.env` and fill in the values you want to use.

### Gemini

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

### OpenAI-compatible

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

The browser settings panel can override these values for the current device.
