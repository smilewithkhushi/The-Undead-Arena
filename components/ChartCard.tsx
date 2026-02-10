interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div className="border border-gray-300 rounded-xl p-3 bg-[#fcfcfc] transition-all duration-300 hover:scale-105 hover:shadow-[0_8px_24px_rgba(124,179,66,0.4)]">
      <h2 className="font-fredoka font-bold text-lg">{title}</h2>
      {children}
    </div>
  );
}
