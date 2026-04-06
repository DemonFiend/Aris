import { desktopCapturer, nativeImage, BrowserWindow } from 'electron';
import type { CaptureSource, CaptureConfig, CaptureStatus } from '@aris/shared';
import {
  CAPTURE_FPS_DEFAULT,
  CAPTURE_MAX_WIDTH,
  CAPTURE_MAX_HEIGHT,
  CAPTURE_JPEG_QUALITY,
} from '@aris/shared';
import { detectGameFromTitle } from '@aris/vision';
import { loadCaptureSettings, saveScreenshot, pruneScreenshots } from './screenshot-store';

let captureInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let frameCount = 0;
let currentConfig: CaptureConfig | null = null;
let currentSourceName: string | null = null;
let detectedGame: string | undefined;
let latestFrameBuffer: Buffer | null = null;
let savedScreenshotCount = 0;

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

export async function getSourcesFiltered(mode: 'monitor' | 'window'): Promise<CaptureSource[]> {
  const types: Array<'screen' | 'window'> = mode === 'monitor' ? ['screen'] : ['window'];
  const sources = await desktopCapturer.getSources({
    types,
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

  const settings = loadCaptureSettings();

  currentConfig = {
    sourceId: config.sourceId,
    fps: config.fps ?? settings.fps ?? CAPTURE_FPS_DEFAULT,
    maxWidth: config.maxWidth ?? settings.maxWidth ?? CAPTURE_MAX_WIDTH,
    maxHeight: config.maxHeight ?? settings.maxHeight ?? CAPTURE_MAX_HEIGHT,
    jpegQuality: config.jpegQuality ?? settings.jpegQuality ?? CAPTURE_JPEG_QUALITY,
  };
  currentSourceName = null;
  detectedGame = undefined;
  frameCount = 0;
  savedScreenshotCount = 0;

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
  stopHeartbeat();
  currentConfig = null;
  currentSourceName = null;
  detectedGame = undefined;
  latestFrameBuffer = null;
  frameCount = 0;
  savedScreenshotCount = 0;
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

/** Start heartbeat capture — periodic screenshots for context awareness */
export function startHeartbeat(): void {
  stopHeartbeat();
  const settings = loadCaptureSettings();
  if (!settings.heartbeatEnabled) return;

  const intervalMs = settings.heartbeatIntervalSeconds * 1000;

  heartbeatInterval = setInterval(async () => {
    try {
      await captureHeartbeatFrame();
    } catch {
      // Silently skip failed heartbeat frames
    }
  }, intervalMs);
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

async function captureHeartbeatFrame(): Promise<void> {
  const settings = loadCaptureSettings();

  // Get all screens for heartbeat (captures primary display)
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: settings.maxWidth, height: settings.maxHeight },
  });

  if (sources.length === 0) return;

  // Use preferred source if active capture is running, otherwise primary display
  const source = currentConfig
    ? sources.find((s) => s.id === currentConfig!.sourceId) ?? sources[0]
    : sources[0];

  let img = source.thumbnail;
  const size = img.getSize();

  if (size.width > settings.maxWidth || size.height > settings.maxHeight) {
    const scale = Math.min(settings.maxWidth / size.width, settings.maxHeight / size.height);
    img = img.resize({
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    });
  }

  const buffer = img.toJPEG(settings.jpegQuality);
  const game = detectGameFromTitle(source.name);
  saveScreenshot(buffer, game ?? 'heartbeat');
  pruneScreenshots();
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

  // Save to disk periodically (every 30th frame to avoid excessive writes)
  if (frameCount % 30 === 0) {
    saveScreenshot(latestFrameBuffer, detectedGame);
    savedScreenshotCount++;

    // Prune every 100 saved screenshots
    if (savedScreenshotCount % 100 === 0) {
      pruneScreenshots();
    }
  }

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
