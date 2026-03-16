const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");

const app = express();
const PORT = process.env.PORT || 3000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TEXT_MODEL = "openai/gpt-oss-20b";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (_req, file, cb) {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

function extractJson(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Model returned empty response");
  }

  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON object found in model response:\n${cleaned}`);
  }

  const jsonCandidate = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(jsonCandidate);
  } catch (_error) {
    throw new Error(`Invalid JSON from model:\n${jsonCandidate}`);
  }
}

async function callGroq(messages, model = TEXT_MODEL, temperature = 0.2) {
  if (!GROQ_API_KEY) {
    throw new Error("Missing GROQ_API_KEY");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature,
      messages
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Groq request failed");
  }

  const content = data?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string" || !content.trim()) {
    console.error("EMPTY GROQ RESPONSE DATA:", JSON.stringify(data, null, 2));
    throw new Error("Groq returned an empty lesson response");
  }

  return content;
}

function isImageMimeType(mimetype) {
  return ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimetype);
}

async function extractTextFromFile(filePath, mimetype) {
  if (mimetype === "application/pdf") {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || "";
  }

  if (
    mimetype === "text/plain" ||
    mimetype === "text/markdown" ||
    mimetype === "application/json"
  ) {
    return fs.readFileSync(filePath, "utf8");
  }

  throw new Error(`Unsupported file type for text extraction: ${mimetype}`);
}

async function extractVisualMeaningFromImageDataUrl(dataUrl) {
  if (!GROQ_API_KEY) {
    return "";
  }

  const content = await callGroq(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
You are reading an educational visual for a tutoring app.

Describe only useful learning content from this image.
Focus on:
- formulas
- equations
- labels
- diagrams
- comparisons
- steps
- charts
- definitions
- worked examples

Write short study notes in plain English.
If there is a formula, copy it as faithfully as possible.
Keep it concise.
`
          },
          {
            type: "image_url",
            image_url: { url: dataUrl }
          }
        ]
      }
    ],
    VISION_MODEL,
    0.1
  );

  return content.trim();
}

async function extractVisualMeaningFromImage(filePath, mimetype) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString("base64");
  const dataUrl = `data:${mimetype};base64,${base64Image}`;
  return extractVisualMeaningFromImageDataUrl(dataUrl);
}

async function analyzePdfPageImages(pageImages = []) {
  if (!Array.isArray(pageImages) || pageImages.length === 0) return "";

  const notes = [];
  for (let i = 0; i < pageImages.length; i += 1) {
    const pageNote = await extractVisualMeaningFromImageDataUrl(pageImages[i]);
    if (pageNote) {
      notes.push(`Page ${i + 1} visual notes: ${pageNote}`);
    }
  }

  return notes.join("\n\n");
}

