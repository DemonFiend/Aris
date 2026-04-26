"""
Minimal OpenAI-compatible API wrapper for F5-TTS, installed by Aris's
Quick Install flow. Exposes:

    POST /v1/audio/speech  - synthesize text using a reference voice
    GET  /v1/voices        - list available reference voices
    GET  /v1/health        - readiness check for service detection

The default reference voice is the one F5-TTS bundles for inference
examples; users can swap it out via Aris's voice cloning settings
(future work — see ARI-o0r) by dropping a clip in references/.
"""
from __future__ import annotations

import io
import wave
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import numpy as np


# ---------------------------------------------------------------------------
# Lazy model load — F5TTS init can take 5-15s, defer until first request so
# `/v1/health` answers fast and Aris's service detector picks the server up.
# ---------------------------------------------------------------------------
_tts = None


def _get_tts():
    global _tts
    if _tts is None:
        from f5_tts.api import F5TTS  # type: ignore[import-not-found]
        _tts = F5TTS()
    return _tts


def _find_default_reference() -> tuple[str | None, str]:
    """Locate the bundled F5-TTS reference clip + transcript.

    Returns (audio_path, transcript). If no clip is found, returns (None, '').
    """
    try:
        import f5_tts  # type: ignore[import-not-found]
    except ImportError:
        return None, ''

    pkg_root = Path(f5_tts.__file__).parent
    candidates = [
        pkg_root / 'infer' / 'examples' / 'basic' / 'basic_ref_en.wav',
        pkg_root / 'infer' / 'examples' / 'basic_ref_en.wav',
    ]
    for path in candidates:
        if path.exists():
            transcript = (
                'Some call me nature, others call me mother nature.'
            )
            return str(path), transcript
    return None, ''


DEFAULT_REF_AUDIO, DEFAULT_REF_TEXT = _find_default_reference()

app = FastAPI(title='Aris F5-TTS Wrapper', version='0.1.0')


class SpeechRequest(BaseModel):
    model: str = 'f5-tts'
    input: str
    voice: str | None = None
    response_format: str = 'wav'
    speed: float = 1.0


@app.get('/v1/health')
def health() -> dict[str, object]:
    return {
        'status': 'ok',
        'has_default_voice': DEFAULT_REF_AUDIO is not None,
    }


@app.get('/v1/voices')
def voices() -> dict[str, list[str]]:
    return {'voices': ['default'] if DEFAULT_REF_AUDIO else []}


@app.post('/v1/audio/speech')
def synthesize(req: SpeechRequest) -> Response:
    if not DEFAULT_REF_AUDIO:
        raise HTTPException(
            status_code=503,
            detail=(
                'No reference voice available. F5-TTS needs a reference clip '
                'to synthesize. Add one via Aris voice settings.'
            ),
        )

    try:
        tts = _get_tts()
        wav, sr, _ = tts.infer(
            ref_text=DEFAULT_REF_TEXT,
            ref_file=DEFAULT_REF_AUDIO,
            gen_text=req.input,
            speed=req.speed,
        )
    except Exception as exc:  # noqa: BLE001 — surface upstream errors verbatim
        raise HTTPException(status_code=500, detail=f'F5-TTS inference failed: {exc}')

    # F5-TTS returns float32 audio in roughly [-1, 1]; encode as a 16-bit WAV
    # so the renderer can play it through the standard HTMLAudioElement.
    samples = np.asarray(wav, dtype=np.float32)
    samples = np.clip(samples, -1.0, 1.0)
    pcm16 = (samples * 32767.0).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(int(sr))
        f.writeframes(pcm16.tobytes())

    return Response(content=buf.getvalue(), media_type='audio/wav')
