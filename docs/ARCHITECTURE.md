# Aris Technical Architecture

## Overview

Aris is a local-first AI gaming companion that runs on the player's machine. It watches gameplay via screen capture, listens and speaks through a voice pipeline, displays a 3D avatar, and routes all AI reasoning through a provider-agnostic abstraction layer. No mandatory cloud services — the player controls their data and their model choice.

**Target platforms:** Windows, macOS, Linux
**Target audience:** 10,000 players (initial release)

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron Shell                     │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │  Main Process │  │     Renderer Process       │   │
│  │               │  │  ┌──────────────────────┐  │   │
│  │  - IPC hub    │  │  │   React UI            │  │   │
│  │  - Tray/menu  │  │  │   - Chat panel        │  │   │
│  │  - Lifecycle  │  │  │   - Settings           │  │   │
│  │  - Autostart  │  │  │   - Overlay mode       │  │   │
│  │               │  │  ├──────────────────────┤  │   │
│  │               │  │  │   3D Avatar (Three.js) │  │   │
│  │               │  │  │   - VRM model          │  │   │
│  │               │  │  │   - Lip-sync           │  │   │
│  │               │  │  │   - Expressions        │  │   │
│  │               │  │  └──────────────────────┘  │   │
│  └──────┬───────┘  └─────────┬──────────────────┘   │
│         │         IPC Bridge  │                       │
│  ┌──────┴────────────────────┴──────────────────┐   │
│  │              Service Layer (Main)              │   │
│  │  ┌───────────┐ ┌──────────┐ ┌──────────────┐ │   │
│  │  │ AI Core   │ │  Vision  │ │    Voice     │ │   │
│  │  │ Provider  │ │  Pipeline│ │   Pipeline   │ │   │
│  │  │ Abstraction│ │          │ │  STT + TTS   │ │   │
│  │  └───────────┘ └──────────┘ └──────────────┘ │   │
│  │  ┌───────────────────────────────────────────┐ │   │
│  │  │           Local Data Store (SQLite)        │ │   │
│  │  └───────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## 1. App Shell — Electron

**Choice:** Electron with Vite for bundling.

**Rationale:**
- Chromium renderer gives us WebGL (Three.js for 3D avatar) and a rich UI toolkit (React)
- Node.js main process provides native access: screen capture, file system, local processes
- Mature ecosystem: electron-builder for packaging, electron-updater for auto-updates
- Proven at scale (VS Code, Discord, Slack)

**Alternatives considered:**
- *Tauri* — smaller binary, Rust backend, but WebView2/WebKit rendering is less consistent for WebGL-heavy 3D rendering across platforms. Revisit if binary size becomes a concern.
- *Native (Qt/GTK)* — maximum performance but much higher dev cost and no web ecosystem reuse.

**Structure:**
- **Main process:** App lifecycle, system tray, IPC hub, service orchestration
- **Preload script:** Secure IPC bridge between main and renderer (contextIsolation: true)
- **Renderer process:** React UI + Three.js avatar canvas

## 2. AI Provider Abstraction Layer

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
  
  testConnection(): Promise<boolean>;
  getModels(): Promise<ModelInfo[]>;
}
```

**Providers:**

| Provider | Backend | Vision | Local | Notes |
|----------|---------|--------|-------|-------|
| Claude | Anthropic API | Yes | No | Best reasoning, primary target |
| OpenAI | OpenAI API | Yes | No | GPT-4o, broad compatibility |
| Ollama | Local HTTP | Model-dependent | Yes | LLaVA for vision, Llama for chat |

**Provider registry** allows hot-swapping and future extension. Configuration stored per-provider (API keys encrypted at rest via electron safeStorage).

**Gaming context prompt system:**
- System prompt includes game detection results, recent screen context, and player preferences
- Conversation history maintained per game session
- Token budget management to stay within model context limits

## 3. Screen Capture / Vision Pipeline

**Capture:**
- Electron `desktopCapturer` API to grab screen frames
- Player selects which monitor/window to watch
- Configurable capture interval (default: 2 fps for analysis, higher for specific triggers)

**Processing pipeline:**
1. **Game detection** — Match window title / process name against known game database
2. **Frame sampling** — Intelligent sampling: increase rate during action, decrease during menus
3. **Region of interest** — Crop to relevant areas (health bars, minimap, chat) when game profile exists
4. **Compression** — Resize + JPEG encode for efficient model input
5. **Vision query** — Send processed frame to AI provider's vision endpoint with game-aware prompt

**Privacy controls:**
- Capture only active when player enables it
- Frames are ephemeral — processed and discarded, never stored to disk by default
- Player can exclude specific windows/applications

## 4. Voice Pipeline

### Speech-to-Text (STT)
- **Primary:** whisper.cpp (via whisper-node native binding) — runs fully local
- **Fallback:** Cloud STT APIs (Deepgram, OpenAI Whisper API) for players who prefer accuracy over privacy
- **VAD:** Silero VAD or WebRTC VAD for voice activity detection (push-to-talk and hands-free modes)

### Text-to-Speech (TTS)
- **Primary:** Piper TTS (local, fast, multiple voices) via native binding
- **Fallback:** Cloud TTS (ElevenLabs, OpenAI TTS) for higher quality voices
- **Output:** Audio plays through a dedicated virtual channel or system audio

### Voice flow:
```
Mic → VAD → STT → [text] → AI Provider → [response text] → TTS → Speaker
                                                          → Avatar lip-sync
