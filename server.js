const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_PATH = path.join(ROOT, "data", "exam-data.json");

loadEnv(path.join(ROOT, ".env"));

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const visualMap = {
  Q1_VISUAL: {
    A: "galley",
    B: "engine-room",
    C: "paint-locker"
  },
  Q2_VISUAL: {
    A: "lifebuoy",
    B: "fire-extinguisher",
    C: "pilot-ladder"
  },
  Q3_VISUAL: {
    A: "clock-four",
    B: "clock-eight-thirty",
    C: "clock-ten-fifteen"
  },
  Q4_VISUAL: {
    A: "alfa-flag",
    B: "bravo-flag",
    C: "quebec-flag"
  },
  Q5_VISUAL: {
    A: "anemometer",
    B: "gas-detector",
    C: "uhf-radio"
  },
  Q6_VISUAL: {
    A: "ballast-tank",
    B: "fuel-tank",
    C: "fresh-water-tank"
  },
  Q7_VISUAL: {
    A: "bilge",
    B: "scupper",
    C: "manifold"
  },
  Q8_VISUAL: {
    A: "name-ken",
    B: "name-min",
    C: "name-zaw"
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/exam") {
      return sendJson(res, 200, withVisualTokens(readExamData()));
    }
    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJsonBody(req);
      const exam = await generateExamSet(body || {});
      return sendJson(res, 200, exam);
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || "Unexpected server error."
    });
  }
});

server.listen(PORT, () => {
  console.log(`MEPT simulator running at http://localhost:${PORT}`);
});

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, "Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      return sendText(res, 404, "Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function readExamData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function withVisualTokens(exam) {
  return {
    ...exam,
    task1: exam.task1.map((question) => ({
      ...question,
      options: question.options.map((option) => ({
        ...option,
        visualToken: visualMap[question.visualType]?.[option.key] || "placeholder"
      }))
    }))
  };
}

async function generateExamSet(input) {
  const provider = normalizeProvider(input.provider || process.env.DEFAULT_PROVIDER || "gemini");
  const settings = {
    provider,
    apiKey: stringOrFallback(input.apiKey, provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY),
    model: stringOrFallback(input.model, provider === "gemini" ? process.env.GEMINI_MODEL : process.env.OPENAI_MODEL),
    baseUrl: stringOrFallback(input.baseUrl, process.env.OPENAI_BASE_URL)
  };

  if (!settings.apiKey) {
    throw httpError(400, "An API key is required for exam generation.");
  }

  const generated = provider === "gemini"
    ? await generateWithGemini(settings)
    : await generateWithOpenAICompatible(settings);

  return withVisualTokens(normalizeExamData(generated));
}

async function generateWithGemini(settings) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model || "gemini-2.5-flash"}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt() }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    throw httpError(502, extractProviderError(payload, "Gemini request failed."));
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw httpError(502, "Gemini returned an empty exam response.");
  }
  return JSON.parse(text);
}

async function generateWithOpenAICompatible(settings) {
  const baseUrl = (settings.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const schemaPayload = {
    model: settings.model || "gpt-4.1-mini",
    messages: [
      { role: "system", content: "You are an expert maritime English examiner. Return only valid JSON." },
      { role: "user", content: buildPrompt() }
    ],
    response_format: { type: "json_object" }
  };

  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(schemaPayload)
  });

  let payload = await safeJson(response);
  if (!response.ok && shouldRetryWithoutResponseFormat(response.status, payload)) {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || "gpt-4.1-mini",
        messages: schemaPayload.messages
      })
    });
    payload = await safeJson(response);
  }

  if (!response.ok) {
    throw httpError(502, extractProviderError(payload, "OpenAI-compatible request failed."));
  }

  const content = payload?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((item) => item.text || "").join("")
    : content;

  if (!text) {
    throw httpError(502, "OpenAI-compatible provider returned an empty exam response.");
  }
  return JSON.parse(stripCodeFence(text));
}

