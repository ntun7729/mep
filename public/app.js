const state = {
  exam: null,
  activeTab: "task1",
  answers: { task1: {}, task2: {}, task3: {}, task4: [] },
  transcriptOpen: true,
  selectedScript: "Select a question script below, then press play.",
  selectedCardId: null,
  timeline: [],
  timelineIndex: 0,
  fullExamPlaying: false,
  fullExamTimer: null,
  utterance: null,
  voices: [],
  settings: {
    provider: "gemini",
    apiKey: "",
    model: "",
    baseUrl: ""
  }
};

const tabMeta = [
  { id: "task1", label: "Task 1 (Visual)" },
  { id: "task2", label: "Task 2 (Multiple Choice)" },
  { id: "task3", label: "Task 3 (Dialogue Context)" },
  { id: "task4", label: "Task 4 (Ordering Drill)" },
  { id: "task5", label: "Exam Summary" }
];

const settingsElements = {};

window.addEventListener("DOMContentLoaded", init);

async function init() {
  bindControls();
  loadSettings();
  hydrateSettingsUi();
  loadVoices();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  await loadExam();
}

function bindControls() {
  document.getElementById("play-button").addEventListener("click", () => {
    if (state.fullExamPlaying) {
      stopAllAudio();
      return;
    }
    playFullExam();
  });
  document.getElementById("stop-button").addEventListener("click", stopAllAudio);
  document.getElementById("volume-slider").addEventListener("input", updateVolumeLabel);
  document.getElementById("toggle-transcript").addEventListener("click", toggleTranscript);
  document.getElementById("open-settings").addEventListener("click", () => setSettingsOpen(true));
  document.getElementById("close-settings").addEventListener("click", () => setSettingsOpen(false));
  document.getElementById("generate-exam").addEventListener("click", generateExam);

  settingsElements.provider = document.getElementById("provider-select");
  settingsElements.apiKey = document.getElementById("api-key-input");
  settingsElements.model = document.getElementById("model-input");
  settingsElements.baseUrl = document.getElementById("base-url-input");

  Object.values(settingsElements).forEach((element) => {
    element.addEventListener("input", persistSettings);
    element.addEventListener("change", persistSettings);
  });
}

async function loadExam() {
  const response = await fetch("/api/exam");
  state.exam = await response.json();
  state.answers.task4 = [...state.exam.task4.scrambledOrder];
  buildTimeline();
  renderTabs();
  renderPanels();
  recalculateScore();
  updateTranscript();
  refreshProviderSummary();
}

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  tabMeta.forEach((tab) => {
    const button = document.createElement("button");
    button.className = `tab-button${state.activeTab === tab.id ? " active" : ""}`;
    button.textContent = tab.label;
    button.addEventListener("click", () => {
      state.activeTab = tab.id;
      renderTabs();
      renderPanels();
    });
    tabs.appendChild(button);
  });
}

function renderPanels() {
  const panels = document.getElementById("tab-panels");
  panels.innerHTML = "";
  if (state.activeTab === "task1") {
    panels.appendChild(renderTask1());
  } else if (state.activeTab === "task2") {
    panels.appendChild(renderTask2());
  } else if (state.activeTab === "task3") {
    panels.appendChild(renderTask3());
  } else if (state.activeTab === "task4") {
    panels.appendChild(renderTask4());
  } else {
    panels.appendChild(renderSummary());
  }
}

function renderTask1() {
  const stack = sectionStack();
  state.exam.task1.forEach((question, index) => {
    const card = buildQuestionCard(`Question ${index + 1}`, question.question, question.script, `task1-${question.id}`);
    const grid = document.createElement("div");
    grid.className = "visual-grid";
    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.className = `visual-option${state.answers.task1[question.id] === option.key ? " selected" : ""}`;
      button.appendChild(buildVisualArt(option.visualToken, option.label));
      const label = document.createElement("div");
      label.className = "visual-label";
      label.innerHTML = `<span class="visual-key">${option.key}</span><span>${option.label}</span>`;
      button.appendChild(label);
      button.addEventListener("click", () => {
        state.answers.task1[question.id] = option.key;
        state.selectedCardId = `task1-${question.id}`;
        recalculateScore();
        renderPanels();
      });
      grid.appendChild(button);
    });
    card.querySelector(".question-body").appendChild(grid);
    stack.appendChild(card);
  });
  return stack;
}

