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

// 1d. API Endpoint: Fetch student details from college database or fallback mock
app.get("/api/college/student/:rollNo", requireAuth, async (req: any, res) => {
  try {
    const { rollNo } = req.params;
    const cleanRollNo = String(rollNo || "").trim().toUpperCase();

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
        const response = await fetch(`${collegeUrl}/student/profile?rollNo=${cleanRollNo}`, {
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
        console.warn(`University API returned status ${response.status}. Falling back to cached mocks.`);
      } catch (apiErr: any) {
        console.error("Failed to query college portal endpoint, using mock database fallback:", apiErr);
      }
    }

    // Default mock profiles fallback
    const mockDb: Record<string, any> = {
      "24P31A1234": {
        studentId: "24P31A1234",
        name: "MOHAMMAD ABDUL ALEEM ARSHAD",
        department: "Information Technology",
        classSection: "II B.Tech IT - Section A",
        academicYear: "2024-2028",
        attendance: 84,
        isSynced: true,
        collegeAssessments: [
          { examName: "Mid-Term 1 (Theory)", percentage: 84, marks: "33.6 / 40" },
          { examName: "Mid-Term 2 (Theory)", percentage: 90, marks: "36.0 / 40" },
          { examName: "Previous Semester GPA", percentage: 85, marks: "8.50 / 10.0 SGPA" },
          { examName: "Design & Analysis of Algorithms Lab", percentage: 92, marks: "46.0 / 50" },
          { examName: "Data Structures & Java Assessment", percentage: 88, marks: "44.0 / 50" },
          { examName: "Soft Skills & Aptitude Assessment", percentage: 81, marks: "81 / 100" }
        ]
      },
      "22A91A0501": {
        studentId: "22A91A0501",
        name: "SOMA REDDY",
        department: "Computer Science Engineering",
        classSection: "IV B.Tech CSE - Section B",
        academicYear: "2022-2026",
        attendance: 79,
        isSynced: true,
        collegeAssessments: [
          { examName: "Mid-Term 1 (Theory)", percentage: 76, marks: "30.4 / 40" },
          { examName: "Mid-Term 2 (Theory)", percentage: 82, marks: "32.8 / 40" },
          { examName: "Previous Semester GPA", percentage: 80, marks: "8.02 / 10.0 SGPA" }
        ]
      },
      "24P31A9999": {
        studentId: "24P31A9999",
        name: "CAMPUS CONNECT DEMO STUDENT",
        department: "Artificial Intelligence & Data Science",
        classSection: "II B.Tech AI - Section A",
        academicYear: "2024-2028",
        attendance: 88,
        isSynced: true,
        collegeAssessments: [
          { examName: "Mid-Term 1 (Theory)", percentage: 90, marks: "36 / 40" }
        ]
      }
    };

    const matchedProfile = mockDb[cleanRollNo];
    if (matchedProfile) {
      res.json(matchedProfile);
    } else {
      res.json({
        studentId: cleanRollNo,
        name: `Aditya Student (${cleanRollNo})`,
        department: "Computer Science Engineering",
        classSection: "III B.Tech CSE - Section A",
        academicYear: "2023-2027",
        attendance: 75,
        isSynced: true,
        collegeAssessments: [
          { examName: "Mid-Term 1 (Theory)", percentage: 75, marks: "30 / 40" }
        ]
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

    const provider = process.env.AI_PROVIDER || "groq";
    if (provider === "groq") {
      try {
        getGroqClient();
      } catch (err: any) {
        res.status(500).json({ error: err.message, requiresApiKey: true });
        return;
      }
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
    const { questionId, questionText, category, transcript, gazeStats, postureStats, expressionStats, headStats, audioClarity, pitchVariance, speakingPace } = req.body;

    if (!questionText || !transcript) {
      res.status(400).json({ error: "Question text and response transcript are required." });
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

    const prompt = `You are an elite communication coach and technical grader. Grade this candidate's spoken response transcript.
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

    const provider = process.env.AI_PROVIDER || "groq";
    if (provider === "groq") {
      try {
        getGroqClient();
      } catch (err: any) {
        res.status(500).json({ error: err.message, requiresApiKey: true });
        return;
      }
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
  socket?: WebSocket;
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
  evaluation?: any;
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
    evaluation: room.evaluation || null,
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
  const completionText = await getLLMCompletion({
    messages: [
      { role: "system", content: "You are a university soft skills assessor. Respond with strict JSON only." },
      { role: "user", content: prompt }
    ],
    jsonMode: true,
  });

  try {
    const evalResult = JSON.parse(completionText || "{}");

    if (evalResult && Array.isArray(evalResult.participants)) {
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
        return p;
      });
    }

    return evalResult;
  } catch (err) {
    console.error("Room evaluation JSON parse failed:", err, completionText);
    return { error: "AI response could not be parsed." };
  }
}

// --- Supabase Persistence Helpers for Group Discussion Rooms ---

async function dbGetRoom(code: string): Promise<GDRoom | null> {
  const supabase = getSupabaseClient();
  let room: GDRoom | null = null;

  if (!supabase) {
    room = gdRooms.get(code) || null;
  } else {
    try {
      const { data, error } = await supabase
        .from("group_discussion_rooms")
        .select("*")
        .eq("code", code)
        .single();
      if (!error && data) {
        room = {
          code: data.code,
          topic: data.topic,
          participants: data.participants || [],
          dialogue: data.dialogue || [],
          createdAt: Number(data.created_at),
          startedAt: data.started_at ? Number(data.started_at) : undefined,
          evaluation: data.evaluation || undefined,
        };
      }
    } catch (err) {
      console.error("DB Get Room failed:", err);
    }
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
  const supabase = getSupabaseClient();
  if (!supabase) {
    gdRooms.set(room.code, room);
    return;
  }
  try {
    const payload = {
      code: room.code,
      topic: room.topic,
      participants: room.participants.map((p) => ({
        id: p.id,
        name: p.name,
        roll: p.roll,
        isHost: p.isHost,
        joinedAt: p.joinedAt,
      })),
      dialogue: room.dialogue,
      created_at: room.createdAt,
      started_at: room.startedAt || null,
      evaluation: room.evaluation || null,
    };

    const { error } = await supabase
      .from("group_discussion_rooms")
      .upsert(payload, { onConflict: "code" });
    if (error) {
      console.error("DB Save Room upsert error:", error);
    }
  } catch (err) {
    console.error("DB Save Room failed:", err);
  }
  // Keep local in-memory Map as a backup cache
  gdRooms.set(room.code, room);
}

async function dbDeleteRoom(code: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    gdRooms.delete(code);
    return;
  }
  try {
    await supabase.from("group_discussion_rooms").delete().eq("code", code);
  } catch (err) {
    console.error("DB Delete Room failed:", err);
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

        // Cache socket reference locally so dbGetRoom can link active sockets
        let localRoom = gdRooms.get(requestedCode);
        if (!localRoom) {
          localRoom = { ...room };
          gdRooms.set(requestedCode, localRoom);
        }
        const localP = localRoom.participants.find((p) => p.id === participant.id);
        if (localP) {
          localP.socket = ws;
        } else {
          localRoom.participants.push({ ...participant, socket: ws });
        }

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
    } catch (e: any) {
      console.error("GD WebSocket message error:", e);
      ws.send(JSON.stringify({ type: "error", message: "Failed to process socket payload." }));
    }
  });

  ws.on("close", () => {
    removeParticipantFromRoom();
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

    res.json(createRoomStatePayload(room));
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
    const rawUrl = process.env.SUPABASE_URL || "";
    const rawKey = process.env.SUPABASE_ANON_KEY || "";
    const viteUrl = process.env.VITE_SUPABASE_URL || "";
    const viteKey = process.env.VITE_SUPABASE_ANON_KEY || "";

    const url = rawUrl && !rawUrl.includes("your-project-id") 
      ? rawUrl 
      : viteUrl;

    const key = rawKey && !rawKey.includes("your-anon-public-key")
      ? rawKey 
      : viteKey;

    const hasCreds = Boolean(url && key);
    const client = getSupabaseClient();
    const isClientInit = client !== null;

    let dbTestStatus = "Not attempted";
    let dbTestError = null;

    if (client) {
      try {
        const testCode = "TEST_" + Math.random().toString(36).substring(2, 6).toUpperCase();
        const { error: writeError } = await client.from("group_discussion_rooms").upsert({
          code: testCode,
          topic: "Test Write Diagnostics",
          participants: [],
          dialogue: [],
          created_at: Date.now(),
        });

        if (writeError) {
          dbTestStatus = "Write Failed";
          dbTestError = writeError;
        } else {
          dbTestStatus = "Write Success";
          // Cleanup
          await client.from("group_discussion_rooms").delete().eq("code", testCode);
        }
      } catch (err: any) {
        dbTestStatus = "Error throwing";
        dbTestError = err.message;
      }
    }

    res.json({
      env: {
        NODE_ENV: process.env.NODE_ENV || "not set",
        VERCEL: process.env.VERCEL || "not set",
        hasSUPABASE_URL: Boolean(process.env.SUPABASE_URL),
        hasSUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
        hasVITE_SUPABASE_URL: Boolean(process.env.VITE_SUPABASE_URL),
        hasVITE_SUPABASE_ANON_KEY: Boolean(process.env.VITE_SUPABASE_ANON_KEY),
        resolvedUrl: url ? `${url.substring(0, 15)}...` : "none",
      },
      supabaseClientInitialized: isClientInit,
      dbTestStatus,
      dbTestError,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

  if (geminiKey) {
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
                    voiceName: "Puck"
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
        console.log("Gemini Live connection closed.");
        ws.send(JSON.stringify({ type: "error", message: "Gemini Live API session ended." }));
      });

      geminiWs.on("error", (err: any) => {
        console.error("Gemini Live connection error:", err);
        ws.send(JSON.stringify({ type: "error", message: "Gemini Live API connection error: " + err.message }));
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
            ]
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
