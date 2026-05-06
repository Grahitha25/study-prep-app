const STORAGE_KEY = "exam-prep-builder-v1";
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "there", "their", "they", "them", "you", "your",
  "have", "has", "had", "was", "were", "are", "will", "would", "can", "could", "shall", "should", "may",
  "might", "about", "into", "over", "under", "than", "then", "also", "such", "only", "more", "most",
  "very", "what", "when", "where", "while", "which", "whose", "each", "every", "some", "many", "other",
  "these", "those", "because", "between", "through", "using", "used", "use", "been", "being", "exam",
  "final", "course", "topic", "chapter", "student", "students"
]);

const state = {
  courses: [],
  selectedCourseId: null
};

const els = {
  courseName: document.getElementById("courseName"),
  createCourseBtn: document.getElementById("createCourseBtn"),
  courseSelect: document.getElementById("courseSelect"),
  fileInput: document.getElementById("fileInput"),
  processFilesBtn: document.getElementById("processFilesBtn"),
  uploadStatus: document.getElementById("uploadStatus"),
  generateBtn: document.getElementById("generateBtn"),
  clearGeneratedBtn: document.getElementById("clearGeneratedBtn"),
  materialsList: document.getElementById("materialsList"),
  flashcardsContainer: document.getElementById("flashcardsContainer"),
  quizContainer: document.getElementById("quizContainer"),
  cheatSheetContainer: document.getElementById("cheatSheetContainer"),
  studyTips: document.getElementById("studyTips"),
  flashcardTemplate: document.getElementById("flashcardTemplate")
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.courses)) {
      state.courses = parsed.courses;
      state.selectedCourseId = parsed.selectedCourseId ?? (parsed.courses[0]?.id || null);
    }
  } catch {
    // Ignore invalid local data.
  }
}

function getSelectedCourse() {
  return state.courses.find((c) => c.id === state.selectedCourseId) || null;
}

function createCourse(name) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const course = {
    id: uid(),
    name: trimmed,
    materials: [],
    generated: {
      flashcards: [],
      quiz: [],
      cheatSheet: [],
      tips: []
    }
  };

  state.courses.push(course);
  state.selectedCourseId = course.id;
  saveState();
  renderAll();
}

function updateCourseSelect() {
  els.courseSelect.innerHTML = "";
  if (!state.courses.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No courses yet";
    els.courseSelect.append(option);
    els.courseSelect.disabled = true;
    return;
  }

  els.courseSelect.disabled = false;
  for (const course of state.courses) {
    const option = document.createElement("option");
    option.value = course.id;
    option.textContent = course.name;
    option.selected = course.id === state.selectedCourseId;
    els.courseSelect.append(option);
  }
}

async function readPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error("pdf.js not loaded");
  }

  const buffer = await file.arrayBuffer();
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    text += `${pageText}\n`;
  }
  return text;
}

async function readDocxText(file) {
  if (!window.mammoth) {
    throw new Error("Mammoth docx parser not loaded");
  }
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || "";
}

async function extractTextFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) {
    return file.text();
  }
  if (name.endsWith(".pdf")) {
    return readPdfText(file);
  }
  if (name.endsWith(".docx")) {
    return readDocxText(file);
  }
  throw new Error(`Unsupported file format: ${file.name}`);
}

function cleanText(raw) {
  return raw
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 35);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function topKeywords(text, maxCount = 14) {
  const counts = new Map();
  tokenize(text).forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([word]) => word);
}

function generateFlashcards(sentences, keywords) {
  const cards = [];
  const selected = sentences.slice(0, 20);
  for (const sentence of selected) {
    const key = keywords.find((k) => sentence.toLowerCase().includes(k));
    if (!key) continue;
    cards.push({
      title: `Explain: ${key}`,
      answer: sentence
    });
    if (cards.length >= 12) break;
  }
  return cards;
}

function createDistractors(keywords, answer) {
  const candidates = keywords.filter((k) => k !== answer).slice(0, 10);
  const picked = [];
  while (picked.length < 3 && candidates.length) {
    const idx = Math.floor(Math.random() * candidates.length);
    picked.push(candidates[idx]);
    candidates.splice(idx, 1);
  }
  while (picked.length < 3) picked.push(`option-${picked.length + 1}`);
  return picked;
}

function generateQuiz(sentences, keywords) {
  const quiz = [];
  const selected = sentences.slice(0, 30);
  for (const sentence of selected) {
    const answer = keywords.find((k) => sentence.toLowerCase().includes(k));
    if (!answer) continue;
    const masked = sentence.replace(new RegExp(answer, "ig"), "_____");
    if (!masked.includes("_____")) continue;

    const distractors = createDistractors(keywords, answer);
    const options = [...distractors, answer].sort(() => Math.random() - 0.5);
    quiz.push({
      prompt: `Fill in the blank: ${masked}`,
      answer,
      options
    });
    if (quiz.length >= 10) break;
  }
  return quiz;
}

function generateCheatSheet(sentences, keywords) {
  const points = [];
  keywords.slice(0, 8).forEach((key) => {
    const related = sentences.find((s) => s.toLowerCase().includes(key));
    if (related) points.push(related);
  });
  return points.slice(0, 8);
}

function generateStudyTips(materialCount, topicCount) {
  return [
    `Split your revision into ${Math.max(topicCount, 4)} topic sessions.`,
    "Use active recall: try answering before viewing solutions.",
    "Review wrong quiz answers within 24 hours.",
    `Create at least ${Math.max(materialCount * 2, 6)} flashcards marked 'hard' and revise daily.`,
    "Use the cheat sheet for last-day quick revision."
  ];
}