function renderTask2() {
  const stack = sectionStack();
  state.exam.task2.forEach((question, index) => {
    const card = buildQuestionCard(`Question ${index + 1}`, question.question, question.script, `task2-${question.id}`);
    card.querySelector(".question-body").appendChild(renderAnswerOptions({
      task: "task2",
      questionId: question.id,
      options: question.options
    }));
    stack.appendChild(card);
  });
  return stack;
}

function renderTask3() {
  const wrapper = sectionStack();

  const banner = document.createElement("section");
  banner.className = "dialogue-banner";
  banner.innerHTML = `
    <div>
      <h3>Continuous Dialogue Track</h3>
      <p>Play the shared context once, then answer the six follow-up questions.</p>
    </div>
  `;
  const button = document.createElement("button");
  button.className = "primary-button";
  button.textContent = "Play Dialogue Block";
  button.addEventListener("click", () => playScript(state.exam.task3Script));
  banner.appendChild(button);
  wrapper.appendChild(banner);

  state.exam.task3.forEach((question, index) => {
    const card = buildQuestionCard(`Question ${index + 1}`, question.question, state.exam.task3Script, `task3-${question.id}`, false);
    card.querySelector(".question-body").appendChild(renderAnswerOptions({
      task: "task3",
      questionId: question.id,
      options: question.options
    }));
    wrapper.appendChild(card);
  });

  return wrapper;
}

function renderTask4() {
  const board = document.createElement("section");
  board.className = "task4-board";
  board.innerHTML = `
    <div class="panel-head">
      <div>
        <span class="panel-kicker">Task 4</span>
        <h3>Chronological ordering</h3>
      </div>
      <div class="task4-actions"></div>
    </div>
  `;

  const actions = board.querySelector(".task4-actions");
  const loadAudio = document.createElement("button");
  loadAudio.className = "ghost-button";
  loadAudio.textContent = "Load Audio Track";
  loadAudio.addEventListener("click", () => playScript(state.exam.task4.script));
  const validate = document.createElement("button");
  validate.className = "primary-button";
  validate.textContent = "Validate Sequence";
  validate.addEventListener("click", validateTask4);
  actions.appendChild(loadAudio);
  actions.appendChild(validate);

  const list = document.createElement("div");
  list.className = "order-list";
  state.answers.task4.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "order-row";
    row.appendChild(makeOrderBadge(index + 1));
    const text = document.createElement("div");
    text.className = "order-text";
    text.textContent = item;
    row.appendChild(text);
    const controls = document.createElement("div");
    controls.className = "order-controls";
    const up = document.createElement("button");
    up.className = "order-button";
    up.textContent = "˄";
    up.disabled = index === 0;
    up.addEventListener("click", () => moveTask4(index, -1));
    const down = document.createElement("button");
    down.className = "order-button";
    down.textContent = "˅";
    down.disabled = index === state.answers.task4.length - 1;
    down.addEventListener("click", () => moveTask4(index, 1));
    controls.append(up, down);
    row.appendChild(controls);
    list.appendChild(row);
  });
  board.appendChild(list);

  const feedback = document.createElement("p");
  feedback.id = "task4-feedback";
  feedback.className = "task4-feedback";
  feedback.textContent = "Arrange the steps, then validate the sequence.";
  board.appendChild(feedback);
  return board;
}

