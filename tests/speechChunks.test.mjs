import test from "node:test";
import assert from "node:assert/strict";
import { chunkSpeech } from "../src/lib/speechChunks.ts";

test("splits long text into word-safe Groq chunks", () => {
  const sentence = "Describe a distributed system design and the decisions behind it. ";
  const chunks = chunkSpeech(sentence.repeat(10));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((part) => part.length <= 180));
  assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), sentence.repeat(10).trim().replace(/\s+/g, " "));
});

test("preserves short sentences and removes whitespace", () => {
  assert.deepEqual(chunkSpeech("  Hello  there.\n How are you? "), ["Hello there. How are you?"]);
});

test("rejects a single unsplittable word instead of truncating", () => {
  assert.throws(() => chunkSpeech("x".repeat(201)), /longer than/);
});
