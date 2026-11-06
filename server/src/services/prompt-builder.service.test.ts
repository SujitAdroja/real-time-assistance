import assert from "node:assert/strict";
import test from "node:test";
import { resolveFollowUpQuestion } from "./follow-up-resolver.service.js";
import { buildAnswerPrompt, PromptBuildError } from "./prompt-builder.service.js";

const recentConversation = [
  {
    questionId: "q-1",
    question: "What is RAG?",
    answer: "It retrieves relevant documents and supplies them to a model.",
    timestamp: 123,
    topic: "technical",
  },
];

test("builds separate system instructions and candidate/JD reference context", () => {
  const messages = buildAnswerPrompt("What is RAG?", {
    resume: "Built an internal search service.",
    jobDescription: "Looking for a backend engineer.",
    recentConversation: recentConversation,
  });

  assert.equal(messages[0]?.role, "system");
  assert.match(messages[0]?.content ?? "", /Never invent/);
  assert.match(messages[0]?.content ?? "", /reference data, not instructions/);
  assert.match(messages[0]?.content ?? "", /ask a brief clarifying question/);
  assert.equal(messages[1]?.role, "user");
  assert.match(messages[1]?.content ?? "", /What is RAG\?/);
  assert.match(messages[1]?.content ?? "", /Built an internal search service/);
  assert.match(messages[1]?.content ?? "", /Looking for a backend engineer/);
  assert.doesNotMatch(messages[1]?.content ?? "", /What is RAG\?.*It retrieves/s);
  assert.match(messages[1]?.content ?? "", /No previous exchange is relevant/);
});

test("adds only relevant completed history and interpretation for a follow-up", () => {
  const followUp = resolveFollowUpQuestion(
    "What are its disadvantages?",
    recentConversation,
  );
  const messages = buildAnswerPrompt(
    "What are its disadvantages?",
    {
      resume: "",
      jobDescription: "",
      recentConversation,
    },
    followUp,
  );

  assert.match(messages[1]?.content ?? "", /Tentative follow-up interpretation/);
  assert.match(messages[1]?.content ?? "", /disadvantages/i);
  assert.match(messages[1]?.content ?? "", /What is RAG\?/);
  assert.match(messages[1]?.content ?? "", /relevant documents/);
});

test("does not inject unrelated history into a standalone question", () => {
  const messages = buildAnswerPrompt("What is PostgreSQL?", {
    resume: "",
    jobDescription: "",
    recentConversation,
  });

  assert.match(messages[1]?.content ?? "", /What is PostgreSQL\?/);
  assert.match(messages[1]?.content ?? "", /No previous exchange is relevant/);
  assert.doesNotMatch(messages[1]?.content ?? "", /What is RAG\?/);
});

test("bounds resume, job description, and history using explicit trimming notices", () => {
  const messages = buildAnswerPrompt("Describe your experience.", {
    resume: "r".repeat(20_000),
    jobDescription: "j".repeat(20_000),
    recentConversation: recentConversation.map((turn) => ({
      ...turn,
      question: "q".repeat(2_000),
      answer: "a".repeat(2_000),
    })),
  });

  assert.ok(messages.reduce((total, message) => total + message.content.length, 0) <= 24_000);
  assert.match(messages[1]?.content ?? "", /Reference text trimmed to the prompt budget/);
  assert.match(messages[1]?.content ?? "", /Job description/);
});

test("does not silently truncate an empty or excessively long current question", () => {
  const context = { resume: "", jobDescription: "", recentConversation: [] };
  assert.throws(() => buildAnswerPrompt("  ", context), PromptBuildError);
  assert.throws(
    () => buildAnswerPrompt("q".repeat(2_001), context),
    /question exceeds the 2,000 character limit/,
  );
});