function renderSummary() {
  const { total, task1, task2, task3, task4, percent } = calculateTotals();
  const card = document.createElement("section");
  card.className = "summary-card";
  card.innerHTML = `
    <div class="summary-header">
      <div>
        <span class="summary-kicker">Performance Report Card</span>
        <h2>Exam summary</h2>
      </div>
    </div>
    <div class="summary-grade-card">
      <h3>Result Output</h3>
      <div class="summary-grade">${gradeFromPercent(percent)}</div>
      <div class="summary-status ${statusClass(percent)}">${statusText(percent)}</div>
      <div class="summary-score">${total} / 25 Marks (${Math.round(percent)}%)</div>
    </div>
    <div class="summary-stats">
      <div class="summary-stat"><span>Task 1</span><strong>${task1} / 8</strong></div>
      <div class="summary-stat"><span>Task 2</span><strong>${task2} / 6</strong></div>
      <div class="summary-stat"><span>Task 3</span><strong>${task3} / 6</strong></div>
      <div class="summary-stat"><span>Task 4</span><strong>${task4} / 5</strong></div>
    </div>
  `;
  const reset = document.createElement("button");
  reset.className = "summary-action";
  reset.textContent = "Restart Current Quiz";
  reset.addEventListener("click", restartExam);
  card.appendChild(reset);
  return card;
}

function buildQuestionCard(label, title, script, cardId, showPlay = true) {
  const template = document.getElementById("task-card-template");
  const fragment = template.content.firstElementChild.cloneNode(true);
  fragment.querySelector(".question-label").textContent = label;
  fragment.querySelector(".question-title").textContent = title;
  fragment.dataset.cardId = cardId;
  if (state.selectedCardId === cardId) {
    fragment.style.borderColor = "rgba(255, 171, 8, 0.58)";
    fragment.style.background = "linear-gradient(180deg, rgba(27, 36, 59, 0.98), rgba(20, 29, 46, 0.98))";
  }
  const audioLink = fragment.querySelector(".audio-link");
  if (!showPlay) {
    audioLink.remove();
  } else {
    audioLink.addEventListener("click", () => playScript(script));
  }
  fragment.addEventListener("click", () => selectScript(script, cardId));
  return fragment;
}

function renderAnswerOptions({ task, questionId, options }) {
  const stack = document.createElement("div");
  stack.className = "option-stack";
  options.forEach((option) => {
    const button = document.createElement("button");
    button.className = `answer-option${state.answers[task][questionId] === option.key ? " selected" : ""}`;
    button.innerHTML = `<span class="answer-key">${option.key}.</span> ${option.label}`;
    button.addEventListener("click", () => {
      state.answers[task][questionId] = option.key;
      state.selectedCardId = `${task}-${questionId}`;
      recalculateScore();
      renderPanels();
    });
    stack.appendChild(button);
  });
  return stack;
}

function buildVisualArt(token, label) {
  const art = document.createElement("div");
  art.className = "visual-art";
  const stage = document.createElement("div");
  stage.className = "art";
  stage.appendChild(frame());
  applyArtToken(stage, token);
  const tag = document.createElement("div");
  tag.className = "text-tag";
  tag.textContent = label;
  stage.appendChild(tag);
  art.appendChild(stage);
  return art;
}

function frame() {
  const node = document.createElement("div");
  node.className = "frame";
  return node;
}

