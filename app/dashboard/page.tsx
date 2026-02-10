import Link from "next/link";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export default function DashboardPage() {
  return (
    <main className="page">
      <AnalyticsDashboard />
      <div className="panel">
        <Link href="/" className="linkBtn">
          Back to Game
        </Link>
      </div>
    </main>
  );
}
