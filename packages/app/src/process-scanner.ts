import { execFile } from 'child_process';

/** Map of executable names to game display names */
const KNOWN_GAME_EXECUTABLES: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /LeagueClient|League of Legends/i, name: 'League of Legends' },
  { pattern: /VALORANT/i, name: 'VALORANT' },
  { pattern: /csgo|cs2/i, name: 'Counter-Strike' },
  { pattern: /Overwatch/i, name: 'Overwatch' },
  { pattern: /FortniteClient|FortniteLauncher/i, name: 'Fortnite' },
  { pattern: /r5apex/i, name: 'Apex Legends' },
  { pattern: /dota2/i, name: 'Dota 2' },
  { pattern: /Minecraft|javaw/i, name: 'Minecraft' },
  { pattern: /eldenring/i, name: 'Elden Ring' },
  { pattern: /DarkSouls/i, name: 'Dark Souls' },
  { pattern: /bg3/i, name: "Baldur's Gate 3" },
  { pattern: /Cyberpunk2077/i, name: 'Cyberpunk 2077' },
  { pattern: /GenshinImpact/i, name: 'Genshin Impact' },
  { pattern: /StarRail/i, name: 'Honkai: Star Rail' },
  { pattern: /RocketLeague/i, name: 'Rocket League' },
  { pattern: /Wow|WorldOfWarcraft/i, name: 'World of Warcraft' },
  { pattern: /ffxiv|ffxv|ff7/i, name: 'Final Fantasy' },
  { pattern: /destiny2/i, name: 'Destiny 2' },
  { pattern: /Hades/i, name: 'Hades' },
  { pattern: /Stardew/i, name: 'Stardew Valley' },
  { pattern: /Terraria/i, name: 'Terraria' },
  { pattern: /DeadByDaylight/i, name: 'Dead by Daylight' },
  { pattern: /Among Us/i, name: 'Among Us' },
  { pattern: /Palworld/i, name: 'Palworld' },
  { pattern: /helldivers/i, name: 'Helldivers 2' },
  // Common launchers (not games but useful context)
  { pattern: /steam\.exe/i, name: 'Steam' },
  { pattern: /EpicGamesLauncher/i, name: 'Epic Games' },
  { pattern: /Battle\.net/i, name: 'Battle.net' },
];

let cachedGames: string[] = [];
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 60_000; // Max once per 60s

/** Get list of running processes. Windows uses tasklist, others use ps. */
function getProcessList(): Promise<string[]> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 10_000 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        // Parse CSV: "process.exe","PID","Session","Session#","Mem"
        const names = stdout
          .split('\n')
          .map((line) => {
            const match = line.match(/^"([^"]+)"/);
            return match ? match[1] : '';
          })
          .filter(Boolean);
        resolve([...new Set(names)]);
      });
    } else {
      execFile('ps', ['-eo', 'comm'], { timeout: 10_000 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const names = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
        resolve([...new Set(names)]);
      });
    }
  });
}

/** Scan running processes and return detected game names. Cached for 60s. */
export async function scanForRunningGames(): Promise<string[]> {
  const now = Date.now();
  if (now - lastScanTime < SCAN_COOLDOWN_MS) return cachedGames;

  const processes = await getProcessList();
  const detected = new Set<string>();

  for (const proc of processes) {
    for (const { pattern, name } of KNOWN_GAME_EXECUTABLES) {
      if (pattern.test(proc)) {
        detected.add(name);
        break;
      }
    }
  }

  cachedGames = [...detected];
  lastScanTime = now;
  return cachedGames;
}

/** Get the cached result without triggering a new scan. */
export function getCachedRunningGames(): string[] {
  return cachedGames;
}
