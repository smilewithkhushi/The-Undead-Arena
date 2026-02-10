"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventClient } from "@/lib/event-client";
import { FIBONACCI_LEVELS, GAME_CONFIG, LEVEL_CONFIG, LEVEL_COUNT, type LevelNumber } from "@/lib/game-config";

type GameStatus = "idle" | "running" | "won" | "lost" | "finished";
type PlantType = "basic" | "double" | "triple";
type ZombieKind = "rotter" | "ironhead" | "drdecay" | "shambler" | "catalyst";

interface Pea {
  id: number;
  x: number;
  y: number;
  wasMultiplied: boolean;
  hasCrossedLaser: boolean;
  speedFactor: number;
}

interface Zombie {
  id: number;
  kind: ZombieKind;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
  aliveMs: number;
  bucketBroken?: boolean;
}

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const CANVAS_W = GAME_CONFIG.canvas.width;
const CANVAS_H = GAME_CONFIG.canvas.height;
const LOSS_LINE_Y = CANVAS_H - 14;
const MAX_ACTIVE_PEAS = 160;

const ARENA_TOP_Y = 62;
const ARENA_BOTTOM_Y = CANVAS_H - 12;
const ARENA_TOP_WIDTH = 250;
const ARENA_BOTTOM_WIDTH = CANVAS_W - 34;

const UNLOCK_STORAGE_KEY = "pvza_unlocked_plants";
const CATALYST_KILLS_STORAGE_KEY = "pvza_catalyst_kills";
const ALL_PLANTS: PlantType[] = ["basic", "double", "triple"];

const spritePaths = {
  plantBasic: "/assets/front/plant-basic.png",
  plantDouble: "/assets/front/plant-double.png",
  plantTriple: "/assets/back/plant-triple.png",
  zombieRotter: "/assets/zombie-rotter.png",
  zombieIronhead: "/assets/zombie-ironhead.png",
  zombieDrdecay: "/assets/zombie-drdecay.png",
  zombieShambler: "/assets/zombie-shambler.png",
  zombieCatalyst: "/assets/zombie-catalyst.png"
} as const;

function getPlantSpritePath(plant: PlantType): string {
  if (plant === "double") return spritePaths.plantDouble;
  if (plant === "triple") return spritePaths.plantTriple;
  return spritePaths.plantBasic;
}

