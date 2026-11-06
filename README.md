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

`MediaRecorder` selects the first supported option from WebM with Opus, WebM, and Ogg with Opus. It may produce a browser-default format when none of those options are reported as supported. These recordings are compressed container formats, not raw PCM. Deepgram supports WebM, Ogg, and Opus audio in streaming transcription, so the backend forwards these containerized chunks without declaring a raw encoding or converting them to PCM.

### Troubleshooting

- **Permission denied:** allow microphone access for `localhost` in the browser site settings, then reload.
- **Unable to connect:** start the backend first and confirm `NEXT_PUBLIC_WS_URL` points to `ws://localhost:4000/ws`.
- **No chunks in the backend terminal:** speak for at least one second, then check that the browser reports `Connected` and `Recording`.
- **Unsupported recording format:** open the browser console and use a browser with `MediaRecorder` support. The page checks `MediaRecorder.isTypeSupported()` before requesting a preferred MIME type.

## Module 3: Deepgram real-time speech-to-text

The browser sends the existing `session-start` control message and binary MediaRecorder chunks to the backend. The backend opens a Deepgram Nova-3 Listen v1 stream, forwards the audio, then relays interim and final transcript events to the browser. The Deepgram API key is read only by the backend.

Configure the backend key locally:

```bash
cp server/.env.example server/.env
```

Set `DEEPGRAM_API_KEY` in `server/.env`. Do not put this key in a `NEXT_PUBLIC_` variable or in `web/.env.local`.

Run the applications in separate terminals from the project root:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Open <http://localhost:3000>, grant microphone access, and click **Start recording**. Speak several sentences with short pauses, then click **Stop recording**. Interim words appear in italics and may change; finalized segments remain in the final transcript. A finalized segment can arrive before the full utterance ends; the **Utterance ended** marker uses Deepgram's separate `speech_final` signal.

### Module 3 verification

- **Live transcript and multiple sentences:** speak several sentences. Verify interim text updates and finalized text accumulates without replacing earlier segments.
- **Stop:** click **Stop recording**. Recording stops and the STT status changes to **Closed** after the backend closes the Deepgram stream.
- **Permission denied:** block microphone access in browser site settings and click **Start recording**. The page should show the permission error and keep the microphone stopped.
- **Invalid API key:** temporarily set an invalid `DEEPGRAM_API_KEY` in `server/.env`, restart the backend, and start recording. The page should report a Deepgram connection error; the key remains server-only. Restore the valid key afterward.
- **Browser disconnect:** start recording, then close or reload the browser tab. The backend WebSocket close handler aborts startup or closes the active Deepgram session.
- **Restart:** after stopping, start a new recording and verify a new STT connection can be established.

Use the backend logs for provider connection errors. Live transcription scenarios require a valid Deepgram key, network access, and microphone access; the build alone does not validate provider credentials or transcription quality.

Build either app with `npm run build:web` or `npm run build:server` from the project root.
