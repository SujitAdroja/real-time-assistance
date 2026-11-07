# Real-Time Interview Assistant

A browser-based assistant for interview practice and live interview support. It captures microphone audio, transcribes the conversation, detects interviewer questions, and streams suggested answers while the interview is in progress.

## How it works

- **Frontend:** Next.js and React provide the dashboard, microphone controls, transcript, detected questions, streamed answers, candidate context, and response timing.
- **Backend:** Express and WebSocket handle the interview session and keep provider credentials off the browser.
- **Speech recognition:** The browser streams microphone audio to the backend, which uses **Deepgram Nova-3** for real-time transcription.
- **Question detection:** The backend uses a rule-based classifier to identify questions in finalized transcript segments.
- **Answer generation:** The backend sends detected questions and relevant candidate context to **Groq**, then streams generated answer text to the dashboard. The configured Groq model must be available to your account and support chat completions.
- **Candidate context:** Resume, job description, and recent relevant answers can help ground suggestions. Session context is kept in backend memory and is cleared when the WebSocket session ends; it is not stored in a database.

Answers are AI-generated suggestions and may need review. They should not be treated as verified facts about a candidate's experience.

## Requirements

- Node.js 20.9 or later
- npm
- Deepgram and Groq API keys for live transcription and answer generation
- A modern browser with microphone access (localhost is suitable for development)

## Setup

From the project root, install both applications' dependencies:

```bash
npm --prefix web install
npm --prefix server install
```

Create the backend environment file:

```bash
cp server/.env.example server/.env
```

Add your API keys to `server/.env`:

```env
PORT=4000
DEEPGRAM_API_KEY=your_deepgram_api_key
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
```

Replace the placeholder values with your keys. The model shown matches the server example; choose a chat-completion model enabled for your Groq account if that model is unavailable. If `GROQ_MODEL` is omitted, the server uses `openai/gpt-oss-20b` as its default. Keep both API keys in `server/.env`; do not put them in frontend environment variables or commit them.

The frontend connects to `ws://localhost:4000/ws` by default. For a different backend address, copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_WS_URL`. This value is bundled into the browser, so it must not contain secrets. The local `.env` files are ignored by Git.

## Run in development

Run the backend and frontend in separate terminals from the project root:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Open <http://localhost:3000>, allow microphone access, and start recording. The backend listens on port `4000` by default. Check its health endpoint at <http://localhost:4000/health>.

## Production build

Build both applications:

```bash
npm run build:server
npm run build:web
```

Then start them in separate terminals:

```bash
npm --prefix server start
```

```bash
npm --prefix web start
```

The production frontend is available at <http://localhost:3000>. Set `NEXT_PUBLIC_WS_URL` before building the frontend if the backend WebSocket is not at its default address.

## Checks

```bash
npm --prefix server test
npm run build:server
npm --prefix web run lint
npm run build:web
```

Live provider behavior requires working API keys, network access, and microphone permission. Automated checks do not validate live Deepgram or Groq credentials.