function applyArtToken(stage, token) {
  const add = (className, styles = {}) => {
    const node = document.createElement("div");
    node.className = `shape ${className}`;
    Object.assign(node.style, styles);
    stage.appendChild(node);
    return node;
  };

  if (token === "galley") {
    add("shape", { left: "28px", top: "32px", width: "26px", height: "22px", border: "2px solid #4b84ff", borderRadius: "12px 12px 2px 2px" });
    add("shape", { left: "72px", top: "30px", width: "16px", height: "16px", background: "#ffab08", borderRadius: "999px" });
  } else if (token === "engine-room") {
    add("shape", { left: "48px", top: "26px", width: "34px", height: "34px", border: "3px solid #f9565f", borderRadius: "999px" });
    add("shape", { left: "63px", top: "29px", width: "3px", height: "28px", background: "#f9565f" });
    add("shape", { left: "51px", top: "41px", width: "28px", height: "3px", background: "#f9565f" });
  } else if (token === "paint-locker") {
    add("shape", { left: "28px", top: "28px", width: "18px", height: "34px", background: "#4b84ff", borderRadius: "4px" });
    add("shape", { left: "54px", top: "28px", width: "18px", height: "34px", background: "#25c58b", borderRadius: "4px" });
    add("shape", { left: "86px", top: "26px", width: "0", height: "0", borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderBottom: "38px solid #efbd2d" });
  } else if (token === "lifebuoy") {
    add("shape", { left: "48px", top: "22px", width: "34px", height: "34px", border: "5px solid #fd7a1e", borderRadius: "999px" });
    add("shape", { left: "63px", top: "24px", width: "3px", height: "30px", background: "#e7eefc" });
    add("shape", { left: "50px", top: "38px", width: "28px", height: "3px", background: "#e7eefc" });
  } else if (token === "fire-extinguisher") {
    add("shape", { left: "56px", top: "18px", width: "18px", height: "38px", background: "#f9565f", borderRadius: "5px" });
    add("shape", { left: "63px", top: "24px", width: "7px", height: "7px", background: "#6c738d", borderRadius: "999px" });
    add("shape", { left: "69px", top: "30px", width: "14px", height: "3px", background: "#6c738d", transform: "rotate(35deg)", transformOrigin: "left center" });
  } else if (token === "pilot-ladder") {
    add("shape", { left: "44px", top: "14px", width: "3px", height: "50px", background: "#eceef7" });
    add("shape", { left: "78px", top: "14px", width: "3px", height: "50px", background: "#eceef7" });
    add("shape", { left: "44px", top: "24px", width: "37px", height: "4px", background: "#ffab08" });
    add("shape", { left: "44px", top: "40px", width: "37px", height: "4px", background: "#ffab08" });
  } else if (token === "clock-four" || token === "clock-eight-thirty" || token === "clock-ten-fifteen") {
    add("shape", { left: "44px", top: "14px", width: "40px", height: "40px", borderRadius: "999px", border: "2px solid #687386", background: "#1a2442" });
    add("shape", { left: "63px", top: "32px", width: token === "clock-eight-thirty" ? "4px" : "3px", height: token === "clock-four" ? "15px" : "16px", background: "#f4f7ff" });
    const hour = add("shape", { left: "63px", top: "32px", width: "13px", height: "3px", background: "#ffab08" });
    if (token === "clock-eight-thirty") {
      hour.style.width = "16px";
      hour.style.transform = "rotate(195deg)";
      hour.style.transformOrigin = "left center";
    } else if (token === "clock-ten-fifteen") {
      hour.style.transform = "rotate(135deg)";
      hour.style.transformOrigin = "left center";
    } else {
      hour.style.transform = "rotate(270deg)";
      hour.style.transformOrigin = "left center";
    }
  } else if (token === "alfa-flag" || token === "bravo-flag" || token === "quebec-flag") {
    if (token === "quebec-flag") {
      add("shape", { left: "42px", top: "26px", width: "46px", height: "30px", background: "#efbd2d" });
    } else {
      add("shape", { left: "40px", top: "24px", width: "40px", height: "28px", background: token === "bravo-flag" ? "#f9565f" : "#18244b", clipPath: "polygon(0 0, 72% 0, 50% 50%, 72% 100%, 0 100%)", border: token === "alfa-flag" ? "2px solid #4b84ff" : "none" });
      if (token === "alfa-flag") {
        add("shape", { left: "40px", top: "24px", width: "15px", height: "28px", background: "#ffffff" });
      }
    }
  } else if (token === "anemometer") {
    add("shape", { left: "61px", top: "32px", width: "18px", height: "18px", background: "#6c738d", borderRadius: "999px" });
    add("shape", { left: "43px", top: "29px", width: "28px", height: "2px", background: "#dce3f5", transform: "rotate(28deg)", transformOrigin: "right center" });
    add("shape", { left: "71px", top: "29px", width: "28px", height: "2px", background: "#dce3f5", transform: "rotate(-28deg)", transformOrigin: "left center" });
  } else if (token === "gas-detector") {
    add("shape", { left: "56px", top: "18px", width: "20px", height: "42px", border: "2px solid #ffab08", borderRadius: "5px", background: "#33405f" });
    add("shape", { left: "60px", top: "24px", width: "12px", height: "10px", background: "#111827" });
  } else if (token === "uhf-radio") {
    add("shape", { left: "58px", top: "22px", width: "18px", height: "38px", border: "2px solid #4b84ff", borderRadius: "4px" });
    add("shape", { left: "65px", top: "12px", width: "2px", height: "12px", background: "#ffffff" });
  } else if (token === "ballast-tank" || token === "fuel-tank" || token === "fresh-water-tank") {
    const color = token === "ballast-tank" ? "#4b84ff" : token === "fuel-tank" ? "#d68a18" : "#17b6da";
    add("shape", { left: "38px", top: "18px", width: "48px", height: "38px", border: `2px solid ${color}`, borderRadius: "4px", background: "#16203a" });
    add("shape", { left: "40px", top: token === "fuel-tank" ? "38px" : token === "ballast-tank" ? "34px" : "20px", width: "44px", height: token === "fuel-tank" ? "16px" : token === "ballast-tank" ? "20px" : "34px", background: color });
  } else if (token === "bilge") {
    add("shape", { left: "28px", top: "48px", width: "64px", height: "6px", background: "#718094" });
    add("shape", { left: "43px", top: "48px", width: "34px", height: "8px", background: "#050816", borderRadius: "999px" });
  } else if (token === "scupper") {
    add("shape", { left: "50px", top: "26px", width: "30px", height: "30px", border: "2px solid #e6ecfa", borderRadius: "999px" });
    add("shape", { left: "55px", top: "40px", width: "20px", height: "2px", background: "#e6ecfa" });
  } else if (token === "manifold") {
    add("shape", { left: "25px", top: "36px", width: "70px", height: "8px", background: "#74839b" });
    add("shape", { left: "58px", top: "24px", width: "10px", height: "26px", background: "#515d72" });
    add("shape", { left: "61px", top: "36px", width: "6px", height: "6px", background: "#f9565f", borderRadius: "999px" });
  } else if (token === "name-ken" || token === "name-min" || token === "name-zaw") {
    const color = token === "name-ken" ? "#fd7a1e" : token === "name-min" ? "#efbd2d" : "#4b84ff";
    const name = token === "name-ken" ? "KEN" : token === "name-min" ? "MIN" : "ZAW";
    add("shape", { left: "58px", top: "20px", width: "18px", height: "18px", background: color, borderRadius: "999px" });
    const badge = add("shape", { left: "40px", top: "44px", width: "54px", height: "22px", border: `2px solid ${color}`, borderRadius: "6px", display: "grid", placeItems: "center", color: "#ffffff", fontWeight: "900", fontSize: "11px" });
    badge.textContent = name;
  }
}

