# Luna (Android)

A native Android build of Luna: a live personal knowledge-graph assistant.
Capture a note, contact, or document (or a photo of one) and Luna extracts
the people, places, and ideas in it onto an animated, physics-driven graph
you can pan, zoom, filter, and ask questions about - by voice or by typing,
with an optional always-listening wake word and a floating quick-access
bubble. She can control the phone's screen when you ask her to, place calls
and send texts by contact name, set reminders that survive a reboot, and -
if you grant notification access - answer "what did I miss".

Each of these is opt-in and off by default; nothing here is silent. Every
capability that touches something sensitive (calls, texts, contacts, the
screen, notifications, a floating overlay) requires you to explicitly grant
it in Settings, one at a time.

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

Prefer not to use a cloud key at all? Settings has two local, no-API-key options:

- **Local server on this device** - points at an Ollama-compatible server you
  already have running with a model pulled, on the phone itself (e.g. via
  Termux) or another device on your network, by URL + model name.
- **Local model file, on-device** - pick an actual `.gguf` file you've
  already downloaded (from a file picker, no server needed at all) and Luna
  runs it directly, on-device, via a vendored copy of llama.cpp's own
  Kotlin/JNI bridge (see "On-device GGUF models" below).

Either way, nothing leaves your network - and both share the same trade-off:
local models don't get the phone-control tools (open_app/show_screen/tap/...)
- just knowledge capture and grounded Q&A - since reliably driving a
multi-step tool loop needs more than most local models can promise right now.

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
PhoneTools.java                  # more tools: call_contact, send_text, set_reminder,
                                  # open_bluetooth_panel, set_brightness
LunaAccessibilityService.java    # reads the screen, draws numbered circle markers,
                                  # performs taps/typing/scrolling
LunaWakeWordService.java         # optional foreground service: restarts speech
                                  # recognition in a loop, listens for "Luna"
LunaBubbleService.java           # optional floating draggable orb (SYSTEM_ALERT_WINDOW) -
                                  # tap it to ask Luna something from any app
LunaNotificationListenerService.java, NotificationStore.java
                                  # optional: reads other apps' notifications into a
                                  # rolling buffer, folded into ask()'s context
ReminderStore.java, ReminderReceiver.java, BootReceiver.java
                                  # AlarmManager-backed reminders that survive a reboot
                                  # (BootReceiver re-schedules everything still in the future)
kotlin/.../LocalLlm.kt           # plain-Java-callable wrapper around the on-device
                                  # llama.cpp bridge below, for the local-file provider
kotlin/com/arm/aichat/**         # vendored from llama.cpp's own examples/llama.android -
                                  # the Kotlin/coroutines + JNI bridge to llama.cpp itself
cpp/ai_chat.cpp, cpp/logging.h   # ditto (JNI side); logging.h has one small patch for
                                  # Luna's lower minSdk - see comment in the file
cpp/CMakeLists.txt               # fetches llama.cpp's C++ source at build time (not
                                  # committed here - see comments in the file) and builds it
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

## Custom instructions

Settings has a free-text "Custom instructions" box - anything you write there
(a nickname, a tone, a house rule like "keep answers to one sentence") gets
folded into Luna's system prompt on every question, on top of her built-in
instructions, no matter which provider (Cloud, local server, or local file)
is selected. It only shapes how she answers - it doesn't get applied to
knowledge-graph extraction, which stays strictly factual on purpose. Empty by
default, stored the same private on-device way as everything else.

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

## Calls, texts & reminders

Grant "call/text/reminder permissions" in Settings (Contacts, Phone, SMS, and
- on Android 12+ - a prompt to allow exact-alarm scheduling) and Luna can:

- **Call or text a contact by name** ("call mom", "text Dave I'm running late").
  She looks the contact up by a case-insensitive substring match on display
  name and either dials directly (`ACTION_CALL`) or sends an SMS - both need
  their own permission, checked independently, so e.g. calling can work
  before texting is granted.
- **Set a reminder** ("remind me to take the trash out in 20 minutes", "remind
  me to call the dentist at 9am") - scheduled with `AlarmManager`, persisted
  so a reboot doesn't lose it (`BootReceiver` puts everything still in the
  future back), and shown as a notification (plus logged to Activity) when it
  fires. There's no reminders-management UI yet beyond "Clear all reminders"
  in Settings - no editing or cancelling one individually.

## Notification access

Grant notification access in Settings and Luna keeps a rolling buffer (last
50) of titles/text from your other apps' notifications, folded into her
context the same way the knowledge graph is - so "what did I miss" or "did
anyone text me" just works as a normal question. Nothing happens
automatically off the back of a notification; Luna only sees it if and when
you ask her something.

## Floating bubble

Turn on "Floating bubble" in Settings (needs the "display over other apps"
permission, granted separately since it's the same sensitive capability
overlay-based screen-reading apps and click-fraud malware both rely on - only
enable it if you trust this build). A small draggable orb appears on top of
whatever app you're in; drag it around, or tap it to start listening and ask
Luna something without switching apps. The reply shows as a small floating
bubble near the orb (auto-fades after a few seconds) and is spoken via TTS,
same as everywhere else in the app.

## Bluetooth & brightness

Two small, honest tools: `open_bluetooth_panel` opens the system Bluetooth
settings screen (Android hasn't allowed apps to toggle Bluetooth
programmatically since API 33, so this is the real available action, not a
fake toggle), and `set_brightness` adjusts screen brightness directly - the
latter needs the separate "Modify system settings" grant (`Settings.System
.canWrite()`), which is AppOps-gated rather than a normal permission, so
there's a dedicated button for it in Settings rather than a runtime prompt.

## Photo capture

The Capture screen has a "📷 Take a photo instead" button alongside the text
box - snap a photo of a document, whiteboard, or business card and Luna
extracts entities from it the same way she does from pasted text. This one's
Cloud (Gemini)-only: Gemini is multimodal, but the local model providers here
aren't wired up for images.

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
- Luna registers as an assist-intent target (`ACTION_ASSIST`/`ACTION_VOICE_ASSIST`
  on MainActivity) so she's a candidate when the system resolves an assist
  request, but that's a lighter-weight pattern than a full
  `VoiceInteractionService` - whether she's actually selectable as the
  device's "Default assist app" varies by device/Android skin and hasn't
  been confirmed on real hardware.
- `call_contact`/`send_text` match a contact by a simple substring on display
  name - the first match wins, so a very generic query with multiple similar
  contacts could pick the wrong one.
- The floating bubble only triggers voice input (tap to listen, reply shown
  as a small text bubble); it doesn't have its own mini chat UI the way
  Messenger's chat heads do.
