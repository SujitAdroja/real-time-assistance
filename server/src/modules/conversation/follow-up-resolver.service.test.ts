import assert from "node:assert/strict";
import test from "node:test";
import { resolveFollowUpQuestion } from "./follow-up-resolver.service.js";
import type { ConversationTurn } from "./conversation.types.js";

const ragHistory: ConversationTurn[] = [
  {
    questionId: "q-rag",
    question: "What is RAG?",
    answer: "RAG retrieves relevant documents and supplies them to a model.",
    answerSource: "AI_GENERATED_UNVERIFIED",
    timestamp: 1,
  },
];

test("resolves supported follow-up patterns to one clear recent topic", () => {
  const pronoun = resolveFollowUpQuestion("What are its disadvantages?", ragHistory);
  assert.equal(pronoun.status, "RESOLVED");
  assert.equal(pronoun.referencedTopic, "RAG");
  assert.deepEqual(pronoun.relevantTurnIds, ["q-rag"]);
  assert.match(pronoun.resolvedQuestion ?? "", /discuss the requested aspect of RAG/i);

  const implementation = resolveFollowUpQuestion(
    "How did you implement that?",
    ragHistory,
  );
  assert.equal(implementation.status, "RESOLVED");
  assert.equal(implementation.referencedTopic, "RAG");
  assert.deepEqual(implementation.relevantTurnIds, ["q-rag"]);
  assert.match(implementation.resolvedQuestion ?? "", /RAG/i);

  const elaborate = resolveFollowUpQuestion("Can you explain further?", ragHistory);
  assert.equal(elaborate.status, "RESOLVED");
  assert.equal(elaborate.referencedTopic, "RAG");
});

test("marks a reference ambiguous when recent technologies compete", () => {
  const history: ConversationTurn[] = [
    {
      questionId: "q-react",
      question: "What is React?",
      answer: "A UI library.",
      answerSource: "AI_GENERATED_UNVERIFIED",
      timestamp: 1,
    },
    {
      questionId: "q-kubernetes",
      question: "Explain Kubernetes.",
      answer: "A container orchestration platform.",
      answerSource: "AI_GENERATED_UNVERIFIED",
      timestamp: 2,
    },
  ];

  const result = resolveFollowUpQuestion("What are its advantages?", history);
  assert.equal(result.status, "AMBIGUOUS");
  assert.equal(result.referencedTopic, null);
  assert.equal(result.resolvedQuestion, null);
  assert.deepEqual(result.relevantTurnIds, ["q-react", "q-kubernetes"]);
});

test("marks a short follow-up ambiguous when its antecedent is unclear or missing", () => {
  assert.equal(resolveFollowUpQuestion("Why?", []).status, "AMBIGUOUS");

  const unclearHistory: ConversationTurn[] = [
    {
      questionId: "q-general",
      question: "Tell me about yourself.",
      answer: "I am an engineer.",
      answerSource: "AI_GENERATED_UNVERIFIED",
      timestamp: 1,
    },
  ];
  assert.equal(resolveFollowUpQuestion("Why?", unclearHistory).status, "AMBIGUOUS");
});

test("resolves an explicitly named topic from history without choosing a competing topic", () => {
  const history: ConversationTurn[] = [
    ...ragHistory,
    {
      questionId: "q-react",
      question: "What is React?",
      answer: "A UI library.",
      answerSource: "AI_GENERATED_UNVERIFIED",
      timestamp: 2,
    },
  ];

  const result = resolveFollowUpQuestion("Why did you choose React?", history);
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.referencedTopic, "React");
  assert.deepEqual(result.relevantTurnIds, ["q-react"]);
});

test("keeps an independent technical question standalone with no irrelevant history", () => {
  const result = resolveFollowUpQuestion("Explain JWT.", ragHistory);
  assert.equal(result.status, "STANDALONE");
  assert.equal(result.referencedTopic, null);
  assert.deepEqual(result.relevantTurnIds, []);
  assert.deepEqual(result.relevantConversation, []);
});

test("does not inject older turns when resolving within the bounded recent history", () => {
  const result = resolveFollowUpQuestion(
    "What about its disadvantages?",
    [
      {
        questionId: "q-old",
        question: "Explain PostgreSQL.",
        answer: "A relational database.",
        answerSource: "AI_GENERATED_UNVERIFIED",
        timestamp: 1,
      },
      ...ragHistory,
      {
        questionId: "q-rag-metrics",
        question: "How is RAG evaluated?",
        answer: "With retrieval metrics.",
        answerSource: "AI_GENERATED_UNVERIFIED",
        timestamp: 2,
      },
    ],
  );

  assert.equal(result.status, "RESOLVED");
  assert.deepEqual(result.relevantTurnIds, ["q-rag", "q-rag-metrics"]);
  assert.equal(result.originalQuestion, "What about its disadvantages?");
});
