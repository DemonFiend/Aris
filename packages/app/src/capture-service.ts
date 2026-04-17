import { desktopCapturer, nativeImage, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import type { CaptureSource, CaptureConfig, CaptureStatus, ScreenAnalysisContext } from '@aris/shared';
import {
  CAPTURE_FPS_DEFAULT,
  CAPTURE_MAX_WIDTH,
  CAPTURE_MAX_HEIGHT,
  CAPTURE_JPEG_QUALITY,
  AI_ANALYSIS_STALE_SECONDS,
} from '@aris/shared';
import { detectGameFromTitle } from '@aris/vision';
import { loadCaptureSettings, saveScreenshot, pruneScreenshots } from './screenshot-store';

/** Emits 'state-changed' with { active: boolean, sourceName?: string } */
export const captureEvents = new EventEmitter();

let captureInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let analysisInterval: ReturnType<typeof setInterval> | null = null;
let frameCount = 0;
let currentConfig: CaptureConfig | null = null;
let currentSourceName: string | null = null;
let detectedGame: string | undefined;
let latestFrameBuffer: Buffer | null = null;
let savedScreenshotCount = 0;

/** Latest AI screen analysis result */
let latestScreenContext: ScreenAnalysisContext | null = null;
/** Whether an analysis call is currently in-flight */
let analysisInFlight = false;

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

  captureEvents.emit('state-changed', { active: true, sourceName: currentSourceName });
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
  captureEvents.emit('state-changed', { active: false });
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

  // Fix: update latestFrameBuffer so vision:analyze-frame and
  // ai:chat-with-screenshot always have a recent frame
  latestFrameBuffer = buffer;

  const game = detectGameFromTitle(source.name);
  if (game) detectedGame = game;
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

// --- Screen Analysis Pipeline ---

/** Get the latest screen analysis context (null if none or stale). */
export function getScreenContext(): ScreenAnalysisContext | null {
  return latestScreenContext;
}

/** Get non-stale screen context for system prompt injection. */
export function getFreshScreenContext(): ScreenAnalysisContext | null {
  if (!latestScreenContext) return null;
  const ageSeconds = (Date.now() - latestScreenContext.timestamp) / 1000;
  if (ageSeconds > AI_ANALYSIS_STALE_SECONDS) return null;
  return latestScreenContext;
}

/**
 * Start the screen analysis timer. Runs independently of heartbeat capture.
 * Requires a `analyzeFrame` callback injected from ipc-handlers to avoid
 * circular dependency with the provider registry.
 */
export function startScreenAnalysis(
  analyzeFrame: (frame: Buffer, prompt: string) => Promise<{ text: string }>,
): void {
  stopScreenAnalysis();
  const settings = loadCaptureSettings();

  if (
    !settings.screenCaptureConsented ||
    !settings.heartbeatEnabled ||
    !settings.aiScreenAnalysisEnabled
  ) {
    return;
  }

  const intervalMs = Math.max(30_000, settings.aiAnalysisIntervalSeconds * 1000);

  const runAnalysis = async () => {
    if (analysisInFlight) return;
    const frame = latestFrameBuffer;
    if (!frame) return;

    const s = loadCaptureSettings();
    if (!s.aiScreenAnalysisEnabled) return;

    // Resize for AI: lower resolution + quality to save tokens
    let img = nativeImage.createFromBuffer(frame);
    const size = img.getSize();
    if (size.width > s.aiAnalysisMaxWidth) {
      const scale = s.aiAnalysisMaxWidth / size.width;
      img = img.resize({
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
      });
    }
    const compressed = img.toJPEG(s.aiAnalysisQuality);

    analysisInFlight = true;
    try {
      const result = await analyzeFrame(
        compressed,
        'Describe what is on screen. Identify any game, application, or activity visible. Note anything notable happening. Be concise (2-3 sentences max).',
      );

      latestScreenContext = {
        analysis: result.text,
        detectedGame: detectedGame ?? null,
        timestamp: Date.now(),
      };

      // Broadcast to renderer and reaction system
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('vision:context-update', latestScreenContext);
      }
      captureEvents.emit('screen-context-update', latestScreenContext);
    } catch (err) {
      // Skip silently — will retry at next interval
      console.warn('[screen-analysis] Analysis failed:', err instanceof Error ? err.message : err);
    } finally {
      analysisInFlight = false;
    }
  };

  // Run first analysis after a short delay (let heartbeat capture a frame first)
  setTimeout(() => { runAnalysis().catch(() => {}); }, 5000);

  analysisInterval = setInterval(() => {
    runAnalysis().catch(() => {});
  }, intervalMs);
}

export function stopScreenAnalysis(): void {
  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
  }
  latestScreenContext = null;
  analysisInFlight = false;
}
