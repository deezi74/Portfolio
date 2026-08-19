# Luna — Personal AI Assistant

Luna is a native Android AI command center: a living knowledge-graph home
screen, an animated reactor core that reacts to your actual voice, hands-free
conversation, and a choice of **local, on-device models** (your own GGUF
files) or **cloud models** (OpenAI, Anthropic, Google, OpenRouter) via your
own API keys. Everything — memory, notes, the knowledge graph — is stored
locally in SQLite; nothing leaves the phone unless you turn on a cloud
provider or the ElevenLabs voice.

Built with Expo (React Native + TypeScript), `@shopify/react-native-skia` for
the graph/reactor rendering, `react-native-reanimated` for 60fps+ physics and
animation, and `llama.rn` (llama.cpp) for on-device inference.

## What's implemented

- **Knowledge graph** (`src/graph/`) — force-directed physics on the UI
  thread, pan/zoom/drag/tap/double-tap/long-press gestures, priority-based
  label collision avoidance, retrieval-path illumination, viewport culling.
- **Luna reactor** (`src/reactor/`) — multi-ring animated core with
  idle/listening/thinking/tool/speaking/offline/error states, driven by real
  microphone amplitude (via `expo-speech-recognition`'s volume events) or
  real playback waveform (via `expo-audio`'s sample listener) while she
  speaks, plus a word-boundary pulse for the free on-device voice.
- **Voice pipeline** (`src/voice/`) — hands-free continuous speech
  recognition, free on-device TTS by default, optional ElevenLabs cloud
  voice.
- **LLM providers** (`src/llm/`) — a single `LlmProvider` interface with
  implementations for OpenAI, Anthropic, Google, OpenRouter, and local
  llama.rn inference, all with tool-calling wired to real device actions
  (flashlight, reminders, calendar, memory).
- **Local memory** (`src/db/`) — SQLite-backed graph nodes/edges,
  conversation history, and notes.
- **Settings** (`src/components/SettingsOverlay.tsx`) — API key management
  (stored in `expo-secure-store`, encrypted at rest), local model picker,
  voice settings, performance profile, OLED mode.

## Running it

This app uses native modules (`llama.rn`, `expo-speech-recognition`, Skia,
Reanimated) that **do not run in Expo Go**. You need a custom dev client.

```bash
npm install
npx expo prebuild -p android   # generates the native android/ project
npx expo run:android           # builds + installs a dev client on a
                                # connected device/emulator, with live reload
```

## Building a real, installable APK (EAS)

1. Create a free account at [expo.dev](https://expo.dev) if you don't have
   one, then from inside `luna-app/`:
   ```bash
   npm install -g eas-cli
   eas login
   eas init          # links this project to your Expo account
   ```
2. Build:
   ```bash
   eas build -p android --profile preview   # produces a downloadable .apk
   ```
   `eas.json` already defines `development` (dev client), `preview` (APK,
   for sideloading), and `production` (AAB, for Play Store) profiles.
3. When the build finishes, EAS gives you a QR code / link to download and
   install the APK directly on your phone.

No macOS or Android Studio is required — EAS builds in the cloud. If you'd
rather build locally, `npx expo run:android` needs the Android SDK + NDK
installed (Android Studio's SDK Manager is the easiest way to get those).

## Setting up a local model

Download any instruction-tuned GGUF model onto your phone (e.g. from
Hugging Face — a Q4_K_M quant in the 1–4B range runs comfortably on most
phones from the last few years). In Luna: **Settings → Intelligence → Pick
.gguf file**. Luna offloads what it can to your GPU backend automatically
and falls back to CPU.

## Setting up cloud models

**Settings → Intelligence**, paste an API key under whichever provider you
want (OpenAI / Anthropic / Google / OpenRouter), tap **Save key** — that
becomes the active model. Keys are stored only in `expo-secure-store` on
your device.

## Premium voice (optional)

**Settings → Voice → Premium cloud voice**, then paste an ElevenLabs API
key and a voice ID (tap **List my voices** once the key is saved to see
your available voice IDs).

## Project layout

```
src/
  theme/        colors, type, spacing, performance profiles
  graph/        Skia knowledge-graph renderer + physics
  reactor/      the Luna reactor core
  voice/        speech recognition + TTS (device + ElevenLabs)
  llm/          provider interface, cloud providers, local llama.rn, tools
  tools/        real device actions (flashlight, reminders, calendar, notes)
  db/           SQLite schema + repositories
  state/        zustand stores (graph, settings)
  assistant/    orchestration hook tying voice → LLM → tools → graph → voice
  components/   HUD, panels, overlays
  screens/      HomeScreen
```

## Known limitations / next steps

- On-device speech recognition's `continuous` mode is Android 13+; on older
  devices Luna restarts the recognizer after every utterance instead
  (already handled, just with a brief gap between turns).
- The knowledge-graph physics/label system is tuned for tens of nodes: at
  the thousands-of-nodes scale the spec describes, swap the O(n) spatial
  bucket in `src/graph/physics.ts` for a real quadtree.
- Retrieval-path illumination is a local keyword heuristic
  (`src/assistant/retrieval.ts`), not the model's actual reasoning — an
  honest visualization of "what this touches," not a trace of the model.
