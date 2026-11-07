import assert from "node:assert/strict";
import test from "node:test";
import Groq from "groq-sdk";
import {
  AnswerGenerationError,
  createGroqAnswerService,
  toAnswerGenerationError,
} from "./groq-answer.service.js";

const MODEL = "openai/gpt-oss-20b";

function createSseResponse(chunks: string[], finishReason: string | null = null): Response {
  const messages = chunks
    .map((content) => {
      const payload = {
        id: "completion-1",
        object: "chat.completion.chunk",
        created: 1,
        model: MODEL,
        choices: [{ index: 0, delta: { content }, finish_reason: null }],
      };
      return `data: ${JSON.stringify(payload)}\n\n`;
    })
    .join("");
  const finalMessage = finishReason
    ? `data: ${JSON.stringify({
        id: "completion-1",
        object: "chat.completion.chunk",
        created: 1,
        model: MODEL,
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      })}\n\n`
    : "";

  return new Response(`${messages}${finalMessage}data: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

test("validates the configured model and forwards streaming tokens progressively", async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    requests.push({ url, body });

    if (url.endsWith("/models")) {
      return Response.json({
        object: "list",
        data: [{ id: MODEL, object: "model", created: 1, owned_by: "groq" }],
      });
    }

    return createSseResponse(["Hello ", "from Groq."]);
  };
  const service = createGroqAnswerService("test-key", MODEL, fetcher);
  const tokens: string[] = [];

  await service.streamAnswer({
    messages: [
      { role: "system", content: "System instructions." },
      { role: "user", content: "Built an internal search service." },
    ],
    signal: new AbortController().signal,
    onToken: (token) => tokens.push(token),
  });

  assert.deepEqual(tokens, ["Hello ", "from Groq."]);
  assert.equal(requests.length, 2);
  assert.ok(requests[0]?.url.endsWith("/models"));
  const request = JSON.parse(requests[1]!.body) as {
    model: string;
    stream: boolean;
    max_completion_tokens: number;
    reasoning_effort?: string;
    include_reasoning?: boolean;
    messages: Array<{ role: string; content: string }>;
  };
  assert.equal(request.model, MODEL);
  assert.equal(request.stream, true);
  assert.equal(request.max_completion_tokens, 700);
  assert.equal(request.reasoning_effort, "low");
  assert.equal(request.include_reasoning, false);
  assert.match(request.messages[1]?.content ?? "", /Built an internal search service/);
});

test("reports a completion stopped by the model output limit", async () => {
  const fetcher: typeof fetch = async (input) =>
    String(input).endsWith("/models")
      ? Response.json({
          object: "list",
          data: [{ id: MODEL, object: "model", created: 1, owned_by: "groq" }],
        })
      : createSseResponse(["A partial answer"], "length");
  const service = createGroqAnswerService("test-key", MODEL, fetcher);
  const tokens: string[] = [];

  await assert.rejects(
    service.streamAnswer({
      messages: [
        { role: "system", content: "System instructions." },
        { role: "user", content: "What is RAG?" },
      ],
      signal: new AbortController().signal,
      onToken: (token) => tokens.push(token),
    }),
    (error: unknown) =>
      error instanceof AnswerGenerationError &&
      error.message.includes("output limit") &&
      error.code === "provider",
  );
  assert.deepEqual(tokens, ["A partial answer"]);
});

test("returns a clear model-unavailable error when the account cannot use the configured model", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({
      object: "list",
      data: [{ id: "some-other-model", object: "model", created: 1, owned_by: "groq" }],
    });
  const service = createGroqAnswerService("test-key", MODEL, fetcher);

  await assert.rejects(
    service.streamAnswer({
      messages: [
        { role: "system", content: "System instructions." },
        { role: "user", content: "What is RAG?" },
      ],
      signal: new AbortController().signal,
      onToken: () => {},
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("not available to this API key"),
  );
});

test("maps Groq rate limits to a user-facing error", () => {
  const error = toAnswerGenerationError(
    new Groq.RateLimitError(429, { error: "limited" }, "rate limited", new Headers()),
  );
  assert.equal(error.code, "rate_limit");
});

test("maps authentication, timeout, and interrupted connection failures to safe messages", () => {
  const authentication = toAnswerGenerationError(
    new Groq.AuthenticationError(401, { error: "secret provider detail" }, "unauthorized", new Headers()),
  );
  const timeout = toAnswerGenerationError(new Groq.APIConnectionTimeoutError());
  const interrupted = toAnswerGenerationError(
    new Groq.APIConnectionError({ message: "connection interrupted with credential detail" }),
  );

  assert.equal(authentication.code, "authentication");
  assert.doesNotMatch(authentication.message, /secret provider detail|unauthorized/);
  assert.equal(timeout.code, "timeout");
  assert.equal(interrupted.code, "provider");
  assert.doesNotMatch(interrupted.message, /credential detail|interrupted/);
});

test("handles an invalid Groq API key without exposing provider response details", async () => {
  const service = createGroqAnswerService(
    "test-key",
    MODEL,
    async () => Response.json(
      { error: "secret provider detail" },
      { status: 401 },
    ),
  );

  await assert.rejects(
    service.streamAnswer({
      messages: [
        { role: "system", content: "System instructions." },
        { role: "user", content: "What is RAG?" },
      ],
      signal: new AbortController().signal,
      onToken: () => {},
    }),
    (error: unknown) =>
      error instanceof AnswerGenerationError &&
      error.code === "authentication" &&
      !error.message.includes("secret provider detail"),
  );
});
