# Aris Technical Architecture

## Overview

Aris is a local-first AI gaming companion that runs on the player's machine. It watches gameplay via screen capture, displays a 3D avatar, and routes all AI reasoning through a provider-agnostic abstraction layer. Voice is on the roadmap but not yet wired to local engines. No mandatory cloud services — the player controls their data and their model choice.

**Target platforms:** Windows, macOS, Linux
**Status:** v0.1.0, active development

> **Reality check:** This document describes both what exists today and what is planned. Each section flags status with **Implemented**, **Partial**, or **Planned** so the architecture intent and the current code are not confused.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron Shell                     │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │  Main Process │  │     Renderer Process       │   │
│  │               │  │  ┌──────────────────────┐  │   │
│  │  - IPC hub    │  │  │   React UI            │  │   │
│  │  - Tray/menu  │  │  │   - Chat panel        │  │   │
│  │  - Lifecycle  │  │  │   - Settings          │  │   │
│  │  - Capture    │  │  │   - First-launch      │  │   │
│  │  - Stores     │  │  │     wizard            │  │   │
│  │  - Install/   │  │  ├──────────────────────┤  │   │
│  │    uninstall  │  │  │   3D Avatar (Three.js)│  │   │
│  │               │  │  │   - VRM model         │  │   │
│  │               │  │  │   - Gestures, gaze    │  │   │
│  │               │  │  │   - Reactions, idle   │  │   │
│  │               │  │  └──────────────────────┘  │   │
│  └──────┬───────┘  └─────────┬──────────────────┘   │
│         │         IPC Bridge  │                       │
│  ┌──────┴────────────────────┴──────────────────┐   │
│  │              Service Layer (Main)              │   │
│  │  ┌───────────┐ ┌──────────┐ ┌──────────────┐ │   │
│  │  │ AI Core   │ │ Capture +│ │    Voice     │ │   │
│  │  │ Provider  │ │ Game     │ │  (stub —     │ │   │
│  │  │ Registry  │ │ Detect   │ │  Web Speech) │ │   │
│  │  └───────────┘ └──────────┘ └──────────────┘ │   │
│  │  ┌───────────────────────────────────────────┐ │   │
│  │  │  Encrypted SQLite (better-sqlite3)         │ │   │
│  │  │  conversations · settings · personas ·     │ │   │
│  │  │  game profiles                              │ │   │
│  │  └───────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## 1. App Shell — Electron · **Implemented**

Electron with Vite for bundling.

**Rationale:**
- Chromium renderer gives us WebGL (Three.js for 3D avatar) and a rich UI toolkit (React)
- Node.js main process provides native access: screen capture, file system, local processes
- Mature ecosystem: electron-builder for packaging, electron-updater for auto-updates
- Proven at scale (VS Code, Discord, Slack)

**Alternatives considered:**
- *Tauri* — smaller binary, Rust backend, but WebView2/WebKit rendering is less consistent for WebGL-heavy 3D rendering across platforms. Revisit if binary size becomes a concern.
- *Native (Qt/GTK)* — maximum performance but much higher dev cost and no web ecosystem reuse.

**Structure:**
- **Main process** (`packages/app`): App lifecycle, system tray, IPC hub, capture service, stores, install/uninstall orchestration, password lock, auto-updater
- **Preload script:** Secure IPC bridge between main and renderer (`contextIsolation: true`)
- **Renderer process** (`packages/renderer`): React UI + Three.js avatar canvas, first-launch wizard, settings, chat, capture panel

**Notable subsystems in main:**
- `capture-service.ts` — Screen capture loop and analysis polling (~2fps)
- `screen-reaction.ts` — Proactive personality-driven reactions when game context changes
- `process-scanner.ts` / `service-detector.ts` — Process-based game detection
- `install-orchestrator.ts` / `uninstall-orchestrator.ts` — Native PowerShell setup/teardown on Windows
- `password-store.ts` / `key-store.ts` / `db-crypto.ts` / `file-crypto.ts` — Lock screen and at-rest encryption

## 2. AI Provider Abstraction Layer · **Implemented**

All AI interactions go through a unified interface. The player picks their provider in settings.

```typescript
interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsVision: boolean;
  readonly supportsStreaming: boolean;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;
  vision(image: Buffer, prompt: string, options?: ChatOptions): Promise<ChatResponse>;

  testConnection(): Promise<boolean>;   // stub — provider-specific impls TBD
  getModels(): Promise<ModelInfo[]>;    // stub — provider-specific impls TBD
}
```

**Providers (`packages/ai-core/src/providers/`):**

