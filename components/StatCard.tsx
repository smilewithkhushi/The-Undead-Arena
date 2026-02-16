interface StatCardProps {
  title: string;
  stats: { label: string; value: string | number }[];
}

export function StatCard({ title, stats }: StatCardProps) {
  return (
    <div className="w-full max-w-[420px] border border-gray-300 rounded-xl p-3 bg-[#fcfcfc] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(124,179,66,0.4)]">
      <h2 className="font-fredoka font-bold text-lg">{title}</h2>
      {stats.map((s, i) => (
        <p key={i} className="my-1.5">
          {s.label}: <strong>{s.value}</strong>
        </p>
      ))}
    </div>
  );
}
