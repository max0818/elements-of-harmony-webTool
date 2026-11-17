const state = {
  sessionId: null,
  duration: 0,
  bpm: 0,
  events: [],
  env: [],
  envTimes: [],
  selectedIdx: null,
  currentTime: 0,
  configFilename: "config.txt",
  rawEvents: [],
  isBusy: false,   // ← блокировка загрузки
};

const $ = (id) => document.getElementById(id);

/* ---------- Loading UI ---------- */
function showLoading(text = "Конвертация в OGG…", sub = "Пожалуйста, подожди") {
  $("loadingText").textContent = text;
  $("loadingSub").textContent = sub;
  $("progressFill").style.width = "15%";
  $("loadingOverlay").classList.remove("hidden");
}
function setProgress(pct, text, sub) {
  $("progressFill").style.width = pct + "%";
  if (text) $("loadingText").textContent = text;
  if (sub) $("loadingSub").textContent = sub;
}
function hideLoading() {
  $("progressFill").style.width = "100%";
  setTimeout(() => {
    $("loadingOverlay").classList.add("hidden");
    $("progressFill").style.width = "0%";
  }, 250);
}

/* ---------- Score selects ---------- */
function buildScoreOptions() {
  const values = [];
  for (let v = 10; v <= 90; v += 10) values.push(v);
  const sel1 = $("score1"), sel2 = $("score2"), sel3 = $("score3");
  const prev1 = sel1.value || "50", prev2 = sel2.value || "70", prev3 = sel3.value || "90";

  function fill(sel, allowed, keep) {
    sel.innerHTML = "";
    allowed.forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = v + "%";
      sel.appendChild(o);
    });
    if (allowed.includes(Number(keep))) sel.value = keep;
    else sel.value = allowed[Math.min(allowed.length - 1, Math.floor(allowed.length / 2))];
  }

  fill(sel1, values.filter(v => v <= 70), prev1);
  const v1 = Number(sel1.value);
  fill(sel2, values.filter(v => v > v1 && v <= 80), prev2);
  const v2 = Number(sel2.value);
  fill(sel3, values.filter(v => v > v2), prev3);

  [sel1, sel2, sel3].forEach(s => s.onchange = () => { buildScoreOptions(); updateConfigPreview(); });
}

/* ---------- Upload ---------- */
async function uploadFile(file) {
  if (!file || state.isBusy) return;   // ← блокировка
  state.isBusy = true;
  $("uploadStatus").textContent = "";
  showLoading("Конвертация в OGG…", "Идёт подготовка файла");
  setProgress(20, "Конвертация в OGG…", "ffmpeg работает");

  const fd = new FormData();
  fd.append("file", file);

  // имитация прогресса, пока сервер работает
  let prog = 20;
  const progTimer = setInterval(() => {
    prog = Math.min(85, prog + Math.random() * 6);
    setProgress(prog);
    if (prog > 50) setProgress(prog, "Анализ аудио…", "librosa ищет удары");
  }, 400);

  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    clearInterval(progTimer);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      hideLoading();
      $("uploadStatus").textContent = "Ошибка: " + (err.error || res.statusText);
      state.isBusy = false;
      return;
    }
    setProgress(100, "Готово!", "Открываю редактор");
    const data = await res.json();
    setTimeout(() => {
      hideLoading();
      applyUploadedData(data);
      state.isBusy = false;
    }, 350);
  } catch (e) {
    clearInterval(progTimer);
    hideLoading();
    $("uploadStatus").textContent = "Сетевая ошибка: " + e.message;
    state.isBusy = false;
  }
}

