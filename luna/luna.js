(() => {
  "use strict";

  const STORAGE_KEY = "luna_gemini_api_key";
  const MODEL = "gemini-2.0-flash";
  const SYSTEM_PROMPT =
    "You are Luna, a warm, concise AI phone assistant. Keep answers short and " +
    "conversational, the way you'd speak on a phone call, unless the user asks " +
    "for detail.";

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

  /** @type {{role: "user"|"model", parts: {text: string}[]}[]} */
  let history = [];
  let muted = false;
  let busy = false;

  // ---------- helpers ----------

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || "";
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
      busy = false;
      setStatus("Tap the mic and say something, or type below");
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
      localStorage.setItem(STORAGE_KEY, key);
      addBubble("API key saved to this browser. Say hi to Luna!", "system");
    }
    hideSettings();
  });

  clearKeyBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    apiKeyInput.value = "";
    addBubble("API key cleared.", "system");
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

  // ---------- speech-to-text ----------

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let listening = false;

  if (SpeechRecognition) {
    recognizer = new SpeechRecognition();
    recognizer.lang = "en-US";
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    recognizer.onstart = () => {
      listening = true;
      micBtn.classList.add("active");
      setStatus("Listening...");
      setOrbState("listening");
    };

    recognizer.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) askLuna(transcript);
    };

    recognizer.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        addBubble("Voice input error: " + event.error, "error");
      }
    };

    recognizer.onend = () => {
      listening = false;
      micBtn.classList.remove("active");
      if (!busy) setStatus("Tap the mic and say something, or type below");
      setOrbState(null);
    };

    micBtn.addEventListener("click", () => {
      if (busy) return;
      if (listening) {
        recognizer.stop();
      } else {
        try {
          recognizer.start();
        } catch (_) {
          // already started - ignore
        }
      }
    });
  } else {
    micBtn.classList.add("unsupported");
    micBtn.title = "Voice input needs Chrome or Edge";
    micBtn.addEventListener("click", () => {
      addBubble("Voice input isn't supported in this browser. Try Chrome or Edge, or just type below.", "system");
    });
  }

  // ---------- welcome ----------

  addBubble(
    getApiKey()
      ? "Hi, I'm Luna. Ask me anything, out loud or by typing."
      : "Hi, I'm Luna! Add a free Gemini API key in Settings (top right) to start chatting.",
    "system"
  );
})();
