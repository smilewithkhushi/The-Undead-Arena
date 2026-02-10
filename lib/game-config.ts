export const GAME_CONFIG = {
  canvas: { width: 960, height: 540 },
  cart: {
    startY: 494,
    width: 88,
    height: 24,
    moveSpeed: 340
  },
  pea: {
    radius: 21,
    speed: 280,
    fireIntervalMs: 667,
    damage: 1
  },
  zombie: {
    width: 88,
    height: 78,
    health: 3,
    spawnY: 8
  },
  laser: {
    y: 410,
    height: 24,
    width: 960
  }
} as const;

export const LEVEL_CONFIG = {
  1: { zombies: 6, speed: 44, multiplier: null, spawnDelayRangeS: [2.6, 3.8] as const },
  2: { zombies: 14, speed: 64, multiplier: 2, spawnDelayRangeS: [1.6, 2.8] as const },
  3: { zombies: 24, speed: 96, multiplier: 5, spawnDelayRangeS: [1.05, 1.75] as const }
} as const;

export const CRITICAL_EVENT_TYPES = new Set(["laser_destroyed", "level_completed", "level_failed"]);

export type LevelNumber = keyof typeof LEVEL_CONFIG;
