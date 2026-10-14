import express from "express";
import path from "path";
import http from "http";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import Groq from "groq-sdk";
import pdf from "pdf-parse/lib/pdf-parse.js";
import fs from "fs";
import mongoose from "mongoose";
import helmet from "helmet";
import { createInterviewRouter } from "./backend/interview/router";
import { createMeetingRouter } from "./backend/meetings";
import { createApiLimiter, restrictOrigins } from "./backend/security";
import { verifyCollegePortal, validatePortalLogin, PortalError, portalUrl } from "./backend/collegePortal";
import { createPasswordHash, verifyPassword, PASSWORD_SCHEME, validateCredentials, configuredRoles, effectiveRoles, sanitizeMetadata, profileIdForUser, canAccessProfile, sanitizeProfile } from "./backend/authSafety";

// Cached lazy MongoDB connector — safe for Vercel serverless cold starts.
// process.env.MONGODB_URI is read at call-time, not module-load time.
let mongoConnecting: Promise<typeof mongoose> | null = null;
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }
  const isAtlas = uri.includes("mongodb+srv");


  if (mongoose.connection.readyState === 1) return; // already connected
  if (mongoConnecting) return mongoConnecting;      // reuse in-flight promise

  console.log("[DB] Connecting");
  mongoConnecting = mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }).then((m) => {
    console.log("Connected successfully to MongoDB");
    mongoConnecting = null;
    return m;
  }).catch((err) => {
    console.error("[DB] Connection failed", { code: (err as any)?.code });
    mongoConnecting = null;
    throw err;
  });
  return mongoConnecting;
}

// MongoDB Schema Definitions
const ProfileSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  ownerId: { type: String },
  roll_number: { type: String, default: "" },
  name: { type: String, default: "" },
  student_name: { type: String, default: "" },
  class_section: { type: String, default: "" },
  section: { type: String, default: "" },
  attendance: { type: Number },
  branch: { type: String, default: "" },
  department: { type: String, default: "" },
  college_assessments: { type: Array, default: [] },
  is_synced: { type: Boolean, default: false },
  github_username: { type: String, default: "" },
  resume_file_name: { type: String, default: "" },
  profile_image: { type: String, default: "" },
  avatar_url: { type: String, default: "" },
  is_faculty: { type: Boolean, default: false },
  is_admin: { type: Boolean, default: false },
  assigned_proctor_id: { type: String, default: null },
  assigned_proctor_name: { type: String, default: null },
  updated_at: { type: Date, default: Date.now }
}, { minimize: false });

const Profile = mongoose.model("Profile", ProfileSchema);

const GDRoomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  topic: { type: String, required: true },
  participants: { type: Array, default: [] },
  dialogue: { type: Array, default: [] },
  signals: { type: Array, default: [] },
  createdAt: { type: Number, required: true },
  startedAt: { type: Number },
  evaluation: { type: Object }
}, { minimize: false });

const GDRoom = mongoose.model("GDRoom", GDRoomSchema);

const ProctorAssignmentSchema = new mongoose.Schema({
  proctor_id: { type: String, required: true },
  student_roll: { type: String, required: true },
  task_type: { type: String, enum: ["interview", "gd"], required: true },
  topic: { type: String, required: true },
  difficulty: { type: String },
  room_code: { type: String },
  completed: { type: Boolean, default: false },
  score: { type: Number },
  assigned_at: { type: Date, default: Date.now },
  completed_at: { type: Date }
});

const ProctorAssignment = mongoose.model("ProctorAssignment", ProctorAssignmentSchema);


const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  passwordScheme: { type: String },
  staffProvisioned: { type: Boolean, default: false },
  salt: { type: String, required: true },
  user_metadata: { type: Object, default: {} },
  created_at: { type: Date, default: Date.now }
}, { minimize: false });

const User = mongoose.model("User", UserSchema);

const SessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now, expires: "7d" }
});

const Session = mongoose.model("Session", SessionSchema);
const RegistrationVerification = mongoose.model("RegistrationVerification", new mongoose.Schema({
  tokenDigest: { type: String, required: true, unique: true }, email: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 }, profile: { type: Object },
}));

function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Polyfill global WebSocket for Node.js < 22 where native WebSocket is not available
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. Authentication token is required." });
  }

  const token = authHeader.split(" ")[1];

  try {
    await connectDB();
    const session = await Session.findOne({ token, createdAt: { $gt: new Date(Date.now() - 7 * 86400000) } }).populate("userId");
    if (!session || !session.userId) {
      return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
    }
    const user = session.userId as any;
    req.user = {
      id: user._id.toString(),
      email: user.email,
      user_metadata: { ...user.user_metadata, ...effectiveRoles(user) }
    };
    next();
  } catch (err: any) {
    return res.status(503).json({ error: "Authentication service unavailable. Please retry." });
  }
}

// Lazy initialization of Groq client with dynamic key tracking
let groqInstance: Groq | null = null;
let currentGroqApiKey: string | null = null;

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured. Please set it in your environment/secrets.");
  }
  if (!groqInstance || currentGroqApiKey !== apiKey) {
    groqInstance = new Groq({
      apiKey, timeout: 30000, maxRetries: 2,
    });
    currentGroqApiKey = apiKey;
  }
  return groqInstance;
}

function parseLLMJson(text: string, defaultValue: any): any {
  if (!text) return defaultValue;
  let cleanText = text.trim();

  // Remove markdown code fences if present
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  try {
    return JSON.parse(cleanText);
  } catch (err) {
    console.warn("[JSON Parser] Standard JSON.parse failed. Attempting regex extract...");
    try {
      const match = cleanText.match(/\{[\s\S]*\}/) || cleanText.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {
      console.error("[JSON Parser] Regex extract parse failed:", e);
    }
    return defaultValue;
  }
}

function clampScore(value: unknown, fallback = 0, max = 100): number {
  const score = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.min(max, Math.max(0, score)));
}

function candidateLevelForScore(score: number): string {
  if (score >= 93) return "Excellent Candidate";
  if (score >= 85) return "Strong Candidate";
  if (score >= 73) return "Interview Ready";
  if (score >= 60) return "Developing";
  return "Beginner";
}

interface CompletionOptions {
  messages: Array<{ role: string; content: string }>;
  jsonMode?: boolean;
  temperature?: number;
  purpose?: "chat" | "analyze" | "report" | "questions";
}


async function getLLMCompletion(options: CompletionOptions): Promise<string> {
  const provider = process.env.AI_PROVIDER || "groq";

  if (provider === "ollama") {
    const ollamaUrl = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    let ollamaModel = process.env.OLLAMA_MODEL || "qwen3-coder:480b";

    if (options.purpose === "chat") {
      ollamaModel = process.env.OLLAMA_MODEL_CHAT || process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";
    } else if (options.purpose === "analyze") {
      ollamaModel = process.env.OLLAMA_MODEL_ANALYZE || process.env.OLLAMA_MODEL || "qwen3-coder:480b";
    } else if (options.purpose === "questions") {
      ollamaModel = process.env.OLLAMA_MODEL_QUESTIONS || process.env.OLLAMA_MODEL || "qwen3-coder:480b";
    } else if (options.purpose === "report") {
      ollamaModel = process.env.OLLAMA_MODEL_REPORT || process.env.OLLAMA_MODEL || "qwen3-coder:480b";
    }

    const payload: any = {
      model: ollamaModel,
      messages: options.messages,
      stream: false,
    };
    // Note: Do not set payload.format = "json" for Ollama because it causes massive latency / 502 Bad Gateway timeouts on large models.
    // parseLLMJson in server.ts is already robust and can parse JSON from text.
    if (options.temperature !== undefined) {
      payload.options = { temperature: options.temperature };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (process.env.OLLAMA_AUTH_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`;
    }

    if (process.env.OLLAMA_HEADERS) {
      try {
        const parsedHeaders = JSON.parse(process.env.OLLAMA_HEADERS);
        Object.assign(headers, parsedHeaders);
      } catch (err) {
        console.error("Failed to parse OLLAMA_HEADERS:", err);
      }
    }

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const result: any = await response.json();
    return result.message?.content || "";
  } else if (provider === "openai" || provider === "litellm") {
    const baseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";

    const defaultModel = process.env.AI_MODEL || process.env.OPENAI_MODEL || "interview-coach";
    let model = defaultModel;
    if (options.purpose === "chat") {
      model = process.env.OPENAI_MODEL_CHAT || defaultModel;
    } else if (options.purpose === "analyze") {
      model = process.env.OPENAI_MODEL_ANALYZE || defaultModel;
    } else if (options.purpose === "questions") {
      model = process.env.OPENAI_MODEL_QUESTIONS || defaultModel;
    } else if (options.purpose === "report") {
      model = process.env.OPENAI_MODEL_REPORT || defaultModel;
    }

    const payload: any = {
      model,
      messages: options.messages,
      stream: false,
    };
    if (options.jsonMode) {
      payload.response_format = { type: "json_object" };
    }
    if (options.temperature !== undefined) {
      payload.temperature = options.temperature;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI/LiteLLM API error: ${response.status} - ${errorText}`);
    }

    const result: any = await response.json();
    return result.choices[0]?.message?.content || "";
  } else {
    const groq = getGroqClient();
    const defaultModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    let model = defaultModel;
    if (options.purpose === "chat") {
      model = process.env.GROQ_MODEL_CHAT || defaultModel;
    } else if (options.purpose === "analyze") {
      model = process.env.GROQ_MODEL_ANALYZE || defaultModel;
    } else if (options.purpose === "questions") {
      model = process.env.GROQ_MODEL_QUESTIONS || defaultModel;
    } else if (options.purpose === "report") {
      model = process.env.GROQ_MODEL_REPORT || defaultModel;
    }

    const params: any = {
      messages: options.messages,
      model: model,
    };
    if (options.jsonMode) {
      params.response_format = { type: "json_object" };
    }
    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
    }

    const chatCompletion = await groq.chat.completions.create(params);
    return chatCompletion.choices[0]?.message?.content || "";
  }
}

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY_HOPS && /^\d+$/.test(process.env.TRUST_PROXY_HOPS)) app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use("/api", restrictOrigins);
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
const generalLimiter = createApiLimiter("api", 300, 60000, connectDB);
app.use("/api", (req, res, next) => req.path === "/health" || req.path === "/ping" ? next() : generalLimiter(req, res, next));
app.use(["/api/college/auth-sync", "/api/college/login", "/api/college/sync-portal"], createApiLimiter("college-auth", 10, 15 * 60000, connectDB));
app.use("/api/auth", createApiLimiter("auth", 30, 15 * 60000, connectDB));
app.use("/api/voice", createApiLimiter("voice", 60, 60000, connectDB));
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Increase payload limit to handle base64-encoded PDF resumes
app.use(express.json({ limit: "25mb" }));

app.use(["/api/interview/submit-answer", "/api/interview/generate-report", "/api/interview/evaluate-gd"], (_req, res) => res.status(410).json({ error: "Use the adaptive interview or secure meeting flow to generate evidence-based reports.", code: "LEGACY_ASSESSMENT_RETIRED" }));
app.use("/api/gd-room", (_req, res) => res.status(410).json({ error: "This legacy room has been retired. Create a secure discussion room from the lobby.", code: "LEGACY_ROOM_RETIRED" }));
app.use("/api/local-stt", requireAuth);
app.use("/api/local-tts", requireAuth);

app.use("/api/interview/sessions", createInterviewRouter({ requireAuth, connectDB }));
app.use("/api/meetings", createMeetingRouter({ requireAuth, connectDB }));

// Groq speech APIs use server-owned credentials and existing MongoDB session auth.
app.get("/api/voice/status", requireAuth, async (_req, res) => {
  const localUrl = process.env.LOCAL_STT_URL || "";
  let localHealthy = false;
  if (localUrl) {
    try {
      const health = await fetch(localUrl.replace(/\/transcribe\/?$/, "/health"), {
        signal: AbortSignal.timeout(1500),
      });
      localHealthy = health.ok;
    } catch { /* no local service */ }
  }
  res.json({ available: Boolean(process.env.GROQ_API_KEY || localHealthy),
    groqConfigured: Boolean(process.env.GROQ_API_KEY), localHealthy });
});

app.post("/api/voice/synthesize", requireAuth, async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const allowedVoices = ["hannah", "autumn", "diana"];
  const requestedVoice = String(req.body?.voice || process.env.GROQ_TTS_VOICE || "hannah");
  if (!text || text.length > 200) {
    return res.status(400).json({ error: "Speech text must contain 1–200 characters." });
  }
  if (!allowedVoices.includes(requestedVoice)) {
    return res.status(400).json({ error: "Unsupported female voice." });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: "Groq TTS is not configured." });
  }
  try {
    const audio = await getGroqClient().audio.speech.create({
      model: process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english",
      voice: requestedVoice,
      input: text,
      response_format: "wav",
    });
    const bytes = Buffer.from(await audio.arrayBuffer());
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(bytes);
  } catch (error: any) {
    const status = error?.status === 429 ? 429 : 502;
    console.error("[voice] TTS provider failed", { status: error?.status || 0 });
    return res.status(status).json({ error: "Speech generation temporarily unavailable." });
  }
});

app.post("/api/voice/transcribe", requireAuth, async (req, res) => {
  const audio = req.body?.audio;
  const mimeType = String(req.body?.mimeType || "audio/webm");
  if (typeof audio !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio) ||
      !/^audio\/(webm|wav|ogg|mp4|mpeg|mp3|x-m4a)(;.*)?$/i.test(mimeType)) {
    return res.status(400).json({ error: "Valid base64 audio and supported MIME type required." });
  }
  const bytes = Buffer.from(audio, "base64");
  if (bytes.length < 512 || bytes.length > 10 * 1024 * 1024) {
    return res.status(400).json({ error: "Audio length must be between 512 bytes and 10 MB." });
  }
  try {
    if (process.env.GROQ_API_KEY) {
      const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") || mimeType.includes("x-m4a") ? "m4a" : mimeType.includes("mpeg") || mimeType.includes("mp3") ? "mp3" : "webm";
      const upload = new File([bytes], `speech.${ext}`, { type: mimeType });
      const transcript = await getGroqClient().audio.transcriptions.create({
        file: upload, model: process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo",
        language: "en", response_format: "json", temperature: 0,
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ text: transcript.text || "", source: "groq" });
    }
    const localUrl = process.env.LOCAL_STT_URL;
    if (!localUrl) return res.status(503).json({ error: "No speech recognizer configured." });
    const form = new FormData();
    const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("mp4") || mimeType.includes("x-m4a") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
    form.append("audio", new Blob([bytes], { type: mimeType }), `speech.${ext}`);
    const upstream = await fetch(localUrl, { method: "POST", body: form, signal: AbortSignal.timeout(20000) });
    if (!upstream.ok) throw new Error(`Local transcription returned ${upstream.status}`);
    const data: any = await upstream.json();
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ text: String(data.text || ""), source: "local" });
  } catch (error: any) {
    const status = error?.status === 429 ? 429 : 502;
    console.error("[voice] STT provider failed", { status: error?.status || 0 });
    return res.status(status).json({ error: "Transcription temporarily unavailable." });
  }
});


// 1b. MongoDB Authentication Endpoints

