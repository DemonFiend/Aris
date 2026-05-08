import { useState, useEffect, useCallback, useRef } from 'react';
import type { CameraViewerConfig } from '@aris/shared';
import { DEFAULT_CAMERA_VIEWER_CONFIG } from '@aris/shared';
import { AvatarDisplay } from './AvatarDisplay';
import { CameraViewerChrome } from './components/CameraViewerChrome';
import { CameraViewerSettingsPanel } from './components/CameraViewerSettingsPanel';

export function CameraViewerApp() {
  const [config, setConfig] = useState<CameraViewerConfig>(DEFAULT_CAMERA_VIEWER_CONFIG);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);

  // Load config on mount
  useEffect(() => {
    (async () => {
      try {
        const cfg = (await window.aris.invoke('viewer:get-config')) as CameraViewerConfig | null;
        if (cfg) setConfig(cfg);
      } catch {
        // use default
      }
    })();
  }, []);

  // Subscribe to state-changed from main process
  useEffect(() => {
    const cleanup = window.aris.on?.('viewer:state-changed', (cfg: unknown) => {
      if (cfg) setConfig(cfg as CameraViewerConfig);
    });
    return cleanup;
  }, []);

  const handleConfigChange = useCallback(async (partial: Partial<CameraViewerConfig>) => {
    // Optimistic local update
    setConfig((prev) => ({ ...prev, ...partial }));
    try {
      await window.aris.invoke('viewer:set-config', partial);
    } catch {
      // state-changed will re-sync if needed
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      await window.aris.invoke('viewer:close');
    } catch {
      // no-op
    }
  }, []);

  const handleResetPosition = useCallback(async () => {
    await handleConfigChange({ bounds: undefined });
  }, [handleConfigChange]);

  // Esc: two-step — close settings popover first, then unlock locked layout
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (settingsOpen) {
        e.preventDefault();
        setSettingsOpen(false);
      } else if (config.locked) {
        e.preventDefault();
        handleConfigChange({ locked: false, clickThrough: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, config.locked, handleConfigChange]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        opacity: config.opacity,
        overflow: 'hidden',
        background: config.transparentBg ? 'transparent' : 'var(--bg-canvas)',
      }}
    >
      {/* Avatar */}
      <AvatarDisplay
        cameraMode={config.mode}
        transparentBg={config.transparentBg}
      />

      {/* Chrome bar (hidden when locked) */}
      <CameraViewerChrome
        mode={config.mode}
        isOpen={config.isOpen}
        locked={config.locked}
        onModeChange={(mode) => handleConfigChange({ mode })}
        onOpenSettings={() => setSettingsOpen((v) => !v)}
        onClose={handleClose}
      />

      {/* Settings popover */}
      {settingsOpen && !config.locked && (
        <CameraViewerSettingsPanel
          config={config}
          onConfigChange={handleConfigChange}
          onResetPosition={handleResetPosition}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
