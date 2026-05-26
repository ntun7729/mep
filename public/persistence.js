const GENERATED_EXAM_STORAGE_KEY = "mept-generated-exam";

loadExam = async function loadExam() {
  const savedExam = readSavedGeneratedExam();
  if (savedExam) {
    hydrateExam(savedExam);
    return;
  }

  const response = await fetch("/api/exam");
  state.exam = await response.json();
  hydrateExam(state.exam);
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
    saveGeneratedExam(result);
    state.exam = result;
    restartExam(false);
    toast(`New ${provider === "gemini" ? "Gemini" : "OpenAI-compatible"} practice set loaded and saved on this device.`);
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

function saveGeneratedExam(exam) {
  localStorage.setItem(GENERATED_EXAM_STORAGE_KEY, JSON.stringify({
    savedAt: new Date().toISOString(),
    exam
  }));
}

function readSavedGeneratedExam() {
  const stored = localStorage.getItem(GENERATED_EXAM_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    const exam = parsed.exam || parsed;
    if (isValidExam(exam)) {
      return exam;
    }
  } catch {
    // Fall through and clear the invalid saved copy.
  }

  localStorage.removeItem(GENERATED_EXAM_STORAGE_KEY);
  return null;
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
