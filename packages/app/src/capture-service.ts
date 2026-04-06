import { desktopCapturer, nativeImage, BrowserWindow } from 'electron';
import type { CaptureSource, CaptureConfig, CaptureStatus } from '@aris/shared';
import {
  CAPTURE_FPS_DEFAULT,
  CAPTURE_MAX_WIDTH,
  CAPTURE_MAX_HEIGHT,
  CAPTURE_JPEG_QUALITY,
} from '@aris/shared';
import { detectGameFromTitle } from '@aris/vision';

let captureInterval: ReturnType<typeof setInterval> | null = null;
let frameCount = 0;
let currentConfig: CaptureConfig | null = null;
let currentSourceName: string | null = null;
let detectedGame: string | undefined;
let latestFrameBuffer: Buffer | null = null;

export async function getSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnailDataUrl: source.thumbnail.toDataURL(),
    isScreen: source.id.startsWith('screen:'),
  }));
}

export function startCapture(config: Partial<CaptureConfig> & { sourceId: string }): void {
  stopCapture();

  currentConfig = {
    sourceId: config.sourceId,
    fps: config.fps ?? CAPTURE_FPS_DEFAULT,
    maxWidth: config.maxWidth ?? CAPTURE_MAX_WIDTH,
    maxHeight: config.maxHeight ?? CAPTURE_MAX_HEIGHT,
    jpegQuality: config.jpegQuality ?? CAPTURE_JPEG_QUALITY,
  };
  currentSourceName = null;
  detectedGame = undefined;
  frameCount = 0;

  const intervalMs = Math.max(100, Math.floor(1000 / currentConfig.fps));

  captureInterval = setInterval(async () => {
    try {
      await captureFrame();
    } catch {
      // Frame capture can fail transiently (e.g. source minimized); skip silently
    }
  }, intervalMs);
}

export function stopCapture(): void {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  currentConfig = null;
  currentSourceName = null;
  detectedGame = undefined;
  latestFrameBuffer = null;
  frameCount = 0;
}

export function getStatus(): CaptureStatus {
  return {
    active: captureInterval !== null,
    sourceId: currentConfig?.sourceId,
    sourceName: currentSourceName ?? undefined,
    fps: currentConfig?.fps ?? CAPTURE_FPS_DEFAULT,
    frameCount,
    detectedGame,
  };
}

export function getLatestFrame(): Buffer | null {
  return latestFrameBuffer;
}

async function captureFrame(): Promise<void> {
  if (!currentConfig) return;

  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: {
      width: currentConfig.maxWidth,
      height: currentConfig.maxHeight,
    },
  });

  const source = sources.find((s) => s.id === currentConfig!.sourceId);
  if (!source) return;

  currentSourceName = source.name;

  // Detect game from window title
  if (!detectedGame) {
    detectedGame = detectGameFromTitle(source.name);
  }

  // Process frame: resize and compress to JPEG
  let img = source.thumbnail;
  const size = img.getSize();

  if (size.width > currentConfig.maxWidth || size.height > currentConfig.maxHeight) {
    const scale = Math.min(
      currentConfig.maxWidth / size.width,
      currentConfig.maxHeight / size.height,
    );
    img = img.resize({
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    });
  }

  latestFrameBuffer = img.toJPEG(currentConfig.jpegQuality);
  frameCount++;

  // Emit frame event to all renderer windows
  const windows = BrowserWindow.getAllWindows();
  const frameDataUrl = `data:image/jpeg;base64,${latestFrameBuffer.toString('base64')}`;
  for (const win of windows) {
    win.webContents.send('vision:frame', {
      dataUrl: frameDataUrl,
      width: img.getSize().width,
      height: img.getSize().height,
      frameNumber: frameCount,
      detectedGame,
      sourceName: currentSourceName,
    });
  }
}
