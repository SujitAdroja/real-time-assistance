import assert from "node:assert/strict";
import test from "node:test";
import {
  AnswerQuestionDeduplicator,
  cancelActiveAnswers,
  runAnswerPipeline,
  type AnswerPipelineClock,
  type AnswerPipelineEvent,
} from "./answer-pipeline.service.js";
import { createGroqAnswerService } from "./groq-answer.service.js";
import { InterviewSessionMemory } from "./interview-session-memory.service.js";
import type { GroqAnswerService } from "./groq-answer.service.js";
import {
  QuestionDetectionSession,
  type QuestionDetectionEvent,
} from "./question-detection-session.js";

const MODEL = "openai/gpt-oss-20b";
const TIME_ORIGIN = 1_700_000_000_000;

function createClock(): AnswerPipelineClock {
  let time = 100;
  return {
    timeOrigin: TIME_ORIGIN,
    now: () => {
      const current = time;
      time += 50;
      return current;
    },
  };
}

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

function createMockGroq(
  chunks: string[],
  onCompletionRequest?: (body: string) => void,
): GroqAnswerService {
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return Response.json({
        object: "list",
        data: [{ id: MODEL, object: "model", created: 1, owned_by: "groq" }],
      });
    }

    if (typeof init?.body === "string") {
      onCompletionRequest?.(init.body);
    }
    return createSseResponse(chunks);
  };
  return createGroqAnswerService("test-key", MODEL, fetcher);
}

function makeEvents(): {
  events: AnswerPipelineEvent[];
  emit: (event: AnswerPipelineEvent) => void;
} {
  const events: AnswerPipelineEvent[] = [];
  return { events, emit: (event) => events.push(event) };
}

function question(
  id: string,
  text: string,
  completedAt = TIME_ORIGIN + 90,
) {
  return { id, text, category: "technical", completedAt };
}

test("runs detected question through mocked Groq streaming and stores completed answer with scoped metrics", async () => {
  const detectedEvents: QuestionDetectionEvent[] = [];
  const detectionSession = new QuestionDetectionSession(
    "integration",
    (event) => detectedEvents.push(event),
    () => TIME_ORIGIN + 90,
  );
  detectionSession.addFinalSegment({
    id: "segment-1",
    text: "What is RAG?",
    speechFinal: true,
  });
  const detectedQuestion = detectedEvents.find(
    (event) => event.type === "question:detected",
  );
  assert.ok(detectedQuestion && detectedQuestion.type === "question:detected");

  const memory = new InterviewSessionMemory();
  memory.updateCandidateContext({
    resume: "Built an internal search service.",
    jobDescription: "Backend engineer.",
  });
  let requestBody = "";
  const service = createMockGroq(["I built ", "search systems."], (body) => {
    requestBody = body;
  });
  const { events, emit } = makeEvents();

  const outcome = await runAnswerPipeline({
    question: {
      id: detectedQuestion.id,
      text: detectedQuestion.text,
      category: detectedQuestion.category,
      completedAt: detectedQuestion.detectedAt,
    },
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit,
    clock: createClock(),
  });

  assert.equal(outcome, "complete");
  assert.deepEqual(
    events.map((event) => event.type),
    ["answer:start", "answer:token", "answer:token", "answer:complete"],
  );
  assert.ok(
    events.every(
      (event) => "questionId" in event && event.questionId === detectedQuestion.id,
    ),
  );
  assert.ok(requestBody.includes("Built an internal search service."));
  assert.deepEqual(
    memory.getRecentConversation().map((turn) => turn.questionId),
    [detectedQuestion.id],
  );
  assert.equal(memory.getRecentConversation()[0]?.answer, "I built search systems.");

  const completion = events.at(-1);
  assert.equal(completion?.type, "answer:complete");
  if (completion?.type === "answer:complete") {
    assert.equal(completion.questionId, detectedQuestion.id);
    assert.equal(completion.questionCompletedAt, TIME_ORIGIN + 90);
    assert.equal(completion.llmRequestStartedAt, TIME_ORIGIN + 150);
    assert.equal(completion.firstTokenAt, TIME_ORIGIN + 200);
    assert.equal(completion.answerCompletedAt, TIME_ORIGIN + 250);
    assert.equal(completion.firstTokenLatencyMs, 110);
    assert.equal(completion.llmRequestLatencyMs, 50);
    assert.equal(completion.totalResponseTimeMs, 160);
  }
});

