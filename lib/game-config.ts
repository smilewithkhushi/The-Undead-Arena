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
    spawnY: -74
  },
  laser: {
    y: 410,
    height: 24,
    width: 960
  }
} as const;

export const LEVEL_COUNT = 21;
export const FIBONACCI_LEVELS = [3, 5, 8, 13, 21] as const;

export type LevelConfig = {
  zombies: number;
  speed: number;
  multiplier: number | null;
  spawnDelayRangeS: readonly [number, number];
};

export const LEVEL_CONFIG: Record<number, LevelConfig> = Object.fromEntries(
  Array.from({ length: LEVEL_COUNT }, (_, index) => {
    const level = index + 1;
    const zombies = 10 + (level - 1) * 3;
    const speed = Math.round(36 + level * 3.6);
    const minDelay = Math.max(0.7, 2.8 - level * 0.08);
    const maxDelay = Math.max(minDelay + 0.2, 4.0 - level * 0.11);

    const multiplier =
      level === 1
        ? null
        : level <= 10
          ? 2
          : 3;

    return [
      level,
      {
        zombies,
        speed,
        multiplier,
        spawnDelayRangeS: [Number(minDelay.toFixed(2)), Number(maxDelay.toFixed(2))]
      }
    ];
  })
);

export const CRITICAL_EVENT_TYPES = new Set(["laser_destroyed", "level_completed", "level_failed"]);

export type LevelNumber = number;