async function processFiles() {
  const course = getSelectedCourse();
  if (!course) {
    els.uploadStatus.textContent = "Create a course first.";
    return;
  }

  const files = [...els.fileInput.files];
  if (!files.length) {
    els.uploadStatus.textContent = "Select files to upload.";
    return;
  }

  els.uploadStatus.textContent = "Processing files...";

  for (const file of files) {
    try {
      const text = cleanText(await extractTextFromFile(file));
      course.materials.push({
        id: uid(),
        name: file.name,
        text,
        uploadedAt: new Date().toISOString()
      });
    } catch (error) {
      course.materials.push({
        id: uid(),
        name: file.name,
        text: "",
        uploadedAt: new Date().toISOString(),
        error: error.message
      });
    }
  }

  saveState();
  renderAll();
  els.uploadStatus.textContent = "Files processed. Generate learning content next.";
  els.fileInput.value = "";
}

function generateContent() {
  const course = getSelectedCourse();
  if (!course) return;

  const allText = course.materials.map((m) => m.text).join(" ");
  if (!allText.trim()) {
    alert("No readable material text found. Upload supported files and try again.");
    return;
  }

  const sentences = splitSentences(allText);
  const keywords = topKeywords(allText);

  course.generated.flashcards = generateFlashcards(sentences, keywords);
  course.generated.quiz = generateQuiz(sentences, keywords);
  course.generated.cheatSheet = generateCheatSheet(sentences, keywords);
  course.generated.tips = generateStudyTips(course.materials.length, keywords.length);

  saveState();
  renderAll();
}

function clearGenerated() {
  const course = getSelectedCourse();
  if (!course) return;
  course.generated = { flashcards: [], quiz: [], cheatSheet: [], tips: [] };
  saveState();
  renderAll();
}

function renderMaterials(course) {
  els.materialsList.innerHTML = "";
  if (!course || !course.materials.length) {
    const li = document.createElement("li");
    li.textContent = "No materials uploaded yet.";
    els.materialsList.append(li);
    return;
  }

  for (const material of course.materials) {
    const li = document.createElement("li");
    li.textContent = material.error
      ? `${material.name} - could not parse (${material.error})`
      : `${material.name} - ready`;
    els.materialsList.append(li);
  }
}

function renderFlashcards(course) {
  els.flashcardsContainer.innerHTML = "";
  const cards = course?.generated?.flashcards || [];
  if (!cards.length) {
    els.flashcardsContainer.textContent = "Generate content to see flashcards.";
    return;
  }

  cards.forEach((card) => {
    const template = els.flashcardTemplate.content.cloneNode(true);
    template.querySelector("h3").textContent = card.title;
    template.querySelector("p").textContent = card.answer;
    els.flashcardsContainer.append(template);
  });
}

function renderQuiz(course) {
  els.quizContainer.innerHTML = "";
  const quiz = course?.generated?.quiz || [];
  if (!quiz.length) {
    els.quizContainer.textContent = "Generate content to see quiz questions.";
    return;
  }

  const form = document.createElement("form");
  form.id = "quizForm";

  quiz.forEach((q, idx) => {
    const block = document.createElement("article");
    block.className = "quiz-question";
    block.innerHTML = `<h4>Q${idx + 1}. ${q.prompt}</h4>`;

    q.options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "option";
      label.innerHTML = `<input type="radio" name="q-${idx}" value="${option}" /> ${option}`;
      block.append(label);
    });
    form.append(block);
  });

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.textContent = "Submit Quiz";
  form.append(submitBtn);

  const result = document.createElement("p");
  result.id = "quizResult";
  form.append(result);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    let score = 0;
    quiz.forEach((q, idx) => {
      const chosen = form.querySelector(`input[name="q-${idx}"]:checked`)?.value;
      if (chosen === q.answer) score += 1;
    });
    result.className = score >= Math.ceil(quiz.length * 0.6) ? "correct" : "incorrect";
    result.textContent = `Score: ${score}/${quiz.length}. ${score >= Math.ceil(quiz.length * 0.6) ? "Good progress." : "Review weak topics and retry."}`;
  });

  els.quizContainer.append(form);
}

function renderCheatSheet(course) {
  const points = course?.generated?.cheatSheet || [];
  if (!points.length) {
    els.cheatSheetContainer.textContent = "Generate content to see your cheat sheet.";
    return;
  }
  const html = points.map((p) => `<li>${p}</li>`).join("");
  els.cheatSheetContainer.innerHTML = `<ul>${html}</ul>`;
}

function renderStudyTips(course) {
  els.studyTips.innerHTML = "";
  const tips = course?.generated?.tips || [];
  if (!tips.length) {
    const li = document.createElement("li");
    li.textContent = "Generate content to get personalized tips.";
    els.studyTips.append(li);
    return;
  }
  tips.forEach((tip) => {
    const li = document.createElement("li");
    li.textContent = tip;
    els.studyTips.append(li);
  });
}

function renderAll() {
  updateCourseSelect();
  const course = getSelectedCourse();
  renderMaterials(course);
  renderFlashcards(course);
  renderQuiz(course);
  renderCheatSheet(course);
  renderStudyTips(course);
}

function wireEvents() {
  els.createCourseBtn.addEventListener("click", () => {
    createCourse(els.courseName.value);
    els.courseName.value = "";
  });

  els.courseSelect.addEventListener("change", (event) => {
    state.selectedCourseId = event.target.value || null;
    saveState();
    renderAll();
  });

  els.processFilesBtn.addEventListener("click", processFiles);
  els.generateBtn.addEventListener("click", generateContent);
  els.clearGeneratedBtn.addEventListener("click", clearGenerated);
}

function init() {
  loadState();
  wireEvents();
  renderAll();
}

init();
