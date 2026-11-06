import assert from "node:assert/strict";
import test from "node:test";
import {
  CompletedUtterancePipeline,
  detectQuestion,
} from "./question-detection.service.js";

test("detects explicit interview question patterns", () => {
  const examples = [
    ["Tell me about yourself.", "experience"],
    ["What is React?", "technical"],
    ["How does RAG work?", "technical"],
    ["Have you worked with PostgreSQL?", "general"],
    ["Explain JWT authentication.", "technical"],
    ["Describe a challenging project.", "behavioral"],
    ["How would you design a scalable API?", "scenario"],
  ] as const;

  for (const [utterance, category] of examples) {
    const detection = detectQuestion(utterance);
    assert.equal(detection.classification, "INTERVIEW_QUESTION", utterance);
    assert.equal(detection.category, category, utterance);
    assert.equal(detection.shouldTriggerAnswer, true, utterance);
    assert.ok(detection.ruleScore >= 80 && detection.ruleScore <= 100);
  }
});

test("filters small talk and conversational statements", () => {
  const examples = [
    ["How are you doing today?", "SMALL_TALK"],
    ["Good morning.", "SMALL_TALK"],
    ["How was your weekend?", "SMALL_TALK"],
    ["Are you comfortable?", "SMALL_TALK"],
    ["Nice to meet you.", "SMALL_TALK"],
    ["Okay, let's move ahead.", "STATEMENT"],
    ["That's interesting.", "STATEMENT"],
  ] as const;

  for (const [utterance, classification] of examples) {
    const detection = detectQuestion(utterance);
    assert.equal(detection.classification, classification, utterance);
    assert.equal(detection.shouldTriggerAnswer, false, utterance);
  }
});

test("marks incomplete and ambiguous utterances without triggering an answer", () => {
  for (const utterance of ["", "   ", "Can you explain..."]) {
    const detection = detectQuestion(utterance);
    assert.equal(detection.classification, "INCOMPLETE", utterance);
    assert.equal(detection.shouldTriggerAnswer, false, utterance);
  }

  assert.equal(detectQuestion("Is it?").classification, "AMBIGUOUS");
});

test("normalizes whitespace while retaining readable text", () => {
  const detection = detectQuestion("  What   is   React?  ");
  assert.equal(detection.normalizedText, "What is React?");
});

test("waits for completed finalized segments and ignores duplicate segment IDs", () => {
  const pipeline = new CompletedUtterancePipeline();

  assert.equal(
    pipeline.addFinalSegment({
      id: "segment-1",
      text: "How would you",
      speechFinal: false,
    }),
    null,
  );
  assert.equal(
    pipeline.addFinalSegment({
      id: "segment-1",
      text: "How would you",
      speechFinal: false,
    }),
    null,
  );
  assert.equal(
    pipeline.addFinalSegment({
      id: "segment-2",
      text: "design a scalable API?",
      speechFinal: false,
    }),
    null,
  );

  const detected = pipeline.signalUtteranceEnd();
  assert.equal(detected?.classification, "INTERVIEW_QUESTION");
  assert.equal(detected?.normalizedText, "How would you design a scalable API?");
  assert.equal(pipeline.signalUtteranceEnd(), null);
});

test("classifies an utterance once when speech-final closes the segment", () => {
  const pipeline = new CompletedUtterancePipeline();
  const detected = pipeline.addFinalSegment({
    id: "segment-1",
    text: "What is React?",
    speechFinal: true,
  });

  assert.equal(detected?.classification, "INTERVIEW_QUESTION");
  assert.equal(pipeline.signalUtteranceEnd(), null);
});

test("uses only finalized segments when the utterance-end signal arrives", () => {
  const pipeline = new CompletedUtterancePipeline();

  assert.equal(
    pipeline.addFinalSegment({
      id: "segment-1",
      text: "Good morning.",
      speechFinal: false,
    }),
    null,
  );

  assert.equal(pipeline.signalUtteranceEnd()?.classification, "SMALL_TALK");
  assert.equal(pipeline.signalUtteranceEnd(), null);
});
