# Luna (Android)

A native Android build of Luna, the AI phone assistant: voice input, spoken
replies, a Gemini-powered chat brain with memory, an optional always-listening
wake word, and the ability to actually control the phone - open an app, look
at what's on screen, and tap/type/scroll through it - when you ask her to.

This is a clean rewrite of the original "Jarvis" prototype it grew out of.

## Open it

1. Android Studio → **File → Open** → select this `luna-android/` folder.
2. Let Gradle sync (Android Studio will offer to generate the Gradle wrapper
   automatically if it's missing).
3. Run on a device/emulator running Android 8.0 (API 26) or newer.

## Set up your API key

Luna never ships with a real API key baked in. Add a free **Gemini API key**
via the gear icon: <https://aistudio.google.com/apikey>. It's stored in a
private `SharedPreferences` file on the device only - nothing is synced to a
server, by design, since this app has none.

## What's in here

```
MainActivity.java              # chat UI: text/mic input, settings dialog, chat log
LunaBrain.java                 # chat history + the Gemini request/tool-call loop
                                # (used by both MainActivity and the wake-word service)
ScreenTools.java                # the tools Luna can call: open_app, show_screen,
                                # tap, type_text, scroll, press_key
LunaAccessibilityService.java   # reads the screen, draws numbered circle markers,
                                # performs taps/typing/scrolling
LunaWakeWordService.java        # optional foreground service: restarts speech
                                # recognition in a loop, listens for "Luna"
res/xml/accessibility_service_config.xml
AndroidManifest.xml             # INTERNET, RECORD_AUDIO, notification + foreground
                                 # service permissions, both services registered
```

## Always-listening wake word

Off by default. Turn it on in Settings and Luna keeps the mic listening in
the background (even outside the app) for you to say "Luna" - everything you
say right after that becomes her next command. Two honest trade-offs that
come with this, both intentional:

- Android has no true always-on recognizer, so this restarts speech
  recognition in a loop. It costs noticeably more battery than the default.
- It runs as a foreground service, which means Android requires a visible,
  persistent notification the entire time it's listening - there's no way to
  make this silent, and that's by design so it's never a hidden mic.

Chat history and settings (API key, mute, always-listening) are stored
locally on-device (`SharedPreferences`) - there's no backend for this app to
sync to, so on-device is both the simplest and most private option.

## Screen control ("go to YouTube and search cat videos")

Luna can open apps and interact with whatever's on screen through Android's
**Accessibility Service** APIs - the same mechanism screen readers and
automation apps like Tasker use. It's not on by default and can't be turned
on silently; you turn it on yourself in **Settings → Accessibility → Luna**
(the in-app "Enable screen control" button jumps straight there).

How it works: when a request needs to interact with the screen, Luna calls
`show_screen`, which scans the current app for every tappable/editable
element and draws a small numbered circle over each one - visible on your
actual screen the whole time, so you can always see exactly what she's about
to touch. She then calls `tap`, `type_text`, `scroll`, or `press_key` by
number to carry out the request, re-scanning with `show_screen` whenever the
screen changes. `open_app` switches to a different app by name first, when
needed (e.g. "YouTube").

**This is powerful on purpose, so be deliberate about it:** an enabled
accessibility service can read and act on anything visible in any app,
including ones with passwords or payment info. Only enable it if you trust
this app and the device it's on, and turn it off in Accessibility settings
any time you want to fully disable it.

## Notes / next steps

- Screen understanding is text-based (real accessibility labels + bounds),
  not a screenshot sent to a vision model - it's more reliable for this kind
  of precise tapping and doesn't need extra permissions, but it also means
  Luna only "sees" what the accessibility tree exposes.
- No cloud sync for chat history/settings - if you want Luna's memory to
  follow you across devices, that would need a backend added later.
- The wake-word loop currently brings a heard command straight into
  `LunaBrain`; it doesn't yet interrupt itself if you start a manual chat in
  the app at the same moment.
