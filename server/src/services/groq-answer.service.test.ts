import assert from "node:assert/strict";
import test from "node:test";
import Groq from "groq-sdk";
import {
  createGroqAnswerService,
  toAnswerGenerationError,
} from "./groq-answer.service.js";

const MODEL = "openai/gpt-oss-20b";

function createSseResponse(chunks: string[]): Response {
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

  return new Response(`${messages}data: [DONE]\n\n`, {
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
    question: "What is RAG?",
    context: {
      resume: "Built an internal search service.",
      jobDescription: "Backend engineer.",
      recentConversation: [],
    },
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
    messages: Array<{ role: string; content: string }>;
  };
  assert.equal(request.model, MODEL);
  assert.equal(request.stream, true);
  assert.ok(request.max_completion_tokens <= 250);
  assert.match(request.messages[1]?.content ?? "", /Built an internal search service/);
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
      question: "What is RAG?",
      context: { resume: "", jobDescription: "", recentConversation: [] },
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
