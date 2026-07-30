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
      { key: "microphone", label: "Микрофон", className: "btn-mic", microphone: true }
    ]
  },
  {
    id: "mems",
    title: "Мемы",
    items: [
      { key: "koch_v1", label: "Коч", file: "./sounds/Mems/koch_v1.mp3", className: "tone-purple", volume: 4 },
      { key: "bratan", label: "Братан", file: "./sounds/Mems/bratan.mp3", className: "tone-pink", volume: 4 },
      { key: "golda", label: "Голда", file: "./sounds/Mems/golda.mp3", className: "tone-indigo", volume: 1.5 }
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
  .filter(item => item.file);

const MEM_SOUND_KEYS = new Set(CATEGORIES[1].items.map(item => item.key));
const audioBuffers = {};
const activeSoundCounts = new Map();

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
let swipeStartX = null;
let swipeStartY = null;
let wheelLocked = false;
let isCategorySwitching = false;

const categoryBrowser = document.getElementById("categoryBrowser");
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

    return `
      <button
        class="sound-btn ${item.className}${isActive ? " active" : ""}"
        type="button"
        data-sound-key="${item.key}"
        ${item.microphone ? 'data-microphone="true"' : ""}
        ${pressed}
      >
        <span class="btn-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="btn-label">${item.label}</span>
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
    outputLimiterNode.threshold.value = -3;
    outputLimiterNode.knee.value = 6;
    outputLimiterNode.ratio.value = 12;
    outputLimiterNode.attack.value = 0.003;
    outputLimiterNode.release.value = 0.18;

    masterGainNode.connect(outputLimiterNode);
    outputLimiterNode.connect(audioCtx.destination);
  }

  if (audioCtx.state === "suspended") audioCtx.resume();
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
    await tempCtx.close();
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

function playOneShot(item) {
  if (!audioCtx || !audioBuffers[item.key]) return;

  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();
  const now = audioCtx.currentTime;
  const duration = audioBuffers[item.key].duration;
  const fadeIn = 0.015;
  const fadeOut = MEM_SOUND_KEYS.has(item.key) ? 0.2 : 0.18;
  const targetVolume = item.volume || 1;

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

  source.onended = () => {
    try { source.disconnect(); } catch {}
    try { gainNode.disconnect(); } catch {}
    activeSoundCounts.set(item.key, Math.max(0, (activeSoundCounts.get(item.key) || 1) - 1));
    updateSoundButton(item.key);
  };
  source.start(now);
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
}

function triggerSound(key) {
  const item = getItemByKey(key);
  if (!item || item.microphone) return;
  initAudioContext();
  if (item.loop) toggleSiren();
  else playOneShot(item);
}

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

buttonsGrid.addEventListener("click", event => {
  const button = event.target.closest("[data-sound-key]");
  if (!button || button.dataset.microphone === "true") return;
  triggerSound(button.dataset.soundKey);
});

buttonsGrid.addEventListener("pointerdown", event => {
  const button = event.target.closest('[data-microphone="true"]');
  if (button) startMicrophone(event);
});

window.addEventListener("pointerup", stopMicrophone);
window.addEventListener("pointercancel", stopMicrophone);

function beginSwipe(event) {
  if (event.target.closest("button, input")) return;
  const point = event.touches?.[0] || event;
  swipeStartX = point.clientX;
  swipeStartY = point.clientY;
}

function finishSwipe(event) {
  if (swipeStartX === null || swipeStartY === null) return;
  const point = event.changedTouches?.[0] || event;
  const deltaX = point.clientX - swipeStartX;
  const deltaY = point.clientY - swipeStartY;
  swipeStartX = null;
  swipeStartY = null;

  if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
    switchCategory(deltaX < 0 ? 1 : -1);
  }
}

categoryBrowser.addEventListener("pointerdown", beginSwipe);
categoryBrowser.addEventListener("pointerup", finishSwipe);
categoryBrowser.addEventListener("mousedown", beginSwipe);
categoryBrowser.addEventListener("mouseup", finishSwipe);
categoryBrowser.addEventListener("touchstart", beginSwipe, { passive: true });
categoryBrowser.addEventListener("touchend", finishSwipe, { passive: true });

categoryBrowser.addEventListener("wheel", event => {
  if (event.target.closest("input") || wheelLocked) return;
  const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY;
  if (Math.abs(primaryDelta) < 8) return;

  event.preventDefault();
  wheelLocked = true;
  switchCategory(primaryDelta > 0 ? 1 : -1);
  setTimeout(() => { wheelLocked = false; }, 360);
}, { passive: false });

categoryBrowser.addEventListener("keydown", event => {
  if (event.key === "ArrowRight") switchCategory(1);
  if (event.key === "ArrowLeft") switchCategory(-1);
});

volumeSlider.addEventListener("input", () => {
  setMasterVolume(Number(volumeSlider.value));
});

renderCategory();
setMasterVolume(100);
window.addEventListener("DOMContentLoaded", preloadAudio);
