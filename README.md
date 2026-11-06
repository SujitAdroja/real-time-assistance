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

With both applications running, open <http://localhost:3000> and confirm the interview dashboard loads. In another terminal, request the backend health endpoint:

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

## Module 4: interview question detection

The backend runs a deterministic, rule-based classifier only after Deepgram marks transcript segments final and an utterance boundary arrives (`speech_final`, `UtteranceEnd`, or stream close). It joins finalized segments before classification and ignores interim results. Interview questions emit `question:detected`; every completed utterance also updates the panel's detection status. Small talk and non-question utterances are never shown as detected questions.

The rule score is a fixed strength assigned to the matching rule (for example, explicit behavioral patterns score higher than a generic WH-question). It is not a statistical confidence or a probability. Classification patterns are maintained in `server/src/services/question-detection.service.ts`; the classifier has no Deepgram, WebSocket, or UI dependency. `QuestionDetectionSession` adapts its results to the backend WebSocket event protocol.

Run the unit, completed-utterance, and WebSocket-event-adapter integration tests from the project root:

```bash
npm --prefix server test
```

Then build and lint both applications:

```bash
npm run build:server
npm run build:web
npm --prefix web run lint
```

To manually verify the integrated pipeline, start the backend and frontend using the Module 3 commands, start a recording, then speak a complete interview question such as “How would you design a scalable API?” and pause. Confirm the final transcript remains visible, the detection status updates, and the question panel displays the question with its category. Then speak “Good morning” or “Okay, let's move ahead” and confirm the status reflects an ignored social exchange or statement without replacing the latest detected question. Partial requests such as “Can you explain…” should not trigger detection until a completed utterance is received, and incomplete speech should not appear as a detected question. Stop recording and repeat with a new session to verify state resets cleanly.

This POC uses explainable patterns rather than an LLM; nuanced, compound, or context-dependent questions can be misclassified. Future improvements could add labeled evaluation examples, better utterance splitting, and optionally an LLM fallback for only ambiguous completed utterances. No answer generation is included.

## Module 5: Groq streaming answer generation

The backend starts answer generation directly when Module 4 emits `question:detected`. Groq's official Node.js SDK streams chat completion deltas to the backend, which sends `answer:start`, `answer:token`, `answer:complete`, or `answer:error` events to the same browser WebSocket. Every answer event carries its `questionId`. The backend checks the configured model against the models available to the API key before its first completion request; the actual streaming request also validates that the model supports chat streaming.

### Configure Groq

