const views = {
  hero: document.getElementById("view-hero"),
  upload: document.getElementById("view-upload"),
  loading: document.getElementById("view-loading"),
  whiteboard: document.getElementById("view-whiteboard")
};

const startBtn = document.getElementById("startBtn");
const backBtn = document.getElementById("backBtn");
const processBtn = document.getElementById("processBtn");
const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");

const subjectSelect = document.getElementById("subjectSelect");
const levelSelect = document.getElementById("levelSelect");
const styleSelect = document.getElementById("styleSelect");

const typedLesson = document.getElementById("typedLesson");
const lessonExtras = document.getElementById("lessonExtras");
const questionText = document.getElementById("questionText");
const diagramBox = document.getElementById("diagramBox");
const answerInput = document.getElementById("answerInput");
const sendBtn = document.getElementById("sendBtn");
const feedbackBox = document.getElementById("feedbackBox");
const voiceBtn = document.getElementById("voiceBtn");
const resetBtn = document.getElementById("resetBtn");
const lessonStatus = document.getElementById("lessonStatus");
const decisionRow = document.getElementById("decisionRow");
const teachMoreBtn = document.getElementById("teachMoreBtn");
const moveOnBtn = document.getElementById("moveOnBtn");

let selectedFile = null;
let currentLessonPlan = null;
let allChunks = [];
let currentChunkIndex = 0;
let currentChunkAttempts = 0;
let weakChunks = [];
let pendingMoveNext = false;
let typeTimer = null;

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function showView(name) {
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function buildHighlightedHTML(text, words) {
  let output = text || "";

  (words || []).forEach((word) => {
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    output = output.replace(regex, (match) => `<span class="highlight">${match}</span>`);
  });

  return output;
}

function buildLessonMainHTML(plan) {
  const lessonText = plan?.lessonText || "No lesson generated.";
  const highlights = plan?.highlights || [];
  return buildHighlightedHTML(lessonText, highlights);
}

function buildExampleHTML(plan) {
  const highlights = plan?.highlights || [];
  const exampleTitle = plan?.exampleTitle || "";
  const exampleText = plan?.exampleText || "";

  if (!exampleText) return "";

  return `
    <div class="example-box">
      ${exampleTitle ? `<div class="example-title">${escapeHtml(exampleTitle)}</div>` : ""}
      <div class="example-text">${buildHighlightedHTML(exampleText, highlights)}</div>
    </div>
  `;
}

function buildSupportHTML(plan) {
  const highlights = plan?.highlights || [];
  const supportBoxTitle = plan?.supportBoxTitle || "";
  const supportBoxItems = Array.isArray(plan?.supportBoxItems) ? plan.supportBoxItems : [];

  if (!supportBoxTitle || !supportBoxItems.length) return "";

  return `
    <div class="guided-steps-wrap">
      <div class="guided-steps-title">${escapeHtml(supportBoxTitle)}</div>
      <ol class="guided-steps-list">
        ${supportBoxItems
          .map((item) => `<li>${buildHighlightedHTML(item, highlights)}</li>`)
          .join("")}
      </ol>
    </div>
  `;
}

function buildSupportHTML(plan) {
  const highlights = plan?.highlights || [];
  const supportBoxTitle = plan?.supportBoxTitle || "";
  const supportBoxItems = Array.isArray(plan?.supportBoxItems) ? plan.supportBoxItems : [];

  if (!supportBoxTitle || !supportBoxItems.length) return "";

  return `
    <div class="guided-steps-wrap">
      <div class="guided-steps-title">${escapeHtml(supportBoxTitle)}</div>
      <ol class="guided-steps-list">
        ${supportBoxItems
          .map((item) => `<li>${buildHighlightedHTML(item, highlights)}</li>`)
          .join("")}
      </ol>
    </div>
  `;
}

function buildSupportHTML(plan) {
  const highlights = plan?.highlights || [];
  const supportBoxTitle = plan?.supportBoxTitle || "";
  const supportBoxItems = Array.isArray(plan?.supportBoxItems) ? plan.supportBoxItems : [];

  if (!supportBoxTitle || !supportBoxItems.length) return "";

  return `
    <div class="guided-steps-wrap">
      <div class="guided-steps-title">${escapeHtml(supportBoxTitle)}</div>
      <ol class="guided-steps-list">
        ${supportBoxItems
          .map((item) => `<li>${buildHighlightedHTML(item, highlights)}</li>`)
          .join("")}
      </ol>
    </div>
  `;
}

function hideDecisionRow() {
  pendingMoveNext = false;
  decisionRow.classList.add("hidden");
}

function showDecisionRow(canMoveOn = true) {
  pendingMoveNext = canMoveOn;
  decisionRow.classList.remove("hidden");
}

function updateLessonStatus(extra = "") {
  const total = allChunks.length || 1;
  const base = `Chunk ${currentChunkIndex + 1} of ${total}`;
  lessonStatus.textContent = extra ? `${base} · ${extra}` : base;
}

function typeLessonText(element, text, onDone, speed = 55) {
  if (typeTimer) {
    clearInterval(typeTimer);
    typeTimer = null;
  }

  const words = (text || "").split(/\s+/).filter(Boolean);
  let i = 0;

  console.log("[TYPE] start", {
    totalWords: words.length,
    speed,
    textPreview: text.slice(0, 120)
  });

  element.textContent = "";

  typeTimer = setInterval(() => {
    if (i >= words.length) {
      clearInterval(typeTimer);
      typeTimer = null;
      console.log("[TYPE] done", {
        finalWordCount: words.length,
        finalTextLength: element.textContent.length
      });

      if (typeof onDone === "function") {
        console.log("[TYPE] calling onDone");
        onDone();
      }
      return;
    }

    if (i === 0 || i === 10 || i === 20 || i === 30 || i === 40 || i === 50 || i === words.length - 1) {
      console.log("[TYPE] tick", {
        i,
        nextWord: words[i],
        currentRenderedLength: element.textContent.length
      });
    }

    element.textContent += (i === 0 ? "" : " ") + words[i];
    i += 1;
  }, speed);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function renderDiagram(plan) {
  const showDiagram = !!plan?.showDiagram && plan?.diagramTemplate !== "none";
  const template = plan?.diagramTemplate || "none";
  const data = plan?.diagramData || {};

  if (!showDiagram || template === "none") {
    diagramBox.classList.add("hidden");
    diagramBox.innerHTML = "";
    return;
  }

  let content = "";

  if (template === "formula_worked_example") {
    content = `
      <div class="diagram-title">${escapeHtml(data.title || "Formula")}</div>
      <div class="diagram-formula-card">
        <div class="diagram-formula-main">${escapeHtml(data.formula || "")}</div>
        ${data.workedExample ? `<div class="diagram-formula-example">${escapeHtml(data.workedExample)}</div>` : ""}
        ${data.result ? `<div class="diagram-formula-result">${escapeHtml(data.result)}</div>` : ""}
      </div>
    `;
  } else if (template === "before_after") {
    content = `
      <div class="diagram-title">${escapeHtml(data.title || "Before and after")}</div>
      <div class="diagram-before-after">
        <div class="diagram-transform-card">
          <div class="diagram-transform-label">${escapeHtml(data.beforeLabel || "Before")}</div>
          <div class="diagram-transform-value">${escapeHtml(data.beforeValue || "")}</div>
        </div>
        <div class="diagram-arrow">→</div>
        <div class="diagram-transform-card active">
          <div class="diagram-transform-label">${escapeHtml(data.afterLabel || "After")}</div>
          <div class="diagram-transform-value">${escapeHtml(data.afterValue || "")}</div>
        </div>
      </div>
    `;
  } else if (template === "compare_two_terms") {
    content = `
      <div class="diagram-title">${escapeHtml(data.title || "Comparison")}</div>
      <div class="diagram-compare">
        <div class="diagram-compare-card">
          <div class="diagram-compare-title">${escapeHtml(data.leftTitle || "")}</div>
          <div class="diagram-compare-body">${escapeHtml(data.leftBody || "")}</div>
        </div>
        <div class="diagram-compare-card">
          <div class="diagram-compare-title">${escapeHtml(data.rightTitle || "")}</div>
          <div class="diagram-compare-body">${escapeHtml(data.rightBody || "")}</div>
        </div>
      </div>
    `;
  } else if (template === "step_sequence") {
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      diagramBox.classList.add("hidden");
      diagramBox.innerHTML = "";
      return;
    }

    content = `
      <div class="diagram-title">${escapeHtml(data.title || "Steps")}</div>
      <div class="diagram-flow">
        ${items.map((item, index) => `
          <div class="diagram-node ${index === items.length - 1 ? "active" : ""}">${escapeHtml(item)}</div>
          ${index < items.length - 1 ? `<div class="diagram-arrow">→</div>` : ""}
        `).join("")}
      </div>
    `;
  } else {
    diagramBox.classList.add("hidden");
    diagramBox.innerHTML = "";
    return;
  }

  diagramBox.innerHTML = content;
  diagramBox.classList.remove("hidden");
}

function startTutorDemo(plan, statusText = "") {
  const question = plan?.question || "What is the main idea here?";
  const mainPlainText = plan?.lessonText || "No lesson generated.";

  console.log("[LESSON] startTutorDemo called", {
    question,
    lessonTextLength: mainPlainText.length,
    exampleTitle: plan?.exampleTitle,
    exampleTextLength: plan?.exampleText?.length || 0,
    supportBoxTitle: plan?.supportBoxTitle,
    supportItemsCount: Array.isArray(plan?.supportBoxItems) ? plan.supportBoxItems.length : 0,
    showDiagram: plan?.showDiagram,
    diagramTemplate: plan?.diagramTemplate
  });

  questionText.textContent = question;
  feedbackBox.classList.add("hidden");
  feedbackBox.textContent = "";
  answerInput.value = "";
  hideDecisionRow();
  updateLessonStatus(statusText);

  typedLesson.textContent = "";
  lessonExtras.innerHTML = "";
  diagramBox.innerHTML = "";
  diagramBox.classList.add("hidden");

  console.log("[LESSON] before typeLessonText");

  typeLessonText(typedLesson, mainPlainText, async () => {
    console.log("[LESSON] onDone entered", {
      typedTextLength: typedLesson.textContent.length,
      typedPreview: typedLesson.textContent.slice(0, 120)
    });

    const exampleHtml = buildExampleHTML(plan);
    const supportHtml = buildSupportHTML(plan);

    console.log("[LESSON] built extras", {
      exampleHtmlLength: exampleHtml.length,
      supportHtmlLength: supportHtml.length
    });

    await wait(250);

    if (exampleHtml) {
      lessonExtras.innerHTML = exampleHtml;
      console.log("[LESSON] example injected");
      await wait(220);
    }

    if (supportHtml) {
      lessonExtras.innerHTML += supportHtml;
      console.log("[LESSON] support injected");
      await wait(220);
    }

    renderDiagram(plan);
    console.log("[LESSON] renderDiagram finished", {
      diagramHidden: diagramBox.classList.contains("hidden"),
      diagramHTMLLength: diagramBox.innerHTML.length
    });
  });
}

startBtn.addEventListener("click", () => {
  showView("upload");
});

backBtn.addEventListener("click", () => {
  showView("hero");
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  selectedFile = file;
  fileName.textContent = `Selected: ${file.name}`;
  fileName.classList.remove("hidden");
  processBtn.disabled = false;
});

processBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  showView("loading");

  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("subject", subjectSelect.value);
  formData.append("level", levelSelect.value);
  formData.append("learningStyle", styleSelect.value);

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.message || "Upload failed");
    }

    let finalData = data;

    if (selectedFile.type === "application/pdf") {
      try {
        const pageImages = await renderPdfPagesToImages(selectedFile, 5);

        const enhanceResponse = await fetch("/enhance-pdf-lesson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            extractedText: data.extractedText,
            pageImages,
            subject: subjectSelect.value,
            level: levelSelect.value,
            learningStyle: styleSelect.value
          })
        });

        const enhanced = await enhanceResponse.json();

        if (enhanced.ok) {
          finalData = {
            ...data,
            extractedText: enhanced.extractedText,
            chunks: enhanced.chunks,
            chunkCount: enhanced.chunkCount,
            currentChunkIndex: enhanced.currentChunkIndex,
            lessonPlan: enhanced.lessonPlan,
            visualNotes: enhanced.visualNotes
          };
        }
      } catch (visualError) {
        console.warn("PDF visual enhancement skipped:", visualError);
      }
    }

    currentLessonPlan = finalData.lessonPlan;
    allChunks = finalData.chunks || [];
    currentChunkIndex = finalData.currentChunkIndex || 0;
    currentChunkAttempts = 0;
    weakChunks = [];

    showView("whiteboard");
    startTutorDemo(currentLessonPlan);
  } catch (error) {
    console.error(error);
    alert(error.message || "Upload failed.");
    showView("upload");
  }
});

