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
  visualImageGallery: document.getElementById("visualImageGallery"),
  visualConceptTree: document.getElementById("visualConceptTree"),
  visualCues: document.getElementById("visualCues"),
  syntaxCards: document.getElementById("syntaxCards"),
  flashcardTemplate: document.getElementById("flashcardTemplate"),
  topicInput: document.getElementById("topicInput"),
  topicStudyBtn: document.getElementById("topicStudyBtn"),
  topicUseWeb: document.getElementById("topicUseWeb"),
  topicStatus: document.getElementById("topicStatus"),
  topicResults: document.getElementById("topicResults"),
  botQuestionInput: document.getElementById("botQuestionInput"),
  askBotBtn: document.getElementById("askBotBtn"),
  clearChatBtn: document.getElementById("clearChatBtn"),
  chatUseWeb: document.getElementById("chatUseWeb"),
  botStatus: document.getElementById("botStatus"),
  botChatLog: document.getElementById("botChatLog")
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
      state.courses.forEach((course) => {
        if (!course.generated) {
          course.generated = { flashcards: [], quiz: [], cheatSheet: [], tips: [], visuals: [], syntaxCards: [] };
        }
        if (!Array.isArray(course.generated.visuals)) {
          course.generated.visuals = [];
        }
        if (!Array.isArray(course.generated.syntaxCards)) {
          course.generated.syntaxCards = [];
        }
        if (!course.assistant) {
          course.assistant = { topicResult: null, botHistory: [] };
        }
      });
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
      tips: [],
      visuals: [],
      syntaxCards: []
    },
    assistant: {
      topicResult: null,
      botHistory: []
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

function isImageFile(name) {
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(name);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
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

function tokenizeQuery(query) {
  return tokenize(query).slice(0, 12);
}

function getMaterialCorpus(course) {
  const corpus = [];
  course.materials.forEach((material) => {
    if (!material.text) return;
    const sentences = splitSentences(material.text);
    sentences.forEach((sentence) => {
      corpus.push({
        source: material.name,
        sentence
      });
    });
  });
  return corpus;
}

function overlapScore(sentence, queryTokens) {
  const lowerSentence = sentence.toLowerCase();
  let score = 0;
  queryTokens.forEach((token) => {
    if (lowerSentence.includes(token)) score += 1;
  });
  return score;
}

function findRelevantSnippets(course, query, limit = 6) {
  const queryTokens = tokenizeQuery(query);
  if (!queryTokens.length) return [];

  const corpus = getMaterialCorpus(course);
  return corpus
    .map((item) => ({
      ...item,
      score: overlapScore(item.sentence, queryTokens)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.sentence.length - a.sentence.length)
    .slice(0, limit);
}

async function fetchWikipediaContext(query) {
  const opensearchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&origin=*`;
  const searchResponse = await fetch(opensearchUrl);
  if (!searchResponse.ok) {
    throw new Error("Could not search browser source.");
  }
  const searchData = await searchResponse.json();
  const firstTitle = searchData?.[1]?.[0];
  if (!firstTitle) return null;

  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`;
  const summaryResponse = await fetch(summaryUrl);
  if (!summaryResponse.ok) return null;
  const summaryData = await summaryResponse.json();
  if (!summaryData?.extract) return null;

  return {
    title: summaryData.title,
    extract: summaryData.extract,
    url: summaryData?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(firstTitle)}`
  };
}

function addBotMessage(course, role, text) {
  if (!course.assistant) {
    course.assistant = { topicResult: null, botHistory: [] };
  }
  course.assistant.botHistory.push({
    id: uid(),
    role,
    text,
    createdAt: new Date().toISOString()
  });
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

function generateVisualCues(corpus) {
  const cues = corpus
    .filter((item) => /(diagram|figure|graph|tree|chart|flow|map|table|axis|plot)/i.test(item.sentence))
    .slice(0, 8)
    .map((item) => ({ sentence: item.sentence, source: item.source }));
  return cues;
}

function generateSyntaxMemoryCards(course) {
  const cards = [];
  const seen = new Set();
  course.materials.forEach((material) => {
    const lines = material.text.split(/(?=[.;:{}()])/).map((line) => line.trim());
    lines.forEach((line) => {
      if (cards.length >= 12) return;
      if (line.length < 18 || line.length > 180) return;
      if (!/(=>|\(|\)|\{|\}|class |function |def |if |for |while |select |from |where )/i.test(line)) return;
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      cards.push({
        title: "Remember this structure",
        pattern: line,
        source: material.name
      });
    });
  });
  return cards.slice(0, 12);
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

function generateQuiz(corpus, keywords) {
  const quiz = [];
  const selected = corpus.slice(0, 45);
  for (const item of selected) {
    const sentence = item.sentence;
    const answer = keywords.find((k) => sentence.toLowerCase().includes(k));
    if (!answer) continue;
    const masked = sentence.replace(new RegExp(answer, "ig"), "_____");
    if (!masked.includes("_____")) continue;

    const distractors = createDistractors(keywords, answer);
    const options = [...distractors, answer].sort(() => Math.random() - 0.5);
    quiz.push({
      prompt: `Fill in the blank: ${masked}`,
      answer,
      options,
      context: sentence,
      source: item.source
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
      if (isImageFile(file.name)) {
        const dataUrl = await readAsDataUrl(file);
        course.materials.push({
          id: uid(),
          name: file.name,
          text: "",
          uploadedAt: new Date().toISOString(),
          imageDataUrl: dataUrl
        });
        continue;
      }

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

async function studyTopic() {
  const course = getSelectedCourse();
  if (!course) {
    els.topicStatus.textContent = "Create a course first.";
    return;
  }

  const topic = els.topicInput.value.trim();
  if (!topic) {
    els.topicStatus.textContent = "Enter a topic to study.";
    return;
  }

  const materialSnippets = findRelevantSnippets(course, topic, 7);
  const useWeb = els.topicUseWeb.checked;

  let webContext = null;
  els.topicStatus.textContent = "Finding topic content...";
  if (useWeb) {
    try {
      webContext = await fetchWikipediaContext(topic);
    } catch {
      webContext = null;
    }
  }

  if (!course.assistant) {
    course.assistant = { topicResult: null, botHistory: [] };
  }

  course.assistant.topicResult = {
    topic,
    snippets: materialSnippets,
    webContext,
    updatedAt: new Date().toISOString()
  };

  saveState();
  renderTopicResults(course);
  els.topicStatus.textContent = "Topic content ready.";
}

async function askBot() {
  const course = getSelectedCourse();
  if (!course) {
    els.botStatus.textContent = "Create a course first.";
    return;
  }

  const question = els.botQuestionInput.value.trim();
  if (!question) {
    els.botStatus.textContent = "Enter your question.";
    return;
  }

  addBotMessage(course, "user", question);
  els.botQuestionInput.value = "";
  renderChat(course);

  const materialSnippets = findRelevantSnippets(course, question, 4);
  let webContext = null;
  els.botStatus.textContent = "Bot is preparing answer...";

  if (els.chatUseWeb.checked) {
    try {
      webContext = await fetchWikipediaContext(question);
    } catch {
      webContext = null;
    }
  }

  const lines = [];
  if (materialSnippets.length) {
    lines.push("From your materials:");
    materialSnippets.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.sentence} (Source: ${item.source})`);
    });
  } else {
    lines.push("I could not find strong matches in uploaded materials for this question.");
  }

  if (webContext) {
    lines.push("");
    lines.push(`From browser context (${webContext.title}):`);
    lines.push(webContext.extract);
    lines.push(`Reference: ${webContext.url}`);
  }

  lines.push("");
  lines.push("Quick study tip: convert this answer into 2-3 flashcards and test yourself after 30 minutes.");
  addBotMessage(course, "assistant", lines.join("\n"));

  saveState();
  renderChat(course);
  els.botStatus.textContent = "Answer ready.";
}

