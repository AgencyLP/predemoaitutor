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

const typedLesson = document.getElementById("typedLesson");
const questionText = document.getElementById("questionText");
const diagramBox = document.getElementById("diagramBox");
const answerInput = document.getElementById("answerInput");
const sendBtn = document.getElementById("sendBtn");
const feedbackBox = document.getElementById("feedbackBox");
const voiceBtn = document.getElementById("voiceBtn");
const resetBtn = document.getElementById("resetBtn");

const lessonData = {
  text: "Let’s break this down step by step. Consideration means both sides give something of value in an agreement. In simple terms, one side gives something, and the other side gives something back. That exchange is what helps make the contract enforceable.",
  highlights: ["Consideration", "value", "agreement", "contract", "enforceable"],
  question: "Why is consideration important in contract formation?",
  spokenSummary: "Consideration means both sides give something of value in an agreement."
};

function showView(name) {
  Object.values(views).forEach(view => view.classList.add("hidden"));
  views[name].classList.remove("hidden");
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

  fileName.textContent = `Selected: ${file.name}`;
  fileName.classList.remove("hidden");
  processBtn.disabled = false;
});

processBtn.addEventListener("click", () => {
  showView("loading");

  setTimeout(() => {
    showView("whiteboard");
    startTutorDemo();
  }, 2200);
});

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHighlightedHTML(text, words) {
  let output = text;

  words.forEach(word => {
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    output = output.replace(regex, match => `<span class="highlight">${match}</span>`);
  });

  return output;
}

function typeHTML(element, html, speed = 18) {
  element.innerHTML = "";
  let i = 0;

  const timer = setInterval(() => {
    element.innerHTML = html.slice(0, i);
    i++;

    if (i > html.length) {
      clearInterval(timer);
    }
  }, speed);
}

function startTutorDemo() {
  const html = buildHighlightedHTML(lessonData.text, lessonData.highlights);
  questionText.textContent = lessonData.question;
  feedbackBox.classList.add("hidden");
  feedbackBox.textContent = "";
  answerInput.value = "";
  diagramBox.classList.remove("hidden");

  typeHTML(typedLesson, html, 14);
}

sendBtn.addEventListener("click", handleAnswer);
answerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleAnswer();
});

function handleAnswer() {
  const value = answerInput.value.trim().toLowerCase();
  if (!value) return;

  let feedback = "";

  if (
    value.includes("value") ||
    value.includes("exchange") ||
    value.includes("both sides")
  ) {
    feedback = "Correct — you’ve got the key idea. Consideration matters because both sides must exchange something of value, which helps make the agreement enforceable.";
  } else if (
    value.includes("agreement") ||
    value.includes("contract")
  ) {
    feedback = "Partly right — you’re close. The missing piece is that consideration is about an exchange of value between both sides, not just having an agreement.";
  } else {
    feedback = "Not quite. Think of consideration as each side giving something of value in the deal. Try again with that idea in mind.";
  }

  feedbackBox.textContent = feedback;
  feedbackBox.classList.remove("hidden");
}

voiceBtn.addEventListener("click", () => {
  if (!("speechSynthesis" in window)) {
    alert("Your browser does not support text-to-speech.");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(lessonData.spokenSummary);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.lang = "en-GB";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
});

resetBtn.addEventListener("click", () => {
  window.speechSynthesis.cancel();
  showView("hero");
  fileInput.value = "";
  fileName.textContent = "";
  fileName.classList.add("hidden");
  processBtn.disabled = true;
});