async function renderPdfPagesToImages(file, maxPages = 5) {
  if (!window.pdfjsLib) {
    throw new Error("pdf.js is not loaded");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageImages = [];
  const totalPages = Math.min(pdf.numPages, maxPages);

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.2 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    pageImages.push(canvas.toDataURL("image/png"));
  }

  return pageImages;
}

sendBtn.addEventListener("click", handleAnswer);
answerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleAnswer();
});

teachMoreBtn.addEventListener("click", async () => {
  await retryCurrentChunk();
});

moveOnBtn.addEventListener("click", async () => {
  if (!pendingMoveNext) return;
  await moveToNextChunk();
});

async function handleAnswer() {
  const studentAnswer = answerInput.value.trim();
  if (!studentAnswer || !currentLessonPlan) return;

  feedbackBox.classList.remove("hidden");
  feedbackBox.textContent = "Checking your answer...";
  hideDecisionRow();

  try {
    const response = await fetch("/check-answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        lessonText: currentLessonPlan.lessonText,
        question: currentLessonPlan.question,
        studentAnswer,
        learningStyle: styleSelect.value
      })
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.message || "Answer check failed");
    }

    const { result, feedback } = data.result;

    let label = "";
    if (result === "correct") label = "Correct";
    if (result === "partly_correct") label = "Partly correct";
    if (result === "not_correct") label = "Not correct";

    feedbackBox.innerHTML = `<strong>${label}:</strong> ${feedback}`;
    feedbackBox.classList.remove("hidden");

    if (result === "correct" || result === "partly_correct") {
      currentChunkAttempts = 0;
      showDecisionRow(true);
      return;
    }

    currentChunkAttempts += 1;

    if (currentChunkAttempts >= 3) {
      weakChunks.push({
        chunkIndex: currentChunkIndex,
        question: currentLessonPlan.question
      });

      feedbackBox.innerHTML = `<strong>Weak topic flagged:</strong> You’ve had a few tries on this one. You can move on now or ask the tutor to teach it again.`;
      currentChunkAttempts = 0;
      showDecisionRow(true);
      return;
    }

    showDecisionRow(true);
  } catch (error) {
    console.error(error);
    feedbackBox.textContent = "Could not check answer right now.";
    feedbackBox.classList.remove("hidden");
  }
}

