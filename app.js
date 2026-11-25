const state = {
  scriptures: [],
  filtered: [],
  selectedId: null,
  selectedTag: "전체",
  selectedCategory: "all",
  query: "",
  // TTS state
  voices: [],
  selectedVoiceURI: "",
  rate: 0.9,
  pitch: 0.95,
  pauseMs: 350,
  repeatTarget: 1,
  currentRepeat: 1,
  chunkIndex: 0,
  isPlaying: false,
  isPaused: false,
  autoScroll: true,
  pauseTimer: null,
  utteranceSeq: 0,
};

const els = {
  workspace: document.querySelector(".workspace"),
  tabFinderBtn: document.getElementById("tab-finder-btn"),
  tabReaderBtn: document.getElementById("tab-reader-btn"),
  mobileBackBtn: document.getElementById("mobile-back-btn"),
  searchInput: document.getElementById("search-input"),
  categorySelect: document.getElementById("category-select"),
  tagList: document.getElementById("tag-list"),
  resultsCount: document.getElementById("results-count"),
  scriptureList: document.getElementById("scripture-list"),
  activePart: document.getElementById("active-part"),
  activeCategory: document.getElementById("active-category"),
  activeTitle: document.getElementById("active-title"),
  activeDesc: document.getElementById("active-desc"),
  scriptureBody: document.getElementById("scripture-body"),
  playPauseBtn: document.getElementById("play-pause-btn"),
  playBtnLabel: document.getElementById("play-btn-label"),
  iconPlay: document.getElementById("icon-play"),
  iconPause: document.getElementById("icon-pause"),
  stopBtn: document.getElementById("stop-btn"),
  prevChunkBtn: document.getElementById("prev-chunk-btn"),
  nextChunkBtn: document.getElementById("next-chunk-btn"),
  rateSlider: document.getElementById("rate-slider"),
  rateValue: document.getElementById("rate-value"),
  repeatSelect: document.getElementById("repeat-select"),
  fontSizeSelect: document.getElementById("font-size-select"),
  progressText: document.getElementById("progress-text"),
  reciteProgress: document.getElementById("recite-progress"),
  ttsWarning: document.getElementById("tts-warning"),
  liveStatus: document.getElementById("live-status"),
  openSettingsBtn: document.getElementById("open-settings-btn"),
  closeSettingsBtn: document.getElementById("close-settings-btn"),
  settingsDialog: document.getElementById("settings-dialog"),
  voiceSelect: document.getElementById("voice-select"),
  pitchSlider: document.getElementById("pitch-slider"),
  pitchValue: document.getElementById("pitch-value"),
  pauseSlider: document.getElementById("pause-slider"),
  pauseValue: document.getElementById("pause-value"),
  autoScrollCheck: document.getElementById("autoscroll-check"),
};

function announce(msg) {
  els.liveStatus.textContent = msg;
}

function getActiveScripture() {
  return state.scriptures.find((s) => s.id === state.selectedId) || null;
}

