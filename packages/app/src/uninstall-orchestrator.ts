import { app } from 'electron';
import { rm, stat } from 'fs/promises';
import * as path from 'path';
import type {
  ServiceName,
  UninstallTarget,
  UninstallTargetId,
  UninstallResult,
  UninstallProgress,
} from '@aris/shared';
import { DATA_DIR } from '@aris/shared';
import { detectAllServices } from './service-detector';
import { wipeAllData } from './data-export';

// ---------------------------------------------------------------------------
// Display metadata for each target
// ---------------------------------------------------------------------------

const TARGET_META: Record<
  UninstallTargetId,
  { displayName: string; description: string }
> = {
  lmstudio: {
    displayName: 'LM Studio',
    description: 'LM Studio application and local model runner.',
  },
  ollama: {
    displayName: 'Ollama',
    description: 'Ollama CLI and local model runner.',
  },
  kokoro: {
    displayName: 'Kokoro TTS',
    description: 'Kokoro FastAPI text-to-speech service.',
  },
  whisper: {
    displayName: 'Whisper STT',
    description: 'Whisper speech-to-text server.',
  },
  'aris-data': {
    displayName: 'Aris Data',
    description:
      'All Aris settings, conversations, game profiles, and screenshots stored locally.',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Given a detected path (exe, bat, binary, or .app), return the directory
 * that should be deleted to fully remove the installation.
 *
 * - `.exe` / `.bat` → parent directory (the install folder)
 * - `.app` bundle → the bundle itself (it's already a directory)
 * - anything else → the file itself (loose binary)
 */
function getRemovalPath(detectedPath: string): string {
  const ext = path.extname(detectedPath).toLowerCase();
  if (ext === '.exe' || ext === '.bat') return path.dirname(detectedPath);
  if (detectedPath.endsWith('.app')) return detectedPath;
  return detectedPath;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect all services and return the list of components the user can choose
 * to remove. The Aris data target is always included (it's always "installed").
 */
export async function getUninstallTargets(): Promise<UninstallTarget[]> {
  const serviceNames: ServiceName[] = ['lmstudio', 'ollama', 'kokoro', 'whisper'];
  const detections = await detectAllServices();

  const targets: UninstallTarget[] = serviceNames.map((name) => {
    const detection = detections.find((d) => d.name === name);
    const meta = TARGET_META[name];
    return {
      id: name,
      displayName: meta.displayName,
      description: meta.description,
      detectedPath: detection?.path ?? null,
      isInstalled: detection?.installed ?? false,
    };
  });

  // Aris data — always present
  targets.push({
    id: 'aris-data',
    displayName: TARGET_META['aris-data'].displayName,
    description: TARGET_META['aris-data'].description,
    detectedPath: app.getPath('userData'),
    isInstalled: true,
  });

  return targets;
}

/**
 * Execute removal for the selected target IDs.
 *
 * @param ids            - Which targets to remove
 * @param onProgress     - Called for each target as it transitions states
 */
export async function performUninstall(
  ids: UninstallTargetId[],
  onProgress: (progress: UninstallProgress) => void,
): Promise<UninstallResult[]> {
  // Build a map for quick lookup
  const targets = await getUninstallTargets();
  const targetMap = new Map(targets.map((t) => [t.id, t]));

  const results: UninstallResult[] = [];

  for (const id of ids) {
    const target = targetMap.get(id);
    if (!target) {
      results.push({ id, status: 'skipped', message: 'Target not found in scan results.' });
      continue;
    }

    const meta = TARGET_META[id];

    onProgress({ id, displayName: meta.displayName, status: 'removing' });

    if (id === 'aris-data') {
      try {
        // Wipe database (conversations, settings, game profiles)
        wipeAllData();

        // Also remove the full data directory (screenshots, keys, exports, etc.)
        const dataDir = path.join(app.getPath('userData'), DATA_DIR);
        await rm(dataDir, { recursive: true, force: true });

        // Remove the avatars directory
        const avatarDir = path.join(app.getPath('userData'), 'avatars');
        await rm(avatarDir, { recursive: true, force: true });

        onProgress({ id, displayName: meta.displayName, status: 'done' });
        results.push({ id, status: 'removed', message: 'Aris data wiped successfully.' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onProgress({ id, displayName: meta.displayName, status: 'failed', message: msg });
        results.push({ id, status: 'failed', message: msg });
      }
      continue;
    }

    // Service target
    if (!target.detectedPath) {
      onProgress({ id, displayName: meta.displayName, status: 'done', message: 'Not detected on this machine.' });
      results.push({ id, status: 'not-found', message: 'No installation detected — nothing to remove.' });
      continue;
    }

    const removalPath = getRemovalPath(target.detectedPath);

    try {
      // Check the path actually exists before attempting removal
      await stat(removalPath);

      await rm(removalPath, { recursive: true, force: true });
      onProgress({ id, displayName: meta.displayName, status: 'done' });
      results.push({ id, status: 'removed', message: `Removed ${removalPath}` });
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        onProgress({ id, displayName: meta.displayName, status: 'done', message: 'Path no longer exists.' });
        results.push({ id, status: 'not-found', message: 'Installation path was not found — already removed?' });
      } else {
        const msg = nodeErr instanceof Error ? nodeErr.message : String(nodeErr);
        onProgress({ id, displayName: meta.displayName, status: 'failed', message: msg });
        results.push({ id, status: 'failed', message: msg });
      }
    }
  }

  return results;
}