function clearChat() {
  const course = getSelectedCourse();
  if (!course) return;
  if (!course.assistant) {
    course.assistant = { topicResult: null, botHistory: [] };
  }
  course.assistant.botHistory = [];
  saveState();
  renderChat(course);
}

function generateContent() {
  const course = getSelectedCourse();
  if (!course) return;

  const corpus = getMaterialCorpus(course);
  const allText = corpus.map((item) => item.sentence).join(" ");
  if (!allText.trim()) {
    alert("No readable material text found. Upload supported files and try again.");
    return;
  }

  const sentences = corpus.map((item) => item.sentence);
  const keywords = topKeywords(allText);

  course.generated.flashcards = generateFlashcards(sentences, keywords);
  course.generated.quiz = generateQuiz(corpus, keywords);
  course.generated.cheatSheet = generateCheatSheet(sentences, keywords);
  course.generated.tips = generateStudyTips(course.materials.length, keywords.length);
  course.generated.visuals = generateVisualCues(corpus);
  course.generated.syntaxCards = generateSyntaxMemoryCards(course);

  saveState();
  renderAll();
}

function clearGenerated() {
  const course = getSelectedCourse();
  if (!course) return;
  course.generated = { flashcards: [], quiz: [], cheatSheet: [], tips: [], visuals: [], syntaxCards: [] };
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

    const feedback = document.createElement("div");
    feedback.className = "quiz-feedback";
    feedback.id = `feedback-${idx}`;
    feedback.textContent = "Choose an answer and submit to see context feedback.";
    block.append(feedback);

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
      const feedback = form.querySelector(`#feedback-${idx}`);
      if (!chosen) {
        feedback.className = "quiz-feedback bad";
        feedback.textContent = `No answer selected. Correct answer: ${q.answer}. Context: ${q.context}`;
        return;
      }
      if (chosen === q.answer) {
        score += 1;
        feedback.className = "quiz-feedback good";
        feedback.textContent = `Correct. Context: ${q.context} (Source: ${q.source})`;
      } else {
        feedback.className = "quiz-feedback bad";
        feedback.textContent = `Not quite. You selected "${chosen}", but correct is "${q.answer}". Why: ${q.context} (Source: ${q.source})`;
      }
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

function renderVisualLearning(course) {
  els.visualImageGallery.innerHTML = "";
  els.visualConceptTree.innerHTML = "";
  els.visualCues.innerHTML = "";

  if (!course) {
    els.visualImageGallery.textContent = "Create a course to view visuals.";
    return;
  }

  const imageMaterials = course.materials.filter((m) => m.imageDataUrl);
  if (!imageMaterials.length) {
    els.visualImageGallery.textContent = "No image files uploaded yet.";
  } else {
    imageMaterials.forEach((item) => {
      const card = document.createElement("article");
      card.className = "image-card";
      const img = document.createElement("img");
      img.src = item.imageDataUrl;
      img.alt = item.name;
      const caption = document.createElement("p");
      caption.textContent = item.name;
      card.append(img, caption);
      els.visualImageGallery.append(card);
    });
  }

  const allText = course.materials.map((m) => m.text).join(" ");
  const top = topKeywords(allText, 10);
  if (!top.length) {
    els.visualConceptTree.textContent = "Generate content after uploading text material to see concept trees.";
  } else {
    const root = document.createElement("div");
    root.className = "tree-root";
    root.textContent = "Concept Tree";
    const list = document.createElement("ul");
    list.className = "tree-list";
    top.slice(0, 5).forEach((parentWord, idx) => {
      const li = document.createElement("li");
      const children = top.filter((_, childIdx) => childIdx !== idx).slice(0, 2);
      li.textContent = `${parentWord} -> ${children.join(", ")}`;
      list.append(li);
    });
    els.visualConceptTree.append(root, list);
  }

  const cues = course.generated?.visuals || [];
  if (!cues.length) {
    els.visualCues.textContent = "No graph/diagram cues detected yet. Upload more descriptive material and regenerate.";
  } else {
    const heading = document.createElement("h3");
    heading.textContent = "Detected Visual Cues from Materials";
    const ul = document.createElement("ul");
    cues.forEach((cue) => {
      const li = document.createElement("li");
      li.textContent = `${cue.sentence} (Source: ${cue.source})`;
      ul.append(li);
    });
    els.visualCues.append(heading, ul);
  }
}

function renderSyntaxCards(course) {
  els.syntaxCards.innerHTML = "";
  const cards = course?.generated?.syntaxCards || [];
  if (!cards.length) {
    els.syntaxCards.textContent = "Generate content to see syntax and structure memory cards.";
    return;
  }
  cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "flashcard";
    const title = document.createElement("h3");
    title.textContent = card.title;
    const body = document.createElement("p");
    body.textContent = card.pattern;
    const source = document.createElement("p");
    source.className = "hint";
    source.textContent = `Source: ${card.source}`;
    article.append(title, body, source);
    els.syntaxCards.append(article);
  });
}