function selectScript(script, cardId) {
  state.selectedScript = script;
  state.selectedCardId = cardId;
  updateTranscript();
  renderPanels();
}

function updateTranscript() {
  document.getElementById("script-preview").textContent = state.transcriptOpen ? state.selectedScript : "Transcript hidden";
  document.getElementById("subtitle-text").textContent = state.selectedScript;
}

function toggleTranscript() {
  state.transcriptOpen = !state.transcriptOpen;
  updateTranscript();
}

function moveTask4(index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= state.answers.task4.length) {
    return;
  }
  const clone = [...state.answers.task4];
  [clone[index], clone[nextIndex]] = [clone[nextIndex], clone[index]];
  state.answers.task4 = clone;
  recalculateScore();
  renderPanels();
}

function validateTask4() {
  const correct = state.answers.task4.every((item, index) => item === state.exam.task4.correctOrder[index]);
  const feedback = document.getElementById("task4-feedback");
  if (correct) {
    feedback.textContent = "Perfect order sequence achieved.";
    feedback.className = "task4-feedback status-success";
    toast("Task 4 sequence is correct.");
  } else {
    const mismatches = state.answers.task4.filter((item, index) => item !== state.exam.task4.correctOrder[index]).length;
    feedback.textContent = `Sequence still needs work. ${mismatches} step(s) are out of place.`;
    feedback.className = "task4-feedback status-danger";
  }
}

