const CATEGORIES = [
  {
    id: "dps",
    title: "ДПС",
    items: [
      { key: "crack", label: "Крякалка", file: "./sounds/DPS/crack.mp3", className: "btn-crack" },
      { key: "siren", label: "Сирена", file: "./sounds/DPS/siren.mp3", className: "btn-siren", loop: true },
      { key: "speed_siren", label: "Быстрая сирена", file: "./sounds/DPS/speed_siren.mp3", className: "btn-speed" },
      { key: "two_siren", label: "Двойная сирена", file: "./sounds/DPS/two_siren.mp3", className: "btn-two" },
      { key: "cracksiren", label: "Кряк-сирена", file: "./sounds/DPS/cracksiren.mp3", className: "btn-cracksiren" },
      { key: "k_obochine", label: "К обочине", file: "./sounds/DPS/k_obochine.mp3", className: "btn-pull-over" },
      { key: "microphone", label: "Микрофон", className: "btn-mic", microphone: true }
    ]
  },
  {
    id: "mems",
    title: "Мемы",
    items: [
      { key: "koch_v1", label: "Коч", file: "./sounds/Mems/koch_v1.mp3", className: "tone-purple", volume: 4 },
      { key: "bratan", label: "Братан", file: "./sounds/Mems/bratan.mp3", className: "tone-pink", volume: 4 },
      { key: "golda", label: "Голда", file: "./sounds/Mems/golda.mp3", className: "tone-indigo", volume: 2.2 },
      { key: "tebe", label: "Тебе", file: "./sounds/Mems/tebe.mp3", className: "tone-teal", volume: 4 },
      { key: "pantera", label: "Пантера", file: "./sounds/Mems/pantera.mp3", className: "tone-panther", volume: 3.5 },
      {
        key: "musor_drop",
        label: "Мусор дроп",
        hint: "Тап / Зажми",
        file: "./sounds/Mems/musor_drop.mp3",
        fullFile: "./sounds/Mems/full_chance_drop.mp3",
        className: "btn-drop tone-gold",
        volume: 3.6,
        dualAction: true
      }
    ]
  },
  {
    id: "gudok",
    title: "Гудки",
    items: [
      { key: "car", label: "Автомобиль", file: "./sounds/Gudok/car.mp3", className: "tone-teal" },
      { key: "fura", label: "Фура", file: "./sounds/Gudok/fura.mp3", className: "tone-slate" },
      { key: "korabel", label: "Корабль", file: "./sounds/Gudok/korabel.mp3", className: "btn-two" },
      { key: "poezd", label: "Поезд", file: "./sounds/Gudok/poezd.mp3", className: "btn-siren" }
    ]
  }
];

const AUDIO_ITEMS = CATEGORIES
  .flatMap(category => category.items)
  .flatMap(item => {
    const list = [];
    if (item.file) list.push({ key: item.key, file: item.file });
    if (item.fullFile) list.push({ key: `${item.key}_full`, file: item.fullFile });
    return list;
  });

const MEM_SOUND_KEYS = new Set(CATEGORIES[1].items.map(item => item.key));
const REPLAY_GATED_KEYS = new Set([
  "speed_siren",
  "two_siren",
  "cracksiren",
  "k_obochine",
  "korabel",
  "fura",
  "poezd"
]);
const REPLAY_UNLOCK_RATIO = 0.65;
const audioBuffers = {};
const activeSoundCounts = new Map();
const lastSoundStartTimes = new Map();

let activeCategoryIndex = 0;
let audioCtx = null;
let masterGainNode = null;
let outputLimiterNode = null;
let volumeMultiplier = 1;
let sirenSourceNode = null;
let sirenGainNode = null;
let isSirenActive = false;
let micStream = null;
let micSourceNode = null;
let micGainNode = null;
let isMicActive = false;

// Dual-action build-up & drop states
let dropPressTimer = null;
let dropPressActive = false;
let dropIsFullPlaying = false;
let fullDropSourceNode = null;
let fullDropGainNode = null;

// Gestures and navigation
let swipeStartX = null;
let swipeStartY = null;
let swipeMoved = false;
let suppressClickUntil = 0;
let microphoneStartTimer = null;
let wheelLocked = false;
let isCategorySwitching = false;

const categoryBrowser = document.getElementById("categoryBrowser");
const gestureSurface = document.body;
const categoryTitle = document.getElementById("categoryTitle");
const categoryDots = document.getElementById("categoryDots");
const categoryContent = document.getElementById("categoryContent");
const buttonsGrid = document.getElementById("buttonsGrid");
const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const loadError = document.getElementById("loadError");

