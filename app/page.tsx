import Link from "next/link";
import { GameCanvas } from "@/components/GameCanvas";

export default function HomePage() {
  return (
    <main className="page">
      <GameCanvas />
      <div className="panel">
        <h2>Project Goal</h2>
        <p>
          Buildathon prototype: game emits event batches every 5 seconds to <code>/api/events</code>, then
          analytics are visualized on the dashboard.
        </p>
        <Link href="/dashboard" className="linkBtn">
          Open Dashboard
        </Link>
      </div>
    </main>
  );
}