The API key is backend-only. Edit `server/.env` and add these entries without replacing your existing Deepgram settings:

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b
```

`GROQ_MODEL` is optional at runtime and defaults to `openai/gpt-oss-20b`; setting it explicitly makes the selected model clear. The selected default appears in Groq's current model/SDK documentation and is used here instead of deprecated Llama models. The backend checks whether the selected ID is returned for the configured key. Model availability and streaming access depend on Groq account permissions. If Groq does not list this model for your key, choose an active chat-completion model from [Groq's models list](https://console.groq.com/docs/models) that supports streaming and set its exact model ID in `GROQ_MODEL`.

Never put `GROQ_API_KEY` in `web/.env.local`, a `NEXT_PUBLIC_` variable, source code, or a committed file. `server/.env` is ignored by Git. Candidate context is entered in the dashboard and kept in the backend process memory only for the lifetime of that WebSocket connection; it is not saved to disk.

### Run and verify

Install the new backend dependency and start the backend and frontend in separate terminals from the project root:

```bash
npm --prefix server install
npm run dev:server
```

```bash
npm run dev:web
```

Open <http://localhost:3000>. Optionally expand **Candidate context**, paste resume and job description text, and click **Save context**. Start recording, ask a complete interview question and pause. The detected-question panel should show the question; the answer panel should show **Generating answer…** and append streamed text. Ask another question and confirm its answer stays associated with its own question ID.

Run the local tests and checks:

```bash
npm --prefix server test
npm run build:server
npm run build:web
npm --prefix web run lint
```

Test the error and context scenarios by temporarily using an invalid Groq key (restore the real key afterward), exceeding account rate limits if possible, and asking a question that is not supported by the resume. Errors should be shown for the corresponding answer only. The prompt tells the model not to invent personal experience and to explain a concept honestly when resume evidence is missing. Disconnecting the browser cancels in-progress requests. The UI also provides **Cancel answer** for an individual request. Groq request timeout is 30 seconds, automatic retries are disabled, and output is limited to 220 completion tokens.

### How the implementation works

- `prompt-builder.service.ts` keeps prompt construction separate. The system message specifies first-person, concise, accurate answers, STAR for behavioral questions, and explicitly treats resume/JD/history as untrusted reference data. A separate user message contains the question and bounded candidate context.
- `groq-answer.service.ts` uses the official `groq-sdk`, validates the model against the account's model list, requests `stream: true`, and forwards each text delta immediately. Groq's `GROQ_API_KEY` never leaves the backend.
- `answer:start` identifies the question before generation; each token and terminal event includes the same `questionId`. The client stores answer state by that ID, so concurrent streams cannot mix.
- Recent conversation is bounded per WebSocket session. Only history identified as relevant to a follow-up is sent to Groq; resume and job description are bounded and held in memory only.
- The server reports question-to-first-token latency, request-to-first-token latency, and question-to-completion time. A cold model availability check occurs before the timed completion request and is included in question-to-first-token latency.

The rules and prompt reduce fabrication but do not guarantee factual answers; model output still needs review. This POC uses simple in-memory session state, has no durable resume storage, and allows at most two concurrent answers per client connection. A later iteration could add stronger context validation, richer persistence controls, model evaluations, and user feedback. This module does not add answer history storage, database infrastructure, or RAG.

### Interview questions about Module 5

1. **Why stream completions?** Streaming lets the UI render answer text as Groq generates it rather than waiting for the full response.
2. **Why call Groq from the backend?** It keeps the API key out of browser code and lets the server control prompts, limits, and cancellation.
3. **What does the Prompt Builder do?** It creates separate system instructions and user reference data with explicit limits and trust boundaries.
4. **Why are resume and job description in the user message?** They are task-specific reference inputs, not authority to replace the system's behavior instructions.
5. **How is personal experience protected from fabrication?** The prompt makes the resume the source of truth and requires a transparent conceptual answer when experience is absent.
6. **How are tokens correlated with an answer?** Every start, token, completion, and error event carries the detected question's ID.
7. **How are concurrent answers handled?** The backend keeps separate controllers per question ID and caps active requests; the frontend updates each answer by ID.
8. **How are rate limits and invalid credentials handled?** SDK errors are mapped into safe `answer:error` messages; automatic retries are disabled to avoid hidden delays.
9. **How is time to first token measured?** The backend records question completion, Groq completion-request start, and the first non-empty streamed token. It uses a monotonic clock for durations and reports both question-to-token and request-to-token latency.
10. **What are the main trade-offs?** In-memory context is simple but temporary, rule-based question detection can be wrong, and prompt instructions cannot guarantee a model never hallucinates.

Build either app with `npm run build:web` or `npm run build:server` from the project root.

## Milestone 6: interview dashboard

The dashboard uses one shared WebSocket connection managed by `useInterviewWebSocket`. The header shows backend and transcription status; the recording card starts/stops the existing microphone session and displays its elapsed time and audio format. The responsive workspace places the accumulated final/interim transcript beside the latest detected question and streamed answers. Transcript auto-scroll pauses when the viewer scrolls up. Completed answers can be copied from the answer panel.

Start the applications in separate terminals from the project root:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Open <http://localhost:3000>. Verify the Backend indicator connects, start and stop a microphone session, and confirm the timer and recording status update. Speak a complete interview question and confirm that the transcript, detected-question panel, and matching streamed answer update without refreshing. Scroll up in a longer transcript to confirm new text does not force the view back to the bottom. Use **Copy answer** after generation completes. For failure handling, deny microphone permission or stop the backend and confirm the dashboard shows a readable error while remaining usable.

Run the available automated checks:

```bash
npm --prefix server test
npm run build:server
npm run build:web
npm --prefix web run lint
```

The dashboard does not add another WebSocket, answer-generation path, or persistence layer. It presents the existing session protocol and Module 1–5 services; live microphone, Deepgram, and Groq behavior still requires manual verification with working credentials and browser permissions.

## Milestone 7: candidate context and conversation memory

The existing Candidate Context section accepts resume and job-description text, reports its save/empty/error state, and can clear the saved text. The backend validates each field against a 15,000-character limit; empty fields are allowed and clear the corresponding reference. Context changes take effect for the next answer on that same WebSocket session. Inputs are never logged or truncated silently at save time.

Each WebSocket connection owns an isolated `InterviewSessionMemory`. It stores up to eight completed, non-empty Q&A turns with question ID, original question, answer, completion timestamp, and detected category. Duplicate question IDs are ignored, failed or empty answer generations are not stored, and the memory is cleared when that WebSocket connection ends. Stopping microphone capture closes the Deepgram stream but leaves the WebSocket interview session alive, so a pause and restart can retain its context and completed turns. Reconnecting creates a fresh session; the browser clears old context rather than reapplying stale data.

The follow-up resolver recognizes short/contextual forms such as “Why?”, “What are its disadvantages?”, “How did you implement that?”, and “Can you explain further?” It returns a structured `RESOLVED`, `AMBIGUOUS`, or `STANDALONE` result with referenced turn IDs. Standalone questions receive no previous exchanges; ambiguous references instruct Groq to ask a short clarification question. Generated answers are labeled AI-generated and unverified, and cannot be used as evidence of candidate experience.

Context limits are applied at two stages: each stored resume/JD field is limited to 15,000 characters, while prompt reference budgets cap resume at 8,000 characters, job description at 6,000, each history field at 1,000, and relevant history at two exchanges. The complete system-plus-user prompt is capped at 24,000 characters. Truncated reference text includes an explicit notice. The current question is never silently truncated; empty questions and questions over 2,000 characters receive an answer error instead.

Run the automated checks:

```bash
npm --prefix server test
npm run build:server
npm --prefix web run lint
./web/node_modules/.bin/tsc --noEmit --project web/tsconfig.json
npm run build:web
```

For manual verification, save resume/JD text before or during a live session and confirm the save status. Ask a question supported by the resume, then a short follow-up such as “What are its disadvantages?” and verify the prior exchange informs that answer. Ask an unrelated standalone question and confirm old exchange text is not added as relevant history. Clear context and verify the empty status; disconnect/reload and confirm context does not carry into the new WebSocket session.

## Module 8: latency, reliability, and testing

### Architecture and data flow

The browser captures microphone audio with `MediaRecorder` and sends binary chunks over the shared WebSocket. The backend forwards them to Deepgram, sends finalized transcript events through the existing question detector, and starts a per-question answer pipeline when `question:detected` fires. The pipeline snapshots that WebSocket's candidate context and completed conversation, resolves follow-ups, builds the bounded prompt through `GroqAnswerService`, forwards tokens under the same `questionId`, then stores only non-empty answers after successful completion. The dashboard updates each answer by ID and shows its generation status and metrics. WebSocket disconnect clears session memory; stopping recording cancels active answer generations but retains the WebSocket-scoped context for a later recording.

### Latency metrics

The existing `answer:complete` event retains `totalMs` and `timeToFirstTokenMs` for compatibility and adds timestamp fields and `llmRequestLatencyMs`. Metrics are associated with the event's `questionId`:

- **First-token latency:** first token minus completed-question time.
- **LLM request latency:** first token minus the start of the Groq completion request. Initial model availability validation occurs before this request start.
- **Total response time:** answer completion minus completed-question time.

Timestamp fields use a monotonic, epoch-aligned clock; duration differences use `performance.now()` so wall-clock adjustments do not distort elapsed times. If a metric is missing, the UI displays it as unavailable instead of inventing a value. A sub-three-second first token is a goal, not a guarantee; provider, network, and cold model-validation time affect it.

### Error handling and resource cleanup

Deepgram connection failures are mapped to understandable STT errors without exposing provider response details. Groq authentication, rate-limit, timeout, model, and connection failures use safe answer errors. An empty stream is a failed answer, partial output from a failed/interrupted stream is not saved to memory, and stopping recording or closing the WebSocket aborts active answer controllers. A stop with no audio received reports an actionable STT error. Browser microphone permission and device failures are shown in the recording controls. Answer start, token, completion, and error messages remain question-ID scoped; late tokens cannot update a completed or different answer.

The UI does not reconnect automatically. Starting another recording attempts to reconnect; a new WebSocket connection starts a fresh in-memory session. There is no live API call in the automated test suite.

### Prerequisites and environment

- Node.js 20.9 or later and npm.
- A Deepgram API key and a Groq API key for live transcription and answer generation.
- A browser with `MediaRecorder` and microphone access (localhost or HTTPS).

Install dependencies from the repository root:

```bash
npm --prefix web install
npm --prefix server install
```

Copy `server/.env.example` to `server/.env`, then set `DEEPGRAM_API_KEY` and `GROQ_API_KEY`. `PORT` defaults to `4000`; `GROQ_MODEL` defaults to `openai/gpt-oss-20b`. Optionally copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_WS_URL` (default `ws://localhost:4000/ws`). API keys must remain in the backend environment and must not be added to browser variables or committed files.

