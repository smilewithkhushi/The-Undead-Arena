import Link from "next/link";
import { GameCanvas } from "@/components/GameCanvas";

export default function HomePage() {
  return (
    <main className="mx-auto grid w-full max-w-[1360px] gap-4 px-4 py-6 md:px-8 md:py-10">
      <GameCanvas />
      <div className="panel max-w-[980px]">
        <h2 className="text-2xl font-fredoka font-bold text-text-stroke">Track Your Performance</h2>
        <p className="text-center text-[17px] text-text-stroke/90">Check the dashboard to see your gameplay stats, level progress, and overall performance after each run.</p>
        <Link href="/dashboard" className="btn-game">
          Open Dashboard
        </Link>
      </div>
      <footer className="credit-footer">made with ❤️ by @smilewithkhushi</footer>
    </main>
  );
}
