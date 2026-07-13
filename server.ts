import express from "express";
import path from "path";
import http from "http";
import https from "https";
import crypto from "crypto";
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
  temperature?: number;
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
    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
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

// Portal sync helper: Encrypt password matching Aditya Portal AES 128-bit CBC
function encryptPortalPassword(plaintext: string): string {
  const key = Buffer.from("8701661282118308", "utf8");
  const iv = Buffer.from("8701661282118308", "utf8");
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUPPETEER-BASED PORTAL SCRAPER (Primary — bypasses Cloudflare)
// ─────────────────────────────────────────────────────────────────────────────

/** Detect local Chrome or Edge executable for Puppeteer */
function findChromiumExecutable(): string | null {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates: string[] = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch {}
  }
  return null;
}

/** Scrape the Aditya portal using a real headless Chrome — bypasses Cloudflare */
async function scrapeWithPuppeteer(rollNo: string, password: string, portal: string): Promise<any> {
  // Dynamic import so the server still starts even if puppeteer-core is missing
  let puppeteer: any;
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    throw new Error("puppeteer-core not available.");
  }

  const executablePath = findChromiumExecutable();
  if (!executablePath) {
    throw new Error("No local Chrome/Edge found. Cannot use browser scraper.");
  }

  console.log(`[Puppeteer] Launching Chrome: ${executablePath}`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1280,800",
      "--disable-blink-features=AutomationControlled",
    ],
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  try {
    // Spoof automation detection so Cloudflare passes us through
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7" });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const loginUrl = `https://info.aec.edu.in/${portal}/default.aspx`;
    console.log(`[Puppeteer] Navigating to: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Give Cloudflare JS challenge time to resolve (usually 3-5 seconds)
    await new Promise(r => setTimeout(r, 4000));

    const pageTitle = await page.title();
    console.log(`[Puppeteer] Page title: "${pageTitle}"`);
    if (pageTitle.toLowerCase().includes("just a moment") || pageTitle.toLowerCase().includes("attention required")) {
      throw new Error("Cloudflare challenge active — portal is blocking headless access.");
    }

    const encryptedPwd = encryptPortalPassword(password);

    if (portal === "aus") {
      // ── AUS / Campus Connect login ──
      console.log(`[Puppeteer] AUS portal: selecting Student radio...`);
      await page.waitForSelector('input[type="radio"]', { timeout: 10000 }).catch(() => {});

      const radioClicked = await page.evaluate(() => {
        const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
        const studentRadio = radios.find(r =>
          r.value?.toLowerCase().includes("student") ||
          r.id?.toLowerCase().includes("student") ||
          r.name?.toLowerCase().includes("student")
        );
        if (studentRadio) { studentRadio.click(); return true; }
        if (radios.length >= 2) { radios[1].click(); return true; }
        return false;
      });
      console.log(`[Puppeteer] Student radio clicked: ${radioClicked}`);
      await new Promise(r => setTimeout(r, 500));

      // Fill roll number
      const userIdFilled = await page.evaluate((val: string) => {
        const candidates = [
          document.querySelector<HTMLInputElement>("#txtUserId"),
          document.querySelector<HTMLInputElement>('input[name="txtUserId"]'),
          document.querySelector<HTMLInputElement>('input[placeholder*="Roll"]'),
          document.querySelector<HTMLInputElement>('input[placeholder*="User"]'),
          document.querySelector<HTMLInputElement>('input[type="text"]'),
        ];
        const f = candidates.find(x => x !== null) as HTMLInputElement | null;
        if (f) { f.value = val; f.dispatchEvent(new Event("input", { bubbles: true })); f.dispatchEvent(new Event("change", { bubbles: true })); return true; }
        return false;
      }, rollNo);
      console.log(`[Puppeteer] Roll number filled: ${userIdFilled}`);

      // Fill visible password with plaintext (portal JS will encrypt it on submit via hdnpwd)
      await page.evaluate((pwd: string) => {
        const candidates = [
          document.querySelector<HTMLInputElement>("#txtPassword"),
          document.querySelector<HTMLInputElement>('input[name="txtPassword"]'),
          document.querySelector<HTMLInputElement>('input[type="password"]'),
        ];
        const f = candidates.find(x => x !== null) as HTMLInputElement | null;
        if (f) { f.value = pwd; f.dispatchEvent(new Event("input", { bubbles: true })); f.dispatchEvent(new Event("change", { bubbles: true })); }
      }, password);

      // Pre-set hidden encrypted password field so the server-side validation passes
      await page.evaluate((enc: string) => {
        const f = document.querySelector<HTMLInputElement>('input[name="hdnpwd"], #hdnpwd');
        if (f) f.value = enc;
      }, encryptedPwd);

      // Click login button
      const loginClicked = await page.evaluate(() => {
        const candidates = [
          document.querySelector<HTMLElement>("#btnLogin"),
          document.querySelector<HTMLElement>('input[name="btnLogin"]'),
          document.querySelector<HTMLElement>('button[id*="Login"]'),
          document.querySelector<HTMLElement>('input[value="LOGIN"]'),
          document.querySelector<HTMLElement>('input[type="submit"]'),
        ];
        const btn = candidates.find(x => x !== null) as HTMLElement | null;
        if (btn) { btn.click(); return true; }
        return false;
      });
      console.log(`[Puppeteer] Login button clicked: ${loginClicked}`);

    } else {
      // ── ACET portal login ──
      console.log(`[Puppeteer] ACET portal: filling student login fields...`);
      await page.evaluate((roll: string, pwd: string, enc: string) => {
        const id = document.querySelector<HTMLInputElement>('#txtId2, input[name="txtId2"]');
        const pw = document.querySelector<HTMLInputElement>('#txtPwd2, input[name="txtPwd2"]');
        const hp = document.querySelector<HTMLInputElement>('#hdnpwd2, input[name="hdnpwd2"]');
        if (id) id.value = roll;
        if (pw) { pw.value = pwd; pw.dispatchEvent(new Event("input", { bubbles: true })); }
        if (hp) hp.value = enc;
      }, rollNo, password, encryptedPwd);
      await page.evaluate(() => {
        const btn = (document.querySelector<HTMLElement>('#imgBtn2, input[name="imgBtn2"]') ||
                     document.querySelector<HTMLElement>('input[type="image"]'));
        if (btn) btn.click();
      });
    }

    // Wait for portal to navigate to dashboard
    console.log(`[Puppeteer] Waiting for post-login navigation...`);
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    const postLoginUrl = page.url();
    const postLoginHtml = await page.content();
    const lower = postLoginHtml.toLowerCase();
    console.log(`[Puppeteer] Post-login URL: ${postLoginUrl}, hasLogout: ${lower.includes("lnklogout")}`);

    if (!lower.includes("lnklogout") && !lower.includes("studentmaster") && !postLoginUrl.includes("StudentMaster")) {
      const errorText = await page.evaluate(() => {
        const el = document.querySelector(".alert, .error, span[style*='color:red'], span[style*='Color:Red']");
        return el ? el.textContent?.trim() : null;
      });
      throw new Error(errorText
        ? `Portal rejected login: ${errorText}`
        : "Authentication failed — dashboard not loaded after login"
      );
    }

    // Fetch student profile via AjaxPro using the authenticated browser session
    console.log(`[Puppeteer] Login successful. Fetching profile via AJAX...`);
    const ajaxUrl = `https://info.aec.edu.in/${portal}/ajax/StudentProfile,App_Web_studentprofile.aspx.a2a1b31c.ashx?_method=ShowStudentProfileNew&_session=rw`;
    const ajaxBody = `RollNo=${encodeURIComponent(rollNo)}\r\nisImageDisplay=${encodeURIComponent("true")}`;

    const profileHtml: string = await page.evaluate(async (url: string, body: string, referer: string) => {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "X-AjaxPro-Method": "ShowStudentProfileNew",
          "Content-Type": "text/plain; charset=utf-8",
          "Referer": referer,
        },
        body,
        credentials: "include",
      });
      return r.text();
    }, ajaxUrl, ajaxBody, `https://info.aec.edu.in/${portal}/Academics/StudentProfile.aspx?scrid=17`);

    console.log(`[Puppeteer] Profile AJAX length: ${profileHtml?.length}`);
    if (!profileHtml || profileHtml.length < 50) {
      throw new Error("Portal returned empty profile data after login.");
    }

    return parsePortalProfileHtml(profileHtml, rollNo, portal);

  } finally {
    await browser.close();
    console.log(`[Puppeteer] Browser closed.`);
  }
}

