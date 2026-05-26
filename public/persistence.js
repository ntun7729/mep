const GENERATED_EXAM_STORAGE_KEY = "mept-generated-exam";
const GENERATED_EXAM_HISTORY_KEY = "mept-generated-exam-history";
const ACTIVE_EXAM_ID_KEY = "mept-active-generated-exam-id";
const MAX_SAVED_EXAMS = 20;

loadExam = async function loadExam() {
  migrateSingleSavedExam();
  bindSavedSetControls();

  const savedExam = readActiveGeneratedExam();
  if (savedExam) {
    hydrateExam(savedExam.exam);
    refreshSavedSetUi();
    return;
  }

  const response = await fetch("/api/exam");
  state.exam = await response.json();
  hydrateExam(state.exam);
  refreshSavedSetUi();
};

generateExam = async function generateExam() {
  persistSettings();
  const provider = settingsElements.provider.value;
  const payload = {
    provider,
    apiKey: settingsElements.apiKey.value.trim(),
    model: settingsElements.model.value.trim(),
    baseUrl: settingsElements.baseUrl.value.trim()
  };

  const generateButton = document.getElementById("generate-exam");
  generateButton.disabled = true;
  generateButton.textContent = "Generating...";
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Generation failed.");
    }

    const savedSet = saveGeneratedExam(result, provider);
    state.exam = savedSet.exam;
    restartExam(false);
    refreshSavedSetUi();
    toast(`New ${provider === "gemini" ? "Gemini" : "OpenAI-compatible"} practice set saved. You can recall older sets from Saved Sets.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "Generate New Set";
  }
};

function hydrateExam(exam) {
  state.exam = exam;
  state.answers.task4 = [...state.exam.task4.scrambledOrder];
  buildTimeline();
  renderTabs();
  renderPanels();
  recalculateScore();
  updateTranscript();
  refreshProviderSummary();
}

function bindSavedSetControls() {
  const select = document.getElementById("saved-set-select");
  const loadButton = document.getElementById("load-saved-set");
  const deleteButton = document.getElementById("delete-saved-set");
  const originalButton = document.getElementById("load-original-set");

  if (!select || select.dataset.bound === "true") {
    return;
  }

  select.dataset.bound = "true";
  select.addEventListener("change", refreshSavedSetMeta);
  loadButton.addEventListener("click", loadSelectedSavedSet);
  deleteButton.addEventListener("click", deleteSelectedSavedSet);
  originalButton.addEventListener("click", loadOriginalSet);
}

function saveGeneratedExam(exam, provider) {
  const savedAt = new Date().toISOString();
  const savedSet = {
    id: makeSavedExamId(),
    name: makeSavedExamName(exam, savedAt, provider),
    provider,
    savedAt,
    exam
  };

  const history = readSavedExamHistory().filter((item) => item.id !== savedSet.id);
  history.unshift(savedSet);
  const trimmed = history.slice(0, MAX_SAVED_EXAMS);
  localStorage.setItem(GENERATED_EXAM_HISTORY_KEY, JSON.stringify(trimmed));
  localStorage.setItem(ACTIVE_EXAM_ID_KEY, savedSet.id);
  localStorage.setItem(GENERATED_EXAM_STORAGE_KEY, JSON.stringify(savedSet));
  return savedSet;
}

function readActiveGeneratedExam() {
  const history = readSavedExamHistory();
  if (!history.length) {
    return null;
  }

  const activeId = localStorage.getItem(ACTIVE_EXAM_ID_KEY);
  return history.find((item) => item.id === activeId) || history[0];
}

function readSavedExamHistory() {
  const stored = localStorage.getItem(GENERATED_EXAM_HISTORY_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new Error("Saved history is not an array.");
    }

    return parsed
      .filter((item) => item && isValidExam(item.exam))
      .map((item, index) => ({
        id: item.id || makeSavedExamId(index),
        name: item.name || makeSavedExamName(item.exam, item.savedAt, item.provider),
        provider: item.provider || "unknown",
        savedAt: item.savedAt || new Date(0).toISOString(),
        exam: item.exam
      }));
  } catch {
    localStorage.removeItem(GENERATED_EXAM_HISTORY_KEY);
    localStorage.removeItem(ACTIVE_EXAM_ID_KEY);
    return [];
  }
}

function migrateSingleSavedExam() {
  if (localStorage.getItem(GENERATED_EXAM_HISTORY_KEY)) {
    return;
  }

  const stored = localStorage.getItem(GENERATED_EXAM_STORAGE_KEY);
  if (!stored) {
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    const exam = parsed.exam || parsed;
    if (!isValidExam(exam)) {
      throw new Error("Invalid saved exam.");
    }

    const savedAt = parsed.savedAt || new Date().toISOString();
    const savedSet = {
      id: parsed.id || makeSavedExamId(),
      name: parsed.name || makeSavedExamName(exam, savedAt, parsed.provider),
      provider: parsed.provider || "unknown",
      savedAt,
      exam
    };
    localStorage.setItem(GENERATED_EXAM_HISTORY_KEY, JSON.stringify([savedSet]));
    localStorage.setItem(ACTIVE_EXAM_ID_KEY, savedSet.id);
  } catch {
    localStorage.removeItem(GENERATED_EXAM_STORAGE_KEY);
  }
}

function refreshSavedSetUi() {
  const select = document.getElementById("saved-set-select");
  const count = document.getElementById("saved-set-count");
  if (!select || !count) {
    return;
  }

  const history = readSavedExamHistory();
  const activeId = localStorage.getItem(ACTIVE_EXAM_ID_KEY);
  select.innerHTML = "";

  if (!history.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No generated sets saved yet";
    select.appendChild(option);
  } else {
    history.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    });
    select.value = history.some((item) => item.id === activeId) ? activeId : history[0].id;
  }

  count.textContent = `${history.length} saved`;
  document.getElementById("load-saved-set").disabled = history.length === 0;
  document.getElementById("delete-saved-set").disabled = history.length === 0;
  refreshSavedSetMeta();
}

function refreshSavedSetMeta() {
  const meta = document.getElementById("saved-set-meta");
  const select = document.getElementById("saved-set-select");
  if (!meta || !select) {
    return;
  }

  const history = readSavedExamHistory();
  const selected = history.find((item) => item.id === select.value);
  if (!selected) {
    meta.textContent = "Generated sets will be saved on this device.";
    return;
  }

  const date = new Date(selected.savedAt);
  const readableDate = Number.isNaN(date.getTime()) ? "unknown date" : date.toLocaleString();
  meta.textContent = `${selected.provider || "unknown"} set saved ${readableDate}. First question: ${selected.exam.task1[0]?.question || "Untitled set"}`;
}

function loadSelectedSavedSet() {
  const select = document.getElementById("saved-set-select");
  const history = readSavedExamHistory();
  const selected = history.find((item) => item.id === select.value);
  if (!selected) {
    toast("No saved generated set selected.", true);
    return;
  }

  localStorage.setItem(ACTIVE_EXAM_ID_KEY, selected.id);
  localStorage.setItem(GENERATED_EXAM_STORAGE_KEY, JSON.stringify(selected));
  hydrateExam(selected.exam);
  restartExam(true);
  refreshSavedSetUi();
  toast("Saved generated set loaded.");
}

function deleteSelectedSavedSet() {
  const select = document.getElementById("saved-set-select");
  const history = readSavedExamHistory();
  const nextHistory = history.filter((item) => item.id !== select.value);
  localStorage.setItem(GENERATED_EXAM_HISTORY_KEY, JSON.stringify(nextHistory));

  const nextActive = nextHistory[0] || null;
  if (nextActive) {
    localStorage.setItem(ACTIVE_EXAM_ID_KEY, nextActive.id);
    localStorage.setItem(GENERATED_EXAM_STORAGE_KEY, JSON.stringify(nextActive));
    hydrateExam(nextActive.exam);
    restartExam(true);
  } else {
    localStorage.removeItem(ACTIVE_EXAM_ID_KEY);
    localStorage.removeItem(GENERATED_EXAM_STORAGE_KEY);
    loadOriginalSet();
  }

  refreshSavedSetUi();
  toast("Saved generated set deleted.");
}

async function loadOriginalSet() {
  localStorage.removeItem(ACTIVE_EXAM_ID_KEY);
  localStorage.removeItem(GENERATED_EXAM_STORAGE_KEY);
  const response = await fetch("/api/exam");
  const originalExam = await response.json();
  hydrateExam(originalExam);
  restartExam(true);
  refreshSavedSetUi();
  toast("Original practice set loaded.");
}

function makeSavedExamId(index = "") {
  const randomPart = Math.random().toString(36).slice(2, 9);
  return `set-${Date.now()}-${index}-${randomPart}`;
}

function makeSavedExamName(exam, savedAt, provider = "unknown") {
  const date = new Date(savedAt);
  const readableDate = Number.isNaN(date.getTime()) ? "Saved set" : date.toLocaleString();
  const source = provider === "openai" ? "OpenAI" : provider === "gemini" ? "Gemini" : "Generated";
  const firstQuestion = exam?.task1?.[0]?.question || "Practice set";
  return `${source} - ${readableDate} - ${firstQuestion.slice(0, 42)}`;
}

function isValidExam(exam) {
  return Boolean(
    exam &&
    Array.isArray(exam.task1) &&
    Array.isArray(exam.task2) &&
    Array.isArray(exam.task3) &&
    typeof exam.task3Script === "string" &&
    exam.task4 &&
    Array.isArray(exam.task4.correctOrder) &&
    Array.isArray(exam.task4.scrambledOrder) &&
    typeof exam.task4.script === "string"
  );
}