test("uses a safe fallback when the detected-question timestamp is missing or invalid", async () => {
  const memory = new InterviewSessionMemory();
  const { events, emit } = makeEvents();
  const service: GroqAnswerService = {
    async streamAnswer(input) {
      input.onToken("Answer.");
    },
  };

  await runAnswerPipeline({
    question: { ...question("q-missing-time", "What is RAG?"), completedAt: Number.NaN },
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit,
    clock: createClock(),
  });

  const completion = events.at(-1);
  assert.equal(completion?.type, "answer:complete");
  if (completion?.type === "answer:complete") {
    assert.equal(completion.questionCompletedAt, TIME_ORIGIN + 100);
    assert.ok(Number.isFinite(completion.firstTokenLatencyMs));
    assert.ok(Number.isFinite(completion.totalResponseTimeMs));
  }
});

test("failed Groq generation sends a safe error and does not store a completed turn", async () => {
  const memory = new InterviewSessionMemory();
  const { events, emit } = makeEvents();
  const service: GroqAnswerService = {
    async streamAnswer() {
      throw new Error("provider response contains secret-token");
    },
  };

  const outcome = await runAnswerPipeline({
    question: question("q-failed", "What is RAG?"),
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit,
    clock: createClock(),
  });

  assert.equal(outcome, "error");
  assert.deepEqual(memory.getRecentConversation(), []);
  const error = events.at(-1);
  assert.equal(error?.type, "answer:error");
  if (error?.type === "answer:error") {
    assert.equal(error.code, "provider");
    assert.doesNotMatch(error.message, /secret-token|provider response/);
  }
});

test("empty and interrupted streams are not stored as successful answers", async (t) => {
  await t.test("empty stream", async () => {
    const memory = new InterviewSessionMemory();
    const { events, emit } = makeEvents();
    const outcome = await runAnswerPipeline({
      question: question("q-empty", "What is RAG?"),
      memory,
      getService: () => createMockGroq([]),
      model: MODEL,
      signal: new AbortController().signal,
      emit,
      clock: createClock(),
    });

    assert.equal(outcome, "error");
    assert.deepEqual(memory.getRecentConversation(), []);
    assert.equal(events.at(-1)?.type, "answer:error");
  });

  await t.test("interrupted stream after a partial token", async () => {
    const memory = new InterviewSessionMemory();
    const { events, emit } = makeEvents();
    const service: GroqAnswerService = {
      async streamAnswer(input) {
        input.onToken("Partial output");
        throw new Error("stream interrupted");
      },
    };
    const outcome = await runAnswerPipeline({
      question: question("q-interrupted", "What is RAG?"),
      memory,
      getService: () => service,
      model: MODEL,
      signal: new AbortController().signal,
      emit,
      clock: createClock(),
    });

    assert.equal(outcome, "error");
    assert.deepEqual(memory.getRecentConversation(), []);
    assert.deepEqual(events.map((event) => event.type), [
      "answer:start",
      "answer:token",
      "answer:error",
    ]);
  });
});

test("resolves follow-up using previous question history in the generated prompt", async () => {
  const memory = new InterviewSessionMemory();
  memory.recordCompletedTurn({
    questionId: "q-kubernetes",
    question: "What is Kubernetes?",
    answer: "It orchestrates containers.",
    timestamp: 1,
  });
  let userPrompt = "";
  const service = createMockGroq(["I have not used it professionally."], (body) => {
    const parsed = JSON.parse(body) as {
      messages: Array<{ role: string; content: string }>;
    };
    userPrompt = parsed.messages[1]?.content ?? "";
  });
  const { emit } = makeEvents();

  const outcome = await runAnswerPipeline({
    question: question("q-follow-up", "How did you implement it?"),
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit,
    clock: createClock(),
  });

  assert.equal(outcome, "complete");
  assert.match(userPrompt, /Follow-up status: RESOLVED/);
  assert.match(userPrompt, /Referenced topic: Kubernetes/);
  assert.match(userPrompt, /What is Kubernetes\?/);
});