function buildTimeline() {
  const steps = [];
  steps.push({ title: "Introduction", text: "Welcome to the MEPT listening simulator. There are four tasks in this practice set.", tab: "task1" });
  steps.push({ title: "Pause", text: "[Pause to prepare]", tab: "task1", pauseMs: 1200 });
  steps.push({ title: "Task 1 Introduction", text: "Task 1. Listen and choose the correct picture A, B, or C.", tab: "task1" });
  state.exam.task1.forEach((question, index) => {
    steps.push({ title: `Task 1, Question ${index + 1}`, text: `Question ${index + 1}. ${question.script}`, tab: "task1", cardId: `task1-${question.id}` });
    steps.push({ title: `Task 1, Question ${index + 1} Repeat`, text: `Now listen again. ${question.script}`, tab: "task1", cardId: `task1-${question.id}` });
    steps.push({ title: "Pause", text: "[Pause to answer]", tab: "task1", pauseMs: 1000 });
  });
  steps.push({ title: "Task 2 Introduction", text: "Task 2. Listen and choose the correct answer A, B, or C.", tab: "task2" });
  state.exam.task2.forEach((question, index) => {
    steps.push({ title: `Task 2, Question ${index + 1}`, text: `Question ${index + 1}. ${question.script}`, tab: "task2", cardId: `task2-${question.id}` });
    steps.push({ title: `Task 2, Question ${index + 1} Repeat`, text: `Now listen again. ${question.script}`, tab: "task2", cardId: `task2-${question.id}` });
    steps.push({ title: "Pause", text: "[Pause to answer]", tab: "task2", pauseMs: 1000 });
  });
  steps.push({ title: "Task 3 Introduction", text: "Task 3. Listen to the dialogue, then answer the questions.", tab: "task3" });
  steps.push({ title: "Task 3 Dialogue", text: state.exam.task3Script, tab: "task3" });
  steps.push({ title: "Task 3 Dialogue Repeat", text: `Now listen again. ${state.exam.task3Script}`, tab: "task3" });
  steps.push({ title: "Pause", text: "[Pause to answer]", tab: "task3", pauseMs: 1400 });
  steps.push({ title: "Task 4 Introduction", text: "Task 4. Listen to the drill description and order the actions correctly.", tab: "task4" });
  steps.push({ title: "Task 4 Drill", text: state.exam.task4.script, tab: "task4" });
  steps.push({ title: "Task 4 Drill Repeat", text: `Now listen again. ${state.exam.task4.script}`, tab: "task4" });
  steps.push({ title: "End of Test", text: "That is the end of the listening test. Please review your answers.", tab: "task5" });
  state.timeline = steps;
}

function playFullExam() {
  stopAllAudio();
  state.fullExamPlaying = true;
  state.timelineIndex = 0;
  document.getElementById("play-button").textContent = "❚❚";
  runTimeline();
}