function chunkText(text, maxChunkLength = 1200) {
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) return [];

  const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if ((currentChunk + " " + trimmedSentence).trim().length <= maxChunkLength) {
      currentChunk = (currentChunk + " " + trimmedSentence).trim();
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = trimmedSentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildTutorContext({ subject, level, learningStyle }) {
  const styleRules = {
    "Explain simply, then quiz me": `
Style:
- Clear and direct.
- Explain first, then ask one question.
- No chatty filler.
`,
    "Talk me through it back and forth": `
Style:
- Sound guided and conversational.
- Use phrases like "let's work through this" and "notice that".
- Still keep only one final question at the end.
`,
    "Give me the big picture first, then details": `
Style:
- Start with the overall idea.
- Then explain the details.
- Sound structured.
`
  };

  return `
Student profile:
- Subject: ${subject || "General"}
- Level: ${level || "Undergrad"}
- Learning style: ${learningStyle || "Explain simply, then quiz me"}

${styleRules[learningStyle] || styleRules["Explain simply, then quiz me"]}
`;
}

async function generateLessonFromChunk(chunk, profile = {}, previousContext = {}) {
  if (!GROQ_API_KEY) {
    return {
      lessonText: chunk,
      exampleTitle: "",
      exampleText: "",
      supportBoxTitle: "",
      supportBoxItems: [],
      highlights: ["key idea", "important term"],
      question: "What is the main idea here?",
      spokenSummary: chunk.slice(0, 180),
      showDiagram: false,
      diagramTemplate: "none",
      diagramData: {}
    };
  }

  const tutorContext = buildTutorContext(profile);
  const previousLessonSummary = previousContext?.lessonText || "";
  const previousHighlights = Array.isArray(previousContext?.highlights)
    ? previousContext.highlights.join(", ")
    : "";
  const previousChunkText = previousContext?.chunkText || "";

  const prompt = `
You are an AI tutor for students.

${tutorContext}

Read the source chunk and return JSON only.

Current chunk:
${chunk}

Previous chunk text:
${previousChunkText || "None"}

Previous lesson summary:
${previousLessonSummary || "None"}

Previous highlights:
${previousHighlights || "None"}

Return this exact JSON shape:
{
  "lessonText": "A clear tutor explanation in 2-5 sentences.",
  "exampleTitle": "Short example title or empty string",
  "exampleText": "A useful concrete example or empty string",
  "supportBoxTitle": "Short support box title or empty string",
  "supportBoxItems": ["optional item 1", "optional item 2"],
  "highlights": ["3 to 5 important words or terms"],
  "question": "One short comprehension question",
  "spokenSummary": "A short spoken version under 180 characters",
  "showDiagram": true,
  "diagramTemplate": "before_after",
  "diagramData": {}
}

Allowed diagramTemplate values:
- "formula_worked_example"
- "before_after"
- "compare_two_terms"
- "step_sequence"
- "none"

Rules:
- Teach only what is new or meaningfully different from the previous chunk.
- If the chunk mostly repeats the previous chunk, compress the repeated part into one short sentence and focus on the new point.
- highlights must be short terms.
- spokenSummary must be short.
- Always try to provide an example unless the chunk is tiny or purely repetitive.
- For concept-heavy chunks, give a simple concrete example.
- For formula chunks, only use the exact formula found in the source or visual notes.
- Never replace a source formula with a simpler formula from general knowledge.
- Never invent a numeric worked example unless the exact numbers are clearly present in the source.
- If the formula is source-specific and numbers are unclear, give a non-numeric example instead.
- supportBoxTitle and supportBoxItems should only appear when a short rule/contrast/step summary clearly helps.
- For concept differences, prefer supportBoxTitle like "Key difference".
- For formula chunks, prefer supportBoxTitle like "Rule to remember".
- If supportBoxTitle = "Rule to remember", preserve the full rule or formula, not a chopped fragment.
- If no support box is needed, return supportBoxTitle = "" and supportBoxItems = [].
- Prefer diagramTemplate = "compare_two_terms" for concept differences.
- Prefer diagramTemplate = "before_after" for transformation concepts.
- Prefer diagramTemplate = "formula_worked_example" for formulas.
- Prefer diagramTemplate = "step_sequence" only for real sequences.
- If no diagram helps, use "none".

diagramData requirements:

If diagramTemplate = "formula_worked_example":
{
  "title": "Short title",
  "formula": "Exact formula from source",
  "workedExample": "optional if safely supported",
  "result": "optional if safely supported"
}

If diagramTemplate = "before_after":
{
  "title": "Short title",
  "beforeLabel": "Before label",
  "beforeValue": "Before value",
  "afterLabel": "After label",
  "afterValue": "After value"
}

If diagramTemplate = "compare_two_terms":
{
  "title": "Short title",
  "leftTitle": "Left title",
  "leftBody": "Left body",
  "rightTitle": "Right title",
  "rightBody": "Right body"
}

If diagramTemplate = "step_sequence":
{
  "title": "Short title",
  "items": ["Step 1", "Step 2"]
}

Return JSON only.
`;

  let content = "";

  try {
    content = await callGroq(
      [
        {
          role: "system",
          content: "You are a helpful teaching assistant that returns one strict JSON object only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      TEXT_MODEL,
      0.2
    );
  } catch (error) {
    console.warn("First lesson generation failed, retrying once...", error.message);

    content = await callGroq(
      [
        {
          role: "system",
          content: "Return only one valid JSON object. No markdown, no prose outside JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      TEXT_MODEL,
      0.1
    );
  }

  console.log("RAW MODEL RESPONSE:\n", content);
  return extractJson(content);
}

async function simplifyLessonFromChunk(chunk, previousLessonText, previousQuestion, profile = {}) {
  if (!GROQ_API_KEY) {
    return {
      lessonText: `Let's simplify this. ${chunk.slice(0, 220)}`,
      exampleTitle: "",
      exampleText: "",
      supportBoxTitle: "",
      supportBoxItems: [],
      highlights: ["simplified", "key idea"],
      question: "Try again: what is the main idea here?",
      spokenSummary: chunk.slice(0, 180),
      showDiagram: false,
      diagramTemplate: "none",
      diagramData: {}
    };
  }

  const tutorContext = buildTutorContext(profile);

  const prompt = `
A student did not understand the lesson.

${tutorContext}

Original study chunk:
${chunk}

Previous lesson:
${previousLessonText}

Previous question:
${previousQuestion}

Return JSON only in this exact JSON shape:
{
  "lessonText": "A simpler explanation in 2-5 sentences.",
  "exampleTitle": "Short example title or empty string",
  "exampleText": "A useful concrete example or empty string",
  "supportBoxTitle": "Short support box title or empty string",
  "supportBoxItems": ["optional item 1", "optional item 2"],
  "highlights": ["3 to 5 important words or terms"],
  "question": "A simpler follow-up question",
  "spokenSummary": "A short spoken version under 180 characters",
  "showDiagram": true,
  "diagramTemplate": "before_after",
  "diagramData": {}
}

Rules:
- Use simpler words than before.
- Keep it clear and short.
- Always try to provide an example unless the chunk is tiny or purely repetitive.
- If the chunk contains a source formula, preserve that exact formula only.
- Never invent a different formula from general knowledge.
- If supportBoxTitle = "Rule to remember", preserve the full rule or formula.
- If no support box is needed, return supportBoxTitle = "" and supportBoxItems = [].
- Return JSON only.
`;

  let content = "";

  try {
    content = await callGroq(
      [
        {
          role: "system",
          content: "You simplify lessons and return one strict JSON object only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      TEXT_MODEL,
      0.15
    );
  } catch (error) {
    console.warn("First simplify generation failed, retrying once...", error.message);

    content = await callGroq(
      [
        {
          role: "system",
          content: "Return only one valid JSON object. No markdown, no prose outside JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      TEXT_MODEL,
      0.1
    );
  }

  console.log("RAW MODEL RESPONSE:\n", content);
  return extractJson(content);
}

async function checkStudentAnswer({ lessonText, question, studentAnswer, learningStyle }) {
  if (!GROQ_API_KEY) {
    return {
      result: "partly_correct",
      feedback: "Demo mode: Groq key not set, so this is placeholder feedback."
    };
  }

  const coachingRule =
    learningStyle === "Talk me through it back and forth"
      ? "Use coaching language. Sound like a tutor helping step by step."
      : "Be direct and concise.";

  const prompt = `
You are checking a student's answer.

Lesson context:
${lessonText}

Question:
${question}

Student answer:
${studentAnswer}

Return JSON only in this exact shape:
{
  "result": "correct",
  "feedback": "Short feedback for the student"
}

Rules:
- result must be one of: "correct", "partly_correct", "not_correct"
- ${coachingRule}
- Keep feedback short and helpful.
- Return JSON only.
`;

  const content = await callGroq(
    [
      {
        role: "system",
        content: "You are a strict answer-checking assistant that returns JSON only."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    TEXT_MODEL,
    0.1
  );

  return extractJson(content);
}

function buildLessonPackageFromSourceText(sourceText) {
  return chunkText(sourceText, 1200);
}

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "No file uploaded"
      });
    }

    const profile = {
      subject: req.body.subject,
      level: req.body.level,
      learningStyle: req.body.learningStyle
    };

    let extractedText = "";

    if (isImageMimeType(req.file.mimetype)) {
      extractedText = await extractVisualMeaningFromImage(req.file.path, req.file.mimetype);
    } else {
      extractedText = await extractTextFromFile(req.file.path, req.file.mimetype);
    }

    const chunks = buildLessonPackageFromSourceText(extractedText);
    const firstChunk = chunks[0] || "";
    const lessonPlan = await generateLessonFromChunk(firstChunk, profile);

    res.json({
      ok: true,
      message: "File uploaded, processed, and first lesson generated",
      file: {
        originalName: req.file.originalname,
        savedName: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        usedVision: isImageMimeType(req.file.mimetype)
      },
      extractedText,
      chunks,
      chunkCount: chunks.length,
      currentChunkIndex: 0,
      lessonPlan
    });
  } catch (error) {
    console.error("Upload/process error:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "Failed to process file"
    });
  }
});

app.post("/enhance-pdf-lesson", async (req, res) => {
  try {
    const { extractedText, pageImages, subject, level, learningStyle } = req.body;

    if (!extractedText || !Array.isArray(pageImages)) {
      return res.status(400).json({
        ok: false,
        message: "extractedText and pageImages are required"
      });
    }

    const visualNotes = await analyzePdfPageImages(pageImages);
    const combinedSource = `${extractedText}\n\nVisual notes:\n${visualNotes}`.trim();
    const chunks = buildLessonPackageFromSourceText(combinedSource);
    const firstChunk = chunks[0] || "";

    const lessonPlan = await generateLessonFromChunk(firstChunk, {
      subject,
      level,
      learningStyle
    });

    res.json({
      ok: true,
      visualNotes,
      extractedText: combinedSource,
      chunks,
      chunkCount: chunks.length,
      currentChunkIndex: 0,
      lessonPlan
    });
  } catch (error) {
    console.error("Enhance PDF lesson error:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "Failed to enhance PDF lesson"
    });
  }
});

app.post("/next-chunk", async (req, res) => {
  try {
    const {
      chunks,
      nextChunkIndex,
      subject,
      level,
      learningStyle,
      previousLessonText,
      previousHighlights
    } = req.body;

    if (!Array.isArray(chunks) || typeof nextChunkIndex !== "number") {
      return res.status(400).json({
        ok: false,
        message: "chunks array and nextChunkIndex are required"
      });
    }

    if (nextChunkIndex < 0 || nextChunkIndex >= chunks.length) {
      return res.json({
        ok: true,
        done: true,
        message: "No more chunks left"
      });
    }

    const nextChunk = chunks[nextChunkIndex];
    const previousChunkText = nextChunkIndex > 0 ? chunks[nextChunkIndex - 1] : "";

    const lessonPlan = await generateLessonFromChunk(
      nextChunk,
      { subject, level, learningStyle },
      {
        chunkText: previousChunkText,
        lessonText: previousLessonText || "",
        highlights: previousHighlights || []
      }
    );

    res.json({
      ok: true,
      done: false,
      currentChunkIndex: nextChunkIndex,
      lessonPlan
    });
  } catch (error) {
    console.error("Next chunk error:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "Failed to generate next chunk"
    });
  }
});

app.post("/retry-chunk", async (req, res) => {
  try {
    const {
      chunk,
      previousLessonText,
      previousQuestion,
      subject,
      level,
      learningStyle
    } = req.body;

    if (!chunk || !previousLessonText || !previousQuestion) {
      return res.status(400).json({
        ok: false,
        message: "chunk, previousLessonText, and previousQuestion are required"
      });
    }

    const lessonPlan = await simplifyLessonFromChunk(
      chunk,
      previousLessonText,
      previousQuestion,
      { subject, level, learningStyle }
    );

    res.json({
      ok: true,
      lessonPlan
    });
  } catch (error) {
    console.error("Retry chunk error:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "Failed to simplify chunk"
    });
  }
});

app.post("/check-answer", async (req, res) => {
  try {
    const { lessonText, question, studentAnswer, learningStyle } = req.body;

    if (!lessonText || !question || !studentAnswer) {
      return res.status(400).json({
        ok: false,
        message: "lessonText, question, and studentAnswer are required"
      });
    }

    const result = await checkStudentAnswer({
      lessonText,
      question,
      studentAnswer,
      learningStyle
    });

    res.json({
      ok: true,
      result
    });
  } catch (error) {
    console.error("Answer check error:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "Failed to check answer"
    });
  }
});

app.use(express.static(path.join(__dirname, "..")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Learna backend running on http://localhost:${PORT}`);
});