Start the applications in separate terminals:

```bash
npm run dev:server
npm run dev:web
```

Open <http://localhost:3000>, allow microphone access, optionally save candidate context, start recording, and ask a complete interview question. Confirm the transcript and detected question appear, answer tokens stream, and completed-answer timing appears. Stop recording during an answer to verify cancellation; stop without sending microphone data to verify the no-audio error. To test reconnect behavior, reload the page or start a new recording after the socket disconnects; context does not carry over to a new WebSocket session.

### Automated testing

The backend suite includes mocked Groq streaming and answer-pipeline integration coverage for successful, failed, empty, interrupted, follow-up, standalone, ambiguous, duplicate, concurrent-session, cancellation, cleanup, and long-context cases. No automated test calls Deepgram or Groq live. The web package has no configured test script.

Run all configured checks from the repository root:

```bash
npm --prefix server test
npm --prefix server run build
npm --prefix web run lint
./web/node_modules/.bin/tsc --noEmit --project web/tsconfig.json
npm run build:web
```

### Known limitations and privacy

Resume, job description, and prompt budgets are character-based rather than provider-token-based. The current bounded limits (15,000 characters per saved field, 8,000 resume characters, 6,000 job-description characters, eight stored turns, two prompt-history turns, 2,000 question characters, and 24,000 total prompt characters) were retained; adding a tokenizer dependency is not justified for this small POC. The current question is rejected if it exceeds its limit and is never silently truncated. Character counts can differ from provider token counts, so the provider can still reject an unusually token-dense prompt.

Context and conversation memory live only in backend process memory, scoped to a WebSocket, and are not written to disk. API keys stay server-side; logs do not include full resume/JD contents or API keys. Automated tests cover the answer pipeline and memory but not real browser permission dialogs, live Deepgram behavior, or live Groq availability. Reconnection is user-triggered rather than automatic, and first-token performance depends on network/provider conditions.