async function moveToNextChunk() {
  const nextChunkIndex = currentChunkIndex + 1;

  feedbackBox.classList.remove("hidden");
  feedbackBox.textContent = "Loading next chunk...";
  hideDecisionRow();

  try {
    const response = await fetch("/next-chunk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chunks: allChunks,
        nextChunkIndex,
        subject: subjectSelect.value,
        level: levelSelect.value,
        learningStyle: styleSelect.value,
        previousLessonText: currentLessonPlan?.lessonText || "",
        previousHighlights: currentLessonPlan?.highlights || []
      })
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.message || "Failed to load next chunk");
    }

    if (data.done) {
      const weakSummary =
        weakChunks.length > 0
          ? `<br><br><strong>Weak topics flagged:</strong> ${weakChunks.length}`
          : "";

      feedbackBox.innerHTML = `<strong>Done:</strong> You’ve reached the end of this demo lesson.${weakSummary}`;
      feedbackBox.classList.remove("hidden");
      hideDecisionRow();
      return;
    }

    currentChunkIndex = data.currentChunkIndex;
    currentLessonPlan = data.lessonPlan;
    currentChunkAttempts = 0;
    startTutorDemo(currentLessonPlan);
  } catch (error) {
    console.error(error);
    feedbackBox.textContent = error.message || "Could not load next chunk.";
    feedbackBox.classList.remove("hidden");
  }
}

