# Real-Time Interview Assistant POC

A two-day proof of concept using a separate Next.js frontend and Express backend. The applications are intentionally simple and run as separate Node processes.

## Requirements

- Node.js 20.9 or later
- npm

## Project structure

```text
web/       Next.js, React, TypeScript, and Tailwind CSS frontend
server/    Express and TypeScript backend
```

## Install dependencies

```bash
npm --prefix web install
npm --prefix server install
```

## Run in development

Open two terminals from the project root:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

The frontend is available at <http://localhost:3000>. The backend listens at <http://localhost:4000> by default.

To change the backend port, copy `server/.env.example` to `server/.env` and set `PORT`. To use a different WebSocket address in the frontend, copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_WS_URL`. These files are ignored by Git. `NEXT_PUBLIC_WS_URL` must contain no secrets because Next.js includes it in the browser bundle.

## Verify the setup

With both applications running, open <http://localhost:3000> and confirm the setup page loads. In another terminal, request the backend health endpoint:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{"status":"ok","service":"interview-assistant-server"}
```

## Milestone 2: microphone streaming

1. Start both applications.
2. Open <http://localhost:3000> in a modern browser over `localhost` or HTTPS.
3. Click **Start recording** and allow microphone access.
4. Speak for a few seconds, then click **Stop recording**.

The browser page shows WebSocket and recording state. The backend terminal should log a `session-start` message, several received audio chunk sizes, and a `session-stop` message. Browser microphone APIs require a secure context; `localhost` counts as secure for development.

`MediaRecorder` selects the first supported option from WebM with Opus, WebM, and Ogg with Opus. It may produce a browser-default format when none of those options are reported as supported. These recordings are compressed container formats, not raw PCM. Before adding an STT provider, confirm that its streaming endpoint accepts the exact MIME type shown on the page; otherwise, choose a provider-supported browser format or transcode audio on the backend.

### Troubleshooting

- **Permission denied:** allow microphone access for `localhost` in the browser site settings, then reload.
- **Unable to connect:** start the backend first and confirm `NEXT_PUBLIC_WS_URL` points to `ws://localhost:4000/ws`.
- **No chunks in the backend terminal:** speak for at least one second, then check that the browser reports `Connected` and `Recording`.
- **Unsupported recording format:** open the browser console and use a browser with `MediaRecorder` support. The page checks `MediaRecorder.isTypeSupported()` before requesting a preferred MIME type.

Build either app with `npm run build:web` or `npm run build:server` from the project root.