function normalizeExamData(raw) {
  const fallback = readExamData();
  const result = {
    task1: ensureArray(raw.task1, 8).map((item, index) => ({
      id: index + 1,
      question: safeText(item.question, fallback.task1[index].question),
      options: ensureOptions(item.options, fallback.task1[index].options),
      correct: safeAnswerKey(item.correct, fallback.task1[index].correct),
      script: safeText(item.script, fallback.task1[index].script),
      visualType: fallback.task1[index].visualType
    })),
    task2: ensureArray(raw.task2, 6).map((item, index) => ({
      id: index + 1,
      question: safeText(item.question, fallback.task2[index].question),
      options: ensureOptions(item.options, fallback.task2[index].options),
      correct: safeAnswerKey(item.correct, fallback.task2[index].correct),
      script: safeText(item.script, fallback.task2[index].script)
    })),
    task3: ensureArray(raw.task3, 6).map((item, index) => ({
      id: index + 1,
      question: safeText(item.question, fallback.task3[index].question),
      options: ensureOptions(item.options, fallback.task3[index].options),
      correct: safeAnswerKey(item.correct, fallback.task3[index].correct)
    })),
    task3Script: safeText(raw.task3Script, fallback.task3Script),
    task4: {
      correctOrder: ensureStringArray(raw.task4?.correctOrder, 5, fallback.task4.correctOrder),
      scrambledOrder: ensureStringArray(raw.task4?.scrambledOrder, 5, fallback.task4.scrambledOrder),
      script: safeText(raw.task4?.script, fallback.task4.script)
    }
  };

  if (new Set(result.task4.correctOrder).size !== 5) {
    result.task4.correctOrder = [...fallback.task4.correctOrder];
  }
  if (!containsSameValues(result.task4.scrambledOrder, result.task4.correctOrder)) {
    result.task4.scrambledOrder = shuffle([...result.task4.correctOrder]);
  }
  return result;
}

function ensureArray(value, count) {
  return Array.isArray(value) && value.length >= count ? value.slice(0, count) : [];
}

function ensureOptions(options, fallbackOptions) {
  const fallback = fallbackOptions.map((option) => ({ ...option }));
  if (!Array.isArray(options) || options.length < 3) {
    return fallback;
  }
  return ["A", "B", "C"].map((key, index) => ({
    key,
    label: safeText(options[index]?.label, fallback[index].label)
  }));
}

function ensureStringArray(values, count, fallback) {
  if (!Array.isArray(values) || values.length < count) {
    return [...fallback];
  }
  return values.slice(0, count).map((item, index) => safeText(item, fallback[index]));
}

function safeText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeAnswerKey(value, fallback) {
  return ["A", "B", "C"].includes(value) ? value : fallback;
}

function containsSameValues(left, right) {
  return left.length === right.length && [...left].sort().join("|") === [...right].sort().join("|");
}

function shuffle(array) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function buildPrompt() {
  return `Generate a complete MEPT Section IV listening practice dataset in JSON.

Return only valid JSON with these exact top-level keys:
- task1
- task2
- task3
- task3Script
- task4

Rules:
- task1 must contain exactly 8 items
- task2 must contain exactly 6 items
- task3 must contain exactly 6 items based on task3Script
- each question must have options A, B, C
- each correct answer must be A, B, or C
- use maritime English contexts and shipboard situations
- keep scripts natural and concise
- task4.correctOrder must have exactly 5 ordered steps
- task4.scrambledOrder must contain the same 5 steps in a different order

Task 1 visual themes by item number:
1 place on ship
2 inspected safety equipment
3 time
4 flag
5 handheld safety tool
6 tank being filled
7 leak location
8 person on watch

JSON shape:
{
  "task1": [
    {
      "id": 1,
      "question": "Question text",
      "options": [
        {"key":"A","label":"Option"},
        {"key":"B","label":"Option"},
        {"key":"C","label":"Option"}
      ],
      "correct": "A",
      "script": "2 to 3 sentence script",
      "visualType": "Q1_VISUAL"
    }
  ],
  "task2": [
    {
      "id": 1,
      "question": "Question text",
      "options": [
        {"key":"A","label":"Option"},
        {"key":"B","label":"Option"},
        {"key":"C","label":"Option"}
      ],
      "correct": "B",
      "script": "2 to 3 sentence script"
    }
  ],
  "task3": [
    {
      "id": 1,
      "question": "Question text",
      "options": [
        {"key":"A","label":"Option"},
        {"key":"B","label":"Option"},
        {"key":"C","label":"Option"}
      ],
      "correct": "C"
    }
  ],
  "task3Script": "6 to 8 sentence continuous dialogue",
  "task4": {
    "correctOrder": ["step 1", "step 2", "step 3", "step 4", "step 5"],
    "scrambledOrder": ["step 3", "step 1", "step 5", "step 2", "step 4"],
    "script": "5 sentence sequential drill description"
  }
}`;
}

function normalizeProvider(provider) {
  return provider === "openai" ? "openai" : "gemini";
}

function shouldRetryWithoutResponseFormat(status, payload) {
  const message = JSON.stringify(payload || {}).toLowerCase();
  return status >= 400 && (
    message.includes("response_format") ||
    message.includes("json_object") ||
    message.includes("unsupported")
  );
}

function stripCodeFence(text) {
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractProviderError(payload, fallback) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  return payload.error?.message || payload.message || fallback;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    req.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) {
        reject(httpError(413, "Request body is too large."));
      }
    });
    req.on("end", () => {
      if (!buffer) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(buffer));
      } catch {
        reject(httpError(400, "Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function sendText(res, status, value) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(value);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function stringOrFallback(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback || "";
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) {
      continue;
    }
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
