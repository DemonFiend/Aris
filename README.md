# Aris

AI gaming companion — expressive, private, model-agnostic.

Every player gets an intelligent co-pilot that lives on their machine, speaks their language, and never misses a moment of the action.

## Features (planned)

- **Model-agnostic AI** — Claude, ChatGPT, Ollama (local). Bring your own model.
- **Screen awareness** — Watches your gameplay and understands what's happening.
- **Voice** — Talk to Aris and hear responses. Local STT/TTS for privacy.
- **3D Avatar** — Expressive VRM companion with lip-sync and emotions.
- **Privacy-first** — Runs entirely on your machine. No data leaves unless you choose a cloud AI provider.

## Tech Stack

- **Electron** — Cross-platform desktop shell (Windows, macOS, Linux)
- **React + TypeScript** — UI and app logic
- **Three.js + VRM** — 3D avatar rendering
- **Vite** — Build tooling with HMR
- **SQLite** — Local-first data storage
- **pnpm workspaces** — Monorepo package management

## Project Structure

```
packages/
  app/        Electron main process + preload
  renderer/   React UI + avatar canvas
  ai-core/    AI provider abstraction + registry
  voice/      STT + TTS pipeline
  vision/     Screen capture + frame processing
  avatar/     Three.js + VRM avatar system
  shared/     Shared types, constants, utilities
```

## Development

```bash
pnpm install
pnpm dev
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical architecture.

## License

[Unlicense](LICENSE) — public domain.
