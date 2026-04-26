import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GpuRuntime } from '@aris/shared';

const execFileAsync = promisify(execFile);

interface ElectronGpuDevice {
  vendorId?: number;
  deviceId?: number;
  vendorString?: string;
  driverVendor?: string;
  active?: boolean;
}

interface ElectronGpuInfo {
  gpuDevice?: ElectronGpuDevice[];
  auxAttributes?: Record<string, unknown>;
}

const VENDOR_ID_TO_NAME: Record<number, string> = {
  0x10de: 'nvidia',
  0x1002: 'amd',
  0x8086: 'intel',
  0x106b: 'apple',
};

function normalizeVendor(device: ElectronGpuDevice): string | null {
  if (typeof device.vendorId === 'number' && VENDOR_ID_TO_NAME[device.vendorId]) {
    return VENDOR_ID_TO_NAME[device.vendorId];
  }
  const raw = (device.vendorString ?? device.driverVendor ?? '').toLowerCase();
  if (!raw) return null;
  if (raw.includes('nvidia')) return 'nvidia';
  if (raw.includes('amd') || raw.includes('advanced micro') || raw.includes('ati ')) return 'amd';
  if (raw.includes('intel')) return 'intel';
  if (raw.includes('apple')) return 'apple';
  return raw;
}

async function probeNvidiaSmi(): Promise<{ ok: boolean; vramMb: number | null }> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=memory.total', '--format=csv,noheader,nounits'],
      { timeout: 4000 },
    );
    const totalMb = stdout
      .split('\n')
      .map((line) => parseInt(line.trim(), 10))
      .filter((n) => Number.isFinite(n))
      .reduce((sum, n) => sum + n, 0);
    return { ok: true, vramMb: totalMb > 0 ? totalMb : null };
  } catch {
    return { ok: false, vramMb: null };
  }
}

async function probeRocmSmi(): Promise<boolean> {
  try {
    await execFileAsync('rocm-smi', ['--version'], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspect the local machine to decide whether GPU-class TTS providers
 * (Fish Speech) are runnable. Used by the TTS settings UI to recommend a
 * default and to gate the GPU provider's Activate button.
 *
 * Best-effort and cached for the lifetime of the process — re-detection
 * requires an app restart.
 */
let cachedRuntime: GpuRuntime | null = null;

export async function getGpuRuntime(): Promise<GpuRuntime> {
  if (cachedRuntime) return cachedRuntime;

  const vendors = new Set<string>();
  let hasGpu = false;

  try {
    const info = (await app.getGPUInfo('complete')) as ElectronGpuInfo;
    const devices = info.gpuDevice ?? [];
    for (const dev of devices) {
      const vendor = normalizeVendor(dev);
      if (vendor) vendors.add(vendor);
      if (vendor && vendor !== 'unknown') hasGpu = true;
    }
  } catch {
    // app.getGPUInfo can throw if called too early; fall back to probes only
  }

  // Probe vendor-specific runtimes in parallel — they're independent.
  const [nvidia, rocm] = await Promise.all([
    vendors.has('nvidia') || vendors.size === 0 ? probeNvidiaSmi() : Promise.resolve({ ok: false, vramMb: null }),
    process.platform === 'linux' && (vendors.has('amd') || vendors.size === 0)
      ? probeRocmSmi()
      : Promise.resolve(false),
  ]);

  if (nvidia.ok) {
    vendors.add('nvidia');
    hasGpu = true;
  }

  const metal = process.platform === 'darwin';
  if (metal) hasGpu = true;

  cachedRuntime = {
    hasGpu,
    vendors: Array.from(vendors).sort(),
    vramMb: nvidia.vramMb,
    cuda: nvidia.ok,
    metal,
    rocm,
  };
  return cachedRuntime;
}

/** Force a fresh probe on the next call. Mainly for tests / settings refresh. */
export function clearGpuRuntimeCache(): void {
  cachedRuntime = null;
}
