import { NextResponse } from "next/server";
import { getEvents } from "@/lib/event-store";
import type { AnalyticsSummary, GameEvent } from "@/lib/types";

function toNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === "string") {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function getOutcomeScore(event: GameEvent): number {
  const direct = toNumber(event.data.score);
  if (direct !== null) {
    return direct;
  }
  const killed = toNumber(event.data.zombies_killed) ?? 0;
  const laserStatus = String(event.data.laser_status ?? "");
  const laserBonus = laserStatus === "intact" ? 200 : 0;
  return killed * 125 + laserBonus;
}

export async function GET(req: Request) {
  const allEvents = getEvents().slice().sort((a, b) => a.timestamp - b.timestamp);
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  const scopedEvents = sessionId
    ? allEvents.filter((event) => event.session_id === sessionId)
    : allEvents;

  const scope: AnalyticsSummary["scope"] = sessionId ? "my_session" : "all_players";

  const levelStarts = scopedEvents.filter((event) => event.event_type === "level_started");
  const levelCompletions = scopedEvents.filter((event) => event.event_type === "level_completed");
  const levelFailures = scopedEvents.filter((event) => event.event_type === "level_failed");
  const outcomes = scopedEvents.filter(
    (event) => event.event_type === "level_completed" || event.event_type === "level_failed"
  );

  const knownLevels = Array.from(
    new Set(levelStarts.concat(levelCompletions).concat(levelFailures).map((event) => event.level))
  )
    .sort((a, b) => a - b);

  const baseLevels = knownLevels.length ? knownLevels : [1, 2, 3];

  const funnel = baseLevels.map((level, index) => {
    const started = levelStarts.filter((event) => event.level === level).length;
    const completed = levelCompletions.filter((event) => event.level === level).length;
    const completionRate = started ? (completed / started) * 100 : 0;

    let dropOffFromPrevious = 0;
    if (index > 0) {
      const previousLevel = baseLevels[index - 1];
      const previousStarts = levelStarts.filter((event) => event.level === previousLevel).length;
      dropOffFromPrevious = previousStarts ? ((previousStarts - started) / previousStarts) * 100 : 0;
    }

    return {
      level,
      started,
      completed,
      completionRate,
      dropOffFromPrevious
    };
  });

  const scores = outcomes.map((event) => getOutcomeScore(event));
  const allGamesPlayed = allEvents.filter((event) => event.event_type === "level_started").length;

  const sessionsWithStarts = new Set(levelStarts.map((event) => event.session_id));
  const sessionsWithLevel3Completion = new Set(
    levelCompletions.filter((event) => event.level === 3).map((event) => event.session_id)
  );

  const avgTimePerLevel = baseLevels.map((level) => {
    const durations = levelCompletions
      .filter((event) => event.level === level)
      .map((event) => toNumber(event.data.duration_seconds))
      .filter((value): value is number => value !== null);

    return {
      level,
      avgSeconds: average(durations)
    };
  });

  const peasFired = scopedEvents.filter((event) => event.event_type === "pea_fired").length;
  const zombieHits = scopedEvents.filter((event) => event.event_type === "pea_hit_zombie").length;
  const zombiesKilled = scopedEvents.filter((event) => event.event_type === "zombie_killed").length;

  const failedLevelCounts = new Map<number, number>();
  for (const failure of levelFailures) {
    failedLevelCounts.set(failure.level, (failedLevelCounts.get(failure.level) ?? 0) + 1);
  }

  let mostFailedLevel: number | null = null;
  let highestFailures = 0;
  for (const [level, count] of failedLevelCounts.entries()) {
    if (count > highestFailures) {
      highestFailures = count;
      mostFailedLevel = level;
    }
  }

  const attemptsBeforeCompleteByLevel = baseLevels.map((level) => {
    const grouped = new Map<string, GameEvent[]>();
    for (const event of scopedEvents) {
      if (event.level !== level) continue;
      if (event.event_type !== "level_started" && event.event_type !== "level_completed") continue;
      const key = event.session_id;
      const current = grouped.get(key) ?? [];
      current.push(event);
      grouped.set(key, current);
    }

    const attempts: number[] = [];
    for (const sessionEvents of grouped.values()) {
      const sorted = sessionEvents.sort((a, b) => a.timestamp - b.timestamp);
      let startsSinceLastCompletion = 0;
      for (const event of sorted) {
        if (event.event_type === "level_started") {
          startsSinceLastCompletion += 1;
        }
        if (event.event_type === "level_completed" && startsSinceLastCompletion > 0) {
          attempts.push(startsSinceLastCompletion);
          startsSinceLastCompletion = 0;
        }
      }
    }

    return {
      level,
      attempts: average(attempts)
    };
  });

  const laserDestroyedEvents = scopedEvents.filter((event) => event.event_type === "laser_destroyed");
  const destroyedPerLevel = baseLevels.map((level) => ({
    level,
    destroyed: laserDestroyedEvents.filter((event) => event.level === level).length
  }));

  const destructionTiming = {
    early: 0,
    mid: 0,
    late: 0
  };

  for (const event of laserDestroyedEvents) {
    const progress = toNumber(event.data.wave_progress_percent) ?? 0;
    if (progress < 33.34) destructionTiming.early += 1;
    else if (progress < 66.67) destructionTiming.mid += 1;
    else destructionTiming.late += 1;
  }

  const intactRuns = outcomes.filter((event) => String(event.data.laser_status) === "intact");
  const destroyedRuns = outcomes.filter((event) => String(event.data.laser_status) === "destroyed");
  const intactWins = intactRuns.filter((event) => event.event_type === "level_completed").length;
  const destroyedWins = destroyedRuns.filter((event) => event.event_type === "level_completed").length;

  const cartMoves = scopedEvents.filter((event) => event.event_type === "cart_moved");
  const threatMoves = cartMoves.filter((event) => Boolean(event.data.threat_active));
  const towardThreatMoves = threatMoves.filter((event) => Boolean(event.data.toward_threat));

  const panicMoments = scopedEvents.filter((event) => event.event_type === "panic_detected").length;

  const peaFiredL2Plus = scopedEvents.filter(
    (event) => event.event_type === "pea_fired" && event.level >= 2
  );

  const sessionToUsage = new Map<string, { aligned: number; total: number }>();
  for (const event of peaFiredL2Plus) {
    const entry = sessionToUsage.get(event.session_id) ?? { aligned: 0, total: 0 };
    entry.total += 1;
    if (Boolean(event.data.laser_aligned)) {
      entry.aligned += 1;
    }
    sessionToUsage.set(event.session_id, entry);
  }

  const riskProfileDistribution = {
    aggressive: 0,
    conservative: 0,
    strategic: 0
  };

  for (const usage of sessionToUsage.values()) {
    const rate = usage.total ? usage.aligned / usage.total : 0;
    if (rate > 0.7) riskProfileDistribution.aggressive += 1;
    else if (rate < 0.3) riskProfileDistribution.conservative += 1;
    else riskProfileDistribution.strategic += 1;
  }

  const reactionTimes = scopedEvents
    .filter((event) => event.event_type === "laser_threat_response")
    .map((event) => toNumber(event.data.reaction_time_ms))
    .filter((value): value is number => value !== null);

  let failuresWithRetry = 0;
  for (const failure of levelFailures) {
    const retried = levelStarts.some(
      (start) => start.session_id === failure.session_id && start.timestamp > failure.timestamp
    );
    if (retried) failuresWithRetry += 1;
  }

  const scoresBySession = new Map<string, number[]>();
  for (const outcome of outcomes) {
    const current = scoresBySession.get(outcome.session_id) ?? [];
    current.push(getOutcomeScore(outcome));
    scoresBySession.set(outcome.session_id, current);
  }

  const improvementSeries: number[] = [];
  for (const scoreList of scoresBySession.values()) {
    if (scoreList.length < 2) continue;
    const first = scoreList[0];
    const last = scoreList[scoreList.length - 1];
    improvementSeries.push(((last - first) / Math.max(1, first)) * 100);
  }

  const summary: AnalyticsSummary = {
    scope,
    sessionId,
    overview: {
      gamesPlayed: levelStarts.length,
      globalGamesPlayed: allGamesPlayed,
      averageScore: average(scores),
      level3CompletionRate: sessionsWithStarts.size
        ? (sessionsWithLevel3Completion.size / sessionsWithStarts.size) * 100
        : 0,
      averageTimePerLevel: avgTimePerLevel
    },
    gameplayBehavior: {
      accuracyRate: peasFired ? (zombieHits / peasFired) * 100 : 0,
      peasFired,
      zombiesHit: zombieHits,
      zombiesKilled,
      mostFailedLevel,
      avgAttemptsBeforeComplete: attemptsBeforeCompleteByLevel
    },
    laserAnalytics: {
      destroyedPerLevel,
      destructionTiming,
      winRateIntact: intactRuns.length ? (intactWins / intactRuns.length) * 100 : 0,
      winRateDestroyed: destroyedRuns.length ? (destroyedWins / destroyedRuns.length) * 100 : 0,
      protectionRate: threatMoves.length ? (towardThreatMoves.length / threatMoves.length) * 100 : 0,
      protectionMovesTowardThreat: towardThreatMoves.length,
      protectionOpportunities: threatMoves.length
    },
    psychology: {
      panicMoments,
      riskProfileDistribution,
      averageReactionTimeMs: reactionTimes.length ? average(reactionTimes) : null
    },
    funnel,
    sessionPatterns: {
      retryRate: levelFailures.length ? (failuresWithRetry / levelFailures.length) * 100 : 0,
      bestScore: scores.length ? Math.max(...scores) : 0,
      averageScore: average(scores),
      scoreImprovementPercent: improvementSeries.length ? average(improvementSeries) : 0
    }
  };

  return NextResponse.json(summary);
}