| Provider | Backend | Vision | Local | Notes |
|----------|---------|--------|-------|-------|
| Claude | Anthropic API | Yes | No | Best reasoning, primary target |
| OpenAI | OpenAI API | Yes | No | GPT-4o, broad compatibility |
| Ollama | Local HTTP | Model-dependent | Yes | LLaVA for vision, Llama for chat |
| LM Studio | Local HTTP | Model-dependent | Yes | Local inference UI |
| Custom Anthropic | Self-hosted / proxy | Yes | Optional | OpenAI-compatible endpoint accepting Anthropic schema |
| Custom OpenAI | Self-hosted / proxy | Yes | Optional | Any OpenAI-compatible endpoint |

**Provider registry** allows hot-swapping. Configuration stored per-provider; API keys encrypted at rest via Electron `safeStorage`.

**Gaming context prompt system:**
- System prompt includes game detection results, recent screen context, and persona traits
- Conversation history maintained per session, persisted to SQLite
- Token budget management to stay within model context limits

**Gaps:** `testConnection()` and `getModels()` are stubs across providers — connection-test and model-list UX is not yet hooked up end-to-end.

## 3. Screen Capture / Vision Pipeline · **Partial**

Screen analysis is functional but the package layout doesn't match the original design — capture and analysis live in `packages/app`, while `packages/vision` currently holds only the game-detection module.

**Implemented:**
- Capture loop in `app/capture-service.ts` (~2fps polling, configurable)
- Game detection (`vision/game-detect.ts`) — window-title match against a known-game database (~27 games), with fallback to process-name pattern matching
- Process scanning (`app/process-scanner.ts`) — running-process enumeration to identify games not in the foreground
- Vision query — captured frames sent to the active provider's vision endpoint with a game-aware prompt
- Proactive screen reactions (`app/screen-reaction.ts`) — companion initiates chat when game context changes, with personality-driven cooldowns

**Planned / Not yet implemented:**
- Frame sampling intelligence (action vs menu cadence)
- Region-of-interest cropping per game profile (health bars, minimap, chat)
- Compression strategy (resize + JPEG)
- Consolidating capture + analysis into `packages/vision`

**Privacy controls:**
- Capture only active when player enables it
- Frames are ephemeral — processed and discarded, not persisted by default
- Player can choose which monitor/window to watch

## 4. Voice Pipeline · **Planned**

> The UI is built, the pipeline is not. Today only browser Web Speech APIs are wired through `packages/voice`.

### Current state
- `WebSpeechSTT` wrapper around `SpeechRecognition` (browser API)
- `WebSpeechTTS` wrapper around `speechSynthesis`
- Volume-based VAD (silence detection)
- Renderer UI: voice controls, voice picker

### Roadmap

#### Speech-to-Text (STT)
- **Primary:** whisper.cpp (via native binding) — runs fully local
- **Fallback:** Cloud STT APIs (Deepgram, OpenAI Whisper API) for accuracy over privacy
- **VAD:** Silero VAD or WebRTC VAD for push-to-talk and hands-free modes

#### Text-to-Speech (TTS)
- **Primary:** Piper TTS (local, fast, multiple voices) via native binding
- **Fallback:** Cloud TTS (ElevenLabs, OpenAI TTS) for higher quality voices

#### Target voice flow
```
Mic → VAD → STT → [text] → AI Provider → [response text] → TTS → Speaker
                                                          → Avatar lip-sync
```

Until local engines land, voice is best treated as experimental. Privacy claims that depend on local STT/TTS should be qualified accordingly.

## 5. 3D Avatar Rendering · **Implemented**

**Stack:** Three.js + `@pixiv/three-vrm`

The avatar system is the most mature part of Aris. It includes everything needed for a believable companion presence beyond a static model.

**Why VRM:**
- Open standard for humanoid 3D avatars
- Huge library of free/commercial models (VRoid Hub)
- Built-in blend shapes for expressions and lip-sync
- Lightweight enough for a companion overlay

**Implemented modules (`packages/avatar/src/`):**

| Module | Purpose |
|--------|---------|
| `scene.ts` | Three.js scene/camera/renderer setup, VRM load |
| `pose-controller.ts` | Lerped pose transitions |
| `gestures.ts` | 20+ gesture library with suppression rules |
| `expressions.ts` | Sentiment → blend-shape mapping |
| `gaze.ts` | Mouse-tracked eye gaze |
| `lip-sync.ts` | Viseme scaffolding (driven by TTS audio when wired) |
| `idle-animation.ts` + `idle-variations.ts` | Persona- and time-of-day-aware idle behavior |
| `context-idle.ts` | Idle context behavior (situational nudges) |
| `micro-expressions.ts` | Subtle secondary animations |
| `surprise-animations.ts` | Rare surprise reactions |
| `click-reaction.ts` | Click-on-avatar escalation: surprised → giggle → annoyed → pushback |
| `beat-reaction.ts` | Audio-driven head nod / hip bob (beat reactivity) |
| `physics-reactions.ts` | Window-shake physics responses |
| `non-humanoid-animation.ts` | Support for non-humanoid VRM models |
| `base-pose.ts`, `camera-controller.ts` | Anchor pose + camera framing |

