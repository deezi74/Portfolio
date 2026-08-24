(() => {
  "use strict";

  const KEY_STORAGE = "luna_gemini_api_key";
  const HISTORY_STORAGE = "luna_chat_history";
  const ALWAYS_LISTEN_STORAGE = "luna_always_listening";
  const MODEL = "gemini-2.0-flash";
  const SYSTEM_PROMPT =
    "You are Luna, a warm, concise AI phone assistant. Keep answers short and " +
    "conversational, the way you'd speak on a phone call, unless the user asks " +
    "for detail.";
  const WAKE_WORD = "luna";
  const MAX_STORED_TURNS = 60;

  const chatLog = document.getElementById("chatLog");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const micBtn = document.getElementById("micBtn");
  const muteBtn = document.getElementById("muteBtn");
  const statusLine = document.getElementById("statusLine");
  const orb = document.getElementById("orb");

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsOverlay = document.getElementById("settingsOverlay");
  const closeSettings = document.getElementById("closeSettings");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const saveKeyBtn = document.getElementById("saveKeyBtn");
  const clearKeyBtn = document.getElementById("clearKeyBtn");
  const alwaysListenToggle = document.getElementById("alwaysListenToggle");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  const IDLE_STATUS = "Tap the mic and say something, or type below";
  const WAKE_STATUS = "Listening for “Luna”...";

  /** @type {{role: "user"|"model", parts: {text: string}[]}[]} */
  let history = loadHistory();
  let muted = false;
  let busy = false;

  // ---------- helpers ----------

  function getApiKey() {
    return localStorage.getItem(KEY_STORAGE) || "";
  }

  function loadHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_STORAGE) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_STORAGE, JSON.stringify(history.slice(-MAX_STORED_TURNS)));
    } catch (_) {
      // storage full/unavailable - chat still works, just won't persist
    }
  }

  function setStatus(text) {
    statusLine.textContent = text;
  }

  function setOrbState(state) {
    orb.classList.remove("listening", "thinking");
    if (state) orb.classList.add(state);
  }

  function addBubble(text, kind) {
    const div = document.createElement("div");
    div.className = "bubble " + kind;
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    return div;
  }

  function openSettings() {
    apiKeyInput.value = getApiKey();
    settingsOverlay.classList.remove("hidden");
  }

  function hideSettings() {
    settingsOverlay.classList.add("hidden");
  }

  function restoreHistory() {
    if (!history.length) return;
    for (const turn of history) {
      const text = turn.parts && turn.parts[0] && turn.parts[0].text;
      if (!text) continue;
      addBubble(text, turn.role === "user" ? "user" : "luna");
    }
    addBubble("— restored from your last visit —", "system");
  }

  // ---------- Gemini call ----------

  async function askLuna(message) {
    const key = getApiKey();
    if (!key) {
      addBubble("Add your Gemini API key in Settings (top right) to start chatting with Luna.", "system");
      openSettings();
      return;
    }

    addBubble(message, "user");
    history.push({ role: "user", parts: [{ text: message }] });

    busy = true;
    setStatus("Thinking...");
    setOrbState("thinking");

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      MODEL + ":generateContent?key=" + encodeURIComponent(key);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: history,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || res.statusText;
        addBubble("Gemini error (" + res.status + "): " + msg, "error");
        history.pop();
        return;
      }

      const reply =
        data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.map((p) => p.text || "").join("");

      if (!reply) {
        addBubble("Luna didn't return a reply. Try rephrasing your message.", "error");
        history.pop();
        return;
      }

      history.push({ role: "model", parts: [{ text: reply }] });
      addBubble(reply, "luna");
      speak(reply);
    } catch (err) {
      addBubble("Network error talking to Gemini: " + err.message, "error");
      history.pop();
    } finally {
      saveHistory();
      busy = false;
      setStatus(wakeLoopActive ? WAKE_STATUS : IDLE_STATUS);
      setOrbState(null);
    }
  }

  // ---------- text input ----------

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || busy) return;
    chatInput.value = "";
    askLuna(text);
  });

  // ---------- settings ----------

  settingsBtn.addEventListener("click", openSettings);
  closeSettings.addEventListener("click", hideSettings);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) hideSettings();
  });

  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem(KEY_STORAGE, key);
      addBubble("API key saved to this browser. Say hi to Luna!", "system");
    }
    hideSettings();
  });

  clearKeyBtn.addEventListener("click", () => {
    localStorage.removeItem(KEY_STORAGE);
    apiKeyInput.value = "";
    addBubble("API key cleared.", "system");
  });

  clearHistoryBtn.addEventListener("click", () => {
    history = [];
    localStorage.removeItem(HISTORY_STORAGE);
    chatLog.innerHTML = "";
    addBubble("Chat history cleared.", "system");
  });

  // ---------- text-to-speech ----------

  function speak(text) {
    if (muted || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    } catch (_) {
      // speech synthesis not available/blocked - fail silently
    }
  }

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.textContent = muted ? "\u{1F507}" : "\u{1F508}";
    muteBtn.title = muted ? "Unmute Luna's voice" : "Mute Luna's voice";
    if (muted && "speechSynthesis" in window) window.speechSynthesis.cancel();
  });

  // ---------- speech-to-text (push-to-talk + always-listening wake word) ----------

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let listening = false;
  let wakeLoopActive = false;
  let bypassWakeWordOnce = false;

  if (SpeechRecognition) {
    recognizer = new SpeechRecognition();
    recognizer.lang = "en-US";
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    recognizer.onstart = () => {
      listening = true;
      micBtn.classList.add("active");
      setStatus(wakeLoopActive ? WAKE_STATUS : "Listening...");
      setOrbState("listening");
    };

    recognizer.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = (last && last[0] && last[0].transcript || "").trim();
      if (!transcript) return;

      if (wakeLoopActive && !bypassWakeWordOnce) {
        const lower = transcript.toLowerCase();
        const idx = lower.indexOf(WAKE_WORD);
        if (idx === -1) return; // ambient speech - ignore, keep listening
        const command = transcript.slice(idx + WAKE_WORD.length).replace(/^[,.!\-\s]+/, "").trim();
        if (command) {
          askLuna(command);
        } else {
          addBubble("Yes?", "luna");
          speak("Yes?");
        }
        return;
      }

      bypassWakeWordOnce = false;
      askLuna(transcript);
    };

    recognizer.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        if (wakeLoopActive) return; // keep the background loop quiet on transient errors
        addBubble("Voice input error: " + event.error, "error");
      }
    };

    recognizer.onend = () => {
      listening = false;
      micBtn.classList.remove("active");
      if (wakeLoopActive) {
        // Browsers stop "continuous" recognition after a while regardless -
        // keep the always-listening mode alive by restarting it.
        try {
          recognizer.start();
        } catch (_) {
          // ignore - will retry on the next user interaction/toggle
        }
        return;
      }
      if (!busy) setStatus(IDLE_STATUS);
      setOrbState(null);
    };

    micBtn.addEventListener("click", () => {
      if (busy) return;
      if (wakeLoopActive) {
        bypassWakeWordOnce = true;
        setStatus("Listening... (no need to say “Luna” this time)");
        return;
      }
      if (listening) {
        recognizer.stop();
      } else {
        recognizer.continuous = false;
        try {
          recognizer.start();
        } catch (_) {
          // already started - ignore
        }
      }
    });

    alwaysListenToggle.addEventListener("change", () => {
      wakeLoopActive = alwaysListenToggle.checked;
      localStorage.setItem(ALWAYS_LISTEN_STORAGE, wakeLoopActive ? "1" : "0");
      if (wakeLoopActive) {
        recognizer.continuous = true;
        try {
          recognizer.start();
        } catch (_) {
          // already listening - fine
        }
      } else {
        try {
          recognizer.stop();
        } catch (_) {
        }
      }
    });

    if (localStorage.getItem(ALWAYS_LISTEN_STORAGE) === "1") {
      alwaysListenToggle.checked = true;
      wakeLoopActive = true;
      recognizer.continuous = true;
      try {
        recognizer.start();
      } catch (_) {
        // needs a user gesture/mic permission in this browser - toggle again to retry
      }
    }
  } else {
    micBtn.classList.add("unsupported");
    micBtn.title = "Voice input needs Chrome or Edge";
    micBtn.addEventListener("click", () => {
      addBubble("Voice input isn't supported in this browser. Try Chrome or Edge, or just type below.", "system");
    });
    alwaysListenToggle.disabled = true;
  }

  // ---------- welcome ----------

  restoreHistory();
  addBubble(
    getApiKey()
      ? "Hi, I'm Luna. Ask me anything, out loud or by typing."
      : "Hi, I'm Luna! Add a free Gemini API key in Settings (top right) to start chatting.",
    "system"
  );
})();