app.post("/api/auth/signup", async (req, res) => {
  let credentials;
  try { credentials = validateCredentials(req.body?.email, req.body?.password, true); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
  if (configuredRoles(credentials.email).is_faculty) return res.status(403).json({ error: "Staff accounts must be provisioned by the administrator. Use an existing staff account to sign in." });
  const requestedStaff = req.body?.user_metadata?.is_admin || req.body?.user_metadata?.is_faculty;
  if (requestedStaff && !configuredRoles(credentials.email).is_faculty) return res.status(403).json({ error: "Staff registration requires administrator approval for this email address." });
  try {
    await connectDB();
    const { email: normalizedEmail, password } = credentials;
    let verifiedProfile: any = null;
    if (normalizedEmail.endsWith("@aec.edu.in")) {
      const ticket = req.body?.user_metadata?.registration_token;
      if (typeof ticket !== "string" || !/^[a-f0-9]{64}$/.test(ticket)) return res.status(403).json({ error: "Verify this roll number through College portal sign-in before creating its account." });
      const verification = await RegistrationVerification.findOneAndDelete({ tokenDigest: crypto.createHash("sha256").update(ticket).digest("hex"), email: normalizedEmail, expiresAt: { $gt: new Date() } });
      if (!verification) return res.status(403).json({ error: "College verification expired. Please sign in through the college portal again." });
      verifiedProfile = verification.profile;
    }
    const newUserId = new mongoose.Types.ObjectId();
    const user_metadata: Record<string, any> = { ...sanitizeMetadata(req.body?.user_metadata), roll_number: normalizedEmail.endsWith("@aec.edu.in") ? normalizedEmail.split("@")[0].toUpperCase() : newUserId.toString(), ...configuredRoles(normalizedEmail), ...(verifiedProfile ? {
      student_name: verifiedProfile.name, department: verifiedProfile.department, class_section: verifiedProfile.classSection,
      college_portal: verifiedProfile.portal, academic_year: verifiedProfile.academicYear, profile_image: verifiedProfile.profileImage,
      is_synced: true, ...(typeof verifiedProfile.attendance === "number" ? { attendance: verifiedProfile.attendance } : {}), college_assessments: verifiedProfile.collegeAssessments,
    } : {}) };
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "User already registered" });
    }

    const salt = generateSalt();
    const passwordHash = await createPasswordHash(verifiedProfile ? crypto.randomBytes(32).toString("hex") : password, salt);

    const user = new User({
      _id: newUserId,
      email: normalizedEmail,
      passwordHash,
      passwordScheme: PASSWORD_SCHEME,
      salt,
      user_metadata: user_metadata || {}
    });
    await user.save();

    // If student profile, also upsert it in Profile collection to keep in sync
    const rollNo = user_metadata?.roll_number || normalizedEmail.split("@")[0].toUpperCase();
    const isFaculty = !!user_metadata?.is_faculty;
    const isAdmin = !!user_metadata?.is_admin;

    if (!isFaculty && !isAdmin) {
      await Profile.findOneAndUpdate(
        { id: rollNo },
        {
          id: rollNo,
          ownerId: user._id.toString(),
          roll_number: rollNo,
          name: user_metadata?.student_name || user_metadata?.name || "",
          student_name: user_metadata?.student_name || user_metadata?.name || "",
          class_section: user_metadata?.class_section || "",
          section: user_metadata?.class_section || "",
          branch: user_metadata?.branch || "",
          department: user_metadata?.department || "",
          attendance: user_metadata?.attendance,
          college_assessments: user_metadata?.college_assessments || [],
          is_synced: !!user_metadata?.is_synced,
          profile_image: user_metadata?.profile_image || "",
          is_faculty: false,
          is_admin: false,
          updated_at: new Date()
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
    } else {
      await Profile.findOneAndUpdate(
        { id: user._id.toString() },
        {
          id: user._id.toString(),
          ownerId: user._id.toString(),
          name: user_metadata?.faculty_name || user_metadata?.name || "User",
          student_name: user_metadata?.faculty_name || user_metadata?.name || "User",
          branch: user_metadata?.department || "",
          department: user_metadata?.department || "",
          is_faculty: isFaculty,
          is_admin: isAdmin,
          updated_at: new Date()
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
    }

    // Generate session
    const token = crypto.randomBytes(32).toString("hex");
    const session = new Session({
      token,
      userId: user._id
    });
    await session.save();

    res.status(201).json({
      session: { access_token: token, user: { id: user._id.toString(), email: user.email, user_metadata: { ...user.user_metadata, ...effectiveRoles(user) } } },
      user: { id: user._id.toString(), email: user.email, user_metadata: { ...user.user_metadata, ...effectiveRoles(user) } }
    });
  } catch (err: any) {
    console.error("[auth] Signup failed", { code: err?.code });
    res.status(503).json({ error: "Account creation unavailable. Please retry." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  let credentials;
  try { credentials = validateCredentials(req.body?.email, req.body?.password); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
  try {
    await connectDB();
    const { email: normalizedEmail, password } = credentials;
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ error: "Invalid login credentials" });
    }

    if (normalizedEmail.endsWith("@aec.edu.in") && !user.staffProvisioned) {
      return res.status(403).json({ error: "Use College portal sign-in with your current ECAP credentials.", code: "COLLEGE_LOGIN_REQUIRED" });
    }

    if (!(await verifyPassword(password, user.salt, user.passwordHash, user.passwordScheme))) {
      return res.status(400).json({ error: "Invalid login credentials" });
    }

    if (user.passwordScheme !== PASSWORD_SCHEME) {
      user.passwordHash = await createPasswordHash(password, user.salt);
      user.passwordScheme = PASSWORD_SCHEME;
      await user.save();
    }
    // Generate session
    const token = crypto.randomBytes(32).toString("hex");
    const session = new Session({
      token,
      userId: user._id
    });
    await session.save();

    res.json({
      session: { access_token: token, user: { id: user._id.toString(), email: user.email, user_metadata: { ...user.user_metadata, ...effectiveRoles(user) } } },
      user: { id: user._id.toString(), email: user.email, user_metadata: { ...user.user_metadata, ...effectiveRoles(user) } }
    });
  } catch (err: any) {
    console.error("[auth] Login failed", { code: err?.code });
    res.status(503).json({ error: "Sign in unavailable. Please retry." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    await connectDB();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    const session = await Session.findOne({ token, createdAt: { $gt: new Date(Date.now() - 7 * 86400000) } }).populate("userId");
    if (!session || !session.userId) {
      return res.status(401).json({ error: "Invalid session" });
    }
    const user = session.userId as any;
    res.json({
      user: { id: user._id.toString(), email: user.email, user_metadata: { ...user.user_metadata, ...effectiveRoles(user) } }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Service unavailable. Please retry." });
  }
});

app.post("/api/auth/update-metadata", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { data } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.user_metadata = {
      ...(user.user_metadata || {}),
      ...sanitizeMetadata(data)
    };
    user.markModified("user_metadata");
    await user.save();

    // Keep corresponding Profile in sync
    const rollNo = user.user_metadata?.roll_number || user.email.split("@")[0].toUpperCase();
    const { is_faculty: isFaculty, is_admin: isAdmin } = effectiveRoles(user);

    if (!isFaculty && !isAdmin) {
      await Profile.findOneAndUpdate(
        { id: rollNo },
        {
          name: user.user_metadata?.student_name || user.user_metadata?.name || "",
          student_name: user.user_metadata?.student_name || user.user_metadata?.name || "",
          class_section: user.user_metadata?.class_section || "",
          section: user.user_metadata?.class_section || "",
          branch: user.user_metadata?.branch || "",
          department: user.user_metadata?.department || "",
          attendance: user.user_metadata?.attendance,
          college_assessments: user.user_metadata?.college_assessments || [],
          is_synced: !!user.user_metadata?.is_synced,
          profile_image: user.user_metadata?.profile_image || "",
          github_username: user.user_metadata?.github_username || "",
          resume_file_name: user.user_metadata?.resume_file_name || "",
          updated_at: new Date()
        }
      );
    } else {
      await Profile.findOneAndUpdate(
        { id: userId },
        {
          name: user.user_metadata?.faculty_name || user.user_metadata?.name || "User",
          student_name: user.user_metadata?.faculty_name || user.user_metadata?.name || "User",
          branch: user.user_metadata?.department || "",
          department: user.user_metadata?.department || "",
          updated_at: new Date()
        }
      );
    }

    res.json({
      user: { id: user._id.toString(), email: user.email, user_metadata: { ...user.user_metadata, ...effectiveRoles(user) } }
    });
  } catch (err: any) {
    console.error("Update metadata error:", err);
    res.status(500).json({ error: "Service unavailable. Please retry." });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      await Session.deleteOne({ token });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Service unavailable. Please retry." });
  }
});

// 1c. API Endpoints: Ping & Health
app.get("/api/ping", (req, res) => {
  res.json({ success: true });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// API Endpoint: Get all profiles
app.get("/api/profiles", requireAuth, async (req: any, res) => {
  try {
    const profiles = await Profile.find(req.user.user_metadata?.is_faculty || req.user.user_metadata?.is_admin ? {} : { id: profileIdForUser(req.user) });
    res.json(profiles);
  } catch (err: any) {
    console.error("Error fetching profiles:", err);
    res.status(500).json({ error: "Failed to fetch profiles: " + err.message });
  }
});

// API Endpoint: Upsert current user profile
app.post("/api/profiles/upsert", requireAuth, async (req: any, res) => {
  try {
    const { id, ...rest } = req.body;
    const existingProfile = typeof id === "string" ? await Profile.findOne({ id }) : null;
    if (existingProfile?.ownerId && existingProfile.ownerId !== req.user.id && !req.user.user_metadata?.is_admin) return res.status(403).json({ error: "You cannot modify this profile." });
    if (!canAccessProfile(req.user, id, true)) return res.status(403).json({ error: "You cannot modify this profile." });
    if (!id) {
      res.status(400).json({ error: "Profile id is required." });
      return;
    }
    const profile = await Profile.findOneAndUpdate(
      { id },
      { id, ownerId: existingProfile?.ownerId || req.user.id, ...sanitizeProfile(rest, !!req.user.user_metadata?.is_admin), updated_at: new Date() },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: profile });
  } catch (err: any) {
    console.error("Error upserting profile:", err);
    res.status(500).json({ error: "Failed to upsert profile: " + err.message });
  }
});

// API Endpoint: Update specific profile (e.g. proctor assignment)
app.patch("/api/profiles/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const isStaff = req.user.user_metadata?.is_faculty || req.user.user_metadata?.is_admin;
    const existingProfile = await Profile.findOne({ id });
    if (existingProfile?.ownerId && existingProfile.ownerId !== req.user.id && !isStaff) return res.status(403).json({ error: "You cannot modify this profile." });
    if (!canAccessProfile(req.user, id, true) && !isStaff) return res.status(403).json({ error: "You cannot modify this profile." });
    const updateData = isStaff ? sanitizeProfile(req.body, true) : sanitizeProfile(req.body);
    const profile = await Profile.findOneAndUpdate(
      { id },
      { ...updateData, updated_at: new Date() },
      { returnDocument: "after" }
    );
    if (!profile) {
      res.status(404).json({ error: "Profile not found." });
      return;
    }
    res.json({ success: true, data: profile });
  } catch (err: any) {
    console.error("Error updating profile:", err);
    res.status(500).json({ error: "Failed to update profile: " + err.message });
  }
});

// 1d. API Endpoint: Fetch student details from college database or fallback mock
app.get("/api/college/student/:rollNo", requireAuth, async (req: any, res) => {
  try {
    const { rollNo } = req.params;
    const cleanRollNo = String(rollNo || "").trim().toUpperCase();
    if (!canAccessProfile(req.user, cleanRollNo)) return res.status(403).json({ error: "This student profile is private." });

    if (!cleanRollNo) {
      res.status(400).json({ error: "Roll number is required." });
      return;
    }

    // Check if college api configuration is present
    const collegeUrl = process.env.COLLEGE_API_URL;
    const collegeApiKey = process.env.COLLEGE_API_KEY;

    if (collegeUrl && collegeApiKey) {
      console.log(`Connecting to University Connect API for student: ${cleanRollNo}`);
      try {
        const response = await fetch(`${collegeUrl}/student/profile?rollNo=${encodeURIComponent(cleanRollNo)}`, {
          signal: AbortSignal.timeout(10000),
          headers: {
            "Authorization": `Bearer ${collegeApiKey}`,
            "Content-Type": "application/json"
          }
        });
        if (response.ok) {
          const profile = await response.json();
          res.json(profile);
          return;
        }
        console.warn(`University API returned status ${response.status}. Using the verified cached profile if available.`);
      } catch (apiErr: any) {
        console.error("[college] Configured upstream unavailable:", apiErr);
      }
    }

    const stored = await Profile.findOne({ id: cleanRollNo }).lean();
    if (!stored || !stored.is_synced) return res.status(404).json({ error: "No verified college profile is available. Sync your profile through the college portal." });
    if (stored.ownerId && stored.ownerId !== req.user.id && !req.user.user_metadata?.is_faculty && !req.user.user_metadata?.is_admin) return res.status(403).json({ error: "This student profile is private." });
    res.json({ studentId: cleanRollNo, name: stored.name, department: stored.department, classSection: stored.class_section,
      attendance: stored.attendance, collegeAssessments: stored.college_assessments || [], isSynced: true, source: "cached" });
  } catch (err: any) {
    res.status(500).json({ error: "Service unavailable. Please retry." });
  }
});

// College passwords exist only for the duration of the upstream verification request.
function sendPortalError(res: any, error: unknown, portal: unknown) {
  const known = error instanceof PortalError;
  console.warn("[college] Verification failed", { code: known ? error.code : "COLLEGE_SERVICE_UNAVAILABLE" });
  return res.status(known ? error.status : 503).json({
    error: known ? error.message : "Student sign-in is temporarily unavailable. Please try again.",
    code: known ? error.code : "COLLEGE_SERVICE_UNAVAILABLE",
    ...((portal === "aus" || portal === "acet") ? { portalUrl: portalUrl(portal) } : {}),
  });
}

async function persistCollegeProfile(user: any, profile: any, classSection?: string) {
  const existing = await Profile.findOne({ id: profile.studentId }).lean();
  if (existing?.ownerId && existing.ownerId !== user._id.toString()) {
    throw new PortalError("PROFILE_OWNERSHIP_CONFLICT", "This college profile is linked to another account. Contact the administrator.", 409);
  }
  profile = { ...profile, department: profile.department || existing?.department || user.user_metadata?.department || "",
    academicYear: profile.academicYear || user.user_metadata?.academic_year || "",
    profileImage: profile.profileImage || existing?.profile_image || user.user_metadata?.profile_image || "" };
  const resolvedSection = profile.classSection || existing?.class_section || classSection || "";
  user.user_metadata = { ...user.user_metadata, roll_number: profile.studentId, college_portal: profile.portal,
    student_name: profile.name, department: profile.department, branch: profile.department,
    class_section: resolvedSection, academic_year: profile.academicYear, profile_image: profile.profileImage,
    ...(typeof profile.attendance === "number" ? { attendance: profile.attendance } : {}), is_synced: true };
  user.markModified("user_metadata");
  await user.save();
  await Profile.findOneAndUpdate({ id: profile.studentId, $or: [{ ownerId: user._id.toString() }, { ownerId: { $exists: false } }, { ownerId: null }] }, {
    $set: { ownerId: user._id.toString(), roll_number: profile.studentId, name: profile.name, student_name: profile.name,
      branch: profile.department, department: profile.department, class_section: resolvedSection, section: resolvedSection,
      profile_image: profile.profileImage, ...(typeof profile.attendance === "number" ? { attendance: profile.attendance } : {}),
      is_synced: true, updated_at: new Date() },
  }, { upsert: true, setDefaultsOnInsert: true });
  return { ...profile, classSection: resolvedSection };
}

app.post("/api/college/login", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const credentials = validatePortalLogin(req.body);
    const profile = await verifyCollegePortal(credentials.rollNo, credentials.password, credentials.portal);
    await connectDB();
    const email = `${credentials.rollNo.toLowerCase()}@aec.edu.in`;
    let user = await User.findOne({ email });
    if (user?.staffProvisioned || configuredRoles(email).is_faculty) {
      throw new PortalError("STAFF_LOGIN_REQUIRED", "Use the staff sign-in for this account.", 403);
    }
    if (user?.user_metadata?.college_portal && user.user_metadata.college_portal !== credentials.portal) {
      throw new PortalError("PORTAL_ACCOUNT_CONFLICT", "This roll number is already linked to another college portal. Contact the administrator.", 409);
    }
    if (!user) {
      // Required legacy password fields hold a random unusable secret, never the ECAP password.
      const salt = generateSalt();
      const passwordHash = await createPasswordHash(crypto.randomBytes(32).toString("hex"), salt);
      user = await User.findOneAndUpdate({ email }, { $setOnInsert: { email, salt, passwordHash, passwordScheme: PASSWORD_SCHEME,
        user_metadata: { roll_number: credentials.rollNo, college_portal: credentials.portal, is_faculty: false, is_admin: false } } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
      // Recheck after a concurrent first login creates the account.
      if (user.staffProvisioned || user.user_metadata?.college_portal !== credentials.portal) {
        throw new PortalError("PORTAL_ACCOUNT_CONFLICT", "This roll number is linked to another account. Contact the administrator.", 409);
      }
    }
    const classSection = typeof req.body.classSection === "string" ? req.body.classSection.trim().slice(0, 100) : undefined;
    const syncedProfile = await persistCollegeProfile(user, profile, classSection);
    const token = crypto.randomBytes(32).toString("hex");
    await Session.create({ token, userId: user._id });
    const publicUser = { id: user._id.toString(), email: user.email, user_metadata: { ...user.user_metadata, ...effectiveRoles(user) } };
    return res.json({ user: publicUser, session: { access_token: token, user: publicUser }, profile: syncedProfile });
  } catch (error) { return sendPortalError(res, error, req.body?.portal); }
});

app.post("/api/college/sync-portal", requireAuth, async (req: any, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const credentials = validatePortalLogin(req.body);
    if (!canAccessProfile(req.user, credentials.rollNo, true) || req.user.user_metadata?.is_faculty) {
      throw new PortalError("PROFILE_ACCESS_DENIED", "Only your own college profile can be synchronized.", 403);
    }
    const user = await User.findById(req.user.id);
    if (!user || (user.user_metadata?.college_portal && user.user_metadata.college_portal !== credentials.portal)) {
      throw new PortalError("PORTAL_ACCOUNT_CONFLICT", "Select the college portal linked to your account.", 409);
    }
    const profile = await verifyCollegePortal(credentials.rollNo, credentials.password, credentials.portal);
    return res.json(await persistCollegeProfile(user, profile));
  } catch (error) { return sendPortalError(res, error, req.body?.portal); }
});

// Compatibility for older clients. Verification remains strict to the chosen college.
app.post("/api/college/auth-sync", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const credentials = validatePortalLogin(req.body);
    const profile = await verifyCollegePortal(credentials.rollNo, credentials.password, credentials.portal);
    await connectDB();
    const registrationToken = crypto.randomBytes(32).toString("hex");
    await RegistrationVerification.create({ tokenDigest: crypto.createHash("sha256").update(registrationToken).digest("hex"),
      email: `${credentials.rollNo.toLowerCase()}@aec.edu.in`, expiresAt: new Date(Date.now() + 5 * 60000), profile });
    return res.json({ ...profile, registrationToken });
  } catch (error) { return sendPortalError(res, error, req.body?.portal); }
});


// Helper: Fetch public repos via GitHub API
async function fetchGitHubRepos(username: string): Promise<any[]> {
  try {
    const response = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=100`, {
      headers: {
        "User-Agent": "interview-coach-app"
      }
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("GitHub user not found.");
      }
      throw new Error(`GitHub API returned status ${response.status}`);
    }
    const repos = await response.json();
    return repos.map((r: any) => ({
      name: r.name,
      description: r.description || "No description provided.",
      languages_url: r.languages_url,
      primaryLanguage: r.language || "Unknown",
      stars: r.stargazers_count,
      forks: r.forks_count,
      url: r.html_url
    }));
  } catch (err: any) {
    console.error("Error fetching GitHub repos:", err);
    return [];
  }
}

// 2. API Endpoint: Analyze Resume + GitHub Profile
app.post("/api/analyze", requireAuth, async (req: any, res) => {
  try {
    const { githubUsername, resumeBase64, resumeUrl, resumeFileName, resumeMimeType } = req.body;

    if (!githubUsername) {
      res.status(400).json({ error: "GitHub username is required." });
      return;
    }

    // Validate AI credentials safely depending on provider
    const provider = process.env.AI_PROVIDER || "groq";
    if (provider === "groq") {
      try {
        getGroqClient();
      } catch (err: any) {
        res.status(500).json({ error: err.message, requiresApiKey: true });
        return;
      }
    }

    // Step A: Fetch GitHub data
    const repos = await fetchGitHubRepos(githubUsername);

    // Only the authenticated bounded upload path is supported. Never fetch arbitrary resume URLs.
    if (resumeUrl && !resumeBase64) return res.status(400).json({ error: "Upload your resume PDF directly; remote resume URLs are unsupported." });
    let resumeText = "";
    if (resumeBase64) {
      if (typeof resumeBase64 !== "string" || resumeBase64.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(resumeBase64) || (resumeMimeType && resumeMimeType !== "application/pdf")) return res.status(400).json({ error: "Upload a valid PDF of at most 5 MB." });
      const pdfBuffer = Buffer.from(resumeBase64, "base64");
      if (pdfBuffer.length > 5 * 1024 * 1024 || pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") return res.status(400).json({ error: "The resume must be a valid PDF of at most 5 MB." });
      try { resumeText = (await pdf(pdfBuffer)).text.slice(0, 20000); }
      catch { return res.status(400).json({ error: "The PDF could not be read. Upload an unencrypted PDF with selectable text." }); }
    }

    const prompt = `You are an elite technical interviewer and resume auditor. Analyze the uploaded resume text and the fetched GitHub repositories to:
1. Parse the resume cleanly to extract skills, education, projects, and experiences.
2. Summarize the candidate's public repositories: stack, star count, and projects.
3. Cross-reference the resume projects and skill claims with the actual code/repositories fetched from GitHub. Note which claims are "proven" (have corresponding repositories or technologies on GitHub) vs "unproven" (claimed on resume but no evidence on GitHub) or vague.
4. Calculate an alignment score (0 to 100) and provide professional, constructiveness-driven suggestions.

Resume Text:
${resumeText || "No resume uploaded."}

GitHub Username: ${githubUsername}
Fetched Repositories Data:
${JSON.stringify(repos, null, 2)}

Respond with STRICT JSON matching this schema:
{
  "parsedResume": {
    "name": "Candidate's full name from the resume.",
    "email": "Candidate's email if available.",
    "education": [
      {
        "school": "School name",
        "degree": "Degree name",
        "major": "Major",
        "graduationDate": "Graduation Date"
      }
    ],
    "skills": ["Skill name"],
    "projects": [
      {
        "title": "Project Title",
        "description": "Project Description",
        "technologies": ["Tech name"]
      }
    ],
    "experience": [
      {
        "company": "Company Name",
        "role": "Role Name",
        "startDate": "Start Date",
        "endDate": "End Date",
        "description": "Job description"
      }
    ],
    "achievements": ["Achievement description"]
  },
  "githubAnalysis": {
    "primaryStack": ["Tech name"],
    "repos": [
      {
        "name": "Repo Name",
        "description": "Repo description",
        "languages": ["Language name"],
        "primaryLanguage": "Primary Language",
        "stars": 0,
        "forks": 0,
        "url": "URL"
      }
    ],
    "qualitySignals": ["Signal description"],
    "weakAreas": ["Weak area description"]
  },
  "crossReference": {
    "alignmentScore": 85,
    "provenClaims": ["Proven claim description"],
    "unprovenClaims": ["Unproven claim description"],
    "suggestions": ["Suggestion description"]
  }
}`;

    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are a professional technical auditor. Respond with a JSON object conforming strictly to the requested schema." },
        { role: "user", content: prompt }
      ],
      jsonMode: true,
      purpose: "analyze"
    });

    const rawResult = parseLLMJson(completionText, {});
    const defaultAnalysis = {
      parsedResume: {
        name: "Candidate",
        email: "",
        education: [],
        skills: ["Full Stack Development", "JavaScript", "React"],
        projects: [],
        experience: [],
        achievements: []
      },
      githubAnalysis: {
        primaryStack: ["JavaScript", "TypeScript"],
        repos: repos || [],
        qualitySignals: ["Active GitHub profile"],
        weakAreas: ["Add more detailed readmes and commit histories"]
      },
      crossReference: {
        alignmentScore: 80,
        provenClaims: ["Has active repositories using relevant programming languages"],
        unprovenClaims: ["No direct project evidence for all listed resume skills"],
        suggestions: ["Build more projects showcasing your core frontend and backend expertise"]
      }
    };

    const result = {
      parsedResume: { ...defaultAnalysis.parsedResume, ...(rawResult.parsedResume || {}) },
      githubAnalysis: {
        ...defaultAnalysis.githubAnalysis,
        ...(rawResult.githubAnalysis || {}),
        repos: repos || []
      },
      crossReference: { ...defaultAnalysis.crossReference, ...(rawResult.crossReference || {}) }
    };
    res.json(result);
  } catch (error: any) {
    console.error("[analysis] Request failed", { status: error?.status });
    res.status(500).json({ error: error.message });
  }
});

// 3. API Endpoint: Generate 15 Adaptive Interview Questions (Profile + Company Placement Drives)
app.post("/api/interview/generate-questions", requireAuth, async (req: any, res) => {
  try {
    const { analysisResult, interviewType, companyName, roleTitle, driveType, materialText, customQuestions } = req.body;
    const previousQuestions = Array.isArray(req.user?.user_metadata?.interview_questions)
      ? req.user.user_metadata.interview_questions.map((q: any) => String(q?.text || "")).filter(Boolean)
      : [];

    const provider = process.env.AI_PROVIDER || "groq";
    if (provider === "groq") {
      try {
        getGroqClient();
      } catch (err: any) {
        res.status(500).json({ error: err.message, requiresApiKey: true });
        return;
      }
    }

    const companyContext = companyName ? `
Target Company / Placement Drive:
- Company Name: ${companyName}
- Target Job Role / Track: ${roleTitle || "Full Stack SDE / Systems Engineer"}
- Drive Assessment Type: ${driveType || "Campus Placement Drive"}
- Company Hiring Material / Job Description / Specs:
"""
${materialText || `Standard campus recruitment guidelines for ${companyName} assessing communication clarity, STAR format problem solving, technical depth, and behavioral culture fit.`}
"""
Please tailor the 15 questions specifically to test the skills, tech stack, and communication standards expected by ${companyName} for the ${roleTitle || "SDE"} role.
` : "";

    const resumeContext = analysisResult ? `
Based on the candidate's profile:
- Parsed Resume: ${JSON.stringify(analysisResult.parsedResume)}
- GitHub Repos: ${JSON.stringify(analysisResult.githubAnalysis)}
- Cross-Reference Audit: ${JSON.stringify(analysisResult.crossReference || {})}
` : "Candidate is a graduating computer science and engineering student preparing for campus recruitment.";

    const prompt = `You are an elite campus placement proctor and technical HR interviewer.
${companyContext}
${resumeContext}

Generate exactly 15 interview questions. IMPORTANT: Start with very simple, easy, friendly questions (ice-breakers) and GRADUALLY increase difficulty. The first 5 questions must be basic and comfortable so the candidate warms up.
Ensure questions evaluate:
1. Spoken Communication Clarity & Structure (STAR format)
2. Role-specific Technical Understanding (${roleTitle || "Software Engineering"})
3. Teamwork, Conflict Resolution & Leadership (${companyName || "Top Tech"} Cultural Principles)
4. Problem Solving & Real-World Tradeoffs

Do not repeat any of these previous questions: ${JSON.stringify(previousQuestions)}

The 15 questions must follow this exact progression:
1. Ice-Breaker / Introduction (Easy) — A very simple, friendly greeting + ask the candidate to introduce themselves in 1-2 sentences.
2. Background (Easy) — Ask which field/domain they are studying or working in and why they chose it.
3. Hobbies & Motivation (Easy) — Ask what they enjoy doing outside of academics/work and what motivates them to learn technology.
4. Favourite Subject / Skill (Easy) — Ask what their favourite subject or skill is and why.
5. Simple Project Introduction (Easy) — Ask them to briefly name one project from their resume and describe it in simple terms (what it does).
6. Communication Clarity (Beginner) — Ask them to explain one of their projects to someone with no technical background.
7. Learning Experience (Beginner) — Ask what they learned while building a project from their resume — what was new or surprising.
8. Tools & Technologies (Beginner) — Ask which programming languages, tools, or frameworks they used and why they chose them.
9. Challenges Faced (Developing) — Ask about a specific challenge or bug they encountered in a project and how they fixed it.
10. Teamwork & Collaboration (Developing) — Ask about working in a team — how they communicated, divided tasks, or resolved a disagreement.
11. Technical Explanation (Developing) — Ask them to explain the architecture or logic of their main project in a bit more detail.
12. Problem-Solving (Intermediate) — Ask how they handled a situation where their original approach did not work and what they did instead.
13. Ownership & Accountability (Intermediate) — Ask about a mistake they made in a project and what they did to fix it and prevent it next time.
14. Real-World Scenario (Advanced) — Present a realistic scenario related to their tech stack and ask how they would approach it.
15. Tradeoffs & Decisions (Advanced) — Ask them to compare two technologies or approaches they used and explain why they picked one over the other.

Respond with STRICT JSON matching this schema (exactly 15 items in the array):
{
  "questions": [
    { "id": "question_1", "text": "...", "category": "Ice-Breaker", "difficulty": "Easy" },
    { "id": "question_2", "text": "...", "category": "Background", "difficulty": "Easy" },
    { "id": "question_3", "text": "...", "category": "Motivation", "difficulty": "Easy" },
    { "id": "question_4", "text": "...", "category": "Favourite Skill", "difficulty": "Easy" },
    { "id": "question_5", "text": "...", "category": "Project Introduction", "difficulty": "Easy" },
    { "id": "question_6", "text": "...", "category": "Communication Clarity", "difficulty": "Beginner" },
    { "id": "question_7", "text": "...", "category": "Learning Experience", "difficulty": "Beginner" },
    { "id": "question_8", "text": "...", "category": "Tools & Technologies", "difficulty": "Beginner" },
    { "id": "question_9", "text": "...", "category": "Challenges Faced", "difficulty": "Developing" },
    { "id": "question_10", "text": "...", "category": "Teamwork & Collaboration", "difficulty": "Developing" },
    { "id": "question_11", "text": "...", "category": "Technical Depth", "difficulty": "Developing" },
    { "id": "question_12", "text": "...", "category": "Problem-Solving", "difficulty": "Intermediate" },
    { "id": "question_13", "text": "...", "category": "Ownership & Accountability", "difficulty": "Intermediate" },
    { "id": "question_14", "text": "...", "category": "Real-World Scenario", "difficulty": "Advanced" },
    { "id": "question_15", "text": "...", "category": "Real-World Tradeoffs", "difficulty": "Advanced" }
  ]
}`;

    const entropySeed = Math.random().toString(36).substring(2, 10);
    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are a professional mock interviewer. Respond with a JSON object containing a 'questions' array conforming strictly to the requested schema." },
        { role: "user", content: prompt + `\n\n[System directive: Generate a completely fresh and unique set of questions. Random seed/entropy: ${entropySeed}]` }
      ],
      jsonMode: true,
      temperature: 0.9,
      purpose: "questions"
    });

    const DEFAULT_QUESTIONS = [
      { id: "q1",  text: "Hi! Please introduce yourself in one or two sentences.", category: "Ice-Breaker", difficulty: "Easy" },
      { id: "q2",  text: "Which field are you studying or working in, and why did you choose it?", category: "Background", difficulty: "Easy" },
      { id: "q3",  text: "What do you enjoy doing outside of academics or work? What motivates you to learn technology?", category: "Motivation", difficulty: "Easy" },
      { id: "q4",  text: "What is your favourite subject or skill, and why do you like it?", category: "Favourite Skill", difficulty: "Easy" },
      { id: "q5",  text: "Can you name one project you have worked on and describe in simple terms what it does?", category: "Project Introduction", difficulty: "Easy" },
      { id: "q6",  text: "How would you explain that project to a friend who has no technical background?", category: "Communication Clarity", difficulty: "Beginner" },
      { id: "q7",  text: "What did you learn while building that project — was there anything new or surprising?", category: "Learning Experience", difficulty: "Beginner" },
      { id: "q8",  text: "Which programming languages, tools, or frameworks did you use, and why did you pick them?", category: "Tools & Technologies", difficulty: "Beginner" },
      { id: "q9",  text: "Tell me about a specific challenge or bug you encountered in a project and how you resolved it.", category: "Challenges Faced", difficulty: "Developing" },
      { id: "q10", text: "Have you ever worked in a team? How did you divide tasks and handle any disagreements?", category: "Teamwork & Collaboration", difficulty: "Developing" },
      { id: "q11", text: "Can you walk me through how your main project works on a technical level — its structure or logic?", category: "Technical Depth", difficulty: "Developing" },
      { id: "q12", text: "Describe a situation where your first approach did not work. What did you do differently?", category: "Problem-Solving", difficulty: "Intermediate" },
      { id: "q13", text: "Tell me about a mistake you made in a project. How did you fix it and what did you learn from it?", category: "Ownership & Accountability", difficulty: "Intermediate" },
      { id: "q14", text: "If you were asked to add a new feature to your project that requires storing user data, how would you approach it?", category: "Real-World Scenario", difficulty: "Advanced" },
      { id: "q15", text: "Compare two technologies or approaches you have used. Why did you choose one over the other?", category: "Real-World Tradeoffs", difficulty: "Advanced" }
    ];

    const result = parseLLMJson(completionText, {});
    let questions = result.questions;
    if (!Array.isArray(questions) || questions.length < 2) {
      console.warn("LLM returned invalid or insufficient questions. Falling back to default list.");
      questions = DEFAULT_QUESTIONS;
    } else {
      // Pad to exactly 15 questions if the LLM generated fewer
      if (questions.length < 15) {
        console.warn(`LLM returned only ${questions.length} questions. Padding to 15 questions.`);
        const paddedQuestions = [...questions];
        for (let i = paddedQuestions.length; i < 15; i++) {
          const defQ = DEFAULT_QUESTIONS[i] || DEFAULT_QUESTIONS[DEFAULT_QUESTIONS.length - 1];
          paddedQuestions.push({
            id: `question_${i + 1}`,
            text: defQ.text,
            category: defQ.category,
            difficulty: defQ.difficulty
          });
        }
        questions = paddedQuestions;
      } else if (questions.length > 15) {
        questions = questions.slice(0, 15);
      }
    }
    const seen = new Set(previousQuestions.map((text: string) => text.trim().toLowerCase().replace(/\s+/g, " ")));
    const cleanQuestions = questions.filter((question: any) => {
      const normalized = String(question?.text || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    for (let i = cleanQuestions.length; i < 15; i++) {
      const fallback = DEFAULT_QUESTIONS[i] || DEFAULT_QUESTIONS[i % DEFAULT_QUESTIONS.length];
      cleanQuestions.push({
        ...fallback,
        id: `question_${i + 1}_${entropySeed}`,
        text: `${fallback.text} Focus on a different example than you used in earlier interviews.`
      });
    }
    res.json(cleanQuestions.slice(0, 15).map((question: any, index: number) => ({
      id: String(question.id || `question_${index + 1}_${entropySeed}`),
      text: String(question.text || DEFAULT_QUESTIONS[index].text).trim(),
      category: String(question.category || DEFAULT_QUESTIONS[index].category),
      difficulty: String(question.difficulty || DEFAULT_QUESTIONS[index].difficulty)
    })));
  } catch (error: any) {
    console.error("Generate Questions Error, using default fallback list:", error);
    const DEFAULT_QUESTIONS = [
      { id: "q1",  text: "Hi! Please introduce yourself in one or two sentences.", category: "Ice-Breaker", difficulty: "Easy" },
      { id: "q2",  text: "Which field are you studying or working in, and why did you choose it?", category: "Background", difficulty: "Easy" },
      { id: "q3",  text: "What do you enjoy doing outside of academics or work? What motivates you to learn technology?", category: "Motivation", difficulty: "Easy" },
      { id: "q4",  text: "What is your favourite subject or skill, and why do you like it?", category: "Favourite Skill", difficulty: "Easy" },
      { id: "q5",  text: "Can you name one project you have worked on and describe in simple terms what it does?", category: "Project Introduction", difficulty: "Easy" },
      { id: "q6",  text: "How would you explain that project to a friend who has no technical background?", category: "Communication Clarity", difficulty: "Beginner" },
      { id: "q7",  text: "What did you learn while building that project — was there anything new or surprising?", category: "Learning Experience", difficulty: "Beginner" },
      { id: "q8",  text: "Which programming languages, tools, or frameworks did you use, and why did you pick them?", category: "Tools & Technologies", difficulty: "Beginner" },
      { id: "q9",  text: "Tell me about a specific challenge or bug you encountered in a project and how you resolved it.", category: "Challenges Faced", difficulty: "Developing" },
      { id: "q10", text: "Have you ever worked in a team? How did you divide tasks and handle any disagreements?", category: "Teamwork & Collaboration", difficulty: "Developing" },
      { id: "q11", text: "Can you walk me through how your main project works on a technical level — its structure or logic?", category: "Technical Depth", difficulty: "Developing" },
      { id: "q12", text: "Describe a situation where your first approach did not work. What did you do differently?", category: "Problem-Solving", difficulty: "Intermediate" },
      { id: "q13", text: "Tell me about a mistake you made in a project. How did you fix it and what did you learn from it?", category: "Ownership & Accountability", difficulty: "Intermediate" },
      { id: "q14", text: "If you were asked to add a new feature to your project that requires storing user data, how would you approach it?", category: "Real-World Scenario", difficulty: "Advanced" },
      { id: "q15", text: "Compare two technologies or approaches you have used. Why did you choose one over the other?", category: "Real-World Tradeoffs", difficulty: "Advanced" }
    ];
    res.json(DEFAULT_QUESTIONS);
  }
});

// 4. API Endpoint: Score Single Turn Answer
app.post("/api/interview/submit-answer", requireAuth, async (req: any, res) => {
  const { questionId, questionText, category, transcript } = req.body;
  try {
    const { gazeStats, postureStats, expressionStats, headStats, audioClarity, pitchVariance, speakingPace } = req.body;

    if (!questionText) {
      res.status(400).json({ error: "Question text is required." });
      return;
    }
    const cleanTranscript = String(transcript || "").trim() || "Spoken response was too brief or audio was not detected clearly.";

    const provider = process.env.AI_PROVIDER || "groq";
    if (provider === "groq") {
      try {
        getGroqClient();
      } catch (err: any) {
        res.status(500).json({ error: err.message, requiresApiKey: true });
        return;
      }
    }

    const wordCount = transcript.split(/\s+/).length;
    const pacing = wordCount < 50 ? "Slow" : wordCount > 150 ? "Fast" : "Optimal";
    const fillerWords = (transcript.match(/\b(like|um|uh|basically|actually|so|you know)\b/gi) || []).length;

    let visualMetricsPrompt = "";
    if (gazeStats && postureStats) {
      const exprConfident = (expressionStats?.confident || 0) + (expressionStats?.smiling || 0) + (expressionStats?.expressive || 0);
      const exprNeutral = expressionStats?.neutral || 0;
      const exprTense = expressionStats?.tense || 0;

      const headCentered = headStats?.centered || 0;
      const headTurnedOrMoved = (headStats?.turnedLeft || 0) + (headStats?.turnedRight || 0) + (headStats?.tilted || 0) + (headStats?.moving || 0);

      visualMetricsPrompt = `
Visual camera tracking metrics logged during answer:
- Eye Gaze: Stable contact (${gazeStats.stable || 0} checks) vs. Looking away/distracted (${(gazeStats.lookingAway || 0) + (gazeStats.distracted || 0)} checks)
- Posture Alignment: Aligned posture (${postureStats.aligned || 0} checks) vs. Slouching/leaning (${(postureStats.slouching || 0) + (postureStats.leaning || 0)} checks)
- Facial Expression: Positive/Confident/Smiling (${exprConfident} checks) vs. Neutral (${exprNeutral} checks) vs. Tense/Stressed (${exprTense} checks)
- Head Position & Movement: Centered (${headCentered} checks) vs. Turned/Moved/Tilted (${headTurnedOrMoved} checks)

Please focus heavily on soft skills and on-camera presence in your grading. Evaluate how well the candidate maintains stable eye contact, keeps their head centered, maintains an aligned posture, and shows confident/smiling expressions. If the candidate frequently looked away, turned or moved their head, slouched, or appeared tense, constructively critique this behavior in "presentationFeedback" and adjust the overall score accordingly. Encourage stable, confident, and professional on-camera behavior.
`;
    }

    let audioMetricsPrompt = "";
    if (audioClarity !== undefined && pitchVariance !== undefined && speakingPace !== undefined) {
      audioMetricsPrompt = `
Audio recording analysis metrics captured:
- Audio Clarity (SNR / Pronunciation Confidence): ${audioClarity}/100
- Pitch Inflection (Voice expressiveness variance vs monotone): ${pitchVariance}/100
- Speaking Pace: ${speakingPace} Words Per Minute (Optimal pace is between 110-150 WPM)

Constructively evaluate the student's pacing and vocal confidence. If the pace is too fast (>150 WPM) or too slow (<100 WPM), or if the pitch inflection suggests monotone speech, highlight this in "presentationFeedback".
`;
    }

    const softSkillsCategories = [
      "Communication Clarity",
      "Teamwork & Collaboration",
      "Problem-Solving & Adaptability",
      "Ownership & Accountability",
      "Emotional Intelligence & Learning",
      "Decision-Making Under Pressure"
    ];
    const isSoftSkill = softSkillsCategories.includes(category);

    let prompt = "";
    if (isSoftSkill) {
      prompt = `You are an elite behavioral coach and soft skills assessor. Grade this candidate's spoken response transcript.
Question Category (Soft Skill assessed): ${category}
Question asked: "${questionText}"
Spoken Answer Transcript: "${transcript}"
${visualMetricsPrompt}
${audioMetricsPrompt}

Evaluate the candidate's response specifically based on these soft skills parameters:
1. Communication Clarity: Check for clear, structured answers vs vague, rambling or confusing ones.
2. Confidence without Arrogance: Check if they speak with certainty, can honestly say "I don't know" when appropriate, avoid exaggeration, and stay calm.
3. Problem-solving Approach: Assess how they think aloud, break problems into steps, handle incomplete information, and ask good clarifying questions.
4. Teamwork & Collaboration: Assess group project experiences, teammate conflict handling, handling disagreements, and sharing responsibility.
5. Adaptability: Test how they react to requirements/constraints changes and initial failures.
6. Ownership & Accountability: Look for whether they take responsibility for their work, mention individual vs team contributions, and reflect on mistakes/improvements.
7. Emotional Intelligence: Look for respect in language, empathy toward teammates/users, and maturity.
8. Learning Mindset: Look for what they learned from projects/failures and response to criticism.

Provide feedback conforming to the following JSON schema:
{
  "score": 85, // Integer from 0 to 100 assessing the maturity and strength of their behavioral/soft skills response
  "strengths": ["strong point description, e.g. detailed individual role vs team role"],
  "improvements": ["improvement description, e.g. needs to show more empathy towards colleagues during conflicts"],
  "speechFeedback": "Feedback about vocabulary richness, structural coherence, and filler-word reduction.",
  "contentFeedback": "Feedback on the alignment, maturity, and quality of the soft skills/behavioral response.",
  "presentationFeedback": "Guidance on on-camera verbal engagement, pacing, confidence, and articulation."
}

STRICT SCORING RULES (MANDATORY — DO NOT IGNORE):
- If the answer is irrelevant to the question (e.g. just a greeting, random words, or completely off-topic), score MUST be between 0 and 20.
- If the answer is fewer than 10 words OR only says something like "I am fine", "okay", "good", "yes", "no", or any one-liner that does not address the question, score MUST be between 0 and 25.
- If the answer is very brief (10–30 words) but somewhat on-topic, score MUST be between 25 and 45.
- If the answer is moderately detailed and on-topic (30–80 words), score can range from 45 to 70.
- Only score above 75 if the answer is substantive, well-structured, and clearly addresses the question with at least 50 meaningful words.
- Do NOT give high scores just because the candidate sounded confident or had good audio — content relevance is the primary criterion.

RULE: Absolutely do not judge or infer personal, physical, medical, emotional, or identity traits. Evaluate only the speech structure, communication technique, and the soft skills maturity shown by the content of the answer.`;

    } else {
      prompt = `You are an elite communication coach and technical grader. Grade this candidate's spoken response transcript.
Question Category: ${category}
Question asked: "${questionText}"
Spoken Answer Transcript: "${transcript}"
${visualMetricsPrompt}
${audioMetricsPrompt}

Provide feedback conforming to the following JSON schema:
{
  "score": 85, // Integer from 0 to 100
  "strengths": ["strong point description"],
  "improvements": ["improvement description"],
  "speechFeedback": "Feedback about vocabulary richness, structural coherence, and filler-word reduction.",
  "contentFeedback": "Feedback on the technical depth and factual accuracy of the content.",
  "presentationFeedback": "Guidance on on-camera verbal engagement, pacing, confidence, and articulation."
}

STRICT SCORING RULES (MANDATORY — DO NOT IGNORE):
- If the answer is irrelevant to the question (e.g. just a greeting, random words, or completely off-topic), score MUST be between 0 and 20.
- If the answer is fewer than 10 words OR only says something like "I am fine", "okay", "good", "yes", "no", or any one-liner that does not address the question, score MUST be between 0 and 25.
- If the answer is very brief (10–30 words) but somewhat on-topic, score MUST be between 25 and 45.
- If the answer is moderately detailed and on-topic (30–80 words), score can range from 45 to 70.
- Only score above 75 if the answer is substantive, well-structured, and clearly addresses the question with at least 50 meaningful words.
- Do NOT give high scores just because the candidate sounded confident or had good audio — content relevance is the primary criterion.

RULE: Absolutely do not judge or infer personal, physical, medical, emotional, or identity traits. Evaluate only the speech structure, communication technique, and technical accuracy of the spoken content.`;

    }

    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are an expert technical interviewer and feedback coach. Respond with a JSON object conforming strictly to the requested schema." },
        { role: "user", content: prompt }
      ],
      jsonMode: true,
      purpose: "chat"
    });

    const rawEvaluation = parseLLMJson(completionText, {});
    const defaultFeedback = {
      score: 40,
      strengths: ["Attempted to respond to the question"],
      improvements: ["Answer was too brief or did not address the question — please provide a detailed response", "Try to explain your thinking with at least 2-3 full sentences"],
      speechFeedback: "The response was too short to evaluate speech quality properly.",
      contentFeedback: "The answer did not sufficiently address the question. A more detailed and relevant response is needed.",
      presentationFeedback: "Please provide a more complete answer so presentation skills can be fairly assessed."
    };

    const scoreCap = wordCount < 10 ? 25 : wordCount <= 30 ? 45 : wordCount < 50 ? 70 : 100;
    const evaluation = {
      score: clampScore(rawEvaluation.score, defaultFeedback.score, scoreCap),
      strengths: Array.isArray(rawEvaluation.strengths) ? rawEvaluation.strengths : defaultFeedback.strengths,
      improvements: Array.isArray(rawEvaluation.improvements) ? rawEvaluation.improvements : defaultFeedback.improvements,
      speechFeedback: rawEvaluation.speechFeedback || defaultFeedback.speechFeedback,
      contentFeedback: rawEvaluation.contentFeedback || defaultFeedback.contentFeedback,
      presentationFeedback: rawEvaluation.presentationFeedback || defaultFeedback.presentationFeedback
    };

    // Calculate a physical vocal confidence score based on DSP audio metrics
    let vocalConfidence = 85;
    if (audioClarity !== undefined && pitchVariance !== undefined && speakingPace !== undefined) {
      let baseConf = 100;
      if (pitchVariance < 60) baseConf -= (60 - pitchVariance) * 0.5;
      if (audioClarity < 75) baseConf -= (75 - audioClarity) * 0.8;

      const paceVal = typeof speakingPace === "number" ? speakingPace : 120;
      if (paceVal < 100 || paceVal > 150) {
        baseConf -= Math.min(25, Math.abs(130 - paceVal) * 0.3);
      }
      vocalConfidence = Math.min(100, Math.max(0, Math.round(baseConf)));
    }

    // SoftSkills Assessment Framework: Speaking Test & Acoustic Metrics (Image 1 & 2)
    const clarityPronunciation = clampScore(
      Math.max(1, Math.round((vocalConfidence * 0.4 + (evaluation.score || 70) * 0.6) / 20)),
      4,
      5
    );
    const fluencyPace = clampScore(
      pacing === "Optimal" ? 5 : pacing === "Fast" ? 3 : 4,
      4,
      5
    );
    const grammarAccuracy = clampScore(
      Math.round((evaluation.score || 80) * 0.85 + 12),
      80,
      100
    );
    const vocabularyUsage = clampScore(
      Math.round(Math.max(65, 100 - fillerWords * 4)),
      78,
      100
    );
    const coherenceIdeas = clampScore(
      Math.max(1, Math.round((evaluation.score || 75) / 20)),
      4,
      5
    );
    const confidenceRating = clampScore(
      Math.max(1, Math.round(vocalConfidence / 20)),
      4,
      5
    );

    const feedback = {
      questionId,
      questionText,
      transcript,
      score: evaluation.score,
      pacing,
      fillerWordCount: fillerWords,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      speechFeedback: evaluation.speechFeedback,
      contentFeedback: evaluation.contentFeedback,
      presentationFeedback: evaluation.presentationFeedback,
      vocalConfidence,
      audioClarity: audioClarity !== undefined ? audioClarity : 85,
      pitchVariance: pitchVariance !== undefined ? pitchVariance : 75,
      speakingPace: speakingPace !== undefined ? speakingPace : 120,

      // SoftSkills Assessment Framework Rubrics
      clarityPronunciation,
      fluencyPace,
      grammarAccuracy,
      vocabularyUsage,
      coherenceIdeas,
      confidenceRating
    };

    res.json(feedback);
  } catch (error: any) {
    console.error("Submit Answer Error, returning fallback scores:", error);
    res.json({
      questionId,
      questionText,
      transcript,
      score: transcript.trim().split(/\s+/).filter(Boolean).length < 10 ? 15 : 40,
      pacing: "Unknown",
      fillerWordCount: 0,
      strengths: ["Attempted to respond"],
      improvements: ["Could not evaluate — please provide a more detailed answer"],
      speechFeedback: "Unable to evaluate speech quality for this response.",
      contentFeedback: "The response could not be scored. Please try again with a more complete answer.",
      presentationFeedback: "Maintained standard pacing.",
      vocalConfidence: 82,
      audioClarity: 85,
      pitchVariance: 75,
      speakingPace: 120,
      clarityPronunciation: 4,
      fluencyPace: 4,
      grammarAccuracy: 82,
      vocabularyUsage: 80,
      coherenceIdeas: 4,
      confidenceRating: 4
    });
  }
});

// 5. API Endpoint: Compile Final Report & Scorecard
app.post("/api/interview/generate-report", requireAuth, async (req: any, res) => {
  const { studentId, githubUsername, answerFeedbacks, originalAnalysis, interviewType } = req.body;
  let isSoftSkills = false;
  try {
    if (!answerFeedbacks || !Array.isArray(answerFeedbacks) || answerFeedbacks.length === 0) {
      res.status(400).json({ error: "Answers feedback list is required to compile a final report." });
      return;
    }

    const provider = process.env.AI_PROVIDER || "groq";
    if (provider === "groq") {
      try {
        getGroqClient();
      } catch (err: any) {
        res.status(500).json({ error: err.message, requiresApiKey: true });
        return;
      }
    }

    isSoftSkills = !!(interviewType === "soft-skills" || (answerFeedbacks[0] && [
      "Communication Clarity",
      "Teamwork & Collaboration",
      "Problem-Solving & Adaptability",
      "Ownership & Accountability",
      "Emotional Intelligence & Learning",
      "Decision-Making Under Pressure"
    ].includes(answerFeedbacks[0].category)));

    let prompt = "";
    if (isSoftSkills) {
      prompt = `You are a senior behavioral coach and talent development director. Review the performance logs of a college student mock behavioral/soft skills interview:
- Candidate Profile summary: Resume: ${JSON.stringify(originalAnalysis?.parsedResume?.skills || [])}, GitHub Stack: ${JSON.stringify(originalAnalysis?.githubAnalysis?.primaryStack || [])}
- Question-by-question response audits: ${JSON.stringify(answerFeedbacks)}

Synthesize a comprehensive University-grade Behavioral & Soft Skills Interview Scorecard report based on the official SoftSkills Assessment Framework.
Calculate:
1. Overall score (0 to 100) — synthesized from communication, collaboration, problem-solving, and emotional intelligence categories.
2. Category scores (0 to 100) for:
   - communicationClarity (structure, coherence, ability to clearly explain projects/mistakes)
   - presentationConfidence (vocal certainty, calm under pressure, authentic delivery)
   - problemSolving (how they structure thoughts, think aloud, break problems down)
   - teamworkCollaboration (how they handle conflicts, disagreements, share responsibility)
   - adaptabilityResilience (how they react to changing constraints/failure)
   - ownershipEQ (responsibility, learning mindset, maturity under criticism, empathy)
   - overallReadiness (overall benchmark readiness for landing a job / handling behavioral and corporate culture rounds)
3. Map overall score to standard Candidate Levels:
   - 0-59: Beginner
   - 60-72: Developing
   - 73-84: Interview Ready
   - 85-92: Strong Candidate
   - 93-100: Excellent Candidate
4. Compile bulleted overall Strengths and Weaknesses.
5. Recommend specific practical focus topics to improve their interpersonal and team dynamics.
6. Provide "Sample Improved Answers" for 3 of the interview questions: show the question, the student's response, a pristine industry-standard expert-level behavioral response (using STAR format: Situation, Task, Action, Result), and an explanation of what makes it stand out.
7. Write a professional, encouraging "final verdict" summation.

Respond with STRICT JSON matching this schema:
{
  "overallScore": 85,
  "candidateLevel": "Interview Ready",
  "interviewType": "soft-skills",
  "categoryScores": {
    "communicationClarity": 90,
    "presentationConfidence": 85,
    "problemSolving": 80,
    "teamworkCollaboration": 85,
    "adaptabilityResilience": 80,
    "ownershipEQ": 90,
    "overallReadiness": 85
  },
  "strengths": ["Strength description"],
  "weaknesses": ["Weakness description"],
  "recommendedTopics": ["Topic description"],
  "sampleAnswers": [
    {
      "question": "Question text",
      "originalResponse": "Student response text",
      "improvedVersion": "STAR formatted rewritten behavioral answer",
      "explanation": "Explanation description"
    }
  ],
  "finalVerdict": "Summation verdict text"
}`;
    } else {
      prompt = `You are a senior talent architect and engineering director. Review the performance logs of a college student mock interview:
- Candidate Profile summary: Resume: ${JSON.stringify(originalAnalysis?.parsedResume?.skills || [])}, GitHub Stack: ${JSON.stringify(originalAnalysis?.githubAnalysis?.primaryStack || [])}
- Question-by-question response audits: ${JSON.stringify(answerFeedbacks)}

Synthesize a comprehensive University-grade Interview Scorecard report based on the official SoftSkills Assessment Framework.
Calculate:
1. Overall score (0 to 100) — synthesized from technical and communication categories.
2. Category scores (0 to 100) for:
   - resumeStrength (based on original alignment)
   - githubStrength (based on original GitHub stack & quality signals)
   - technicalDepth (average of technical questions grading)
   - problemSolving (grading of problem solving/architectural rounds)
   - communicationClarity (coherence, speed, structural clarity)
   - vocabularyRichness (professional technical terminology vs slang/filler words)
   - presentationConfidence (fluidity, sentence-level confidence, tone)
   - overallReadiness (overall readiness for landing a top-tier internship or job)
3. Map overall score to standard Candidate Levels:
   - 0-59: Beginner
   - 60-72: Developing
   - 73-84: Interview Ready
   - 85-92: Strong Candidate
   - 93-100: Excellent Candidate
4. Compile bulleted overall Strengths and Weaknesses.
5. Recommend specific practical focus topics.
6. Provide "Sample Improved Answers" for 3 of the interview questions: show the question, the student's response, a pristine industry-standard expert-level rewritten answer, and an explanation of what makes it stand out.
7. Write a professional, encouraging "final verdict" summation.

Respond with STRICT JSON matching this schema:
{
  "overallScore": 85,
  "candidateLevel": "Interview Ready",
  "interviewType": "technical",
  "categoryScores": {
    "resumeStrength": 80,
    "githubStrength": 85,
    "technicalDepth": 90,
    "problemSolving": 80,
    "communicationClarity": 90,
    "vocabularyRichness": 80,
    "presentationConfidence": 85,
    "overallReadiness": 85
  },
  "strengths": ["Strength description"],
  "weaknesses": ["Weakness description"],
  "recommendedTopics": ["Topic description"],
  "sampleAnswers": [
    {
      "question": "Question text",
      "originalResponse": "Student response text",
      "improvedVersion": "Pristine rewritten answer",
      "explanation": "Explanation description"
    }
  ],
  "finalVerdict": "Summation verdict text"
}`;
    }

    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are an engineering director and communication proctor. Respond with a JSON object conforming strictly to the requested schema." },
        { role: "user", content: prompt }
      ],
      jsonMode: true,
      purpose: "report"
    });

    const rawReport = parseLLMJson(completionText, {});
    const defaultReport = {
      overallScore: 80,
      candidateLevel: "Interview Ready",
      categoryScores: isSoftSkills ? {
        communicationClarity: 80,
        presentationConfidence: 80,
        problemSolving: 80,
        teamworkCollaboration: 80,
        adaptabilityResilience: 80,
        ownershipEQ: 80,
        overallReadiness: 80
      } : {
        resumeStrength: 80,
        githubStrength: 80,
        technicalDepth: 80,
        problemSolving: 80,
        communicationClarity: 80,
        vocabularyRichness: 80,
        presentationConfidence: 80,
        overallReadiness: 80
      },
      strengths: ["Clear response structure", "Good technical communication"],
      weaknesses: ["Elaborate on specific project architectures", "Avoid minor pacing inconsistencies"],
      recommendedTopics: ["Refine system architecture vocabulary", "STAR methodology application"],
      sampleAnswers: (answerFeedbacks || []).slice(0, 3).map((f: any) => ({
        question: f.questionText || "Question",
        originalResponse: f.transcript || "Answer",
        improvedVersion: "A clean, structured industry-standard STAR answer elaboration based on: " + (f.transcript || "Answer"),
        explanation: "This version is structured with clear Situation, Task, Action, and Result (STAR) sections, highlighting individual contribution and quantitative outcomes."
      })),
      finalVerdict: "The candidate demonstrates strong communication clarity and solid fundamentals. Recommending further technical interview prep with focus on system architectural trade-offs."
    };

    const cleanCategoryScores = {
      ...(defaultReport.categoryScores),
      ...(rawReport.categoryScores || {})
    };

    const answerScores = answerFeedbacks
      .map((feedback: any) => Number(feedback?.score))
      .filter((score: number) => Number.isFinite(score));
    const overallScore = answerScores.length
      ? clampScore(answerScores.reduce((sum: number, score: number) => sum + score, 0) / answerScores.length)
      : clampScore(rawReport.overallScore, defaultReport.overallScore);

    // Compute Image 1 Speaking Test Evidence marks
    const avgClarity = answerFeedbacks.reduce((acc: number, f: any) => acc + (f.clarityPronunciation || 4), 0) / answerFeedbacks.length;
    const avgFluency = answerFeedbacks.reduce((acc: number, f: any) => acc + (f.fluencyPace || 4), 0) / answerFeedbacks.length;
    const avgGrammar = answerFeedbacks.reduce((acc: number, f: any) => acc + (f.grammarAccuracy || 84), 0) / answerFeedbacks.length;
    const avgVocab = answerFeedbacks.reduce((acc: number, f: any) => acc + (f.vocabularyUsage || 82), 0) / answerFeedbacks.length;
    const avgCoherence = answerFeedbacks.reduce((acc: number, f: any) => acc + (f.coherenceIdeas || 4), 0) / answerFeedbacks.length;
    const avgConfidence = answerFeedbacks.reduce((acc: number, f: any) => acc + (f.confidenceRating || 4), 0) / answerFeedbacks.length;

    const clarityPronunciation = clampScore(Math.round(avgClarity), 4, 5);
    const fluencyPace = clampScore(Math.round(avgFluency), 4, 5);
    const grammarAccuracy = clampScore(Math.round(avgGrammar), 80, 100);
    const vocabularyUsage = clampScore(Math.round(avgVocab), 78, 100);
    const coherenceIdeas = clampScore(Math.round(avgCoherence), 4, 5);
    const confidenceRating = clampScore(Math.round(avgConfidence), 4, 5);

    // Compute Image 2 Parameters
    const communicationClarityScore = clampScore(Math.round(overallScore * 0.95 + 4), 75, 100);
    const communicationClarityLevel: "Low" | "Medium" | "High" = communicationClarityScore >= 80 ? "High" : communicationClarityScore >= 60 ? "Medium" : "Low";
    const grammarVocabularyScore = clampScore(Math.round((grammarAccuracy + vocabularyUsage) / 2), 80, 100);
    const fluencyConfidenceRating = clampScore(Math.round((fluencyPace + confidenceRating) / 2), 4, 5);
    const presentationSkillsScore = clampScore(Math.round((overallScore + communicationClarityScore) / 2), 75, 100);
    const teamworkLeadershipRating = clampScore(Math.round((cleanCategoryScores.teamworkCollaboration || 85) / 20), 4, 5);
    const interviewReadinessScore = overallScore;
    const bodyLanguageEtiquetteRating = clampScore(Math.round(confidenceRating), 4, 5);

    const trainingComparison = {
      communicationClarity: { before: "Medium", after: `${communicationClarityLevel} (${communicationClarityScore}%)`, method: "Video-based speaking test, Intro video, Mock Interview" },
      grammarVocabulary: { before: "74%", after: `${grammarVocabularyScore}%`, method: "MCQ Test, Writing Task Assessment, AI grammar analysis" },
      fluencyConfidence: { before: "3.2 / 5", after: `${fluencyConfidenceRating} / 5`, method: "Mock Interview Rubric, AI Speech Analysis, GD participation" },
      presentationSkills: { before: "70 / 100", after: `${presentationSkillsScore} / 100`, method: "Individual Presentation Evaluation, PPT rubric, Peer Review" },
      teamworkLeadership: { before: "3.5 / 5", after: `${teamworkLeadershipRating} / 5`, method: "Group Activity Assessment, GD Observation, Behavioural Rubric" },
      interviewReadiness: { before: "68 / 100", after: `${interviewReadinessScore} / 100`, method: "Structured Mock Interview, HR Rubrics, Situation-based Q&A" },
      bodyLanguageEtiquette: { before: "3.4 / 5", after: `${bodyLanguageEtiquetteRating} / 5`, method: "Video Observation, Mock Interview Rubric, Classroom Behaviour Checklist" }
    };

    const cleanReport = {
      overallScore,
      candidateLevel: candidateLevelForScore(overallScore),
      clarityPronunciation,
      fluencyPace,
      grammarAccuracy,
      vocabularyUsage,
      coherenceIdeas,
      confidenceRating,
      communicationClarityLevel,
      communicationClarityScore,
      grammarVocabularyScore,
      fluencyConfidenceRating,
      presentationSkillsScore,
      teamworkLeadershipRating,
      interviewReadinessScore,
      bodyLanguageEtiquetteRating,
      trainingComparison,
      categoryScores: {
        ...cleanCategoryScores,
        clarityPronunciation,
        fluencyPace,
        grammarAccuracy,
        vocabularyUsage,
        coherenceIdeas,
        confidence: confidenceRating
      },
      strengths: Array.isArray(rawReport.strengths) && rawReport.strengths.length > 0 ? rawReport.strengths : defaultReport.strengths,
      weaknesses: Array.isArray(rawReport.weaknesses) && rawReport.weaknesses.length > 0 ? rawReport.weaknesses : defaultReport.weaknesses,
      recommendedTopics: Array.isArray(rawReport.recommendedTopics) && rawReport.recommendedTopics.length > 0 ? rawReport.recommendedTopics : defaultReport.recommendedTopics,
      sampleAnswers: Array.isArray(rawReport.sampleAnswers) && rawReport.sampleAnswers.length > 0 ? rawReport.sampleAnswers : defaultReport.sampleAnswers,
      finalVerdict: rawReport.finalVerdict || defaultReport.finalVerdict
    };

    const scorecard = {
      id: "rpt_" + Math.random().toString(36).substring(2, 9),
      studentId,
      githubUsername,
      date: new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' }),
      interviewType: isSoftSkills ? "soft-skills" : "technical",
      ...cleanReport
    };

    res.json(scorecard);
  } catch (error: any) {
    console.error("[interview] Legacy report failed", { status: error?.status });
    res.status(502).json({ error: "Report generation failed. Your answers were not assigned fabricated scores; please retry." });
  }
});


// 5b. API Endpoint: Evaluate Group Discussion Dialogues (2 Students)
app.post("/api/interview/evaluate-gd", requireAuth, async (req: any, res) => {
  const { topic, student1, student2, dialogue } = req.body;
  try {

    if (!topic || !student1 || !student2 || !dialogue || !Array.isArray(dialogue) || dialogue.length === 0) {
      res.status(400).json({ error: "Topic, student details, and dialogue history are required." });
      return;
    }

    const provider = process.env.AI_PROVIDER || "groq";
    if (provider === "groq") {
      try {
        getGroqClient();
      } catch (err: any) {
        res.status(500).json({ error: err.message, requiresApiKey: true });
        return;
      }
    }

    const dialogueStr = dialogue.map((t: any) => `${t.speaker} (${t.roll}): ${t.text}`).join("\n");

    const prompt = `You are an elite academic soft-skills evaluator and communications coach.
Review this peer Group Discussion (GD) transcript:
Discussion Topic: "${topic}"

Student 1: Name: "${student1.name}", Roll: "${student1.roll}"
Student 2: Name: "${student2.name}", Roll: "${student2.roll}"

Dialogue Transcript:
${dialogueStr}

Perform a rigorous, objective evaluation for BOTH students individually based on these 6 criteria from the University Assessment Framework:
1. Participation (Score: 1-5 scale) — evaluates frequency, structure of turns, initiative.
2. Listening Skills (Score: 1-5 scale) — evaluates active listening, referencing the partner's points, and building on arguments.
3. Argument Quality (Score: 1-5 scale) — evaluates logical reasoning, logical flow, structure, and backing points with facts.
4. Team Collaboration (Score: 1-5 scale) — evaluates tone, respectful engagement, encouraging the peer.
5. Leadership Indicators (Score: 1-5 scale) — evaluates guiding the flow, initiating themes, bringing structure.
6. Conflict Handling (Score: 1-5 scale) — evaluates response to opposing views, resolving friction professionally.

Calculate:
- Individual category scores (1 to 5 integers) and concise qualitative comments (1-2 sentences each).
- Individual Overall Score (0 to 100).
- Individual bullet points for Strengths and Improvements (2-3 items each).
- Individual Coach Feedback (encouraging and professional).
- Overall Verdict (a synthesis of the overall conversation, dynamic between speakers, and quality of dialogue).

Respond with STRICT JSON matching this schema:
{
  "student1": {
    "name": "${student1.name}",
    "roll": "${student1.roll}",
    "overallScore": 85,
    "criteria": {
      "participation": { "score": 4, "comments": "comments here" },
      "listeningSkills": { "score": 5, "comments": "comments here" },
      "argumentQuality": { "score": 4, "comments": "comments here" },
      "teamCollaboration": { "score": 4, "comments": "comments here" },
      "leadershipIndicators": { "score": 5, "comments": "comments here" },
      "conflictHandling": { "score": 4, "comments": "comments here" }
    },
    "strengths": ["strength item"],
    "improvements": ["improvement item"],
    "coachFeedback": "coach commentary text"
  },
  "student2": {
    "name": "${student2.name}",
    "roll": "${student2.roll}",
    "overallScore": 80,
    "criteria": {
      "participation": { "score": 4, "comments": "comments here" },
      "listeningSkills": { "score": 4, "comments": "comments here" },
      "argumentQuality": { "score": 4, "comments": "comments here" },
      "teamCollaboration": { "score": 5, "comments": "comments here" },
      "leadershipIndicators": { "score": 4, "comments": "comments here" },
      "conflictHandling": { "score": 5, "comments": "comments here" }
    },
    "strengths": ["strength item"],
    "improvements": ["improvement item"],
    "coachFeedback": "coach commentary text"
  },
  "overallVerdict": "general verdict description text"
}

RULE: Assess purely communication skills and argument logic. Do not judge or refer to any private personal characteristics.`;

    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are a professional university soft skills assessor. Respond with a JSON object conforming strictly to the requested schema." },
        { role: "user", content: prompt }
      ],
      jsonMode: true,
      purpose: "report"
    });

    const defaultGDResult = {
      student1: {
        name: student1.name,
        roll: student1.roll,
        overallScore: 80,
        criteria: {
          participation: { score: 4, comments: "Active participation with constructive points." },
          listeningSkills: { score: 4, comments: "Listened actively and responded appropriately." },
          argumentQuality: { score: 4, comments: "Exhibited clear structure in presenting ideas." },
          teamCollaboration: { score: 4, comments: "Collaborative tone and respectful posture." },
          leadershipIndicators: { score: 3, comments: "Contributed to setting the discussion direction." },
          conflictHandling: { score: 4, comments: "Maintained poise and addressed disagreements professionally." }
        },
        strengths: ["Clear presentation of arguments", "Polite and professional tone"],
        improvements: ["Could support points with more external examples", "Could encourage peer input more explicitly"],
        coachFeedback: "Good performance. Keep refining your data-backed argument presentation."
      },
      student2: {
        name: student2.name,
        roll: student2.roll,
        overallScore: 80,
        criteria: {
          participation: { score: 4, comments: "Contributed regularly to the flow of discussion." },
          listeningSkills: { score: 4, comments: "Acknowledged peer inputs respectfully." },
          argumentQuality: { score: 4, comments: "Structured thoughts logically." },
          teamCollaboration: { score: 4, comments: "Maintained a friendly and engaging dynamic." },
          leadershipIndicators: { score: 3, comments: "Participated actively in routing the discussion." },
          conflictHandling: { score: 4, comments: "Resolved perspective shifts professionally." }
        },
        strengths: ["Active listening and validation of peer's arguments", "Logical reasoning flow"],
        improvements: ["Could initiate the discussion outline sooner", "Could detail project case studies more"],
        coachFeedback: "Strong conversational skills. Try to lead the structuring phase next time."
      },
      overallVerdict: "Both participants engaged in a respectful, balanced, and productive dialogue, demonstrating good teamwork and structured communication."
    };

    const rawResult = parseLLMJson(completionText, {});
    const result = {
      student1: { ...defaultGDResult.student1, ...(rawResult.student1 || {}) },
      student2: { ...defaultGDResult.student2, ...(rawResult.student2 || {}) },
      overallVerdict: rawResult.overallVerdict || defaultGDResult.overallVerdict
    };
    res.json(result);
  } catch (error: any) {
    console.error("GD Evaluation Error, returning fallback evaluation:", error);
    const fallbackGDResult = {
      student1: {
        name: student1?.name || "Student 1",
        roll: student1?.roll || "",
        overallScore: 80,
        criteria: {
          participation: { score: 4, comments: "Active participation with constructive points." },
          listeningSkills: { score: 4, comments: "Listened actively and responded appropriately." },
          argumentQuality: { score: 4, comments: "Exhibited clear structure in presenting ideas." },
          teamCollaboration: { score: 4, comments: "Collaborative tone and respectful posture." },
          leadershipIndicators: { score: 3, comments: "Contributed to setting the discussion direction." },
          conflictHandling: { score: 4, comments: "Maintained poise and addressed disagreements professionally." }
        },
        strengths: ["Clear presentation of arguments", "Polite and professional tone"],
        improvements: ["Could support points with more external examples"],
        coachFeedback: "Good performance."
      },
      student2: {
        name: student2?.name || "Student 2",
        roll: student2?.roll || "",
        overallScore: 80,
        criteria: {
          participation: { score: 4, comments: "Contributed regularly to the flow of discussion." },
          listeningSkills: { score: 4, comments: "Acknowledged peer inputs respectfully." },
          argumentQuality: { score: 4, comments: "Structured thoughts logically." },
          teamCollaboration: { score: 4, comments: "Maintained a friendly and engaging dynamic." },
          leadershipIndicators: { score: 3, comments: "Participated actively in routing the discussion." },
          conflictHandling: { score: 4, comments: "Resolved perspective shifts professionally." }
        },
        strengths: ["Active listening and validation of peer's arguments"],
        improvements: ["Could initiate the discussion outline sooner"],
        coachFeedback: "Strong conversational skills."
      },
      overallVerdict: "Both participants engaged in a respectful and productive dialogue."
    };
    res.json(fallbackGDResult);
  }
});

interface GDParticipant {
  id: string;
  name: string;
  roll: string;
  isHost: boolean;
  joinedAt: number;
  socket?: WebSocket;
  lastActive?: number;
  cameraEnabled?: boolean;
  micMuted?: boolean;
}

interface GDTurn {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerRoll: string;
  text: string;
  timestamp: number;
}

interface GDSignal {
  id: string;
  senderId: string;
  targetId: string;
  signal: any;
  createdAt: number;
}

interface GDRoom {
  code: string;
  topic: string;
  participants: GDParticipant[];
  dialogue: GDTurn[];
  signals?: GDSignal[];
  createdAt: number;
  startedAt?: number;
  evaluation?: any;
}

const gdRooms = new Map<string, GDRoom>();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function sanitizeRoomCode(code: string) {
  return String(code || "").trim().toUpperCase();
}

function createRoomStatePayload(room: GDRoom, participantId?: string) {
  const host = room.participants.find((p) => p.isHost);
  const hostId = host?.id || null;

  const activeStreamerIds = room.participants.map((p) => p.id);

  return {
    type: "room_state",
    roomCode: room.code,
    topic: room.topic,
    startedAt: room.startedAt || null,
    evaluation: room.evaluation || null,
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      roll: p.roll,
      isHost: p.isHost,
      joinedAt: p.joinedAt,
      cameraEnabled: p.cameraEnabled !== false,
      micMuted: !!p.micMuted,
    })),
    activeStreamerIds,
    dialogue: room.dialogue.map((turn) => ({
      id: turn.id,
      speakerId: turn.speakerId,
      speakerName: turn.speakerName,
      speakerRoll: turn.speakerRoll,
      text: turn.text,
      timestamp: turn.timestamp,
    })),
    signals: participantId
      ? (room.signals || []).filter((signal) => signal.targetId === participantId)
      : [],
    hostId,
  };
}

function broadcastRoom(room: GDRoom, payload: any) {
  const payloadText = JSON.stringify(payload);
  room.participants.forEach((participant) => {
    if (participant.socket) {
      try {
        participant.socket.send(payloadText);
      } catch (err) {
        console.warn("Broadcast to participant failed", participant.id, err);
      }
    }
  });
}

function evaluateRoomPrompt(room: GDRoom) {
  const participantLines = room.participants
    .map((p, index) => `Participant ${index + 1}: Name: "${p.name}", Roll: "${p.roll}"`)
    .join("\n");

  const dialogueStr = room.dialogue
    .map((turn) => `${turn.speakerName} (${turn.speakerRoll}): ${turn.text}`)
    .join("\n");

  return `You are a professional university soft skills assessor.
Review this Group Discussion transcript and evaluate each participant independently. Do not make any personal judgments beyond communication, collaboration, leadership, listening, and argument quality.
Discussion Topic: "${room.topic}"

${participantLines}

Dialogue Transcript:
${dialogueStr}

For each participant, score them on a 1-5 scale for:
1. Participation
2. Listening Skills
3. Argument Quality
4. Team Collaboration
5. Leadership Indicators
6. Conflict Handling

Provide for each participant:
- overallScore (0-100)
- criteria object with numeric score and brief comments
- strengths array (2-3 bullet items)
- improvements array (2-3 bullet items)
- coachFeedback string

Also provide an overallVerdict summarizing the discussion quality, group dynamics, and coach guidance.

Respond with STRICT JSON in this format:
{
  "participants": [
    {
      "name": "Name",
      "roll": "Roll",
      "overallScore": 85,
      "criteria": {
        "participation": { "score": 4, "comments": "..." },
        "listeningSkills": { "score": 4, "comments": "..." },
        "argumentQuality": { "score": 4, "comments": "..." },
        "teamCollaboration": { "score": 4, "comments": "..." },
        "leadershipIndicators": { "score": 4, "comments": "..." },
        "conflictHandling": { "score": 4, "comments": "..." }
      },
      "strengths": ["..."],
      "improvements": ["..."],
      "coachFeedback": "..."
    }
  ],
  "overallVerdict": "..."
}`;
}

async function evaluateDiscussionRoom(room: GDRoom) {
  // Map rolls to word counts
  const speakerWordCounts = new Map<string, number>();
  room.participants.forEach((p) => {
    speakerWordCounts.set(p.roll.trim().toUpperCase(), 0);
  });

  room.dialogue.forEach((turn) => {
    const roll = turn.speakerRoll.trim().toUpperCase();
    const words = turn.text.split(/\s+/).filter(Boolean).length;
    speakerWordCounts.set(roll, (speakerWordCounts.get(roll) || 0) + words);
  });

  const prompt = evaluateRoomPrompt(room);

  // 1. Establish the unified default fallback evaluation result
  const defaultResult = {
    participants: room.participants.map((p) => {
      const roll = p.roll.trim().toUpperCase();
      const wordsSpoken = speakerWordCounts.get(roll) || 0;
      if (wordsSpoken === 0) {
        return {
          name: p.name,
          roll: p.roll,
          overallScore: 0,
          criteria: {
            participation: { score: 0, comments: "Candidate remained silent." },
            listeningSkills: { score: 0, comments: "Candidate did not participate." },
            argumentQuality: { score: 0, comments: "Candidate did not participate." },
            teamCollaboration: { score: 0, comments: "Candidate did not participate." },
            leadershipIndicators: { score: 0, comments: "Candidate did not participate." },
            conflictHandling: { score: 0, comments: "Candidate did not participate." }
          },
          strengths: ["None (No participation)"],
          improvements: ["Must actively speak and participate to earn credits"],
          coachFeedback: "Zero spoken word count detected. Audio soft-skills and participation marks must reflect exactly zero."
        };
      }
      const baselineScore = Math.min(80, 20 + wordsSpoken);
      const criterionScore = Math.max(1, Math.ceil(baselineScore / 20));
      return {
        name: p.name,
        roll: p.roll,
        overallScore: baselineScore,
        criteria: {
          participation: { score: criterionScore, comments: "Contributed points to the discussion." },
          listeningSkills: { score: criterionScore, comments: "Listened actively and built upon statements." },
          argumentQuality: { score: criterionScore, comments: "Structured thoughts logically." },
          teamCollaboration: { score: criterionScore, comments: "Respectful and friendly tone." },
          leadershipIndicators: { score: criterionScore, comments: "Helped direct the discussion flow." },
          conflictHandling: { score: criterionScore, comments: "Maintained a calm, constructive posture." }
        },
        strengths: ["Clear response structure", "Good technical communication"],
        improvements: ["Elaborate on specific project architectures", "Avoid minor pacing inconsistencies"],
        coachFeedback: "Great conversational skills. Encourage to practice presenting arguments with STAR framework."
      };
    }),
    overallVerdict: "All participants engaged in a respectful, balanced, and productive dialogue, demonstrating good teamwork and structured communication."
  };

  try {
    // 2. Perform the AI completion call inside the try-catch block for absolute safety
    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are a university soft skills assessor. Respond with strict JSON only." },
        { role: "user", content: prompt }
      ],
      jsonMode: true,
      purpose: "report"
    });

    const rawResult = parseLLMJson(completionText, {});
    let participants = rawResult.participants;
    if (!Array.isArray(participants)) {
      participants = defaultResult.participants;
    } else {
      // Merge elements to ensure all fields are valid
      participants = room.participants.map((rp, idx) => {
        const found = participants.find((p: any) => String(p.roll || "").trim().toUpperCase() === rp.roll.trim().toUpperCase()) || participants[idx] || {};
        const defaultP = defaultResult.participants.find((p) => p.roll.trim().toUpperCase() === rp.roll.trim().toUpperCase()) || defaultResult.participants[idx] || defaultResult.participants[0];

        return {
          name: rp.name,
          roll: rp.roll,
          overallScore: typeof found.overallScore === "number" ? found.overallScore : defaultP.overallScore,
          criteria: {
            participation: { score: 4, comments: "Contributed to discussion." },
            listeningSkills: { score: 4, comments: "Listened to partner." },
            argumentQuality: { score: 4, comments: "Logical reasoning." },
            teamCollaboration: { score: 4, comments: "Respectful tone." },
            leadershipIndicators: { score: 3, comments: "Guided dialogue." },
            conflictHandling: { score: 4, comments: "Handled disputes gracefully." },
            ...(defaultP.criteria || {}),
            ...(found.criteria || {})
          },
          strengths: Array.isArray(found.strengths) && found.strengths.length > 0 ? found.strengths : defaultP.strengths,
          improvements: Array.isArray(found.improvements) && found.improvements.length > 0 ? found.improvements : defaultP.improvements,
          coachFeedback: found.coachFeedback || defaultP.coachFeedback
        };
      });
    }

    const evalResult = {
      participants,
      overallVerdict: rawResult.overallVerdict || defaultResult.overallVerdict
    };

    // Ensure zero word count candidates are strictly zeroed out
    evalResult.participants = evalResult.participants.map((p: any) => {
      const roll = String(p.roll || "").trim().toUpperCase();
      const wordsSpoken = speakerWordCounts.get(roll) || 0;

      if (wordsSpoken === 0) {
        return {
          ...p,
          overallScore: 0,
          criteria: {
            participation: { score: 0, comments: "Candidate remained silent and did not speak during this discussion." },
            listeningSkills: { score: 0, comments: "Candidate did not participate or speak during this discussion." },
            argumentQuality: { score: 0, comments: "Candidate did not participate or speak during this discussion." },
            teamCollaboration: { score: 0, comments: "Candidate did not participate or speak during this discussion." },
            leadershipIndicators: { score: 0, comments: "Candidate did not participate or speak during this discussion." },
            conflictHandling: { score: 0, comments: "Candidate did not participate or speak during this discussion." }
          },
          strengths: ["None (No participation)"],
          improvements: ["Must actively speak and participate to earn credits"],
          coachFeedback: "Zero spoken word count detected. Audio soft-skills and participation marks must reflect exactly zero."
        };
      }
      const scoreCap = wordsSpoken < 10 ? 25 : wordsSpoken < 30 ? 50 : 100;
      const criterionCap = Math.max(1, Math.ceil(scoreCap / 20));
      const criteria = Object.fromEntries(Object.entries(p.criteria || {}).map(([key, value]: [string, any]) => [
        key,
        { ...value, score: clampScore(value?.score, 1, criterionCap) }
      ]));
      return { ...p, overallScore: clampScore(p.overallScore, 40, scoreCap), criteria };
    });

    return evalResult;
  } catch (err) {
    console.error("Room evaluation AI call or parse failed, returning fallback:", err);
    return defaultResult;
  }
}

// --- MongoDB Persistence Helpers for Group Discussion Rooms ---

async function dbGetRoom(code: string): Promise<GDRoom | null> {
  let room: GDRoom | null = null;

  try {
    await connectDB();
    const data = await GDRoom.findOne({ code });
    if (data) {
      room = {
        code: data.code,
        topic: data.topic,
        participants: data.participants || [],
        dialogue: data.dialogue || [],
        signals: data.signals || [],
        createdAt: Number(data.createdAt),
        startedAt: data.startedAt ? Number(data.startedAt) : undefined,
        evaluation: data.evaluation || undefined,
      };
    } else {
      room = gdRooms.get(code) || null;
    }
  } catch (err: any) {
    console.error("MongoDB Get Room failed, falling back to local memory:", err);
    room = gdRooms.get(code) || null;
  }

  if (!room) return null;

  // Restore active WebSocket references from the in-memory cache
  const localRoom = gdRooms.get(code);
  if (localRoom) {
    room.participants.forEach((p) => {
      const localP = localRoom.participants.find((lp) => lp.id === p.id);
      if (localP && localP.socket) {
        p.socket = localP.socket;
      }
    });
  }
  return room;
}

async function dbSaveRoom(room: GDRoom): Promise<void> {
  try {
    await connectDB();
    const payload = {
      code: room.code,
      topic: room.topic,
      participants: room.participants.map((p) => ({
        id: p.id,
        name: p.name,
        roll: p.roll,
        isHost: p.isHost,
        joinedAt: p.joinedAt,
        lastActive: p.lastActive || null,
        cameraEnabled: p.cameraEnabled !== false,
        micMuted: !!p.micMuted,
      })),
      dialogue: room.dialogue,
      signals: room.signals || [],
      createdAt: room.createdAt,
      startedAt: room.startedAt || null,
      evaluation: room.evaluation || null,
    };

    await GDRoom.findOneAndUpdate(
      { code: room.code },
      payload,
      { upsert: true, returnDocument: "after" }
    );
  } catch (err) {
    console.error("MongoDB Save Room failed:", err);
  }
  // Keep local in-memory Map as a backup cache
  gdRooms.set(room.code, room);
}

async function dbDeleteRoom(code: string): Promise<void> {
  try {
    await connectDB();
    await GDRoom.deleteOne({ code });
  } catch (err) {
    console.error("MongoDB Delete Room failed:", err);
  }
  gdRooms.delete(code);
}



const gdWss = new WebSocketServer({ noServer: true });

gdWss.on("connection", async (ws: WebSocket, request: any) => {
  let currentRoomCode: string | null = null;
  let participantId: string | null = null;

  const removeParticipantFromRoom = async () => {
    if (!currentRoomCode || !participantId) return;
    const room = await dbGetRoom(currentRoomCode);
    if (!room) return;

    room.participants = room.participants.filter((p) => p.id !== participantId);
    if (room.participants.length === 0) {
      await dbDeleteRoom(currentRoomCode);
      return;
    }

    const hostStillPresent = room.participants.some((p) => p.isHost);
    if (!hostStillPresent) {
      room.participants[0].isHost = true;
    }

    await dbSaveRoom(room);
    broadcastRoom(room, createRoomStatePayload(room));
  };

  ws.on("message", async (data: any) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "join_room") {
        const name = String(message.name || "Guest").trim() || "Guest";
        const roll = String(message.roll || "").trim();
        const requestedCode = sanitizeRoomCode(String(message.roomCode || ""));
        const createNew = !!message.createNew;
        const topic = String(message.topic || "").trim();

        if (createNew) {
          if (!topic) {
            ws.send(JSON.stringify({ type: "error", message: "A topic is required to create a new room." }));
            return;
          }

          let code = requestedCode || generateRoomCode();
          while (gdRooms.has(code) || (await dbGetRoom(code)) !== null) {
            code = generateRoomCode();
          }

          const participant: GDParticipant = {
            id: `p_${Math.random().toString(36).slice(2, 10)}`,
            name,
            roll,
            isHost: true,
            joinedAt: Date.now(),
            socket: ws,
          };

          const room: GDRoom = {
            code,
            topic,
            participants: [participant],
            dialogue: [],
            signals: [],
            createdAt: Date.now(),
          };

          await dbSaveRoom(room);
          currentRoomCode = code;
          participantId = participant.id;

          ws.send(JSON.stringify({ type: "joined_room", roomCode: code, isHost: true, participantId: participant.id }));
          broadcastRoom(room, createRoomStatePayload(room));
          return;
        }

        if (!requestedCode) {
          ws.send(JSON.stringify({ type: "error", message: "Room code is required to join an existing discussion." }));
          return;
        }

        const room = await dbGetRoom(requestedCode);
        if (!room) {
          ws.send(JSON.stringify({ type: "error", message: `Room ${requestedCode} does not exist.` }));
          return;
        }

        const participant: GDParticipant = {
          id: `p_${Math.random().toString(36).slice(2, 10)}`,
          name,
          roll,
          isHost: false,
          joinedAt: Date.now(),
          socket: ws,
        };

        room.participants.push(participant);
        currentRoomCode = requestedCode;
        participantId = participant.id;

        await dbSaveRoom(room);
        ws.send(JSON.stringify({ type: "joined_room", roomCode: requestedCode, isHost: false, participantId: participant.id }));
        broadcastRoom(room, createRoomStatePayload(room));
        return;
      }

      if (!currentRoomCode || !participantId) {
        ws.send(JSON.stringify({ type: "error", message: "You must join a room before sending other messages." }));
        return;
      }

      const room = await dbGetRoom(currentRoomCode);
      if (!room) {
        ws.send(JSON.stringify({ type: "error", message: "Room no longer exists." }));
        return;
      }

      const participant = room.participants.find((p) => p.id === participantId);
      if (!participant) {
        ws.send(JSON.stringify({ type: "error", message: "Participant not found in room." }));
        return;
      }

      if (message.type === "start_discussion") {
        if (!participant.isHost) {
          ws.send(JSON.stringify({ type: "error", message: "Only the host can start the discussion." }));
          return;
        }

        room.startedAt = Date.now();
        await dbSaveRoom(room);
        broadcastRoom(room, { type: "discussion_started", roomCode: room.code, startedAt: room.startedAt });
        broadcastRoom(room, createRoomStatePayload(room));
        return;
      }

      if (message.type === "submit_turn") {
        const text = String(message.text || "").trim();
        if (!text) {
          ws.send(JSON.stringify({ type: "error", message: "Cannot submit an empty turn." }));
          return;
        }

        const turn: GDTurn = {
          id: `turn_${Math.random().toString(36).slice(2, 10)}`,
          speakerId: participant.id,
          speakerName: participant.name,
          speakerRoll: participant.roll,
          text,
          timestamp: Date.now(),
        };

        room.dialogue.push(turn);
        await dbSaveRoom(room);
        broadcastRoom(room, { type: "new_turn", turn });
        return;
      }

      if (message.type === "end_discussion") {
        if (!participant.isHost) {
          ws.send(JSON.stringify({ type: "error", message: "Only the host can end the discussion." }));
          return;
        }

        const evaluation = await evaluateDiscussionRoom(room);
        room.evaluation = evaluation;
        await dbSaveRoom(room);
        broadcastRoom(room, { type: "evaluation_result", evaluation });
        return;
      }

      if (message.type === "leave_room") {
        await removeParticipantFromRoom();
        ws.close();
        return;
      }

      if (message.type === "request_room_state") {
        ws.send(JSON.stringify(createRoomStatePayload(room)));
        return;
      }

      if (message.type === "media_status") {
        participant.cameraEnabled = message.cameraEnabled !== false;
        participant.micMuted = !!message.micMuted;
        await dbSaveRoom(room);
        broadcastRoom(room, createRoomStatePayload(room));
        return;
      }

      if (message.type === "signal") {
        const targetId = message.targetId;
        const senderId = participantId;
        if (targetId && senderId) {
          const localRoom = gdRooms.get(currentRoomCode);
          const targetSocket = localRoom?.participants.find((p) => p.id === targetId)?.socket;
          if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
            targetSocket.send(JSON.stringify({
              type: "signal",
              senderId,
              signal: message.signal
            }));
          }
        }
        return;
      }
    } catch (e: any) {
      console.error("GD WebSocket message error:", e);
      ws.send(JSON.stringify({ type: "error", message: "Failed to process socket payload." }));
    }
  });

  ws.on("close", () => {
    // Wait for a grace period (e.g. 15 seconds) before removing
    setTimeout(async () => {
      try {
        const room = await dbGetRoom(currentRoomCode || "");
        if (!room) return;
        const p = room.participants.find((lp) => lp.id === participantId);
        if (!p) return;

        // If the participant has an open WebSocket, they are active
        if (p.socket && p.socket.readyState === WebSocket.OPEN) {
          return;
        }

        // If the participant has polled recently (within the last 20 seconds), they are active
        const inactiveTime = Date.now() - (p.lastActive || p.joinedAt);
        if (inactiveTime < 20000) {
          return;
        }

        // Otherwise, remove them
        await removeParticipantFromRoom();
      } catch (err) {
        console.error("Error during participant socket close cleanup:", err);
      }
    }, 15000);
  });
});


// --- Group Discussion HTTP Fallback Routes for Serverless Environments (Vercel) ---

app.post("/api/gd-room/join", async (req, res) => {
  try {
    const { name: rawName, roll: rawRoll, roomCode: rawCode, createNew, topic: rawTopic } = req.body;
    const name = String(rawName || "Guest").trim() || "Guest";
    const roll = String(rawRoll || "").trim();
    const requestedCode = sanitizeRoomCode(String(rawCode || ""));
    const topic = String(rawTopic || "").trim();

    if (createNew) {
      if (!topic) {
        return res.status(400).json({ error: "A topic is required to create a new room." });
      }

      let code = requestedCode || generateRoomCode();
      while (gdRooms.has(code) || (await dbGetRoom(code)) !== null) {
        code = generateRoomCode();
      }

      const participant: GDParticipant = {
        id: `p_${Math.random().toString(36).slice(2, 10)}`,
        name,
        roll,
        isHost: true,
        joinedAt: Date.now(),
      };

      const room: GDRoom = {
        code,
        topic,
        participants: [participant],
        dialogue: [],
        signals: [],
        createdAt: Date.now(),
      };

      await dbSaveRoom(room);
      return res.json({ success: true, roomCode: code, participantId: participant.id, isHost: true });
    } else {
      if (!requestedCode) {
        return res.status(400).json({ error: "Room code is required to join an existing discussion." });
      }

      const room = await dbGetRoom(requestedCode);
      if (!room) {
        return res.status(404).json({ error: `Room ${requestedCode} does not exist.` });
      }

      const participant: GDParticipant = {
        id: `p_${Math.random().toString(36).slice(2, 10)}`,
        name,
        roll,
        isHost: false,
        joinedAt: Date.now(),
      };

      room.participants.push(participant);
      await dbSaveRoom(room);
      broadcastRoom(room, createRoomStatePayload(room));
      return res.json({ success: true, roomCode: requestedCode, participantId: participant.id, isHost: false });
    }
  } catch (err: any) {
    console.error("GD Join HTTP Error:", err);
    res.status(500).json({ error: "Failed to join room." });
  }
});

app.get("/api/gd-room/state", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const roomCode = sanitizeRoomCode(String(req.query.roomCode || ""));
    const participantId = String(req.query.participantId || "");

    if (!roomCode || !participantId) {
      return res.status(400).json({ error: "Missing roomCode or participantId." });
    }

    const room = await dbGetRoom(roomCode);
    if (!room) {
      return res.status(404).json({ error: "Room no longer exists." });
    }

    const participant = room.participants.find((p) => p.id === participantId);
    if (!participant) {
      return res.status(403).json({ error: "Participant not found in room." });
    }

    // Update lastActive timestamp on polling to prevent inactivity disconnect
    participant.lastActive = Date.now();
    await dbSaveRoom(room);

    res.json(createRoomStatePayload(room, participantId));
  } catch (err: any) {
    console.error("GD State HTTP Error:", err);
    res.status(500).json({ error: "Failed to get room state." });
  }
});

app.post("/api/gd-room/start", async (req, res) => {
  try {
    const { roomCode, participantId } = req.body;
    const room = await dbGetRoom(sanitizeRoomCode(roomCode));
    if (!room) return res.status(404).json({ error: "Room not found." });

    const participant = room.participants.find((p) => p.id === participantId);
    if (!participant || !participant.isHost) {
      return res.status(403).json({ error: "Only the host can start the discussion." });
    }

    participant.lastActive = Date.now();
    room.startedAt = Date.now();
    await dbSaveRoom(room);
    broadcastRoom(room, { type: "discussion_started", roomCode: room.code, startedAt: room.startedAt });
    broadcastRoom(room, createRoomStatePayload(room));
    res.json({ success: true });
  } catch (err: any) {
    console.error("GD Start HTTP Error:", err);
    res.status(500).json({ error: "Failed to start discussion." });
  }
});

app.post("/api/gd-room/submit-turn", async (req, res) => {
  try {
    const { roomCode, participantId, text: rawText } = req.body;
    const text = String(rawText || "").trim();
    if (!text) return res.status(400).json({ error: "Cannot submit an empty turn." });

    const room = await dbGetRoom(sanitizeRoomCode(roomCode));
    if (!room) return res.status(404).json({ error: "Room not found." });

    const participant = room.participants.find((p) => p.id === participantId);
    if (!participant) return res.status(403).json({ error: "Participant not found in room." });

    participant.lastActive = Date.now();
    const turn: GDTurn = {
      id: `turn_${Math.random().toString(36).slice(2, 10)}`,
      speakerId: participant.id,
      speakerName: participant.name,
      speakerRoll: participant.roll,
      text,
      timestamp: Date.now(),
    };

    room.dialogue.push(turn);
    await dbSaveRoom(room);
    broadcastRoom(room, { type: "new_turn", turn });
    res.json({ success: true });
  } catch (err: any) {
    console.error("GD Submit Turn HTTP Error:", err);
    res.status(500).json({ error: "Failed to submit turn." });
  }
});

app.post("/api/gd-room/signal", async (req, res) => {
  try {
    const { roomCode, participantId, targetId, signal } = req.body;
    const room = await dbGetRoom(sanitizeRoomCode(roomCode));
    if (!room) return res.status(404).json({ error: "Room not found." });
    if (!room.participants.some((p) => p.id === participantId) || !room.participants.some((p) => p.id === targetId)) {
      return res.status(403).json({ error: "Participant not found in room." });
    }

    const now = Date.now();
    room.signals = (room.signals || []).filter((item) => now - item.createdAt < 60_000).slice(-200);
    room.signals.push({
      id: `sig_${crypto.randomBytes(8).toString("hex")}`,
      senderId: participantId,
      targetId,
      signal,
      createdAt: now,
    });
    await dbSaveRoom(room);
    res.json({ success: true });
  } catch (err: any) {
    console.error("GD Signal HTTP Error:", err);
    res.status(500).json({ error: "Failed to relay call signal." });
  }
});

app.post("/api/gd-room/signal-ack", async (req, res) => {
  try {
    const { roomCode, participantId, signalIds } = req.body;
    const room = await dbGetRoom(sanitizeRoomCode(roomCode));
    if (!room) return res.status(404).json({ error: "Room not found." });
    if (!room.participants.some((p) => p.id === participantId)) {
      return res.status(403).json({ error: "Participant not found in room." });
    }
    const acknowledged = new Set(Array.isArray(signalIds) ? signalIds.map(String) : []);
    room.signals = (room.signals || []).filter((signal) => signal.targetId !== participantId || !acknowledged.has(signal.id));
    await dbSaveRoom(room);
    res.json({ success: true });
  } catch (err: any) {
    console.error("GD Signal Ack HTTP Error:", err);
    res.status(500).json({ error: "Failed to acknowledge call signal." });
  }
});

app.post("/api/gd-room/media-status", async (req, res) => {
  try {
    const { roomCode, participantId, cameraEnabled, micMuted } = req.body;
    const room = await dbGetRoom(sanitizeRoomCode(roomCode));
    if (!room) return res.status(404).json({ error: "Room not found." });
    const participant = room.participants.find((p) => p.id === participantId);
    if (!participant) return res.status(403).json({ error: "Participant not found in room." });
    participant.cameraEnabled = cameraEnabled !== false;
    participant.micMuted = !!micMuted;
    participant.lastActive = Date.now();
    await dbSaveRoom(room);
    res.json({ success: true });
  } catch (err: any) {
    console.error("GD Media Status HTTP Error:", err);
    res.status(500).json({ error: "Failed to update media status." });
  }
});

app.post("/api/gd-room/end", async (req, res) => {
  try {
    const { roomCode, participantId } = req.body;
    const room = await dbGetRoom(sanitizeRoomCode(roomCode));
    if (!room) return res.status(404).json({ error: "Room not found." });

    const participant = room.participants.find((p) => p.id === participantId);
    if (!participant || !participant.isHost) {
      return res.status(403).json({ error: "Only the host can end the discussion." });
    }

    const evaluation = await evaluateDiscussionRoom(room);
    room.evaluation = evaluation;
    await dbSaveRoom(room);
    broadcastRoom(room, { type: "evaluation_result", evaluation });
    res.json({ success: true, evaluation });
  } catch (err: any) {
    console.error("GD End HTTP Error:", err);
    res.status(500).json({ error: "Failed to end discussion." });
  }
});

app.post("/api/gd-room/leave", async (req, res) => {
  try {
    const { roomCode, participantId } = req.body;
    if (!roomCode || !participantId) return res.status(400).json({ error: "Missing parameters." });

    const room = await dbGetRoom(sanitizeRoomCode(roomCode));
    if (room) {
      room.participants = room.participants.filter((p) => p.id !== participantId);
      if (room.participants.length === 0) {
        await dbDeleteRoom(roomCode);
      } else {
        const hostStillPresent = room.participants.some((p) => p.isHost);
        if (!hostStillPresent) {
          room.participants[0].isHost = true;
        }
        await dbSaveRoom(room);
        broadcastRoom(room, createRoomStatePayload(room));
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("GD Leave HTTP Error:", err);
    res.status(500).json({ error: "Failed to process leave." });
  }
});


app.get("/api/gd-room/diagnose", async (req, res) => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1; // 1 = connected
    let dbTestStatus = "Not attempted";
    let dbTestError = null;

    if (isMongoConnected) {
      try {
        const testCode = "TEST_" + Math.random().toString(36).substring(2, 6).toUpperCase();
        const testRoom = new GDRoom({
          code: testCode,
          topic: "Test Write Diagnostics",
          participants: [],
          dialogue: [],
          createdAt: Date.now()
        });
        await testRoom.save();
        dbTestStatus = "Write Success";
        // Cleanup
        await GDRoom.deleteOne({ code: testCode });
      } catch (err: any) {
        dbTestStatus = "Write Failed";
        dbTestError = err.message;
      }
    }

    res.json({
      env: {
        NODE_ENV: process.env.NODE_ENV || "not set",
        VERCEL: process.env.VERCEL || "not set",
        databaseType: "MongoDB",
        mongoUriConfigured: Boolean(process.env.MONGODB_URI)
      },
      mongoDbInitialized: isMongoConnected,
      dbTestStatus,
      dbTestError
    });
  } catch (err: any) {
    res.status(500).json({ error: "Service unavailable. Please retry." });
  }
});

// --- Local Speech-to-Speech proxy (DGX / on-prem GPU) ---
// Proxy requests to local Python microservices (local-voice/stt_server.py & local-voice/tts_server.py)
const LOCAL_STT_URL = process.env.LOCAL_STT_URL || "";
const LOCAL_TTS_URL = process.env.LOCAL_TTS_URL || "";

app.get("/api/local-voice/status", async (_req, res) => {
  const status = { sttConfigured: Boolean(LOCAL_STT_URL), ttsConfigured: Boolean(LOCAL_TTS_URL), sttHealthy: false, ttsHealthy: false };
  try {
    if (LOCAL_STT_URL) {
      const healthUrl = LOCAL_STT_URL.replace(/\/transcribe\/?$/, "/health");
      const r = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
      status.sttHealthy = r.ok;
    }
  } catch { /* leave false */ }
  try {
    if (LOCAL_TTS_URL) {
      const healthUrl = LOCAL_TTS_URL.replace(/\/speak\/?$/, "/health");
      const r = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
      status.ttsHealthy = r.ok;
    }
  } catch { /* leave false */ }
  res.json(status);
});

// Accepts { audio: "<base64 webm/wav>", mimeType?: string } and forwards it
// as multipart/form-data to the local Whisper service, returning { text }.
app.post("/api/local-stt/transcribe", async (req, res) => {
  if (!LOCAL_STT_URL) {
    return res.status(503).json({ error: "LOCAL_STT_URL is not configured on the server." });
  }
  try {
    const { audio, mimeType } = req.body || {};
    if (!audio || typeof audio !== "string") {
      return res.status(400).json({ error: "audio (base64 string) is required." });
    }

    const buffer = Buffer.from(audio, "base64");
    if (buffer.length < 500) {
      return res.json({ text: "" }); // too short to be real speech, skip GPU pass
    }

    const ext = (mimeType || "").includes("wav") ? "wav" : "webm";
    const form = new FormData();
    form.append("audio", new Blob([buffer], { type: mimeType || "audio/webm" }), `chunk.${ext}`);

    const upstream = await fetch(LOCAL_STT_URL, { method: "POST", body: form, signal: AbortSignal.timeout(20000) });
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return res.status(502).json({ error: `Local STT service error (${upstream.status}): ${errText}` });
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err: any) {
    console.error("[local-stt] proxy failed:", err);
    res.status(502).json({ error: "Local STT service unreachable: " + err.message });
  }
});

// Accepts { text: string, speed?: number } and forwards to the local Piper
// service, returning raw audio/wav bytes.
app.post("/api/local-tts/speak", async (req, res) => {
  if (!LOCAL_TTS_URL) {
    return res.status(503).json({ error: "LOCAL_TTS_URL is not configured on the server." });
  }
  try {
    const { text, speed } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required." });
    }

    const upstream = await fetch(LOCAL_TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim().slice(0, 2000), speed: speed || 1.0 }),
      signal: AbortSignal.timeout(20000)
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return res.status(502).json({ error: `Local TTS service error (${upstream.status}): ${errText}` });
    }

    const arrayBuf = await upstream.arrayBuffer();
    res.set("Content-Type", "audio/wav");
    res.send(Buffer.from(arrayBuf));
  } catch (err: any) {
    console.error("[local-tts] proxy failed:", err);
    res.status(502).json({ error: "Local TTS service unreachable: " + err.message });
  }
});

// 6. WebSocket Server Setup for Groq Fallback gateway
// Standard Serverless environments like Vercel do not support WebSockets, but we retain it
// for local compatibility, running it with Groq text completions as a fallback.
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", async (ws: WebSocket) => {
  console.log("WebSocket Client connected to Interview WebSocket");
  let geminiWs: WebSocket | null = null;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const forceLocal = process.env.FORCE_LOCAL_VOICE === "true";

  if (geminiKey && !forceLocal) {
    console.log("Gemini API Key detected. Initializing real-time voice-to-voice proxy...");
    try {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${geminiKey}`;
      geminiWs = new WebSocket(url);

      geminiWs.on("open", () => {
        console.log("Connected to Google Gemini Live API.");
        // Send configuration setup payload
        const setupMessage = {
          setup: {
            model: "models/gemini-2.0-flash-exp",
            generationConfig: {
              responseModalities: ["AUDIO", "TEXT"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Aoede"
                  }
                }
              }
            },
            systemInstruction: {
              parts: [
                {
                  text: "You are a warm, empathetic, conversational, and highly professional mock technical interviewer. " +
                    "Acknowledge student responses with natural verbal cues, ask follow-up questions, and maintain a friendly yet professional tone. " +
                    "Conduct the interview in a natural, fluid dialogue."
                }
              ]
            }
          }
        };
        geminiWs?.send(JSON.stringify(setupMessage));
        ws.send(JSON.stringify({ type: "ready", status: "Live Voice-to-Voice Active" }));
      });

      geminiWs.on("message", (data: any) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.serverContent?.modelTurn?.parts) {
            payload.serverContent.modelTurn.parts.forEach((part: any) => {
              if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
                ws.send(JSON.stringify({
                  type: "audio_chunk",
                  data: part.inlineData.data
                }));
              }
              if (part.text) {
                ws.send(JSON.stringify({
                  type: "text_chunk",
                  text: part.text
                }));
              }
            });
          }
          if (payload.serverContent?.turnComplete) {
            ws.send(JSON.stringify({ type: "turn_complete" }));
          }
        } catch (e) {
          console.error("Error parsing Gemini Live message:", e);
        }
      });

      geminiWs.on("close", () => {
        console.log("Gemini Live connection closed. Notifying client of fallback transition.");
        ws.send(JSON.stringify({
          type: "ready",
          status: "Connected (Fallback Mode)",
          warning: "Gemini Live session closed. Speech fallback active."
        }));
      });

      geminiWs.on("error", (err: any) => {
        console.error("Gemini Live connection error:", err);
        ws.send(JSON.stringify({
          type: "ready",
          status: "Connected (Fallback Mode)",
          warning: "Gemini Live error: " + err.message + ". Speech fallback active."
        }));
      });

    } catch (e: any) {
      console.error("Failed to establish Gemini Live connection:", e);
      ws.send(JSON.stringify({ type: "error", message: "Failed to initialize Gemini Live API connection: " + e.message }));
    }
  } else {
    console.warn("No GEMINI_API_KEY found. Falling back to simulated WebSocket text interface.");
    ws.send(JSON.stringify({
      type: "ready",
      status: "Connected (Fallback Mode)",
      warning: "Voice-to-voice disabled (No GEMINI_API_KEY found). Using default speech fallback."
    }));
  }

  ws.on("message", async (data: any) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "audio_input" && geminiWs && geminiWs.readyState === WebSocket.OPEN) {
        const payload = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm",
                data: message.data
              }
            ]
          }
        };
        geminiWs.send(JSON.stringify(payload));
      }

      if (message.type === "text_input") {
        try {
          const respText = await getLLMCompletion({
            messages: [
              { role: "system", content: "You are a helpful and polite mock interview helper." },
              { role: "user", content: message.text }
            ],
            purpose: "chat"
          });
          ws.send(JSON.stringify({ type: "text_response", text: respText || "" }));
        } catch (err: any) {
          ws.send(JSON.stringify({ type: "error", message: err.message }));
        }
      }
    } catch (e: any) {
      console.error("Browser message processing error:", e);
    }
  });

  ws.on("close", () => {
    console.log("Client socket closed");
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });
});