**Player customization:**
- Load custom VRM models, adjust scale/position
- Persona traits (`packages/shared/persona.ts`) drive idle profile and reaction style

**Rendering:**
- Dedicated canvas in renderer process
- Transparent background for overlay mode (always-on-top companion)
- Dock positioning (top/bottom/left/right of screen)
- Target: 60fps at minimal GPU cost

**Active focus:** making idle animation feel more human-like — breathing, weight shifts, gaze drift, behavioral coherence over longer timescales.

## 6. Local-First Data Storage · **Implemented**

**Engine:** SQLite via `better-sqlite3` (synchronous, fast, zero-config)

**Stores (`packages/app/src/`):**
- `settings-store.ts` — Provider config, keybinds, avatar preferences, capture settings, dock position
- `conversation-store.ts` — Chat history per session, searchable
- `game-profile-store.ts` — Per-game prompt templates and metadata
- `password-store.ts` / `key-store.ts` — Optional app-level lock and key material

**File storage:**
- User data directory: `%APPDATA%/aris` (Windows), `~/Library/Application Support/aris` (macOS), `~/.config/aris` (Linux)
- VRM models, voice models, and other assets stored alongside DB
- Full data export available from the uninstall flow

**Encryption:**
- API keys encrypted via Electron `safeStorage`
- File-level crypto for sensitive blobs (`file-crypto.ts`)
- DB-level crypto helpers (`db-crypto.ts`) — full SQLCipher integration is a future option, not yet shipped
- Optional password lock at app launch

## 7. Build System and Dev Tooling · **Implemented**

**Package manager:** pnpm (fast, disk-efficient, strict dependency resolution)

**Monorepo structure:**
```
aris/
├── packages/
│   ├── app/            # Electron main process + preload
│   ├── renderer/       # React UI + avatar canvas
│   ├── ai-core/        # AI provider abstraction + registry
│   ├── voice/          # STT + TTS pipeline (currently Web Speech only)
│   ├── vision/         # Game detection (capture lives in app/ for now)
│   ├── avatar/         # Three.js + VRM avatar system
│   └── shared/         # Shared types, persona, constants
├── docs/               # Architecture, guides
├── tests/e2e/          # Playwright E2E specs
├── .github/workflows/  # CI/CD
├── package.json        # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.json       # Base TypeScript config
├── playwright.config.ts
└── electron-builder.yml
```

**Build pipeline:**
- **Dev:** `pnpm dev` — Vite dev server with HMR for renderer, tsc --watch for main process
- **Build:** `pnpm build` — Vite build for renderer, tsc for main
- **Package:** `pnpm build:app` runs build + electron-builder; produces .exe (Windows), .dmg (macOS), .AppImage/.deb (Linux)

**Dev tooling:**
- TypeScript (strict mode) across all packages
- ESLint + Prettier for code style
- Vitest for unit/integration testing (`pnpm test`)
- Playwright for E2E testing of the Electron app (`pnpm test:e2e`) — 20+ smoke tests covering avatar, reactions, beats, dock, game detection

## 8. CI/CD — GitHub Actions · **Partial**

**Workflows:**
- **CI (on push/PR):** Build, E2E tests on Windows. Lint and unit-test enforcement is currently lenient (skipped when missing) — to be tightened.
- **Build (on tag):** Cross-platform builds via electron-builder (Windows, macOS, Linux) — defined, needs hardening.
- **Release (on version tag):** Build + publish to GitHub Releases with auto-update feed — planned, not yet automated end-to-end.

## 9. Security Considerations

- **Context isolation:** Renderer has no direct Node.js access; all system calls go through typed IPC
- **API key storage:** Electron `safeStorage` (OS keychain)
- **At-rest crypto:** File-level encryption helpers; SQLCipher integration deferred
- **Password lock:** Optional app-launch authentication
- **No telemetry:** No data leaves the machine unless the player explicitly uses a cloud AI provider
- **Content Security Policy:** Strict CSP enforced in two places — `packages/app/src/main.ts` (session handler, authoritative at runtime) and `packages/renderer/index.html` (meta tag fallback)
- **Auto-update signing:** Planned — releases will be signed and verified by electron-updater

## 10. Future Considerations (Not in V1)

- Local voice engines (whisper.cpp, Piper) — highest-priority gap
- Consolidating capture/analysis into `packages/vision` with ROI + sampling intelligence
- SQLCipher full-database encryption
- Plugin / MCP integration for game-specific extensions
- Multi-language UI (i18n)
- Mobile companion app
- Multiplayer awareness (party chat integration)
- Fine-tuned local models for specific games
