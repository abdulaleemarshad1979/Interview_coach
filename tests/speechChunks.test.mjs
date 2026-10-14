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

test("preserves decimal points, abbreviations, quotes, and standalone punctuation", () => {
  const text = '!!! Dr. Rao measured 3.14 seconds. Why? "Explain the choice."';
  assert.equal(chunkSpeech(text).join(" "), text);
});

test("keeps every Unicode character and stays within the provider's conservative character limit", () => {
  const text = "Explain the café's 🚀 deployment process and the reasoning behind it. ".repeat(7).trim();
  const chunks = chunkSpeech(text, 200);
  assert.equal(chunks.join(" "), text);
  assert.ok(chunks.every(part => part.length <= 200));
});

test("rejects limits beyond Orpheus and returns no chunks for whitespace", () => {
  assert.throws(() => chunkSpeech("Hello", 201), /between 10 and 200/);
  assert.deepEqual(chunkSpeech(" \n \t"), []);
});