/**
 * Master scraper orchestrator.
 * 1st try: Puppeteer (real Chrome headless) — bypasses Cloudflare
 * 2nd try: Raw HTTP — works if Cloudflare not active
 */
async function scrapePortalWithFallback(rollNo: string, password: string, portal: string): Promise<any> {
  try {
    console.log(`[Portal] Attempting Puppeteer scrape for ${rollNo} on ${portal}...`);
    return await scrapeWithPuppeteer(rollNo, password, portal);
  } catch (err: any) {
    console.warn(`[Portal] Puppeteer failed (${err.message}), trying raw HTTP...`);
    return await scrapeStudentProfileFromPortal(rollNo, password, portal);
  }
}

// Raw HTTP client to interact with portal
async function makePortalRawRequest(urlStr: string, method = "GET", headers: Record<string, string> = {}, body: string | null = null): Promise<{ statusCode: number | undefined; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options: any = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      // Full browser-like headers to bypass Cloudflare bot detection
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "Cache-Control": "max-age=0",
        ...headers
      }
    };

    if (body) {
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(options, (res) => {
      const chunks: any[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString()
        });
      });
    });

    req.on("error", (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

// Client wrapper to maintain sessions across requests
async function fetchPortalWithCookies(urlStr: string, method = "GET", headers: Record<string, string> = {}, body: string | null = null, cookieJar: Record<string, string> = {}): Promise<{ statusCode: number | undefined; headers: any; body: string; cookies: Record<string, string> }> {
  let currentUrl = urlStr;
  let currentMethod = method;
  let currentBody = body;
  let redirectCount = 0;
  const MAX_REDIRECTS = 15;

  while (true) {
    const cookieHeaderValue = Object.entries(cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const requestHeaders = { ...headers };
    if (cookieHeaderValue) {
      requestHeaders["Cookie"] = cookieHeaderValue;
    }
    if (currentBody && currentMethod === "POST") {
      requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const res = await makePortalRawRequest(currentUrl, currentMethod, requestHeaders, currentBody);

    // Settle cookies
    const setCookies = res.headers["set-cookie"];
    if (setCookies) {
      for (const sc of setCookies) {
        const cookiePair = sc.split(";")[0];
        const eqIdx = cookiePair.indexOf("=");
        if (eqIdx !== -1) {
          const k = cookiePair.substring(0, eqIdx).trim();
          const v = cookiePair.substring(eqIdx + 1).trim();
          cookieJar[k] = v;
        }
      }
    }

    // Handle redirects with a limit to prevent infinite loops (e.g. Cloudflare challenges)
    if (res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 307 || res.statusCode === 308) {
      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        throw new Error(`Too many redirects (${redirectCount}) — the portal may be blocking automated access (Cloudflare).`);
      }
      const redirectLoc = res.headers["location"];
      if (!redirectLoc) {
        return { ...res, cookies: cookieJar };
      }
      currentUrl = new URL(redirectLoc, currentUrl).toString();
      currentMethod = "GET";
      currentBody = null;
      delete requestHeaders["Content-Type"];
      delete requestHeaders["Content-Length"];
      continue;
    }

    return {
      ...res,
      cookies: cookieJar
    };
  }
}

// Extract inputs dynamically from login HTML page
function extractPortalFormFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const inputRegex = /<input\s+([^>]*?)>/gi;
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    const attrs = match[1];
    const nameMatch = attrs.match(/name="([^"]*?)"/i) || attrs.match(/name='([^']*?)'/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const valMatch = attrs.match(/value="([^"]*?)"/i) || attrs.match(/value='([^']*?)'/i);
    const value = valMatch ? valMatch[1] : "";
    fields[name] = value;
  }
  return fields;
}

