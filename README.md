# Aris

AI gaming companion — expressive, private, model-agnostic.

Every player gets an intelligent co-pilot that lives on their machine, speaks their language, and never misses a moment of the action.

## Status

Aris is in active development (v0.1.0). The avatar, AI provider layer, and screen analysis are usable today; voice is still a stub.

## Features

### Working

- **Model-agnostic AI** — 6 providers: Claude (Anthropic), OpenAI/ChatGPT, Ollama (local), LM Studio (local), and custom Anthropic/OpenAI-compatible endpoints. Bring your own model or run fully offline.
- **3D VRM Avatar** — Three.js + `@pixiv/three-vrm` companion with a rich animation system:
  - Gesture library (20+ gestures), expressions, mouse-tracked gaze, lip-sync scaffolding
  - Click reactions with escalation (surprised → giggle → annoyed → pushback)
  - Beat reactivity (head nod / hip bob to audio peaks)
  - Window-shake physics reactions
  - Micro-expressions and rare surprise animations
  - Non-humanoid avatar support
- **Personality-driven idle animations** — Idle behavior shifts with persona traits and time-of-day (morning/afternoon/evening/night profiles). Designed to feel alive between explicit interactions; ongoing work to make it more human-like.
- **Screen awareness** — Periodic screen capture with analysis at ~2fps, fed to a vision-capable provider. Game detection by both process scan and window title against a known-game database. Proactive personality-driven reactions when game context changes (with cooldowns).
- **Persona system** — Configurable personality traits drive response tone, idle behavior, and reaction style.
- **Dock positioning** — Pin Aris to top, bottom, left, or right of the screen.
- **Local-first storage** — Encrypted SQLite for conversation history and settings. Optional password lock at app launch.
- **Conversation management** — Multi-conversation history with a sidebar, manual screenshot triggers, settings panel, first-launch wizard, repair/uninstall flows with full data export.

### Partial / In progress

- **Screen awareness pipeline** — Capture and game detection work. The `packages/vision` module is currently a thin slice (game detection only); capture and analysis live in `packages/app`. Consolidation and a richer frame-processing pipeline (ROI, sampling strategies) are planned.
- **Idle realism** — Animation system is in place, but human-like nuance (breathing, weight shifts, gaze drift, behavioral coherence over longer timescales) is an active area.

### Planned / Not started

- **Voice (STT/TTS)** — Currently only browser Web Speech API is wired. Roadmap: local whisper.cpp for STT, Piper for TTS, with optional cloud fallback (Deepgram, ElevenLabs, OpenAI). UI is built; the engines are not.
- **Plugin / MCP integration** — On the roadmap, not yet started.

## Privacy

Aris is built local-first:

- All conversation history and settings are stored in an encrypted local SQLite database.
- No telemetry.
- Cloud AI providers (Claude, OpenAI) are opt-in — choose Ollama or LM Studio for fully offline use.
- The current voice implementation (Web Speech API) routes through the OS/browser stack; fully local STT/TTS is on the roadmap.

## Tech Stack

- **Electron** — Cross-platform desktop shell (Windows, macOS, Linux)
- **React + TypeScript** — UI and app logic
- **Three.js + @pixiv/three-vrm** — 3D avatar rendering
- **Vite** — Build tooling with HMR
- **better-sqlite3** — Local-first encrypted data storage
- **Playwright** — E2E test suite
- **pnpm workspaces** — Monorepo package management

## Project Structure

```
packages/
  app/        Electron main process + preload (IPC, capture service, stores, install/uninstall)
  renderer/   React UI: chat, settings, avatar canvas, first-launch wizard
  ai-core/    AI provider registry + 6 provider implementations
  voice/      STT/TTS (currently Web Speech API only — local engines planned)
  vision/     Game detection (capture currently lives in app/)
  avatar/     Three.js + VRM avatar system, gestures, reactions, idle behavior
  shared/     Shared types, persona definition, constants
```

## Development

```bash
pnpm install
pnpm dev
```

### Testing

```bash
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright E2E (requires `pnpm build` first)
pnpm typecheck
pnpm lint
```

### Building

```bash
pnpm build         # Build all packages
pnpm build:app     # Build + package with electron-builder
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical architecture.

## License

[Unlicense](LICENSE) — public domain.
