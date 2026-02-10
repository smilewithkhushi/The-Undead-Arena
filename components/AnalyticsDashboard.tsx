"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  ArcElement
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { getStoredSessionId } from "@/lib/event-client";
import type { AnalyticsSummary } from "@/lib/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

type Scope = "my_session" | "all_players";

const emptySummary: AnalyticsSummary = {
  scope: "all_players",
  sessionId: null,
  overview: {
    gamesPlayed: 0,
    globalGamesPlayed: 0,
    averageScore: 0,
    level3CompletionRate: 0,
    averageTimePerLevel: [
      { level: 1, avgSeconds: 0 },
      { level: 2, avgSeconds: 0 },
      { level: 3, avgSeconds: 0 }
    ]
  },
  gameplayBehavior: {
    accuracyRate: 0,
    peasFired: 0,
    zombiesHit: 0,
    zombiesKilled: 0,
    mostFailedLevel: null,
    avgAttemptsBeforeComplete: [
      { level: 1, attempts: 0 },
      { level: 2, attempts: 0 },
      { level: 3, attempts: 0 }
    ]
  },
  laserAnalytics: {
    destroyedPerLevel: [
      { level: 2, destroyed: 0 },
      { level: 3, destroyed: 0 }
    ],
    destructionTiming: { early: 0, mid: 0, late: 0 },
    winRateIntact: 0,
    winRateDestroyed: 0,
    protectionRate: 0,
    protectionMovesTowardThreat: 0,
    protectionOpportunities: 0
  },
  psychology: {
    panicMoments: 0,
    riskProfileDistribution: {
      aggressive: 0,
      conservative: 0,
      strategic: 0
    },
    averageReactionTimeMs: null
  },
  funnel: [
    { level: 1, started: 0, completed: 0, completionRate: 0, dropOffFromPrevious: 0 },
    { level: 2, started: 0, completed: 0, completionRate: 0, dropOffFromPrevious: 0 },
    { level: 3, started: 0, completed: 0, completionRate: 0, dropOffFromPrevious: 0 }
  ],
  sessionPatterns: {
    retryRate: 0,
    bestScore: 0,
    averageScore: 0,
    scoreImprovementPercent: 0
  }
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatSeconds(value: number): string {
  return `${value.toFixed(1)}s`;
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsSummary>(emptySummary);
  const [scope, setScope] = useState<Scope>("all_players");
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const id = getStoredSessionId();
    if (id) {
      setSessionId(id);
      setScope("my_session");
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchSummary = async () => {
      const query = scope === "my_session" && sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
      const res = await fetch(`/api/analytics/summary${query}`, { cache: "no-store" });
      if (!res.ok || !mounted) {
        return;
      }
      const payload = (await res.json()) as AnalyticsSummary;
      setData(payload);
    };

    void fetchSummary();
    const timer = window.setInterval(fetchSummary, 4000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [scope, sessionId]);

  const riskDistributionData = useMemo(
    () => [
      data.psychology.riskProfileDistribution.aggressive,
      data.psychology.riskProfileDistribution.conservative,
      data.psychology.riskProfileDistribution.strategic
    ],
    [data]
  );

  return (
    <section className="panel">
      <h1>Analytics Dashboard</h1>
      <p className="muted">My Session and All Players analytics refresh every 4 seconds.</p>

      <div className="scopeSwitch">
        <button
          className={scope === "my_session" ? "scopeBtn scopeBtnActive" : "scopeBtn"}
          onClick={() => setScope("my_session")}
          disabled={!sessionId}
        >
          My Session
        </button>
        <button
          className={scope === "all_players" ? "scopeBtn scopeBtnActive" : "scopeBtn"}
          onClick={() => setScope("all_players")}
        >
          All Players
        </button>
      </div>

      <div className="metricGrid">
        <div className="chartCard">
          <h2>Player Overview</h2>
          <p>Games played (view): <strong>{data.overview.gamesPlayed}</strong></p>
          <p>Total games played (all users): <strong>{data.overview.globalGamesPlayed}</strong></p>
          <p>Average score: <strong>{data.overview.averageScore.toFixed(1)}</strong></p>
          <p>Reached Level 3: <strong>{formatPercent(data.overview.level3CompletionRate)}</strong></p>
          <p>
            Avg time per level: <strong>
              {data.overview.averageTimePerLevel.map((x) => `L${x.level} ${formatSeconds(x.avgSeconds)}`).join(" | ")}
            </strong>
          </p>
        </div>

        <div className="chartCard">
          <h2>Gameplay Behavior</h2>
          <p>Accuracy: <strong>{formatPercent(data.gameplayBehavior.accuracyRate)}</strong></p>
          <p>Peas fired: <strong>{data.gameplayBehavior.peasFired}</strong></p>
          <p>Zombies hit: <strong>{data.gameplayBehavior.zombiesHit}</strong></p>
          <p>Zombies killed: <strong>{data.gameplayBehavior.zombiesKilled}</strong></p>
          <p>Most failed level: <strong>{data.gameplayBehavior.mostFailedLevel ?? "N/A"}</strong></p>
          <p>
            Avg attempts before completion: <strong>
              {data.gameplayBehavior.avgAttemptsBeforeComplete
                .map((x) => `L${x.level} ${x.attempts.toFixed(2)}`)
                .join(" | ")}
            </strong>
          </p>
        </div>

        <div className="chartCard">
          <h2>Laser Analytics</h2>
          <p>Win with SHIELD intact: <strong>{formatPercent(data.laserAnalytics.winRateIntact)}</strong></p>
          <p>Win with SHIELD destroyed: <strong>{formatPercent(data.laserAnalytics.winRateDestroyed)}</strong></p>
          <p>
            Destroy timing (early/mid/late): <strong>
              {data.laserAnalytics.destructionTiming.early}/{data.laserAnalytics.destructionTiming.mid}/{data.laserAnalytics.destructionTiming.late}
            </strong>
          </p>
          <p>Protection rate: <strong>{formatPercent(data.laserAnalytics.protectionRate)}</strong></p>
          <p>
            Protection moves/opportunities: <strong>
              {data.laserAnalytics.protectionMovesTowardThreat}/{data.laserAnalytics.protectionOpportunities}
            </strong>
          </p>
        </div>

        <div className="chartCard">
          <h2>Player Psychology</h2>
          <p>Panic moments: <strong>{data.psychology.panicMoments}</strong></p>
          <p>
            Average reaction time: <strong>
              {data.psychology.averageReactionTimeMs === null
                ? "N/A"
                : `${data.psychology.averageReactionTimeMs.toFixed(0)} ms`}
            </strong>
          </p>
          <p>
            Risk profile (A/C/S): <strong>
              {data.psychology.riskProfileDistribution.aggressive}/
              {data.psychology.riskProfileDistribution.conservative}/
              {data.psychology.riskProfileDistribution.strategic}
            </strong>
          </p>
        </div>

        <div className="chartCard">
          <h2>Session Patterns</h2>
          <p>Retry rate: <strong>{formatPercent(data.sessionPatterns.retryRate)}</strong></p>
          <p>Best score: <strong>{data.sessionPatterns.bestScore.toFixed(1)}</strong></p>
          <p>Average score: <strong>{data.sessionPatterns.averageScore.toFixed(1)}</strong></p>
          <p>Score improvement: <strong>{formatPercent(data.sessionPatterns.scoreImprovementPercent)}</strong></p>
        </div>
      </div>

      <div className="chartGrid">
        <div className="chartCard">
          <h2>Progression Funnel</h2>
          <Bar
            data={{
              labels: data.funnel.map((x) => `L${x.level}`),
              datasets: [
                {
                  label: "Started",
                  data: data.funnel.map((x) => x.started),
                  backgroundColor: "#74c69d"
                },
                {
                  label: "Completed",
                  data: data.funnel.map((x) => x.completed),
                  backgroundColor: "#2f9e44"
                }
              ]
            }}
          />
        </div>

        <div className="chartCard">
          <h2>Completion % and Drop-Off %</h2>
          <Bar
            data={{
              labels: data.funnel.map((x) => `L${x.level}`),
              datasets: [
                {
                  label: "Completion %",
                  data: data.funnel.map((x) => Number(x.completionRate.toFixed(2))),
                  backgroundColor: "#4dabf7"
                },
                {
                  label: "Drop-off %",
                  data: data.funnel.map((x) => Number(x.dropOffFromPrevious.toFixed(2))),
                  backgroundColor: "#ff8787"
                }
              ]
            }}
          />
        </div>

        <div className="chartCard">
          <h2>Shield Destruction by Level</h2>
          <Bar
            data={{
              labels: data.laserAnalytics.destroyedPerLevel.map((x) => `L${x.level}`),
              datasets: [
                {
                  label: "Destroyed count",
                  data: data.laserAnalytics.destroyedPerLevel.map((x) => x.destroyed),
                  backgroundColor: "#ff6b6b"
                }
              ]
            }}
          />
        </div>

        <div className="chartCard">
          <h2>Risk Profile Distribution</h2>
          <Doughnut
            data={{
              labels: ["Aggressive", "Conservative", "Strategic"],
              datasets: [
                {
                  data: riskDistributionData,
                  backgroundColor: ["#f03e3e", "#3bc9db", "#40c057"]
                }
              ]
            }}
          />
        </div>
      </div>
    </section>
  );
}
