"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventClient } from "@/lib/event-client";
import { GAME_CONFIG, LEVEL_CONFIG, type LevelNumber } from "@/lib/game-config";

type GameStatus = "idle" | "running" | "won" | "lost" | "finished";

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
  x: number;
  y: number;
  health: number;
  speed: number;
  aliveMs: number;
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
const MAX_ACTIVE_PEAS = 140;

const ARENA_TOP_Y = 62;
const ARENA_BOTTOM_Y = CANVAS_H - 12;
const ARENA_TOP_WIDTH = 250;
const ARENA_BOTTOM_WIDTH = CANVAS_W - 34;

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const eventClientRef = useRef<EventClient | null>(null);
  const keysRef = useRef({ left: false, right: false });

  const [level, setLevel] = useState<LevelNumber>(1);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [laserActive, setLaserActive] = useState<boolean>(true);
  const [zombiesKilled, setZombiesKilled] = useState<number>(0);
  const [zombiesRemaining, setZombiesRemaining] = useState<number>(LEVEL_CONFIG[1].zombies);

  const runtimeRef = useRef({
    cartX: CANVAS_W / 2 - GAME_CONFIG.cart.width / 2,
    peas: [] as Pea[],
    zombies: [] as Zombie[],
    sparkles: [] as Sparkle[],
    nextPeaId: 1,
    nextZombieId: 1,
    msSinceShot: 0,
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
    threatResponseLogged: false
  });

  const levelCfg = useMemo(() => LEVEL_CONFIG[level], [level]);
  const score = zombiesKilled * 125 + (laserActive && LEVEL_CONFIG[level].multiplier ? 200 : 0);

  const randBetweenMs = (minS: number, maxS: number): number => {
    const seconds = Math.random() * (maxS - minS) + minS;
    return seconds * 1000;
  };

  const startLevel = useCallback((levelNumber: LevelNumber) => {
    setLevel(levelNumber);
    setStatus("running");
    setLaserActive(LEVEL_CONFIG[levelNumber].multiplier !== null);
    setZombiesKilled(0);
    setZombiesRemaining(LEVEL_CONFIG[levelNumber].zombies);

    runtimeRef.current = {
      cartX: CANVAS_W / 2 - GAME_CONFIG.cart.width / 2,
      peas: [],
      zombies: [],
      sparkles: [],
      nextPeaId: 1,
      nextZombieId: 1,
      msSinceShot: 0,
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
      threatResponseLogged: false
    };

    eventClientRef.current?.track(levelNumber, "level_started", {
      level: levelNumber
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
        if (keysRef.current.left) {
          rt.cartX -= GAME_CONFIG.cart.moveSpeed * deltaSec;
        }
        if (keysRef.current.right) {
          rt.cartX += GAME_CONFIG.cart.moveSpeed * deltaSec;
        }
        rt.cartX = Math.max(0, Math.min(CANVAS_W - GAME_CONFIG.cart.width, rt.cartX));

        rt.msSinceShot += deltaMs;
        if (rt.msSinceShot >= GAME_CONFIG.pea.fireIntervalMs) {
          rt.msSinceShot -= GAME_CONFIG.pea.fireIntervalMs;
          const pea: Pea = {
            id: rt.nextPeaId++,
            x: rt.cartX + GAME_CONFIG.cart.width / 2,
            y: GAME_CONFIG.cart.startY - GAME_CONFIG.cart.height,
            wasMultiplied: false,
            hasCrossedLaser: false,
            speedFactor: 1
          };
          rt.peas.push(pea);
          rt.peasFired += 1;

          if (rt.peas.length > MAX_ACTIVE_PEAS) {
            rt.peas.splice(0, rt.peas.length - MAX_ACTIVE_PEAS);
          }

          eventClientRef.current?.track(level, "pea_fired", {
            cart_x: Math.round(rt.cartX),
            laser_aligned: Math.abs(pea.x - CANVAS_W / 2) < 110
          });
        }

        rt.msSinceSpawn += deltaMs;
        if (rt.spawned < LEVEL_CONFIG[level].zombies && rt.msSinceSpawn >= rt.nextSpawnMs) {
          rt.msSinceSpawn = 0;
          rt.nextSpawnMs = randBetweenMs(levelCfg.spawnDelayRangeS[0], levelCfg.spawnDelayRangeS[1]);

          const zombie: Zombie = {
            id: rt.nextZombieId++,
            x: Math.random() * (CANVAS_W - GAME_CONFIG.zombie.width),
            y: GAME_CONFIG.zombie.spawnY,
            health: GAME_CONFIG.zombie.health,
            speed: LEVEL_CONFIG[level].speed,
            aliveMs: 0
          };
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
              zombie.y + GAME_CONFIG.zombie.height >= GAME_CONFIG.laser.y;
            if (touchesLaser) {
              rt.laserActive = false;
              setLaserActive(false);
              const progress = (rt.spawned / LEVEL_CONFIG[level].zombies) * 100;
              rt.laserDestroyedAtWave = progress;

              if (multiplier !== null) {
                eventClientRef.current?.track(level, "laser_destroyed", {
                  zombie_id: zombie.id,
                  multiplier_lost: multiplier,
                  wave_progress_percent: Number(progress.toFixed(2)),
                  zombies_remaining: LEVEL_CONFIG[level].zombies - rt.killed
                });
              }
            }
          }

          if (zombie.y + GAME_CONFIG.zombie.height >= LOSS_LINE_Y) {
            rt.levelFailed = true;
            setStatus("lost");
            const remaining = LEVEL_CONFIG[level].zombies - rt.killed;
            setZombiesRemaining(remaining);
            eventClientRef.current?.track(level, "level_failed", {
              zombies_killed: rt.killed,
              zombies_remaining: remaining,
              laser_status: rt.laserActive ? "intact" : "destroyed"
            });
          }

          if (!rt.levelFailed) {
            zombieKeep.push(zombie);
          }
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
              GAME_CONFIG.zombie.width,
              GAME_CONFIG.zombie.height
            );

            if (hitZombie) {
              consumed = true;
              zombie.health -= GAME_CONFIG.pea.damage;
              rt.hits += 1;

              eventClientRef.current?.track(level, "pea_hit_zombie", {
                zombie_id: zombie.id,
                zombie_health_remaining: zombie.health,
                was_multiplied: pea.wasMultiplied
              });

              if (zombie.health <= 0) {
                rt.killed += 1;
                setZombiesKilled(rt.killed);
                setZombiesRemaining(LEVEL_CONFIG[level].zombies - rt.killed);

                eventClientRef.current?.track(level, "zombie_killed", {
                  zombie_id: zombie.id,
                  time_alive_seconds: Number((zombie.aliveMs / 1000).toFixed(2)),
                  killed_by_multiplied_pea: pea.wasMultiplied
                });
              }
              break;
            }
          }

          if (!consumed) {
            alivePeas.push(pea);
          }
        }

        rt.peas = alivePeas;
        rt.zombies = aliveZombies.filter((z) => z.health > 0);
        rt.sparkles = updateSparkles(rt.sparkles, deltaSec);

        if (!rt.levelFailed && rt.killed >= LEVEL_CONFIG[level].zombies) {
          setStatus(level === 3 ? "finished" : "won");
          const duration = (performance.now() - rt.startedAt) / 1000;
          const accuracy = rt.peasFired ? (rt.hits / rt.peasFired) * 100 : 0;

          eventClientRef.current?.track(level, "level_completed", {
            duration_seconds: Number(duration.toFixed(2)),
            peas_fired: rt.peasFired,
            accuracy_percent: Number(accuracy.toFixed(2)),
            laser_status:
              LEVEL_CONFIG[level].multiplier === null
                ? "not_present"
                : rt.laserActive
                  ? "intact"
                  : "destroyed"
          });
        }
      } else {
        runtimeRef.current.sparkles = updateSparkles(runtimeRef.current.sparkles, deltaSec);
      }

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawScene(ctx, runtimeRef.current, level, ts);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [level, status, levelCfg]);

  return (
    <section className="panel">
      <h1 className="game-title">Plants vs Zombies Arena</h1>
      <p className="muted">Shoot zombies and protect your base from being infected!</p>

      <div className="hud-top">
        <div className="score-display">🌻 Score: <span className="score-number">{score.toLocaleString()}</span></div>
        <div className="level-indicator">Level <span className="level-number">{level}</span></div>
        <div className="zombies-remaining">🧟 Left: <span className="zombie-count">{zombiesRemaining}</span></div>
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
        </div>
      </div>

      {LEVEL_CONFIG[level].multiplier !== null && (
        <div className="laser-status">
          <span className="laser-icon">⚡</span>
          <span className="laser-multiplier">
            {`x${LEVEL_CONFIG[level].multiplier}`}
          </span>
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
        <button className="btn-primary" onClick={() => startLevel(level)}>
          Start / Restart Level {level}
        </button>
        {status === "won" && level < 3 ? (
          <button className="btn-primary" onClick={() => startLevel((level + 1) as LevelNumber)}>
            Next Level
          </button>
        ) : null}
        {(status === "finished" || status === "lost") && (
          <button className="btn-danger" onClick={() => startLevel(1)}>
            Play From Level 1
          </button>
        )}
      </div>
    </section>
  );
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
  level: LevelNumber,
  ts: number
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
  drawPlantCart(ctx, cartCenter.x, cartCenter.y, cartCenter.scale);

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
    const p = projectPoint(zombie.x + GAME_CONFIG.zombie.width / 2, zombie.y + GAME_CONFIG.zombie.height / 2);
    const zw = Math.max(14, GAME_CONFIG.zombie.width * p.scale * 0.6);
    const zh = Math.max(20, GAME_CONFIG.zombie.height * p.scale * 0.62);

    const zombieGrad = ctx.createLinearGradient(p.x - zw / 2, p.y - zh / 2, p.x + zw / 2, p.y + zh / 2);
    zombieGrad.addColorStop(0, "#a8d884");
    zombieGrad.addColorStop(1, "#7fa35c");
    ctx.fillStyle = zombieGrad;
    ctx.fillRect(p.x - zw / 2, p.y - zh / 2, zw, zh);
    ctx.strokeStyle = "#4a7c2c";
    ctx.lineWidth = Math.max(1, p.scale * 1.8);
    ctx.strokeRect(p.x - zw / 2, p.y - zh / 2, zw, zh);

    const barW = 26 * p.scale;
    const hpRatio = Math.max(0, zombie.health / GAME_CONFIG.zombie.health);
    ctx.fillStyle = "rgba(17,17,17,0.9)";
    ctx.fillRect(p.x - barW / 2, p.y - zh / 2 - 9 * p.scale, barW, 4 * p.scale);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(p.x - barW / 2, p.y - zh / 2 - 9 * p.scale, barW * hpRatio, 4 * p.scale);
  }
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
  level: LevelNumber,
  active: boolean,
  ts: number
): void {
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

  const multiplier = LEVEL_CONFIG[level].multiplier ?? 1;
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

function drawPlantCart(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  const w = Math.max(22, GAME_CONFIG.cart.width * scale * 0.55);
  const h = Math.max(12, GAME_CONFIG.cart.height * scale * 0.7);
  const grad = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  grad.addColorStop(0, "#8b4513");
  grad.addColorStop(1, "#6f3609");
  ctx.fillStyle = grad;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = "#4e2a0b";
  ctx.lineWidth = Math.max(1, scale * 1.5);
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
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

function getCloneOffsets(multiplier: number): number[] {
  if (multiplier === 5) {
    return [-8, -4, 0, 4, 8];
  }
  if (multiplier === 2) {
    return [-3, 3];
  }

  const offsets: number[] = [];
  const mid = (multiplier - 1) / 2;
  for (let i = 0; i < multiplier; i += 1) {
    offsets.push((i - mid) * 4);
  }
  return offsets;
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
