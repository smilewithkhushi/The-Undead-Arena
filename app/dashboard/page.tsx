import Link from "next/link";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export default function DashboardPage() {
  return (
    <main className="mx-auto grid w-full max-w-[1360px] gap-4 px-4 py-6 md:px-8 md:py-10">
      <div className="panel max-w-[980px]">
        <div className="grid grid-cols-[auto_1fr] items-center gap-4 md:gap-6">
          <Link
            href="/"
            className="btn-game flex h-14 w-14 items-center justify-center p-0 text-[28px] leading-none"
            aria-label="Back to Game"
          >
            <span style={{ color: "#ffd93d" }}>⬅️</span>
          </Link>

          <div className="text-center">
            <h1 className="game-title">The Undead Arena</h1>
          </div>
        </div>
      </div>
      <AnalyticsDashboard />
    </main>
  );
}