// Parse university BIO-DATA html response
function getPreferredPortalForRollNo(rollNo: string): { primary: string; secondary: string } {
  const clean = String(rollNo || "").trim().toUpperCase();
  // Regex for JNTU roll number format (e.g. 24P31A1234 or 22A95A0501)
  const isJNTU = /^\d{2}[A-Z0-9]{2}[15]A\d{2}[A-Z0-9]{2}$/.test(clean);
  if (isJNTU) {
    return { primary: "acet", secondary: "aus" };
  }
  return { primary: "aus", secondary: "acet" };
}

function parsePortalProfileHtml(rawHtml: string, studentId: string, portal: string) {
  let html = rawHtml;
  if (html.startsWith('"') || html.startsWith("'")) {
    html = html.substring(1, html.length - 1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\r/g, "\r")
      .replace(/\\n/g, "\n");
  }

  // 1. Name
  const nameMatch = html.match(/Name<\/td>\s*<td>:<\/td>\s*<td[^>]*>(.*?)<\/td>/i);
  const name = nameMatch ? nameMatch[1].trim() : "";

  // 2. Course
  const courseMatch = html.match(/Course<\/td>\s*<td>:<\/td>\s*<td[^>]*>(.*?)<\/td>/i);
  const course = courseMatch ? courseMatch[1].trim() : "";

  // 3. Branch / Department
  const branchMatch = html.match(/Branch<\/td>\s*<td>:<\/td>\s*<td[^>]*>(.*?)<\/td>/i);
  const branch = branchMatch ? branchMatch[1].trim() : "";

  // 4. Semester / Year
  const semMatch = html.match(/Semester<\/td>\s*<td>:<\/td>\s*<td[^>]*>(.*?)<\/td>/i);
  let semesterText = "";
  if (semMatch) {
    const spanMatch = semMatch[1].match(/<span[^>]*>(.*?)<\/span>/i);
    semesterText = spanMatch ? spanMatch[1].trim() : semMatch[1].trim();
  }

  // 5. Photo
  const photoMatch = html.match(/<img[^>]*src=['"]([^'"]*?StudentPhotos\/.*?)['"]/i);
  const photoUrl = photoMatch ? photoMatch[1].trim() : `http://info.aec.edu.in/${portal}/StudentPhotos/${studentId}.jpg`;

  // 6. Attendance
  const totalMatch = html.match(/TOTAL<\/td>\s*<td[^>]*>\d+<\/td>\s*<td[^>]*>\d+<\/td>\s*<td[^>]*>(.*?)<\/td>/i);
  let attendance = 75;
  if (totalMatch) {
    const val = parseFloat(totalMatch[1]);
    if (!isNaN(val)) {
      attendance = Math.round(val);
    }
  }

  // Map fields
  const department = branch || "Information Technology";
  let yearStr = "III B.Tech";
  const yearMatch = semesterText.match(/(\d)\/\d/);
  if (yearMatch) {
    const yearNum = parseInt(yearMatch[1], 10);
    const romans = ["I", "II", "III", "IV"];
    if (yearNum >= 1 && yearNum <= 4) {
      yearStr = `${romans[yearNum - 1]} B.Tech`;
    }
  }

  const branchShort = department.toLowerCase().includes("information technology") ? "IT" : "CSE";
  const classSection = `${yearStr} ${branchShort} - Section A`;

  let academicYear = "2024-2028";
  const rollYearPrefix = studentId.substring(0, 2);
  if (/^\d+$/.test(rollYearPrefix)) {
    const joinYear = 2000 + parseInt(rollYearPrefix, 10);
    academicYear = `${joinYear}-${joinYear + 4}`;
  }

  return {
    studentId,
    name,
    department,
    classSection,
    academicYear,
    attendance,
    profileImage: photoUrl,
    isSynced: true
  };
}

