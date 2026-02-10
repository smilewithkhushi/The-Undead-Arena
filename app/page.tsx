import Link from "next/link";
import { GameCanvas } from "@/components/GameCanvas";

export default function HomePage() {
  return (
    <main className="mx-auto grid w-full max-w-[1360px] gap-4 px-4 py-6 md:px-8 md:py-10">
      <GameCanvas />
      <div className="panel max-w-[980px]">
        <h2 className="text-2xl font-fredoka font-bold text-text-stroke">Project Goal</h2>
        <p className="text-center text-[17px] text-text-stroke/90">Buildathon prototype: game emits event batches every 5 seconds to <code>/api/events</code>, then analytics are visualized on the dashboard.</p>
        <Link href="/dashboard" className="btn-game">
          Open Dashboard
        </Link>
      </div>
    </main>
  );
}
