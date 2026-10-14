import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { TokenVerifier } from "livekit-server-sdk";
import { createMeetingRouter, DEFAULT_MEETING_RUBRIC, issueMeetingToken, MEETING_TOKEN_TTL_SECONDS,
  MeetingRoom, MeetingMember, MeetingTranscript, MeetingConsent, meetingConfigurationStatus, validateDiscussionReport, type MeetingMediaAdapter } from "../backend/meetings.ts";
import { ServiceError } from "../backend/errors.ts";

let database: MongoMemoryServer;
before(async () => {
  database = await MongoMemoryServer.create(); await mongoose.connect(database.getUri());
  await Promise.all([MeetingRoom.init(), MeetingMember.init(), MeetingTranscript.init(), MeetingConsent.init()]);
});
after(async () => { await mongoose.disconnect(); await database?.stop(); });
const authorize = (call: request.Test, user = "host") => call.set("Authorization", `Bearer ${user}`);

function fixture(options: { media?: boolean; endFails?: boolean } = {}) {
  let speechCalls = 0;
  let analysisCalls = 0;
  let speechGate: (() => Promise<void>) | undefined;
  let analysisGate: (() => Promise<void>) | undefined;
  let speechFails = false;
  let corruptEvidence = false;
  const media: MeetingMediaAdapter = {
    url: "ws://127.0.0.1:7880",
    ensureRoom: async () => {},
    issueToken: (roomName, identity, name) => issueMeetingToken("synthetic-key", "synthetic-secret", roomName, identity, name),
    endRoom: async () => { if (options.endFails) throw new Error("Synthetic SFU failure"); },
    removeParticipant: async () => {},
    verifyMicrophoneTrack: async (_room, identity, track) => track === `${identity}-microphone`,
  };
  const ai = {
    transcribe: async () => { speechCalls++; if (speechFails) { speechFails = false; throw new ServiceError(503, "PROVIDER_UNAVAILABLE", "Synthetic provider failure.", true); } if (speechGate) await speechGate(); return { text: "Synthetic transcript: teams should review AI generated code and test every change.", source: "synthetic-provider-fixture" }; },
    completeJson: async (input: any) => {
      analysisCalls++;
      if (analysisGate) await analysisGate();
      const data = JSON.parse(input.messages[1].content);
      const segment = data.targetSegments[0];
      const evidence = [{ segmentId: segment.id, quote: corruptEvidence ? "This quotation was never spoken." : segment.text.slice(0, 36) }];
      return { value: { summary: "Synthetic provider fixture, not an actual AI assessment.", strongestArguments: evidence,
        criteria: data.rubric.map((criterion: any) => ({ id: criterion.id, score: 3, explanation: "A synthetic criterion explanation grounded in the fixture transcript.", evidence })),
        improvements: ["Provide a concrete example."], exercises: ["Practice explaining a tradeoff."], uncertainties: ["Synthetic speech and analysis providers were used in this test."] },
        model: "synthetic-model", provider: "synthetic-provider", usage: { totalTokens: 100 } };
    },
  };
  const app = express(); app.use(express.json({ limit: "2mb" }));
  app.use("/meetings", createMeetingRouter({ connectDB: async () => {}, ai, ...(options.media === false ? {} : { media }),
    // Isolated contract fixture. Real session-token verification is tested in api.integration.test.ts.
    requireAuth: (req: any, res, next) => { const auth = req.headers.authorization; if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Sign in required." }); return; } req.user = { id: auth.slice(7) }; next(); },
  }));
  return { app, get speechCalls() { return speechCalls; }, get analysisCalls() { return analysisCalls; }, gateSpeech: (gate?: () => Promise<void>) => { speechGate = gate; },
    gateAnalysis: (gate?: () => Promise<void>) => { analysisGate = gate; }, failSpeechOnce: () => { speechFails = true; }, corruptEvidence: (value: boolean) => { corruptEvidence = value; } };
}
async function create(app: ReturnType<typeof express>, body: Record<string, unknown> = {}) {
  const result = await authorize(request(app).post("/meetings")).send({ title: "Integration discussion", topic: "How should teams review AI generated code?", displayName: "Host", passcode: "1234", transcriptConsent: true, ...body }).expect(201);
  return result.body;
}
function join(app: ReturnType<typeof express>, code: string, user: string, consent = true) {
  return authorize(request(app).post(`/meetings/${code}/join`), user).send({ displayName: user, passcode: "1234", transcriptConsent: consent });
}
function audioPayload(user: string, overrides: Record<string, unknown> = {}) {
  return { audio: Buffer.alloc(512, 1).toString("base64"), mimeType: "audio/webm", trackSid: `user-${user}-microphone`,
    clientSegmentId: crypto.randomUUID(), startedAt: new Date(Date.now() - 600).toISOString(), endedAt: new Date().toISOString(), speakingSeconds: 0.4, ...overrides };
}

test("signed SFU tokens bind a single room and identity, use five-minute TTL and exclude administration/data privileges", async () => {
  const token = await issueMeetingToken("test-key", "test-secret", "one-room", "user-one", "One");
  const verified = await new TokenVerifier("test-key", "test-secret").verify(token);
  assert.equal(verified.sub, "user-one"); assert.equal(verified.video?.room, "one-room"); assert.equal(verified.video?.roomJoin, true);
  assert.equal(verified.video?.roomAdmin, undefined); assert.equal(verified.video?.roomCreate, undefined);
  assert.equal(verified.video?.canPublishData, false); assert.equal(verified.video?.canUpdateOwnMetadata, false);
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  assert.equal(payload.exp - payload.nbf, MEETING_TOKEN_TTL_SECONDS);
  await assert.rejects(new TokenVerifier("test-key", "wrong-secret").verify(token));
});

test("discussion report validation rejects fabricated and differently attributed evidence and unsupported scores", () => {
  const segments = [{ id: "alice-segment", text: "Teams should review generated code carefully." }];
  const evidence = [{ segmentId: "alice-segment", quote: "review generated code carefully" }];
  const value = { summary: "A contribution about code review.", strongestArguments: evidence,
    criteria: DEFAULT_MEETING_RUBRIC.map((criterion) => ({ id: criterion.id, score: 3, explanation: "The quoted statement supports this criterion.", evidence })), improvements: [], exercises: [], uncertainties: [] };
  assert.equal(validateDiscussionReport(value, segments).overallScore, 60);
  assert.throws(() => validateDiscussionReport({ ...value, strongestArguments: [{ segmentId: "bob-segment", quote: evidence[0].quote }] }, segments), /incorrectly attributed/);
  assert.throws(() => validateDiscussionReport({ ...value, strongestArguments: [{ segmentId: "alice-segment", quote: "Something never said" }] }, segments), /incorrectly attributed/);
  assert.throws(() => validateDiscussionReport({ ...value, criteria: value.criteria.map((criterion) => ({ ...criterion, evidence: [] })) }, segments), /requires participant transcript evidence/);
});

test("room passcodes, waiting admission and host operations cannot be bypassed with browser-supplied identity", async () => {
  const { app } = fixture();
  await request(app).post("/meetings").send({}).expect(401);
  const created = await create(app); const code = created.room.code;
  assert.equal(created.me.identity, "user-host"); assert.equal(created.me.role, "HOST");
  assert.equal(JSON.stringify(created).includes("passcodeHash"), false);
  const persisted = await MeetingRoom.findOne({ code }).select("+passcodeHash").lean() as any;
  assert.ok(persisted.passcodeHash); assert.notEqual(persisted.passcodeHash, "1234");
  await authorize(request(app).post(`/meetings/${code}/join`), "alice").send({ displayName: "Alice", passcode: "wrong", transcriptConsent: true, role: "HOST", identity: "user-host" }).expect(403);
  const waiting = await join(app, code, "alice").expect(200); assert.equal(waiting.body.me.status, "WAITING"); assert.deepEqual(waiting.body.transcript, []);
  await authorize(request(app).get(`/meetings/${code}`), "outsider").expect(403);
  await authorize(request(app).post(`/meetings/${code}/token`), "alice").send({ identity: "user-host" }).expect(403);
  await authorize(request(app).post(`/meetings/${code}/end`), "alice").send({ userId: "host" }).expect(403);
  await authorize(request(app).post(`/meetings/${code}/admission`), "alice").send({ identity: "user-alice", admit: true }).expect(403);
  await authorize(request(app).post(`/meetings/${code}/admission`)).send({ identity: "user-alice", admit: true }).expect(200);
  const issued = await authorize(request(app).post(`/meetings/${code}/token`), "alice").send({ identity: "user-host", room: "another-room" }).expect(200);
  const claims = await new TokenVerifier("synthetic-key", "synthetic-secret").verify(issued.body.token);
  assert.equal(claims.sub, "user-alice"); assert.equal(claims.video?.room, `interview-coach-${code}`);
});

test("concurrent room joins persist separate memberships and denied users cannot mint or renew tokens", async () => {
  const { app } = fixture(); const created = await create(app, { waitingRoom: false }); const code = created.room.code;
  const results = await Promise.all(["one", "two", "three"].map((user) => join(app, code, user)));
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(await MeetingMember.countDocuments({ roomCode: code }), 4);
  await authorize(request(app).post(`/meetings/${code}/admission`)).send({ identity: "user-one", admit: false }).expect(200);
  await authorize(request(app).post(`/meetings/${code}/token`), "one").send({}).expect(403);
  await join(app, code, "one").expect(403);
});

test("server consent and authenticated microphone ownership gate transcription and speaker labels", async () => {
  const fixtureApp = fixture(); const { app } = fixtureApp; const created = await create(app, { waitingRoom: false }); const code = created.room.code;
  await join(app, code, "alice", false).expect(200);
  await authorize(request(app).post(`/meetings/${code}/audio`), "alice").send(audioPayload("alice")).expect(403);
  assert.equal(fixtureApp.speechCalls, 0);
  await authorize(request(app).post(`/meetings/${code}/consent`), "alice").send({ granted: true }).expect(200);
  await authorize(request(app).post(`/meetings/${code}/audio`), "alice").send(audioPayload("host")).expect(403);
  const captured = await authorize(request(app).post(`/meetings/${code}/audio`), "alice").send(audioPayload("alice", { speakerId: "user-host", speakerName: "Host" })).expect(200);
  const transcript = await MeetingTranscript.findOne({ id: captured.body.id }).lean() as any;
  assert.equal(transcript.userId, "alice"); assert.equal(transcript.identity, "user-alice"); assert.equal(transcript.speakerName, "alice");
  assert.equal(transcript.source, "synthetic-provider-fixture");
  await authorize(request(app).patch(`/meetings/${code}/transcripts/${transcript.id}`)).send({ text: "Cannot alter Alice's speech." }).expect(404);
  await authorize(request(app).patch(`/meetings/${code}/transcripts/${transcript.id}`), "alice").send({ text: "Corrected synthetic transcript: teams should review generated code." }).expect(200);
  assert.equal((await MeetingTranscript.findOne({ id: transcript.id }).lean() as any).status, "CORRECTED");
  assert.equal(await MeetingConsent.countDocuments({ roomCode: code, userId: "alice", granted: true }), 1);
});

test("withdrawing consent during transcription prevents a late provider response from restoring text", async () => {
  const fixtureApp = fixture(); const { app } = fixtureApp; const created = await create(app); const code = created.room.code;
  let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  fixtureApp.gateSpeech(async () => { entered(); await gate; });
  const audio = authorize(request(app).post(`/meetings/${code}/audio`)).send(audioPayload("host")).then((result) => result);
  await started;
  await authorize(request(app).post(`/meetings/${code}/consent`)).send({ granted: false }).expect(200);
  release(); const result = await audio; assert.equal(result.status, 403);
  assert.equal(await MeetingTranscript.countDocuments({ roomCode: code }), 0);
});

test("audio retries keep one transcript, reject changed payloads and recover a failed provider call", async () => {
  const fixtureApp = fixture(); const { app } = fixtureApp; const created = await create(app); const code = created.room.code;
  const payload = audioPayload("host"); fixtureApp.failSpeechOnce();
  await authorize(request(app).post(`/meetings/${code}/audio`)).send(payload).expect(503);
  const recovered = await authorize(request(app).post(`/meetings/${code}/audio`)).send(payload).expect(200);
  const repeated = await authorize(request(app).post(`/meetings/${code}/audio`)).send(payload).expect(200);
  assert.equal(recovered.body.id, repeated.body.id); assert.equal(fixtureApp.speechCalls, 2);
  assert.equal(await MeetingTranscript.countDocuments({ roomCode: code }), 1);
  await authorize(request(app).post(`/meetings/${code}/audio`)).send({ ...payload, audio: Buffer.alloc(512, 2).toString("base64") }).expect(409);
});

test("final reports retain exact evidence, omit scores without transcripts and enforce participant data deletion", async () => {
  const fixtureApp = fixture(); const { app } = fixtureApp; const created = await create(app, { waitingRoom: false }); const code = created.room.code;
  await join(app, code, "alice").expect(200);
  await authorize(request(app).post(`/meetings/${code}/audio`)).send(audioPayload("host")).expect(200);
  await authorize(request(app).post(`/meetings/${code}/chat`), "alice").send({ text: "A chat-only contribution is not spoken evidence." }).expect(201);
  await authorize(request(app).post(`/meetings/${code}/end`)).send({}).expect(200);
  await authorize(request(app).post(`/meetings/${code}/token`)).send({}).expect(409);
  const report = await authorize(request(app).post(`/meetings/${code}/reports`)).send({}).expect(200);
  assert.equal(fixtureApp.analysisCalls, 1);
  assert.equal(report.body.reports.find((item: any) => item.identity === "user-host").report.overallScore, 60);
  const participant = await authorize(request(app).get(`/meetings/${code}`), "alice").expect(200);
  assert.equal(participant.body.reports, undefined); assert.equal(participant.body.me.report.overallScore, null); assert.equal(participant.body.me.report.evidenceAvailable, false);
  await authorize(request(app).delete(`/meetings/${code}/data?scope=all`), "alice").expect(403);
  await authorize(request(app).delete(`/meetings/${code}/data`), "alice").expect(200);
  assert.equal((await MeetingMember.findOne({ roomCode: code, userId: "alice" }).lean() as any).report, null);
  assert.equal(await MeetingTranscript.countDocuments({ roomCode: code }), 1);
  await authorize(request(app).delete(`/meetings/${code}/data?scope=all`)).expect(200);
  assert.equal(await MeetingTranscript.countDocuments({ roomCode: code }), 0);
  assert.equal(await MeetingMember.countDocuments({ roomCode: code, report: { $ne: null } }), 0);
  await authorize(request(app).delete(`/meetings/${code}`)).expect(200);
  assert.equal(await MeetingMember.countDocuments({ roomCode: code }), 0);
  assert.equal(await MeetingConsent.countDocuments({ roomCode: code }), 0);
});

test("invalid provider evidence is rejected rather than replaced by fabricated feedback", async () => {
  const fixtureApp = fixture(); const { app } = fixtureApp; const created = await create(app); const code = created.room.code;
  await authorize(request(app).post(`/meetings/${code}/audio`)).send(audioPayload("host")).expect(200);
  await authorize(request(app).post(`/meetings/${code}/end`)).send({}).expect(200);
  fixtureApp.corruptEvidence(true);
  const result = await authorize(request(app).post(`/meetings/${code}/reports`)).send({}).expect(502);
  assert.equal(result.body.code, "INVALID_AI_EVIDENCE");
  assert.equal((await MeetingMember.findOne({ roomCode: code, userId: "host" }).lean() as any).report, null);
});

test("Mongo report claim blocks concurrent provider work and data deletion prevents late report restoration", async () => {
  const fixtureApp = fixture(); const { app } = fixtureApp; const created = await create(app); const code = created.room.code;
  await authorize(request(app).post(`/meetings/${code}/audio`)).send(audioPayload("host")).expect(200);
  await authorize(request(app).post(`/meetings/${code}/end`)).send({}).expect(200);
  let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  fixtureApp.gateAnalysis(async () => { entered(); await gate; });
  const first = authorize(request(app).post(`/meetings/${code}/reports`)).send({}).then((result) => result);
  await started;
  const second = await authorize(request(app).post(`/meetings/${code}/reports`)).send({}).expect(409);
  assert.equal(second.body.code, "REPORT_IN_PROGRESS"); assert.equal(fixtureApp.analysisCalls, 1);
  await authorize(request(app).delete(`/meetings/${code}/data`)).expect(200);
  release(); assert.equal((await first).status, 409);
  const member = await MeetingMember.findOne({ roomCode: code, userId: "host" }).lean() as any;
  assert.equal(member.report, null); assert.equal(await MeetingTranscript.countDocuments({ roomCode: code }), 0);
  assert.equal((await MeetingRoom.findOne({ code }).lean() as any).reportGenerationId, undefined);
});

test("SFU termination failure leaves room open and missing configuration never issues a token", async () => {
  const { app } = fixture({ endFails: true }); const created = await create(app); const code = created.room.code;
  await authorize(request(app).post(`/meetings/${code}/end`)).send({}).expect(503);
  assert.equal((await MeetingRoom.findOne({ code }).lean() as any).status, "OPEN");
  const prior = [process.env.LIVEKIT_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET];
  try {
    delete process.env.LIVEKIT_URL; delete process.env.LIVEKIT_API_KEY; delete process.env.LIVEKIT_API_SECRET;
    const unconfigured = fixture({ media: false });
    await authorize(request(unconfigured.app).post(`/meetings/${code}/token`)).send({}).expect(503);
    assert.equal(meetingConfigurationStatus().configured, false);
    assert.equal(meetingConfigurationStatus({ LIVEKIT_URL: "ws://remote.example:7880", LIVEKIT_API_KEY: "key", LIVEKIT_API_SECRET: "secret" }).configured, false);
  } finally {
    ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"].forEach((name, index) => { if (prior[index] === undefined) delete process.env[name]; else process.env[name] = prior[index]; });
  }
});

test("expired rooms are inaccessible before asynchronous MongoDB TTL deletion", async () => {
  const { app } = fixture(); const created = await create(app);
  await MeetingRoom.updateOne({ code: created.room.code }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await authorize(request(app).get(`/meetings/${created.room.code}`)).expect(404);
});
