export type GameEventType =
  | "level_started"
  | "pea_fired"
  | "pea_multiplied"
  | "pea_hit_zombie"
  | "zombie_killed"
  | "laser_destroyed"
  | "laser_protected"
  | "cart_moved"
  | "panic_detected"
  | "laser_threat_detected"
  | "laser_threat_response"
  | "level_completed"
  | "level_failed";

export interface GameEvent {
  event_id: string;
  session_id: string;
  timestamp: number;
  event_type: GameEventType;
  level: number;
  data: Record<string, unknown>;
}

export interface LevelFunnelSummary {
  level: number;
  started: number;
  completed: number;
  completionRate: number;
  dropOffFromPrevious: number;
}

export interface AnalyticsSummary {
  scope: "my_session" | "all_players";
  sessionId: string | null;
  overview: {
    gamesPlayed: number;
    globalGamesPlayed: number;
    averageScore: number;
    level3CompletionRate: number;
    averageTimePerLevel: { level: number; avgSeconds: number }[];
  };
  gameplayBehavior: {
    accuracyRate: number;
    peasFired: number;
    zombiesHit: number;
    zombiesKilled: number;
    mostFailedLevel: number | null;
    avgAttemptsBeforeComplete: { level: number; attempts: number }[];
  };
  laserAnalytics: {
    destroyedPerLevel: { level: number; destroyed: number }[];
    destructionTiming: { early: number; mid: number; late: number };
    winRateIntact: number;
    winRateDestroyed: number;
    protectionRate: number;
    protectionMovesTowardThreat: number;
    protectionOpportunities: number;
  };
  psychology: {
    panicMoments: number;
    riskProfileDistribution: {
      aggressive: number;
      conservative: number;
      strategic: number;
    };
    averageReactionTimeMs: number | null;
  };
  funnel: LevelFunnelSummary[];
  sessionPatterns: {
    retryRate: number;
    bestScore: number;
    averageScore: number;
    scoreImprovementPercent: number;
  };
}
