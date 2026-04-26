#!/usr/bin/env bash
# Quick Install script for F5-TTS (macOS / Linux).
# Invoked by Aris via install:run-quick-install with --install-dir and --gpu-backend.
# Lines prefixed `[ARIS-PROGRESS] <pct>|<stage>|<msg>` are parsed by the main
# process and turned into QuickInstallProgress IPC events.

set -euo pipefail

INSTALL_DIR=""
GPU_BACKEND="cpu"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)  INSTALL_DIR="$2"; shift 2 ;;
    --gpu-backend)  GPU_BACKEND="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$INSTALL_DIR" ]]; then
  echo "Missing --install-dir" >&2
  exit 1
fi

emit_progress() {
  echo "[ARIS-PROGRESS] $1|$2|$3"
}

find_python() {
  for cmd in python3.12 python3.11 python3.10 python3 python; do
    if command -v "$cmd" >/dev/null 2>&1; then
      ver="$($cmd --version 2>&1)"
      if [[ "$ver" =~ Python\ ([0-9]+)\.([0-9]+) ]]; then
        major="${BASH_REMATCH[1]}"
        minor="${BASH_REMATCH[2]}"
        if (( major == 3 && minor >= 10 )) || (( major > 3 )); then
          echo "$cmd"
          return 0
        fi
      fi
    fi
  done
  return 1
}

emit_progress 5 checking 'Verifying Python and git...'
PYTHON="$(find_python)" || {
  echo "Python 3.10+ is required. Install from https://www.python.org/downloads/" >&2
  exit 1
}
if ! command -v git >/dev/null 2>&1; then
  echo "git is required." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
REPO_DIR="$INSTALL_DIR/F5-TTS"

emit_progress 12 cloning 'Cloning F5-TTS repository...'
if [[ -d "$REPO_DIR" ]]; then
  cd "$REPO_DIR"
  git pull --rebase >/dev/null 2>&1 || true
else
  cd "$INSTALL_DIR"
  git clone --depth 1 https://github.com/SWivid/F5-TTS.git
  cd "$REPO_DIR"
fi

emit_progress 22 venv 'Creating Python virtual environment...'
"$PYTHON" -m venv venv
VENV_PY="$REPO_DIR/venv/bin/python"

emit_progress 30 deps 'Upgrading pip...'
"$VENV_PY" -m pip install --upgrade pip

emit_progress 40 deps "Installing PyTorch ($GPU_BACKEND backend) - this may take 5-10 minutes..."
case "$GPU_BACKEND" in
  cuda)
    "$VENV_PY" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
    ;;
  rocm)
    "$VENV_PY" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/rocm6.0
    ;;
  directml)
    # DirectML is Windows-only; treat as CPU on macOS/Linux
    "$VENV_PY" -m pip install torch torchaudio
    ;;
  *)
    "$VENV_PY" -m pip install torch torchaudio
    ;;
esac

emit_progress 65 deps 'Installing F5-TTS package...'
"$VENV_PY" -m pip install -e .

emit_progress 80 wrapper 'Installing Aris API wrapper...'
"$VENV_PY" -m pip install fastapi uvicorn numpy

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/api_server.py" "$REPO_DIR/api_server.py"

cat > "$REPO_DIR/start.sh" <<'EOF'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
source venv/bin/activate
exec python -m uvicorn api_server:app --host 127.0.0.1 --port 7860
EOF
chmod +x "$REPO_DIR/start.sh"

emit_progress 95 launching 'Starting F5-TTS server on http://127.0.0.1:7860 ...'
nohup "$REPO_DIR/start.sh" >/tmp/aris-f5tts.log 2>&1 &
disown

emit_progress 100 done 'F5-TTS is starting. Aris will detect it within a few seconds.'
exit 0
