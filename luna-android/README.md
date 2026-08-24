# Luna (Android)

A native Android build of Luna: a live personal knowledge-graph assistant.
Capture a note, contact, or document and Luna extracts the people, places,
and ideas in it onto an animated, physics-driven graph you can pan, zoom,
filter, and ask questions about - by voice or by typing, with an optional
always-listening wake word and the ability to actually control the phone
when you ask her to.

## Open it

1. Android Studio → **File → Open** → select this `luna-android/` folder.
2. Let Gradle sync (Android Studio will offer to generate the Gradle wrapper
   automatically if it's missing).
3. Run on a device/emulator running Android 8.0 (API 26) or newer.

## Set up your API key - or skip it entirely with a local model

Luna never ships with a real API key baked in. Add a free **Gemini API key**
via the gear icon: <https://aistudio.google.com/apikey>. It's stored in a
private `SharedPreferences` file on the device only - along with your
knowledge graph and activity log - nothing is synced to a server, by design,
since this app has none.

Prefer not to use a cloud key at all? In Settings, switch the provider to
**"Local model on this device"** and point it at an Ollama-compatible server
you already have running with a model pulled - on the phone itself (e.g. via
Termux) or another device on your network - plus the model's name (e.g.
`llama3.2:3b`). No API key, nothing leaves your network. Trade-off: local
models don't get the phone-control tools (open_app/show_screen/tap/...) -
just knowledge capture and grounded Q&A - since reliably driving a multi-step
tool loop needs more than most small on-device models can promise.

## What's in here

```
MainActivity.java               # UI shell: graph screen, ask bar, orb, bottom
                                 # nav (Activity/Capture/System dialogs)
GraphStore.java                  # the knowledge graph itself: entities, links,
                                  # activity log, on-device persistence, merge logic
GraphView.java                   # from-scratch Canvas force-directed graph:
                                  # physics tick, pan/pinch-zoom, tap-to-select
LunaBrain.java                   # talks to Gemini for two things - capture()
                                  # (entity extraction) and ask() (grounded Q&A
                                  # + the phone-control tool-calling loop)
ScreenTools.java                 # the tools Luna can call: open_app, show_screen,
                                  # tap, type_text, scroll, press_key
LunaAccessibilityService.java    # reads the screen, draws numbered circle markers,
                                  # performs taps/typing/scrolling
LunaWakeWordService.java         # optional foreground service: restarts speech
                                  # recognition in a loop, listens for "Luna"
res/xml/accessibility_service_config.xml
AndroidManifest.xml              # INTERNET, RECORD_AUDIO, notification + foreground
                                  # service permissions, both services registered
```

## The knowledge graph

Tap **+ Capture** and paste in anything - a note, a contact, a meeting
summary, a document excerpt. Luna sends it to Gemini with a forced
function-call (`record_entities`, `tool_config.mode = "ANY"`) that pulls out
every person, place, document, project, technology, AI model, task, and idea
it mentions, plus the relationships between them. Those get merged into a
local graph (deduped by label) and immediately show up as new nodes.

The graph is rendered with a real physics simulation - not a static image:
nodes repel each other, links pull like springs, everything settles toward
the center. A permanent "Luna Core" / "Gemini 2.0 Flash" hub keeps the graph
from ever being empty, and any newly captured entity that comes back with no
relationships gets hung off that hub so nothing floats away disconnected.

**Ask Luna about your world** grounds each question in the current graph
(entities + relationships as context) rather than a running chat thread -
it's a single-shot query bar, and every question and answer gets logged to
**Activity** so you can look back at it.

## Always-listening wake word

Off by default. Turn it on in Settings and Luna keeps the mic listening in
the background (even outside the app) for you to say "Luna" - everything you
say right after that becomes her next question. Two honest trade-offs that
come with this, both intentional:

- Android has no true always-on recognizer, so this restarts speech
  recognition in a loop. It costs noticeably more battery than the default.
- It runs as a foreground service, which means Android requires a visible,
  persistent notification the entire time it's listening - there's no way to
  make this silent, and that's by design so it's never a hidden mic.

## Screen control ("go to YouTube and search cat videos")

Luna can open apps and interact with whatever's on screen through Android's
**Accessibility Service** APIs - the same mechanism screen readers and
automation apps like Tasker use. It's not on by default and can't be turned
on silently; you turn it on yourself in **Settings → Accessibility → Luna**
(the in-app "Enable screen control" button jumps straight there).

How it works: when a question needs to interact with the screen, Luna calls
`show_screen`, which scans the current app for every tappable/editable
element and draws a small numbered circle over each one - visible on your
actual screen the whole time, so you can always see exactly what she's about
to touch. She then calls `tap`, `type_text`, `scroll`, or `press_key` by
number to carry out the request, re-scanning with `show_screen` whenever the
screen changes. `open_app` switches to a different app by name first, when
needed (e.g. "YouTube"). This is available from both the ask bar and the
always-listening wake word, since both go through the same `LunaBrain.ask()`.

**This is powerful on purpose, so be deliberate about it:** an enabled
accessibility service can read and act on anything visible in any app,
including ones with passwords or payment info. Only enable it if you trust
this app and the device it's on, and turn it off in Accessibility settings
any time you want to fully disable it.

## Notes / next steps

- Screen understanding is text-based (real accessibility labels + bounds),
  not a screenshot sent to a vision model - it's more reliable for this kind
  of precise tapping and doesn't need extra permissions.
- No cloud sync - the graph, activity log, and settings are on-device only.
  If you want Luna's memory to follow you across devices, that would need a
  backend added later.
- Selecting a node currently shows its details as a Toast rather than a
  floating card like the web version - a nicer in-place popup would be a
  good follow-up.
- The wake-word loop currently sends a heard command straight into
  `LunaBrain.ask()`; it doesn't yet interrupt itself if you're using the ask
  bar in the app at the same moment.