async function init() {
  initThemeControls();
  initTTSVoices();
  bindEvents();

  try {
    const res = await fetch("./data/gyeongmun.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.scriptures = data.scriptures || [];
    populateFilters();
    applyFilters();
    if (state.filtered.length > 0) {
      selectScripture(state.filtered[0].id, false);
    }
  } catch (err) {
    els.scriptureBody.innerHTML = `<p class="empty-state">경문 데이터를 불러오지 못했습니다. (${err.message})</p>`;
  }
}

function populateFilters() {
  const categories = [...new Set(state.scriptures.map((s) => s.category))];
  for (const cat of categories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    els.categorySelect.appendChild(opt);
  }

  const tagCounts = new Map();
  for (const s of state.scriptures) {
    for (const t of s.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }

  const tags = ["전체", ...tagCounts.keys()];
  els.tagList.innerHTML = "";
  for (const tag of tags) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag-btn";
    btn.textContent = tag === "전체" ? `전체 (${state.scriptures.length})` : `${tag} (${tagCounts.get(tag)})`;
    btn.setAttribute("aria-pressed", String(tag === state.selectedTag));
    btn.addEventListener("click", () => {
      state.selectedTag = tag;
      for (const b of els.tagList.querySelectorAll(".tag-btn")) {
        b.setAttribute("aria-pressed", String(b === btn));
      }
      applyFilters();
    });
    els.tagList.appendChild(btn);
  }
}

function scoreMatch(item, tokens) {
  if (tokens.length === 0) return 1;
  const title = item.title.toLowerCase();
  const desc = item.description.toLowerCase();
  const cat = item.category.toLowerCase();
  const tags = item.tags.join(" ").toLowerCase();
  const body = item.paragraphs.join(" ").toLowerCase();

  let total = 0;
  for (const tok of tokens) {
    let s = 0;
    if (title.includes(tok)) s += 10;
    if (desc.includes(tok)) s += 6;
    if (tags.includes(tok) || cat.includes(tok)) s += 4;
    if (body.includes(tok)) s += 1;
    if (s === 0) return 0; // Require all tokens to match somewhere
    total += s;
  }
  return total;
}

function applyFilters() {
  const q = state.query.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

  const matched = [];
  for (const s of state.scriptures) {
    if (state.selectedCategory !== "all" && s.category !== state.selectedCategory) continue;
    if (state.selectedTag !== "전체" && !s.tags.includes(state.selectedTag)) continue;
    const score = scoreMatch(s, tokens);
    if (score > 0) {
      matched.push({ item: s, score });
    }
  }

  if (tokens.length > 0) {
    matched.sort((a, b) => b.score - a.score);
  }

  state.filtered = matched.map((m) => m.item);
  renderList();
  announce(`${state.filtered.length}편의 경문이 검색되었습니다.`);
}

function renderList() {
  els.resultsCount.textContent = `${state.filtered.length}편`;
  els.scriptureList.innerHTML = "";

  if (state.filtered.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<p class="empty-state">조건에 맞는 경문이 없습니다. 검색어나 태그를 바꿔보세요.</p>`;
    els.scriptureList.appendChild(li);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const s of state.filtered) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scripture-item-btn";
    btn.dataset.id = s.id;
    if (s.id === state.selectedId) {
      btn.setAttribute("aria-current", "true");
    }

    const top = document.createElement("div");
    top.className = "item-top";

    const title = document.createElement("span");
    title.className = "item-title";
    title.textContent = s.title;

    const cat = document.createElement("span");
    cat.className = "item-cat";
    cat.textContent = s.category;

    top.append(title, cat);
    btn.appendChild(top);

    if (s.description) {
      const desc = document.createElement("span");
      desc.className = "item-desc";
      desc.textContent = s.description;
      btn.appendChild(desc);
    }

    btn.addEventListener("click", () => selectScripture(s.id, true));
    li.appendChild(btn);
    frag.appendChild(li);
  }
  els.scriptureList.appendChild(frag);
}

function selectScripture(id, userInitiated) {
  stopTTS();
  state.selectedId = id;
  state.chunkIndex = 0;
  state.currentRepeat = 1;

  for (const btn of els.scriptureList.querySelectorAll(".scripture-item-btn")) {
    if (btn.dataset.id === id) {
      btn.setAttribute("aria-current", "true");
    } else {
      btn.removeAttribute("aria-current");
    }
  }

  const s = getActiveScripture();
  if (!s) return;

  els.activePart.textContent = s.part;
  els.activeCategory.textContent = s.category;
  els.activeTitle.textContent = s.title;
  els.activeDesc.textContent = s.description || "설명 없음";

  els.scriptureBody.innerHTML = "";
  const frag = document.createDocumentFragment();
  s.chunks.forEach((text, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chunk-btn";
    btn.dataset.index = String(idx);
    btn.textContent = text;
    btn.addEventListener("click", () => {
      state.chunkIndex = idx;
      state.currentRepeat = 1;
      startTTS();
    });
    frag.appendChild(btn);
  });
  els.scriptureBody.appendChild(frag);

  updatePlayerUI();
  if (userInitiated) {
    setMobileView("reader");
    window.scrollTo({ top: 0, behavior: "smooth" });
    announce(`${s.title} 선택됨. 총 ${s.chunks.length}개 구절.`);
  }
}

function setMobileView(view) {
  if (!els.workspace) return;
  els.workspace.dataset.mobileView = view;
  const isFinder = view === "finder";
  els.tabFinderBtn?.setAttribute("aria-pressed", String(isFinder));
  els.tabReaderBtn?.setAttribute("aria-pressed", String(!isFinder));
}

/* ================= TTS Engine (Web Speech API) ================= */
function initTTSVoices() {
  if (!("speechSynthesis" in window)) {
    els.ttsWarning.hidden = false;
    els.ttsWarning.textContent = "이 브라우저는 Web Speech API 음성 합성을 지원하지 않습니다.";
    return;
  }

  const load = () => {
    const all = window.speechSynthesis.getVoices();
    const ko = all.filter((v) => v.lang.toLowerCase().startsWith("ko"));
    state.voices = ko.length > 0 ? ko : all;

    els.voiceSelect.innerHTML = "";
    if (state.voices.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "기본 시스템 음성";
      els.voiceSelect.appendChild(opt);
      return;
    }

    for (const v of state.voices) {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      els.voiceSelect.appendChild(opt);
    }

    if (!state.selectedVoiceURI && state.voices.length > 0) {
      const preferred = state.voices.find((v) => v.default) || state.voices[0];
      state.selectedVoiceURI = preferred.voiceURI;
      els.voiceSelect.value = preferred.voiceURI;
    }
  };

  load();
  window.speechSynthesis.onvoiceschanged = load;
}

function clearPauseTimer() {
  if (state.pauseTimer !== null) {
    clearTimeout(state.pauseTimer);
    state.pauseTimer = null;
  }
}

function startTTS() {
  const s = getActiveScripture();
  if (!s || s.chunks.length === 0) return;
  if (!("speechSynthesis" in window)) return;

  clearPauseTimer();
  window.speechSynthesis.cancel();
  state.isPlaying = true;
  state.isPaused = false;
  speakCurrentChunk();
  updatePlayerUI();
}

function speakCurrentChunk() {
  const s = getActiveScripture();
  if (!s || !state.isPlaying || state.isPaused) return;

  if (state.chunkIndex >= s.chunks.length) {
    const target = state.repeatTarget;
    if (target === 0 || state.currentRepeat < target) {
      state.currentRepeat += 1;
      state.chunkIndex = 0;
    } else {
      stopTTS();
      announce(`${s.title} 암송이 완료되었습니다.`);
      return;
    }
  }

  highlightChunk(state.chunkIndex);
  updatePlayerUI();

  const text = s.chunks[state.chunkIndex];
  const seq = ++state.utteranceSeq;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ko-KR";
  utter.rate = state.rate;
  utter.pitch = state.pitch;

  const voice = state.voices.find((v) => v.voiceURI === state.selectedVoiceURI);
  if (voice) utter.voice = voice;

  utter.onend = () => {
    if (seq !== state.utteranceSeq || !state.isPlaying || state.isPaused) return;
    state.chunkIndex += 1;
    if (state.pauseMs > 0) {
      state.pauseTimer = setTimeout(() => {
        state.pauseTimer = null;
        speakCurrentChunk();
      }, state.pauseMs);
    } else {
      speakCurrentChunk();
    }
  };

  utter.onerror = (e) => {
    if (seq !== state.utteranceSeq) return;
    if (e.error === "interrupted" || e.error === "canceled") return;
    els.ttsWarning.hidden = false;
    els.ttsWarning.textContent = `음성 재생 중 오류가 발생했습니다: ${e.error}`;
    stopTTS();
  };

  window.speechSynthesis.speak(utter);
}

function togglePlayPause() {
  const s = getActiveScripture();
  if (!s) return;

  if (!state.isPlaying) {
    startTTS();
    return;
  }

  if (state.isPaused) {
    state.isPaused = false;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else {
      speakCurrentChunk();
    }
  } else {
    state.isPaused = true;
    clearPauseTimer();
    window.speechSynthesis.pause();
  }
  updatePlayerUI();
}

function stopTTS() {
  state.utteranceSeq += 1;
  clearPauseTimer();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  state.isPlaying = false;
  state.isPaused = false;
  state.chunkIndex = 0;
  state.currentRepeat = 1;
  highlightChunk(-1);
  updatePlayerUI();
}

function jumpChunk(delta) {
  const s = getActiveScripture();
  if (!s) return;
  const nextIdx = Math.max(0, Math.min(s.chunks.length - 1, state.chunkIndex + delta));
  state.chunkIndex = nextIdx;
  if (state.isPlaying && !state.isPaused) {
    startTTS();
  } else {
    highlightChunk(nextIdx);
    updatePlayerUI();
  }
}

function highlightChunk(index) {
  const buttons = els.scriptureBody.querySelectorAll(".chunk-btn");
  buttons.forEach((btn, i) => {
    const active = i === index;
    btn.classList.toggle("is-active", active);
    if (active && state.autoScroll) {
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

function updatePlayerUI() {
  const s = getActiveScripture();
  const hasScripture = Boolean(s && s.chunks.length > 0);
  const ttsSupported = "speechSynthesis" in window;

  els.playPauseBtn.disabled = !hasScripture || !ttsSupported;
  els.stopBtn.disabled = !state.isPlaying;
  els.prevChunkBtn.disabled = !hasScripture || state.chunkIndex <= 0;
  els.nextChunkBtn.disabled = !hasScripture || (s && state.chunkIndex >= s.chunks.length - 1);

  if (state.isPlaying && !state.isPaused) {
    els.playBtnLabel.textContent = "일시정지";
    els.iconPlay.hidden = true;
    els.iconPause.hidden = false;
  } else if (state.isPlaying && state.isPaused) {
    els.playBtnLabel.textContent = "이어서 암송";
    els.iconPlay.hidden = false;
    els.iconPause.hidden = true;
  } else {
    els.playBtnLabel.textContent = "암송 시작";
    els.iconPlay.hidden = false;
    els.iconPause.hidden = true;
  }

  if (!hasScripture) {
    els.progressText.textContent = "대기 중";
    els.reciteProgress.value = 0;
    return;
  }

  const total = s.chunks.length;
  const current = Math.min(state.chunkIndex + 1, total);
  const pct = state.isPlaying ? Math.round((current / total) * 100) : 0;
  const repeatLabel =
    state.repeatTarget === 0
      ? `무한 (${state.currentRepeat}회차)`
      : `${state.currentRepeat}/${state.repeatTarget}회`;

  els.progressText.textContent = state.isPlaying
    ? `${current} / ${total} 구절 · ${repeatLabel}`
    : `총 ${total}구절 · 대기 중`;
  els.reciteProgress.value = pct;
}

/* ================= Theme Override ================= */
function initThemeControls() {
  const meta = document.querySelector('meta[name="color-scheme"]');
  const radios = document.querySelectorAll('input[name="theme"]');

  const syncRadios = () => {
    const val = meta.content;
    for (const r of radios) {
      r.checked = r.value === val;
    }
  };
  syncRadios();

  for (const r of radios) {
    r.addEventListener("change", () => {
      if (!r.checked) return;
      meta.content = r.value;
      try {
        if (r.value === "light dark") {
          localStorage.removeItem("color-scheme");
        } else {
          localStorage.setItem("color-scheme", r.value);
        }
      } catch (_) {}
    });
  }

  window.addEventListener("storage", (e) => {
    if (e.key === "color-scheme") {
      meta.content = e.newValue === "light" || e.newValue === "dark" ? e.newValue : "light dark";
      syncRadios();
    }
  });
}

/* ================= Events ================= */
function bindEvents() {
  let debounceTimer = null;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.query = els.searchInput.value;
      applyFilters();
    }, 150);
  });

  for (const chip of document.querySelectorAll(".chip-sm[data-keyword]")) {
    chip.addEventListener("click", () => {
      const kw = chip.dataset.keyword;
      els.searchInput.value = kw;
      state.query = kw;
      applyFilters();
    });
  }

  els.categorySelect.addEventListener("change", () => {
    state.selectedCategory = els.categorySelect.value;
    applyFilters();
  });

  els.tabFinderBtn?.addEventListener("click", () => {
    setMobileView("finder");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  els.tabReaderBtn?.addEventListener("click", () => {
    setMobileView("reader");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  els.mobileBackBtn?.addEventListener("click", () => {
    setMobileView("finder");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  els.playPauseBtn.addEventListener("click", togglePlayPause);
  els.stopBtn.addEventListener("click", stopTTS);
  els.prevChunkBtn.addEventListener("click", () => jumpChunk(-1));
  els.nextChunkBtn.addEventListener("click", () => jumpChunk(1));

  els.rateSlider.addEventListener("input", () => {
    state.rate = parseFloat(els.rateSlider.value);
    els.rateValue.textContent = `${state.rate.toFixed(2).replace(/\.00$/, "")}x`;
    if (state.isPlaying && !state.isPaused) {
      startTTS();
    }
  });

  els.repeatSelect.addEventListener("change", () => {
    state.repeatTarget = parseInt(els.repeatSelect.value, 10);
    updatePlayerUI();
  });

  els.fontSizeSelect.addEventListener("change", () => {
    els.scriptureBody.classList.remove("size-md", "size-lg", "size-xl");
    els.scriptureBody.classList.add(`size-${els.fontSizeSelect.value}`);
  });

  els.openSettingsBtn.addEventListener("click", () => {
    els.settingsDialog.showModal();
  });

  els.closeSettingsBtn.addEventListener("click", () => {
    els.settingsDialog.close();
  });

  els.voiceSelect.addEventListener("change", () => {
    state.selectedVoiceURI = els.voiceSelect.value;
    if (state.isPlaying && !state.isPaused) startTTS();
  });

  els.pitchSlider.addEventListener("input", () => {
    state.pitch = parseFloat(els.pitchSlider.value);
    els.pitchValue.textContent = state.pitch.toFixed(2);
    if (state.isPlaying && !state.isPaused) startTTS();
  });

  els.pauseSlider.addEventListener("input", () => {
    state.pauseMs = parseInt(els.pauseSlider.value, 10);
    els.pauseValue.textContent = `${state.pauseMs}ms`;
  });

  els.autoScrollCheck.addEventListener("change", () => {
    state.autoScroll = els.autoScrollCheck.checked;
  });

  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (els.settingsDialog.open) return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      jumpChunk(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      jumpChunk(1);
    }
  });
}

init();