async function retryCurrentChunk() {
  const currentChunk = allChunks[currentChunkIndex];
  if (!currentChunk || !currentLessonPlan) return;

  feedbackBox.classList.remove("hidden");
  feedbackBox.textContent = "Teaching this again in a better way...";
  hideDecisionRow();

  try {
    const response = await fetch("/retry-chunk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chunk: currentChunk,
        previousLessonText: currentLessonPlan.lessonText,
        previousQuestion: currentLessonPlan.question,
        subject: subjectSelect.value,
        level: levelSelect.value,
        learningStyle: styleSelect.value
      })
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.message || "Failed to retry chunk");
    }

    currentLessonPlan = data.lessonPlan;

    const statusText =
      styleSelect.value === "Talk me through it back and forth"
        ? "guided walkthrough"
        : "taught again";

    startTutorDemo(currentLessonPlan, statusText);
  } catch (error) {
    console.error(error);
    feedbackBox.textContent = "Could not simplify this chunk right now.";
    feedbackBox.classList.remove("hidden");
  }
}

voiceBtn.addEventListener("click", async () => {
  const textToSpeak =
    currentLessonPlan?.spokenSummary ||
    currentLessonPlan?.lessonText ||
    "Lesson summary unavailable.";

  try {
    if (window.freeVoice?.speak) {
      await window.freeVoice.speak(textToSpeak);
      return;
    }

    throw new Error("Free voice is not loaded");
  } catch (error) {
    console.error(error);

    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.lang = "en-GB";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Voice is unavailable right now.");
    }
  }
});

resetBtn.addEventListener("click", () => {
  window.speechSynthesis.cancel();

  if (typeTimer) {
  clearInterval(typeTimer);
  typeTimer = null;
}

  if (window.freeVoice?.stop) {
    window.freeVoice.stop();
  }

  selectedFile = null;
  currentLessonPlan = null;
  allChunks = [];
  currentChunkIndex = 0;
  currentChunkAttempts = 0;
  weakChunks = [];
  hideDecisionRow();

  fileInput.value = "";
  fileName.textContent = "";
  fileName.classList.add("hidden");
  processBtn.disabled = true;

  subjectSelect.value = "Law";
  levelSelect.value = "Undergrad";
  styleSelect.value = "Explain simply, then quiz me";

  showView("hero");
});