```

## 5. 3D Avatar Rendering

**Stack:** Three.js + @pixiv/three-vrm

**Why VRM:**
- Open standard for humanoid 3D avatars
- Huge library of free/commercial models (VRoid Hub)
- Built-in blend shapes for expressions and lip-sync
- Lightweight enough for a companion overlay

**Features:**
- **Lip-sync:** Driven by TTS audio output (viseme mapping from audio analysis)
- **Expressions:** Mapped to conversation sentiment (happy, thinking, surprised, etc.)
- **Idle animations:** Breathing, blinking, subtle movement
- **Player customization:** Load custom VRM models, adjust scale/position

**Rendering:**
- Dedicated canvas in renderer process
- Transparent background for overlay mode (always-on-top companion)
- Target: 60fps at minimal GPU cost (single character, simple lighting)

## 6. Local-First Data Storage

**Engine:** SQLite via better-sqlite3 (synchronous, fast, zero-config)

**Schema areas:**
- **Settings** — Provider config, keybinds, avatar preferences, capture settings
- **Conversations** — Chat history per game session, searchable
- **Game profiles** — Per-game prompt templates, screen regions, known UI elements
- **Analytics** — Local usage stats (session time, model usage) — never phoned home

**File storage:**
- User data directory: `%APPDATA%/aris` (Windows), `~/Library/Application Support/aris` (macOS), `~/.config/aris` (Linux)
- VRM models, voice models, and other assets stored alongside DB
- All data exportable/deletable by the player

**Encryption:**
- API keys encrypted via Electron safeStorage
- Optional full-database encryption (SQLCipher) for players who want it

## 7. Build System and Dev Tooling

**Package manager:** pnpm (fast, disk-efficient, strict dependency resolution)

**Monorepo structure:**
```
aris/
├── packages/
│   ├── app/            # Electron main process + preload
│   ├── renderer/       # React UI + avatar canvas
│   ├── ai-core/        # AI provider abstraction + registry
│   ├── voice/          # STT + TTS pipeline
│   ├── vision/         # Screen capture + frame processing
│   ├── avatar/         # Three.js + VRM avatar system
│   └── shared/         # Shared types, constants, utilities
├── docs/               # Architecture, guides
├── .github/workflows/  # CI/CD
├── package.json        # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.json       # Base TypeScript config
├── vite.config.ts      # Shared Vite config
└── electron-builder.yml
```

**Build pipeline:**
- **Dev:** `pnpm dev` — Vite dev server with HMR for renderer, tsc --watch for main process
- **Build:** `pnpm build` — Vite build for renderer, tsc for main, electron-builder for packaging
- **Package:** electron-builder produces .exe (Windows), .dmg (macOS), .AppImage/.deb (Linux)

**Dev tooling:**
- TypeScript (strict mode) across all packages
- ESLint + Prettier for code style
- Vitest for unit/integration testing
- Playwright for E2E testing of the Electron app

## 8. CI/CD — GitHub Actions

**Workflows:**
- **CI (on push/PR):** Lint, typecheck, unit tests
- **Build (on tag):** Cross-platform builds via electron-builder (Windows, macOS, Linux)
- **Release (on version tag):** Build + publish to GitHub Releases with auto-update feed

## 9. Security Considerations

- **Context isolation:** Renderer has no direct Node.js access; all system calls go through typed IPC
- **API key storage:** Electron safeStorage (OS keychain)
- **No telemetry:** No data leaves the machine unless the player explicitly uses a cloud AI provider
- **Content Security Policy:** Strict CSP in renderer to prevent injection
- **Auto-update signing:** All releases signed; electron-updater verifies signatures

## 10. Future Considerations (Not in V1)

- Plugin system for game-specific integrations
- Multi-language UI (i18n)
- Mobile companion app
- Multiplayer awareness (party chat integration)
- Fine-tuned local models for specific games
