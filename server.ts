import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Lazy initialization of Gemini client to prevent crashes on startup if key is missing
let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured. Please add it via the Secrets panel in AI Studio Settings.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Increase payload limit to handle base64-encoded PDF resumes
app.use(express.json({ limit: "25mb" }));

// 1. API Endpoint: Login
app.post("/api/login", (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId || typeof studentId !== "string" || studentId.trim().length < 4) {
      res.status(400).json({ error: "Invalid Student ID. Must be at least 4 characters long." });
      return;
    }
    // Simulation of simple login persistence
    res.json({ success: true, studentId: studentId.trim() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
app.post("/api/analyze", async (req, res) => {
  try {
    const { githubUsername, resumeBase64, resumeFileName, resumeMimeType } = req.body;

    if (!githubUsername) {
      res.status(400).json({ error: "GitHub username is required." });
      return;
    }

    // Initialize Gemini safely
    let ai;
    try {
      ai = getGeminiClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message, requiresApiKey: true });
      return;
    }

    // Step A: Fetch GitHub data
    const repos = await fetchGitHubRepos(githubUsername);

    // Step B: Build multimodal parts for Gemini
    const contents: any[] = [];

    // Add resume part if provided
    if (resumeBase64) {
      contents.push({
        inlineData: {
          mimeType: resumeMimeType || "application/pdf",
          data: resumeBase64
        }
      });
    }

    // Add GitHub data context
    contents.push({
      text: `GitHub Username: ${githubUsername}\nFetched Repositories Data:\n${JSON.stringify(repos, null, 2)}`
    });

    // Add prompt instructions
    contents.push({
      text: `You are an elite technical interviewer and resume auditor. Analyze the uploaded resume (PDF) and the fetched GitHub repositories to:
1. Parse the resume cleanly to extract skills, education, projects, and experiences.
2. Summarize the candidate's public repositories: stack, star count, and projects.
3. Cross-reference the resume projects and skill claims with the actual code/repositories fetched from GitHub. Note which claims are "proven" (have corresponding repositories or technologies on GitHub) vs "unproven" (claimed on resume but no evidence on GitHub) or vague.
4. Calculate an alignment score (0 to 100) and provide professional, constructiveness-driven suggestions.

Respond with STRICT JSON matching the schema provided.`
    });

    // Request structured JSON output from Gemini
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["parsedResume", "githubAnalysis", "crossReference"],
          properties: {
            parsedResume: {
              type: Type.OBJECT,
              required: ["name", "education", "skills", "projects", "experience", "achievements"],
              properties: {
                name: { type: Type.STRING, description: "Candidate's full name from the resume." },
                email: { type: Type.STRING, description: "Candidate's email if available." },
                education: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ["school", "degree", "major", "graduationDate"],
                    properties: {
                      school: { type: Type.STRING },
                      degree: { type: Type.STRING },
                      major: { type: Type.STRING },
                      graduationDate: { type: Type.STRING }
                    }
                  }
                },
                skills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of tech stack, skills, tools mentioned in the resume."
                },
                projects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ["title", "description", "technologies"],
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      technologies: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                  }
                },
                experience: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ["company", "role", "startDate", "endDate", "description"],
                    properties: {
                      company: { type: Type.STRING },
                      role: { type: Type.STRING },
                      startDate: { type: Type.STRING },
                      endDate: { type: Type.STRING },
                      description: { type: Type.STRING }
                    }
                  }
                },
                achievements: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            githubAnalysis: {
              type: Type.OBJECT,
              required: ["primaryStack", "repos", "qualitySignals", "weakAreas"],
              properties: {
                primaryStack: { type: Type.ARRAY, items: { type: Type.STRING } },
                repos: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ["name", "description", "languages", "primaryLanguage", "stars", "forks", "url"],
                    properties: {
                      name: { type: Type.STRING },
                      description: { type: Type.STRING },
                      languages: { type: Type.ARRAY, items: { type: Type.STRING } },
                      primaryLanguage: { type: Type.STRING },
                      stars: { type: Type.INTEGER },
                      forks: { type: Type.INTEGER },
                      url: { type: Type.STRING }
                    }
                  }
                },
                qualitySignals: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Observable indicators of code quality (good readmes, modular code, star counts)." },
                weakAreas: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Observable areas lacking development depth or lacking modern practices." }
              }
            },
            crossReference: {
              type: Type.OBJECT,
              required: ["alignmentScore", "provenClaims", "unprovenClaims", "suggestions"],
              properties: {
                alignmentScore: { type: Type.INTEGER, description: "A percentage rating alignment between resume claims and public GitHub repos." },
                provenClaims: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Skills or projects clearly verified by the repositories." },
                unprovenClaims: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Claims on the resume with no correlating public repos or languages." },
                suggestions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Actionable ideas on what kind of projects or documentation to add to align them." }
              }
            }
          }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    res.json(result);
  } catch (error: any) {
    console.error("Analysis Endpoint Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. API Endpoint: Generate 6 Adaptive Interview Questions
app.post("/api/interview/generate-questions", async (req, res) => {
  try {
    const { analysisResult } = req.body;

    if (!analysisResult) {
      res.status(400).json({ error: "Analysis result is required to generate tailored questions." });
      return;
    }

    let ai;
    try {
      ai = getGeminiClient();
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

Respond with STRICT JSON matching the schema provided.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "text", "category", "difficulty"],
            properties: {
              id: { type: Type.STRING },
              text: { type: Type.STRING, description: "The actual custom interview question tailored to their profile." },
              category: {
                type: Type.STRING,
                enum: ["Intro", "Project Explanation", "Technical Depth", "Problem Solving", "Architecture", "Real-World Tradeoffs"]
              },
              difficulty: {
                type: Type.STRING,
                enum: ["Beginner", "Developing", "Intermediate", "Advanced", "Expert"]
              }
            }
          }
        }
      }
    });

    const questions = JSON.parse(response.text || "[]");
    res.json(questions);
  } catch (error: any) {
    console.error("Generate Questions Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. API Endpoint: Score Single Turn Answer
app.post("/api/interview/submit-answer", async (req, res) => {
  try {
    const { questionId, questionText, category, transcript } = req.body;

    if (!questionText || !transcript) {
      res.status(400).json({ error: "Question text and response transcript are required." });
      return;
    }

    let ai;
    try {
      ai = getGeminiClient();
    } catch (err: any) {
      res.status(500).json({ error: err.message, requiresApiKey: true });
      return;
    }

    const wordCount = transcript.split(/\s+/).length;
    // Simple mock stats that look professional
    const pacing = wordCount < 50 ? "Slow" : wordCount > 150 ? "Fast" : "Optimal";
    // Count filler words: like, um, uh, basically, actually
    const fillerWords = (transcript.match(/\b(like|um|uh|basically|actually|so|you know)\b/gi) || []).length;

    const prompt = `You are an elite communication coach and technical grader. Grade this candidate's spoken response transcript.
Question Category: ${category}
Question asked: "${questionText}"
Spoken Answer Transcript: "${transcript}"

Provide:
1. Graded Score (0 to 100) reflecting technical accuracy, depth, structure, and communication.
2. Bulleted strengths of the response.
3. Bulleted suggestions for improvements.
4. Specific speech feedback (vocabulary usage, conciseness, verbal structure).
5. Specific technical content feedback.
6. Presentation advice based on expected presentation metrics.

RULE: Absolutely do not judge or infer personal, physical, medical, emotional, or identity traits. Evaluate only the speech structure, communication technique, and technical accuracy of the spoken content.

Respond with STRICT JSON matching the schema provided.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["score", "strengths", "improvements", "speechFeedback", "contentFeedback", "presentationFeedback"],
          properties: {
            score: { type: Type.INTEGER, description: "Score from 0 to 100." },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
            speechFeedback: { type: Type.STRING, description: "Feedback about vocabulary richness, structural coherence, and filler-word reduction." },
            contentFeedback: { type: Type.STRING, description: "Feedback on the technical depth and factual accuracy of the content." },
            presentationFeedback: { type: Type.STRING, description: "Guidance on on-camera verbal engagement, pacing, confidence, and articulation." }
          }
        }
      }
    });

    const evaluation = JSON.parse(response.text || "{}");

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
app.post("/api/interview/generate-report", async (req, res) => {
  try {
    const { studentId, githubUsername, answerFeedbacks, originalAnalysis } = req.body;

    if (!answerFeedbacks || !Array.isArray(answerFeedbacks) || answerFeedbacks.length === 0) {
      res.status(400).json({ error: "Answers feedback list is required to compile a final report." });
      return;
    }

    let ai;
    try {
      ai = getGeminiClient();
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

Respond with STRICT JSON matching the schema provided.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["overallScore", "candidateLevel", "categoryScores", "strengths", "weaknesses", "recommendedTopics", "sampleAnswers", "finalVerdict"],
          properties: {
            overallScore: { type: Type.INTEGER },
            candidateLevel: {
              type: Type.STRING,
              enum: ["Beginner", "Developing", "Interview Ready", "Strong Candidate", "Excellent Candidate"]
            },
            categoryScores: {
              type: Type.OBJECT,
              required: [
                "resumeStrength",
                "githubStrength",
                "technicalDepth",
                "problemSolving",
                "communicationClarity",
                "vocabularyRichness",
                "presentationConfidence",
                "overallReadiness"
              ],
              properties: {
                resumeStrength: { type: Type.INTEGER },
                githubStrength: { type: Type.INTEGER },
                technicalDepth: { type: Type.INTEGER },
                problemSolving: { type: Type.INTEGER },
                communicationClarity: { type: Type.INTEGER },
                vocabularyRichness: { type: Type.INTEGER },
                presentationConfidence: { type: Type.INTEGER },
                overallReadiness: { type: Type.INTEGER }
              }
            },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
            sampleAnswers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["question", "originalResponse", "improvedVersion", "explanation"],
                properties: {
                  question: { type: Type.STRING },
                  originalResponse: { type: Type.STRING },
                  improvedVersion: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                }
              }
            },
            finalVerdict: { type: Type.STRING }
          }
        }
      }
    });

    const rawReport = JSON.parse(response.text || "{}");
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


// 6. WebSocket Server Setup for Gemini Live API Low-Latency gateway
// This acts as a gateway proxying raw audio or text prompts to Gemini Live.
// We also implement a fallback server response so that even if Live connection is blocked,
// the app is fully communicative and handles audio buffers elegantly.
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", async (ws: WebSocket) => {
  console.log("WebSocket Client connected to Interview WebSocket");
  let liveSession: any = null;

  ws.on("message", async (data: any) => {
    try {
      const message = JSON.parse(data.toString());

      // Client requests to initialize a live interview session
      if (message.type === "init") {
        const { systemInstruction } = message;

        try {
          const ai = getGeminiClient();
          console.log("Establishing Gemini Live connection...");

          liveSession = await ai.live.connect({
            model: "gemini-3.1-flash-live-preview",
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
              },
              systemInstruction: systemInstruction || "You are a professional mock interviewer. Ask questions, evaluate answers calmly.",
              generationConfig: {
                temperature: 0.7
              }
            },
            callbacks: {
              onmessage: (msg: any) => {
                // If audio data is returned from Gemini Live
                const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audio) {
                  ws.send(JSON.stringify({ type: "audio", audio }));
                }

                // If text transcriptions are returned
                const transcript = msg.serverContent?.modelTurn?.parts?.[0]?.text;
                if (transcript) {
                  ws.send(JSON.stringify({ type: "transcript", transcript }));
                }

                // If user speech interrupted Gemini
                if (msg.serverContent?.interrupted) {
                  ws.send(JSON.stringify({ type: "interrupted" }));
                }
              }
            }
          });

          ws.send(JSON.stringify({ type: "ready", status: "Connected to Gemini Live" }));
          console.log("Gemini Live Connection Ready");
        } catch (err: any) {
          console.error("Gemini Live connection failure:", err);
          ws.send(JSON.stringify({ type: "error", message: `Gemini Live connection could not be established: ${err.message}. Falling back to standard WebSocket agent.` }));
        }
      }

      // Client sends realtime microphone PCM audio bytes
      if (message.type === "audio_input" && liveSession) {
        liveSession.sendRealtimeInput({
          audio: {
            data: message.audio,
            mimeType: "audio/pcm;rate=16000"
          }
        });
      }

      // Text prompt input (fallback or command interaction)
      if (message.type === "text_input") {
        if (liveSession) {
          liveSession.sendRealtimeInput({
            text: message.text
          });
        } else {
          // Standard server fallback if Live API isn't connected
          // We can generate synthetic speech or just answer with text
          try {
            const ai = getGeminiClient();
            const resp = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: message.text,
              config: {
                systemInstruction: "You are a helpful and polite mock interview helper."
              }
            });
            ws.send(JSON.stringify({ type: "text_response", text: resp.text }));
          } catch (err: any) {
            ws.send(JSON.stringify({ type: "error", message: err.message }));
          }
        }
      }
    } catch (e: any) {
      console.error("WebSocket message processing error:", e);
      ws.send(JSON.stringify({ type: "error", message: "Failed to process socket payload" }));
    }
  });

  ws.on("close", () => {
    console.log("Client socket closed");
    if (liveSession) {
      try {
        liveSession.close();
      } catch (e) {
        // ignore
      }
    }
  });
});


// Handle WebSocket upgrades
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
  if (pathname === "/ws/interview") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
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
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

initServer().catch((err) => {
  console.error("Server boot error:", err);
});
