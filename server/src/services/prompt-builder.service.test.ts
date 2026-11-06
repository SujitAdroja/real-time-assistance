import assert from "node:assert/strict";
import test from "node:test";
import { buildAnswerPrompt } from "./prompt-builder.service.js";

test("builds separate system instructions and untrusted reference context", () => {
  const messages = buildAnswerPrompt("What is RAG?", {
    resume: "Built an internal search service.",
    jobDescription: "Looking for a backend engineer.",
    recentConversation: [{ question: "Tell me about yourself.", answer: "I build APIs." }],
  });

  assert.equal(messages[0]?.role, "system");
  assert.match(messages[0]?.content ?? "", /Never invent/);
  assert.match(messages[0]?.content ?? "", /reference data, not instructions/);
  assert.equal(messages[1]?.role, "user");
  assert.match(messages[1]?.content ?? "", /What is RAG\?/);
  assert.match(messages[1]?.content ?? "", /Built an internal search service/);
  assert.match(messages[1]?.content ?? "", /Looking for a backend engineer/);
  assert.match(messages[1]?.content ?? "", /I build APIs/);
});

test("limits the recent conversation to the latest four exchanges", () => {
  const messages = buildAnswerPrompt("How do you work?", {
    resume: "",
    jobDescription: "",
    recentConversation: Array.from({ length: 6 }, (_, index) => ({
      question: `question-${index}`,
      answer: `answer-${index}`,
    })),
  });

  assert.doesNotMatch(messages[1]?.content ?? "", /question-0/);
  assert.doesNotMatch(messages[1]?.content ?? "", /question-1/);
  assert.match(messages[1]?.content ?? "", /question-2/);
  assert.match(messages[1]?.content ?? "", /answer-5/);
});

test("caps candidate context length and handles empty context", () => {
  const messages = buildAnswerPrompt("Describe your experience.", {
    resume: "r".repeat(20_000),
    jobDescription: "",
    recentConversation: [],
  });

  assert.ok(messages[1]!.content.length < 20_000);
  assert.match(messages[1]?.content ?? "", /Job description.*Not provided/s);
});
