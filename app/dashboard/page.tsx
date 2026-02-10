import Link from "next/link";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export default function DashboardPage() {
  return (
    <main className="mx-auto grid w-full max-w-[1360px] gap-4 px-4 py-6 md:px-8 md:py-10">
      <AnalyticsDashboard />
      <div className="panel max-w-[980px]">
        <Link href="/" className="btn-game">
          Back to Game
        </Link>
      </div>
    </main>
  );
}
