const KNOWN_GAMES: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /League of Legends/i, name: 'League of Legends' },
  { pattern: /VALORANT/i, name: 'VALORANT' },
  { pattern: /Counter-Strike/i, name: 'Counter-Strike' },
  { pattern: /Overwatch/i, name: 'Overwatch' },
  { pattern: /Fortnite/i, name: 'Fortnite' },
  { pattern: /Apex Legends/i, name: 'Apex Legends' },
  { pattern: /Dota 2/i, name: 'Dota 2' },
  { pattern: /Minecraft/i, name: 'Minecraft' },
  { pattern: /Elden Ring/i, name: 'Elden Ring' },
  { pattern: /Dark Souls/i, name: 'Dark Souls' },
  { pattern: /Baldur'?s Gate/i, name: "Baldur's Gate 3" },
  { pattern: /Cyberpunk/i, name: 'Cyberpunk 2077' },
  { pattern: /Genshin Impact/i, name: 'Genshin Impact' },
  { pattern: /Honkai: Star Rail/i, name: 'Honkai: Star Rail' },
  { pattern: /Rocket League/i, name: 'Rocket League' },
  { pattern: /World of Warcraft/i, name: 'World of Warcraft' },
  { pattern: /Final Fantasy/i, name: 'Final Fantasy' },
  { pattern: /Destiny 2/i, name: 'Destiny 2' },
  { pattern: /Hades/i, name: 'Hades' },
  { pattern: /Stardew Valley/i, name: 'Stardew Valley' },
  { pattern: /Terraria/i, name: 'Terraria' },
  { pattern: /Dead by Daylight/i, name: 'Dead by Daylight' },
  { pattern: /Among Us/i, name: 'Among Us' },
  { pattern: /Palworld/i, name: 'Palworld' },
  { pattern: /Helldivers/i, name: 'Helldivers 2' },
];

const GAME_PROCESS_HINTS = [
  /\.exe$/i,
  /UnrealEngine/i,
  /Unity/i,
  /UE4|UE5/i,
  /Steam/i,
];

export function detectGameFromTitle(windowTitle: string): string | undefined {
  for (const { pattern, name } of KNOWN_GAMES) {
    if (pattern.test(windowTitle)) return name;
  }
  return undefined;
}

export function isLikelyGameWindow(windowTitle: string): boolean {
  if (detectGameFromTitle(windowTitle)) return true;
  return GAME_PROCESS_HINTS.some((p) => p.test(windowTitle));
}