function renderTopicResults(course) {
  const result = course?.assistant?.topicResult;
  els.topicResults.innerHTML = "";

  if (!result) {
    els.topicResults.textContent = "Enter a topic to view related course content.";
    return;
  }

  const heading = document.createElement("h3");
  heading.textContent = `Topic: ${result.topic}`;
  els.topicResults.append(heading);

  const materialHeading = document.createElement("p");
  materialHeading.innerHTML = "<strong>From uploaded materials</strong>";
  els.topicResults.append(materialHeading);

  if (result.snippets?.length) {
    const ul = document.createElement("ul");
    result.snippets.forEach((item) => {
      const li = document.createElement("li");
      const sentenceSpan = document.createElement("span");
      sentenceSpan.textContent = item.sentence;
      const badge = document.createElement("span");
      badge.className = "source-badge";
      badge.textContent = item.source;
      li.append(sentenceSpan, badge);
      ul.append(li);
    });
    els.topicResults.append(ul);
  } else {
    const empty = document.createElement("p");
    empty.textContent = "No matching material snippet found. Try a broader topic keyword.";
    els.topicResults.append(empty);
  }

  if (result.webContext) {
    const webTitle = document.createElement("p");
    webTitle.innerHTML = "<strong>From browser context</strong>";
    els.topicResults.append(webTitle);

    const webText = document.createElement("p");
    webText.textContent = result.webContext.extract;
    els.topicResults.append(webText);

    const webLink = document.createElement("a");
    webLink.href = result.webContext.url;
    webLink.target = "_blank";
    webLink.rel = "noreferrer";
    webLink.textContent = `Read more: ${result.webContext.title}`;
    els.topicResults.append(webLink);
  }
}