function getPlantLabel(plant: PlantType): string {
  if (plant === "double") return "Double Shooter";
  if (plant === "triple") return "Triple Shooter";
  return "Basic Shooter";
}

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const eventClientRef = useRef<EventClient | null>(null);
  const keysRef = useRef({ left: false, right: false });
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});

  const [level, setLevel] = useState<LevelNumber>(1);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [laserActive, setLaserActive] = useState<boolean>(true);
  const [zombiesKilled, setZombiesKilled] = useState<number>(0);
  const [zombiesRemaining, setZombiesRemaining] = useState<number>(LEVEL_CONFIG[1].zombies);

  const [unlockedPlants, setUnlockedPlants] = useState<PlantType[]>(["basic"]);
  const [activePlant, setActivePlant] = useState<PlantType>("basic");
  const [plantSelectionForModal, setPlantSelectionForModal] = useState<PlantType>("basic");
  const [plantModalLevel, setPlantModalLevel] = useState<number | null>(null);
  const [catalystKills, setCatalystKills] = useState<number>(0);
  const [unlockNotice, setUnlockNotice] = useState<string | null>(null);

  const runtimeRef = useRef({
    cartX: CANVAS_W / 2 - GAME_CONFIG.cart.width / 2,
    peas: [] as Pea[],
    zombies: [] as Zombie[],
    sparkles: [] as Sparkle[],
    nextPeaId: 1,
    nextZombieId: 1,
    msSinceShot: 0,
    doubleSecondDelayMs: 0,
    doubleSecondPending: false,
    msSinceSpawn: 0,
    nextSpawnMs: 0,
    spawned: 0,
    killed: 0,
    hits: 0,
    peasFired: 0,
    startedAt: 0,
    lastFrameTs: 0,
    levelFailed: false,
    laserDestroyedAtWave: null as number | null,
    laserActive: true,
    previousCartX: CANVAS_W / 2 - GAME_CONFIG.cart.width / 2,
    panicMeter: 0,
    threatDetectedAt: null as number | null,
    threatResponseLogged: false,
    catalystSpawned: false,
    shamblerSpawned: false
  });

  const levelCfg = useMemo(() => LEVEL_CONFIG[level], [level]);
  const score = zombiesKilled * 125 + (laserActive && LEVEL_CONFIG[level].multiplier ? 200 : 0);

  useEffect(() => {
    const stored = window.localStorage.getItem(UNLOCK_STORAGE_KEY);
    const storedKills = window.localStorage.getItem(CATALYST_KILLS_STORAGE_KEY);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as PlantType[];
        const safe = ALL_PLANTS.filter((p) => parsed.includes(p));
        if (safe.length) {
          setUnlockedPlants(safe);
          setActivePlant(safe[safe.length - 1]);
          setPlantSelectionForModal(safe[safe.length - 1]);
        }
      } catch {
        // ignore invalid local data
      }
    }

    if (storedKills) {
      const parsedKills = Number(storedKills);
      if (Number.isFinite(parsedKills)) {
        setCatalystKills(parsedKills);
      }
    }
  }, []);

  useEffect(() => {
    const map: Record<string, HTMLImageElement> = {};
    for (const [key, path] of Object.entries(spritePaths)) {
      const img = new Image();
      img.src = path;
      map[key] = img;
    }
    imagesRef.current = map;
  }, []);

  const persistUnlocks = (plants: PlantType[], kills: number) => {
    window.localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(plants));
    window.localStorage.setItem(CATALYST_KILLS_STORAGE_KEY, String(kills));
  };

  const randBetweenMs = (minS: number, maxS: number): number => {
    const seconds = Math.random() * (maxS - minS) + minS;
    return seconds * 1000;
  };

  const queueLevelStart = (levelNumber: number) => {
    setPlantSelectionForModal(activePlant);
    setPlantModalLevel(levelNumber);
  };

  const startLevel = useCallback((levelNumber: LevelNumber, plant: PlantType) => {
    setLevel(levelNumber);
    setStatus("running");
    setActivePlant(plant);
    setLaserActive(LEVEL_CONFIG[levelNumber].multiplier !== null);
    setZombiesKilled(0);
    setZombiesRemaining(LEVEL_CONFIG[levelNumber].zombies);
    setPlantModalLevel(null);

    runtimeRef.current = {
      cartX: CANVAS_W / 2 - GAME_CONFIG.cart.width / 2,
      peas: [],
      zombies: [],
      sparkles: [],
      nextPeaId: 1,
      nextZombieId: 1,
      msSinceShot: 0,
      doubleSecondDelayMs: 0,
      doubleSecondPending: false,
      msSinceSpawn: 0,
      nextSpawnMs: randBetweenMs(
        LEVEL_CONFIG[levelNumber].spawnDelayRangeS[0],
        LEVEL_CONFIG[levelNumber].spawnDelayRangeS[1]
      ),
      spawned: 0,
      killed: 0,
      hits: 0,
      peasFired: 0,
      startedAt: performance.now(),
      lastFrameTs: performance.now(),
      levelFailed: false,
      laserDestroyedAtWave: null,
      laserActive: LEVEL_CONFIG[levelNumber].multiplier !== null,
      previousCartX: CANVAS_W / 2 - GAME_CONFIG.cart.width / 2,
      panicMeter: 0,
      threatDetectedAt: null,
      threatResponseLogged: false,
      catalystSpawned: false,
      shamblerSpawned: false
    };

    eventClientRef.current?.track(levelNumber, "level_started", {
      level: levelNumber,
      active_plant: plant
    });
  }, []);

  useEffect(() => {
    const client = new EventClient();
    client.start();
    eventClientRef.current = client;

    return () => {
      client.stop();
      eventClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") {
        keysRef.current.left = true;
      }
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") {
        keysRef.current.right = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") {
        keysRef.current.left = false;
      }
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") {
        keysRef.current.right = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const loop = (ts: number) => {
      const rt = runtimeRef.current;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const deltaMs = Math.min(50, ts - rt.lastFrameTs || 16);
      rt.lastFrameTs = ts;
      const deltaSec = deltaMs / 1000;

      if (status === "running") {
        const previousCartX = rt.cartX;

        if (keysRef.current.left) rt.cartX -= GAME_CONFIG.cart.moveSpeed * deltaSec;
        if (keysRef.current.right) rt.cartX += GAME_CONFIG.cart.moveSpeed * deltaSec;

        rt.cartX = Math.max(0, Math.min(CANVAS_W - GAME_CONFIG.cart.width, rt.cartX));

        const laserThreats = rt.zombies.filter((zombie) => {
          if (!rt.laserActive) return false;
          const zombieBottom = zombie.y + getZombieHeight(zombie.kind);
          return zombieBottom < GAME_CONFIG.laser.y && GAME_CONFIG.laser.y - zombieBottom <= 130;
        });

        const threatActive = laserThreats.length > 0;
        const nearestThreatX = threatActive
          ? laserThreats.reduce((closest, current) => {
              const currentX = current.x + getZombieWidth(current.kind) / 2;
              const closestX = closest.x + getZombieWidth(closest.kind) / 2;
              return Math.abs(currentX - rt.cartX) < Math.abs(closestX - rt.cartX) ? current : closest;
            }).x + getZombieWidth(laserThreats[0].kind) / 2
          : null;

        const moveDistance = Math.abs(rt.cartX - previousCartX);
        if (moveDistance > 0.01) {
          const towardThreat =
            nearestThreatX === null
              ? false
              : Math.abs(rt.cartX + GAME_CONFIG.cart.width / 2 - nearestThreatX) <
                Math.abs(previousCartX + GAME_CONFIG.cart.width / 2 - nearestThreatX);

          eventClientRef.current?.track(level, "cart_moved", {
            from_x: Math.round(previousCartX),
            to_x: Math.round(rt.cartX),
            distance: Number(moveDistance.toFixed(2)),
            threat_active: threatActive,
            toward_threat: towardThreat
          });

          if (threatActive && towardThreat) {
            eventClientRef.current?.track(level, "laser_protected", {
              threatening_zombies: laserThreats.length,
              cart_x: Math.round(rt.cartX)
            });
          }

          rt.panicMeter = Math.max(0, rt.panicMeter * 0.92) + moveDistance;
          if (rt.panicMeter > 260) {
            eventClientRef.current?.track(level, "panic_detected", {
              panic_meter: Number(rt.panicMeter.toFixed(2)),
              threat_active: threatActive
            });
            rt.panicMeter = 0;
          }

          if (threatActive && towardThreat && rt.threatDetectedAt !== null && !rt.threatResponseLogged) {
            eventClientRef.current?.track(level, "laser_threat_response", {
              reaction_time_ms: Math.max(0, Math.round(ts - rt.threatDetectedAt))
            });
            rt.threatResponseLogged = true;
          }
        }

        if (threatActive && rt.threatDetectedAt === null) {
          rt.threatDetectedAt = ts;
          rt.threatResponseLogged = false;
          eventClientRef.current?.track(level, "laser_threat_detected", {
            threatening_zombies: laserThreats.length
          });
        }

        if (!threatActive) {
          rt.threatDetectedAt = null;
          rt.threatResponseLogged = false;
        }

        rt.previousCartX = rt.cartX;

        rt.msSinceShot += deltaMs;

        if (activePlant === "double") {
          if (rt.doubleSecondPending) {
            rt.doubleSecondDelayMs -= deltaMs;
            if (rt.doubleSecondDelayMs <= 0) {
              spawnPea(rt, rt.cartX + GAME_CONFIG.cart.width / 2, GAME_CONFIG.cart.startY - GAME_CONFIG.cart.height, false, 1, level, eventClientRef.current);
              rt.doubleSecondPending = false;
            }
          }

          if (rt.msSinceShot >= GAME_CONFIG.pea.fireIntervalMs && !rt.doubleSecondPending) {
            rt.msSinceShot = 0;
            spawnPea(rt, rt.cartX + GAME_CONFIG.cart.width / 2, GAME_CONFIG.cart.startY - GAME_CONFIG.cart.height, false, 1, level, eventClientRef.current);
            rt.doubleSecondPending = true;
            rt.doubleSecondDelayMs = 500;
          }
        } else if (rt.msSinceShot >= GAME_CONFIG.pea.fireIntervalMs) {
          rt.msSinceShot = 0;

          if (activePlant === "basic") {
            spawnPea(rt, rt.cartX + GAME_CONFIG.cart.width / 2, GAME_CONFIG.cart.startY - GAME_CONFIG.cart.height, false, 1, level, eventClientRef.current);
          } else {
            const baseX = rt.cartX + GAME_CONFIG.cart.width / 2;
            spawnPea(rt, baseX - 28, GAME_CONFIG.cart.startY - GAME_CONFIG.cart.height, false, 1, level, eventClientRef.current);
            spawnPea(rt, baseX, GAME_CONFIG.cart.startY - GAME_CONFIG.cart.height, false, 1, level, eventClientRef.current);
            spawnPea(rt, baseX + 28, GAME_CONFIG.cart.startY - GAME_CONFIG.cart.height, false, 1, level, eventClientRef.current);
          }
        }

        rt.msSinceSpawn += deltaMs;
        if (rt.spawned < levelCfg.zombies && rt.msSinceSpawn >= rt.nextSpawnMs) {
          rt.msSinceSpawn = 0;
          rt.nextSpawnMs = randBetweenMs(levelCfg.spawnDelayRangeS[0], levelCfg.spawnDelayRangeS[1]);

          const spawnIndex = rt.spawned;
          const kind = pickZombieKind(level, spawnIndex, levelCfg.zombies, {
            catalystSpawned: rt.catalystSpawned,
            shamblerSpawned: rt.shamblerSpawned
          });

          if (kind === "catalyst") rt.catalystSpawned = true;
          if (kind === "shambler") rt.shamblerSpawned = true;

          const zombie = createZombie(kind, rt.nextZombieId++, levelCfg.speed);
          zombie.x = Math.random() * (CANVAS_W - getZombieWidth(kind));
          zombie.y = Math.max(0, GAME_CONFIG.zombie.spawnY);
          rt.zombies.push(zombie);
          rt.spawned += 1;
        }

        const multiplier = levelCfg.multiplier;
        const laserY = GAME_CONFIG.laser.y;

        const updatedPeas: Pea[] = [];
        for (const pea of rt.peas) {
          const nextY = pea.y - GAME_CONFIG.pea.speed * pea.speedFactor * deltaSec;
          const crossedLaser =
            multiplier !== null &&
            rt.laserActive &&
            !pea.hasCrossedLaser &&
            pea.y > laserY &&
            nextY <= laserY;

          if (crossedLaser) {
            const cloneCount = multiplier;
            const verticalGap = 36;

            for (let i = 0; i < cloneCount; i += 1) {
              updatedPeas.push({
                id: rt.nextPeaId++,
                x: Math.max(GAME_CONFIG.pea.radius, Math.min(CANVAS_W - GAME_CONFIG.pea.radius, pea.x)),
                y: nextY + i * verticalGap,
                wasMultiplied: true,
                hasCrossedLaser: true,
                speedFactor: i === 0 ? 1 : 0.72
              });
            }

            rt.sparkles.push(...createSparkles(pea.x, laserY));

            eventClientRef.current?.track(level, "pea_multiplied", {
              multiplier,
              resulting_peas: cloneCount
            });
            continue;
          }

          if (nextY >= 0) {
            pea.y = nextY;
            updatedPeas.push(pea);
          }
        }

        if (updatedPeas.length > MAX_ACTIVE_PEAS) {
          updatedPeas.splice(0, updatedPeas.length - MAX_ACTIVE_PEAS);
        }
        rt.peas = updatedPeas;

        const zombieKeep: Zombie[] = [];
        for (const zombie of rt.zombies) {
          zombie.y += zombie.speed * deltaSec;
          zombie.aliveMs += deltaMs;

          if (rt.laserActive) {
            const touchesLaser =
              zombie.y <= GAME_CONFIG.laser.y + GAME_CONFIG.laser.height &&
              zombie.y + getZombieHeight(zombie.kind) >= GAME_CONFIG.laser.y;
            if (touchesLaser) {
              rt.laserActive = false;
              setLaserActive(false);
              const progress = (rt.spawned / levelCfg.zombies) * 100;
              rt.laserDestroyedAtWave = progress;

              if (multiplier !== null) {
                eventClientRef.current?.track(level, "laser_destroyed", {
                  zombie_id: zombie.id,
                  multiplier_lost: multiplier,
                  wave_progress_percent: Number(progress.toFixed(2)),
                  zombies_remaining: levelCfg.zombies - rt.killed
                });
              }
            }
          }

          if (zombie.y + getZombieHeight(zombie.kind) >= LOSS_LINE_Y) {
            rt.levelFailed = true;
            setStatus("lost");
            const remaining = levelCfg.zombies - rt.killed;
            setZombiesRemaining(remaining);
            eventClientRef.current?.track(level, "level_failed", {
              zombies_killed: rt.killed,
              zombies_remaining: remaining,
              laser_status: rt.laserActive ? "intact" : "destroyed",
              score: rt.killed * 125 + (rt.laserActive && multiplier !== null ? 200 : 0)
            });
          }

          if (!rt.levelFailed) zombieKeep.push(zombie);
        }
        rt.zombies = zombieKeep;

        const alivePeas: Pea[] = [];
        const aliveZombies = [...rt.zombies];

        for (const pea of rt.peas) {
          let consumed = false;
          for (const zombie of aliveZombies) {
            const hitZombie = circleHitsRect(
              pea.x,
              pea.y,
              GAME_CONFIG.pea.radius,
              zombie.x,
              zombie.y,
              getZombieWidth(zombie.kind),
              getZombieHeight(zombie.kind)
            );

            if (!hitZombie) continue;

            consumed = true;
            zombie.health -= GAME_CONFIG.pea.damage;
            rt.hits += 1;

            eventClientRef.current?.track(level, "pea_hit_zombie", {
              zombie_id: zombie.id,
              zombie_health_remaining: zombie.health,
              was_multiplied: pea.wasMultiplied,
              zombie_kind: zombie.kind
            });

            if (zombie.health <= 0) {
              rt.killed += 1;
              setZombiesKilled(rt.killed);
              setZombiesRemaining(levelCfg.zombies - rt.killed);

              eventClientRef.current?.track(level, "zombie_killed", {
                zombie_id: zombie.id,
                time_alive_seconds: Number((zombie.aliveMs / 1000).toFixed(2)),
                killed_by_multiplied_pea: pea.wasMultiplied,
                zombie_kind: zombie.kind
              });

              if (zombie.kind === "catalyst") {
                const nextKills = catalystKills + 1;
                setCatalystKills(nextKills);

                let nextUnlocked = [...unlockedPlants];
                let message: string | null = null;

                if (nextKills === 1 && !nextUnlocked.includes("double")) {
                  nextUnlocked.push("double");
                  message = "Catalyst dropped upgrade: Double Shooter unlocked!";
                } else if (nextKills === 2 && !nextUnlocked.includes("triple")) {
                  nextUnlocked.push("triple");
                  message = "Catalyst dropped upgrade: Triple Shooter unlocked!";
                }

                if (message) {
                  setUnlockNotice(message);
                  setUnlockedPlants(nextUnlocked);
                  persistUnlocks(nextUnlocked, nextKills);
                } else {
                  persistUnlocks(unlockedPlants, nextKills);
                }
              }
            }

            break;
          }

          if (!consumed) alivePeas.push(pea);
        }

        rt.peas = alivePeas;
        rt.zombies = aliveZombies.filter((zombie) => zombie.health > 0);
        rt.sparkles = updateSparkles(rt.sparkles, deltaSec);

        if (!rt.levelFailed && rt.killed >= levelCfg.zombies) {
          const levelFinished = level >= LEVEL_COUNT;
          setStatus(levelFinished ? "finished" : "won");

          const duration = (performance.now() - rt.startedAt) / 1000;
          const accuracy = rt.peasFired ? (rt.hits / rt.peasFired) * 100 : 0;

          eventClientRef.current?.track(level, "level_completed", {
            duration_seconds: Number(duration.toFixed(2)),
            peas_fired: rt.peasFired,
            accuracy_percent: Number(accuracy.toFixed(2)),
            laser_status: levelCfg.multiplier === null ? "not_present" : rt.laserActive ? "intact" : "destroyed",
            score: rt.killed * 125 + (rt.laserActive && levelCfg.multiplier !== null ? 200 : 0)
          });
        }
      } else {
        runtimeRef.current.sparkles = updateSparkles(runtimeRef.current.sparkles, deltaSec);
      }

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawScene(ctx, runtimeRef.current, level, ts, activePlant, imagesRef.current);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [activePlant, catalystKills, level, levelCfg, status, unlockedPlants]);

  return (
    <section className="panel">
      <h1 className="game-title">Plants vs Zombies Arena</h1>
      <p className="muted">Shoot zombies and protect your base from being infected!</p>

      <div className="hud-top">
        <div className="score-display">🌻 Score: <span className="score-number">{score.toLocaleString()}</span></div>
        <div className="level-indicator">Level <span className="level-number">{level}</span></div>
        <div className="zombies-remaining">🧟 Left: <span className="zombie-count">{zombiesRemaining}</span></div>
      </div>

      <div className="hud" style={{ marginBottom: 8 }}>
        <span>Plant: {getPlantLabel(activePlant)}</span>
        <span>Unlocked: {unlockedPlants.map(getPlantLabel).join(", ")}</span>
        <span>Catalyst kills: {catalystKills}</span>
      </div>

      <div className="gameFrameWrap">
        <div className="gameFrame">
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="gameCanvas" />

          {(status === "won" || status === "lost" || status === "finished") && (
            <div className="modal-overlay">
              <div className="level-complete-modal">
                <h2 className="level-complete-title">
                  {status === "lost" ? "Game Over" : status === "finished" ? "You Win" : "Level Clear"}
                </h2>
                <p>
                  {status === "lost"
                    ? "A zombie reached your base."
                    : `Score ${score.toLocaleString()} | Zombies down ${zombiesKilled}`}
                </p>
              </div>
            </div>
          )}

          {plantModalLevel !== null && (
            <div className="modal-overlay">
              <div className="level-complete-modal" style={{ width: "min(92%, 760px)" }}>
                <h2 className="level-complete-title" style={{ fontSize: "clamp(28px,6vw,44px)" }}>
                  Select Plant
                </h2>
                <p className="text-[16px] md:text-[17px]">Choose active plant for Level {plantModalLevel}. Default keeps previous plant.</p>

                <div className="mt-4 flex w-full items-stretch justify-start gap-3 overflow-x-auto pb-2">
                  {unlockedPlants.map((plant) => (
                    <div
                      key={plant}
                      className={"flex min-w-[140px] flex-col items-center gap-2 rounded-2xl border-2 p-2 " +
                        (plantSelectionForModal === plant
                          ? "border-[#1f6f31] bg-white/25 ring-2 ring-[#37b24d]/50"
                          : "border-white/40 bg-white/10")}
                      style={{
                        backgroundColor: plantSelectionForModal === plant
                          ? undefined
                          : plant === "basic"
                            ? "#ecfdf5"
                            : plant === "double"
                              ? "#eff6ff"
                              : "#f5f3ff",
                        borderColor: plantSelectionForModal === plant
                          ? undefined
                          : plant === "basic"
                            ? "#34d399"
                            : plant === "double"
                              ? "#60a5fa"
                              : "#a78bfa"
                      }}
                    >
                      <img
                        src={getPlantSpritePath(plant)}
                        alt={getPlantLabel(plant)}
                        className="h-14 w-16 object-contain drop-shadow-[0_3px_4px_rgba(0,0,0,0.25)]"
                        loading="lazy"
                      />
                      <button
                        className={(plantSelectionForModal === plant ? "btn-primary" : "btn-game") + " px-4 py-2 text-[13px] md:text-[14px]"}
                        onClick={() => setPlantSelectionForModal(plant)}
                      >
                        {getPlantLabel(plant)}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="actions" style={{ marginTop: 14 }}>
                  <button className="btn-primary" onClick={() => startLevel(plantModalLevel, plantSelectionForModal)}>
                    Start Level {plantModalLevel}
                  </button>
                </div>
              </div>
            </div>
          )}

          {unlockNotice && (
            <div className="modal-overlay" onClick={() => setUnlockNotice(null)}>
              <div className="level-complete-modal">
                <h2 className="level-complete-title" style={{ fontSize: "clamp(26px,5vw,40px)" }}>
                  Upgrade Unlocked
                </h2>
                <p>{unlockNotice}</p>
                <div className="actions">
                  <button className="btn-primary" onClick={() => setUnlockNotice(null)}>Continue</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {LEVEL_CONFIG[level].multiplier !== null && (
        <div className="laser-status">
          <span className="laser-icon">⚡</span>
          <span className="laser-multiplier">{`x${LEVEL_CONFIG[level].multiplier}`}</span>
          <span>SHIELD {laserActive ? "ACTIVE" : "BROKEN"}</span>
        </div>
      )}

      <div className="hud">
        <span>Status: {status}</span>
        <span>Killed: {zombiesKilled}</span>
        <span>Remaining: {zombiesRemaining}</span>
        {LEVEL_CONFIG[level].multiplier !== null && (
          <span>Shield: {laserActive ? "Intact" : "Destroyed"}</span>
        )}
      </div>

      <div className="actions">
        <button className="btn-game" onClick={() => queueLevelStart(level)}>Start / Restart Level {level}</button>
        {status === "won" && level < LEVEL_COUNT ? (
          <button className="btn-game" onClick={() => queueLevelStart(level + 1)}>Next Level</button>
        ) : null}
        {(status === "finished" || status === "lost") && (
          <button className="btn-danger" onClick={() => queueLevelStart(1)}>Play From Level 1</button>
        )}
      </div>
    </section>
  );
}

function spawnPea(
  runtime: {
    peas: Pea[];
    nextPeaId: number;
    peasFired: number;
  },
  x: number,
  y: number,
  wasMultiplied: boolean,
  speedFactor: number,
  level: number,
  eventClient: EventClient | null
): void {
  runtime.peas.push({
    id: runtime.nextPeaId++,
    x: Math.max(GAME_CONFIG.pea.radius, Math.min(CANVAS_W - GAME_CONFIG.pea.radius, x)),
    y,
    wasMultiplied,
    hasCrossedLaser: wasMultiplied,
    speedFactor
  });
  runtime.peasFired += 1;

  if (runtime.peas.length > MAX_ACTIVE_PEAS) {
    runtime.peas.splice(0, runtime.peas.length - MAX_ACTIVE_PEAS);
  }

  eventClient?.track(level, "pea_fired", {
    cart_x: Math.round(x),
    laser_aligned: Math.abs(x - CANVAS_W / 2) < 110
  });
}

function createZombie(kind: ZombieKind, id: number, baseSpeed: number): Zombie {
  const stats = getZombieStats(kind, baseSpeed);
  return {
    id,
    kind,
    x: 0,
    y: 0,
    health: stats.health,
    maxHealth: stats.health,
    speed: stats.speed,
    aliveMs: 0,
    bucketBroken: false
  };
}

function getZombieStats(kind: ZombieKind, baseSpeed: number): { health: number; speed: number } {
  if (kind === "ironhead") return { health: 5, speed: baseSpeed };
  if (kind === "drdecay") return { health: 3, speed: baseSpeed * 1.5 };
  if (kind === "shambler") return { health: 10, speed: baseSpeed * 0.45 };
  if (kind === "catalyst") return { health: 3, speed: baseSpeed };
  return { health: 3, speed: baseSpeed };
}

function getZombieWidth(kind: ZombieKind): number {
  return GAME_CONFIG.zombie.width * 4;
}

function getZombieHeight(kind: ZombieKind): number {
  return GAME_CONFIG.zombie.height * 3;
}

function pickZombieKind(
  level: number,
  spawnIndex: number,
  total: number,
  flags: { catalystSpawned: boolean; shamblerSpawned: boolean }
): ZombieKind {
  const inFinalFive = spawnIndex >= Math.max(0, total - 5);

  if (level === LEVEL_COUNT && inFinalFive && !flags.shamblerSpawned) {
    if (spawnIndex === total - 1 || Math.random() < 0.35) {
      return "shambler";
    }
  }

  if (FIBONACCI_LEVELS.includes(level as (typeof FIBONACCI_LEVELS)[number]) && !flags.catalystSpawned) {
    if (spawnIndex === Math.floor(total * 0.6)) {
      return "catalyst";
    }
  }

  if (level <= 2) {
    const earlyRoster: ZombieKind[] = ["rotter", "rotter", "ironhead"];
    return earlyRoster[spawnIndex % earlyRoster.length];
  }

  if (level <= 6) {
    const midRoster: ZombieKind[] = ["rotter", "ironhead", "drdecay", "rotter"];
    return midRoster[spawnIndex % midRoster.length];
  }

  if (level <= 12) {
    const advancedRoster: ZombieKind[] = ["rotter", "ironhead", "drdecay", "catalyst"];
    return advancedRoster[spawnIndex % advancedRoster.length];
  }

  const lateRoster: ZombieKind[] = ["rotter", "ironhead", "drdecay", "catalyst", "drdecay"];
  return lateRoster[spawnIndex % lateRoster.length];
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  runtime: {
    cartX: number;
    peas: Pea[];
    zombies: Zombie[];
    sparkles: Sparkle[];
    laserActive: boolean;
  },
  level: number,
  ts: number,
  activePlant: PlantType,
  images: Record<string, HTMLImageElement>
): void {
  const skyToLawn = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  skyToLawn.addColorStop(0, "#56b4ef");
  skyToLawn.addColorStop(0.55, "#8ad7ff");
  skyToLawn.addColorStop(1, "#cdeeff");
  ctx.fillStyle = skyToLawn;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawArenaBase(ctx);
  drawLaneGuides(ctx);
  drawLaserGate(ctx, level, runtime.laserActive, ts);

  const cartCenter = projectPoint(runtime.cartX + GAME_CONFIG.cart.width / 2, GAME_CONFIG.cart.startY + GAME_CONFIG.cart.height / 2);
  drawPlant(ctx, cartCenter.x, cartCenter.y, cartCenter.scale, activePlant, images);

  for (const pea of runtime.peas) {
    const p = projectPoint(pea.x, pea.y);
    const radius = Math.max(4, GAME_CONFIG.pea.radius * p.scale * 0.62);

    const glowGrad = ctx.createRadialGradient(p.x, p.y, radius * 0.2, p.x, p.y, radius * 2.1);
    glowGrad.addColorStop(0, "rgba(228,255,120,0.75)");
    glowGrad.addColorStop(0.45, "rgba(180,236,81,0.42)");
    glowGrad.addColorStop(1, "rgba(143,209,79,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();

    const trail = ctx.createLinearGradient(p.x, p.y + radius * 1.2, p.x, p.y - radius * 1.8);
    trail.addColorStop(0, "rgba(143,209,79,0)");
    trail.addColorStop(0.5, "rgba(180,236,81,0.35)");
    trail.addColorStop(1, "rgba(255,241,118,0.6)");
    ctx.strokeStyle = trail;
    ctx.lineWidth = Math.max(1.4, radius * 0.45);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + radius * 1.4);
    ctx.lineTo(p.x, p.y - radius * 1.6);
    ctx.stroke();

    const peaGrad = ctx.createRadialGradient(p.x - 2, p.y - 2, 1, p.x, p.y, radius + 2);
    peaGrad.addColorStop(0, "#fff176");
    peaGrad.addColorStop(0.5, "#b4ec51");
    peaGrad.addColorStop(1, pea.wasMultiplied ? "#ff9234" : "#8fd14f");
    ctx.fillStyle = peaGrad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(122,189,62,0.8)";
    ctx.lineWidth = Math.max(1.1, radius * 0.16);
    ctx.stroke();
  }

  for (const sparkle of runtime.sparkles) {
    const p = projectPoint(sparkle.x, sparkle.y);
    const alpha = sparkle.life / sparkle.maxLife;
    ctx.fillStyle = `rgba(255,241,118,${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, sparkle.size * p.scale * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const zombie of runtime.zombies) {
    const p = projectPoint(zombie.x + getZombieWidth(zombie.kind) / 2, zombie.y + getZombieHeight(zombie.kind) / 2);
    const zw = Math.max(18, getZombieWidth(zombie.kind) * p.scale * 0.6);
    const zh = Math.max(24, getZombieHeight(zombie.kind) * p.scale * 0.62);

    drawZombie(ctx, p.x, p.y, zw, zh, zombie, images);

    const barW = Math.max(34 * p.scale, zw * 0.42);
    const hpRatio = Math.max(0, zombie.health / zombie.maxHealth);
    ctx.fillStyle = "rgba(17,17,17,0.9)";
    ctx.fillRect(p.x - barW / 2, p.y - zh / 2 - 11 * p.scale, barW, 5 * p.scale);
    ctx.fillStyle = hpRatio > 0.6 ? "#22c55e" : hpRatio > 0.3 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(p.x - barW / 2, p.y - zh / 2 - 11 * p.scale, barW * hpRatio, 5 * p.scale);
  }
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  plant: PlantType,
  images: Record<string, HTMLImageElement>
): void {
  const w = Math.max(44, GAME_CONFIG.cart.width * scale * 1.1);
  const h = Math.max(48, GAME_CONFIG.cart.height * scale * 2.8);

  const key = plant === "double" ? "plantDouble" : plant === "triple" ? "plantTriple" : "plantBasic";
  const img = images[key];

  if (img && img.complete) {
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    return;
  }

  const grad = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  grad.addColorStop(0, "#8b4513");
  grad.addColorStop(1, "#6f3609");
  ctx.fillStyle = grad;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = "#4e2a0b";
  ctx.lineWidth = Math.max(1, scale * 1.5);
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}

function drawZombie(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  zombie: Zombie,
  images: Record<string, HTMLImageElement>
): void {
  const keyMap: Record<ZombieKind, string> = {
    rotter: "zombieRotter",
    ironhead: "zombieIronhead",
    drdecay: "zombieDrdecay",
    shambler: "zombieShambler",
    catalyst: "zombieCatalyst"
  };

  const img = images[keyMap[zombie.kind]];
  if (img && img.complete) {
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    return;
  }

  const zombieGrad = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  zombieGrad.addColorStop(0, zombie.kind === "drdecay" ? "#8bd0ff" : zombie.kind === "catalyst" ? "#ffe066" : "#a8d884");
  zombieGrad.addColorStop(1, zombie.kind === "drdecay" ? "#4dabf7" : zombie.kind === "catalyst" ? "#faa307" : "#7fa35c");
  ctx.fillStyle = zombieGrad;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = "#4a7c2c";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}

function drawArenaBase(ctx: CanvasRenderingContext2D): void {
  const leftTop = CANVAS_W / 2 - ARENA_TOP_WIDTH / 2;
  const rightTop = CANVAS_W / 2 + ARENA_TOP_WIDTH / 2;
  const leftBottom = CANVAS_W / 2 - ARENA_BOTTOM_WIDTH / 2;
  const rightBottom = CANVAS_W / 2 + ARENA_BOTTOM_WIDTH / 2;

  ctx.fillStyle = "#3f7f2d";
  ctx.beginPath();
  ctx.moveTo(leftTop, ARENA_TOP_Y);
  ctx.lineTo(rightTop, ARENA_TOP_Y);
  ctx.lineTo(rightBottom, ARENA_BOTTOM_Y);
  ctx.lineTo(leftBottom, ARENA_BOTTOM_Y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(22,58,18,0.72)";
  ctx.lineWidth = 1.2;
  for (let y = ARENA_TOP_Y + 10; y < ARENA_BOTTOM_Y; y += 18) {
    const lt = projectPoint(0, ((y - ARENA_TOP_Y) / (ARENA_BOTTOM_Y - ARENA_TOP_Y)) * CANVAS_H);
    const rt = projectPoint(CANVAS_W, ((y - ARENA_TOP_Y) / (ARENA_BOTTOM_Y - ARENA_TOP_Y)) * CANVAS_H);
    ctx.beginPath();
    ctx.moveTo(lt.x, lt.y);
    ctx.lineTo(rt.x, rt.y);
    ctx.stroke();
  }
  for (let i = 1; i <= 14; i += 1) {
    const wx = (CANVAS_W / 15) * i;
    const top = projectPoint(wx, 0);
    const bottom = projectPoint(wx, CANVAS_H);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#303030";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(leftTop, ARENA_TOP_Y);
  ctx.lineTo(leftBottom, ARENA_BOTTOM_Y);
  ctx.moveTo(rightTop, ARENA_TOP_Y);
  ctx.lineTo(rightBottom, ARENA_BOTTOM_Y);
  ctx.stroke();
}

function drawLaneGuides(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i += 1) {
    const worldY = (CANVAS_H / 5) * i;
    const left = projectPoint(0, worldY);
    const right = projectPoint(CANVAS_W, worldY);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }
}

function drawLaserGate(
  ctx: CanvasRenderingContext2D,
  level: number,
  active: boolean,
  ts: number
): void {
  const multiplier = LEVEL_CONFIG[level].multiplier;
  if (multiplier === null) {
    return;
  }

  const laserYTop = GAME_CONFIG.laser.y;
  const laserYBottom = GAME_CONFIG.laser.y + GAME_CONFIG.laser.height;
  const lt = projectPoint(0, laserYTop);
  const rt = projectPoint(CANVAS_W, laserYTop);
  const lb = projectPoint(0, laserYBottom);
  const rb = projectPoint(CANVAS_W, laserYBottom);

  const pulse = 0.82 + 0.18 * Math.sin(ts / 220);
  const grad = ctx.createLinearGradient(lt.x, lt.y, rt.x, rt.y);
  if (active) {
    grad.addColorStop(0, "rgba(255, 76, 60, 0.9)");
    grad.addColorStop(0.5, `rgba(255, 132, 87, ${0.92 * pulse})`);
    grad.addColorStop(1, "rgba(214, 43, 30, 0.9)");
  } else {
    grad.addColorStop(0, "rgba(120,120,120,0.35)");
    grad.addColorStop(1, "rgba(70,70,70,0.35)");
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(lt.x, lt.y);
  ctx.lineTo(rt.x, rt.y);
  ctx.lineTo(rb.x, rb.y);
  ctx.lineTo(lb.x, lb.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.fillRect(lt.x - 6, lt.y - 10, 6, 28);
  ctx.fillRect(rt.x, rt.y - 10, 6, 28);

  ctx.font = "700 34px Fredoka";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 5;
  const midX = (lt.x + rt.x) / 2;
  const midY = (lt.y + rb.y) / 2 + 10;
  const label = active ? `x${multiplier} SHIELD` : "SHIELD DOWN";
  ctx.strokeText(label, midX, midY);
  ctx.fillText(label, midX, midY);
  ctx.textAlign = "start";
}

function projectPoint(worldX: number, worldY: number): { x: number; y: number; scale: number } {
  const t = Math.max(0, Math.min(1, worldY / CANVAS_H));
  const widthAtY = ARENA_TOP_WIDTH + (ARENA_BOTTOM_WIDTH - ARENA_TOP_WIDTH) * t;
  const leftAtY = CANVAS_W / 2 - widthAtY / 2;
  const x = leftAtY + (worldX / CANVAS_W) * widthAtY;
  const y = ARENA_TOP_Y + t * (ARENA_BOTTOM_Y - ARENA_TOP_Y);
  const scale = 0.48 + t * 0.72;
  return { x, y, scale };
}

function createSparkles(x: number, y: number): Sparkle[] {
  const list: Sparkle[] = [];
  for (let i = 0; i < 8; i += 1) {
    list.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 80,
      vy: -50 - Math.random() * 90,
      life: 0.55,
      maxLife: 0.55,
      size: 1.6 + Math.random() * 2.6
    });
  }
  return list;
}

function updateSparkles(sparkles: Sparkle[], dt: number): Sparkle[] {
  const next: Sparkle[] = [];
  for (const s of sparkles) {
    const life = s.life - dt;
    if (life <= 0) continue;
    next.push({
      ...s,
      x: s.x + s.vx * dt,
      y: s.y + s.vy * dt,
      vy: s.vy + 84 * dt,
      life
    });
  }
  return next;
}

function circleHitsRect(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}
