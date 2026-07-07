import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import Groq from "groq-sdk";
import pdf from "pdf-parse/lib/pdf-parse.js";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

import { createClient } from "@supabase/supabase-js";

// Lazy initialize Supabase client for backend authentication verification
let supabaseInstance: any = null;

function getSupabaseClient() {
  if (!supabaseInstance) {
    const rawUrl = process.env.SUPABASE_URL || "";
    const rawKey = process.env.SUPABASE_ANON_KEY || "";
    
    const url = rawUrl && !rawUrl.includes("your-project-id") 
      ? rawUrl 
      : process.env.VITE_SUPABASE_URL;
      
    const key = rawKey && !rawKey.includes("your-anon-public-key")
      ? rawKey 
      : process.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.warn("Supabase credentials not configured in environment variables. Middleware authorization will run in bypass mode.");
      return null;
    }
    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    // If Supabase is not configured yet, bypass token check to prevent app lockout during local development
    return next();
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. Authentication token is required." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
    }
    req.user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: "Token verification failed: " + err.message });
  }
}

// Lazy initialization of Groq client to prevent crashes on startup if key is missing
let groqInstance: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqInstance) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not configured. Please set it in your environment/secrets.");
    }
    groqInstance = new Groq({
      apiKey,
    });
  }
  return groqInstance;
}

interface CompletionOptions {
  messages: { role: string; content: string }[];
  jsonMode?: boolean;
}

async function getLLMCompletion(options: CompletionOptions): Promise<string> {
  const provider = process.env.AI_PROVIDER || "groq";

  if (provider === "ollama") {
    const ollamaUrl = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    const ollamaModel = process.env.OLLAMA_MODEL || "qwen3-coder:480b";

    const payload: any = {
      model: ollamaModel,
      messages: options.messages,
      stream: false,
    };
    if (options.jsonMode) {
      payload.format = "json";
    }

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const result: any = await response.json();
    return result.message?.content || "";
  } else {
    const groq = getGroqClient();
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

    const params: any = {
      messages: options.messages,
      model: model,
    };
    if (options.jsonMode) {
      params.response_format = { type: "json_object" };
    }

    const chatCompletion = await groq.chat.completions.create(params);
    return chatCompletion.choices[0]?.message?.content || "";
  }
}

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Increase payload limit to handle base64-encoded PDF resumes
app.use(express.json({ limit: "25mb" }));

// Local mock auth has been deprecated. All authentication is handled directly on the client side via Supabase Auth.

// 1c. API Endpoint: Ping
app.get("/api/ping", (req, res) => {
  res.json({ success: true });
});

