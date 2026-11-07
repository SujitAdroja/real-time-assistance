import assert from "node:assert/strict";
import test from "node:test";
import {
  QuestionDetectionSession,
  type QuestionDetectionEvent,
} from "./question-detection-session.js";

test("adapts finalized Deepgram segments to WebSocket question events once per utterance", () => {
  const events: QuestionDetectionEvent[] = [];
  const session = new QuestionDetectionSession(
    "session-7",
    (event) => events.push(event),
    () => 123456789,
  );

  session.addFinalSegment({
    id: "result-1",
    text: "How does RAG",
    speechFinal: false,
  });
  assert.equal(events.length, 0);

  session.addFinalSegment({
    id: "result-1",
    text: "How does RAG",
    speechFinal: false,
  });
  session.addFinalSegment({
    id: "result-2",
    text: "work?",
    speechFinal: false,
  });
  session.signalUtteranceEnd();

  assert.deepEqual(events, [
    {
      type: "question:status",
      classification: "INTERVIEW_QUESTION",
      reason: "The utterance is a complete WH-question requesting a substantive answer.",
      shouldTriggerAnswer: true,
    },
    {
      type: "question:detected",
      id: "question-session-7-1",
      text: "How does RAG work?",
      category: "technical",
      detectedAt: 123456789,
    },
  ]);

  session.signalUtteranceEnd();
  assert.equal(events.length, 2);
});

test("reports ignored completed small talk without emitting a detected-question event", () => {
  const events: QuestionDetectionEvent[] = [];
  const session = new QuestionDetectionSession("session-8", (event) => events.push(event));

  session.addFinalSegment({
    id: "result-1",
    text: "Good morning.",
    speechFinal: true,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "question:status");
  if (events[0]?.type === "question:status") {
    assert.equal(events[0].classification, "SMALL_TALK");
    assert.equal(events[0].shouldTriggerAnswer, false);
  }
});

test("flushes remaining finalized text at session close", () => {
  const events: QuestionDetectionEvent[] = [];
  const session = new QuestionDetectionSession("session-9", (event) => events.push(event));

  session.addFinalSegment({
    id: "result-1",
    text: "Tell me about yourself.",
    speechFinal: false,
  });
  session.flush();

  assert.equal(events.length, 2);
  assert.equal(events[1]?.type, "question:detected");
});

test("assigns distinct IDs to separate completed interview questions", () => {
  const events: QuestionDetectionEvent[] = [];
  const session = new QuestionDetectionSession("session-10", (event) => events.push(event));

  session.addFinalSegment({
    id: "result-1",
    text: "What is React?",
    speechFinal: true,
  });
  session.addFinalSegment({
    id: "result-2",
    text: "How does RAG work?",
    speechFinal: true,
  });

  const detectedQuestions = events.filter((event) => event.type === "question:detected");
  assert.deepEqual(
    detectedQuestions.map((question) => question.id),
    ["question-session-10-1", "question-session-10-2"],
  );
});