test("standalone questions omit unrelated conversation from the Groq prompt", async () => {
  const memory = new InterviewSessionMemory();
  memory.recordCompletedTurn({
    questionId: "q-rag",
    question: "What is RAG?",
    answer: "It augments prompts with retrieved content.",
    timestamp: 1,
  });
  let userPrompt = "";
  const service = createMockGroq(["JWT is a token format."], (body) => {
    const parsed = JSON.parse(body) as {
      messages: Array<{ role: string; content: string }>;
    };
    userPrompt = parsed.messages[1]?.content ?? "";
  });
  const { emit } = makeEvents();

  await runAnswerPipeline({
    question: question("q-jwt", "Explain JWT."),
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit,
    clock: createClock(),
  });

  assert.match(userPrompt, /No prior exchanges included/);
  assert.doesNotMatch(userPrompt, /What is RAG\?|augments prompts/);
});

test("ambiguous follow-up prompt instructs Groq to clarify instead of guessing", async () => {
  const memory = new InterviewSessionMemory();
  memory.recordCompletedTurn({
    questionId: "q-react",
    question: "What is React?",
    answer: "A UI library.",
    timestamp: 1,
  });
  memory.recordCompletedTurn({
    questionId: "q-kubernetes",
    question: "Explain Kubernetes.",
    answer: "A container orchestrator.",
    timestamp: 2,
  });
  let userPrompt = "";
  const service = createMockGroq(["Did you mean React or Kubernetes?"], (body) => {
    const parsed = JSON.parse(body) as {
      messages: Array<{ role: string; content: string }>;
    };
    userPrompt = parsed.messages[1]?.content ?? "";
  });
  const { emit } = makeEvents();

  await runAnswerPipeline({
    question: question("q-ambiguous", "What are its advantages?"),
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit,
    clock: createClock(),
  });

  assert.match(userPrompt, /Follow-up status: AMBIGUOUS/);
  assert.match(userPrompt, /Do not guess what the interviewer means/);
  assert.match(userPrompt, /q-react, q-kubernetes/);
});

test("deduplicates repeated question events before starting another pipeline", async () => {
  const memory = new InterviewSessionMemory();
  const deduplicator = new AnswerQuestionDeduplicator();
  let calls = 0;
  const service: GroqAnswerService = {
    async streamAnswer(input) {
      calls += 1;
      input.onToken("One answer.");
    },
  };
  const { emit } = makeEvents();
  const input = {
    question: question("q-duplicate", "What is RAG?"),
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit,
    clock: createClock(),
  };

  assert.equal(deduplicator.claim(input.question.id), true);
  await runAnswerPipeline(input);
  assert.equal(deduplicator.claim(input.question.id), false);
  assert.equal(calls, 1);
  assert.equal(memory.getRecentConversation().length, 1);
});

test("keeps answers associated correctly when several question events arrive rapidly", async () => {
  const memory = new InterviewSessionMemory();
  const service: GroqAnswerService = {
    async streamAnswer(input) {
      await Promise.resolve();
      input.onToken(`Answer for ${input.question}`);
    },
  };
  const questions = ["What is React?", "Explain JWT.", "What is RAG?", "How does OAuth work?"];
  const results = await Promise.all(
    questions.map(async (text, index) => {
      const { events, emit } = makeEvents();
      const outcome = await runAnswerPipeline({
        question: question(`q-rapid-${index}`, text),
        memory,
        getService: () => service,
        model: MODEL,
        signal: new AbortController().signal,
        emit,
        clock: createClock(),
      });
      return { outcome, events };
    }),
  );

  assert.ok(results.every(({ outcome }) => outcome === "complete"));
  for (const [index, result] of results.entries()) {
    const token = result.events.find((event) => event.type === "answer:token");
    assert.equal(token?.type, "answer:token");
    if (token?.type === "answer:token") {
      assert.equal(token.questionId, `q-rapid-${index}`);
      assert.equal(token.token, `Answer for ${questions[index]}`);
    }
  }
  assert.deepEqual(
    memory.getRecentConversation().map((turn) => turn.questionId).sort(),
    ["q-rapid-0", "q-rapid-1", "q-rapid-2", "q-rapid-3"],
  );
});