// Helper: Fetch public repos via GitHub API
async function fetchGitHubRepos(username: string): Promise<any[]> {
  try {
    const response = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=6`, {
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

    // Initialize Groq safely
    let groq;
    try {
      groq = getGroqClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message, requiresApiKey: true });
      return;
    }

    // Step A: Fetch GitHub data
    const repos = await fetchGitHubRepos(githubUsername);

    // Check if resume url is provided and fetch PDF content
    let finalBase64Resume = resumeBase64;
    if (resumeUrl) {
      try {
        console.log(`Downloading resume from storage URL: ${resumeUrl.split("?")[0]}`);
        const fetchResponse = await fetch(resumeUrl);
        if (!fetchResponse.ok) {
          throw new Error(`Supabase Storage fetch failed: status ${fetchResponse.status}`);
        }
        const arrayBuffer = await fetchResponse.arrayBuffer();
        finalBase64Resume = Buffer.from(arrayBuffer).toString("base64");
      } catch (err: any) {
        console.error("Failed to retrieve resume from URL, falling back to client-provided base64:", err);
      }
    }

    // Extract text from PDF resume
    let resumeText = "";
    if (finalBase64Resume) {
      try {
        const pdfBuffer = Buffer.from(finalBase64Resume, "base64");
        const pdfData = await pdf(pdfBuffer);
        resumeText = pdfData.text;
      } catch (err: any) {
        console.error("Error parsing PDF resume, trying raw text fallback:", err);
        resumeText = Buffer.from(finalBase64Resume, "base64").toString("utf-8");
      }
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
      jsonMode: true
    });

    const result = JSON.parse(completionText || "{}");
    res.json(result);
  } catch (error: any) {
    console.error("Analysis Endpoint Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. API Endpoint: Generate 6 Adaptive Interview Questions
app.post("/api/interview/generate-questions", requireAuth, async (req: any, res) => {
  try {
    const { analysisResult } = req.body;

    if (!analysisResult) {
      res.status(400).json({ error: "Analysis result is required to generate tailored questions." });
      return;
    }

    let groq;
    try {
      groq = getGroqClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message, requiresApiKey: true });
      return;
    }

    const prompt = `You are a world-class technical interviewer compiling a personalized, adaptive interview plan.
Based on the candidate's profile:
- Parsed Resume: ${JSON.stringify(analysisResult.parsedResume)}
- GitHub Repos: ${JSON.stringify(analysisResult.githubAnalysis)}
- Cross-Reference Audit: ${JSON.stringify(analysisResult.crossReference)}

Generate exactly 6 technical interview questions that escalate in difficulty:
1. "Intro" category (Beginner difficulty) — warm-up, focus on the student's background/interests.
2. "Project Explanation" category (Developing difficulty) — ask them to explain a specific project from their resume, especially one matched or unmatched on GitHub.
3. "Technical Depth" category (Intermediate difficulty) — dig deep into one of the main languages or frameworks they claim (e.g., React, Python, TS).
4. "Problem Solving" category (Advanced difficulty) — ask how they would solve a specific scenario-based technical challenge relevant to their stack.
5. "Architecture" category (Advanced difficulty) — system design/architecture of a feature relevant to their projects (e.g. database schema, API gateway, file processing).
6. "Real-World Tradeoffs" category (Expert difficulty) — ask them to evaluate trade-offs between two frameworks/tools they used or design approaches (e.g. SQL vs NoSQL, client-side vs server-side rendering).

Respond with STRICT JSON matching this schema:
{
  "questions": [
    {
      "id": "question_1",
      "text": "The custom interview question tailored to their profile.",
      "category": "Intro",
      "difficulty": "Beginner"
    },
    {
      "id": "question_2",
      "text": "The custom interview question tailored to their profile.",
      "category": "Project Explanation",
      "difficulty": "Developing"
    },
    {
      "id": "question_3",
      "text": "The custom interview question tailored to their profile.",
      "category": "Technical Depth",
      "difficulty": "Intermediate"
    },
    {
      "id": "question_4",
      "text": "The custom interview question tailored to their profile.",
      "category": "Problem Solving",
      "difficulty": "Advanced"
    },
    {
      "id": "question_5",
      "text": "The custom interview question tailored to their profile.",
      "category": "Architecture",
      "difficulty": "Advanced"
    },
    {
      "id": "question_6",
      "text": "The custom interview question tailored to their profile.",
      "category": "Real-World Tradeoffs",
      "difficulty": "Expert"
    }
  ]
}`;

    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are a professional mock interviewer. Respond with a JSON object containing a 'questions' array conforming strictly to the requested schema." },
        { role: "user", content: prompt }
      ],
      jsonMode: true
    });

    const result = JSON.parse(completionText || "{}");
    res.json(result.questions || []);
  } catch (error: any) {
    console.error("Generate Questions Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. API Endpoint: Score Single Turn Answer
app.post("/api/interview/submit-answer", requireAuth, async (req: any, res) => {
  try {
    const { questionId, questionText, category, transcript, gazeStats, postureStats, expressionStats, headStats } = req.body;

    if (!questionText || !transcript) {
      res.status(400).json({ error: "Question text and response transcript are required." });
      return;
    }

    let groq;
    try {
      groq = getGroqClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message, requiresApiKey: true });
      return;
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

    const prompt = `You are an elite communication coach and technical grader. Grade this candidate's spoken response transcript.
Question Category: ${category}
Question asked: "${questionText}"
Spoken Answer Transcript: "${transcript}"
${visualMetricsPrompt}

Provide feedback conforming to the following JSON schema:
{
  "score": 85, // Integer from 0 to 100
  "strengths": ["strong point description"],
  "improvements": ["improvement description"],
  "speechFeedback": "Feedback about vocabulary richness, structural coherence, and filler-word reduction.",
  "contentFeedback": "Feedback on the technical depth and factual accuracy of the content.",
  "presentationFeedback": "Guidance on on-camera verbal engagement, pacing, confidence, and articulation."
}

RULE: Absolutely do not judge or infer personal, physical, medical, emotional, or identity traits. Evaluate only the speech structure, communication technique, and technical accuracy of the spoken content.`;

    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are an expert technical interviewer and feedback coach. Respond with a JSON object conforming strictly to the requested schema." },
        { role: "user", content: prompt }
      ],
      jsonMode: true
    });

    const evaluation = JSON.parse(completionText || "{}");

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
      presentationFeedback: evaluation.presentationFeedback
    };

    res.json(feedback);
  } catch (error: any) {
    console.error("Submit Answer Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. API Endpoint: Compile Final Report & Scorecard
app.post("/api/interview/generate-report", requireAuth, async (req: any, res) => {
  try {
    const { studentId, githubUsername, answerFeedbacks, originalAnalysis } = req.body;

    if (!answerFeedbacks || !Array.isArray(answerFeedbacks) || answerFeedbacks.length === 0) {
      res.status(400).json({ error: "Answers feedback list is required to compile a final report." });
      return;
    }

    let groq;
    try {
      groq = getGroqClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message, requiresApiKey: true });
      return;
    }

    const prompt = `You are a senior talent architect and engineering director. Review the performance logs of a college student mock interview:
- Candidate Profile summary: Resume: ${JSON.stringify(originalAnalysis?.parsedResume?.skills || [])}, GitHub Stack: ${JSON.stringify(originalAnalysis?.githubAnalysis?.primaryStack || [])}
- Question-by-question response audits: ${JSON.stringify(answerFeedbacks)}

Synthesize a comprehensive University-grade Interview Scorecard report.
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
      "improvedVersion": "Prinstine rewritten answer",
      "explanation": "Explanation description"
    }
  ],
  "finalVerdict": "Summation verdict text"
}`;

    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are an engineering director. Respond with a JSON object conforming strictly to the requested schema." },
        { role: "user", content: prompt }
      ],
      jsonMode: true
    });

    const rawReport = JSON.parse(completionText || "{}");
    const scorecard = {
      id: "rpt_" + Math.random().toString(36).substring(2, 9),
      studentId,
      githubUsername,
      date: new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' }),
      ...rawReport
    };

    res.json(scorecard);
  } catch (error: any) {
    console.error("Generate Report Error:", error);
    res.status(500).json({ error: error.message });
  }
});


// 5b. API Endpoint: Evaluate Group Discussion Dialogues (2 Students)
app.post("/api/interview/evaluate-gd", requireAuth, async (req: any, res) => {
  try {
    const { topic, student1, student2, dialogue } = req.body;

    if (!topic || !student1 || !student2 || !dialogue || !Array.isArray(dialogue) || dialogue.length === 0) {
      res.status(400).json({ error: "Topic, student details, and dialogue history are required." });
      return;
    }

    let groq;
    try {
      groq = getGroqClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message, requiresApiKey: true });
      return;
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
      jsonMode: true
    });

    const result = JSON.parse(completionText || "{}");
    res.json(result);
  } catch (error: any) {
    console.error("GD Evaluation Error:", error);
    res.status(500).json({ error: error.message });
  }
});

interface GDParticipant {
  id: string;
  name: string;
  roll: string;
  isHost: boolean;
  joinedAt: number;
  socket: WebSocket;
}

interface GDTurn {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerRoll: string;
  text: string;
  timestamp: number;
}

interface GDRoom {
  code: string;
  topic: string;
  participants: GDParticipant[];
  dialogue: GDTurn[];
  createdAt: number;
  startedAt?: number;
}

const gdRooms = new Map<string, GDRoom>();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function sanitizeRoomCode(code: string) {
  return String(code || "").trim().toUpperCase();
}

function createRoomStatePayload(room: GDRoom) {
  return {
    type: "room_state",
    roomCode: room.code,
    topic: room.topic,
    startedAt: room.startedAt || null,
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      roll: p.roll,
      isHost: p.isHost,
      joinedAt: p.joinedAt,
    })),
    dialogue: room.dialogue.map((turn) => ({
      id: turn.id,
      speakerId: turn.speakerId,
      speakerName: turn.speakerName,
      speakerRoll: turn.speakerRoll,
      text: turn.text,
      timestamp: turn.timestamp,
    })),
    hostId: room.participants.find((p) => p.isHost)?.id || null,
  };
}

function broadcastRoom(room: GDRoom, payload: any) {
  const payloadText = JSON.stringify(payload);
  room.participants.forEach((participant) => {
    try {
      participant.socket.send(payloadText);
    } catch (err) {
      console.warn("Broadcast to participant failed", participant.id, err);
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
  const prompt = evaluateRoomPrompt(room);
  const completionText = await getLLMCompletion({
    messages: [
      { role: "system", content: "You are a university soft skills assessor. Respond with strict JSON only." },
      { role: "user", content: prompt }
    ],
    jsonMode: true,
  });

  try {
    return JSON.parse(completionText || "{}");
  } catch (err) {
    console.error("Room evaluation JSON parse failed:", err, completionText);
    return { error: "AI response could not be parsed." };
  }
}

const gdWss = new WebSocketServer({ noServer: true });

gdWss.on("connection", async (ws: WebSocket, request: any) => {
  let currentRoomCode: string | null = null;
  let participantId: string | null = null;

  const removeParticipantFromRoom = () => {
    if (!currentRoomCode || !participantId) return;
    const room = gdRooms.get(currentRoomCode);
    if (!room) return;

    room.participants = room.participants.filter((p) => p.id !== participantId);
    if (room.participants.length === 0) {
      gdRooms.delete(currentRoomCode);
      return;
    }

    const hostStillPresent = room.participants.some((p) => p.isHost);
    if (!hostStillPresent) {
      room.participants[0].isHost = true;
    }

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
          while (gdRooms.has(code)) {
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
            createdAt: Date.now(),
          };

          gdRooms.set(code, room);
          currentRoomCode = code;
          participantId = participant.id;

          ws.send(JSON.stringify({ type: "joined_room", roomCode: code, isHost: true }));
          broadcastRoom(room, createRoomStatePayload(room));
          return;
        }

        if (!requestedCode) {
          ws.send(JSON.stringify({ type: "error", message: "Room code is required to join an existing discussion." }));
          return;
        }

        const room = gdRooms.get(requestedCode);
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

        ws.send(JSON.stringify({ type: "joined_room", roomCode: requestedCode, isHost: false }));
        broadcastRoom(room, createRoomStatePayload(room));
        return;
      }

      if (!currentRoomCode || !participantId) {
        ws.send(JSON.stringify({ type: "error", message: "You must join a room before sending other messages." }));
        return;
      }

      const room = gdRooms.get(currentRoomCode);
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
        broadcastRoom(room, { type: "new_turn", turn });
        return;
      }

      if (message.type === "end_discussion") {
        if (!participant.isHost) {
          ws.send(JSON.stringify({ type: "error", message: "Only the host can end the discussion." }));
          return;
        }

        const evaluation = await evaluateDiscussionRoom(room);
        broadcastRoom(room, { type: "evaluation_result", evaluation });
        return;
      }

      if (message.type === "leave_room") {
        removeParticipantFromRoom();
        ws.close();
        return;
      }

      if (message.type === "request_room_state") {
        ws.send(JSON.stringify(createRoomStatePayload(room)));
        return;
      }
    } catch (e: any) {
      console.error("GD WebSocket message error:", e);
      ws.send(JSON.stringify({ type: "error", message: "Failed to process socket payload." }));
    }
  });

  ws.on("close", () => {
    removeParticipantFromRoom();
  });
});

// 6. WebSocket Server Setup for Groq Fallback gateway
// Standard Serverless environments like Vercel do not support WebSockets, but we retain it
// for local compatibility, running it with Groq text completions as a fallback.
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", async (ws: WebSocket) => {
  console.log("WebSocket Client connected to Interview WebSocket");

  ws.on("message", async (data: any) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "init") {
        ws.send(JSON.stringify({ 
          type: "error", 
          message: "Groq does not support the Gemini Live real-time audio API. Standard voice transcription via browser Web Speech API is supported. Falling back to text response mode." 
        }));
        ws.send(JSON.stringify({ type: "ready", status: "Connected (Text Fallback Mode)" }));
      }

      if (message.type === "text_input") {
        try {
          const respText = await getLLMCompletion({
            messages: [
              { role: "system", content: "You are a helpful and polite mock interview helper." },
              { role: "user", content: message.text }
            ]
          });
          ws.send(JSON.stringify({ type: "text_response", text: respText || "" }));
        } catch (err: any) {
          ws.send(JSON.stringify({ type: "error", message: err.message }));
        }
      }
    } catch (e: any) {
      console.error("WebSocket message processing error:", e);
      ws.send(JSON.stringify({ type: "error", message: "Failed to process socket payload" }));
    }
  });

  ws.on("close", () => {
    console.log("Client socket closed");
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

  if (cleanPath === "/ws/interview") {
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


// Serve Vite or Static files depending on environment
async function initServer() {
  if (process.env.NODE_ENV !== "production") {
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

  if (!process.env.VERCEL) {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

initServer().catch((err) => {
  console.error("Server boot error:", err);
});

export default app;

// Modified by Backend Engineer agent for Task run-3e9897-IC-102 at 2026-07-07 11:13:11
