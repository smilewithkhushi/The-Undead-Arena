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
import type { AnalyticsSummary } from "@/lib/types";
import { StatCard } from "./StatCard";
import { ChartCard } from "./ChartCard";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const emptySummary: AnalyticsSummary = {
  scope: "my_session",
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
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchSummary = async () => {
      const res = await fetch("/api/analytics/summary?first_player=true", { cache: "no-store" });
      if (!res.ok || !mounted) {
        return;
      }
      const payload = (await res.json()) as AnalyticsSummary;
      setData(payload);
      setSessionId(payload.sessionId ?? null);
    };

    void fetchSummary();
    const timer = window.setInterval(fetchSummary, 4000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const riskDistributionData = useMemo(
    () => [
      data.psychology.riskProfileDistribution.aggressive,
      data.psychology.riskProfileDistribution.conservative,
      data.psychology.riskProfileDistribution.strategic
    ],
    [data]
  );

  const overviewStats = [
    { label: "Games played (first player)", value: data.overview.gamesPlayed },
    { label: "Average score", value: data.overview.averageScore.toFixed(1) },
    { label: "Reached Level 3", value: formatPercent(data.overview.level3CompletionRate) },
    {
      label: "Avg time per level",
      value: data.overview.averageTimePerLevel.map((x) => `L${x.level} ${formatSeconds(x.avgSeconds)}`).join(" | ")
    }
  ];

  const gameplayStats = [
    { label: "Accuracy", value: formatPercent(data.gameplayBehavior.accuracyRate) },
    { label: "Peas fired", value: data.gameplayBehavior.peasFired },
    { label: "Zombies hit", value: data.gameplayBehavior.zombiesHit },
    { label: "Zombies killed", value: data.gameplayBehavior.zombiesKilled },
    { label: "Most failed level", value: data.gameplayBehavior.mostFailedLevel ?? "N/A" },
    {
      label: "Avg attempts before completion",
      value: data.gameplayBehavior.avgAttemptsBeforeComplete.map((x) => `L${x.level} ${x.attempts.toFixed(2)}`).join(" | ")
    }
  ];

  const laserStats = [
    { label: "Win with SHIELD intact", value: formatPercent(data.laserAnalytics.winRateIntact) },
    { label: "Win with SHIELD destroyed", value: formatPercent(data.laserAnalytics.winRateDestroyed) },
    {
      label: "Destroy timing (early/mid/late)",
      value: `${data.laserAnalytics.destructionTiming.early}/${data.laserAnalytics.destructionTiming.mid}/${data.laserAnalytics.destructionTiming.late}`
    },
    { label: "Protection rate", value: formatPercent(data.laserAnalytics.protectionRate) },
    {
      label: "Protection moves/opportunities",
      value: `${data.laserAnalytics.protectionMovesTowardThreat}/${data.laserAnalytics.protectionOpportunities}`
    }
  ];

  const psychologyStats = [
    { label: "Panic moments", value: data.psychology.panicMoments },
    {
      label: "Average reaction time",
      value: data.psychology.averageReactionTimeMs === null ? "N/A" : `${data.psychology.averageReactionTimeMs.toFixed(0)} ms`
    },
    {
      label: "Risk profile (A/C/S)",
      value: `${data.psychology.riskProfileDistribution.aggressive}/${data.psychology.riskProfileDistribution.conservative}/${data.psychology.riskProfileDistribution.strategic}`
    }
  ];

  const sessionStats = [
    { label: "Retry rate", value: formatPercent(data.sessionPatterns.retryRate) },
    { label: "Best score", value: data.sessionPatterns.bestScore.toFixed(1) },
    { label: "Average score", value: data.sessionPatterns.averageScore.toFixed(1) },
    { label: "Score improvement", value: formatPercent(data.sessionPatterns.scoreImprovementPercent) }
  ];

  return (
    <section className="panel max-w-[980px]">
      <h2 className="text-center text-3xl font-fredoka font-bold text-text-stroke">Analytics Dashboard</h2>
      <p className="my-2 mb-3 text-center font-semibold text-[#1f3b10]">Showing your session stats!</p>

      <div className="mb-4 grid w-full grid-cols-[repeat(auto-fit,minmax(240px,1fr))] justify-items-center gap-4">
        <StatCard title="Player Overview" stats={overviewStats} />
        <StatCard title="Gameplay Behavior" stats={gameplayStats} />
        <StatCard title="Laser Analytics" stats={laserStats} />
        <StatCard title="Player Psychology" stats={psychologyStats} />
        <StatCard title="Session Patterns" stats={sessionStats} />
      </div>

      <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(300px,1fr))] justify-items-center gap-6 md:gap-8">
        <ChartCard title="Progression Funnel">
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
        </ChartCard>

        <ChartCard title="Completion % and Drop-Off %">
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
        </ChartCard>

        <ChartCard title="Shield Destruction by Level">
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
        </ChartCard>

        <ChartCard title="Risk Profile Distribution">
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
        </ChartCard>
      </div>
    </section>
  );
}