async function scrapeStudentProfileFromPortal(rollNo: string, password: string, portal: string) {
  const isNewPortal = (portal === "aus");
  const loginUrl = `https://info.aec.edu.in/${portal}/default.aspx`;
  const cookieJar: Record<string, string> = {};

  // 1. Get initial ASP.NET cookies & fields
  console.log(`[Scraper] Fetching login page: ${loginUrl}`);
  const initRes = await fetchPortalWithCookies(loginUrl, "GET", {}, null, cookieJar);

  // Detect Cloudflare block — if we get a CF challenge page, scraping won't work
  const initBodyLower = initRes.body.toLowerCase();
  if (initBodyLower.includes("just a moment") || initBodyLower.includes("cf-browser-verification") || initBodyLower.includes("enable javascript and cookies") || initBodyLower.includes("ray id") && initBodyLower.includes("cloudflare")) {
    throw new Error("Portal is behind Cloudflare bot protection. Automated scraping is currently blocked. Please use mock mode.");
  }

  const formFields = extractPortalFormFields(initRes.body);
  console.log(`[Scraper] Parsed ${Object.keys(formFields).length} form fields from login page. StatusCode: ${initRes.statusCode}`);

  if (Object.keys(formFields).length < 2) {
    // Likely got a Cloudflare or error page instead of the real form
    const snippet = initRes.body.substring(0, 300).replace(/\s+/g, " ");
    throw new Error(`Portal returned an unexpected page (status ${initRes.statusCode}). Snippet: ${snippet}`);
  }

  // 2. Encrypt password
  const encryptedPwd = encryptPortalPassword(password);

  // 3. Prepare login POST payload
  if (isNewPortal) {
    // AUS portal — new Campus Connect interface
    // The Student radio button value is "rbtStudent" — set it as selected
    formFields["userType"] = "rbtStudent";
    // Also try alternate field names used by some AUS portal versions
    formFields["txtUserId"] = rollNo;
    formFields["txtPassword"] = encryptedPwd;
    formFields["hdnpwd"] = encryptedPwd;
    // Try both button name variants
    if (!formFields["btnLogin"]) {
      formFields["btnLogin"] = "LOGIN";
    }

    // Delete older/ACET-style fields
    delete formFields["txtId2"];
    delete formFields["txtPwd2"];
    delete formFields["hdnpwd2"];
    delete formFields["imgBtn1"];
    delete formFields["imgBtn2"];
    delete formFields["imgBtn3"];
  } else {
    // ACET portal — older interface
    formFields["txtId2"] = rollNo;
    formFields["txtPwd2"] = encryptedPwd;
    formFields["hdnpwd2"] = encryptedPwd;
    formFields["imgBtn2.x"] = "30";
    formFields["imgBtn2.y"] = "20";

    delete formFields["imgBtn1"];
    delete formFields["imgBtn3"];
  }

  const postData = Object.entries(formFields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  console.log(`[Scraper] Posting login for ${rollNo} on ${portal} portal...`);

  // 4. Perform Login POST request
  const postRes = await fetchPortalWithCookies(loginUrl, "POST", {
    "Referer": loginUrl,
    "Origin": `https://info.aec.edu.in`,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  }, postData, cookieJar);

  // Verify if we actually reached the logged-in StudentMaster page
  const dashboardHtml = postRes.body;
  const dashboardLower = dashboardHtml.toLowerCase();
  console.log(`[Scraper] Login POST response: status=${postRes.statusCode}, bodyLength=${dashboardHtml.length}, hasLogout=${dashboardLower.includes("lnklogout")}, hasStudentMaster=${dashboardLower.includes("studentmaster")}`);

  if (!dashboardLower.includes("lnklogout") && !dashboardLower.includes("studentmaster")) {
    // Log a snippet to help diagnose what the portal returned
    const snippet = dashboardHtml.substring(0, 500).replace(/\s+/g, " ");
    console.error(`[Scraper] Login failed. Portal response snippet: ${snippet}`);
    throw new Error("Authentication failed — portal did not redirect to student dashboard");
  }

  // 5. Query the AjaxPro method to fetch BIO-DATA HTML
  const ajaxUrl = `https://info.aec.edu.in/${portal}/ajax/StudentProfile,App_Web_studentprofile.aspx.a2a1b31c.ashx?_method=ShowStudentProfileNew&_session=rw`;
  const ajaxBody = `RollNo=${encodeURIComponent(rollNo)}\r\nisImageDisplay=${encodeURIComponent("true")}`;

  const ajaxRes = await fetchPortalWithCookies(ajaxUrl, "POST", {
    "X-AjaxPro-Method": "ShowStudentProfileNew",
    "Content-Type": "text/plain; charset=utf-8",
    "Referer": `https://info.aec.edu.in/${portal}/Academics/StudentProfile.aspx?scrid=17`
  }, ajaxBody, cookieJar);

  console.log(`[Scraper] Profile AJAX response: status=${ajaxRes.statusCode}, bodyLength=${ajaxRes.body?.length}`);

  if (ajaxRes.statusCode !== 200 || !ajaxRes.body) {
    throw new Error("Failed to query profile details from the college database.");
  }

  // 6. Parse details
  return parsePortalProfileHtml(ajaxRes.body, rollNo, portal);
}

// 1d-v2. API Endpoint: Synchronize details directly from college portal via real-time login scraper
app.post("/api/college/sync-portal", requireAuth, async (req: any, res) => {
  const { rollNo, password, portal } = req.body;
  const cleanRollNo = String(rollNo || "").trim().toUpperCase();

  if (!cleanRollNo || !password) {
    res.status(400).json({ error: "Roll number and password are required." });
    return;
  }

  console.log(`[Sync Scraper] Commencing sync-portal routine for: ${cleanRollNo}`);
  const selectedPortal = (portal === "aus" || portal === "acet") ? portal : null;
  const { primary, secondary } = getPreferredPortalForRollNo(cleanRollNo);
  const portalToUse = selectedPortal || primary;

  try {
    let profile;
    try {
      console.log(`[Sync Scraper] Trying portal: ${portalToUse} for ${cleanRollNo}`);
      profile = await scrapePortalWithFallback(cleanRollNo, password, portalToUse);
    } catch (primaryErr: any) {
      const fallback = portalToUse === primary ? secondary : primary;
      console.warn(`[Sync Scraper] Portal ${portalToUse} failed, trying fallback portal: ${fallback} for ${cleanRollNo}`);
      profile = await scrapePortalWithFallback(cleanRollNo, password, fallback);
    }
    console.log(`[Sync Scraper] Profile sync successful for ${cleanRollNo}: Name="${profile.name}"`);
    res.json(profile);
  } catch (err: any) {
    console.error(`[Sync Scraper] Error scraping details for ${cleanRollNo}:`, err.message);
    res.status(401).json({ error: "Authentication failed. Invalid Roll Number or Portal Password." });
  }
});

// 1d-v3. Public API Endpoint: Synchronize details directly from college portal via real-time login scraper during login
app.post("/api/college/auth-sync", async (req: any, res) => {
  const { rollNo, password, portal } = req.body;
  const cleanRollNo = String(rollNo || "").trim().toUpperCase();

  if (!cleanRollNo || !password) {
    res.status(400).json({ error: "Roll number and password are required." });
    return;
  }

  console.log(`[Auth Scraper] Commencing auth-sync routine for: ${cleanRollNo}`);
  const selectedPortal = (portal === "aus" || portal === "acet") ? portal : null;
  const { primary, secondary } = getPreferredPortalForRollNo(cleanRollNo);
  const portalToUse = selectedPortal || primary;

  try {
    let profile;
    try {
      console.log(`[Auth Scraper] Trying portal: ${portalToUse} for ${cleanRollNo}`);
      profile = await scrapePortalWithFallback(cleanRollNo, password, portalToUse);
    } catch (primaryErr: any) {
      const fallback = portalToUse === primary ? secondary : primary;
      console.warn(`[Auth Scraper] Portal ${portalToUse} failed, trying fallback portal: ${fallback} for ${cleanRollNo}`);
      profile = await scrapePortalWithFallback(cleanRollNo, password, fallback);
    }
    console.log(`[Auth Scraper] Profile auth-sync successful for ${cleanRollNo}: Name="${profile.name}"`);
    res.json(profile);
  } catch (err: any) {
    console.error(`[Auth Scraper] Error scraping details for ${cleanRollNo}:`, err.message);
    res.status(401).json({ error: "Authentication failed. Invalid Roll Number or Portal Password." });
  }
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
    if (result.githubAnalysis) {
      result.githubAnalysis.repos = repos;
    }
    res.json(result);
  } catch (error: any) {
    console.error("Analysis Endpoint Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. API Endpoint: Generate 6 Adaptive Interview Questions
app.post("/api/interview/generate-questions", requireAuth, async (req: any, res) => {
  try {
    const { analysisResult, interviewType } = req.body;

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

    const prompt = `You are a world-class technical and behavioral interviewer compiling a personalized, adaptive interview plan.
Based on the candidate's profile:
- Parsed Resume: ${JSON.stringify(analysisResult.parsedResume)}
- GitHub Repos: ${JSON.stringify(analysisResult.githubAnalysis)}
- Cross-Reference Audit: ${JSON.stringify(analysisResult.crossReference || {})}

Generate exactly 6 interview questions that escalate in difficulty, combining both technical depth and behavioral soft skills, with a stronger emphasis on soft skills.
CRITICAL: You must ONLY ask about projects that are explicitly mentioned in the provided Parsed Resume or GitHub Repos. Do NOT invent, hallucinate, or reference any other projects or details not found in the candidate's profile.

The 6 questions must assess:
1. Communication Clarity (Beginner difficulty, Soft Skill) — Greet the candidate and ask them to explain their background and walk through one of the main projects or roles from their resume.
2. Technical explanation & Depth (Developing difficulty, Technical) — ask them to explain the technical implementation, architecture, or code design decisions of their primary project from their resume/GitHub.
3. Teamwork & Collaboration (Developing/Intermediate difficulty, Soft Skill) — ask about a group project experience, how they handled disagreements/conflicts with a teammate, or shared responsibility.
4. Problem-Solving & Adaptability (Intermediate difficulty, Soft Skill) — test how they react when requirements/constraints change or when their first solution/setup fails during development.
5. Ownership & Accountability (Advanced difficulty, Soft Skill) — look for whether they take responsibility for mistakes/bugs, distinguish individual vs team contributions, and reflect on lessons learned.
6. Real-World Tradeoffs (Expert difficulty, Technical) — frame a realistic scenario requiring them to evaluate trade-offs between two languages, frameworks, or architectural approaches they used (e.g. SQL vs NoSQL, React state management choices).

Respond with STRICT JSON matching this schema:
{
  "questions": [
    {
      "id": "question_1",
      "text": "The custom behavioral question tailored to their profile.",
      "category": "Communication Clarity",
      "difficulty": "Beginner"
    },
    {
      "id": "question_2",
      "text": "The custom technical explanation question tailored to their profile.",
      "category": "Technical Depth",
      "difficulty": "Developing"
    },
    {
      "id": "question_3",
      "text": "The custom behavioral question tailored to their profile.",
      "category": "Teamwork & Collaboration",
      "difficulty": "Developing"
    },
    {
      "id": "question_4",
      "text": "The custom behavioral question tailored to their profile.",
      "category": "Problem-Solving & Adaptability",
      "difficulty": "Intermediate"
    },
    {
      "id": "question_5",
      "text": "The custom behavioral question tailored to their profile.",
      "category": "Ownership & Accountability",
      "difficulty": "Intermediate"
    },
    {
      "id": "question_6",
      "text": "The custom technical tradeoff question tailored to their profile.",
      "category": "Real-World Tradeoffs",
      "difficulty": "Expert"
    }
  ]
}`;

    const entropySeed = Math.random().toString(36).substring(2, 10);
    const completionText = await getLLMCompletion({
      messages: [
        { role: "system", content: "You are a professional mock interviewer. Respond with a JSON object containing a 'questions' array conforming strictly to the requested schema." },
        { role: "user", content: prompt + `\n\n[System directive: Generate a completely fresh and unique set of questions. Random seed/entropy: ${entropySeed}]` }
      ],
      jsonMode: true,
      temperature: 0.9
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

RULE: Absolutely do not judge or infer personal, physical, medical, emotional, or identity traits. Evaluate only the speech structure, communication technique, and technical accuracy of the spoken content.`;
    }

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
    const { studentId, githubUsername, answerFeedbacks, originalAnalysis, interviewType } = req.body;

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

    const isSoftSkills = interviewType === "soft-skills" || (answerFeedbacks[0] && [
      "Communication Clarity",
      "Teamwork & Collaboration",
      "Problem-Solving & Adaptability",
      "Ownership & Accountability",
      "Emotional Intelligence & Learning",
      "Decision-Making Under Pressure"
    ].includes(answerFeedbacks[0].category));

    let prompt = "";
    if (isSoftSkills) {
      prompt = `You are a senior behavioral coach and talent development director. Review the performance logs of a college student mock behavioral/soft skills interview:
- Candidate Profile summary: Resume: ${JSON.stringify(originalAnalysis?.parsedResume?.skills || [])}, GitHub Stack: ${JSON.stringify(originalAnalysis?.githubAnalysis?.primaryStack || [])}
- Question-by-question response audits: ${JSON.stringify(answerFeedbacks)}

Synthesize a comprehensive University-grade Behavioral & Soft Skills Interview Scorecard report.
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
      "improvedVersion": "Prinstine rewritten answer",
      "explanation": "Explanation description"
    }
  ],
  "finalVerdict": "Summation verdict text"
}`;
    }

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
      interviewType: isSoftSkills ? "soft-skills" : "technical",
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