function getCurrentCategory() {
  return CATEGORIES[activeCategoryIndex];
}

function getItemByKey(key) {
  return CATEGORIES.flatMap(category => category.items).find(item => item.key === key);
}

function getSoundButton(key) {
  return buttonsGrid.querySelector(`[data-sound-key="${key}"]`);
}

function renderCategory(direction = 1, animate = false) {
  const category = getCurrentCategory();
  const outgoingGrid = animate ? buttonsGrid.cloneNode(true) : null;
  const outgoingHeight = animate ? buttonsGrid.offsetHeight : 0;

  categoryTitle.textContent = category.title;
  buttonsGrid.setAttribute("aria-label", `Звуки категории ${category.title}`);
  buttonsGrid.innerHTML = category.items.map((item, index) => {
    const isActive = item.key === "siren"
      ? isSirenActive
      : item.microphone
        ? isMicActive
        : (activeSoundCounts.get(item.key) || 0) > 0;
    const pressed = item.loop || item.microphone ? ` aria-pressed="${isActive}"` : "";
    const dualAttr = item.dualAction ? ' data-dual-action="true"' : "";
    const micAttr = item.microphone ? ' data-microphone="true"' : "";
    const hintBadge = item.hint ? `<span class="btn-hint-badge">${item.hint}</span>` : "";
    const chargeBar = item.dualAction ? `<span class="charge-bar" aria-hidden="true"></span>` : "";

    return `
      <button
        class="sound-btn ${item.className}${isActive ? " active" : ""}"
        type="button"
        data-sound-key="${item.key}"
        ${micAttr}
        ${dualAttr}
        ${pressed}
      >
        <span class="btn-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="btn-label">${item.label}</span>
        ${hintBadge}
        ${chargeBar}
      </button>
    `;
  }).join("");

  categoryDots.innerHTML = CATEGORIES.map((_, index) =>
    `<span class="category-dot${index === activeCategoryIndex ? " active" : ""}"></span>`
  ).join("");

  if (!animate || !outgoingGrid) return;

  const incomingHeight = buttonsGrid.offsetHeight;
  categoryContent.style.height = `${Math.max(outgoingHeight, incomingHeight)}px`;

  outgoingGrid.removeAttribute("id");
  outgoingGrid.setAttribute("aria-hidden", "true");
  outgoingGrid.classList.add(
    "category-outgoing",
    direction > 0 ? "slide-out-left" : "slide-out-right"
  );
  buttonsGrid.classList.add(
    "category-incoming",
    direction > 0 ? "slide-in-right" : "slide-in-left"
  );
  categoryTitle.classList.add(direction > 0 ? "title-in-right" : "title-in-left");
  categoryContent.append(outgoingGrid);

  setTimeout(() => {
    outgoingGrid.remove();
    buttonsGrid.classList.remove("category-incoming", "slide-in-right", "slide-in-left");
    categoryTitle.classList.remove("title-in-right", "title-in-left");
    categoryContent.style.height = "";
    isCategorySwitching = false;
  }, 340);
}

function switchCategory(direction) {
  if (isCategorySwitching) return;
  isCategorySwitching = true;
  activeCategoryIndex = (
    activeCategoryIndex + direction + CATEGORIES.length
  ) % CATEGORIES.length;
  renderCategory(direction, true);
}

function initAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = volumeMultiplier;

    outputLimiterNode = audioCtx.createDynamicsCompressor();
    outputLimiterNode.threshold.value = -2.5;
    outputLimiterNode.knee.value = 6;
    outputLimiterNode.ratio.value = 12;
    outputLimiterNode.attack.value = 0.002;
    outputLimiterNode.release.value = 0.15;

    masterGainNode.connect(outputLimiterNode);
    outputLimiterNode.connect(audioCtx.destination);
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function setMasterVolume(percent) {
  volumeMultiplier = percent / 100;
  volumeValue.value = `${percent}%`;
  volumeValue.textContent = `${percent}%`;
  volumeSlider.setAttribute("aria-valuetext", `${percent} процентов`);
  volumeSlider.style.setProperty("--progress", `${((percent - 1) / 499) * 100}%`);

  if (masterGainNode && audioCtx) {
    const now = audioCtx.currentTime;
    masterGainNode.gain.cancelScheduledValues(now);
    masterGainNode.gain.setTargetAtTime(volumeMultiplier, now, 0.015);
  }
}

