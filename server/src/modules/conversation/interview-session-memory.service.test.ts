import assert from "node:assert/strict";
import test from "node:test";
import {
  CandidateContextValidationError,
  InterviewSessionMemory,
  MAX_CANDIDATE_CONTEXT_CHARS,
  MAX_SESSION_HISTORY_TURNS,
  rememberAfterSuccessfulGeneration,
} from "./interview-session-memory.service.js";

test("validates and updates resume and job description, including empty context", () => {
  const memory = new InterviewSessionMemory();
  assert.deepEqual(memory.getCandidateContextStatus(), {
    hasResume: false,
    hasJobDescription: false,
    resumeCharacters: 0,
    jobDescriptionCharacters: 0,
  });

  assert.deepEqual(
    memory.updateCandidateContext({
      resume: "  TypeScript engineer  ",
      jobDescription: " Backend role ",
    }),
    {
      hasResume: true,
      hasJobDescription: true,
      resumeCharacters: 19,
      jobDescriptionCharacters: 12,
    },
  );
  assert.equal(memory.getAnswerContext().resume, "TypeScript engineer");

  memory.updateCandidateContext({ resume: "", jobDescription: "" });
  assert.equal(memory.getAnswerContext().jobDescription, "");
  assert.equal(memory.getCandidateContextStatus().hasResume, false);
});

test("rejects oversized candidate context without replacing the saved values", () => {
  const memory = new InterviewSessionMemory();
  memory.updateCandidateContext({ resume: "Existing resume", jobDescription: "" });

  assert.throws(
    () =>
      memory.updateCandidateContext({
        resume: "r".repeat(MAX_CANDIDATE_CONTEXT_CHARS + 1),
        jobDescription: "",
      }),
    CandidateContextValidationError,
  );
  assert.equal(memory.getAnswerContext().resume, "Existing resume");

  assert.throws(
    () =>
      memory.updateCandidateContext({
        resume: "",
        jobDescription: "j".repeat(MAX_CANDIDATE_CONTEXT_CHARS + 1),
      }),
    CandidateContextValidationError,
  );
});

test("stores bounded completed turns with metadata and rejects duplicates or incomplete turns", () => {
  const memory = new InterviewSessionMemory();
  assert.equal(
    memory.recordCompletedTurn({
      questionId: "q-1",
      question: "What is RAG?",
      answer: "Retrieval-augmented generation.",
      timestamp: 123,
      topic: "technical",
    }),
    true,
  );
  assert.equal(
    memory.recordCompletedTurn({
      questionId: "q-1",
      question: "What is RAG?",
      answer: "Duplicate",
      timestamp: 124,
    }),
    false,
  );
  assert.equal(
    memory.recordCompletedTurn({
      questionId: "q-empty",
      question: "Why?",
      answer: " ",
      timestamp: 125,
    }),
    false,
  );
  assert.deepEqual(memory.getRecentConversation()[0], {
    questionId: "q-1",
    question: "What is RAG?",
    answer: "Retrieval-augmented generation.",
    answerSource: "AI_GENERATED_UNVERIFIED",
    timestamp: 123,
    topic: "technical",
  });

  for (let index = 0; index < MAX_SESSION_HISTORY_TURNS + 2; index += 1) {
    memory.recordCompletedTurn({
      questionId: `q-${index + 2}`,
      question: `Question ${index}`,
      answer: `Answer ${index}`,
      timestamp: index,
    });
  }
  const turns = memory.getRecentConversation();
  assert.equal(turns.length, MAX_SESSION_HISTORY_TURNS);
  assert.equal(turns.at(-1)?.question, `Question ${MAX_SESSION_HISTORY_TURNS + 1}`);
});

test("keeps memory isolated and clears context and turns at session end", () => {
  const firstSession = new InterviewSessionMemory();
  const secondSession = new InterviewSessionMemory();
  firstSession.updateCandidateContext({ resume: "Private candidate data", jobDescription: "" });
  firstSession.recordCompletedTurn({
    questionId: "q-1",
    question: "What is RAG?",
    answer: "A retrieval technique.",
    timestamp: 1,
  });

  assert.equal(secondSession.getAnswerContext().resume, "");
  assert.deepEqual(secondSession.getRecentConversation(), []);
  firstSession.clear();
  assert.equal(firstSession.getAnswerContext().resume, "");
  assert.deepEqual(firstSession.getRecentConversation(), []);
});

test("records an answer only after successful, non-empty generation", async () => {
  const memory = new InterviewSessionMemory();
  let answer = "";

  await assert.rejects(
    rememberAfterSuccessfulGeneration(
      memory,
      {
        questionId: "q-failed",
        question: "What is RAG?",
        getAnswer: () => answer,
      },
      async () => {
        answer = "Partial answer";
        throw new Error("provider failed");
      },
      () => 10,
    ),
    /provider failed/,
  );
  assert.deepEqual(memory.getRecentConversation(), []);

  await rememberAfterSuccessfulGeneration(
    memory,
    {
      questionId: "q-empty",
      question: "What is RAG?",
      getAnswer: () => "",
    },
    async () => undefined,
    () => 11,
  );
  assert.deepEqual(memory.getRecentConversation(), []);

  answer = "Completed answer";
  await rememberAfterSuccessfulGeneration(
    memory,
    {
      questionId: "q-complete",
      question: "What is RAG?",
      topic: "technical",
      getAnswer: () => answer,
    },
    async () => undefined,
    () => 12,
  );
  await rememberAfterSuccessfulGeneration(
    memory,
    {
      questionId: "q-disconnected",
      question: "Why?",
      getAnswer: () => "Answer completed after disconnection.",
      shouldRemember: () => false,
    },
    async () => undefined,
    () => 13,
  );
  assert.deepEqual(memory.getRecentConversation(), [
    {
      questionId: "q-complete",
      question: "What is RAG?",
      answer: "Completed answer",
      answerSource: "AI_GENERATED_UNVERIFIED",
      timestamp: 12,
      topic: "technical",
    },
  ]);
});
