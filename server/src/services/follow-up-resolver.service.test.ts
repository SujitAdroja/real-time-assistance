import assert from "node:assert/strict";
import test from "node:test";
import { resolveFollowUpQuestion } from "./follow-up-resolver.service.js";

const history = [
  {
    questionId: "q-1",
    question: "What is RAG?",
    answer: "RAG retrieves relevant documents and supplies them to a model.",
    timestamp: 1,
    topic: "technical",
  },
];

test("resolves pronoun follow-ups against the latest completed topic", () => {
  const result = resolveFollowUpQuestion("What are its disadvantages?", history);
  assert.ok(result);
  assert.match(result.resolvedQuestion, /disadvantages of RAG/i);
  assert.equal(result.relevantConversation[0]?.question, "What is RAG?");
});

test("resolves short why and implementation follow-ups", () => {
  const why = resolveFollowUpQuestion("Why?", history);
  assert.ok(why);
  assert.match(why.resolvedQuestion, /RAG matters/i);

  const implementation = resolveFollowUpQuestion("How did you implement that?", history);
  assert.ok(implementation);
  assert.match(implementation.resolvedQuestion, /implement/i);

  const elaborate = resolveFollowUpQuestion("Can you explain further?", history);
  assert.ok(elaborate);
  assert.match(elaborate.resolvedQuestion, /RAG in more detail/i);
});

test("does not inject conversation for standalone questions or when history is empty", () => {
  assert.equal(resolveFollowUpQuestion("What is PostgreSQL?", history), null);
  assert.equal(resolveFollowUpQuestion("Why?", []), null);
  assert.equal(resolveFollowUpQuestion("What are the disadvantages?", history), null);
});

test("uses only the most recent relevant exchanges and preserves the original question", () => {
  const result = resolveFollowUpQuestion("  What about its disadvantages?  ", [
    { questionId: "q-1", question: "Old topic", answer: "Old answer", timestamp: 1 },
    ...history,
    { questionId: "q-2", question: "How is RAG evaluated?", answer: "With retrieval metrics.", timestamp: 2 },
  ]);
  assert.ok(result);
  assert.equal(result.originalQuestion, "What about its disadvantages?");
  assert.deepEqual(
    result.relevantConversation.map((turn) => turn.questionId),
    ["q-1", "q-2"],
  );
});