async function preloadAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const tempCtx = new AudioContextClass();

  try {
    await Promise.all(AUDIO_ITEMS.map(async item => {
      const response = await fetch(item.file);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${item.file}`);
      audioBuffers[item.key] = await tempCtx.decodeAudioData(await response.arrayBuffer());
    }));
  } catch (error) {
    console.error(error);
    loadError.style.display = "block";
  } finally {
    try { await tempCtx.close(); } catch {}
  }
}

function updateSoundButton(key) {
  const button = getSoundButton(key);
  if (!button) return;

  const active = key === "siren"
    ? isSirenActive
    : (activeSoundCounts.get(key) || 0) > 0;
  button.classList.toggle("active", active);
  if (key === "siren") button.setAttribute("aria-pressed", String(active));
}

function triggerPadHitAnimation(key) {
  const button = getSoundButton(key);
  if (!button) return;
  button.classList.remove("pad-hit");
  void button.offsetWidth;
  button.classList.add("pad-hit");
  if (navigator.vibrate) {
    try { navigator.vibrate(12); } catch {}
  }
}

function playOneShot(item, options = {}) {
  if (!audioCtx || !audioBuffers[item.key]) return;

  const now = audioCtx.currentTime;
  const duration = audioBuffers[item.key].duration;

  if (REPLAY_GATED_KEYS.has(item.key) && !options.force) {
    const lastStartedAt = lastSoundStartTimes.get(item.key);
    if (
      lastStartedAt !== undefined
      && now - lastStartedAt < duration * REPLAY_UNLOCK_RATIO
    ) {
      return;
    }
    lastSoundStartTimes.set(item.key, now);
  }

  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();
  const fadeIn = 0.008;
  const fadeOut = MEM_SOUND_KEYS.has(item.key) ? 0.09 : 0.18;
  const boost = options.boostVolume || 1;
  const targetVolume = (item.volume || 1) * boost;

  source.buffer = audioBuffers[item.key];
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(targetVolume, now + fadeIn);
  if (duration > fadeIn + fadeOut) {
    gainNode.gain.setValueAtTime(targetVolume, now + duration - fadeOut);
    gainNode.gain.linearRampToValueAtTime(0.0001, now + duration);
  }

  source.connect(gainNode);
  gainNode.connect(masterGainNode);

  activeSoundCounts.set(item.key, (activeSoundCounts.get(item.key) || 0) + 1);
  updateSoundButton(item.key);
  triggerPadHitAnimation(item.key);

  source.onended = () => {
    try { source.disconnect(); } catch {}
    try { gainNode.disconnect(); } catch {}
    activeSoundCounts.set(item.key, Math.max(0, (activeSoundCounts.get(item.key) || 1) - 1));
    updateSoundButton(item.key);
  };
  source.start(now);
  return source;
}

function toggleSiren() {
  if (!audioBuffers.siren) return;

  if (isSirenActive) {
    if (sirenSourceNode && sirenGainNode) {
      const now = audioCtx.currentTime;
      const sourceToStop = sirenSourceNode;
      const gainToDisconnect = sirenGainNode;
      gainToDisconnect.gain.cancelScheduledValues(now);
      gainToDisconnect.gain.setValueAtTime(Math.max(gainToDisconnect.gain.value, 0.0001), now);
      gainToDisconnect.gain.linearRampToValueAtTime(0.0001, now + 0.2);
      try { sourceToStop.stop(now + 0.2); } catch {}
      setTimeout(() => {
        try { sourceToStop.disconnect(); } catch {}
        try { gainToDisconnect.disconnect(); } catch {}
      }, 250);
    }
    sirenSourceNode = null;
    sirenGainNode = null;
    isSirenActive = false;
  } else {
    const now = audioCtx.currentTime;
    sirenGainNode = audioCtx.createGain();
    sirenGainNode.gain.setValueAtTime(0.0001, now);
    sirenGainNode.gain.linearRampToValueAtTime(1, now + 0.05);

    sirenSourceNode = audioCtx.createBufferSource();
    sirenSourceNode.buffer = audioBuffers.siren;
    sirenSourceNode.loop = true;
    sirenSourceNode.connect(sirenGainNode);
    sirenGainNode.connect(masterGainNode);
    sirenSourceNode.start(now);
    isSirenActive = true;
  }
  updateSoundButton("siren");
  triggerPadHitAnimation("siren");
}

function triggerSound(key) {
  const item = getItemByKey(key);
  if (!item || item.microphone || item.dualAction) return;
  initAudioContext();
  if (item.loop) toggleSiren();
  else playOneShot(item);
}

// ----------------- DUAL-ACTION FULL DROP LOGIC -----------------
function stopFullDropAudio(fadeDuration = 0.05) {
  if (fullDropSourceNode && fullDropGainNode && audioCtx) {
    const now = audioCtx.currentTime;
    const src = fullDropSourceNode;
    const gn = fullDropGainNode;
    try {
      gn.gain.cancelScheduledValues(now);
      gn.gain.setValueAtTime(Math.max(gn.gain.value, 0.0001), now);
      gn.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
      src.stop(now + fadeDuration);
    } catch {}
    setTimeout(() => {
      try { src.disconnect(); } catch {}
      try { gn.disconnect(); } catch {}
    }, (fadeDuration + 0.05) * 1000);
  }
  fullDropSourceNode = null;
  fullDropGainNode = null;
  dropIsFullPlaying = false;

  const btn = getSoundButton("musor_drop");
  btn?.classList.remove("charging");
}

function startFullDropAudio() {
  if (!audioCtx || !audioBuffers["musor_drop_full"]) return;
  stopFullDropAudio(0.02);

  const now = audioCtx.currentTime;
  fullDropSourceNode = audioCtx.createBufferSource();
  fullDropGainNode = audioCtx.createGain();

  fullDropSourceNode.buffer = audioBuffers["musor_drop_full"];
  fullDropGainNode.gain.setValueAtTime(0.0001, now);
  fullDropGainNode.gain.linearRampToValueAtTime(3.8, now + 0.08);

  fullDropSourceNode.connect(fullDropGainNode);
  fullDropGainNode.connect(masterGainNode);

  dropIsFullPlaying = true;
  const btn = getSoundButton("musor_drop");
  btn?.classList.add("charging");

  if (navigator.vibrate) {
    try { navigator.vibrate([25, 30, 25]); } catch {}
  }

  fullDropSourceNode.onended = () => {
    stopFullDropAudio();
    if (btn) {
      btn.classList.remove("charging", "active", "exploded");
      void btn.offsetWidth;
      btn.classList.add("exploded");
      setTimeout(() => btn.classList.remove("exploded"), 500);
    }
    if (navigator.vibrate) {
      try { navigator.vibrate([40, 50, 80]); } catch {}
    }
  };

  fullDropSourceNode.start(now);
}

function handleDropPressStart(event) {
  if (event && event.type !== "keydown") event.preventDefault();
  initAudioContext();

  dropPressActive = true;
  clearTimeout(dropPressTimer);

  const btn = getSoundButton("musor_drop");
  btn?.classList.add("active");

  dropPressTimer = setTimeout(() => {
    if (!dropPressActive) return;
    startFullDropAudio();
  }, 240);
}

function handleDropPressEnd(event) {
  if (event && event.type !== "keyup") event.preventDefault();
  if (!dropPressActive) return;

  const wasHolding = dropIsFullPlaying;
  clearTimeout(dropPressTimer);
  dropPressTimer = null;
  dropPressActive = false;

  const btn = getSoundButton("musor_drop");
  btn?.classList.remove("active");

  if (!wasHolding) {
    // Быстрый клик/тап: играет обычный короткий мусор дроп!
    const dropItem = getItemByKey("musor_drop");
    if (dropItem) {
      playOneShot(dropItem, { force: true });
    }
  }
}

// ----------------- MICROPHONE LOGIC -----------------
async function startMicrophone(event) {
  event?.preventDefault();
  initAudioContext();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  if (isMicActive) return;

  isMicActive = true;
  const button = getSoundButton("microphone");
  button?.classList.add("active");
  button?.setAttribute("aria-pressed", "true");

  try {
    if (!micStream) {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
    }

    if (!micSourceNode) {
      micSourceNode = audioCtx.createMediaStreamSource(micStream);
      micGainNode = audioCtx.createGain();
      micGainNode.gain.value = 1;
      micSourceNode.connect(micGainNode);
      micGainNode.connect(masterGainNode);
    } else {
      micGainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    }

    micStream.getAudioTracks().forEach(track => { track.enabled = true; });
  } catch (error) {
    console.error("Microphone access error:", error);
    stopMicrophone();
  }
}

function stopMicrophone(event) {
  event?.preventDefault();
  if (!isMicActive) return;
  isMicActive = false;

  if (micGainNode && audioCtx) {
    micGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    micGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  }

  const button = getSoundButton("microphone");
  button?.classList.remove("active");
  button?.setAttribute("aria-pressed", "false");
}

// ----------------- EVENT LISTENERS & MULTI-TOUCH -----------------
buttonsGrid.addEventListener("pointerdown", event => {
  const button = event.target.closest("[data-sound-key]");
  if (!button) return;

  if (button.dataset.dualAction === "true") {
    handleDropPressStart(event);
    return;
  }

  if (button.dataset.microphone === "true") {
    clearTimeout(microphoneStartTimer);
    microphoneStartTimer = setTimeout(() => {
      microphoneStartTimer = null;
      if (!swipeMoved) startMicrophone(event);
    }, 120);
    return;
  }

  triggerSound(button.dataset.soundKey);
});

function cancelMicrophoneStart() {
  clearTimeout(microphoneStartTimer);
  microphoneStartTimer = null;
}

window.addEventListener("pointerup", event => {
  cancelMicrophoneStart();
  stopMicrophone(event);
  handleDropPressEnd(event);
});

window.addEventListener("pointercancel", event => {
  cancelMicrophoneStart();
  stopMicrophone(event);
  handleDropPressEnd(event);
});

function beginSwipe(event) {
  if (event.target.closest?.("input")) return;
  const point = event.touches?.[0] || event;
  swipeStartX = point.clientX;
  swipeStartY = point.clientY;
  swipeMoved = false;
}

function trackSwipe(event) {
  if (swipeStartX === null || swipeStartY === null) return;
  const point = event.touches?.[0] || event;
  const deltaX = point.clientX - swipeStartX;
  const deltaY = point.clientY - swipeStartY;

  if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY)) {
    swipeMoved = true;
    cancelMicrophoneStart();
    if (dropPressActive && !dropIsFullPlaying) {
      clearTimeout(dropPressTimer);
      dropPressActive = false;
      const btn = getSoundButton("musor_drop");
      btn?.classList.remove("active", "charging");
    }
    if (event.cancelable) event.preventDefault();
  }
}

function finishSwipe(event) {
  if (swipeStartX === null || swipeStartY === null) return;
  const point = event.changedTouches?.[0] || event;
  const deltaX = point.clientX - swipeStartX;
  const deltaY = point.clientY - swipeStartY;
  swipeStartX = null;
  swipeStartY = null;

  if (swipeMoved) {
    suppressClickUntil = performance.now() + 450;
    cancelMicrophoneStart();
    if (event.cancelable) event.preventDefault();
  }

  if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
    switchCategory(deltaX < 0 ? 1 : -1);
  }
}

gestureSurface.addEventListener("click", event => {
  if (performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

gestureSurface.addEventListener("pointerdown", beginSwipe);
gestureSurface.addEventListener("pointermove", trackSwipe);
gestureSurface.addEventListener("pointerup", finishSwipe);
gestureSurface.addEventListener("touchstart", beginSwipe, { passive: true });
gestureSurface.addEventListener("touchmove", trackSwipe, { passive: false });
gestureSurface.addEventListener("touchend", finishSwipe, { passive: true });

gestureSurface.addEventListener("wheel", event => {
  if (event.target.closest?.("input") || wheelLocked) return;
  const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY;
  if (Math.abs(primaryDelta) < 8) return;

  event.preventDefault();
  wheelLocked = true;
  switchCategory(primaryDelta > 0 ? 1 : -1);
  setTimeout(() => { wheelLocked = false; }, 360);
}, { passive: false });

// Keyboard hotkeys
window.addEventListener("keydown", event => {
  if (event.target.closest?.("input") || event.repeat) return;

  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    switchCategory(1);
    return;
  }
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    switchCategory(-1);
    return;
  }

  const category = getCurrentCategory();
  if (!category) return;

  if (event.code === "Space") {
    event.preventDefault();
    if (category.id === "mems") {
      handleDropPressStart(event);
      return;
    }
    if (category.id === "dps") {
      triggerSound("siren");
      return;
    }
    if (category.id === "gudok") {
      triggerSound("poezd");
      return;
    }
  }

  const num = parseInt(event.key, 10);
  if (!isNaN(num) && num >= 1 && num <= category.items.length) {
    event.preventDefault();
    const item = category.items[num - 1];
    if (item.dualAction) {
      handleDropPressStart(event);
    } else if (item.microphone) {
      startMicrophone();
    } else {
      triggerSound(item.key);
    }
  }
});

window.addEventListener("keyup", event => {
  if (event.target.closest?.("input")) return;
  const category = getCurrentCategory();
  if (!category) return;

  if (event.code === "Space") {
    if (category.id === "mems") {
      handleDropPressEnd(event);
    }
    return;
  }

  const num = parseInt(event.key, 10);
  if (!isNaN(num) && num >= 1 && num <= category.items.length) {
    const item = category.items[num - 1];
    if (item.dualAction) {
      handleDropPressEnd(event);
    } else if (item.microphone) {
      stopMicrophone();
    }
  }
});

volumeSlider.addEventListener("input", () => {
  setMasterVolume(Number(volumeSlider.value));
});

renderCategory();
setMasterVolume(100);
window.addEventListener("DOMContentLoaded", preloadAudio);