function renderChat(course) {
  els.botChatLog.innerHTML = "";
  const history = course?.assistant?.botHistory || [];
  if (!history.length) {
    els.botChatLog.textContent = "Ask a question to start the interactive study chat.";
    return;
  }

  history.forEach((message) => {
    const card = document.createElement("article");
    card.className = `chat-item ${message.role}`;

    const role = document.createElement("div");
    role.className = "chat-role";
    role.textContent = message.role === "user" ? "You" : "Study Bot";

    const text = document.createElement("pre");
    text.style.margin = "0";
    text.style.whiteSpace = "pre-wrap";
    text.textContent = message.text;

    card.append(role, text);
    els.botChatLog.append(card);
  });

  els.botChatLog.scrollTop = els.botChatLog.scrollHeight;
}

function renderAll() {
  updateCourseSelect();
  const course = getSelectedCourse();
  renderMaterials(course);
  renderVisualLearning(course);
  renderSyntaxCards(course);
  renderFlashcards(course);
  renderQuiz(course);
  renderCheatSheet(course);
  renderStudyTips(course);
  renderTopicResults(course);
  renderChat(course);
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
  els.topicStudyBtn.addEventListener("click", studyTopic);
  els.askBotBtn.addEventListener("click", askBot);
  els.clearChatBtn.addEventListener("click", clearChat);

  els.topicInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      studyTopic();
    }
  });

  els.botQuestionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      askBot();
    }
  });
}

function init() {
  loadState();
  wireEvents();
  renderAll();
}

init();