function runTimeline() {
  if (!state.fullExamPlaying || state.timelineIndex >= state.timeline.length) {
    stopAllAudio();
    state.activeTab = "task5";
    renderTabs();
    renderPanels();
    return;
  }

  const item = state.timeline[state.timelineIndex];
  state.activeTab = item.tab;
  state.selectedScript = item.text;
  state.selectedCardId = item.cardId || null;
  renderTabs();
  renderPanels();
  updateTranscript();

  document.getElementById("timeline-title").textContent = item.title;
  document.getElementById("timeline-repeat").textContent = `${state.timelineIndex + 1} / ${state.timeline.length}`;
  if (item.pauseMs) {
    document.getElementById("audio-status").textContent = "Pause for review";
    state.fullExamTimer = window.setTimeout(() => {
      state.timelineIndex += 1;
      runTimeline();
    }, item.pauseMs);
    return;
  }
  speak(item.text, () => {
    state.timelineIndex += 1;
    state.fullExamTimer = window.setTimeout(runTimeline, 700);
  });
}

function playScript(script) {
  stopAllAudio();
  state.selectedScript = script;
  updateTranscript();
  speak(script);
}

function speak(text, onDone) {
  if (!("speechSynthesis" in window)) {
    toast("This browser does not support speech playback.");
    if (onDone) onDone();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  state.utterance = utterance;
  const selectedName = document.getElementById("voice-select").value;
  const selectedVoice = state.voices.find((voice) => voice.name === selectedName);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }
  const rate = Number(document.getElementById("volume-slider").value);
  utterance.volume = Math.min(1, rate / 1.25);
  utterance.rate = 0.96;
  utterance.onstart = () => {
    document.getElementById("audio-status").textContent = "Playing transcript audio";
  };
  utterance.onend = () => {
    document.getElementById("audio-status").textContent = "Audio system ready";
    if (onDone) onDone();
  };
  utterance.onerror = () => {
    document.getElementById("audio-status").textContent = "Audio playback ended";
    if (onDone) onDone();
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function stopAllAudio() {
  state.fullExamPlaying = false;
  window.clearTimeout(state.fullExamTimer);
  state.fullExamTimer = null;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  document.getElementById("play-button").textContent = "▶";
  document.getElementById("audio-status").textContent = "Audio system ready";
  document.getElementById("timeline-title").textContent = "Idle";
  document.getElementById("timeline-repeat").textContent = "Ready";
}

function recalculateScore() {
  const { total, percent } = calculateTotals();
  document.getElementById("score-display").textContent = `Score: ${total} / 25`;
  document.getElementById("progress-bar").style.width = `${percent}%`;
}

function calculateTotals() {
  let task1 = 0;
  let task2 = 0;
  let task3 = 0;
  let task4 = 0;

  state.exam.task1.forEach((question) => {
    if (state.answers.task1[question.id] === question.correct) {
      task1 += 1;
    }
  });
  state.exam.task2.forEach((question) => {
    if (state.answers.task2[question.id] === question.correct) {
      task2 += 1;
    }
  });
  state.exam.task3.forEach((question) => {
    if (state.answers.task3[question.id] === question.correct) {
      task3 += 1;
    }
  });
  if (state.answers.task4.every((item, index) => item === state.exam.task4.correctOrder[index])) {
    task4 = 5;
  }

  const total = task1 + task2 + task3 + task4;
  return { task1, task2, task3, task4, total, percent: (total / 25) * 100 };
}

function updateVolumeLabel() {
  const value = Number(document.getElementById("volume-slider").value);
  document.getElementById("volume-label").textContent = `${Math.round(value * 100)}%`;
}

async function generateExam() {
  persistSettings();
  const provider = settingsElements.provider.value;
  const payload = {
    provider,
    apiKey: settingsElements.apiKey.value.trim(),
    model: settingsElements.model.value.trim(),
    baseUrl: settingsElements.baseUrl.value.trim()
  };

  document.getElementById("generate-exam").disabled = true;
  document.getElementById("generate-exam").textContent = "Generating...";
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
    state.exam = result;
    restartExam(false);
    toast(`New ${provider === "gemini" ? "Gemini" : "OpenAI-compatible"} practice set loaded.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    document.getElementById("generate-exam").disabled = false;
    document.getElementById("generate-exam").textContent = "Generate New Set";
  }
}

function restartExam(resetTab = true) {
  state.answers = { task1: {}, task2: {}, task3: {}, task4: [...state.exam.task4.scrambledOrder] };
  state.selectedScript = "Select a question script below, then press play.";
  state.selectedCardId = null;
  buildTimeline();
  stopAllAudio();
  if (resetTab) {
    state.activeTab = "task1";
  }
  recalculateScore();
  updateTranscript();
  renderTabs();
  renderPanels();
}

function loadVoices() {
  if (!("speechSynthesis" in window)) {
    return;
  }
  state.voices = window.speechSynthesis.getVoices();
  const select = document.getElementById("voice-select");
  const previous = select.value;
  select.innerHTML = "";
  const usableVoices = state.voices.length ? state.voices : [{ name: "Default browser voice" }];
  usableVoices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = voice.name;
    select.appendChild(option);
  });
  if (previous && usableVoices.some((voice) => voice.name === previous)) {
    select.value = previous;
  }
}

function setSettingsOpen(isOpen) {
  const drawer = document.getElementById("settings-drawer");
  drawer.classList.toggle("open", isOpen);
  drawer.setAttribute("aria-hidden", String(!isOpen));
}

function persistSettings() {
  state.settings = {
    provider: settingsElements.provider.value,
    apiKey: settingsElements.apiKey.value,
    model: settingsElements.model.value,
    baseUrl: settingsElements.baseUrl.value
  };
  localStorage.setItem("mept-settings", JSON.stringify(state.settings));
  refreshProviderSummary();
}

function loadSettings() {
  const stored = localStorage.getItem("mept-settings");
  if (!stored) {
    return;
  }
  try {
    state.settings = { ...state.settings, ...JSON.parse(stored) };
  } catch {
    localStorage.removeItem("mept-settings");
  }
}

function hydrateSettingsUi() {
  settingsElements.provider.value = state.settings.provider || "gemini";
  settingsElements.apiKey.value = state.settings.apiKey || "";
  settingsElements.model.value = state.settings.model || "";
  settingsElements.baseUrl.value = state.settings.baseUrl || "";
  updateVolumeLabel();
  refreshProviderSummary();
}

function toast(message, isError = false) {
  const toastNode = document.getElementById("toast");
  toastNode.textContent = message;
  toastNode.className = `toast${isError ? " status-danger" : ""}`;
  window.clearTimeout(toastNode._timer);
  toastNode._timer = window.setTimeout(() => {
    toastNode.className = "toast hidden";
  }, 2600);
}

function gradeFromPercent(percent) {
  if (percent >= 90) return "GRADE - A";
  if (percent >= 60) return "GRADE - B";
  return "GRADE - C";
}

function statusText(percent) {
  if (percent >= 90) return "Passed with Credit";
  if (percent >= 60) return "Passed Satisfactorily";
  return "Failed (Retry assessment)";
}

function statusClass(percent) {
  if (percent >= 90) return "status-success";
  if (percent >= 60) return "status-warn";
  return "status-danger";
}

function makeOrderBadge(value) {
  const badge = document.createElement("div");
  badge.className = "order-badge";
  badge.textContent = value;
  return badge;
}

function sectionStack() {
  const section = document.createElement("section");
  section.className = "task-stack";
  return section;
}

function refreshProviderSummary() {
  const provider = settingsElements.provider.value;
  const model = settingsElements.model.value.trim() || (provider === "gemini" ? "server default Gemini model" : "server default OpenAI-compatible model");
  const baseUrl = settingsElements.baseUrl.value.trim();
  document.getElementById("provider-summary").textContent = provider === "gemini"
    ? `Provider: Gemini. Model: ${model}. Exam generation follows the Gemini route and playback stays local in the browser.`
    : `Provider: OpenAI-compatible. Model: ${model}. ${baseUrl ? `Base URL: ${baseUrl}. ` : ""}Exam generation uses the server proxy and playback stays local in the browser.`;
  document.getElementById("base-url-row").style.display = provider === "openai" ? "grid" : "none";
}
