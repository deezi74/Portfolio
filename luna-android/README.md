# Luna (Android)

A native Android build of Luna, the AI phone assistant — voice input (Android's
built-in speech recognizer), spoken replies (TextToSpeech), and a Gemini-powered
chat brain with multi-turn memory.

This is a clean rewrite of the original "Jarvis" prototype it grew out of: one
`MainActivity`, one layout, no hardcoded API key, no leftover build-tool cruft.

## Open it

1. Android Studio → **File → Open** → select this `luna-android/` folder.
2. Let Gradle sync (Android Studio will offer to generate the Gradle wrapper
   automatically if it's missing — accept that, or run `gradle wrapper` first
   if you have Gradle installed locally).
3. Run on a device/emulator running Android 7.0 (API 24) or newer.

## Set up your API key

Luna never ships with a real API key baked in. On first launch (or via the
gear icon, top right) she'll ask you to paste a **Gemini API key**:

- Get a free one at <https://aistudio.google.com/apikey>
- It's stored in a private `SharedPreferences` file on the device only.

## What's in here

```
app/src/main/java/com/ronnielynch/luna/MainActivity.java   # chat + voice + TTS + Gemini call
app/src/main/res/layout/activity_main.xml                  # chat UI (title bar, log, mic/input row)
app/src/main/res/values/                                    # Luna's dark/cyan theme, matching the web demo
app/src/main/AndroidManifest.xml                             # INTERNET + RECORD_AUDIO permissions
```

## Notes / next steps

- Voice input uses the system speech-recognizer dialog (`RecognizerIntent`)
  rather than a raw `SpeechRecognizer` listener, so it works out of the box
  on any device with Google's speech services installed — no extra
  permissions UX to build.
- There's no wake-word ("say 'Luna'") detection yet — that needs an
  always-listening service and battery/privacy trade-offs worth deciding on
  deliberately before adding.
- Chat history lives in memory only (cleared on restart). Persisting it
  (Room/SQLite) would be a natural next step.