function applyUploadedData(data) {
  state.sessionId = data.session_id;
  state.configFilename = data.config_filename;
  state.duration = data.analysis.duration;
  state.bpm = data.analysis.bpm;
  state.env = data.analysis.env;
  state.envTimes = data.analysis.env_times;
  state.rawEvents = data.analysis.events.map(ev => ({ ...ev, isHold: false, partner: null }));

  $("title").value = data.title;
  $("author").value = data.author;
  $("bpm").value = data.analysis.bpm.toFixed(2);
  $("endAt").value = formatTime(data.analysis.duration);
  $("trackInfo").textContent = "Файл: " + state.configFilename.replace(/\.txt$/, "");
  $("audio").src = data.audio_url + "?t=" + Date.now();
  $("downloadOggBtn").href = data.download_ogg_url;

  $("startScreen").classList.add("hidden");
  $("mainScreen").classList.remove("hidden");
  $("uploadStatus").textContent = "";

  applyFilters();
  draw();
  updateConfigPreview();
  buildScoreOptions();
}

/* ---------- Drag & drop overlay ---------- */
let dragCounter = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  if (state.isBusy) return;
  dragCounter++;
  if (dragCounter === 1) $("dropOverlay").classList.remove("hidden");
});
window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (state.isBusy) return;
  dragCounter--;
  if (dragCounter === 0) $("dropOverlay").classList.add("hidden");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  $("dropOverlay").classList.add("hidden");
  if (state.isBusy) return;
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

