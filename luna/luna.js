(() => {
  "use strict";

  // ---------- storage keys & constants ----------

  const KEY_STORAGE = "luna_gemini_api_key";
  const GRAPH_STORAGE = "luna_graph_v2";
  const ACTIVITY_STORAGE = "luna_activity_v2";
  const MUTE_STORAGE = "luna_muted";
  const ALWAYS_LISTEN_STORAGE = "luna_always_listening";
  const MODEL = "gemini-2.0-flash";
  const WAKE_WORD = "luna";
  const MAX_ACTIVITY = 100;

  const TYPES = {
    person: { color: "#f472b6", icon: "\u{1F464}", label: "Person" },
    location: { color: "#4ade80", icon: "\u{1F4CD}", label: "Location" },
    document: { color: "#60a5fa", icon: "\u{1F4C4}", label: "Document" },
    concept: { color: "#d4e157", icon: "\u{1F4A1}", label: "Concept" },
    ai_model: { color: "#a78bfa", icon: "✨", label: "AI Model" },
    technology: { color: "#22d3ee", icon: "⚙", label: "Technology" },
    task: { color: "#fbbf24", icon: "✓", label: "Task" },
    thought: { color: "#e879f9", icon: "\u{1F9E0}", label: "Thought" },
  };

  const EXTRACT_SYSTEM_PROMPT =
    "You are Luna's knowledge-extraction engine. Given a piece of text a user " +
    "captured (a note, contact, document excerpt, meeting notes, anything), call " +
    "record_entities with every distinct real-world entity it mentions - people, " +
    "places, documents, projects, technologies, AI models, concepts, tasks - and " +
    "the relationships between them. Keep labels short (2-4 words). Only record " +
    "what's actually in the text.";

  // ---------- DOM ----------

  const $ = (id) => document.getElementById(id);

  const canvas = $("graphCanvas");
  const ctx = canvas.getContext("2d");
  const graphWrap = document.querySelector(".graph-wrap");
  const knowledgeSub = $("knowledgeSub");
  const physicsLabel = $("physicsLabel");
  const emptyHint = $("emptyHint");
  const nodeCard = $("nodeCard");
  const systemsLabel = $("systemsLabel");
  const traceBtn = $("traceBtn");

  const askForm = $("askForm");
  const askInput = $("askInput");
  const micBtn = $("micBtn");
  const orbBtn = $("orbBtn");
  const orbLabel = $("orbLabel");

  const settingsBtn = $("settingsBtn");
  const settingsOverlay = $("settingsOverlay");
  const closeSettings = $("closeSettings");
  const apiKeyInput = $("apiKeyInput");
  const saveKeyBtn = $("saveKeyBtn");
  const clearKeyBtn = $("clearKeyBtn");
  const alwaysListenToggle = $("alwaysListenToggle");
  const muteToggle = $("muteToggle");
  const clearGraphBtn = $("clearGraphBtn");
  const clearHistoryBtn = $("clearHistoryBtn");

  const filterBtn = $("filterBtn");
  const filterSheet = $("filterSheet");
  const filterList = $("filterList");

  const activitySheet = $("activitySheet");
  const activityList = $("activityList");

  const captureSheet = $("captureSheet");
  const captureInput = $("captureInput");
  const captureBtn = $("captureBtn");
  const captureStatus = $("captureStatus");

  // ---------- persisted state ----------

  function loadJSON(key, fallback) {
    try {
      const raw = JSON.parse(localStorage.getItem(key));
      return raw && typeof raw === "object" ? raw : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function seedGraph() {
    return {
      entities: [
        { id: "luna-core", type: "technology", label: "Luna Core", note: "Your assistant's reasoning engine." },
        { id: "gemini-model", type: "ai_model", label: "Gemini 2.0 Flash", note: "Powers Luna's answers and extraction." },
      ],
      links: [{ id: "l-seed", a: "luna-core", b: "gemini-model", relation: "runs on" }],
    };
  }

  let graph = loadJSON(GRAPH_STORAGE, seedGraph());
  if (!graph.entities.length) graph = seedGraph();
  let activity = loadJSON(ACTIVITY_STORAGE, []);
  if (!Array.isArray(activity)) activity = [];

  let visibleTypes = new Set(Object.keys(TYPES));
  let muted = localStorage.getItem(MUTE_STORAGE) === "1";

  function saveGraph() {
    localStorage.setItem(GRAPH_STORAGE, JSON.stringify(graph));
  }

  function saveActivity() {
    localStorage.setItem(ACTIVITY_STORAGE, JSON.stringify(activity.slice(0, MAX_ACTIVITY)));
  }

  function logActivity(kind, text) {
    activity.unshift({ id: "a" + Date.now() + Math.random().toString(36).slice(2, 6), kind, text, at: Date.now() });
    saveActivity();
    renderActivity();
  }

  function getApiKey() {
    return localStorage.getItem(KEY_STORAGE) || "";
  }

  // ---------- graph <-> physics nodes ----------

  let nodes = [];
  let nodeById = new Map();

  function rebuildNodes() {
    const prev = nodeById;
    nodeById = new Map();
    const degree = new Map();
    graph.links.forEach((l) => {
      degree.set(l.a, (degree.get(l.a) || 0) + 1);
      degree.set(l.b, (degree.get(l.b) || 0) + 1);
    });

    nodes = graph.entities.map((e) => {
      const old = prev.get(e.id);
      const cx = cssWidth() / 2, cy = cssHeight() / 2;
      const node = old
        ? old
        : {
            x: cx + (Math.random() - 0.5) * 80,
            y: cy + (Math.random() - 0.5) * 80,
            vx: 0,
            vy: 0,
          };
      node.id = e.id;
      node.type = TYPES[e.type] ? e.type : "concept";
      node.label = e.label;
      node.note = e.note || "";
      node.r = 16 + Math.min(4, degree.get(e.id) || 0) * 2.5;
      nodeById.set(e.id, node);
      return node;
    });
  }

  // ---------- physics ----------

  const REPULSE = 2600;
  const LINK_LEN = 90;
  const SPRING = 0.02;
  const CENTER_PULL = 0.0025;
  const DAMPING = 0.82;

  function activeNodes() {
    return nodes.filter((n) => visibleTypes.has(n.type));
  }

  function activeLinks() {
    return graph.links.filter(
      (l) => nodeById.has(l.a) && nodeById.has(l.b) &&
        visibleTypes.has(nodeById.get(l.a).type) && visibleTypes.has(nodeById.get(l.b).type)
    );
  }

  function tick() {
    const an = activeNodes();
    const al = activeLinks();
    const cx = cssWidth() / 2, cy = cssHeight() / 2;

    for (let i = 0; i < an.length; i++) {
      for (let j = i + 1; j < an.length; j++) {
        const a = an[i], b = an[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);
        const force = REPULSE / distSq;
        const fx = (force * dx) / dist, fy = (force * dy) / dist;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    al.forEach((l) => {
      const a = nodeById.get(l.a), b = nodeById.get(l.b);
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const diff = (dist - LINK_LEN) * SPRING;
      const fx = (diff * dx) / dist, fy = (diff * dy) / dist;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });

    an.forEach((n) => {
      n.vx += (cx - n.x) * CENTER_PULL;
      n.vy += (cy - n.y) * CENTER_PULL;
      n.vx *= DAMPING; n.vy *= DAMPING;
      n.x += n.vx; n.y += n.vy;
    });
  }

  // ---------- rendering / pan / zoom ----------

  let zoom = 1, panX = 0, panY = 0;
  let dpr = window.devicePixelRatio || 1;

  function cssWidth() { return graphWrap.clientWidth; }
  function cssHeight() { return graphWrap.clientHeight; }

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = cssWidth() * dpr;
    canvas.height = cssHeight() * dpr;
  }

  function worldToScreen(x, y) {
    return [cssWidth() / 2 + panX + x * zoom, cssHeight() / 2 + panY + y * zoom];
  }

  function screenToWorld(x, y) {
    return [(x - cssWidth() / 2 - panX) / zoom, (y - cssHeight() / 2 - panY) / zoom];
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth(), cssHeight());

    const an = activeNodes();
    const al = activeLinks();

    ctx.save();
    ctx.translate(cssWidth() / 2 + panX, cssHeight() / 2 + panY);
    ctx.scale(zoom, zoom);

    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = "rgba(139, 150, 165, 0.25)";
    al.forEach((l) => {
      const a = nodeById.get(l.a), b = nodeById.get(l.b);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    an.forEach((n) => {
      const meta = TYPES[n.type];
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = meta.color + "cc";
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = n.id === selectedId ? 18 : 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = n.id === selectedId ? 2 / zoom : 0;
      ctx.strokeStyle = "#ffffff";
      if (n.id === selectedId) ctx.stroke();

      ctx.font = `${n.r}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#0a0e14";
      ctx.fillText(meta.icon, n.x, n.y + 1);
    });

    ctx.restore();

    emptyHint.classList.toggle("hidden", graph.entities.length > 2);
    positionNodeCard();
  }

  function loop() {
    tick();
    draw();
    requestAnimationFrame(loop);
  }

  function fitToScreen() {
    const an = activeNodes();
    if (!an.length) { zoom = 1; panX = 0; panY = 0; return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    an.forEach((n) => {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const pad = 80;
    zoom = Math.max(0.35, Math.min(2, Math.min((cssWidth() - pad) / w, (cssHeight() - pad) / h)));
    if (!isFinite(zoom)) zoom = 1;
    panX = -((minX + maxX) / 2) * zoom;
    panY = -((minY + maxY) / 2) * zoom;
  }

  // ---------- interaction: pan/zoom/select ----------

  let selectedId = null;
  let dragging = false, dragStart = null, dragMoved = false;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; dragMoved = false;
    dragStart = { x: e.clientX, y: e.clientY, panX, panY };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    panX = dragStart.panX + dx;
    panY = dragStart.panY + dy;
  });

  canvas.addEventListener("pointerup", (e) => {
    dragging = false;
    if (!dragMoved) {
      const rect = canvas.getBoundingClientRect();
      const [wx, wy] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = activeNodes().find((n) => (n.x - wx) ** 2 + (n.y - wy) ** 2 <= (n.r + 6) ** 2);
      selectedId = hit ? hit.id : null;
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoom = Math.max(0.3, Math.min(3, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
  }, { passive: false });

  $("zoomIn").addEventListener("click", () => { zoom = Math.min(3, zoom * 1.25); });
  $("zoomOut").addEventListener("click", () => { zoom = Math.max(0.3, zoom / 1.25); });
  $("zoomFit").addEventListener("click", fitToScreen);

  function positionNodeCard() {
    if (!selectedId || !nodeById.has(selectedId)) {
      nodeCard.classList.add("hidden");
      return;
    }
    const n = nodeById.get(selectedId);
    const [sx, sy] = worldToScreen(n.x, n.y);
    nodeCard.style.left = sx + "px";
    nodeCard.style.top = sy + "px";
    const meta = TYPES[n.type];
    nodeCard.innerHTML =
      `<div class="node-name">${escapeHtml(n.label)}</div>` +
      `<div class="node-type" style="color:${meta.color}">${meta.label}</div>` +
      (n.note ? `<div>${escapeHtml(n.note)}</div>` : "");
    nodeCard.classList.remove("hidden");
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  window.addEventListener("resize", resizeCanvas);

  // ---------- header stats ----------

  function refreshStats() {
    const domains = new Set(graph.entities.map((e) => e.type)).size;
    knowledgeSub.textContent = `${domains} domain${domains === 1 ? "" : "s"} · ${graph.entities.length} live entit${graph.entities.length === 1 ? "y" : "ies"}`;
    physicsLabel.textContent = `LIVE PHYSICS — ${activeNodes().length} nodes · ${activeLinks().length} links`;
  }

  // ---------- sheets ----------

  function openSheet(el) { el.classList.remove("hidden"); }
  function closeSheet(el) { el.classList.add("hidden"); }

  document.querySelectorAll(".sheet-close").forEach((btn) => {
    btn.addEventListener("click", () => closeSheet($(btn.dataset.close)));
  });

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === "activity") { renderActivity(); openSheet(activitySheet); }
      else if (tab === "capture") openSheet(captureSheet);
      else if (tab === "system") openSettings();
    });
  });

  filterBtn.addEventListener("click", () => { renderFilters(); openSheet(filterSheet); });
  traceBtn.addEventListener("click", () => { renderActivity(); openSheet(activitySheet); });

  function renderActivity() {
    if (!activity.length) {
      activityList.innerHTML = '<div class="activity-empty">Nothing yet — capture something or ask Luna a question.</div>';
      return;
    }
    activityList.innerHTML = activity
      .map((a) => {
        const time = new Date(a.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        return `<div class="activity-item"><div class="activity-kind">${a.kind} · ${time}</div><div>${escapeHtml(a.text)}</div></div>`;
      })
      .join("");
  }

  function renderFilters() {
    const counts = {};
    graph.entities.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
    filterList.innerHTML = Object.keys(TYPES)
      .filter((t) => counts[t])
      .map((t) => {
        const meta = TYPES[t];
        const checked = visibleTypes.has(t) ? "checked" : "";
        return (
          `<label class="filter-row">` +
          `<input type="checkbox" data-type="${t}" ${checked} />` +
          `<span class="swatch" style="background:${meta.color}"></span>${meta.label}` +
          `<span class="filter-count">${counts[t]}</span>` +
          `</label>`
        );
      })
      .join("");
    filterList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) visibleTypes.add(cb.dataset.type);
        else visibleTypes.delete(cb.dataset.type);
        refreshStats();
      });
    });
  }

  // ---------- capture / extraction ----------

  captureBtn.addEventListener("click", captureText);

  async function captureText() {
    const text = captureInput.value.trim();
    if (!text) return;
    const key = getApiKey();
    if (!key) {
      captureStatus.textContent = "Add your Gemini API key in System settings first.";
      openSettings();
      return;
    }

    captureBtn.disabled = true;
    captureStatus.textContent = "Reading...";

    try {
      const res = await fetch(geminiUrl(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: EXTRACT_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text }] }],
          tools: [{ function_declarations: [recordEntitiesDeclaration()] }],
          tool_config: { function_calling_config: { mode: "ANY" } },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data && data.error && data.error.message) || res.statusText);

      const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      const callPart = parts && parts.find((p) => p.functionCall && p.functionCall.name === "record_entities");
      const args = callPart ? callPart.functionCall.args : null;

      if (!args || !Array.isArray(args.entities) || !args.entities.length) {
        captureStatus.textContent = "Luna didn't find anything to remember in that.";
        logActivity("capture", "Captured a note — no new entities found.");
        return;
      }

      const { addedEntities, addedLinks } = mergeExtraction(args);
      rebuildNodes();
      saveGraph();
      refreshStats();
      captureStatus.textContent = `Found ${addedEntities} new entit${addedEntities === 1 ? "y" : "ies"} and ${addedLinks} link${addedLinks === 1 ? "" : "s"}.`;
      logActivity("capture", `Captured a note → +${addedEntities} entities, +${addedLinks} links.`);
      captureInput.value = "";
    } catch (err) {
      captureStatus.textContent = "Error: " + err.message;
    } finally {
      captureBtn.disabled = false;
    }
  }

  function recordEntitiesDeclaration() {
    return {
      name: "record_entities",
      description: "Record the distinct real-world entities and relationships mentioned in a piece of text.",
      parameters: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Short name, 2-4 words." },
                type: { type: "string", enum: Object.keys(TYPES) },
                note: { type: "string", description: "One short sentence about it, optional." },
              },
              required: ["label", "type"],
            },
          },
          links: {
            type: "array",
            items: {
              type: "object",
              properties: {
                a: { type: "string", description: "Label of one entity." },
                b: { type: "string", description: "Label of the other entity." },
                relation: { type: "string", description: "Short relationship phrase, optional." },
              },
              required: ["a", "b"],
            },
          },
        },
        required: ["entities"],
      },
    };
  }

  function normalizeLabel(s) { return (s || "").trim().toLowerCase(); }

  function mergeExtraction(args) {
    const labelIndex = new Map();
    graph.entities.forEach((e) => labelIndex.set(normalizeLabel(e.label), e.id));

    let addedEntities = 0;
    const newIds = [];
    (args.entities || []).forEach((raw) => {
      const label = (raw.label || "").trim();
      if (!label) return;
      const key = normalizeLabel(label);
      if (labelIndex.has(key)) return;
      const id = "e" + Date.now() + Math.random().toString(36).slice(2, 7);
      const type = TYPES[raw.type] ? raw.type : "concept";
      graph.entities.push({ id, type, label, note: raw.note || "" });
      labelIndex.set(key, id);
      newIds.push(id);
      addedEntities++;
    });

    let addedLinks = 0;
    const existingPairs = new Set(graph.links.map((l) => pairKey(l.a, l.b)));
    (args.links || []).forEach((raw) => {
      const aId = labelIndex.get(normalizeLabel(raw.a));
      const bId = labelIndex.get(normalizeLabel(raw.b));
      if (!aId || !bId || aId === bId) return;
      const key = pairKey(aId, bId);
      if (existingPairs.has(key)) return;
      graph.links.push({ id: "k" + Date.now() + Math.random().toString(36).slice(2, 7), a: aId, b: bId, relation: raw.relation || "" });
      existingPairs.add(key);
      addedLinks++;
    });

    // Keep the graph connected: if nothing linked a new entity to anything, hang it off Luna Core.
    if (addedLinks === 0 && newIds.length) {
      newIds.forEach((id) => {
        const key = pairKey("luna-core", id);
        if (!existingPairs.has(key)) {
          graph.links.push({ id: "k" + Date.now() + Math.random().toString(36).slice(2, 7), a: "luna-core", b: id, relation: "" });
          existingPairs.add(key);
          addedLinks++;
        }
      });
    }

    return { addedEntities, addedLinks };
  }

  function pairKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }

  function geminiUrl(key) {
    return "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + encodeURIComponent(key);
  }

  // ---------- ask ----------

  askForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = askInput.value.trim();
    if (!q) return;
    askInput.value = "";
    askLuna(q);
  });

  async function askLuna(question) {
    const key = getApiKey();
    if (!key) {
      logActivity("system", "Add your Gemini API key in System settings to ask Luna anything.");
      openSettings();
      return;
    }

    setOrbState("thinking");

    const contextLines = graph.entities
      .slice(0, 120)
      .map((e) => `- ${e.label} (${TYPES[e.type] ? TYPES[e.type].label : e.type})${e.note ? ": " + e.note : ""}`)
      .join("\n");
    const linkLines = graph.links
      .slice(0, 150)
      .map((l) => {
        const a = graph.entities.find((e) => e.id === l.a), b = graph.entities.find((e) => e.id === l.b);
        if (!a || !b) return null;
        return `- ${a.label} ${l.relation ? "(" + l.relation + ")" : "↔"} ${b.label}`;
      })
      .filter(Boolean)
      .join("\n");

    const prompt =
      "You are Luna, a warm, concise personal AI assistant. Here is what you currently know " +
      "(the user's knowledge graph):\n\nEntities:\n" + contextLines + "\n\nRelationships:\n" + linkLines +
      "\n\nUse this if it's relevant to the question below; otherwise just answer normally and " +
      "conversationally, the way you'd speak on a phone call.\n\nQuestion: " + question;

    try {
      const res = await fetch(geminiUrl(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data && data.error && data.error.message) || res.statusText);

      const reply =
        data && data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts.map((p) => p.text || "").join("");

      if (!reply) throw new Error("Luna didn't return a reply.");

      logActivity("ask", `Q: ${question}\nA: ${reply}`);
      speak(reply);
    } catch (err) {
      logActivity("system", "Error asking Luna: " + err.message);
    } finally {
      setOrbState(null);
    }
  }

  // ---------- orb / voice state ----------

  function setOrbState(state) {
    orbBtn.classList.remove("listening", "thinking");
    if (state) orbBtn.classList.add(state);
    orbLabel.textContent = state === "listening" ? "LISTENING" : state === "thinking" ? "THINKING" : "READY";
  }

  orbBtn.addEventListener("click", () => micBtn.click());

  // ---------- settings ----------

  function openSettings() {
    apiKeyInput.value = getApiKey();
    settingsOverlay.classList.remove("hidden");
  }
  function hideSettingsPanel() { settingsOverlay.classList.add("hidden"); }

  settingsBtn.addEventListener("click", openSettings);
  closeSettings.addEventListener("click", hideSettingsPanel);
  settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) hideSettingsPanel(); });

  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem(KEY_STORAGE, key);
      logActivity("system", "API key saved.");
    }
    hideSettingsPanel();
  });

  clearKeyBtn.addEventListener("click", () => {
    localStorage.removeItem(KEY_STORAGE);
    apiKeyInput.value = "";
    logActivity("system", "API key cleared.");
  });

  clearGraphBtn.addEventListener("click", () => {
    graph = seedGraph();
    saveGraph();
    rebuildNodes();
    refreshStats();
    logActivity("system", "Knowledge graph cleared.");
  });

  clearHistoryBtn.addEventListener("click", () => {
    activity = [];
    saveActivity();
    renderActivity();
  });

  muteToggle.checked = muted;
  muteToggle.addEventListener("change", () => {
    muted = muteToggle.checked;
    localStorage.setItem(MUTE_STORAGE, muted ? "1" : "0");
    if (muted && "speechSynthesis" in window) window.speechSynthesis.cancel();
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
      // speech synthesis unavailable/blocked - fail silently
    }
  }

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
      setOrbState("listening");
    };

    recognizer.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = (last && last[0] && last[0].transcript || "").trim();
      if (!transcript) return;

      if (wakeLoopActive && !bypassWakeWordOnce) {
        const lower = transcript.toLowerCase();
        const idx = lower.indexOf(WAKE_WORD);
        if (idx === -1) return;
        const command = transcript.slice(idx + WAKE_WORD.length).replace(/^[,.!\-\s]+/, "").trim();
        if (command) askLuna(command);
        else speak("Yes?");
        return;
      }

      bypassWakeWordOnce = false;
      askLuna(transcript);
    };

    recognizer.onerror = (event) => {
      if (wakeLoopActive) return;
      if (event.error !== "aborted" && event.error !== "no-speech") {
        logActivity("system", "Voice input error: " + event.error);
      }
    };

    recognizer.onend = () => {
      listening = false;
      micBtn.classList.remove("active");
      if (wakeLoopActive) {
        try { recognizer.start(); } catch (_) { /* retried on next toggle */ }
        return;
      }
      setOrbState(null);
    };

    micBtn.addEventListener("click", () => {
      if (wakeLoopActive) {
        bypassWakeWordOnce = true;
        setOrbState("listening");
        return;
      }
      if (listening) {
        recognizer.stop();
      } else {
        recognizer.continuous = false;
        try { recognizer.start(); } catch (_) { /* already started */ }
      }
    });

    alwaysListenToggle.addEventListener("change", () => {
      wakeLoopActive = alwaysListenToggle.checked;
      localStorage.setItem(ALWAYS_LISTEN_STORAGE, wakeLoopActive ? "1" : "0");
      if (wakeLoopActive) {
        recognizer.continuous = true;
        try { recognizer.start(); } catch (_) { /* already listening */ }
      } else {
        try { recognizer.stop(); } catch (_) { /* ignore */ }
        setOrbState(null);
      }
    });

    if (localStorage.getItem(ALWAYS_LISTEN_STORAGE) === "1") {
      alwaysListenToggle.checked = true;
      wakeLoopActive = true;
      recognizer.continuous = true;
      try { recognizer.start(); } catch (_) { /* needs a gesture/permission - toggle to retry */ }
    }
  } else {
    micBtn.classList.add("unsupported");
    micBtn.title = "Voice input needs Chrome or Edge";
    micBtn.addEventListener("click", () => logActivity("system", "Voice input isn't supported in this browser."));
    alwaysListenToggle.disabled = true;
  }

  // ---------- init ----------

  systemsLabel.textContent = getApiKey() ? "All systems connected" : "Add a Gemini API key to connect";

  resizeCanvas();
  rebuildNodes();
  refreshStats();
  fitToScreen();
  renderActivity();
  requestAnimationFrame(loop);

  if (!getApiKey()) {
    logActivity("system", "Welcome to Luna! Add a free Gemini API key in System settings to get started.");
  }
})();