test("keeps concurrent WebSocket session memories isolated", async () => {
  const firstMemory = new InterviewSessionMemory();
  const secondMemory = new InterviewSessionMemory();
  firstMemory.updateCandidateContext({ resume: "Candidate one", jobDescription: "" });
  secondMemory.updateCandidateContext({ resume: "Candidate two", jobDescription: "" });
  const seenContexts: string[] = [];
  const createService = (answer: string): GroqAnswerService => ({
    async streamAnswer(input) {
      seenContexts.push(input.context.resume);
      input.onToken(answer);
    },
  });

  await Promise.all([
    runAnswerPipeline({
      question: question("q-one", "What did you build?"),
      memory: firstMemory,
      getService: () => createService("Answer one"),
      model: MODEL,
      signal: new AbortController().signal,
      emit: () => {},
      clock: createClock(),
    }),
    runAnswerPipeline({
      question: question("q-two", "What did you build?"),
      memory: secondMemory,
      getService: () => createService("Answer two"),
      model: MODEL,
      signal: new AbortController().signal,
      emit: () => {},
      clock: createClock(),
    }),
  ]);

  assert.deepEqual(seenContexts.sort(), ["Candidate one", "Candidate two"]);
  assert.equal(firstMemory.getRecentConversation()[0]?.answer, "Answer one");
  assert.equal(secondMemory.getRecentConversation()[0]?.answer, "Answer two");
});

test("cancels active answers on session stop without saving partial output", async () => {
  const memory = new InterviewSessionMemory();
  const controller = new AbortController();
  const controllers = new Map([["q-stop", controller]]);
  const { events, emit } = makeEvents();
  const service: GroqAnswerService = {
    async streamAnswer(input) {
      input.onToken("Partial");
      await new Promise<void>((resolve) => {
        input.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  };
  const generation = runAnswerPipeline({
    question: question("q-stop", "Explain RAG."),
    memory,
    getService: () => service,
    model: MODEL,
    signal: controller.signal,
    emit,
    clock: createClock(),
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  cancelActiveAnswers(controllers, emit, "Recording session stopped.");
  assert.equal(await generation, "cancelled");
  assert.deepEqual(memory.getRecentConversation(), []);
  assert.equal(events.at(-1)?.type, "answer:error");
});

test("bounds long context and history without truncating or silently accepting an oversized question", async () => {
  const memory = new InterviewSessionMemory();
  memory.updateCandidateContext({
    resume: "r".repeat(15_000),
    jobDescription: "j".repeat(15_000),
  });
  for (let index = 0; index < 8; index += 1) {
    memory.recordCompletedTurn({
      questionId: `q-${index}`,
      question: "What is RAG?",
      answer: "a".repeat(500),
      timestamp: index,
    });
  }
  let requestUserPrompt = "";
  const service = createMockGroq(["A bounded answer."], (body) => {
    const parsed = JSON.parse(body) as {
      messages: Array<{ role: string; content: string }>;
    };
    requestUserPrompt = parsed.messages[1]?.content ?? "";
  });
  const { emit } = makeEvents();

  const result = await runAnswerPipeline({
    question: question("q-long-context", "Why?"),
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit,
    clock: createClock(),
  });
  assert.equal(result, "complete");
  assert.ok(requestUserPrompt.length < 24_000);
  assert.match(requestUserPrompt, /Why\?/);
  assert.match(requestUserPrompt, /Reference text trimmed to the prompt budget/);
  assert.match(requestUserPrompt, /turn ID: q-6/);
  assert.match(requestUserPrompt, /turn ID: q-7/);
  assert.doesNotMatch(requestUserPrompt, /turn ID: q-5/);
  assert.equal(memory.getRecentConversation().length, 8);

  const oversizedEvents = makeEvents();
  const oversizedResult = await runAnswerPipeline({
    question: question("q-too-long", "q".repeat(2_001)),
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit: oversizedEvents.emit,
    clock: createClock(),
  });
  assert.equal(oversizedResult, "error");
  assert.equal(oversizedEvents.events.at(-1)?.type, "answer:error");
  assert.equal(
    memory.getRecentConversation().some((turn) => turn.questionId === "q-too-long"),
    false,
  );
});

test("clears in-memory context and history when a session ends", async () => {
  const memory = new InterviewSessionMemory();
  memory.updateCandidateContext({ resume: "Candidate data", jobDescription: "Role data" });
  const service: GroqAnswerService = {
    async streamAnswer(input) {
      input.onToken("Completed answer.");
    },
  };

  await runAnswerPipeline({
    question: question("q-cleanup", "What did you build?"),
    memory,
    getService: () => service,
    model: MODEL,
    signal: new AbortController().signal,
    emit: () => {},
    clock: createClock(),
  });
  memory.clear();

  assert.equal(memory.getAnswerContext().resume, "");
  assert.deepEqual(memory.getRecentConversation(), []);
});