$("dropZone").addEventListener("dragover", (e) => {
  e.preventDefault();
  if (state.isBusy) return;
  $("dropZone").classList.add("dragover");
});
$("dropZone").addEventListener("dragleave", () => $("dropZone").classList.remove("dragover"));
$("dropZone").addEventListener("drop", (e) => {
  e.preventDefault();
  $("dropZone").classList.remove("dragover");
  if (state.isBusy) return;
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

$("fileInput").addEventListener("change", (e) => {
  if (state.isBusy) return;
  uploadFile(e.target.files[0]);
});

/* ---------- Close track ---------- */
$("closeTrackBtn").addEventListener("click", () => {
  if (state.isBusy) return;
  if (!confirm("Закрыть текущий трек и загрузить другой?")) return;
  state.sessionId = null;
  state.rawEvents = [];
  state.events = [];
  $("audio").pause();
  $("audio").src = "";
  $("mainScreen").classList.add("hidden");
  $("startScreen").classList.remove("hidden");
  $("uploadStatus").textContent = "";
  $("fileInput").value = "";
  state.isBusy = false;
});

/* ---------- Re-analyze ---------- */
$("analyzeBtn").addEventListener("click", async () => {
  if (!state.sessionId || state.isBusy) return;
  state.isBusy = true;
  $("analyzeBtn").disabled = true;
  $("analyzeBtn").textContent = "⏳ Анализирую...";
  try {
    const res = await fetch(`/analyze/${state.sessionId}`, { method: "POST" });
    const data = await res.json();
    state.duration = data.duration;
    state.bpm = data.bpm;
    state.env = data.env;
    state.envTimes = data.env_times;
    state.rawEvents = data.events.map(ev => ({ ...ev, isHold: false, partner: null }));
    $("bpm").value = data.bpm.toFixed(2);
    $("endAt").value = formatTime(data.duration);
    applyFilters();
    draw();
    updateConfigPreview();
  } finally {
    $("analyzeBtn").textContent = "⚙️ Пересчитать";
    $("analyzeBtn").disabled = false;
    state.isBusy = false;
  }
});

/* ---------- Filters ---------- */
function applyFilters() {
  const delta = parseFloat($("delta").value);
  const gap = parseFloat($("gap").value);
  const holdTh = parseFloat($("hold").value);

  let filtered = state.rawEvents.filter(ev => ev.strength >= delta);
  const result = [];
  for (const ev of filtered) {
    if (result.length === 0) { result.push(ev); continue; }
    const last = result[result.length - 1];
    if (ev.time - last.time >= gap) result.push(ev);
    else if (ev.strength > last.strength) result[result.length - 1] = ev;
  }
  result.forEach(ev => { ev.isHold = ev.hold >= holdTh; ev.partner = null; });

  state.events = result;
  state.selectedIdx = null;
  renderEventList();
  $("eventCount").textContent = result.length;
}

["delta", "gap", "hold"].forEach(id => {
  $(id).addEventListener("input", () => {
    $({delta:"deltaVal", gap:"gapVal", hold:"holdVal"}[id]).textContent = $(id).value;
    applyFilters();
    draw();
    updateConfigPreview();
  });
});

/* ---------- Canvas ---------- */
const waveCanvas = $("waveCanvas");
const waveCtx = waveCanvas.getContext("2d");
const evCanvas = $("eventsCanvas");
const evCtx = evCanvas.getContext("2d");

function draw() {
  drawEvents();
  drawWave();
}

function drawEvents() {
  const w = evCanvas.width, h = evCanvas.height;
  evCtx.clearRect(0, 0, w, h);
  evCtx.fillStyle = "rgba(13,17,23,0.8)";
  evCtx.fillRect(0, 0, w, h);
  
  if (!state.events.length) return;
  const totalT = state.duration || 1;

  // Рисуем центральную линию
  evCtx.strokeStyle = "rgba(255,255,255,0.1)";
  evCtx.lineWidth = 1;
  evCtx.beginPath(); evCtx.moveTo(0, h/2); evCtx.lineTo(w, h/2); evCtx.stroke();

  state.events.forEach((ev, idx) => {
    const x = (ev.time / totalT) * w;
    const isSel = idx === state.selectedIdx;
    
    if (ev.isHold) {
      // Желтая линия на всю высоту для холда
      const endT = Math.min(totalT, ev.time + ev.hold);
      const x2 = (endT / totalT) * w;
      evCtx.fillStyle = isSel ? "#ff8c00" : "rgba(227, 179, 65, 0.6)";
      evCtx.fillRect(x, 4, Math.max(2, x2 - x), h - 8);
      // полоски по бокам
      evCtx.fillStyle = isSel ? "#fff" : "#e3b341";
      evCtx.fillRect(x, 0, 1, h);
      evCtx.fillRect(x2, 0, 1, h);
    } else {
      // Одиночный тап - вертикальная линия
      evCtx.fillStyle = isSel ? "#f85149" : "#58a6ff";
      evCtx.fillRect(x, h/2 - 8, 2, 16);
    }
  });

  // Курсор
  if (state.currentTime > 0) {
    const cx = (state.currentTime / totalT) * w;
    evCtx.strokeStyle = "#f85149"; evCtx.lineWidth = 1;
    evCtx.beginPath(); evCtx.moveTo(cx, 0); evCtx.lineTo(cx, h); evCtx.stroke();
  }
}

function drawWave() {
  const w = waveCanvas.width, h = waveCanvas.height;
  waveCtx.clearRect(0, 0, w, h);
  waveCtx.fillStyle = "rgba(13,17,23,0.8)";
  waveCtx.fillRect(0, 0, w, h);
  if (state.env.length === 0) return;

  const midY = h / 2;
  const maxEnv = Math.max(...state.env);
  const totalT = state.envTimes[state.envTimes.length - 1] || 1;

  const grad = waveCtx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#58a6ff");
  grad.addColorStop(0.5, "#1f6feb");
  grad.addColorStop(1, "#58a6ff");
  
  waveCtx.strokeStyle = grad;
  waveCtx.lineWidth = 1.5;
  waveCtx.beginPath();
  
  for (let i = 0; i < state.env.length; i++) {
    const x = (state.envTimes[i] / totalT) * w;
    const amp = (state.env[i] / maxEnv) * (midY - 10);
    if (i === 0) waveCtx.moveTo(x, midY - amp); 
    else waveCtx.lineTo(x, midY - amp);
  }
  for (let i = state.env.length - 1; i >= 0; i--) {
    const x = (state.envTimes[i] / totalT) * w;
    const amp = (state.env[i] / maxEnv) * (midY - 10);
    waveCtx.lineTo(x, midY + amp);
  }
  waveCtx.closePath();
  waveCtx.fillStyle = "rgba(88, 166, 255, 0.15)";
  waveCtx.fill();
  waveCtx.stroke();

  // Курсор
  if (state.currentTime > 0) {
    const cx = (state.currentTime / totalT) * w;
    waveCtx.strokeStyle = "#f85149"; waveCtx.lineWidth = 1.5;
    waveCtx.beginPath(); waveCtx.moveTo(cx, 0); waveCtx.lineTo(cx, h); waveCtx.stroke();
  }
}

/* ---------- Player ---------- */
const audio = $("audio");
audio.volume = 0.3; // Начальная громкость, чтобы не оглушало
$("playBtn").addEventListener("click", () => {
  if (!audio.src) return;
  if (audio.paused) { audio.play(); $("playBtn").textContent = "⏸"; }
  else { audio.pause(); $("playBtn").textContent = "▶"; }
});
audio.addEventListener("timeupdate", () => {
  state.currentTime = audio.currentTime;
  $("timeLabel").textContent = `${formatTime(audio.currentTime)} / ${formatTime(state.duration)}`;
  if (state.duration > 0) $("seek").value = (audio.currentTime / state.duration) * 1000;
  draw();
});
audio.addEventListener("ended", () => { $("playBtn").textContent = "▶"; });
$("seek").addEventListener("input", () => {
  if (state.duration > 0) audio.currentTime = (Number($("seek").value) / 1000) * state.duration;
});
$("volume").addEventListener("input", (e) => {
  audio.volume = parseFloat(e.target.value);
});

/* ---------- Event list ---------- */
function renderEventList() {
  const list = $("eventList");
  list.innerHTML = "";
  state.events.forEach((ev, idx) => {
    const div = document.createElement("div");
    div.className = "event-item " + (ev.isHold ? "hold" : "tap");
    if (idx === state.selectedIdx) div.classList.add("selected");
    div.innerHTML = `<span>${formatTime(ev.time)}</span><span>${ev.isHold ? "HOLD" : "tap"}</span>`;
    div.onclick = () => {
      state.selectedIdx = idx;
      audio.currentTime = ev.time;
      renderEventList();
      draw();
    };
    list.appendChild(div);
  });
}

/* ---------- Config preview ---------- */
function toPunchLines() {
  const lines = [];
  let i = 0;
  while (i < state.events.length) {
    const ev = state.events[i];
    if (ev.isHold) {
      const next = state.events[i + 1];
      let endT;
      if (next && (next.time - ev.time) <= ev.hold + 0.5) {
        endT = next.time;
        lines.push(`${formatTime(ev.time)}, ${formatTime(endT)}`);
        i += 2; continue;
      } else {
        endT = ev.time + ev.hold;
        lines.push(`${formatTime(ev.time)}, ${formatTime(endT)}`);
        i += 1; continue;
      }
    } else {
      lines.push(formatTime(ev.time));
      i += 1;
    }
  }
  return lines;
}

function updateConfigPreview() {
  const s1 = $("score1").value + "%";
  const s2 = $("score2").value + "%";
  const s3 = $("score3").value + "%";
  const punches = toPunchLines().join("\n");
  const text = `[Description]
${$("title").value || "Title"}
${$("author").value || "Author"}

[BPM]
${$("bpm").value || "120"}

[BeginAt]
${$("beginAt").value || "00:00.000"}

[EndAt]
${$("endAt").value || "00:00.000"}

[Speed]
${$("speed").value || "3"}

[Score]
${s1},${s2},${s3}

[PunchOffset]
${$("punchOffset").value || "00:00.000"}

[Punches]
${punches}
`;
  $("configPreview").textContent = text;
}

/* ---------- Download config ---------- */
$("downloadBtn").addEventListener("click", async () => {
  updateConfigPreview();
  const content = $("configPreview").textContent;
  const filename = state.configFilename || (($("title").value || "config").replace(/[^\w\-]+/g, "_") + ".txt");
  const res = await fetch(`/download/${state.sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, filename })
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});

/* ---------- Utils ---------- */
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/* init */
buildScoreOptions();
["title", "author", "bpm", "speed", "beginAt", "punchOffset"].forEach(id => {
  $(id).addEventListener("input", updateConfigPreview);
});