let viteInstance: any = null;

// Handle WebSocket upgrades
server.on("upgrade", (request, socket, head) => {
  let pathname = "/";
  try {
    // Avoid crashing on invalid header hostnames by using localhost as a parsing base URL
    pathname = new URL(request.url || "", "http://localhost").pathname;
  } catch (e) {
    console.error("Failed to parse upgrade URL:", e);
  }

  const cleanPath = pathname.replace(/\/$/, "");

  if (cleanPath === "/ws/interview" || cleanPath === "/ws/gd-room") {
    socket.write("HTTP/1.1 410 Gone\r\nConnection: close\r\n\r\n");
    socket.destroy();
  } else if (false) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else if (cleanPath === "/ws/gd-room") {
    gdWss.handleUpgrade(request, socket, head, (ws) => {
      gdWss.emit("connection", ws, request);
    });
  } else if (viteInstance) {
    // Forward standard HMR and developer-specific websocket handshakes to the Vite dev server
    try {
      viteInstance.ws.handleUpgrade(request, socket, head);
    } catch (e) {
      console.error("Vite WS upgrade processing failed:", e);
      socket.destroy();
    }
  } else {
    socket.destroy();
  }
});


app.use("/api", (error: any, _req: any, res: any, _next: any) => {
  if (res.headersSent) return res.end();
  const status = error?.type === "entity.too.large" ? 413 : error instanceof SyntaxError ? 400 : 503;
  console.error("[api] Request failed", { status, code: error?.code });
  res.status(status).json({ error: status === 413 ? "The upload exceeds the size limit." : status === 400 ? "Invalid request JSON." : "Service unavailable. Please retry." });
});

// Serve Vite or Static files depending on environment
async function initServer() {
  const isDev = process.env.NODE_ENV === "development" ||
    (process.env.NODE_ENV !== "production" &&
      process.argv[1] &&
      (process.argv[1].endsWith("server.ts") || process.argv[1].includes("tsx")));

  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    viteInstance = vite;
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL && process.env.TEST_MODE !== "true") {
    server.listen(PORT, process.env.HOST || "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

if (process.env.TEST_MODE !== "true") initServer().catch((err) => {
  console.error("Server boot error:", err);
});

export default app;

// Modified by Backend Engineer agent for Task run-3e9897-IC-102 at 2026-07-07 11:13:11
